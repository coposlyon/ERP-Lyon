// ============================================================
// O MESMO COPO, DUAS CONFIGURACOES DE VENDA.
//
// O Long Drink 350 ml e vendido nos dois lugares, e e o MESMO produto:
// mesmo codigo, mesmo estoque, mesma ficha de custo. So que ele nao se
// vende igual nos dois — na loja e unidade avulsa com preco de
// prateleira; no catalogo e caixa fechada, com minimo alto e um preco
// que ja embute a personalizacao.
//
// Ate a migracao 094 as duas vitrines liam as MESMAS colunas de
// PRODUTOS: mudar o preco do catalogo mudava o preco da loja no mesmo
// instante, e pedir minimo de 100 no personalizado exigia 100 tambem de
// quem so queria um copo liso.
//
// NULO E HERDAR, E ESSE E O PONTO. Cada campo em PRODUTO_AMBIENTE e uma
// EXCECAO. Sem linha — que e a situacao dos 97 copos hoje — vale o
// cadastro mestre, e continua valendo quando o cadastro mudar amanha.
// Quem quiser um preco so no catalogo preenche UM campo; o resto segue
// o mestre sozinho. E a mesma regra de heranca que a ficha de catalogo
// do produto ja usa (lib/produtoCatalogo.js), pelo mesmo motivo: repetir
// produto a produto o que o cadastro ja resolve e o que faz 97 telas
// para desmarcar no dia em que a regra muda.
//
// ONDE ISTO E APLICADO. Nos dois gargalos por onde toda leitura de
// vitrine passa: `produtosPublicados()` em lib/catalogo.js e
// `prepararParaLoja()` em routes/public-store.js. Espalhar a aplicacao
// pelos endpoints seria garantir que um deles fica de fora e mostra o
// preco errado.
// ============================================================
const supabase = require('../config/supabase');

/** Os dois ambientes de venda que existem hoje. */
const AMBIENTES = ['loja', 'catalogo'];

/**
 * O que cada ambiente pode ter de proprio.
 *
 * A lista e curta de proposito. Nome, codigo, categoria, unidade e
 * estoque NAO entram: sao do produto, nao da vitrine, e um copo que se
 * chama diferente em cada site e um copo que ninguem consegue conferir
 * no romaneio.
 */
const CAMPOS = ['sale_price', 'price_tiers', 'min_order_qty', 'image_url', 'description'];

const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

/**
 * Aplica, sobre os produtos, o que o ambiente tem de proprio.
 *
 * Muta a lista recebida e a devolve — e o mesmo contrato do
 * `attachFichaPricing` da loja, para os dois poderem ser encadeados sem
 * ninguem precisar lembrar de reatribuir.
 *
 * SO SOBRESCREVE O QUE A VITRINE PEDIU. Se o select nao trouxe
 * `min_order_qty`, o ajuste de minimo nao inventa o campo: aquela tela
 * nao usa minimo, e injetar um valor que ninguem pediu e como um dado
 * aparece do nada duas telas depois.
 *
 * ENQUANTO A 094 NAO RODAR, devolve os produtos como vieram. A loja nao
 * pode ficar fora do ar esperando migracao — sem a tabela, todo mundo
 * herda o cadastro, que e exatamente o comportamento de antes.
 */
async function aplicarAmbiente(tenantId, produtos, ambiente) {
  const lista = Array.isArray(produtos) ? produtos : [produtos];
  const ids = [...new Set(lista.filter(Boolean).map(p => p.id).filter(Boolean))];
  if (!ids.length || !AMBIENTES.includes(ambiente)) return produtos;

  const { data, error } = await supabase.from('PRODUTO_AMBIENTE')
    .select(`product_id, ${CAMPOS.join(', ')}`)
    .eq('tenant_id', tenantId).eq('ambiente', ambiente).in('product_id', ids);

  if (error) {
    if (tabelaAusente(error)) return produtos;
    throw error;
  }
  if (!data?.length) return produtos;

  const porProduto = new Map(data.map(r => [r.product_id, r]));
  for (const p of lista) {
    const ajuste = p && porProduto.get(p.id);
    if (!ajuste) continue;
    for (const campo of CAMPOS) {
      if (!(campo in p)) continue;                       // a vitrine nao pediu
      if (ajuste[campo] === null || ajuste[campo] === undefined) continue;  // herda
      p[campo] = ajuste[campo];
    }
  }
  return produtos;
}

/**
 * Os ajustes de um produto nos dois ambientes, para a tela de cadastro.
 *
 * Devolve tambem o valor MESTRE de cada campo, porque a tela precisa
 * poder escrever "hoje herda R$ 1,44 do cadastro" antes de a pessoa
 * decidir se quer um preco proprio. Um campo vazio sem essa referencia
 * obriga a abrir outra aba para saber o que ele vale.
 */
async function ajustesDoProduto(tenantId, productId) {
  const { data: produto, error: erroProd } = await supabase.from('PRODUTOS')
    .select(`id, name, code, show_in_store, show_in_catalogo, ${CAMPOS.join(', ')}`)
    .eq('tenant_id', tenantId).eq('id', productId).maybeSingle();
  if (erroProd) throw erroProd;
  if (!produto) return { erro: 'Produto nao encontrado' };

  const mestre = Object.fromEntries(CAMPOS.map(c => [c, produto[c] ?? null]));

  let linhas = [];
  const { data, error } = await supabase.from('PRODUTO_AMBIENTE')
    .select(`ambiente, ${CAMPOS.join(', ')}`)
    .eq('tenant_id', tenantId).eq('product_id', productId);
  if (error && !tabelaAusente(error)) throw error;
  if (error) return { tabela_ausente: true, mestre, ambientes: vazio(mestre) };
  linhas = data || [];

  const ambientes = {};
  for (const nome of AMBIENTES) {
    const linha = linhas.find(l => l.ambiente === nome) || {};
    ambientes[nome] = Object.fromEntries(CAMPOS.map(campo => {
      const proprio = linha[campo] ?? null;
      return [campo, {
        valor: proprio,
        proprio: proprio !== null,
        // O que vale de fato nesta vitrine agora.
        efetivo: proprio !== null ? proprio : mestre[campo],
      }];
    }));
  }

  return {
    produto: {
      id: produto.id, nome: produto.name, codigo: produto.code,
      na_loja: produto.show_in_store !== false,
      no_catalogo: produto.show_in_catalogo === true,
    },
    mestre,
    ambientes,
    campos: CAMPOS,
  };
}

const vazio = mestre => Object.fromEntries(AMBIENTES.map(a => [a,
  Object.fromEntries(CAMPOS.map(c => [c, { valor: null, proprio: false, efetivo: mestre[c] }]))]));

/**
 * Grava os ajustes de UM ambiente.
 *
 * VAZIO E VOLTAR A HERDAR, e nao gravar zero. String vazia, null e
 * undefined viram NULL — e uma linha sem nenhuma excecao e apagada, para
 * a tabela guardar so o que e excecao de verdade. Sem isso ela encheria
 * de linhas de nulos e ninguem conseguiria responder "quais produtos tem
 * preco proprio no catalogo?" sem ler todas.
 *
 * SO MEXE NO QUE A TELA MANDOU: campo ausente do corpo fica como estava.
 * Salvar o preco nao pode apagar a foto.
 */
async function gravarAjustes(tenantId, productId, ambiente, corpo = {}) {
  if (!AMBIENTES.includes(ambiente)) return { erro: 'Ambiente invalido' };

  const { data: existente, error: erroLer } = await supabase.from('PRODUTO_AMBIENTE')
    .select(`id, ${CAMPOS.join(', ')}`)
    .eq('tenant_id', tenantId).eq('product_id', productId).eq('ambiente', ambiente).maybeSingle();
  if (erroLer && !tabelaAusente(erroLer)) throw erroLer;
  if (erroLer) return { erro: 'A migracao 094 ainda nao rodou nesta base.' };

  const linha = {};
  for (const campo of CAMPOS) {
    if (!(campo in corpo)) {                       // nao veio: fica como estava
      linha[campo] = existente ? existente[campo] : null;
      continue;
    }
    linha[campo] = normalizar(campo, corpo[campo]);
  }

  const virou = CAMPOS.every(c => linha[c] === null);

  if (virou) {
    if (!existente) return { ok: true, herdando: true };
    const { error } = await supabase.from('PRODUTO_AMBIENTE').delete().eq('id', existente.id);
    if (error) throw error;
    return { ok: true, herdando: true };
  }

  if (existente) {
    const { error } = await supabase.from('PRODUTO_AMBIENTE')
      .update({ ...linha, updated_at: new Date().toISOString() }).eq('id', existente.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('PRODUTO_AMBIENTE')
      .insert({ tenant_id: tenantId, product_id: productId, ambiente, ...linha });
    if (error) throw error;
  }
  return { ok: true, herdando: false };
}

/** Vazio vira NULL (= herda). O resto vira o tipo que a coluna espera. */
function normalizar(campo, valor) {
  if (valor === null || valor === undefined || valor === '') return null;
  if (campo === 'sale_price') {
    const n = Number(valor);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (campo === 'min_order_qty') {
    const n = parseInt(valor, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (campo === 'price_tiers') {
    if (!Array.isArray(valor) || !valor.length) return null;
    return valor;
  }
  return String(valor).trim() || null;
}

/**
 * O mesmo ajuste em varios produtos de uma vez.
 *
 * Existe porque a Lyon tem 97 copos e uma regra so: "no catalogo o
 * minimo e 100". Fazer isso produto a produto sao 97 formularios, e o
 * numero 42 sai errado. Devolve quantos foram tocados.
 */
async function gravarEmLote(tenantId, productIds, ambiente, corpo = {}) {
  let tocados = 0;
  for (const id of [...new Set(productIds || [])].filter(Boolean)) {
    const r = await gravarAjustes(tenantId, id, ambiente, corpo);
    if (r.erro) return { erro: r.erro, tocados };
    tocados++;
  }
  return { ok: true, tocados };
}

module.exports = { AMBIENTES, CAMPOS, aplicarAmbiente, ajustesDoProduto, gravarAjustes, gravarEmLote };
