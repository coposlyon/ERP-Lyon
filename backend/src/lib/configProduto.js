// ============================================================
// O que ESTE produto aceita.
//
// Uma pergunta, uma resposta, um lugar. A tela de orçamento não sabe o
// que é degradê: ela pede a configuração de um produto e recebe a lista
// de acabamentos, e dentro de cada acabamento os campos que ele abre.
// Desenha e pronto. Acabamento novo é linha no banco, não deploy — e
// não é só a tela de orçamento que ganha: pedido, produção e compra
// fazem a mesma pergunta e vão ler daqui.
//
// A RESOLUÇÃO DAS REGRAS. Quase tudo é da categoria ("todo Twister
// aceita degradê"); o produto entra só na exceção. Então:
//
//   1. junta o que a CATEGORIA libera
//   2. aplica por cima o que o PRODUTO diz — inclusive o `false`, que é
//      como se fecha um caso sem reescrever a categoria inteira
//
// Sem regra nenhuma cadastrada, NADA é liberado. É de propósito: uma
// lista vazia manda o vendedor procurar o Administrativo, enquanto
// "liberar tudo por omissão" faria a tela oferecer uma combinação que a
// fábrica não produz e o cliente já pagou.
// ============================================================
const supabase = require('../config/supabase');

const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

/**
 * Resolve uma lista de ids permitidos a partir da matriz.
 *
 * @param regras  linhas de PRODUTO_COMPATIBILIDADE já filtradas por tipo
 * @param productId  o produto em questão
 */
function idsPermitidos(regras, productId) {
  const daCategoria = new Set();
  const doProduto = new Map();   // ref_id -> permitido

  for (const r of regras) {
    if (r.product_id) {
      if (r.product_id === productId) doProduto.set(r.ref_id, r.permitido);
    } else if (r.category_id) {
      if (r.permitido) daCategoria.add(r.ref_id);
      // categoria com permitido = false não libera; o produto ainda pode abrir
    }
  }

  const fim = new Set(daCategoria);
  for (const [ref, permitido] of doProduto) {
    if (permitido) fim.add(ref); else fim.delete(ref);
  }
  return fim;
}

/** Capacidade lida do nome ("TWISTER ... 550 ML" → "550 ml"). */
const capacidadeDe = nome => {
  const m = String(nome || '').match(/(\d{2,4})\s*ML\b/i);
  return m ? `${m[1]} ml` : null;
};

/**
 * A configuração completa de um produto, do jeito que a tela consome.
 *
 * Devolve `{ produto, acabamentos, cores, processos }`, onde cada
 * acabamento traz os próprios `campos` — e cada campo diz de qual grupo
 * de cores ele se alimenta. É só isso que a tela precisa saber.
 */
async function configDoProduto(tenantId, productId) {
  const { data: produto, error: erroProduto } = await supabase
    .from('PRODUTOS')
    .select('id, code, name, unit, ink_type, category_id, sale_price, min_order_qty, price_tiers, CATEGORIAS ( id, name )')
    .eq('tenant_id', tenantId).eq('id', productId).maybeSingle();

  if (erroProduto) throw erroProduto;
  if (!produto) return { erro: 'Produto não encontrado' };

  const [acabRes, coresRes, procRes, compatRes] = await Promise.all([
    supabase.from('CONFIG_ACABAMENTOS').select('id, name, seq, requer_pintura, requer_borda, requer_jateamento, campos')
      .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
    supabase.from('CONFIG_CORES').select('id, name, grupo, hex, seq')
      .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
    supabase.from('CONFIG_PROCESSOS').select('id, name, max_cores, seq')
      .eq('tenant_id', tenantId).eq('is_active', true).order('seq'),
    supabase.from('PRODUTO_COMPATIBILIDADE').select('tipo, ref_id, permitido, category_id, product_id')
      .eq('tenant_id', tenantId)
      .or(`product_id.eq.${productId}${produto.category_id ? `,category_id.eq.${produto.category_id}` : ''}`),
  ]);

  const falha = [acabRes, coresRes, procRes, compatRes].find(r => r.error);
  if (falha) {
    if (tabelaAusente(falha.error)) return { config_ausente: true };
    throw falha.error;
  }

  const regras = compatRes.data || [];
  const porTipo = tipo => idsPermitidos(regras.filter(r => r.tipo === tipo), productId);

  const okAcab = porTipo('acabamento');
  const okCor  = porTipo('cor');
  const okProc = porTipo('processo');

  const acabamentos = (acabRes.data || [])
    .filter(a => okAcab.has(a.id))
    .map(a => ({
      id: a.id, name: a.name,
      campos: Array.isArray(a.campos) ? a.campos : [],
      requer: {
        pintura: a.requer_pintura, borda: a.requer_borda, jateamento: a.requer_jateamento,
      },
    }));

  // As cores saem agrupadas porque é assim que a tela pergunta: o campo
  // diz "grupo: pintura" e pega a lista de pintura. Uma lista única
  // faria o vendedor escolher borda "Azul Bebê", que não existe em borda.
  const cores = {};
  for (const c of coresRes.data || []) {
    if (!okCor.has(c.id)) continue;
    (cores[c.grupo] = cores[c.grupo] || []).push({ id: c.id, name: c.name, hex: c.hex });
  }

  return {
    produto: {
      id: produto.id,
      codigo: produto.code,
      nome: produto.name,
      capacidade: capacidadeDe(produto.name),
      linha: produto.ink_type,
      categoria: produto.CATEGORIAS?.name || null,
      preco_base: Number(produto.sale_price) || 0,
      qtd_minima: Number(produto.min_order_qty) || 1,
      faixas: Array.isArray(produto.price_tiers) ? produto.price_tiers : [],
    },
    acabamentos,
    cores,
    processos: (procRes.data || []).filter(p => okProc.has(p.id))
      .map(p => ({ id: p.id, name: p.name, max_cores: p.max_cores })),
  };
}

/**
 * A combinação escolhida é produzível?
 *
 * Valida do jeito que o cadastro manda, e não por regra escrita aqui: o
 * acabamento tem que estar liberado para o produto, e cada campo que ele
 * exige tem que estar preenchido com uma cor do grupo certo — daquele
 * produto. Cor de pintura num campo de borda não passa.
 */
function validarCombinacao(config, escolha = {}) {
  const problemas = [];

  const acab = (config.acabamentos || []).find(a => a.id === escolha.acabamento_id);
  if (!acab) {
    return { ok: false, problemas: ['Escolha um acabamento liberado para este produto.'] };
  }

  for (const campo of acab.campos) {
    const valor = escolha.campos?.[campo.key];
    if (!valor) {
      if (campo.obrigatorio) problemas.push(`Falta informar: ${campo.label}.`);
      continue;
    }
    const disponiveis = config.cores?.[campo.grupo] || [];
    if (!disponiveis.some(c => c.id === valor)) {
      problemas.push(`${campo.label}: essa cor não está liberada para este produto.`);
    }
  }

  if (escolha.processo_id) {
    const proc = (config.processos || []).find(p => p.id === escolha.processo_id);
    if (!proc) problemas.push('O processo de personalização escolhido não é compatível com este produto.');
    else if (proc.max_cores && Number(escolha.cores_arte) > proc.max_cores) {
      problemas.push(`${proc.name} aceita no máximo ${proc.max_cores} cor(es) na arte.`);
    }
  }

  return { ok: problemas.length === 0, problemas, acabamento: acab };
}

module.exports = { configDoProduto, validarCombinacao, idsPermitidos, capacidadeDe };
