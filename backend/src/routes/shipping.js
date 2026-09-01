const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { cotar, getFreteConfig, ufFromCep } = require('../lib/shipping');
const { braspressTracking, bpReady } = require('../lib/braspress');

// ============================================================
// TRANSPORTADORAS ATIVAS — e qual delas é "o cliente vem buscar".
//
// `is_pickup` (migração 097) PRECISA vir aqui. A coluna existia e o
// cadastro em Logística sabia gravá-la, mas esta rota — a única que o
// pedido de venda consulta — não a selecionava. Marcar "o cliente
// retira no local" não mudava nada no pedido. Campo que decide
// comportamento e não viaja é campo que não existe.
//
// E A COLUNA SOZINHA NÃO BASTA, porque ela nasceu FALSE para todas as
// linhas já cadastradas: quem registrou a retirada antes da migração
// continua com ela desmarcada, e não tem por que saber que precisa
// voltar lá. Então o servidor deduz, por dois sinais que não dependem
// de ninguém clicar em nada:
//
//   • MESMO CNPJ DA EMPRESA. Uma "transportadora" com o CNPJ da
//     própria Lyon não transporta nada — é o balcão dela.
//   • MESMO NOME DA EMPRESA. O cadastro da retirada costuma sair com
//     o nome da loja ("LYON COPOS"), que é o que a torna irreconhecível
//     no seletor, entre BRASPRESS e VRUM.
//
// A coluna continua sendo a resposta certa; isto é a rede embaixo dela.
// Marcar o check no cadastro segue valendo e ganha de tudo.
// ============================================================

const soDigitos = v => String(v || '').replace(/\D/g, '');
const chaveNome = v => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

// Um nome contém o outro (e não é um pedaço curto demais para valer).
function mesmoNome(a, b) {
  const x = chaveNome(a), y = chaveNome(b);
  if (x.length < 4 || y.length < 4) return false;
  return x.includes(y) || y.includes(x);
}

router.get('/carriers', async (req, res) => {
  try {
    const [{ data }, { data: empresa }] = await Promise.all([
      supabase.from('TRANSPORTADORAS')
        .select('id, name, trade_name, cnpj, whatsapp, phone, pickup_schedule, is_pickup')
        .eq('tenant_id', req.tenantId).eq('is_active', true).order('name'),
      supabase.from('EMPRESAS').select('name, cnpj').eq('id', req.tenantId).maybeSingle(),
    ]);

    const cnpjEmpresa = soDigitos(empresa?.cnpj);
    const lista = (data || []).map(c => ({
      ...c,
      is_pickup: !!c.is_pickup
        || (!!cnpjEmpresa && soDigitos(c.cnpj) === cnpjEmpresa)
        || mesmoNome(c.trade_name || c.name, empresa?.name),
    }));
    res.json({ data: lista });
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
