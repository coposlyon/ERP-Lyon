// ============================================================
// O QUE OS ADICIONAIS ACRESCENTAM NUMA PEÇA.
//
// POR QUE ISTO É UMA BIBLIOTECA E NÃO CÓDIGO DENTRO DA ROTA. Três
// lugares precisam da mesma resposta e não podem discordar: a
// Engenharia de Custos (quanto o copo custa), o catálogo (o que a
// cliente pode escolher) e o pedido (quanto cobrar). Se cada um
// somasse por conta própria, o preço da tela deixaria de bater com o
// preço da nota — e a diferença só apareceria no fechamento do mês.
//
// A REGRA DAS TRÊS CAMADAS. Um item pode valer para todo o catálogo
// personalizado (os dois alvos nulos), para uma categoria, ou para um
// produto. O mais específico ganha: é assim que se abre exceção num
// copo sem reescrever a regra da categoria inteira.
// ============================================================
const supabase = require('../config/supabase');

const n6 = v => Math.round((Number(v) || 0) * 1e6) / 1e6;

// Produto > categoria > curinga. O número é só para comparar.
const peso = a => (a.product_id ? 3 : a.category_id ? 2 : 1);

/**
 * Os adicionais que valem para um produto, já com custo e preço na peça.
 *
 * Devolve lista vazia — nunca lança — quando a migração 099 ainda não
 * rodou. Um sistema que quebra a tela de custo inteira porque uma
 * tabela nova não existe é pior do que um que mostra o custo sem os
 * adicionais.
 */
async function adicionaisDoProduto(tenantId, productId, categoryId = null) {
  try {
    let cat = categoryId;
    if (cat === null && productId) {
      const { data: p } = await supabase.from('PRODUTOS')
        .select('category_id').eq('id', productId).eq('tenant_id', tenantId).maybeSingle();
      cat = p?.category_id || null;
    }

    // O `or` do PostgREST não aceita um uuid nulo do lado direito de
    // `eq`; sem categoria, o filtro da categoria simplesmente não entra.
    const filtros = ['and(product_id.is.null,category_id.is.null)'];
    if (productId) filtros.push(`product_id.eq.${productId}`);
    if (cat)       filtros.push(`category_id.eq.${cat}`);

    const { data, error } = await supabase.from('ITEM_APLICACOES')
      .select('*, ITENS(*)')
      .eq('tenant_id', tenantId)
      .or(filtros.join(','));
    if (error) throw error;

    const porItem = new Map();
    for (const a of data || []) {
      const atual = porItem.get(a.item_id);
      if (!atual || peso(a) > peso(atual)) porItem.set(a.item_id, a);
    }

    return [...porItem.values()]
      .filter(a => a.ITENS && a.ITENS.is_active)
      .map(a => {
        const consumo = Number(a.consumo ?? a.ITENS.consumo) || 1;
        return {
          aplicacao_id: a.id,
          item_id: a.item_id,
          padrao: a.padrao === true,
          origem: a.product_id ? 'produto' : a.category_id ? 'categoria' : 'todos',
          consumo,
          item: a.ITENS,
          custo: n6(Number(a.ITENS.unit_cost) * consumo),
          preco: n6(Number(a.ITENS.unit_price) * consumo),
        };
      })
      .sort((x, y) => (y.padrao - x.padrao) || x.item.name.localeCompare(y.item.name, 'pt-BR'));
  } catch {
    return [];   // migração 099 pendente — o resto da tela continua de pé
  }
}

/**
 * SÓ O QUE JÁ ESTÁ NO PREÇO entra no custo do produto.
 *
 * O canudo opcional não pode entrar aqui: encarecer o copo de quem não
 * pediu canudo é o erro que faz o preço de tabela subir sozinho. Ele
 * entra no PEDIDO, quando a cliente marca.
 */
async function custoDosAdicionaisPadrao(tenantId, productId, categoryId = null) {
  const lista = await adicionaisDoProduto(tenantId, productId, categoryId);
  const padroes = lista.filter(a => a.padrao);
  return {
    custo: n6(padroes.reduce((s, a) => s + a.custo, 0)),
    preco: n6(padroes.reduce((s, a) => s + a.preco, 0)),
    itens: padroes,
    opcionais: lista.filter(a => !a.padrao),
  };
}

module.exports = { adicionaisDoProduto, custoDosAdicionaisPadrao };
