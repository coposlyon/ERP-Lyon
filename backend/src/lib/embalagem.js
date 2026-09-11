// ============================================================
// DE ITENS DO PEDIDO PARA CAIXAS — o que a cubagem precisa saber.
//
// A Total Express não cobra por copo: cobra pelo peso e pelo espaço que
// a carga ocupa no caminhão. Entre "500 canecas" e o frete existe uma
// pergunta que ninguém tinha respondido no ERP: em quantas caixas isso
// viaja, e que tamanho tem cada uma.
//
// CATALOGO_EMBALAGEM já sabia metade — `caixa_qtd` diz quantas unidades
// cabem numa caixa daquela categoria (100, hoje, para todas as sete). A
// migração 118 acrescentou a outra metade: altura, largura, comprimento
// e tara da caixa.
//
// O CÁLCULO NÃO CHUTA. Categoria sem medida cadastrada não vira "caixa
// de tamanho médio": vira `sem_medida`, e a cotação diz que não sabe.
// Um palpite de cubagem erra o frete para mais ou para menos, e quem
// descobre o erro é a fatura do fim do mês.
// ============================================================
const supabase = require('../config/supabase');
const { pesoCubado } = require('./totalexpress');

/**
 * Agrupa os itens por regra de embalagem e devolve peso e cubagem.
 *
 * @param itens [{ product_id, quantity }]
 * @returns {
 *   ok, peso_real, peso_cubado, caixas,
 *   sem_peso[], sem_medida[],   ← o que falta cadastrar, por nome
 *   detalhe[]
 * }
 */
async function medirPedido(tenantId, itens = []) {
  const ids = [...new Set(itens.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return vazio('Pedido sem itens com produto identificado.');

  const { data: produtos } = await supabase.from('PRODUTOS')
    .select('id, name, weight, category_id')
    .eq('tenant_id', tenantId).in('id', ids);

  const porId = new Map((produtos || []).map(p => [p.id, p]));

  // As regras de embalagem: a do produto tem prioridade sobre a da
  // categoria, porque é a mais específica que alguém se deu ao trabalho
  // de cadastrar.
  const { data: regras } = await supabase.from('CATALOGO_EMBALAGEM')
    .select('category_id, product_id, caixa_qtd, min_caixas, caixa_altura, caixa_largura, caixa_comprimento, caixa_tara')
    .eq('tenant_id', tenantId);

  const porProduto = new Map((regras || []).filter(r => r.product_id).map(r => [r.product_id, r]));
  const porCategoria = new Map((regras || []).filter(r => !r.product_id && r.category_id).map(r => [r.category_id, r]));

  let pesoReal = 0, pesoCub = 0, caixas = 0;
  const semPeso = [], semMedida = [], detalhe = [];

  // Os itens são agrupados pela REGRA, e não pelo produto: duas canecas
  // diferentes da mesma categoria viajam na mesma caixa, e contá-las
  // separado inventaria uma caixa a mais em cada pedido misto.
  const porRegra = new Map();
  for (const item of itens) {
    const p = porId.get(item.product_id);
    if (!p) continue;
    const regra = porProduto.get(p.id) || porCategoria.get(p.category_id) || null;
    const chave = regra ? (regra.product_id || regra.category_id) : `sem-regra:${p.id}`;
    if (!porRegra.has(chave)) porRegra.set(chave, { regra, qtd: 0, produtos: [] });
    const g = porRegra.get(chave);
    g.qtd += Number(item.quantity) || 0;
    g.produtos.push({ p, qtd: Number(item.quantity) || 0 });
  }

  for (const [, grupo] of porRegra) {
    const { regra, qtd, produtos: itensDoGrupo } = grupo;

    for (const { p, qtd: q } of itensDoGrupo) {
      // PRODUTOS.weight É EM GRAMAS. A tela grava "Peso (g)" na seção
      // Dimensões do Produto Acabado, e lib/frete.js já dividia por mil
      // antes de mim. Ler como quilo aqui multiplicaria a carga por
      // mil: uma caneca de 340 g viraria 340 kg, e o frete de qualquer
      // pedido estouraria a última faixa da tabela.
      const pesoKg = (Number(p.weight) || 0) / 1000;
      if (!pesoKg) { if (!semPeso.includes(p.name)) semPeso.push(p.name); }
      else pesoReal += pesoKg * q;
    }

    const porCaixa = Number(regra?.caixa_qtd) || 0;
    const nCaixas = porCaixa > 0
      ? Math.max(Number(regra?.min_caixas) || 1, Math.ceil(qtd / porCaixa))
      : 1;   // sem regra de quantidade, trata como um volume só
    caixas += nCaixas;

    const cub = pesoCubado({
      altura: regra?.caixa_altura, largura: regra?.caixa_largura, comprimento: regra?.caixa_comprimento,
    });
    if (!cub) {
      const nome = itensDoGrupo[0]?.p?.name || 'produto';
      if (!semMedida.includes(nome)) semMedida.push(nome);
    } else {
      pesoCub += cub * nCaixas;
    }

    pesoReal += (Number(regra?.caixa_tara) || 0) * nCaixas;

    detalhe.push({
      caixas: nCaixas, unidades: qtd,
      cubagem_por_caixa: cub ? Math.round(cub * 1000) / 1000 : null,
      produtos: itensDoGrupo.map(x => x.p.name),
    });
  }

  const r2 = v => Math.round(v * 1000) / 1000;
  return {
    ok: !semPeso.length && !semMedida.length,
    peso_real: r2(pesoReal),
    peso_cubado: r2(pesoCub),
    caixas,
    sem_peso: semPeso,
    sem_medida: semMedida,
    detalhe,
  };
}

function vazio(motivo) {
  return { ok: false, motivo, peso_real: 0, peso_cubado: 0, caixas: 0, sem_peso: [], sem_medida: [], detalhe: [] };
}

module.exports = { medirPedido };
