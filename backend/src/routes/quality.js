const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');

// ── Stats gerais ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [{ data: lots }, { data: insp }] = await Promise.all([
      supabase.from('LOTES').select('status,quantity').eq('tenant_id', req.tenantId),
      supabase.from('INSPECOES').select('result,total_inspected,approved_qty,rejected_qty,rejection_rate').eq('tenant_id', req.tenantId),
    ]);
    const totalInsp = insp?.reduce((s, i) => s + i.total_inspected, 0) || 0;
    const totalRej  = insp?.reduce((s, i) => s + i.rejected_qty,    0) || 0;
    res.json({
      lots: {
        total:       lots?.length || 0,
        active:      lots?.filter(l => l.status === 'active').length     || 0,
        inspecting:  lots?.filter(l => l.status === 'inspecting').length || 0,
        approved:    lots?.filter(l => l.status === 'approved').length   || 0,
        rejected:    lots?.filter(l => l.status === 'rejected').length   || 0,
        consumed:    lots?.filter(l => l.status === 'consumed').length   || 0,
      },
      inspections: {
        total:            insp?.length || 0,
        total_inspected:  totalInsp,
        total_rejected:   totalRej,
        avg_rejection_rate: totalInsp > 0
          ? parseFloat((totalRej / totalInsp * 100).toFixed(2)) : 0,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── LOTES ─────────────────────────────────────────────────
router.get('/lots', async (req, res) => {
  const { page = 1, limit = 50, status, product_id } = req.query;
  const offset = (page - 1) * limit;
  try {
    let query = supabase
      .from('LOTES')
      .select('*, PRODUTOS(id,name,code,unit), FORNECEDORES(id,name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (status)     query = query.eq('status', status);
    if (product_id) query = query.eq('product_id', product_id);
    query = query.range(offset, offset + Number(limit) - 1);
    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/lots', async (req, res) => {
  const { product_id, supplier_id, quantity, unit, production_date, expiry_date, cost_price, notes } = req.body;
  if (!quantity) return res.status(400).json({ error: 'Quantidade é obrigatória' });
  try {
    const { data: last } = await supabase
      .from('LOTES').select('number')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    const seq    = (parseInt((last?.number || 'LOT-00000').replace('LOT-', '')) + 1);
    const number = `LOT-${String(seq).padStart(5,'0')}`;
    const { data, error } = await supabase
      .from('LOTES')
      .insert({
        tenant_id:       req.tenantId,
        number,
        product_id:      product_id  || null,
        supplier_id:     supplier_id || null,
        quantity,
        unit:            unit || 'un',
        production_date: production_date || null,
        expiry_date:     expiry_date || null,
        cost_price:      cost_price  || 0,
        status:          'active',
        notes:           notes || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/lots/:id', async (req, res) => {
  try {
    const { data: lot, error } = await supabase
      .from('LOTES')
      .select('*, PRODUTOS(id,name,code,unit), FORNECEDORES(id,name)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !lot) return res.status(404).json({ error: 'Lote não encontrado' });
    const { data: inspections } = await supabase
      .from('INSPECOES').select('*')
      .eq('lote_id', req.params.id)
      .order('created_at', { ascending: false });
    res.json({ ...lot, inspections: inspections || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/lots/:id', async (req, res) => {
  const { status, notes } = req.body;
  try {
    const { data, error } = await supabase
      .from('LOTES')
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── INSPEÇÕES ─────────────────────────────────────────────
router.post('/lots/:id/inspect', async (req, res) => {
  const { inspection_date, total_inspected, approved_qty, rejected_qty, result, notes, criteria } = req.body;
  if (!total_inspected) return res.status(400).json({ error: 'Total inspecionado é obrigatório' });
  try {
    const rejected       = Number(rejected_qty  || 0);
    const approved       = Number(approved_qty  || (total_inspected - rejected));
    const rejection_rate = total_inspected > 0
      ? parseFloat((rejected / total_inspected * 100).toFixed(2)) : 0;
    const finalResult    = result || (rejection_rate > 5 ? 'rejected' : 'approved');

    const { data, error } = await supabase
      .from('INSPECOES')
      .insert({
        tenant_id:       req.tenantId,
        lote_id:         req.params.id,
        inspector_id:    req.user.id,
        inspection_date: inspection_date || new Date().toISOString().split('T')[0],
        total_inspected: Number(total_inspected),
        approved_qty:    approved,
        rejected_qty:    rejected,
        rejection_rate,
        result:          finalResult,
        notes:           notes || null,
        criteria:        criteria || [],
      })
      .select().single();
    if (error) throw error;

    // Atualiza status do lote
    const lotStatus = finalResult === 'rejected' ? 'rejected'
      : finalResult === 'approved'  ? 'approved'
      : 'inspecting';
    await supabase.from('LOTES')
      .update({ status: lotStatus, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);

    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/inspections', async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;
  try {
    const { data, error, count } = await supabase
      .from('INSPECOES')
      .select('*, LOTES(id,number,PRODUTOS(name))', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .range(offset, offset + Number(limit) - 1);
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
