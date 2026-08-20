// ============================================================
// A FICHA DE CATÁLOGO DE UM PRODUTO.
//
// O QUE ESTE ARQUIVO EXISTE PARA GARANTIR: que exista UM cadastro de
// produto. O que o cliente vê no catálogo — quais acabamentos, quais
// cores em cada campo, que impressão, o mínimo, a caixa do liso e o
// gabarito da arte — é atributo do produto mestre, editado na mesma
// tela em que se cadastra o produto. Não há um "cadastro do catálogo"
// paralelo, e é por isso que não existe o dia em que os dois discordam.
//
// HERDAR É O NORMAL, A EXCEÇÃO É O CONTRÁRIO.
//
// Quase toda regra é da CATEGORIA inteira: "todo Long Drink aceita
// degradê". O produto entra só para a exceção: "este aqui não". Por isso
// cada item tem TRÊS estados, e não dois:
//
//     herdar   → segue a categoria (o normal; nenhuma linha é gravada)
//     permitir → abre só neste produto
//     bloquear → fecha só neste produto, mesmo com a categoria aberta
//
// Um checkbox de dois estados obrigaria a repetir, produto por produto,
// tudo que a categoria já resolveu — e no dia em que a fábrica parasse
// de fazer borda seriam 97 produtos para desmarcar em vez de uma linha
// de categoria.
//
// A LEITURA É A MESMA DO CLIENTE. `efetivo()` aqui embaixo aplica a
// mesma precedência que `configDoModelo` aplica no catálogo público. Duas
// contas diferentes para a mesma pergunta seria a tela do Administrativo
// prometendo uma coisa e o site mostrando outra.
// ============================================================
const supabase = require('../config/supabase');
const {
  partesDoNome, nomeDaCategoria, nomeDoAcabamento, nomeComercial, capitalizar,
} = require('./catalogo');

const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

/** Os três estados, em texto, para a tela e para o corpo do PUT. */
const HERDAR = 'herdar';
const PERMITIR = 'permitir';
const BLOQUEAR = 'bloquear';

/**
 * O que vale de verdade para este item.
 *
 * Regra do produto vence a da categoria; sem nenhuma das duas, é não.
 * Devolve também DE ONDE veio, porque a tela precisa poder dizer
 * "permitido pela categoria" em vez de deixar o usuário adivinhar por
 * que a caixa está marcada.
 */
function efetivo(daCategoria, doProduto) {
  if (doProduto === true) return { permitido: true, origem: 'produto' };
  if (doProduto === false) return { permitido: false, origem: 'produto' };
  return { permitido: !!daCategoria, origem: daCategoria ? 'categoria' : 'nenhum' };
}

const estadoDe = doProduto =>
  doProduto === true ? PERMITIR : doProduto === false ? BLOQUEAR : HERDAR;

/** { "<uuid>": true|false } com o que a matriz diz para um alvo. */
function mapaDaMatriz(linhas, tipo, campo, alvo) {
  const saida = {};
  for (const l of linhas || []) {
    if (l.tipo !== tipo || l[campo] !== alvo) continue;
    saida[l.ref_id] = !!l.permitido;
  }
  return saida;
}

/**
 * Tudo que a aba "Catálogo personalizado" do cadastro precisa mostrar.
 *
 * Uma resposta só, com as opções que existem, o que está marcado e de
 * onde cada marcação vem. A tela desenha — ela não sabe o que é degradê
 * nem o que é borda, e é assim que acabamento novo aparece no cadastro
 * sem deploy.
 */
async function fichaDoProduto(tenantId, productId) {
  const { data: produto, error: erroProd } = await supabase.from('PRODUTOS')
    .select('id, name, code, category_id, ink_type, min_order_qty, is_active, show_in_store, unit')
    .eq('tenant_id', tenantId).eq('id', productId).maybeSingle();
  if (erroProd) throw erroProd;
  if (!produto) return { erro: 'Produto não encontrado' };

  // `show_in_catalogo` é a coluna da migração 077. Enquanto ela não
  // rodar, a ficha continua abrindo — só sem a chave de publicação, e a
  // tela avisa. Derrubar o cadastro inteiro por causa de uma coluna
  // nova seria pior que a falta dela.
  let publicado = null;
  {
    const { data, error } = await supabase.from('PRODUTOS')
      .select('show_in_catalogo').eq('tenant_id', tenantId).eq('id', productId).maybeSingle();
    if (!error) publicado = data?.show_in_catalogo !== false;
  }

  const categoryId = produto.category_id || null;
  const partes = partesDoNome(produto.name);

  const [catRes, acabRes, coresRes, procRes, compatRes, gabRes, embRes, famRes, famItensRes] =
    await Promise.all([
      categoryId
        ? supabase.from('CATEGORIAS').select('id, name, nome_catalogo')
            .eq('tenant_id', tenantId).eq('id', categoryId).maybeSingle()
        : Promise.resolve({ data: null }),
      supabase.from('CONFIG_ACABAMENTOS')
        .select('id, name, seq, label_comercial, campos, no_catalogo, requer_pintura, requer_borda, requer_jateamento')
        .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
      supabase.from('CONFIG_CORES').select('id, name, grupo, hex, seq')
        .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
      supabase.from('CONFIG_PROCESSOS').select('id, name, max_cores, seq, linha_tinta')
        .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
      supabase.from('PRODUTO_COMPATIBILIDADE')
        .select('tipo, ref_id, permitido, category_id, product_id')
        .eq('tenant_id', tenantId),
      supabase.from('CATALOGO_GABARITOS')
        .select('id, category_id, product_id, altura_mm, largura_mm, margem_mm, permite_verso, observacao')
        .eq('tenant_id', tenantId),
      supabase.from('CATALOGO_EMBALAGEM')
        .select('id, category_id, product_id, caixa_qtd, max_cores_caixa, min_caixas')
        .eq('tenant_id', tenantId),
      supabase.from('CATALOGO_FAMILIAS').select('id, name, slug, seq')
        .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
      supabase.from('CATALOGO_FAMILIA_ITENS').select('familia_id, category_id, product_id')
        .eq('tenant_id', tenantId),
    ]);

  // Configuração técnica ausente (074/076 ainda não rodaram) não é erro
  // do usuário: a aba abre explicando o que falta.
  const falha = [acabRes, coresRes, procRes, compatRes].find(r => r?.error);
  if (falha && tabelaAusente(falha.error)) return { config_ausente: true };
  if (falha) throw falha.error;

  const compat = compatRes.data || [];
  const catAcab = mapaDaMatriz(compat, 'acabamento', 'category_id', categoryId);
  const catCor = mapaDaMatriz(compat, 'cor', 'category_id', categoryId);
  const catProc = mapaDaMatriz(compat, 'processo', 'category_id', categoryId);
  const prodAcab = mapaDaMatriz(compat, 'acabamento', 'product_id', productId);
  const prodCor = mapaDaMatriz(compat, 'cor', 'product_id', productId);
  const prodProc = mapaDaMatriz(compat, 'processo', 'product_id', productId);

  const categoria = catRes?.data || null;
  const base = nomeDaCategoria(categoria);

  const acabamentos = (acabRes.data || []).map(a => {
    const e = efetivo(catAcab[a.id], prodAcab[a.id]);
    return {
      id: a.id,
      nome: nomeDoAcabamento(a),
      nome_interno: a.name,
      // O nome que o cliente vai ler no card, montado com este produto —
      // a melhor forma de conferir se a combinação faz sentido é ver o
      // nome que ela gera.
      nome_comercial: nomeComercial(base, a, partes.capacidade),
      campos: Array.isArray(a.campos) ? a.campos : [],
      no_catalogo: a.no_catalogo !== false,
      requer: { pintura: a.requer_pintura, borda: a.requer_borda, jateamento: a.requer_jateamento },
      estado: estadoDe(prodAcab[a.id]),
      herdado: catAcab[a.id] === true,
      ...e,
    };
  });

  // As cores vêm agrupadas por ONDE se aplicam. Cor de borda não é cor de
  // pintura nem cor de personalização, e a tela precisa desenhar uma
  // lista por campo — não uma lista só com 60 cores misturadas.
  const cores = {};
  for (const c of coresRes.data || []) {
    const e = efetivo(catCor[c.id], prodCor[c.id]);
    (cores[c.grupo] = cores[c.grupo] || []).push({
      id: c.id, name: capitalizar(c.name), hex: c.hex || null,
      estado: estadoDe(prodCor[c.id]),
      herdado: catCor[c.id] === true,
      ...e,
    });
  }

  const processos = (procRes.data || []).map(p => {
    const e = efetivo(catProc[p.id], prodProc[p.id]);
    return {
      id: p.id, nome: p.name, max_cores: p.max_cores,
      linha_tinta: p.linha_tinta || null,
      // A química tem que casar com o material do copo. Um processo de
      // tinta PP num copo PS é incompatível de fábrica, e a tela marca
      // isso em vez de deixar alguém liberar e descobrir na produção.
      incompativel: !!(p.linha_tinta && produto.ink_type && p.linha_tinta !== produto.ink_type),
      estado: estadoDe(prodProc[p.id]),
      herdado: catProc[p.id] === true,
      ...e,
    };
  });

  const familias = (famRes.data || []).map(f => {
    const itens = (famItensRes.data || []).filter(i => i.familia_id === f.id);
    const porCategoria = itens.some(i => i.category_id && i.category_id === categoryId);
    const porProduto = itens.some(i => i.product_id === productId);
    return {
      id: f.id, nome: f.name, slug: f.slug,
      via: porCategoria ? 'categoria' : porProduto ? 'produto' : null,
      vinculada: porCategoria || porProduto,
    };
  });

  return {
    produto: {
      id: produto.id,
      nome: produto.name,
      codigo: produto.code,
      unidade: produto.unit,
      categoria: categoria?.name || null,
      categoria_id: categoryId,
      nome_vitrine: base,
      capacidade: partes.capacidade,
      cor: partes.cor ? capitalizar(partes.cor) : null,
      linha: produto.ink_type || null,
      qtd_minima: Math.max(1, Number(produto.min_order_qty) || 1),
      is_active: produto.is_active !== false,
      show_in_store: produto.show_in_store !== false,
      show_in_catalogo: publicado,
      // O nome que o cliente lê enquanto nenhum acabamento foi escolhido.
      nome_catalogo: nomeComercial(base, null, partes.capacidade),
    },
    coluna_publicacao: publicado !== null,
    acabamentos,
    cores,
    processos,
    familias,
    gabarito: regraDoAlvo(gabRes.data, categoryId, productId, {
      altura_mm: null, largura_mm: null, margem_mm: 2, permite_verso: true, observacao: null,
    }),
    embalagem: regraDoAlvo(embRes.data, categoryId, productId, {
      caixa_qtd: 100, max_cores_caixa: 4, min_caixas: 1,
    }),
  };
}

/**
 * A regra que vale para este produto, e de onde ela vem.
 *
 * Igual ao `escolherPorAlvo` do catálogo público, mas devolvendo também
 * a regra da CATEGORIA por baixo — a tela precisa mostrar "hoje herda
 * 45 × 120 mm da categoria" antes de o usuário decidir se quer uma
 * medida própria.
 */
function regraDoAlvo(linhas, categoryId, productId, padrao) {
  const lista = linhas || [];
  const doProduto = lista.find(l => l.product_id === productId) || null;
  const daCategoria = lista.find(l => l.category_id && l.category_id === categoryId) || null;
  const vigente = doProduto || daCategoria || { ...padrao, padrao: true };
  return {
    ...vigente,
    origem: doProduto ? 'produto' : daCategoria ? 'categoria' : 'padrao',
    proprio: !!doProduto,
    // O que ele passaria a herdar se o override do produto fosse removido.
    herdado: daCategoria ? { ...daCategoria } : null,
  };
}

// ── Gravação ────────────────────────────────────────────────

/**
 * Grava a ficha de catálogo do produto.
 *
 * SÓ MEXE NO QUE A TELA MANDOU. Salvar o gabarito não pode apagar os
 * acabamentos — é a mesma razão de o PUT de produto só incluir os campos
 * enviados. Um "salvar" que zera o que não estava na tela é como se perde
 * cadastro sem ninguém entender por quê.
 *
 * HERDAR APAGA A LINHA. Voltar um item para "herdar" não grava
 * `permitido = null`: remove a exceção. Assim a matriz continua tendo só
 * o que é exceção de verdade, e a regra da categoria volta a valer
 * sozinha no dia em que mudar.
 */
async function gravarFicha(tenantId, productId, corpo = {}) {
  const { data: produto, error } = await supabase.from('PRODUTOS')
    .select('id, name, category_id').eq('tenant_id', tenantId).eq('id', productId).maybeSingle();
  if (error) throw error;
  if (!produto) return { erro: 'Produto não encontrado' };

  // A REGRA VALE PARA O MODELO INTEIRO, e não só para esta linha do
  // cadastro. No catálogo o cliente escolhe "Long Drink 350 ml" e
  // depois a cor; no cadastro cada COR é um produto. Gravar a exceção
  // só na cor aberta na tela produziria um modelo em que metade das
  // cores aceita Jateado e a outra metade não — e o catálogo, que lê o
  // modelo, teria que escolher uma das duas respostas no par ou ímpar.
  //
  // Por isso a exceção é replicada nas cores irmãs: o dado fica
  // coerente com a pergunta que o site faz.
  const alvos = await coresDoModelo(tenantId, produto);

  for (const [tipo, chave] of [['acabamento', 'acabamentos'], ['cor', 'cores'], ['processo', 'processos']]) {
    if (corpo[chave] === undefined) continue;
    await gravarMatriz(tenantId, alvos, tipo, corpo[chave] || {});
  }

  if (corpo.gabarito !== undefined) {
    await gravarRegra(tenantId, alvos, 'CATALOGO_GABARITOS', corpo.gabarito, g => ({
      altura_mm: Number(g.altura_mm) || 0,
      largura_mm: Number(g.largura_mm) || 0,
      margem_mm: Number(g.margem_mm) || 2,
      permite_verso: g.permite_verso !== false,
      observacao: g.observacao || null,
    }), g => (Number(g.altura_mm) > 0 && Number(g.largura_mm) > 0));
  }

  if (corpo.embalagem !== undefined) {
    await gravarRegra(tenantId, alvos, 'CATALOGO_EMBALAGEM', corpo.embalagem, e => ({
      caixa_qtd: Math.max(1, Number(e.caixa_qtd) || 100),
      max_cores_caixa: Math.max(1, Number(e.max_cores_caixa) || 4),
      min_caixas: Math.max(1, Number(e.min_caixas) || 1),
    }));
  }

  // A família é o único bloco que fica SÓ neste produto: vincular uma
  // cor avulsa a uma família da vitrine é caso legítimo, e espalhar
  // para as irmãs seria decidir por quem não pediu.
  if (Array.isArray(corpo.familias)) {
    await gravarFamilias(tenantId, productId, corpo.familias);
  }

  return { ok: true, produtos: alvos.length };
}

/**
 * As cores irmãs deste produto — a mesma leitura de "modelo" que o
 * catálogo usa: mesma categoria, mesma capacidade lida do nome.
 *
 * Sem categoria não há modelo: a regra fica só neste produto, que é o
 * melhor que dá para fazer sem inventar um agrupamento.
 */
async function coresDoModelo(tenantId, produto) {
  if (!produto.category_id) return [produto.id];

  const alvo = partesDoNome(produto.name).capacidade || null;
  const { data, error } = await supabase.from('PRODUTOS')
    .select('id, name').eq('tenant_id', tenantId)
    .eq('category_id', produto.category_id).eq('is_active', true);
  if (error) throw error;

  const ids = (data || [])
    .filter(p => (partesDoNome(p.name).capacidade || null) === alvo)
    .map(p => p.id);
  return ids.length ? ids : [produto.id];
}

/**
 * As exceções deste produto num tipo (acabamento, cor ou processo).
 *
 * Apaga o que havia e regrava só o que não é "herdar" — reescrever o
 * bloco inteiro é o que evita a linha órfã que sobra quando alguém
 * desmarca algo e o código só sabe inserir.
 */
async function gravarMatriz(tenantId, produtoIds, tipo, estados) {
  const { error: erroDel } = await supabase.from('PRODUTO_COMPATIBILIDADE')
    .delete().eq('tenant_id', tenantId).in('product_id', produtoIds).eq('tipo', tipo);
  if (erroDel) throw erroDel;

  const linhas = [];
  for (const [refId, estado] of Object.entries(estados)) {
    // HERDAR (ou qualquer outra coisa) não vira linha — é a ausência de
    // exceção, e é o que devolve o produto para a regra da categoria.
    if (estado !== PERMITIR && estado !== BLOQUEAR) continue;
    for (const productId of produtoIds) {
      linhas.push({
        tenant_id: tenantId, product_id: productId, category_id: null,
        tipo, ref_id: refId, permitido: estado === PERMITIR,
      });
    }
  }
  if (!linhas.length) return;

  // Um modelo com 24 cores × 14 acabamentos passa de trezentas linhas.
  // Em lotes porque a API tem teto de tamanho de corpo — e um insert que
  // falha por tamanho falharia justamente no cadastro mais completo.
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('PRODUTO_COMPATIBILIDADE').insert(linhas.slice(i, i + 500));
    if (error) throw error;
  }
}

/**
 * O gabarito ou a caixa próprios deste produto.
 *
 * `null` remove o override e devolve o produto para a regra da
 * categoria. É o botão "voltar a herdar" da tela, e ele precisa existir:
 * sem ele, quem criasse uma exceção por engano ficaria preso a ela.
 */
async function gravarRegra(tenantId, produtoIds, tabela, valor, montar, valido = () => true) {
  // Reescreve do zero: apaga o que houver nas cores do modelo e grava de
  // novo. Atualizar linha a linha deixaria órfã a cor que tinha exceção
  // e não foi mencionada desta vez.
  const { error: erroDel } = await supabase.from(tabela)
    .delete().eq('tenant_id', tenantId).in('product_id', produtoIds);
  if (erroDel) throw erroDel;

  // `null` é o "voltar a herdar": some a exceção e vale a categoria.
  if (!valor) return;
  if (!valido(valor)) return { erro: 'Valores inválidos' };

  const campos = montar(valor);
  const { error } = await supabase.from(tabela).insert(
    produtoIds.map(product_id => ({ tenant_id: tenantId, product_id, category_id: null, ...campos })));
  if (error) throw error;
}

/**
 * Os vínculos avulsos de família deste produto.
 *
 * Só mexe nos vínculos POR PRODUTO. Se a família já pega o produto pela
 * categoria inteira, isso continua valendo e não é apagado daqui —
 * apagar seria tirar da vitrine os outros 96 produtos da categoria
 * porque alguém salvou a ficha de um.
 */
async function gravarFamilias(tenantId, productId, familiaIds) {
  const { error: erroDel } = await supabase.from('CATALOGO_FAMILIA_ITENS')
    .delete().eq('tenant_id', tenantId).eq('product_id', productId);
  if (erroDel) throw erroDel;

  const linhas = [...new Set(familiaIds.filter(Boolean))]
    .map((id, i) => ({ tenant_id: tenantId, familia_id: id, product_id: productId, category_id: null, seq: (i + 1) * 10 }));
  if (!linhas.length) return;

  const { error } = await supabase.from('CATALOGO_FAMILIA_ITENS').insert(linhas);
  if (error) throw error;
}

module.exports = { fichaDoProduto, gravarFicha, HERDAR, PERMITIR, BLOQUEAR };
