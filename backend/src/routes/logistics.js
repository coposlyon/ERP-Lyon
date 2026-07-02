const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');

// GET /api/logistics — lista transportadoras
router.get('/', async (req, res) => {
  const { page = 1, limit = 20, search, is_active } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('TRANSPORTADORAS')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');

    if (search) {
      // remove caracteres de sintaxe do filtro PostgREST (injeção via busca)
      const s = String(search).replace(/[%,()]/g, ' ').trim();
      if (s) query = query.or(`name.ilike.%${s}%,cnpj.ilike.%${s}%,trade_name.ilike.%${s}%`);
    }
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');
    query = query.range(offset, offset + Number(limit) - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/logistics/:id
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('TRANSPORTADORAS')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Transportadora não encontrada' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/logistics — nova transportadora
router.post('/', async (req, res) => {
  const {
    name, trade_name, cnpj, ie, email, phone, whatsapp,
    contact_name, pickup_schedule, address, is_active,
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Razão Social é obrigatória' });

  try {
    const { data, error } = await supabase
      .from('TRANSPORTADORAS')
      .insert({
        tenant_id: req.tenantId,
        name, trade_name, cnpj, ie, email, phone, whatsapp,
        contact_name,
        pickup_schedule: pickup_schedule || [],
        address: address || {},
        is_active: is_active !== false,
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/logistics/:id — atualiza transportadora
router.put('/:id', async (req, res) => {
  const {
    name, trade_name, cnpj, ie, email, phone, whatsapp,
    contact_name, pickup_schedule, address, is_active,
  } = req.body;

  try {
    const { data, error } = await supabase
      .from('TRANSPORTADORAS')
      .update({
        name, trade_name, cnpj, ie, email, phone, whatsapp,
        contact_name, pickup_schedule, address, is_active,
        updated_at: new Date().toISOString(),
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

// DELETE /api/logistics/:id — desativa (soft delete)
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('TRANSPORTADORAS')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;
    res.json({ message: 'Transportadora desativada' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
