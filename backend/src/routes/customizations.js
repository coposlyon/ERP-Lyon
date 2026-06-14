const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { uploadDataUrl } = require('../lib/storage');

// Listar personalizações (kanban)
router.get('/', async (req, res) => {
  const { status, priority, page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  try {
    let q = supabase.from('PERSONALIZACOES')
      .select('*, CLIENTES(id,name,phone), USUARIOS!assigned_to(id,name), VENDAS(id,number)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (priority) q = q.eq('priority', priority);
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Buscar por ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('PERSONALIZACOES')
      .select('*, CLIENTES(id,name,phone,email), USUARIOS!assigned_to(id,name), VENDAS(id,number), PERSONALIZACAO_HISTORICO(*, USUARIOS(name))')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !data) return res.status(404).json({ error: 'Personalização não encontrada' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar
router.post('/', async (req, res) => {
  const { sale_id, customer_id, title, priority, deadline, artwork_url, artwork_notes, customer_notes, internal_notes, assigned_to, design_3d, preview_url } = req.body;
  if (!title) return res.status(400).json({ error: 'Título obrigatório' });
  try {
    const preview = await uploadDataUrl(preview_url, 'personalizacoes');
    const { data, error } = await supabase.from('PERSONALIZACOES').insert({
      tenant_id: req.tenantId, sale_id: sale_id || null,
      customer_id: customer_id || null, title, status: 'briefing',
      priority: priority || 'normal', deadline: deadline || null,
      artwork_url, artwork_notes, customer_notes, internal_notes,
      assigned_to: assigned_to || null,
      design_3d: design_3d || null, preview_url: preview,
    }).select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar
router.put('/:id', async (req, res) => {
  const { title, priority, deadline, artwork_url, artwork_notes, customer_notes, internal_notes, assigned_to, design_3d, preview_url } = req.body;
  try {
    const upd = { title, priority, deadline, artwork_url, artwork_notes, customer_notes, internal_notes, assigned_to, updated_at: new Date().toISOString() };
    if (design_3d !== undefined)   upd.design_3d = design_3d;
    if (preview_url !== undefined) upd.preview_url = await uploadDataUrl(preview_url, 'personalizacoes');
    const { data, error } = await supabase.from('PERSONALIZACOES')
      .update(upd)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Histórico de uma personalização
router.get('/:id/history', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PERSONALIZACAO_HISTORICO')
      .select('*, USUARIOS(id, name)')
      .eq('customization_id', req.params.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Mover status (kanban)
router.patch('/:id/status', async (req, res) => {
  const { status, notes } = req.body;
  const allowed = ['briefing','design','approval','printing','finishing','ready','delivered','cancelled'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const { data: current } = await supabase.from('PERSONALIZACOES')
      .select('status').eq('id', req.params.id).single();

    const { data, error } = await supabase.from('PERSONALIZACOES')
      .update({ status, updated_at: new Date().toISOString(), ...(status === 'approval' ? { approved_at: null } : {}), ...(status === 'delivered' ? { approved_at: new Date().toISOString() } : {}) })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;

    await supabase.from('PERSONALIZACAO_HISTORICO').insert({
      customization_id: req.params.id, user_id: req.userId,
      from_status: current?.status, to_status: status, notes: notes || null,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
