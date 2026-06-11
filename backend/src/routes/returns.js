const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');

// ── Listar devoluções ─────────────────────────────────────
router.get('/', async (req, res) => {
  const { page = 1, limit = 50, status, type } = req.query;
  const offset = (page - 1) * limit;
  try {
    let query = supabase
      .from('DEVOLUCOES')
      .select('*, CLIENTES(id, name), VENDAS(id, number)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    if (type)   query = query.eq('type', type);
    query = query.range(offset, offset + Number(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Detalhe ───────────────────────────────────────────────
router.get('/stats/summary', async (req, res) => {
  try {
    const { data } = await supabase
      .from('DEVOLUCOES')
      .select('status, type, credit_amount')
      .eq('tenant_id', req.tenantId);
    res.json({
      total:        data?.length || 0,
      pending:      data?.filter(d => d.status === 'pending').length || 0,
      approved:     data?.filter(d => d.status === 'approved').length || 0,
      processed:    data?.filter(d => d.status === 'processed').length || 0,
      total_credit: data?.filter(d => !['rejected','cancelled'].includes(d.status))
                        .reduce((s, d) => s + (d.credit_amount || 0), 0) || 0,
      by_type: {
        devolucao: data?.filter(d => d.type === 'devolucao').length || 0,
        troca:     data?.filter(d => d.type === 'troca').length || 0,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const { data: ret, error } = await supabase
      .from('DEVOLUCOES')
      .select('*, CLIENTES(*), VENDAS(id, number, total)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();
    if (error || !ret) return res.status(404).json({ error: 'Devolução não encontrada' });
    const { data: items } = await supabase
      .from('DEVOLUCAO_ITENS')
      .select('*, PRODUTOS(id, name, code, unit)')
      .eq('devolucao_id', req.params.id);
    res.json({ ...ret, items: items || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Criar devolução ───────────────────────────────────────
router.post('/', async (req, res) => {
  const { sale_id, customer_id, type, reason, items, notes } = req.body;
  if (!reason)                      return res.status(400).json({ error: 'Motivo é obrigatório' });
  if (!items || items.length === 0) return res.status(400).json({ error: 'Informe ao menos um item' });
  try {
    const { data: last } = await supabase
      .from('DEVOLUCOES').select('number')
      .eq('tenant_id', req.tenantId)
      .order('number', { ascending: false }).limit(1).maybeSingle();
    const number        = (last?.number || 0) + 1;
    const credit_amount = items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unit_price || 0)), 0);

    const { data: ret, error } = await supabase
      .from('DEVOLUCOES')
      .insert({
        tenant_id: req.tenantId,
        number,
        sale_id:     sale_id     || null,
        customer_id: customer_id || null,
        user_id:     req.user.id,
        type:        type        || 'devolucao',
        reason,
        status:       'pending',
        notes:        notes || null,
        credit_amount,
      })
      .select().single();
    if (error) throw error;

    const itemsToInsert = items.map(i => ({
      devolucao_id: ret.id,
      product_id:   i.product_id   || null,
      product_name: i.product_name || null,
      quantity:     i.quantity,
      unit_price:   i.unit_price   || 0,
      total:        Number(i.quantity) * Number(i.unit_price || 0),
      condition:    i.condition    || 'ok',
      notes:        i.notes        || null,
    }));
    await supabase.from('DEVOLUCAO_ITENS').insert(itemsToInsert);
    res.status(201).json(ret);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Atualizar status ──────────────────────────────────────
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const valid = ['pending','approved','rejected','processed','cancelled'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    // Ao aprovar: gera crédito financeiro para o cliente
    if (status === 'approved') {
      const { data: ret } = await supabase
        .from('DEVOLUCOES').select('*')
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
      if (ret?.credit_amount > 0 && ret?.customer_id) {
        await supabase.from('LANCAMENTOS').insert({
          tenant_id:        req.tenantId,
          user_id:          req.user.id,
          description:      `Crédito por devolução #${String(ret.number).padStart(4,'0')}`,
          type:             'payable',
          amount:           ret.credit_amount,
          paid_amount:      0,
          due_date:         new Date().toISOString().split('T')[0],
          status:           'pending',
          customer_id:      ret.customer_id,
          reference_type:   'return',
          reference_id:     ret.id,
          installment:      1,
          total_installments: 1,
        });
      }
    }
    const { data, error } = await supabase
      .from('DEVOLUCOES')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Busca vendas (para vinculação) ───────────────────────
router.get('/search/sales', async (req, res) => {
  const { q } = req.query;
  try {
    let query = supabase
      .from('VENDAS')
      .select('id, number, total, created_at, CLIENTES(name)')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(20);
    if (q) query = query.ilike('number::text', `%${q}%`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
