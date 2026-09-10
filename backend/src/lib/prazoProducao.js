// ============================================================
// O PRAZO CONTADO DE TRÁS PARA FRENTE.
//
// A data que importa não é a de saída — é a DO EVENTO. O cliente casa
// dia 2 de outubro; se o copo chegar dia 3, ele não chegou.
//
// E a conta que decide isso nunca esteve no sistema. Ela era feita de
// cabeça, uma vez, no dia em que a venda foi fechada:
//
//   evento 02/10
//   − 7 dias úteis que a transportadora leva
//   − 2 dias de margem, porque caminhão atrasa
//   = a mercadoria PRECISA SAIR DIA 21/09
//
// Feita de cabeça e nunca mais refeita. O pedido ficava três dias
// parado esperando a arte, ninguém recalculava nada, e a descoberta
// vinha no dia 25 — quando não havia mais o que fazer.
//
// AQUI ELA É REFEITA A CADA LEITURA DE TELA. Se o evento mudou, se a
// transportadora mudou, se hoje é outro dia: a data limite se mexe
// junto, e o alerta acende sozinho.
//
// O ALERTA DE 24 HORAS é a regra de negócio que fecha isso: chegou na
// véspera da data limite e o pedido ainda não passou da embalagem,
// alguém precisa ser avisado HOJE — não amanhã, quando a resposta é
// "não deu". Vinte e quatro horas é o que sobra para resolver.
//
// DIAS ÚTEIS, e não dias corridos. Transportadora não coleta no
// domingo e a fábrica não trabalha no feriado; contar corrido é
// prometer uma data que ninguém consegue cumprir.
// ============================================================

const supabase = require('../config/supabase');

/** Hoje no fuso de quem está usando o sistema, não em UTC. */
function hojeISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const soData = v => (v ? String(v).slice(0, 10) : null);
const paraDate = iso => new Date(`${iso}T12:00:00`);   // meio-dia: imune a fuso
const paraISO = d => d.toISOString().slice(0, 10);

/** Sábado e domingo não contam. Feriado cadastrado, também não. */
function ehUtil(iso, feriados) {
  const dia = paraDate(iso).getDay();
  if (dia === 0 || dia === 6) return false;
  return !feriados.has(iso);
}

/**
 * N dias ÚTEIS antes de uma data.
 *
 * Anda para trás um dia de cada vez contando só os úteis. O teto de 400
 * voltas existe porque um `dias` absurdo (digitado errado, vindo de uma
 * cotação estranha) não pode virar laço infinito dentro da leitura de
 * uma tela.
 */
function diasUteisAntes(iso, dias, feriados = new Set()) {
  if (!iso) return null;
  let d = paraDate(iso);
  let faltam = Math.max(0, Math.round(Number(dias) || 0));
  let voltas = 0;
  while (faltam > 0 && voltas < 400) {
    d = new Date(d.getTime() - 86400000);
    voltas++;
    if (ehUtil(paraISO(d), feriados)) faltam--;
  }
  return paraISO(d);
}

/** Quantos dias úteis existem entre duas datas (negativo = já passou). */
function diasUteisEntre(deISO, ateISO, feriados = new Set()) {
  if (!deISO || !ateISO) return null;
  const inverso = ateISO < deISO;
  let a = paraDate(inverso ? ateISO : deISO);
  const b = paraDate(inverso ? deISO : ateISO);
  let n = 0, voltas = 0;
  while (paraISO(a) < paraISO(b) && voltas < 800) {
    a = new Date(a.getTime() + 86400000);
    voltas++;
    if (ehUtil(paraISO(a), feriados)) n++;
  }
  return inverso ? -n : n;
}

/** Os feriados cadastrados, num Set de datas ISO. */
async function feriadosDo(tenantId, anos = []) {
  try {
    let q = supabase.from('FERIADOS').select('date').eq('tenant_id', tenantId);
    if (anos.length) {
      q = q.gte('date', `${Math.min(...anos)}-01-01`).lte('date', `${Math.max(...anos)}-12-31`);
    }
    const { data } = await q;
    return new Set((data || []).map(f => soData(f.date)));
  } catch {
    // Sem a tabela, a conta continua valendo — só não pula feriado.
    return new Set();
  }
}

/**
 * QUANTOS DIAS A TRANSPORTADORA LEVA, na melhor fonte disponível.
 *
 * Quatro lugares, em ordem de confiança: o que foi combinado NESTE
 * pedido, o que a cotação devolveu, o padrão da empresa, e por último
 * um número de segurança. O último existe para a conta nunca sumir da
 * tela por falta de cadastro — um prazo estimado e dito como estimado
 * é melhor que nenhum.
 */
function diasDeTransporte(venda, config = {}) {
  const doPedido = Number(venda?.transport_days);
  if (doPedido > 0) return { dias: doPedido, origem: 'pedido' };

  const daCotacao = Number(venda?.freight_quote?.prazo ?? venda?.freight_quote?.dias);
  if (daCotacao > 0) return { dias: daCotacao, origem: 'cotação' };

  const daEmpresa = Number(config.dias_transporte_padrao);
  if (daEmpresa > 0) return { dias: daEmpresa, origem: 'padrão da empresa' };

  return { dias: 7, origem: 'estimativa' };
}

/**
 * AS ETAPAS QUE AINDA DEIXAM O PEDIDO "PARADO" para efeito do alerta.
 *
 * O alerta de 24 horas vale ATÉ A EMBALAGEM — depois dela a caixa está
 * pronta e o que falta é logística, que tem outro dono e outro relógio.
 * Alertar a fábrica sobre um pedido que já saiu da fábrica é ruído, e
 * ruído é o que faz as pessoas pararem de ler alerta.
 */
const DEPOIS_DA_EMBALAGEM = new Set([
  'embalagem_finalizada', 'aguardando_foto', 'foto_enviada',
  'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'produto_retirado', 'em_transito',
  'aguardando_entrega', 'entregue', 'pedido_finalizado',
  'ready', 'delivered', 'completed', 'cancelled',
]);

const NIVEIS = {
  estourado: { peso: 4, cor: 'vermelho', label: 'Prazo estourado' },
  critico:   { peso: 3, cor: 'vermelho', label: 'Crítico — 24 horas' },
  atencao:   { peso: 2, cor: 'amarelo',  label: 'Atenção' },
  ok:        { peso: 1, cor: 'verde',    label: 'No prazo' },
  sem_data:  { peso: 0, cor: 'cinza',    label: 'Sem data de evento' },
};

/**
 * O PRAZO DESTE PEDIDO, calculado agora.
 *
 * `venda` precisa ter event_date, ship_date, status e transport_days.
 * `feriados` é o Set de datas; passe o mesmo para uma lista inteira em
 * vez de consultar por pedido.
 */
function prazoDoPedido(venda, { feriados = new Set(), config = {}, hoje = hojeISO() } = {}) {
  const evento = soData(venda?.event_date);
  const margem = Number(config.margem_dias) >= 0 ? Number(config.margem_dias) : 2;
  const { dias: transporte, origem } = diasDeTransporte(venda, config);

  if (!evento) {
    /**
     * SEM DATA DE EVENTO NÃO HÁ CONTA — e isso é dito, não escondido.
     *
     * A data de saída sozinha não serve: ela é o que alguém digitou,
     * não o que o cliente precisa. Um pedido sem evento cadastrado
     * aparece como "sem data" para ser corrigido, em vez de aparecer
     * como "no prazo" e enganar quem lê.
     */
    return {
      nivel: 'sem_data', ...NIVEIS.sem_data,
      evento: null, transporte, transporte_origem: origem, margem,
      limite_saida: soData(venda?.ship_date),
      dias_ate_limite: null, alerta_24h: false,
      recado: 'Sem data do evento no pedido — o prazo real não pode ser calculado.',
    };
  }

  // ── A CONTA, de trás para frente ─────────────────────────
  const semMargem = diasUteisAntes(evento, transporte, feriados);
  const limite = diasUteisAntes(semMargem, margem, feriados);
  const faltam = diasUteisEntre(hoje, limite, feriados);

  const jaSaiu = DEPOIS_DA_EMBALAGEM.has(venda?.status);
  const estourado = hoje > limite;
  // A VÉSPERA É O ALERTA. Um dia útil ou menos até a data limite, e o
  // pedido ainda na fábrica: são as 24 horas para resolver.
  const critico = !estourado && faltam <= 1;

  let nivel = 'ok';
  if (!jaSaiu && estourado) nivel = 'estourado';
  else if (!jaSaiu && critico) nivel = 'critico';
  else if (!jaSaiu && faltam <= 3) nivel = 'atencao';

  const alerta_24h = !jaSaiu && (critico || estourado);

  const recado = jaSaiu
    ? 'Pedido já embalado — o prazo agora é da logística.'
    : estourado
      ? `A mercadoria deveria ter saído em ${dataBR(limite)} e o pedido ainda está na fábrica. `
        + `O evento é ${dataBR(evento)}.`
      : critico
        ? `TEMOS 24 HORAS. A mercadoria precisa sair em ${dataBR(limite)} para chegar `
          + `no evento de ${dataBR(evento)} — e o pedido ainda não passou da embalagem.`
        : `Precisa sair em ${dataBR(limite)} (${faltam} dia(s) útil(eis)) para o evento de ${dataBR(evento)}.`;

  return {
    nivel, ...NIVEIS[nivel],
    evento,
    transporte, transporte_origem: origem, margem,
    // A data sem a margem serve para explicar a conta na tela: sem ela,
    // "por que 21 e não 23?" só se responde perguntando a alguém.
    limite_sem_margem: semMargem,
    limite_saida: limite,
    dias_ate_limite: faltam,
    saida_prevista: soData(venda?.ship_date),
    // A saída digitada no pedido pode ser DEPOIS do que a conta exige —
    // e é esse descompasso que ninguém percebia.
    saida_depois_do_limite: !!(venda?.ship_date && soData(venda.ship_date) > limite),
    alerta_24h,
    ja_embalado: jaSaiu,
    recado,
  };
}

const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

/** A configuração de prazo da empresa, com os padrões da Lyon. */
async function configDePrazo(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    const p = data?.settings?.producao || {};
    return {
      margem_dias: p.margem_dias,
      dias_transporte_padrao: p.dias_transporte_padrao,
    };
  } catch { return {}; }
}

/** Prepara o cálculo para uma LISTA — um acesso ao banco, não quarenta. */
async function preparar(tenantId, vendas = []) {
  const anos = [...new Set(vendas.map(v => soData(v.event_date)).filter(Boolean)
    .map(d => Number(d.slice(0, 4))))];
  const [feriados, config] = await Promise.all([
    feriadosDo(tenantId, anos.length ? anos : [new Date().getFullYear()]),
    configDePrazo(tenantId),
  ]);
  return { feriados, config };
}

module.exports = {
  prazoDoPedido, preparar, feriadosDo, configDePrazo,
  diasUteisAntes, diasUteisEntre, hojeISO, NIVEIS,
};
