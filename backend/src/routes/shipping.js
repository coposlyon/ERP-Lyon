const express = require('express');
const router = express.Router();
const { cotar, rastrear, getFreteConfig } = require('../lib/shipping');

// Mapa CEP→UF (faixas) para resolver o estado quando só temos o CEP.
const CEP_UF = [
  [1000000, 19999999, 'SP'], [20000000, 28999999, 'RJ'], [29000000, 29999999, 'ES'],
  [30000000, 39999999, 'MG'], [40000000, 48999999, 'BA'], [49000000, 49999999, 'SE'],
  [50000000, 56999999, 'PE'], [57000000, 57999999, 'AL'], [58000000, 58999999, 'PB'],
  [59000000, 59999999, 'RN'], [60000000, 63999999, 'CE'], [64000000, 64999999, 'PI'],
  [65000000, 65999999, 'MA'], [66000000, 68899999, 'PA'], [68900000, 68999999, 'AP'],
  [69000000, 69299999, 'AM'], [69300000, 69399999, 'RR'], [69400000, 69899999, 'AM'],
  [69900000, 69999999, 'AC'], [70000000, 72799999, 'DF'], [72800000, 72999999, 'GO'],
  [73000000, 73699999, 'DF'], [73700000, 76799999, 'GO'], [76800000, 76999999, 'RO'],
  [77000000, 77999999, 'TO'], [78000000, 78899999, 'MT'], [79000000, 79999999, 'MS'],
  [80000000, 87999999, 'PR'], [88000000, 89999999, 'SC'], [90000000, 99999999, 'RS'],
];
function ufFromCep(cep) {
  const n = parseInt(String(cep || '').replace(/\D/g, ''), 10);
  if (!n) return '';
  const f = CEP_UF.find(([a, b]) => n >= a && n <= b);
  return f ? f[2] : '';
}

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
