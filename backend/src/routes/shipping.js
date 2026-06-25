const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { cotar, rastrear, getFreteConfig, ufFromCep } = require('../lib/shipping');

// Transportadoras ativas (para escolher no pedido) — acessível ao módulo de vendas
router.get('/carriers', async (req, res) => {
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('id, name, trade_name, whatsapp, phone')
      .eq('tenant_id', req.tenantId).eq('is_active', true).order('name');
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/quote — calcula frete + prazo
router.post('/quote', async (req, res) => {
  try {
    const { cep, qty, weightKg, subtotal } = req.body || {};
    const uf = (req.body?.uf || ufFromCep(cep) || '').toUpperCase();
    if (!uf) return res.status(400).json({ error: 'Informe o estado (UF) ou um CEP de destino.' });
    const r = await cotar(req.tenantId, { uf, cep, qty, weightKg, subtotal });
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// GET /api/shipping/track/:code — rastreia pela J&T
router.get('/track/:code', async (req, res) => {
  try {
    const r = await rastrear(req.tenantId, req.params.code);
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// GET /api/shipping/config — diz se a J&T está configurada (sem expor a chave)
router.get('/config', async (req, res) => {
  try {
    const c = await getFreteConfig(req.tenantId);
    res.json({
      enabled: c.enabled, has_jt: !!(c.jt_api_account && c.jt_private_key),
      origin_cep: c.origin_cep, free_above: c.free_above,
      weight_per_unit_g: c.weight_per_unit_g, table_count: (c.table || []).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.ufFromCep = ufFromCep;
