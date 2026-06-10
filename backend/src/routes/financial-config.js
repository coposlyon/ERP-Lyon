const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// ─── PLANO DE CONTAS ──────────────────────────────────────────────
router.get('/chart-accounts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('PLANO_CONTAS')
      .select('*').eq('tenant_id', req.tenantId).eq('is_active', true).order('code');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/chart-accounts', async (req, res) => {
  const { code, name, type, parent_id } = req.body;
  if (!code || !name || !type) return res.status(400).json({ error: 'Código, nome e tipo são obrigatórios' });
  try {
    const { data, error } = await supabase.from('PLANO_CONTAS')
      .insert({ tenant_id: req.tenantId, code, name, type, parent_id: parent_id || null })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/chart-accounts/:id', async (req, res) => {
  const { code, name, type, parent_id, is_active } = req.body;
  try {
    const { data, error } = await supabase.from('PLANO_CONTAS')
      .update({ code, name, type, parent_id, is_active })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CENTROS DE CUSTO ─────────────────────────────────────────────
router.get('/cost-centers', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CENTROS_CUSTO')
      .select('*').eq('tenant_id', req.tenantId).order('code');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/cost-centers', async (req, res) => {
  const { code, name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const { data, error } = await supabase.from('CENTROS_CUSTO')
      .insert({ tenant_id: req.tenantId, code, name }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/cost-centers/:id', async (req, res) => {
  const { code, name, is_active } = req.body;
  try {
    const { data, error } = await supabase.from('CENTROS_CUSTO')
      .update({ code, name, is_active })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CONTAS BANCÁRIAS ─────────────────────────────────────────────
router.get('/bank-accounts', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CONTAS_BANCARIAS')
      .select('*').eq('tenant_id', req.tenantId).eq('is_active', true).order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/bank-accounts', async (req, res) => {
  const { name, bank_name, bank_code, agency, account, type, balance } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const { data, error } = await supabase.from('CONTAS_BANCARIAS')
      .insert({ tenant_id: req.tenantId, name, bank_name, bank_code, agency, account, type: type || 'checking', balance: balance || 0 })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/bank-accounts/:id', async (req, res) => {
  const { name, bank_name, bank_code, agency, account, type, balance, is_active } = req.body;
  try {
    const { data, error } = await supabase.from('CONTAS_BANCARIAS')
      .update({ name, bank_name, bank_code, agency, account, type, balance, is_active })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── LANÇAMENTOS com parcelas ─────────────────────────────────────
router.post('/lancamento-parcelado', async (req, res) => {
  const { description, type, amount, installments = 1, first_due_date, customer_id, supplier_id, chart_account_id, cost_center_id, account_id, document_number } = req.body;
  if (!description || !amount || !first_due_date) return res.status(400).json({ error: 'Descrição, valor e data são obrigatórios' });
  try {
    const rows = [];
    const installAmt = parseFloat((amount / installments).toFixed(2));
    for (let i = 0; i < installments; i++) {
      const dueDate = new Date(first_due_date);
      dueDate.setMonth(dueDate.getMonth() + i);
      rows.push({
        tenant_id: req.tenantId, user_id: req.userId,
        description: installments > 1 ? `${description} (${i + 1}/${installments})` : description,
        type, amount: i === installments - 1 ? amount - installAmt * (installments - 1) : installAmt,
        paid_amount: 0, due_date: dueDate.toISOString().split('T')[0],
        status: 'pending', customer_id: customer_id || null, supplier_id: supplier_id || null,
        chart_account_id: chart_account_id || null, cost_center_id: cost_center_id || null,
        account_id: account_id || null, document_number: document_number || null,
        installment: i + 1, total_installments: installments,
      });
    }
    const { data, error } = await supabase.from('LANCAMENTOS').insert(rows).select();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── EXTRATO / DRE ────────────────────────────────────────────────
router.get('/dre', async (req, res) => {
  const { start_date, end_date } = req.query;
  const start = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
  const end = end_date || new Date().toISOString().split('T')[0];
  try {
    const { data, error } = await supabase.from('LANCAMENTOS')
      .select('type, amount, paid_amount, status, PLANO_CONTAS(code, name, type)')
      .eq('tenant_id', req.tenantId)
      .gte('due_date', start).lte('due_date', end)
      .neq('status', 'cancelled');
    if (error) throw error;

    const receitas = data.filter(l => l.type === 'receivable').reduce((s, l) => s + (l.paid_amount || 0), 0);
    const despesas = data.filter(l => l.type === 'payable').reduce((s, l) => s + (l.paid_amount || 0), 0);
    const previstas_receitas = data.filter(l => l.type === 'receivable').reduce((s, l) => s + (l.amount || 0), 0);
    const previstas_despesas = data.filter(l => l.type === 'payable').reduce((s, l) => s + (l.amount || 0), 0);

    res.json({
      period: { start, end },
      realizado: { receitas, despesas, resultado: receitas - despesas },
      previsto: { receitas: previstas_receitas, despesas: previstas_despesas, resultado: previstas_receitas - previstas_despesas },
      lancamentos: data,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
