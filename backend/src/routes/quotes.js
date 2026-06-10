const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// Listar orçamentos
router.get('/', async (req, res) => {
  const { page = 1, limit = 20, status, search, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;
  try {
    let q = supabase.from('ORCAMENTOS')
      .select('*, CLIENTES(id,name,cpf_cnpj)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (start_date) q = q.gte('created_at', start_date);
    if (end_date) q = q.lte('created_at', end_date + 'T23:59:59');
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Buscar orçamento por ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ORCAMENTOS')
      .select('*, CLIENTES(id,name,cpf_cnpj,phone,email), ORCAMENTO_ITENS(*, PRODUTOS(id,name,unit,sale_price))')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !data) return res.status(404).json({ error: 'Orçamento não encontrado' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar orçamento
router.post('/', async (req, res) => {
  const { customer_id, items = [], notes, valid_until, artwork_notes, payment_method, delivery_days, discount = 0 } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Adicione pelo menos um item' });
  try {
    const { data: numData } = await supabase.rpc('proximo_numero_orcamento', { p_tenant_id: req.tenantId });
    const number = numData || 1;
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const total = subtotal - (discount || 0);
    const { data: quote, error } = await supabase.from('ORCAMENTOS').insert({
      tenant_id: req.tenantId, user_id: req.userId, number,
      customer_id: customer_id || null, subtotal, discount, total,
      notes, valid_until, artwork_notes, payment_method,
      delivery_days: delivery_days || 10, status: 'open',
    }).select().single();
    if (error) throw error;

    const quoteItems = items.map(i => ({
      quote_id: quote.id,
      product_id: i.product_id || null,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount: i.discount || 0,
      total: (i.quantity * i.unit_price) - (i.discount || 0),
      customization: i.customization || {},
    }));
    const { error: itemsError } = await supabase.from('ORCAMENTO_ITENS').insert(quoteItems);
    if (itemsError) throw itemsError;

    res.status(201).json(quote);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar orçamento
router.put('/:id', async (req, res) => {
  const { customer_id, items, notes, valid_until, artwork_notes, payment_method, delivery_days, discount = 0, status } = req.body;
  try {
    let updateData = { notes, valid_until, artwork_notes, payment_method, delivery_days, status, discount, updated_at: new Date().toISOString() };
    if (customer_id !== undefined) updateData.customer_id = customer_id;

    if (items) {
      const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
      updateData.subtotal = subtotal;
      updateData.total = subtotal - (discount || 0);
      await supabase.from('ORCAMENTO_ITENS').delete().eq('quote_id', req.params.id);
      const quoteItems = items.map(i => ({
        quote_id: req.params.id, product_id: i.product_id || null,
        product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price,
        discount: i.discount || 0, total: (i.quantity * i.unit_price) - (i.discount || 0),
        customization: i.customization || {},
      }));
      await supabase.from('ORCAMENTO_ITENS').insert(quoteItems);
    }

    const { data, error } = await supabase.from('ORCAMENTOS')
      .update(updateData).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Converter orçamento em venda
router.post('/:id/convert', async (req, res) => {
  try {
    const { data: quote, error: qErr } = await supabase.from('ORCAMENTOS')
      .select('*, ORCAMENTO_ITENS(*)').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (qErr || !quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (quote.status === 'converted') return res.status(400).json({ error: 'Orçamento já foi convertido' });

    const { data: numData } = await supabase.rpc('proximo_numero_venda', { p_tenant_id: req.tenantId });
    const { data: sale, error: sErr } = await supabase.from('VENDAS').insert({
      tenant_id: req.tenantId, user_id: req.userId, number: numData || 1,
      customer_id: quote.customer_id, subtotal: quote.subtotal,
      discount: quote.discount, total: quote.total,
      notes: quote.notes, payment_method: quote.payment_method,
      status: 'confirmed',
    }).select().single();
    if (sErr) throw sErr;

    const saleItems = (quote.ORCAMENTO_ITENS || []).map(i => ({
      sale_id: sale.id, product_id: i.product_id, product_name: i.product_name,
      quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
      customization: i.customization,
    }));
    if (saleItems.length) await supabase.from('VENDA_ITENS').insert(saleItems);
    await supabase.from('ORCAMENTOS').update({ status: 'converted', converted_sale_id: sale.id })
      .eq('id', req.params.id);

    res.json({ sale, message: 'Orçamento convertido em venda com sucesso!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alterar status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['open','sent','approved','rejected','expired','converted'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const { data, error } = await supabase.from('ORCAMENTOS')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
