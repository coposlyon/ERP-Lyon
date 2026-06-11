const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');

// ── Stats gerais ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [{ data: opps }, { data: fups }] = await Promise.all([
      supabase.from('CRM_OPORTUNIDADES').select('stage,value').eq('tenant_id', req.tenantId),
      supabase.from('CRM_FOLLOWUPS').select('completed,due_date').eq('tenant_id', req.tenantId),
    ]);
    const active = opps?.filter(o => !['won','lost'].includes(o.stage)) || [];
    res.json({
      opportunities: {
        total:          opps?.length || 0,
        pipeline_value: active.reduce((s,o) => s + (o.value||0), 0),
        won_value:      opps?.filter(o=>o.stage==='won').reduce((s,o)=>s+(o.value||0),0)||0,
        by_stage: {
          prospecting:  opps?.filter(o=>o.stage==='prospecting').length||0,
          qualification:opps?.filter(o=>o.stage==='qualification').length||0,
          proposal:     opps?.filter(o=>o.stage==='proposal').length||0,
          negotiation:  opps?.filter(o=>o.stage==='negotiation').length||0,
          won:          opps?.filter(o=>o.stage==='won').length||0,
          lost:         opps?.filter(o=>o.stage==='lost').length||0,
        },
      },
      followups: {
        total:     fups?.length||0,
        pending:   fups?.filter(f=>!f.completed).length||0,
        overdue:   fups?.filter(f=>!f.completed && f.due_date < today).length||0,
        completed: fups?.filter(f=>f.completed).length||0,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── OPORTUNIDADES ─────────────────────────────────────────
router.get('/opportunities', async (req, res) => {
  const { stage, search } = req.query;
  try {
    let query = supabase
      .from('CRM_OPORTUNIDADES')
      .select('*, CLIENTES(id,name,phone,email), USUARIOS(id,name)')
      .eq('tenant_id', req.tenantId)
      .order('updated_at', { ascending: false });
    if (stage)  query = query.eq('stage', stage);
    if (search) query = query.ilike('title', `%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    const pipeline = { prospecting:[], qualification:[], proposal:[], negotiation:[], won:[], lost:[] };
    (data||[]).forEach(op => { if (pipeline[op.stage]) pipeline[op.stage].push(op); });
    res.json({ data: data||[], pipeline });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/opportunities', async (req, res) => {
  const { customer_id, title, value, stage, probability, expected_close_date, notes } = req.body;
  if (!title) return res.status(400).json({ error: 'Título é obrigatório' });
  try {
    const { data, error } = await supabase
      .from('CRM_OPORTUNIDADES')
      .insert({
        tenant_id:           req.tenantId,
        customer_id:         customer_id         || null,
        user_id:             req.user.id,
        title,
        value:               value               || 0,
        stage:               stage               || 'prospecting',
        probability:         probability         || 20,
        expected_close_date: expected_close_date || null,
        notes:               notes               || null,
      })
      .select('*, CLIENTES(id,name)').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/opportunities/:id', async (req, res) => {
  const allowed = ['title','value','stage','probability','expected_close_date','lost_reason','notes','customer_id'];
  const updates = { updated_at: new Date().toISOString() };
  allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
  try {
    const { data, error } = await supabase
      .from('CRM_OPORTUNIDADES')
      .update(updates)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('*, CLIENTES(id,name)').single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/opportunities/:id', async (req, res) => {
  try {
    await supabase.from('CRM_OPORTUNIDADES')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── INTERAÇÕES ─────────────────────────────────────────────
router.get('/interactions', async (req, res) => {
  const { customer_id, opportunity_id, limit = 100 } = req.query;
  try {
    let query = supabase
      .from('CRM_INTERACOES')
      .select('*, CLIENTES(id,name), USUARIOS(id,name)')
      .eq('tenant_id', req.tenantId)
      .order('interaction_date', { ascending: false })
      .limit(Number(limit));
    if (customer_id)    query = query.eq('customer_id', customer_id);
    if (opportunity_id) query = query.eq('opportunity_id', opportunity_id);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data||[]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/interactions', async (req, res) => {
  const { customer_id, opportunity_id, type, description, interaction_date, next_action, next_action_date } = req.body;
  if (!description) return res.status(400).json({ error: 'Descrição é obrigatória' });
  try {
    const { data, error } = await supabase
      .from('CRM_INTERACOES')
      .insert({
        tenant_id:        req.tenantId,
        customer_id:      customer_id      || null,
        opportunity_id:   opportunity_id   || null,
        user_id:          req.user.id,
        type:             type             || 'note',
        description,
        interaction_date: interaction_date || new Date().toISOString(),
        next_action:      next_action      || null,
        next_action_date: next_action_date || null,
      })
      .select('*, USUARIOS(name)').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FOLLOW-UPS ────────────────────────────────────────────
router.get('/followups', async (req, res) => {
  const { completed, overdue } = req.query;
  try {
    let query = supabase
      .from('CRM_FOLLOWUPS')
      .select('*, CLIENTES(id,name), CRM_OPORTUNIDADES(id,title,stage), USUARIOS(id,name)')
      .eq('tenant_id', req.tenantId)
      .order('due_date');
    if (completed !== undefined) query = query.eq('completed', completed === 'true');
    if (overdue   === 'true') {
      const today = new Date().toISOString().split('T')[0];
      query = query.lt('due_date', today).eq('completed', false);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data||[]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/followups', async (req, res) => {
  const { customer_id, opportunity_id, description, due_date, priority } = req.body;
  if (!description || !due_date) return res.status(400).json({ error: 'Descrição e data são obrigatórios' });
  try {
    const { data, error } = await supabase
      .from('CRM_FOLLOWUPS')
      .insert({
        tenant_id:      req.tenantId,
        customer_id:    customer_id    || null,
        opportunity_id: opportunity_id || null,
        user_id:        req.user.id,
        description,
        due_date,
        priority:       priority || 'normal',
        completed:      false,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/followups/:id/complete', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('CRM_FOLLOWUPS')
      .update({ completed: true, completed_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/followups/:id', async (req, res) => {
  try {
    await supabase.from('CRM_FOLLOWUPS')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
