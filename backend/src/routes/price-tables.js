const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('TABELAS_PRECO')
      .select('*, TABELA_PRECO_ITENS(*, PRODUTOS(id,name,unit,sale_price))')
      .eq('tenant_id', req.tenantId).order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { name, discount_percent, items = [] } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome obrigatório' });
  try {
    const { data, error } = await supabase.from('TABELAS_PRECO')
      .insert({ tenant_id: req.tenantId, name, discount_percent: discount_percent || 0, is_active: true })
      .select().single();
    if (error) throw error;
    if (items.length) {
      const rows = items.map(i => ({ price_table_id: data.id, product_id: i.product_id, price: i.price, min_qty: i.min_qty || 1 }));
      await supabase.from('TABELA_PRECO_ITENS').insert(rows);
    }
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  const { name, discount_percent, is_active, items } = req.body;
  try {
    const { data, error } = await supabase.from('TABELAS_PRECO')
      .update({ name, discount_percent, is_active })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    if (items) {
      await supabase.from('TABELA_PRECO_ITENS').delete().eq('price_table_id', req.params.id);
      if (items.length) {
        const rows = items.map(i => ({ price_table_id: req.params.id, product_id: i.product_id, price: i.price, min_qty: i.min_qty || 1 }));
        await supabase.from('TABELA_PRECO_ITENS').insert(rows);
      }
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('TABELAS_PRECO').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ message: 'Tabela removida' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
