const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { cotar, getFreteConfig, ufFromCep } = require('../lib/shipping');
const { braspressTracking, bpReady } = require('../lib/braspress');

// Transportadoras ativas (para escolher no pedido) — acessível ao módulo de vendas
//
// `is_pickup` (migração 097) PRECISA vir aqui. Ele existia na tabela e
// o cadastro em Logística sabia gravá-lo, mas esta rota — a única que o
// pedido de venda consulta — não o selecionava. Resultado: marcar "o
// cliente retira no local" não mudava nada no pedido, porque a tela
// nunca recebia a marca. Campo que decide comportamento e não viaja é
// campo que não existe.
router.get('/carriers', async (req, res) => {
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('id, name, trade_name, whatsapp, phone, pickup_schedule, is_pickup')
      .eq('tenant_id', req.tenantId).eq('is_active', true).order('name');
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/quote — o frete do estado do cliente
router.post('/quote', async (req, res) => {
  try {
    const { cep, subtotal } = req.body || {};
    const uf = (req.body?.uf || ufFromCep(cep) || '').toUpperCase();
    if (!uf) return res.status(400).json({ error: 'Informe o estado (UF) ou um CEP de destino.' });
    const r = await cotar(req.tenantId, { uf, cep, subtotal });
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// GET /api/shipping/config — o que a tela precisa saber sobre o frete
router.get('/config', async (req, res) => {
  try {
    const c = await getFreteConfig(req.tenantId);
    res.json({
      bp_enabled: c.bp_enabled, has_braspress: bpReady(c),
      origin_cep: c.origin_cep, free_above: c.free_above,
      // Quantos estados já têm valor. Zero = o site não sabe cobrar frete
      // de ninguém, e é isso que a tela precisa avisar.
      table_count: (c.table || []).filter(r => r && r.price !== '' && r.price != null).length,
    });
  } catch (err) { res.status(500).json({ error: 'Erro ao carregar configuração de frete' }); }
});

// GET /api/shipping/braspress/track/:nf — rastreio BrasPress por Nota Fiscal
// CNPJ pagador do frete: query ?cnpj=... ou o CNPJ configurado (bp_cnpj).
router.get('/braspress/track/:nf', async (req, res) => {
  try {
    const cfg = await getFreteConfig(req.tenantId);
    const r = await braspressTracking(cfg, { cnpj: req.query.cnpj, nf: req.params.nf });
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

module.exports = router;
module.exports.ufFromCep = ufFromCep;
