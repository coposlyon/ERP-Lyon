const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, is_active } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('FORNECEDORES')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');

    if (search) query = query.or(`name.ilike.%${search}%,cnpj.ilike.%${search}%`);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
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
    const { data, error } = await supabase
      .from('FORNECEDORES')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Fornecedor não encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { name, cnpj, ie, email, phone, contact_name, address } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome do fornecedor é obrigatório' });

  try {
    const base = {
      tenant_id: req.tenantId,
      name, cnpj, email, phone, contact_name,
      address: address || {},
      is_active: true,
    };
    const payload = { ...base, ie: String(ie || '').trim() || null };
    let { data, error } = await supabase.from('FORNECEDORES').insert(payload).select().single();
    if (error && /\bie\b/i.test(error.message || '')) { // coluna ie ainda não existe (migration 023)
      ({ data, error } = await supabase.from('FORNECEDORES').insert(base).select().single());
    }
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const { name, cnpj, ie, email, phone, contact_name, address, is_active } = req.body;

  try {
    const base = { name, cnpj, email, phone, contact_name, address, is_active };
    const payload = { ...base, ie: String(ie || '').trim() || null };
    let { data, error } = await supabase.from('FORNECEDORES')
      .update(payload).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error && /\bie\b/i.test(error.message || '')) { // coluna ie ainda não existe (migration 023)
      ({ data, error } = await supabase.from('FORNECEDORES')
        .update(base).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single());
    }
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('FORNECEDORES')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;
    res.json({ message: 'Fornecedor desativado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
