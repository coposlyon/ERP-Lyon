const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');

// Lista situações do tenant
router.get('/', async (req, res) => {
  const { insertable } = req.query;
  try {
    let query = supabase
      .from('SITUACOES')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .order('name');
    if (insertable === 'true') query = query.eq('insertable', true);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { code, name, kind = 'neutral', color = 'gray', insertable = true } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Código e nome são obrigatórios' });
  try {
    const { data, error } = await supabase
      .from('SITUACOES')
      .insert({ tenant_id: req.tenantId, code, name, kind, color, insertable, is_system: false })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  const { name, kind, color, insertable, is_active } = req.body;
  try {
    const { data, error } = await supabase
      .from('SITUACOES')
      .update({ name, kind, color, insertable, is_active })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('SITUACOES').delete()
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('is_system', false);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
