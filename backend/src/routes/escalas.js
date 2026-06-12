const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');

// Lista escalas do tenant
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('ESCALAS')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const {
    name, daily_minutes = 480, weekdays = [1,2,3,4,5],
    entry_time, exit_time, break_minutes = 60, tolerance_minutes = 10, is_active = true,
  } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome da escala é obrigatório' });
  try {
    const { data, error } = await supabase
      .from('ESCALAS')
      .insert({
        tenant_id: req.tenantId,
        name,
        daily_minutes: Number(daily_minutes),
        weekdays,
        entry_time: entry_time || null,
        exit_time:  exit_time  || null,
        break_minutes: Number(break_minutes),
        tolerance_minutes: Number(tolerance_minutes),
        is_active,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  const {
    name, daily_minutes, weekdays, entry_time, exit_time,
    break_minutes, tolerance_minutes, is_active,
  } = req.body;
  try {
    const { data, error } = await supabase
      .from('ESCALAS')
      .update({
        name,
        daily_minutes: daily_minutes != null ? Number(daily_minutes) : undefined,
        weekdays,
        entry_time: entry_time || null,
        exit_time:  exit_time  || null,
        break_minutes: break_minutes != null ? Number(break_minutes) : undefined,
        tolerance_minutes: tolerance_minutes != null ? Number(tolerance_minutes) : undefined,
        is_active,
      })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    await supabase.from('ESCALAS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
