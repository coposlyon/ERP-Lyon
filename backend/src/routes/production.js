const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// Etapas e suas colunas de início/fim
const STAGE_FIELDS = {
  revelacao: { start: 'revelacao_inicio', end: 'revelacao_fim', label: 'Revelação' },
  producao:  { start: 'producao_inicio',  end: 'producao_fim',  label: 'Produção' },
  embalagem: { start: 'embalagem_inicio', end: 'embalagem_fim', label: 'Embalagem' },
};

// ── Board de produção ─────────────────────────────────────
router.get('/', async (req, res) => {
  const { start_date, end_date, search, stage } = req.query;
  try {
    // Busca por número do pedido OU nome do cliente
    let customerIds = null;
    if (search && !/^\d+$/.test(String(search).trim())) {
      const { data: cs } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', req.tenantId).ilike('name', `%${String(search).trim()}%`).limit(200);
      customerIds = (cs || []).map(c => c.id);
      if (!customerIds.length) return res.json({ data: [] });
    }

    let q = supabase
      .from('VENDAS')
      .select('*, CLIENTES(name, cpf_cnpj, phone, address), USUARIOS(name)')
      .eq('tenant_id', req.tenantId)
      .in('status', ['confirmed', 'in_production', 'ready'])
      .order('ship_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (stage) q = q.eq('production_stage', stage);
    if (customerIds) q = q.in('customer_id', customerIds);
    if (search && /^\d+$/.test(String(search).trim())) q = q.eq('number', parseInt(search));
    if (start_date) q = q.gte('ship_date', start_date);
    if (end_date)   q = q.lte('ship_date', end_date);

    const { data, error } = await q.limit(500);
    if (error) throw error;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const rows = (data || []).map(s => {
      const addr = s.CLIENTES?.address || {};
      const ship = s.ship_date ? new Date(s.ship_date) : null;
      const diffDays = ship ? Math.round((ship - today) / 86400000) : null;
      return {
        id: s.id, number: s.number, created_at: s.created_at,
        customer: s.CLIENTES?.name || 'Consumidor Final',
        seller: s.USUARIOS?.name || null,
        city: addr.city || null, uf: addr.state || null,
        event_date: s.event_date, ship_date: s.ship_date, ship_time: s.ship_time,
        carrier: s.carrier, diff_days: diffDays,
        stage: s.production_stage || 'aguardando_producao',
        art_file: s.art_file, total: s.total, status: s.status,
      };
    });
    res.json({ data: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Detalhe (itens + arte) ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data: sale, error } = await supabase
      .from('VENDAS').select('*, CLIENTES(name, cpf_cnpj, phone, address), USUARIOS(name)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const { data: items } = await supabase
      .from('VENDA_ITENS').select('*, PRODUTOS(name, code, unit)')
      .eq('sale_id', req.params.id);

    res.json({
      ...sale,
      items: (items || []).map(it => ({
        product_code: it.PRODUTOS?.code, product_name: it.product_name || it.PRODUTOS?.name,
        quantity: it.quantity, unit: it.PRODUTOS?.unit,
        color: it.customization?.cor || null,
        impressao: it.customization?.impressao || null,
        art: it.customization?.preview || null,
        art_file: it.customization?.art_file || null,
        obs: it.customization?.notes || null,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Editar dados de produção (datas, transportadora, arte, obs) ──
router.patch('/:id', async (req, res) => {
  const allowed = ['event_date', 'ship_date', 'ship_time', 'carrier', 'art_file', 'production_obs', 'production_stage'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k] || null;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
  try {
    const { data, error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Iniciar / Finalizar etapa (registra quem e quando) ────
router.post('/:id/stage', async (req, res) => {
  const { stage, action } = req.body;
  const def = STAGE_FIELDS[stage];
  if (!def || !['start', 'finish'].includes(action)) return res.status(400).json({ error: 'Etapa ou ação inválida' });
  try {
    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      .select('production_log, production_stage').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const now = new Date().toISOString();
    const actor = req.user?.name || req.user?.email || 'Usuário';
    const log = Array.isArray(sale.production_log) ? sale.production_log : [];
    log.push({ stage, action, at: now, user_id: req.user?.id || null, user: actor });

    const patch = { production_log: log };
    patch[action === 'start' ? def.start : def.end] = now;
    // estado atual
    if (action === 'start') patch.production_stage = stage;
    if (action === 'finish' && stage === 'embalagem') patch.production_stage = 'finalizado';
    // status da venda
    if (stage === 'embalagem' && action === 'finish') patch.status = 'ready';
    else patch.status = 'in_production';

    const { error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'update', 'production', req.params.id, { stage, action });
    res.json({ ok: true, stage: patch.production_stage || sale.production_stage });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
