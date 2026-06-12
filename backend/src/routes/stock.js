const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

// ── Movimentações ─────────────────────────────────────────────────────────────
router.get('/movements', async (req, res) => {
  const { page = 1, limit = 50, product_id, type, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .select('*, PRODUTOS(id, name, code), USUARIOS(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (product_id)  query = query.eq('product_id', product_id);
    if (type)        query = query.eq('type', type);
    if (start_date)  query = query.gte('created_at', start_date);
    if (end_date)    query = query.lte('created_at', end_date + 'T23:59:59');
    query = query.range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Alertas de estoque mínimo ─────────────────────────────────────────────────
router.get('/alerts', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('id, name, code, current_stock, min_stock, unit')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .lte('current_stock', supabase.raw('min_stock'));

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Ajuste de estoque ─────────────────────────────────────────────────────────
router.post('/adjustment', async (req, res) => {
  const { product_id, quantity, notes } = req.body;
  if (!product_id || quantity === undefined) {
    return res.status(400).json({ error: 'Produto e quantidade são obrigatórios' });
  }

  try {
    await supabase.rpc('atualizar_estoque', {
      p_tenant_id:      req.tenantId,
      p_product_id:     product_id,
      p_quantity:       quantity,
      p_type:           'adjustment',
      p_reference_type: 'manual',
      p_reference_id:   null,
      p_user_id:        req.user.id,
      p_notes:          notes,
    });
    audit(req, 'adjustment', 'stock', product_id, { quantity, notes });
    res.json({ message: 'Ajuste de estoque aplicado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Reposição: produtos com estoque negativo ──────────────────────────────────
router.get('/replenishment', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('id, code, name, unit, current_stock, cost_price, supplier_id, FORNECEDORES(id, name, phone)')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .lt('current_stock', 0)
      .order('name');

    if (error) throw error;
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Solicitar Reposição: salva PDF + registra movimentação ────────────────────
router.post('/replenishment-request', upload.single('pdf'), async (req, res) => {
  const { supplier_id, supplier_name, products_json } = req.body;
  const file = req.file;

  let products = [];
  try { products = JSON.parse(products_json || '[]'); } catch {}
  if (!products.length) return res.status(400).json({ error: 'Nenhum produto informado' });

  let pdf_url = null;

  try {
    // 1. Upload PDF ao Storage (bucket DOCUMENTOS)
    if (file) {
      const date    = new Date().toISOString().split('T')[0];
      const safeName = (supplier_name || 'fornecedor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      const filePath = `${req.tenantId}/replenishment/${date}_${safeName}_${Date.now()}.pdf`;

      const { error: upErr } = await supabase.storage
        .from('DOCUMENTOS')
        .upload(filePath, file.buffer, { contentType: 'application/pdf', upsert: true });

      if (!upErr) {
        const { data: { publicUrl } } = supabase.storage
          .from('DOCUMENTOS')
          .getPublicUrl(filePath);
        pdf_url = publicUrl;
      } else {
        console.error('PDF upload error:', upErr.message);
      }
    }

    // 2. Registra uma movimentação por produto (type = replenishment_request)
    const requestId = uuidv4();
    const notes     = `Pedido de reposição — Fornecedor: ${supplier_name || 'N/A'}${pdf_url ? ` | PDF: ${pdf_url}` : ''}`;

    const movements = products.map(p => ({
      tenant_id:      req.tenantId,
      product_id:     p.id,
      type:           'replenishment_request',
      quantity:       Math.abs(Number(p.current_stock)),
      previous_stock: Number(p.current_stock),
      current_stock:  Number(p.current_stock), // sem alteração real de estoque
      reference_type: 'replenishment',
      reference_id:   requestId,
      user_id:        req.user.id,
      notes,
    }));

    const { error: movErr } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .insert(movements);

    if (movErr) console.error('Movement insert error:', movErr.message);

    res.json({ pdf_url, request_id: requestId, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Pedidos de Reposição (PEDIDOS_REPOSICAO) ─────────────────────────────────

// GET /stock/replenishment-orders
router.get('/replenishment-orders', async (req, res) => {
  const { status, supplier_id } = req.query;
  try {
    let query = supabase
      .from('PEDIDOS_REPOSICAO')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status)      query = query.eq('status', status);
    if (supplier_id) query = query.eq('supplier_id', supplier_id);

    const { data, error } = await query;
    if (error) throw error;
    res.json({ data: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stock/replenishment-orders — cria pedido (status=pending) + movimento histórico
// Aceita campo opcional `html_content` (string) para salvar o documento no Storage
router.post('/replenishment-orders', async (req, res) => {
  const { supplier_id, supplier_name, products, html_content, protocol_number } = req.body;

  if (!Array.isArray(products) || !products.length)
    return res.status(400).json({ error: 'Nenhum produto informado' });

  try {
    // Impede duplicata: já existe pedido pending para este fornecedor?
    if (supplier_id) {
      const { data: existing } = await supabase
        .from('PEDIDOS_REPOSICAO')
        .select('id')
        .eq('tenant_id', req.tenantId)
        .eq('supplier_id', supplier_id)
        .eq('status', 'pending')
        .maybeSingle();

      if (existing)
        return res.status(409).json({
          error: 'Já existe um pedido pendente para este fornecedor',
          existing_id: existing.id,
        });
    }

    // Upload do HTML como documento no Storage (quando enviado pelo "Gerar PDF")
    let pdf_url = null;
    if (html_content) {
      try {
        const buffer   = Buffer.from(html_content, 'utf-8');
        const date     = new Date().toISOString().split('T')[0];
        const safeName = (supplier_name || 'fornecedor').replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
        const filePath = `${req.tenantId}/replenishment/${date}_${safeName}_${Date.now()}.html`;

        const { error: upErr } = await supabase.storage
          .from('DOCUMENTOS')
          .upload(filePath, buffer, { contentType: 'text/html', upsert: true });

        if (!upErr) {
          const { data: { publicUrl } } = supabase.storage
            .from('DOCUMENTOS')
            .getPublicUrl(filePath);
          pdf_url = publicUrl;
        } else {
          console.error('HTML upload error:', upErr.message);
        }
      } catch (e) {
        console.error('Erro no upload do HTML:', e.message);
      }
    }

    // Gera protocolo de 5 dígitos se não fornecido pelo frontend
    const proto = protocol_number
      || String(Math.floor(Math.random() * 100000)).padStart(5, '0');

    // Cria o pedido
    const { data: order, error: orderErr } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .insert({
        tenant_id:       req.tenantId,
        supplier_id:     supplier_id || null,
        supplier_name:   supplier_name || 'Sem Fornecedor',
        products:        products,
        status:          'pending',
        pdf_url:         pdf_url,
        protocol_number: proto,
        created_by:      req.user.id,
      })
      .select()
      .single();

    if (orderErr) throw orderErr;

    // Registra movimentos históricos (sem alterar estoque real)
    const notesBase = `Solicitação de reposição — Fornecedor: ${supplier_name || 'N/A'} | CONTROLE: ${proto}`;
    const movements = products.map(p => ({
      tenant_id:      req.tenantId,
      product_id:     p.id,
      type:           'adjustment',              // usa tipo aceito pela constraint
      quantity:       0,                         // sem alteração real de estoque
      previous_stock: Number(p.current_stock_at_request || 0),
      current_stock:  Number(p.current_stock_at_request || 0),
      reference_type: 'replenishment_request',   // identifica como solicitação de reposição
      reference_id:   order.id,
      user_id:        req.user.id,
      notes:          notesBase,
    }));

    const { error: movErr } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .insert(movements);

    if (movErr) {
      // Não falha o pedido — só loga o erro de movimentação
      console.error('[replenishment-orders] Erro ao inserir movimentos:', movErr.message, movErr.details);
    }

    res.status(201).json(order);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stock/replenishment-orders/:id/log-resend — loga reenvio de WA sem criar novo pedido
router.post('/replenishment-orders/:id/log-resend', async (req, res) => {
  const { id } = req.params;
  try {
    const { data: order } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

    const notes = `Reenvio de solicitação — Fornecedor: ${order.supplier_name} | CONTROLE: ${order.protocol_number}`;
    const movements = (order.products || []).map(p => ({
      tenant_id:      req.tenantId,
      product_id:     p.id,
      type:           'adjustment',
      quantity:       0,
      previous_stock: Number(p.current_stock_at_request || 0),
      current_stock:  Number(p.current_stock_at_request || 0),
      reference_type: 'replenishment_request',
      reference_id:   order.id,
      user_id:        req.user.id,
      notes,
    }));

    const { error: movErr } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .insert(movements);

    if (movErr) console.error('[log-resend] movErr:', movErr.message);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /stock/replenishment-orders/:id/complete — confirma recebimento e atualiza estoque
router.post('/replenishment-orders/:id/complete', async (req, res) => {
  const { id } = req.params;

  try {
    const { data: order, error: orderErr } = await supabase
      .from('PEDIDOS_REPOSICAO')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (orderErr || !order) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (order.status !== 'pending')
      return res.status(400).json({ error: 'Pedido não está em status pendente' });

    const products = order.products || [];
    const results  = [];

    // Adiciona estoque para cada produto via RPC
    for (const p of products) {
      const qty = Math.abs(Number(p.qty_to_replenish ?? p.current_stock_at_request ?? 0));
      if (!qty) continue;
      try {
        await supabase.rpc('atualizar_estoque', {
          p_tenant_id:      req.tenantId,
          p_product_id:     p.id,
          p_quantity:       qty,
          p_type:           'entry',
          p_reference_type: 'replenishment_received',
          p_reference_id:   id,
          p_user_id:        req.user.id,
          p_notes:          `Reposição recebida — ${order.supplier_name}`,
        });
        results.push({ id: p.id, qty, success: true });
      } catch (e) {
        console.error(`Estoque produto ${p.id}:`, e.message);
        results.push({ id: p.id, qty, success: false, error: e.message });
      }
    }

    // Marca pedido como concluído
    await supabase
      .from('PEDIDOS_REPOSICAO')
      .update({
        status:       'completed',
        completed_at: new Date().toISOString(),
        completed_by: req.user.id,
      })
      .eq('id', id)
      .eq('tenant_id', req.tenantId);

    res.json({ success: true, products_updated: results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Resumo de movimentações (últimos 30 dias) ─────────────────────────────────
router.get('/movements-summary', async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const { data, error } = await supabase
      .from('MOVIMENTACOES_ESTOQUE')
      .select('quantity, notes, type')
      .eq('tenant_id', req.tenantId)
      .gte('created_at', since.toISOString());

    if (error) throw error;

    const entries = data.filter(m => m.type === 'entry').length;
    const exits   = data.filter(m => m.type === 'exit').length;
    const losses  = data.filter(m => (m.notes || '').toUpperCase().includes('PERDA')).length;

    res.json({ entries, exits, losses, period_days: 30 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
