// ============================================================
// EM QUE CAIXA O PEDIDO VIAJA — e quanto isso pesa no frete.
//
// A Total Express cobra pelo MAIOR entre o peso real e o cubado. Os dois
// dependem da caixa, e a caixa depende do pedido:
//
//   pedido grande   vai na caixa padrão do produto, quantas forem
//                   precisas (sempre arredondando para cima: 250 copos
//                   em caixas de 100 são 3 caixas);
//   pedido pequeno  vai na caixa MENOR cadastrada para ele, quando a
//                   quantidade cabe nela (10 Long Drink na caixa do
//                   Twister 300) — e o frete sai dessa caixa, que é a que
//                   a transportadora mede.
//
// O PESO DE CADA COPO NÃO É CADASTRADO À PARTE. A tabela logística da
// Lyon traz o peso da caixa CHEIA; dividido pelas unidades por caixa, dá
// o peso por copo, embalagem inclusa.
//
// E DUAS REGRAS DE COBRANÇA, DA LYON (EMPRESAS.settings.logistica):
//
//   · acréscimo de 12% sobre o frete quando a ocupação da caixa passa de
//     70% — caixa cheia é carga que não sobra espaço para acomodar;
//   · o valor da caixa entra no pedido, uma vez por caixa usada.
//
// Os números são da Lyon e mudam com o tempo; o módulo Logística →
// Caixas e frete edita todos eles. Aqui só mora a conta, em função pura
// (testada em test/logisticaCaixas.test.js).
// ============================================================
let _supabase;
const db = () => (_supabase ||= require('../config/supabase'));
const { pesoCubado } = require('./totalexpress');

// unidades_padrao: quantos copos vão numa caixa quando a regra da
// categoria não diz. A regra, quando preenchida, sempre vence.
const CONFIG_PADRAO = { acrescimo_pct: 12, ocupacao_limite_pct: 70, cobrar_caixa: true, unidades_padrao: 50 };

const round2 = v => Math.round((Number(v) + Number.EPSILON) * 100) / 100;
const round3 = v => Math.round((Number(v) + Number.EPSILON) * 1000) / 1000;
const numOu = (v, padrao) => (v === '' || v === null || v === undefined || Number.isNaN(Number(v)) ? padrao : Number(v));

/** "TWISTER TRADICIONAL - PRETO - 550 ML" → 550 */
const capacidadeDoNome = nome => {
  const m = String(nome || '').match(/(\d{2,4})\s*ML\b/i);
  return m ? Number(m[1]) : null;
};

function configLogistica(settings) {
  const l = settings?.logistica || {};
  return {
    acrescimo_pct: numOu(l.acrescimo_pct, CONFIG_PADRAO.acrescimo_pct),
    ocupacao_limite_pct: numOu(l.ocupacao_limite_pct, CONFIG_PADRAO.ocupacao_limite_pct),
    cobrar_caixa: l.cobrar_caixa !== false,
    unidades_padrao: Math.max(0, Math.floor(numOu(l.unidades_padrao, CONFIG_PADRAO.unidades_padrao))),
  };
}

/** A regra do tamanho vence a regra da categoria inteira. */
function escolherRegra(regras, categoryId, capacidade) {
  const daCategoria = (regras || []).filter(r => r.ativo !== false && r.category_id === categoryId);
  return daCategoria.find(r => capacidade != null && Number(r.capacidade_ml) === Number(capacidade))
    || daCategoria.find(r => r.capacidade_ml === null || r.capacidade_ml === undefined)
    || null;
}

const cubadoDaCaixa = c => pesoCubado({ altura: c?.altura_cm, largura: c?.largura_cm, comprimento: c?.comprimento_cm });

/**
 * Um grupo do pedido (mesma regra) → caixas, pesos e valor.
 *
 * Devolve `{ ok: false, faltas }` quando o cadastro não permite a conta.
 * Nunca chuta: caixa sem medida ou regra sem unidades por caixa é um
 * frete que sairia errado, e quem descobriria seria a fatura.
 */
function medirGrupo({ nome, quantidade, regra, caixas, unidadesPadrao }) {
  const Q = Math.max(0, Number(quantidade) || 0);
  const faltas = [];
  const rotulo = nome || 'Produto';

  if (!regra) return { ok: false, faltas: [`${rotulo}: sem regra de caixa cadastrada.`] };

  const caixa = caixas.get(regra.caixa_id) || null;
  const daRegra = Number(regra.unidades_por_caixa) || 0;
  const U = daRegra || Number(unidadesPadrao) || 0;
  if (!caixa) faltas.push(`${rotulo}: a regra não tem caixa padrão.`);
  if (!U) faltas.push(`${rotulo}: falta informar quantas unidades cabem na caixa.`);
  if (caixa && !(Number(caixa.peso_cheia_kg) > 0)) faltas.push(`${rotulo}: a caixa "${caixa.nome}" está sem o peso da caixa cheia.`);
  if (caixa && !cubadoDaCaixa(caixa)) faltas.push(`${rotulo}: a caixa "${caixa.nome}" está sem medidas.`);
  if (faltas.length) return { ok: false, faltas };

  const pesoUnitario = Number(caixa.peso_cheia_kg) / U;
  const pequena = regra.caixa_pequena_id ? caixas.get(regra.caixa_pequena_id) : null;
  const limitePequena = Number(regra.unidades_caixa_pequena) || 0;

  let usada, volumes, capacidade, ehPequena = false;
  if (pequena && limitePequena > 0 && Q <= limitePequena) {
    if (!cubadoDaCaixa(pequena)) {
      return { ok: false, faltas: [`${rotulo}: a caixa menor "${pequena.nome}" está sem medidas.`] };
    }
    usada = pequena; volumes = 1; capacidade = limitePequena; ehPequena = true;
  } else {
    usada = caixa; volumes = Math.max(1, Math.ceil(Q / U)); capacidade = volumes * U;
  }

  return {
    ok: true,
    faltas: [],
    nome: rotulo,
    unidades: Q,
    caixa: { id: usada.id, nome: usada.nome, largura_cm: Number(usada.largura_cm), altura_cm: Number(usada.altura_cm), comprimento_cm: Number(usada.comprimento_cm), valor: Number(usada.valor) || 0 },
    caixa_pequena: ehPequena,
    unidades_por_caixa: U,
    unidades_padrao_usado: !daRegra,
    volumes,
    capacidade,
    peso_unitario_kg: round3(pesoUnitario),
    peso_real: round3(Q * pesoUnitario),
    peso_cubado: round3(cubadoDaCaixa(usada) * volumes),
    valor_caixas: round2((Number(usada.valor) || 0) * volumes),
  };
}

/**
 * O pedido inteiro. A ocupação é a do pedido todo: unidades ÷ espaço
 * das caixas usadas. Passou do limite (70%), o frete leva o acréscimo.
 */
function calcularEnvio(grupos, caixas, config = CONFIG_PADRAO) {
  const cfg = { ...CONFIG_PADRAO, ...config };
  const medidos = (grupos || []).map(g => medirGrupo({ ...g, caixas, unidadesPadrao: cfg.unidades_padrao }));
  const faltas = medidos.flatMap(m => m.faltas || []);
  if (!medidos.length) return { ok: false, faltas: ['Pedido sem itens.'], detalhe: [] };
  if (faltas.length) return { ok: false, faltas, detalhe: medidos };

  const unidades = medidos.reduce((s, m) => s + m.unidades, 0);
  const capacidade = medidos.reduce((s, m) => s + m.capacidade, 0);
  const ocupacao = capacidade > 0 ? (unidades / capacidade) * 100 : 0;
  const valorBruto = round2(medidos.reduce((s, m) => s + m.valor_caixas, 0));

  return {
    ok: true,
    faltas: [],
    volumes: medidos.reduce((s, m) => s + m.volumes, 0),
    peso_real: round3(medidos.reduce((s, m) => s + m.peso_real, 0)),
    peso_cubado: round3(medidos.reduce((s, m) => s + m.peso_cubado, 0)),
    ocupacao_pct: Math.round(ocupacao * 10) / 10,
    aplica_acrescimo: ocupacao > Number(cfg.ocupacao_limite_pct),
    acrescimo_pct: Number(cfg.acrescimo_pct),
    ocupacao_limite_pct: Number(cfg.ocupacao_limite_pct),
    valor_caixas: cfg.cobrar_caixa ? valorBruto : 0,
    valor_caixas_bruto: valorBruto,
    usou_unidades_padrao: medidos.some(m => m.unidades_padrao_usado),
    detalhe: medidos,
  };
}

/** O frete da tabela da transportadora + acréscimo + caixas. */
function aplicarAoFrete(freteBase, envio) {
  const base = round2(Number(freteBase) || 0);
  const acrescimo = envio?.aplica_acrescimo ? round2(base * (Number(envio.acrescimo_pct) || 0) / 100) : 0;
  const caixas = round2(Number(envio?.valor_caixas) || 0);
  return { frete_base: base, acrescimo, frete: round2(base + acrescimo), valor_caixas: caixas, total: round2(base + acrescimo + caixas) };
}

// ── banco ───────────────────────────────────────────────────

/** Caixas, regras e configuração. `null` quando a migração 121 não rodou. */
async function carregar(tenantId) {
  const [cx, rg, emp] = await Promise.all([
    db().from('LOGISTICA_CAIXAS').select('*').eq('tenant_id', tenantId).eq('ativo', true),
    db().from('LOGISTICA_REGRAS').select('*').eq('tenant_id', tenantId).eq('ativo', true),
    db().from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle(),
  ]);
  if (cx.error || rg.error) return null;
  return {
    caixas: new Map((cx.data || []).map(c => [c.id, c])),
    regras: rg.data || [],
    config: configLogistica(emp.data?.settings),
  };
}

/**
 * Itens do pedido ([{ product_id, quantity }]) → envio calculado.
 * Itens da mesma regra viajam juntos: duas cores de Long Drink dividem
 * a mesma caixa.
 */
async function medirComCaixas(tenantId, itens = []) {
  const ids = [...new Set((itens || []).map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return { ok: false, faltas: ['Pedido sem itens com produto identificado.'], detalhe: [] };

  const dados = await carregar(tenantId);
  if (!dados) return { ok: false, faltas: ['O cadastro de caixas ainda não existe neste banco (migração 121).'], detalhe: [] };

  const { data: produtos } = await db().from('PRODUTOS')
    .select('id, name, category_id, CATEGORIAS(name)').eq('tenant_id', tenantId).in('id', ids);
  const porId = new Map((produtos || []).map(p => [p.id, p]));

  const grupos = new Map();
  for (const item of itens) {
    const p = porId.get(item.product_id);
    if (!p) continue;
    const cap = capacidadeDoNome(p.name);
    const regra = escolherRegra(dados.regras, p.category_id, cap);
    const chave = regra ? regra.id : `sem-regra:${p.category_id}:${cap}`;
    const nome = `${p.CATEGORIAS?.name || p.name}${cap ? ` ${cap} ml` : ''}`;
    if (!grupos.has(chave)) grupos.set(chave, { nome, quantidade: 0, regra });
    grupos.get(chave).quantidade += Number(item.quantity) || 0;
  }

  const envio = calcularEnvio([...grupos.values()], dados.caixas, dados.config);
  return { ...envio, config: dados.config };
}

module.exports = {
  CONFIG_PADRAO, configLogistica, capacidadeDoNome, escolherRegra,
  medirGrupo, calcularEnvio, aplicarAoFrete, carregar, medirComCaixas,
};
