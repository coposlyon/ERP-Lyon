const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');

// O index.js aplica requireRole(['admin']) neste router inteiro.

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, entity, action, user_id, start_date, end_date, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('AUDITORIA')
      .select('*', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (entity)     query = query.eq('entity', entity);
    if (action)     query = query.eq('action', action);
    if (user_id)    query = query.eq('user_id', user_id);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date)   query = query.lte('created_at', end_date + 'T23:59:59');
    if (search)     query = query.ilike('user_name', `%${String(search).replace(/[,()]/g, ' ')}%`);

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: data || [], total: count || 0, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
