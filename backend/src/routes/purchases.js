const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('COMPRAS')
      .select('*, FORNECEDORES(id, name, cnpj)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date + 'T23:59:59');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data: purchase, error } = await supabase
      .from('COMPRAS')
      .select('*, FORNECEDORES(*)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !purchase) return res.status(404).json({ error: 'Compra não encontrada' });

    const { data: items } = await supabase
      .from('COMPRA_ITENS')
      .select('*, PRODUTOS(id, name, code, unit)')
      .eq('purchase_id', req.params.id);

    res.json({ ...purchase, items: items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { supplier_id, items, notes, discount } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'A compra deve ter ao menos um item' });
  }

  try {
    const { data: nextNumber } = await supabase
      .rpc('proximo_numero_compra', { p_tenant_id: req.tenantId });

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalDiscount = discount || 0;
    const total = subtotal - totalDiscount;

    const { data: purchase, error: purchaseError } = await supabase
      .from('COMPRAS')
      .insert({
        tenant_id: req.tenantId,
        number: nextNumber,
        supplier_id,
        user_id: req.user.id,
        status: 'received',
        subtotal,
        discount: totalDiscount,
        total,
        notes,
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;

    const purchaseItems = items.map(item => ({
      purchase_id: purchase.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
    }));

    await supabase.from('COMPRA_ITENS').insert(purchaseItems);

    for (const item of items) {
      await supabase.rpc('atualizar_estoque', {
        p_tenant_id: req.tenantId,
        p_product_id: item.product_id,
        p_quantity: item.quantity,
        p_type: 'entry',
        p_reference_type: 'purchase',
        p_reference_id: purchase.id,
        p_user_id: req.user.id,
      });
    }

    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
