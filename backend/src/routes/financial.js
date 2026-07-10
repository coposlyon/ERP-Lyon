const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { createPix } = require('../lib/pix');
const { pixCopyPaste } = require('../lib/pixStatic');
const QRCode = require('qrcode');

// Config de recebimento PIX: chave estática (ex.: Nubank) em EMPRESAS.settings.pix,
// com fallback nas env PIX_*. Se houver chave, usa PIX estático (dinheiro direto
// na conta, sem retenção); senão cai no Mercado Pago (createPix).
async function pixConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.pix) || {};
  } catch { s = {}; }
  return {
    key:  String(s.key || process.env.PIX_KEY || '').trim(),
    name: s.name || process.env.PIX_MERCHANT_NAME || '',
    city: s.city || process.env.PIX_MERCHANT_CITY || '',
  };
}

router.get('/receivables', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('LANCAMENTOS')
      .select('*, CLIENTES(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('type', 'receivable')
      .order('due_date');

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('due_date', start_date);
    if (end_date) query = query.lte('due_date', end_date);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payables', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('LANCAMENTOS')
      .select('*, FORNECEDORES(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('type', 'payable')
      .order('due_date');

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('due_date', start_date);
    if (end_date) query = query.lte('due_date', end_date);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/:id', async (req, res) => {
  const { paid_amount, payment_method, account_id } = req.body;

  try {
    const { data: transaction } = await supabase
      .from('LANCAMENTOS')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (!transaction) return res.status(404).json({ error: 'Lançamento não encontrado' });

    const newPaid = (transaction.paid_amount || 0) + paid_amount;
    const status = newPaid >= transaction.amount ? 'paid' : 'partial';

    const { data, error } = await supabase
      .from('LANCAMENTOS')
      .update({
        paid_amount: newPaid,
        paid_date: new Date().toISOString().split('T')[0],
        status,
        payment_method,
        account_id,
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) throw error;
    audit(req, 'payment', 'financial', req.params.id, {
      description: transaction.description, paid_amount, status, payment_method,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Criar lançamento avulso
router.post('/', async (req, res) => {
  const { description, type, amount, due_date, customer_id, supplier_id, chart_account_id, cost_center_id, document_number } = req.body;
  if (!description || !amount || !due_date) return res.status(400).json({ error: 'Descrição, valor e vencimento são obrigatórios' });
  try {
    const { data, error } = await supabase.from('LANCAMENTOS').insert({
      tenant_id: req.tenantId, user_id: req.userId, description, type, amount,
      paid_amount: 0, due_date, status: 'pending',
      customer_id: customer_id || null, supplier_id: supplier_id || null,
      chart_account_id: chart_account_id || null, cost_center_id: cost_center_id || null,
      document_number: document_number || null, installment: 1, total_installments: 1,
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'financial', data.id, { description, type, amount, due_date });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cashflow', async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    const { data, error } = await supabase
      .from('LANCAMENTOS')
      .select('type, amount, paid_amount, due_date, status')
      .eq('tenant_id', req.tenantId)
      .gte('due_date', start_date || new Date().toISOString().split('T')[0])
      .lte('due_date', end_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0])
      .order('due_date');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fluxo de caixa PROJETADO: saldo inicial (bancos) + entradas/saídas
// previstas (lançamentos em aberto) agrupados por mês, com saldo acumulado.
router.get('/cashflow-projection', async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 24);
  try {
    // Saldo inicial = soma dos saldos das contas bancárias
    const { data: banks } = await supabase
      .from('CONTAS_BANCARIAS').select('balance')
      .eq('tenant_id', req.tenantId).eq('is_active', true);
    const saldoInicial = (banks || []).reduce((s, b) => s + (Number(b.balance) || 0), 0);

    // Lançamentos em aberto (pendentes/parciais/vencidos)
    const today = new Date();
    const horizon = new Date(today.getFullYear(), today.getMonth() + months + 1, 0);
    const { data: lancs, error } = await supabase
      .from('LANCAMENTOS')
      .select('type, amount, paid_amount, due_date, status')
      .eq('tenant_id', req.tenantId)
      .in('status', ['pending', 'partial', 'overdue'])
      .lte('due_date', horizon.toISOString().split('T')[0]);
    if (error) throw error;

    const todayStr = today.toISOString().split('T')[0];
    const monthKey = d => d.slice(0, 7); // 'YYYY-MM'

    // Estrutura de meses
    const periods = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      periods[monthKey(d.toISOString())] = { entradas: 0, saidas: 0 };
    }

    const vencidos = { entradas: 0, saidas: 0 };

    for (const l of (lancs || [])) {
      const restante = Math.max(0, (Number(l.amount) || 0) - (Number(l.paid_amount) || 0));
      if (restante <= 0) continue;
      const isEntrada = l.type === 'receivable';
      const bucket = l.due_date < todayStr ? vencidos : periods[monthKey(l.due_date)];
      if (!bucket) continue; // fora do horizonte
      if (isEntrada) bucket.entradas += restante;
      else           bucket.saidas += restante;
    }

    // Monta a série com saldo acumulado
    let saldo = saldoInicial;
    const rows = [];

    // Vencidos entram como ajuste inicial (já deveriam ter sido pagos/recebidos)
    saldo += vencidos.entradas - vencidos.saidas;

    const meses = Object.keys(periods).sort();
    for (const m of meses) {
      const p = periods[m];
      const liquido = p.entradas - p.saidas;
      saldo += liquido;
      rows.push({ month: m, entradas: p.entradas, saidas: p.saidas, liquido, saldo });
    }

    res.json({
      saldo_inicial: saldoInicial,
      vencidos,
      periods: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gerar cobrança PIX para uma conta a receber ───────────
router.post('/:id/pix', async (req, res) => {
  try {
    const { data: lanc } = await supabase
      .from('LANCAMENTOS').select('*, CLIENTES(name, email)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!lanc) return res.status(404).json({ error: 'Lançamento não encontrado' });
    if (lanc.type !== 'receivable') return res.status(400).json({ error: 'PIX disponível apenas para contas a receber' });
    const remaining = Number(lanc.amount) - Number(lanc.paid_amount || 0);
    if (remaining <= 0) return res.status(400).json({ error: 'Lançamento já está quitado' });

    // 1) PIX estático (chave própria — ex.: Nubank), se configurado
    const cfg = await pixConfig(req.tenantId);
    if (cfg.key) {
      const copy = pixCopyPaste({ key: cfg.key, name: cfg.name, city: cfg.city, amount: remaining, txid: lanc.id });
      let qrb64 = null;
      try { qrb64 = (await QRCode.toDataURL(copy, { margin: 1, width: 320 })).split(',')[1] || null; } catch { /* segue sem imagem */ }
      await supabase.from('LANCAMENTOS').update({
        gateway_payment_id: null, pix_qr: qrb64, pix_copy_paste: copy,
      }).eq('id', lanc.id);
      audit(req, 'pix', 'financial', lanc.id, { amount: remaining, provider: 'static' });
      return res.json({ qr_code_base64: qrb64, copy_paste: copy });
    }

    // 2) Fallback: Mercado Pago (createPix)
    const pix = await createPix({
      amount: remaining,
      description: lanc.description || 'Cobrança',
      payerEmail: lanc.CLIENTES?.email,
      payerName: lanc.CLIENTES?.name,
      externalRef: lanc.id,
    });
    if (!pix.ok) return res.status(400).json({ error: pix.error });

    await supabase.from('LANCAMENTOS').update({
      gateway_payment_id: pix.id, pix_qr: pix.qr_code_base64 || null, pix_copy_paste: pix.qr_code || null,
    }).eq('id', lanc.id);

    audit(req, 'pix', 'financial', lanc.id, { amount: remaining });
    res.json({ qr_code_base64: pix.qr_code_base64, copy_paste: pix.qr_code, ticket_url: pix.ticket_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
