const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

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

module.exports = router;
