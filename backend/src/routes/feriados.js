const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');

// Lista feriados (opcionalmente filtrando por ano)
router.get('/', async (req, res) => {
  const { year } = req.query;
  try {
    let query = supabase.from('FERIADOS').select('*')
      .eq('tenant_id', req.tenantId).order('date');
    if (year) query = query.gte('date', `${year}-01-01`).lte('date', `${year}-12-31`);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const { date, name, type = 'municipal' } = req.body;
  if (!date || !name) return res.status(400).json({ error: 'Data e nome são obrigatórios' });
  try {
    const { data, error } = await supabase.from('FERIADOS')
      .upsert({ tenant_id: req.tenantId, date, name, type }, { onConflict: 'tenant_id,date' })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('FERIADOS').delete()
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
