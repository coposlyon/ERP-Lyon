// ============================================================
// O CATÁLOGO, DO LADO DO CLIENTE.
//
// Rotas públicas: quem abre o link que o vendedor mandou não tem conta,
// não tem token e não pode ter. Por isso duas regras valem em todas as
// rotas daqui:
//
//   1. NADA DE DENTRO SAI. Nem custo, nem margem, nem markup, nem
//      fornecedor, nem estoque, nem quem é o vendedor. O cliente vê
//      preço de venda, prazo e frete — e mais nada. Cada resposta é
//      montada campo a campo, nunca repassando a linha do banco: é a
//      única forma de uma coluna nova não vazar sozinha amanhã.
//
//   2. O SERVIDOR NÃO ACREDITA NA TELA. Preço, mínimo e compatibilidade
//      são recalculados aqui mesmo quando a tela já mandou tudo certo.
//      A tela é do cliente; a requisição é de quem quiser.
//
// O CARRINHO E O PAGAMENTO NÃO ESTÃO AQUI. Já existem em public-store
// (/quote, PEDIDOS_LOJA, PIX). Repetir seria criar um segundo caixa que
// discorda do primeiro em duas semanas.
// ============================================================
const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const supabase = require('../config/supabase');
const {
  familias, modelosDaFamilia, configDoModelo,
  precoDoItem, validarEscolha,
} = require('../lib/catalogo');
// O caixa é o MESMO da loja: PIX, fila de pedidos e virada em venda. Um
// pedido do catálogo e um pedido da loja chegam no ERP pela mesma porta,
// com a mesma conferência — duas filas de dinheiro seria a Lyon
// conferindo pagamento em dois lugares.
const { pixConfig, gerarCobrancaPix } = require('../lib/pixCobranca');
const { criarVendaDoPedido } = require('../lib/pedidoLoja');
// Os adicionais do copo (borda, canudo, tampa). A MESMA biblioteca que
// a Engenharia de Custos e o cadastro leem: se o catálogo somasse por
// conta própria, o preço da tela deixaria de bater com o do pedido e a
// diferença só apareceria no fechamento do mês.
const { adicionaisDoProduto } = require('../lib/adicionais');

// A loja pública serve UM tenant. Mesma origem do public-store.
const STORE_TENANT = process.env.STORE_TENANT_ID || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Quanto tempo a cobrança PIX fica de pé. Mesmo número da loja: o
// cliente não tem por que ter 24 h num caminho e 2 h no outro.
const PIX_VALIDADE_H = Number(process.env.STORE_PIX_VALIDADE_H) || 24;

function fail(res, err, onde) {
  console.error(`[catalogo${onde ? ':' + onde : ''}]`, err?.message || err);
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
}

// Salvar projeto de arte grava linha no banco: sem teto, um script enche
// a tabela numa tarde.
const escritaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 60,
  message: { error: 'Muitas tentativas seguidas. Aguarde alguns minutos.' },
});

// ── Tela 1: as famílias ─────────────────────────────────────
router.get('/familias', async (req, res) => {
  try {
    const r = await familias(STORE_TENANT);
    if (r.config_ausente) {
      return res.json({ familias: [], aviso: 'O catálogo ainda não foi configurado.' });
    }
    res.json(r);
  } catch (err) { fail(res, err, 'familias'); }
});

// ── Tela 2: os modelos de uma família ───────────────────────
router.get('/familia/:slug', async (req, res) => {
  try {
    const r = await modelosDaFamilia(STORE_TENANT, String(req.params.slug || ''));
    if (r.config_ausente) return res.status(404).json({ error: 'Catálogo não configurado.' });
    if (r.erro) return res.status(404).json({ error: r.erro });
    res.json(r);
  } catch (err) { fail(res, err, 'familia'); }
});

// ── Tela 3: a configuração de um modelo ─────────────────────
router.get('/modelo/:chave', async (req, res) => {
  try {
    const r = await configDoModelo(STORE_TENANT, String(req.params.chave || ''));
    if (r.config_ausente) return res.status(404).json({ error: 'Catálogo não configurado.' });
    if (r.erro) return res.status(404).json({ error: r.erro });
    res.json(r);
  } catch (err) { fail(res, err, 'modelo'); }
});

/**
 * O preço, recalculado a cada mexida do cliente.
 *
 * Devolve também os problemas da combinação escolhida. A tela usa para
 * segurar o botão; o servidor usa a mesma conta no fechamento — uma
 * regra, um lugar.
 */
router.post('/preco', async (req, res) => {
  const { modelo, acabamento_id, processo_id, quantidade, campos, tipo_pedido, cores_liso, adicionais } = req.body || {};
  try {
    const cfg = await configDoModelo(STORE_TENANT, String(modelo || ''));
    if (cfg.erro || cfg.config_ausente) return res.status(404).json({ error: 'Modelo não encontrado' });

    const escolha = {
      acabamento_id, processo_id, campos: campos || {},
      tipo_pedido: tipo_pedido || 'personalizado',
      quantidade: Number(quantidade) || 0,
      cores_liso,
    };
    const check = validarEscolha(cfg, escolha);

    // O produto que será realmente vendido: se o acabamento pede a cor do
    // produto, é a linha daquela cor; senão, a referência do modelo.
    const produtoId = produtoEscolhido(cfg, escolha) || cfg.modelo.produto_referencia;

    const { data: prod, error } = await supabase.from('PRODUTOS')
      .select('id, name, code, category_id, sale_price, price_tiers, print_pricing, min_order_qty')
      .eq('tenant_id', STORE_TENANT).eq('id', produtoId).maybeSingle();
    if (error) throw error;
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });

    const acab = (cfg.acabamentos || []).find(a => a.id === acabamento_id) || null;
    const proc = (cfg.processos || []).find(p => p.id === processo_id) || null;

    const minimo = minimoDoItem(cfg, escolha);
    const qtd = Math.max(minimo, Number(quantidade) || minimo);
    const preco = precoDoItem({ produto: prod, quantidade: qtd, acabamento: acab, processo: proc });

    // O QUE ESTE COPO OFERECE, e quanto sobe se a cliente marcar. Vem
    // com o preço porque a tela recalcula a cada clique — e o total que
    // ela mostra tem que ser o mesmo que o checkout vai cobrar.
    const ad = await adicionaisDoPedido(prod.id, prod.category_id, adicionais);

    res.json({
      ok: check.ok,
      problemas: check.problemas,
      produto_id: prod.id,
      codigo: prod.code,
      nome: acab ? acab.nome_comercial : cfg.modelo.nome,
      quantidade: qtd,
      quantidade_minima: minimo,
      // O copo sozinho, para a tela poder mostrar a soma aberta.
      valor_base_unitario: preco.unitario,
      valor_unitario: Math.round((preco.unitario + ad.unitario) * 100) / 100,
      valor_produtos: Math.round((preco.unitario + ad.unitario) * qtd * 100) / 100,
      adicionais_disponiveis: ad.disponiveis,
      adicionais_escolhidos: ad.escolhidos,
      valor_adicionais_unitario: ad.unitario,
      valor_adicionais: Math.round(ad.unitario * qtd * 100) / 100,
    });
  } catch (err) { fail(res, err, 'preco'); }
});

/**
 * OS ADICIONAIS DE UM COPO — o que se oferece e o que se cobra.
 *
 * O SERVIDOR NÃO ACREDITA NA TELA, e aqui isso é dinheiro: a requisição
 * manda IDS de item, nunca preço. O valor é lido do cadastro na hora,
 * então mexer no HTML só muda o que a pessoa vê, não o que ela paga.
 *
 * SÓ O QUE É OPCIONAL ENTRA NA CONTA. O item marcado como "já vem no
 * preço" (a tinta da serigrafia) compõe o custo da peça e já está
 * dentro do preço de tabela — cobrá-lo de novo aqui seria cobrar duas
 * vezes pela mesma coisa.
 */
async function adicionaisDoPedido(produtoId, categoriaId, escolhidos) {
  const todos = await adicionaisDoProduto(STORE_TENANT, produtoId, categoriaId || null);
  const opcionais = todos.filter(a => !a.padrao);
  const pedidos = new Set((Array.isArray(escolhidos) ? escolhidos : []).filter(Boolean).map(String));

  // Campo a campo: o cliente não vê custo, consumo nem fornecedor.
  const paraVitrine = a => ({
    item_id: a.item.id,
    nome: a.item.name,
    cor: a.item.color_name || null,
    cor_hex: a.item.color_hex || null,
    foto: a.item.photo_url || null,
    tipo: a.item.kind,
    preco: a.preco,
  });

  const marcados = opcionais.filter(a => pedidos.has(String(a.item.id)));
  return {
    disponiveis: opcionais.map(paraVitrine),
    escolhidos: marcados.map(paraVitrine),
    // Por PEÇA. Multiplicar pela quantidade é de quem monta a linha.
    unitario: Math.round(marcados.reduce((t, a) => t + Number(a.preco || 0), 0) * 100) / 100,
  };
}

/**
 * Qual produto do cadastro a escolha aponta.
 *
 * Só o campo de grupo "produto" resolve isso — pintura, borda e jateado
 * são serviço sobre o copo, não outro copo.
 */
function produtoEscolhido(cfg, escolha) {
  const acab = (cfg.acabamentos || []).find(a => a.id === escolha.acabamento_id);
  for (const campo of acab?.campos || []) {
    if (campo.grupo !== 'produto') continue;
    const escolhido = (cfg.cores?.produto || []).find(c => c.id === escolha.campos?.[campo.key]);
    if (escolhido?.produto_id) return escolhido.produto_id;
  }
  return null;
}

/**
 * O mínimo de unidades deste item.
 *
 * No liso vale a caixa fechada (caixa × mínimo de caixas); no
 * personalizado, a quantidade mínima do próprio produto. As duas regras
 * são do cadastro, nenhuma está escrita na tela.
 */
function minimoDoItem(cfg, escolha) {
  if (escolha.tipo_pedido === 'liso') {
    const e = cfg.embalagem || {};
    return Math.max(1, (Number(e.caixa_qtd) || 1) * (Number(e.min_caixas) || 1));
  }
  return Math.max(1, Number(cfg.modelo?.qtd_minima) || 1);
}

// ── Tela 4: ocasiões e o banco de artes ─────────────────────
router.get('/ocasioes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_OCASIOES')
      .select('id, name, slug, icone, destaque, seq')
      .eq('tenant_id', STORE_TENANT).eq('is_active', true).order('seq');
    if (error) return res.json({ ocasioes: [] });
    res.json({
      ocasioes: (data || []).map(o => ({
        id: o.id, nome: o.name, slug: o.slug,
        icone: o.icone || null, destaque: !!o.destaque,
      })),
    });
  } catch (err) { fail(res, err, 'ocasioes'); }
});

/**
 * Os modelos de arte de uma ocasião.
 *
 * O VETOR VEM JUNTO. A miniatura da lista é a própria arte desenhada
 * pequena, e não uma imagem à parte: assim não existe o dia em que a
 * miniatura mostra uma coisa e o editor abre outra. São vetores de
 * poucos KB; o teto de 200 artes segura o tamanho da resposta.
 */
router.get('/artes', async (req, res) => {
  const { ocasiao } = req.query;
  try {
    let q = supabase.from('CATALOGO_ARTES')
      .select('id, codigo, name, svg, thumb_url, elementos, fontes, ocasiao_id, seq')
      .eq('tenant_id', STORE_TENANT).eq('is_active', true).order('seq').limit(200);
    if (ocasiao) q = q.eq('ocasiao_id', ocasiao);
    const { data, error } = await q;
    if (error) return res.json({ artes: [] });
    res.json({
      artes: (data || []).map(a => ({
        id: a.id, codigo: a.codigo, nome: a.name,
        svg: a.svg || null,
        thumb: a.thumb_url || null,
        elementos: Array.isArray(a.elementos) ? a.elementos : [],
        fontes: Array.isArray(a.fontes) ? a.fontes : [],
      })),
    });
  } catch (err) { fail(res, err, 'artes'); }
});

router.get('/arte/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_ARTES')
      .select('id, codigo, name, svg, elementos, fontes')
      .eq('tenant_id', STORE_TENANT).eq('id', req.params.id).eq('is_active', true).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Arte não encontrada' });
    res.json({
      id: data.id, codigo: data.codigo, nome: data.name,
      svg: data.svg || null,
      elementos: Array.isArray(data.elementos) ? data.elementos : [],
      fontes: Array.isArray(data.fontes) ? data.fontes : [],
    });
  } catch (err) { fail(res, err, 'arte'); }
});

/**
 * Salva o projeto de arte e devolve o id.
 *
 * O GABARITO É COPIADO PARA DENTRO DO PROJETO. Se o Administrativo
 * mudar a medida amanhã, esta arte continua sabendo em que medida foi
 * aprovada — e a gráfica continua imprimindo o que o cliente viu.
 *
 * O que o cliente manda como gabarito é ignorado: a medida vem do
 * cadastro, sempre. Aceitar a medida do navegador seria aceitar que
 * alguém aumente a área de impressão editando a requisição.
 */
router.post('/projeto', escritaLimiter, async (req, res) => {
  const { modelo, produto_id, arte_id, posicao, faces, visitor_id, preview } = req.body || {};
  try {
    const cfg = await configDoModelo(STORE_TENANT, String(modelo || ''));
    if (cfg.erro || cfg.config_ausente) return res.status(404).json({ error: 'Modelo não encontrado' });

    const gab = cfg.gabarito || {};
    if (!gab.altura_mm || !gab.largura_mm) {
      return res.status(400).json({
        error: 'Este produto ainda não tem gabarito de arte cadastrado. Fale com um atendente.',
      });
    }

    const lado = (posicao === 'frente_verso' && gab.permite_verso !== false) ? 'frente_verso' : 'frente';

    const { data, error } = await supabase.from('CATALOGO_PROJETOS').insert({
      tenant_id: STORE_TENANT,
      visitor_id: String(visitor_id || '').slice(0, 80) || null,
      product_id: produto_id || cfg.modelo.produto_referencia,
      arte_id: arte_id || null,
      posicao: lado,
      gabarito: {
        altura_mm: Number(gab.altura_mm), largura_mm: Number(gab.largura_mm),
        margem_mm: Number(gab.margem_mm) || 2,
      },
      faces: faces && typeof faces === 'object' ? faces : {},
      preview_url: typeof preview === 'string' && preview.startsWith('http') ? preview : null,
    }).select('id').single();
    if (error) throw error;

    res.status(201).json({ id: data.id, posicao: lado, gabarito: gab });
  } catch (err) { fail(res, err, 'projeto'); }
});

router.get('/projeto/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CATALOGO_PROJETOS')
      .select('id, product_id, arte_id, posicao, gabarito, faces, preview_url')
      .eq('tenant_id', STORE_TENANT).eq('id', req.params.id).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Projeto não encontrado' });
    res.json(data);
  } catch (err) { fail(res, err, 'projeto'); }
});

// ── O carrinho vira orçamento (§29) ──────────────────────

// Quanto tempo a cotação vale e em quantos dias a fábrica produz. Os dois
// aparecem na tela do cliente e têm que ser o MESMO número aqui e lá —
// prometer 3 dias na tela e gravar 10 no orçamento é como nasce discussão
// de prazo.
const VALIDADE_DIAS = Number(process.env.CATALOGO_VALIDADE_DIAS) || 3;
const PRAZO_PRODUCAO_MIN = Number(process.env.CATALOGO_PRAZO_MIN) || 3;
const PRAZO_PRODUCAO_MAX = Number(process.env.CATALOGO_PRAZO_MAX) || 7;

router.get('/regras', (req, res) => {
  res.json({
    validade_dias: VALIDADE_DIAS,
    prazo_producao: { min: PRAZO_PRODUCAO_MIN, max: PRAZO_PRODUCAO_MAX },
  });
});

/**
 * "Gerar orçamento" NÃO vira Pedido de Venda.
 *
 * Grava um orçamento aberto — item, configuração, arte, quantidade, prazo
 * e valor — e para aí. Quem transforma em pedido é o pagamento, e o
 * pagamento já tem caminho próprio (/api/public/quote).
 *
 * O PREÇO É REFEITO AQUI. O carrinho mora no navegador do cliente: ele
 * chega com valor calculado, e o valor que chega é descartado. O que vai
 * para o orçamento sai do cadastro, item por item.
 */
router.post('/orcamento', escritaLimiter, async (req, res) => {
  const { contato = {}, itens = [], observacao, data_evento, cep, retirar } = req.body || {};

  const nome = String(contato.nome || '').trim();
  const fone = String(contato.telefone || '').replace(/[^0-9]/g, '');
  if (!nome || fone.length < 10) {
    return res.status(400).json({ error: 'Informe seu nome e um telefone com DDD.' });
  }
  if (!Array.isArray(itens) || !itens.length) {
    return res.status(400).json({ error: 'Seu carrinho está vazio.' });
  }
  if (itens.length > 30) {
    return res.status(400).json({ error: 'Muitos itens no mesmo orçamento. Fale com um atendente.' });
  }

  try {
    const linhas = [];
    for (const item of itens) {
      const linha = await montarItem(item);
      if (linha.erro) return res.status(400).json({ error: linha.erro });
      linhas.push(linha);
    }

    const subtotal = linhas.reduce((s, i) => s + i.total, 0);

    // O cliente do orçamento é um lead: reaproveita pelo telefone e só cria
    // quando não existe. Dois cadastros do mesmo cliente é o começo de dois
    // históricos que ninguém consegue juntar depois.
    const customerId = await acharOuCriarLead({ nome, fone, email: contato.email });

    const { data: numData } = await supabase.rpc('proximo_numero_orcamento', { p_tenant_id: STORE_TENANT });

    const validade = new Date();
    validade.setDate(validade.getDate() + VALIDADE_DIAS);

    const rodape = [
      'ORÇAMENTO PELO CATÁLOGO — Contato: ' + nome + ' / ' + (contato.telefone || ''),
      contato.email ? 'E-mail: ' + contato.email : null,
      cep ? 'CEP: ' + cep : null,
      retirar ? 'Retirada no local' : null,
      data_evento ? 'Data do evento: ' + String(data_evento).split('-').reverse().join('/') : null,
      observacao ? 'Obs: ' + observacao : null,
    ].filter(Boolean).join('\n');

    const { data: orc, error } = await supabase.from('ORCAMENTOS').insert({
      tenant_id: STORE_TENANT,
      number: numData || 1,
      customer_id: customerId,
      subtotal, discount: 0, total: subtotal,
      notes: rodape,
      valid_until: validade.toISOString().slice(0, 10),
      delivery_days: PRAZO_PRODUCAO_MAX,
      status: 'open',
      event_date: data_evento || null,
      origin: 'catalogo',
    }).select('id, number').single();
    if (error) throw error;

    const { error: erroItens } = await supabase.from('ORCAMENTO_ITENS').insert(
      linhas.map(l => ({
        quote_id: orc.id,
        product_id: l.product_id,
        product_name: l.nome,
        quantity: l.quantidade,
        unit_price: l.unitario,
        discount: 0,
        total: l.total,
        customization: { ...l.configuracao, arte: l.arte || null, adicionais: l.adicionais || [] },
      })));
    if (erroItens) throw erroItens;

    res.status(201).json({
      numero: String(orc.number).padStart(4, '0'),
      total: subtotal,
      validade: validade.toISOString().slice(0, 10),
      itens: linhas.length,
    });
  } catch (err) { fail(res, err, 'orcamento'); }
});

/** Um item do carrinho, refeito do zero a partir do cadastro. */
async function montarItem(item) {
  const cfg = await configDoModelo(STORE_TENANT, String(item?.modelo || ''));
  if (cfg.erro || cfg.config_ausente) {
    return { erro: 'Um dos itens do carrinho não existe mais no catálogo.' };
  }

  const escolha = {
    acabamento_id: item.acabamento_id,
    processo_id: item.processo_id,
    campos: item.campos || {},
    tipo_pedido: item.tipo_pedido || 'personalizado',
    quantidade: Number(item.quantidade) || 0,
    cores_liso: item.cores_liso,
  };

  const check = validarEscolha(cfg, escolha);
  if (!check.ok) return { erro: check.problemas[0] };

  const produtoId = produtoEscolhido(cfg, escolha) || cfg.modelo.produto_referencia;
  const { data: prod, error } = await supabase.from('PRODUTOS')
    .select('id, name, code, category_id, sale_price, price_tiers, print_pricing')
    .eq('tenant_id', STORE_TENANT).eq('id', produtoId).maybeSingle();
  if (error) throw error;
  if (!prod) return { erro: 'Um dos produtos do carrinho saiu do catálogo.' };

  const acab = check.acabamento;
  const proc = (cfg.processos || []).find(p => p.id === escolha.processo_id) || null;
  const minimo = minimoDoItem(cfg, escolha);
  const qtd = Math.max(minimo, escolha.quantidade);
  const preco = precoDoItem({ produto: prod, quantidade: qtd, acabamento: acab, processo: proc });

  // OS ADICIONAIS, REFEITOS DO CADASTRO. O carrinho manda ids; o preço
  // sai daqui. Um item que saiu do ar, foi desativado ou deixou de se
  // aplicar a este copo simplesmente não entra — e não some dinheiro
  // nenhum da conta, porque a conta é esta.
  const ad = await adicionaisDoPedido(prod.id, prod.category_id, item.adicionais);
  const unitario = Math.round((preco.unitario + ad.unitario) * 100) / 100;

  // A ARTE QUE VAI PARA A GRÁFICA. Sai do PROJETO gravado, nunca do que
  // o navegador mandou: o carrinho é do cliente, o projeto é nosso. E
  // sai em VETOR — é o que a serigrafia grava; um PNG do editor viraria
  // serrilha na tela.
  let arte = null;
  if (item.projeto_id) {
    const { data: proj } = await supabase.from('CATALOGO_PROJETOS')
      .select('faces, gabarito, posicao, preview_url')
      .eq('tenant_id', STORE_TENANT).eq('id', item.projeto_id).maybeSingle();
    if (proj) {
      arte = {
        projeto_id: item.projeto_id,
        posicao: proj.posicao,
        gabarito: proj.gabarito || null,
        frente: proj.faces?.frente?.svg || null,
        verso: proj.faces?.verso?.svg || null,
        preview_url: proj.preview_url || null,
      };
    }
  }

  return {
    product_id: prod.id,
    nome: acab.nome_comercial,
    quantidade: qtd,
    unitario,
    // O COPO SOZINHO, que é o que a trava de preço zero precisa olhar.
    unitario_base: preco.unitario,
    total: Math.round(unitario * qtd * 100) / 100,
    // O PORQUÊ DO PREÇO, gravado junto. "R$ 6,80" sem dizer que R$ 0,50
    // era a borda prata é um número que ninguém confere depois — nem a
    // produção, que precisa saber que aquele copo leva borda.
    adicionais: ad.escolhidos,
    valor_adicionais_unitario: ad.unitario,
    arte,
    // A configuração inteira vai junto, em nome legível. Quem abrir o
    // orçamento no ERP lê "Cor base: Rosa", não um id que só o banco
    // entende — e a produção lê a mesma coisa que o cliente escolheu.
    configuracao: {
      codigo: prod.code,
      acabamento: acab.nome,
      tipo_pedido: escolha.tipo_pedido,
      campos: descreverCampos(cfg, acab, escolha.campos),
      impressao: proc ? proc.nome : null,
      posicao_arte: item.posicao || null,
      projeto_arte: item.projeto_id || null,
    },
  };
}

/** { cor_base: "<uuid>" } vira { "Cor base": "Rosa" }. */
function descreverCampos(cfg, acab, campos) {
  const saida = {};
  for (const campo of acab.campos || []) {
    const valor = campos ? campos[campo.key] : null;
    if (!valor) continue;
    const opcao = ((cfg.cores || {})[campo.grupo] || []).find(c => c.id === valor);
    saida[campo.label] = opcao ? opcao.name : String(valor);
  }
  return saida;
}

async function acharOuCriarLead({ nome, fone, email }) {
  const { data: achado } = await supabase.from('CLIENTES').select('id')
    .eq('tenant_id', STORE_TENANT).eq('phone', fone).limit(1).maybeSingle();
  if (achado) return achado.id;

  const { data: novo, error } = await supabase.from('CLIENTES').insert({
    tenant_id: STORE_TENANT, type: 'PF',
    name: nome, phone: fone, email: email || null, is_active: true,
  }).select('id').single();
  if (error) throw error;
  return novo.id;
}

// ── O carrinho vira cobrança (§30 a §32) ────────────────────

/**
 * "Gerar pagamento".
 *
 * O CLIENTE PRECISA TER CADASTRO (§30). Sem `customer_id` a rota devolve
 * LOGIN_REQUIRED e a tela manda para o cadastro que já existe — o
 * carrinho fica no navegador e volta inteiro. Não criamos lead aqui:
 * lead é para orçamento; quem vai pagar tem que ser cliente de verdade,
 * com CPF, porque é esse CPF que vai amarrar o acompanhamento do pedido
 * depois (§33).
 *
 * O PEDIDO NÃO VIRA VENDA AGORA (§32). Ele entra em PEDIDOS_LOJA
 * aguardando pagamento — a MESMA fila da loja, com a mesma conferência
 * de PIX e a mesma tela de confirmação no ERP. Duas filas de pagamento
 * seria a Lyon conferindo dinheiro em dois lugares.
 *
 * O PREÇO É REFEITO AQUI, item por item, a partir do cadastro. O que o
 * navegador manda de valor é descartado.
 */
router.post('/pagamento', escritaLimiter, async (req, res) => {
  const {
    customer_id, itens = [], observacao, data_evento,
    cep, retirar, frete, forma,
  } = req.body || {};

  if (!Array.isArray(itens) || !itens.length) {
    return res.status(400).json({ error: 'Seu carrinho está vazio.' });
  }
  if (itens.length > 30) {
    return res.status(400).json({ error: 'Muitos itens no mesmo pedido. Fale com um atendente.' });
  }
  if (!customer_id) {
    return res.status(401).json({ error: 'Faça seu cadastro para finalizar o pedido.', code: 'LOGIN_REQUIRED' });
  }

  try {
    const { data: cliente, error: erroCliente } = await supabase.from('CLIENTES')
      .select('id, name, phone, mobile, email')
      .eq('tenant_id', STORE_TENANT).eq('id', customer_id).maybeSingle();
    if (erroCliente) throw erroCliente;
    if (!cliente) {
      return res.status(401).json({ error: 'Cadastro não encontrado. Entre novamente.', code: 'LOGIN_REQUIRED' });
    }

    const linhas = [];
    for (const item of itens) {
      const linha = await montarItem(item);
      if (linha.erro) return res.status(400).json({ error: linha.erro });
      linhas.push(linha);
    }

    const subtotal = linhas.reduce((s, i) => s + i.total, 0);
    // Retirada no local é frete zero, e não "frete que a tela mandou
    // zero": a regra é do servidor (§26).
    const freteValor = retirar ? 0 : Math.max(0, Number(frete) || 0);

    const rodape = [
      'PEDIDO PELO CATÁLOGO PERSONALIZADO',
      cep ? 'CEP: ' + cep : null,
      retirar ? 'Retirada no local' : null,
      data_evento ? 'Data do evento: ' + String(data_evento).split('-').reverse().join('/') : null,
      forma ? 'Forma escolhida pelo cliente: ' + String(forma).toUpperCase() : null,
      observacao ? 'Obs: ' + observacao : null,
    ].filter(Boolean).join('\n');

    // Os itens no formato que a loja e a produção já leem — um formato
    // só para os dois caminhos de compra.
    const itensPedido = linhas.map(l => ({
      product_id: l.product_id,
      product_name: l.nome,
      quantity: l.quantidade,
      unit_price: l.unitario,
      color: Object.values(l.configuracao.campos || {})[0] || null,
      print_name: l.configuracao.impressao || null,
      // A configuração inteira + o vetor aprovado viajam juntos até a
      // produção. Quem for gravar a tela lê a mesma coisa que o cliente
      // viu na hora de confirmar.
      design: { ...l.configuracao, arte: l.arte || null },
      // Sobe como campo próprio (e não só dentro do design) porque a
      // venda tem coluna para ele: é o que a produção lê para saber que
      // aquele copo leva borda prata, sem garimpar num JSON.
      adicionais: l.adicionais || [],
      preview: l.arte?.preview_url || null,
    }));

    const pedido = {
      tenant_id: STORE_TENANT,
      customer_id: cliente.id,
      customer: {
        name: cliente.name, phone: cliente.phone || cliente.mobile || null,
        email: cliente.email || null, company: null,
      },
      items: itensPedido,
      subtotal, freight: freteValor, total: subtotal + freteValor,
      notes: rodape,
      event_date: data_evento || null,
    };

    /**
     * COBRANÇA DE ZERO NÃO É COBRANÇA.
     *
     * `precoDoItem` devolve 0 quando o produto de referência do modelo
     * está sem preço de venda e sem tabela de faixas no cadastro. O
     * checkout seguia adiante assim mesmo: gerava um PIX sem valor (o
     * campo 54 do código nem chega a existir), a tela mostrava
     * "Total a pagar — R$ 0,00", e o cliente ficava esperando confirmar
     * um pagamento que ele não tem como fazer.
     *
     * Recusar aqui é o único fim honesto: um pedido de R$ 0,00 liberado
     * viraria uma venda de zero real no Comercial. O recado manda para o
     * atendente, que é quem consegue resolver — e o log diz ao pessoal
     * do ERP exatamente qual produto está sem preço.
     */
    // A TRAVA OLHA O COPO, NÃO O TOTAL. Desde que o adicional tem
    // preço próprio, um copo sem preço de tabela somado a uma borda de
    // R$ 0,50 daria total positivo e passaria por aqui — cobrando a
    // borda e dando o copo de graça. Basta uma linha sem preço para o
    // pedido inteiro não ser cobrável.
    const semPreco = linhas.filter(l => !(Number(l.unitario_base) > 0));
    if (pedido.total <= 0 || semPreco.length) {
      console.error('[catalogo:pagamento] pedido sem preço — produtos sem sale_price/price_tiers:',
        (semPreco.length ? semPreco : linhas)
          .map(l => `${l.configuracao?.codigo || '?'} x${l.quantidade}`).join(', '));
      return res.status(400).json({
        error: 'Não consegui calcular o valor deste pedido. Fale com um atendente para fecharmos por aqui.',
        code: 'SEM_PRECO',
      });
    }

    // Sem chave PIX configurada não há como cobrar: o pedido entra no
    // Comercial para o vendedor fechar por fora, em vez de a tela travar
    // com o carrinho montado.
    const cfgPix = await pixConfig(STORE_TENANT);
    if (!cfgPix.key) {
      const venda = await criarVendaDoPedido(pedido);
      return res.status(201).json({ modo: 'venda', numero: venda.number, itens: itensPedido.length });
    }

    const expira = new Date(Date.now() + PIX_VALIDADE_H * 3600 * 1000).toISOString();
    const { data: ped, error } = await supabase.from('PEDIDOS_LOJA').insert({
      ...pedido, status: 'aguardando_pagamento', expires_at: expira,
    }).select('id').single();
    if (error) throw error;

    const cobranca = await gerarCobrancaPix({ amount: pedido.total, txid: ped.id, cfg: cfgPix });
    await supabase.from('PEDIDOS_LOJA').update({
      pix_key: cobranca.key, pix_copy_paste: cobranca.copy_paste, pix_txid: cobranca.txid,
    }).eq('id', ped.id);

    res.status(201).json({
      modo: 'pagamento',
      pedido_id: ped.id,
      total: pedido.total,
      frete: freteValor,
      expira_em: expira,
      pix: {
        copia_e_cola: cobranca.copy_paste,
        qr_base64: cobranca.qr_base64,
        recebedor: cobranca.name || null,
      },
      itens: itensPedido.length,
    });
  } catch (err) { fail(res, err, 'pagamento'); }
});

// ── O assistente de arte (§22) ──────────────────────────────

// Cada pergunta à IA é uma chamada paga para fora. Teto por hora e por
// IP: sem ele, um laço no navegador de alguém vira conta no fim do mês.
const iaLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 40,
  message: { error: 'Muitas perguntas seguidas ao assistente. Tente daqui a pouco.' },
});

/**
 * "Alterar o nome Bruna para Maria."
 *
 * A IA NÃO DESENHA E NÃO CRIA CAMPO. Ela recebe os campos que a arte
 * abriu e os valores atuais, e devolve valores novos para esses mesmos
 * campos. Chave que não está na lista é descartada aqui — não adianta a
 * IA inventar "cor_do_fundo" se a arte não tem esse buraco.
 *
 * É o que permite quem nunca abriu um CorelDRAW montar a própria
 * personalização — sem virar uma porta para mexer no vetor da Lyon.
 */
router.post('/arte-ia', iaLimiter, async (req, res) => {
  const comando = String(req.body?.comando || '').trim().slice(0, 400);
  const campos = Array.isArray(req.body?.campos) ? req.body.campos.slice(0, 12) : [];
  const valores = req.body?.valores && typeof req.body.valores === 'object' ? req.body.valores : {};

  if (!comando) return res.status(400).json({ error: 'Diga o que você quer mudar.' });
  if (!campos.length) return res.status(400).json({ error: 'Escolha um modelo de arte primeiro.' });

  try {
    const { askClaude, extractJSON } = require('../lib/ai');

    const listaCampos = campos
      .map(c => `- ${c.key} ("${c.label}"${c.tipo ? `, tipo ${c.tipo}` : ''}${c.max ? `, até ${c.max} caracteres` : ''}) = ${JSON.stringify(valores[c.key] ?? '')}`)
      .join('\n');

    const r = await askClaude({
      system: [
        'Você ajuda um cliente a preencher os campos de texto de uma arte personalizada de copo (Lyon Copos).',
        'Você NÃO desenha nada e NÃO cria campos: apenas devolve novos valores para os campos existentes.',
        'Responda APENAS um JSON válido, sem texto fora dele, no formato:',
        '{"valores":{"chave":"novo valor"},"resposta":"uma frase curta em português dizendo o que você mudou"}',
        'Inclua em "valores" SOMENTE os campos que devem mudar. Se o pedido não for claro, devolva "valores" vazio e explique em "resposta".',
        'Datas em português no formato DD/MM/AAAA. Respeite o limite de caracteres de cada campo.',
      ].join(' '),
      prompt: `Campos da arte (chave, rótulo e valor atual):\n${listaCampos}\n\nPedido do cliente: ${comando}`,
      max_tokens: 400,
    });
    if (!r.ok) return res.status(400).json({ error: r.error });

    const saida = extractJSON(r.text) || {};
    const permitidas = new Set(campos.map(c => c.key));
    const limite = Object.fromEntries(campos.map(c => [c.key, Number(c.max) || 60]));

    const limpos = {};
    for (const [k, v] of Object.entries(saida.valores || {})) {
      if (!permitidas.has(k)) continue;
      limpos[k] = String(v ?? '').slice(0, limite[k]);
    }

    res.json({
      valores: limpos,
      resposta: String(saida.resposta || '').slice(0, 300) || null,
    });
  } catch (err) { fail(res, err, 'arte-ia'); }
});

module.exports = router;
