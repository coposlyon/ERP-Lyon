const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { cotar, getFreteConfig, ufFromCep } = require('../lib/shipping');
const { braspressTracking, bpReady } = require('../lib/braspress');

// Transportadoras ativas (para escolher no pedido) — acessível ao módulo de vendas
//
// `is_pickup` (migração 097) PRECISA vir aqui. A coluna existia e o
// cadastro em Logística sabia gravá-la, mas esta rota — a única que o
// pedido de venda consulta — não a selecionava. Campo que decide
// comportamento e não viaja é campo que não existe.
//
// O servidor NÃO tenta adivinhar qual linha é a retirada. Tentei
// deduzir por CNPJ e nome iguais aos da empresa, e estava errado: a
// Lyon entrega com o próprio nome, e a dedução transformava as
// entregas próprias em retirada — que pularia a fase "Em Trânsito"
// sem ninguém pedir. Quem responde isso é o check no cadastro, e a
// opção fixa "RETIRAR NO LOCAL" do seletor.
router.get('/carriers', async (req, res) => {
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('id, name, trade_name, whatsapp, phone, pickup_schedule, is_pickup')
      .eq('tenant_id', req.tenantId).eq('is_active', true).order('name');
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/quote — o frete deste pedido
//
// `itens` é opcional, e é ele que muda a resposta. Sem itens, devolve o
// valor da tabela por estado, que é o que a tela do carrinho precisa
// antes de o cliente escolher produto. Com itens, e estando a Total
// Express ligada, devolve o frete calculado por peso e cubagem — com a
// memória de cálculo junto, para o vendedor poder explicar o número.
router.post('/quote', async (req, res) => {
  try {
    const { cep, subtotal, itens, valor_nota } = req.body || {};
    const uf = (req.body?.uf || ufFromCep(cep) || '').toUpperCase();
    if (!uf) return res.status(400).json({ error: 'Informe o estado (UF) ou um CEP de destino.' });
    const r = await cotar(req.tenantId, { uf, cep, subtotal, itens, valor_nota });
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// GET /api/shipping/total-express/cep/:cep — o que a abrangência diz
//
// Serve à tela de conferência e ao atendimento: antes de prometer prazo
// ao cliente, dá para ver se o CEP é atendido, por qual geografia, com
// que risco e em quantos dias. Não calcula preço — só informa.
router.get('/total-express/cep/:cep', async (req, res) => {
  try {
    const { destinoPorCep } = require('../lib/totalexpress');
    const d = await destinoPorCep(req.tenantId, req.params.cep);
    if (!d) return res.status(404).json({ error: 'CEP fora da abrangência da Total Express.' });
    res.json({ data: d });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/shipping/total-express/status — a tabela está carregada?
//
// A tela de configuração precisa saber a diferença entre "desligado" e
// "ligado mas sem tabela". Os dois mostram frete por estado; só o
// segundo é um problema a resolver.
router.get('/total-express/status', async (req, res) => {
  try {
    const supabase = require('../config/supabase');
    const { getFreteConfig } = require('../lib/shipping');
    const cfg = await getFreteConfig(req.tenantId);

    const conta = async (t) => {
      const { count } = await supabase.from(t).select('id', { count: 'exact', head: true })
        .eq('tenant_id', req.tenantId);
      return count || 0;
    };
    const [faixas_cep, tarifas, geografias] = await Promise.all([
      conta('TOTALEXPRESS_ABRANGENCIA'), conta('TOTALEXPRESS_TARIFAS'), conta('TOTALEXPRESS_GEOGRAFIAS'),
    ]);

    // O que impede a cotação de funcionar mesmo com tudo ligado: produto
    // sem peso e categoria sem medida de caixa. Conta-se aqui para a
    // tela poder dizer o que falta, em vez de só falhar na hora.
    const { count: semPeso } = await supabase.from('PRODUTOS')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId).eq('is_active', true)
      .or('weight.is.null,weight.eq.0');
    const { count: semCaixa } = await supabase.from('CATALOGO_EMBALAGEM')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', req.tenantId).is('caixa_altura', null);

    res.json({
      enabled: cfg.tex_enabled,
      municipio_origem: cfg.tex_municipio_origem,
      imposto_modo: cfg.tex_imposto_modo,
      iss_pct: cfg.tex_iss_pct,
      tabela: { faixas_cep, tarifas, geografias },
      pendencias: { produtos_sem_peso: semPeso || 0, embalagens_sem_medida: semCaixa || 0 },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
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

// ════════════════════════════════════════════════════════════
// TOTAL EXPRESS — O WEBSERVICE (coleta e rastreio)
// ════════════════════════════════════════════════════════════
const texServico = () => require('../lib/totalexpressServico');

// GET /api/shipping/total-express/diagnostico
//
// O IP de saída deste servidor e se a Total Express aceita o acesso. A
// conta deles só aceita IP cadastrado: com usuário e senha certos, um IP
// novo ainda recebe "Acesso Negado". Este é o número que se manda para
// eles liberarem.
router.get('/total-express/diagnostico', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem testar o acesso.' });
  }
  try { res.json(await texServico().diagnostico(req.tenantId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/shipping/total-express/pendentes — quem está pronto para ir, e
// quem não está com o motivo escrito.
router.get('/total-express/pendentes', async (req, res) => {
  try {
    const r = await texServico().pendentes(req.tenantId);
    res.json({ ...r, pedidos: r.pedidos.map(({ _encomenda, _nota_numero, ...p }) => p) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/total-express/registrar-coleta — o LOTE. A Total
// Express proíbe transmitir pedido a pedido.
router.post('/total-express/registrar-coleta', async (req, res) => {
  const ids = Array.isArray(req.body?.sale_ids) ? req.body.sale_ids : [];
  try {
    const quem = req.userProfile?.name || req.user?.email || 'Usuário';
    const r = await texServico().registrarColeta(req.tenantId, ids, quem);
    audit(req, 'create', 'total-express-coleta', r.remessa, {
      enviados: r.enviados.length, rejeitados: r.rejeitados.length, falhas: r.falhas.length,
    });
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// POST /api/shipping/total-express/rastreio/sincronizar — o botão de
// "atualizar agora". O automático já roda de hora em hora; o intervalo
// mínimo aqui é para ninguém martelar o serviço deles.
const ultimaSincronizacao = {};
router.post('/total-express/rastreio/sincronizar', async (req, res) => {
  const agora = Date.now();
  if (agora - (ultimaSincronizacao[req.tenantId] || 0) < 5 * 60 * 1000) {
    return res.status(429).json({ error: 'O rastreio foi atualizado há menos de 5 minutos. A Total Express gera os retornos de hora em hora.' });
  }
  ultimaSincronizacao[req.tenantId] = agora;
  try {
    const r = await texServico().sincronizarRastreio(req.tenantId, { dataConsulta: req.body?.data || null });
    if (!r.ok) return res.status(502).json({ error: r.mensagem, ip_bloqueado: r.ip_bloqueado || null });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.ufFromCep = ufFromCep;
