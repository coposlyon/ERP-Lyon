// ============================================================
// MAQUINÁRIOS — AS CONTAS DO PATRIMÔNIO QUE PRODUZ.
//
// Uma função pura (`calcularMaquina`) faz toda a conta a partir do
// cadastro e do que foi registrado (produções, eventos, checklist). A
// tela, a lista, o rateio e os alertas leem o mesmo resultado — ninguém
// recalcula depreciação por conta própria.
//
// O custo mensal entra no rateio das despesas fixas pela função
// `linhasDoRateio`, chamada por rateioLib.fixedExpenses. É linha
// calculada, não registro em DESPESAS_FIXAS: depreciação não se paga, e
// gravada lá viraria conta a pagar e item do malote do contador.
// ============================================================
const supabase = require('../config/supabase');

const DIA = 86400000;
const MES_DIAS = 30.4375;
const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
const n = v => Number(v) || 0;

/** Quantas vezes por mês cada periodicidade acontece. */
const POR_MES = {
  diaria: 30, semanal: 4.345, quinzenal: 2.17, mensal: 1, bimestral: 0.5,
  trimestral: 1 / 3, semestral: 1 / 6, anual: 1 / 12,
};
/** Quantos dias até a próxima execução. */
const DIAS_DA_PERIODICIDADE = {
  diaria: 1, semanal: 7, quinzenal: 15, mensal: 30, bimestral: 60,
  trimestral: 91, semestral: 182, anual: 365,
};

const hojeISO = () => new Date().toISOString().slice(0, 10);
const addDias = (iso, dias) => {
  const d = new Date(`${iso || hojeISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(dias));
  return d.toISOString().slice(0, 10);
};
const addMeses = (iso, meses) => {
  const d = new Date(`${iso || hojeISO()}T12:00:00Z`);
  const inteiros = Math.floor(meses);
  d.setUTCMonth(d.getUTCMonth() + inteiros);
  d.setUTCDate(d.getUTCDate() + Math.round((meses - inteiros) * MES_DIAS));
  return d.toISOString().slice(0, 10);
};
const diasEntre = (a, b) => (new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / DIA;
const proximaData = (ultima, periodicidade) =>
  addDias(ultima || hojeISO(), DIAS_DA_PERIODICIDADE[periodicidade] || 30);

const TIPOS_CUSTO_MANUTENCAO = ['revisao', 'manutencao'];

/**
 * TODA A CONTA DE UMA MÁQUINA.
 *
 * @param m           linha de MAQUINAS
 * @param producoes   MAQUINA_PRODUCOES da máquina
 * @param eventos     MAQUINA_EVENTOS da máquina
 * @param checklist   MAQUINA_MANUTENCOES da máquina
 */
function calcularMaquina(m, producoes = [], eventos = [], checklist = []) {
  const hoje = hojeISO();
  const ano = hoje.slice(0, 4);

  // ── Depreciação (linear, pelo tempo) ──
  const mesesVida = Math.max(1, n(m.vida_util_anos) * 12);
  const depreciavel = Math.max(0, n(m.valor_aquisicao) - n(m.valor_residual));
  const depreciacaoMensal = depreciavel / mesesVida;
  const mesesUso = m.data_aquisicao ? Math.max(0, diasEntre(m.data_aquisicao, hoje) / MES_DIAS) : 0;
  const depreciacaoAcumulada = Math.min(depreciavel, depreciacaoMensal * mesesUso);
  const vidaRestanteMeses = Math.max(0, mesesVida - mesesUso);
  const fimVidaUtil = m.data_aquisicao ? addMeses(m.data_aquisicao, mesesVida) : null;
  // Totalmente depreciada não gera mais custo de depreciação.
  const depreciacaoDoMes = depreciacaoAcumulada >= depreciavel && mesesUso > 0 ? 0 : depreciacaoMensal;

  // ── Produção e desgaste ──
  const somaQtd = producoes.reduce((s, p) => s + n(p.quantidade), 0);
  const somaHoras = producoes.reduce((s, p) => s + n(p.horas), 0);
  const producaoAcumulada = n(m.producao_inicial) + somaQtd;
  const horasOperacao = n(m.horas_iniciais) + somaHoras;
  const producaoAno = producoes.filter(p => String(p.data || '').startsWith(ano)).reduce((s, p) => s + n(p.quantidade), 0);
  const mediaHora = somaHoras > 0 ? somaQtd / somaHoras : n(m.capacidade_hora);
  const inicio90 = addDias(hoje, -90);
  const producao90 = producoes.filter(p => String(p.data || '') >= inicio90).reduce((s, p) => s + n(p.quantidade), 0);
  const producaoMensalMedia = producao90 / 3;
  const ultimaMedicao = producoes.reduce((max, p) => (p.data > max ? p.data : max), '') || null;
  const perdas = producoes.reduce((s, p) => s + n(p.perdas), 0);
  const eficiencia = somaQtd + perdas > 0 ? (somaQtd / (somaQtd + perdas)) * 100 : null;

  const vidaUnidades = n(m.vida_util_unidades);
  const desgastePct = vidaUnidades > 0
    ? (producaoAcumulada / vidaUnidades) * 100
    : (mesesUso / mesesVida) * 100;

  // ── Revisão por produção ──
  const intervalo = n(m.intervalo_revisao_unidades);
  const baseRevisao = n(m.producao_ultima_revisao);
  const proximaRevisaoProducao = intervalo > 0 ? baseRevisao + intervalo : null;
  const progressoRevisaoPct = intervalo > 0 ? Math.max(0, ((producaoAcumulada - baseRevisao) / intervalo) * 100) : null;

  // ── Checklist ──
  const itensAtivos = checklist.filter(c => c.ativo !== false);
  const checklistComStatus = itensAtivos.map(c => ({ ...c, situacao: situacaoDaData(c.proxima_execucao, hoje) }));
  const checklistVencidos = checklistComStatus.filter(c => c.situacao === 'vencido').length;

  // ── Situação da revisão (a data OU a produção, o que chegar antes) ──
  let revisao = situacaoDaData(m.proxima_revisao, hoje);
  if (progressoRevisaoPct != null) {
    if (progressoRevisaoPct >= 100) revisao = 'vencido';
    else if (progressoRevisaoPct >= 90 && revisao === 'em_dia') revisao = 'proximo';
  }
  if (!m.proxima_revisao && progressoRevisaoPct == null) revisao = 'sem_plano';

  // ── Manutenção: realizado nos últimos 12 meses, ou o previsto no plano ──
  const inicio12 = addDias(hoje, -365);
  const custoDoEvento = e => e.status !== 'cancelado' ? n(e.custo) : 0;
  const realizado12 = eventos
    .filter(e => String(e.data || '') >= inicio12 && [...TIPOS_CUSTO_MANUTENCAO, 'troca_peca'].includes(e.tipo))
    .reduce((s, e) => s + custoDoEvento(e), 0);
  const mesesDeHistorico = Math.max(1, Math.min(12, mesesUso || 12));
  const manutencaoRealizadaMensal = realizado12 / mesesDeHistorico;
  const manutencaoPrevistaMensal = itensAtivos.reduce((s, c) => s + n(c.custo_previsto) * (POR_MES[c.periodicidade] || 1), 0);
  const manutencaoMensal = manutencaoRealizadaMensal > 0 ? manutencaoRealizadaMensal : manutencaoPrevistaMensal;

  const ativa = m.status !== 'inativa';
  const custoMensal = ativa ? depreciacaoDoMes + manutencaoMensal : 0;
  const custoPorUnidade = producaoMensalMedia > 0 ? custoMensal / producaoMensalMedia : null;

  // ── Reposição ──
  const revisoesAcumuladas = eventos.filter(e => TIPOS_CUSTO_MANUTENCAO.includes(e.tipo)).reduce((s, e) => s + custoDoEvento(e), 0);
  const pecasTrocadas = eventos.filter(e => e.tipo === 'troca_peca').reduce((s, e) => s + custoDoEvento(e), 0);
  const paradas = eventos.filter(e => e.tipo === 'parada');
  const horasParada = paradas.reduce((s, e) => s + n(e.horas_parada), 0);
  const investidoTotal = n(m.valor_aquisicao) + revisoesAcumuladas + pecasTrocadas;
  const diferencaReposicao = Math.max(0, n(m.meta_reposicao) - n(m.reserva_reposicao) - n(m.valor_venda_estimado));

  // A troca chega pelo tempo ou pelo desgaste — o que vier primeiro.
  let projecaoTroca = fimVidaUtil;
  let projecaoPor = fimVidaUtil ? 'tempo' : null;
  if (vidaUnidades > 0 && producaoMensalMedia > 0) {
    const mesesAteDesgaste = Math.max(0, (vidaUnidades - producaoAcumulada) / producaoMensalMedia);
    const pelaProducao = addMeses(hoje, mesesAteDesgaste);
    if (!projecaoTroca || pelaProducao < projecaoTroca) { projecaoTroca = pelaProducao; projecaoPor = 'producao'; }
  }
  const mesesAteTroca = projecaoTroca ? Math.max(0, diasEntre(hoje, projecaoTroca) / MES_DIAS) : vidaRestanteMeses;
  const reservaMensalSugerida = diferencaReposicao > 0 ? diferencaReposicao / Math.max(1, mesesAteTroca) : 0;

  // ── Alertas ──
  const alertas = [];
  if (revisao === 'vencido') alertas.push({ nivel: 'erro', texto: 'Revisão vencida' });
  else if (revisao === 'proximo') alertas.push({ nivel: 'aviso', texto: 'Revisão próxima' });
  if (checklistVencidos) alertas.push({ nivel: 'erro', texto: `${checklistVencidos} item(ns) do checklist vencido(s)` });
  if (desgastePct >= 100) alertas.push({ nivel: 'erro', texto: 'Vida útil esgotada' });
  else if (desgastePct >= 85) alertas.push({ nivel: 'aviso', texto: `Desgaste em ${desgastePct.toFixed(0)}%` });
  if (m.garantia_ate && m.garantia_ate >= hoje && diasEntre(hoje, m.garantia_ate) <= 30) alertas.push({ nivel: 'aviso', texto: 'Garantia vence em até 30 dias' });

  return {
    depreciacao_mensal: r2(depreciacaoMensal),
    depreciacao_do_mes: r2(depreciacaoDoMes),
    depreciacao_acumulada: r2(depreciacaoAcumulada),
    valor_contabil: r2(n(m.valor_aquisicao) - depreciacaoAcumulada),
    meses_uso: Math.round(mesesUso * 10) / 10,
    vida_restante_meses: Math.round(vidaRestanteMeses * 10) / 10,
    fim_vida_util: fimVidaUtil,

    producao_acumulada: Math.round(producaoAcumulada),
    producao_ano: Math.round(producaoAno),
    producao_mensal_media: Math.round(producaoMensalMedia),
    horas_operacao: Math.round(horasOperacao * 10) / 10,
    media_hora: Math.round(mediaHora * 10) / 10,
    eficiencia_pct: eficiencia == null ? null : Math.round(eficiencia * 10) / 10,
    perdas: Math.round(perdas),
    ultima_medicao: ultimaMedicao,
    desgaste_pct: Math.round(desgastePct * 10) / 10,
    desgaste_por: vidaUnidades > 0 ? 'producao' : 'tempo',

    proxima_revisao_producao: proximaRevisaoProducao,
    progresso_revisao_pct: progressoRevisaoPct == null ? null : Math.round(progressoRevisaoPct * 10) / 10,
    revisao,
    checklist_vencidos: checklistVencidos,
    checklist_total: itensAtivos.length,

    manutencao_realizada_mensal: r2(manutencaoRealizadaMensal),
    manutencao_prevista_mensal: r2(manutencaoPrevistaMensal),
    manutencao_mensal: r2(manutencaoMensal),
    manutencao_fonte: manutencaoRealizadaMensal > 0 ? 'realizado' : (manutencaoPrevistaMensal > 0 ? 'previsto' : null),
    custo_mensal: r2(custoMensal),
    custo_por_unidade: custoPorUnidade == null ? null : Math.round(custoPorUnidade * 10000) / 10000,

    revisoes_acumuladas: r2(revisoesAcumuladas),
    pecas_trocadas: r2(pecasTrocadas),
    horas_parada: Math.round(horasParada * 10) / 10,
    paradas: paradas.length,
    investido_total: r2(investidoTotal),
    diferenca_reposicao: r2(diferencaReposicao),
    reserva_mensal_sugerida: r2(reservaMensalSugerida),
    projecao_troca: projecaoTroca,
    projecao_por: projecaoPor,

    alertas,
  };
}

function situacaoDaData(proxima, hoje = hojeISO()) {
  if (!proxima) return 'sem_data';
  if (proxima < hoje) return 'vencido';
  if (diasEntre(hoje, proxima) <= 7) return 'proximo';
  return 'em_dia';
}

/** Carrega tudo de várias máquinas de uma vez e devolve com o cálculo. */
async function carregarComCalculo(tenantId, filtro = {}) {
  let q = supabase.from('MAQUINAS').select('*').eq('tenant_id', tenantId).order('codigo');
  if (filtro.grupo) q = q.eq('grupo', filtro.grupo);
  if (filtro.id) q = q.eq('id', filtro.id);
  const { data: maquinas, error } = await q;
  if (error) throw error;
  if (!maquinas?.length) return [];

  const ids = maquinas.map(m => m.id);
  const [prod, ev, chk] = await Promise.all([
    supabase.from('MAQUINA_PRODUCOES').select('maquina_id, data, quantidade, perdas, horas')
      .eq('tenant_id', tenantId).in('maquina_id', ids).limit(50000),
    supabase.from('MAQUINA_EVENTOS').select('maquina_id, data, tipo, custo, status, horas_parada')
      .eq('tenant_id', tenantId).in('maquina_id', ids).limit(50000),
    supabase.from('MAQUINA_MANUTENCOES').select('*').eq('tenant_id', tenantId).in('maquina_id', ids).limit(5000),
  ]);
  for (const r of [prod, ev, chk]) if (r.error) throw r.error;

  const agrupar = rows => rows.reduce((mp, r) => {
    if (!mp.has(r.maquina_id)) mp.set(r.maquina_id, []);
    mp.get(r.maquina_id).push(r);
    return mp;
  }, new Map());
  const P = agrupar(prod.data || []), E = agrupar(ev.data || []), C = agrupar(chk.data || []);

  return maquinas.map(m => ({
    ...m,
    calc: calcularMaquina(m, P.get(m.id) || [], E.get(m.id) || [], C.get(m.id) || []),
  }));
}

/**
 * AS MÁQUINAS COMO LINHAS DO RATEIO DAS DESPESAS FIXAS.
 *
 * Mesmo formato de uma despesa fixa, com `origin: 'maquinario'` e
 * `readonly: true` — a tela de Despesas Fixas mostra, soma, e manda
 * editar em Maquinários. Sem a tabela ainda (migração 123 pendente),
 * devolve lista vazia e o rateio segue como antes.
 */
async function linhasDoRateio(tenantId) {
  try {
    const lista = await carregarComCalculo(tenantId);
    return lista
      .filter(m => m.entra_no_rateio !== false && m.status !== 'inativa' && m.calc.custo_mensal > 0)
      .map(m => ({
        id: `maq-${m.id}`,
        maquina_id: m.id,
        name: m.grupo === 'ti' ? 'Computadores e TI' : 'Maquinários',
        notes: `${m.codigo} · ${m.nome} — depreciação ${fmtMoeda(m.calc.depreciacao_do_mes)} + manutenção ${fmtMoeda(m.calc.manutencao_mensal)}`,
        amount: m.calc.custo_mensal,
        original_amount: m.calc.custo_mensal,
        due_day: null,
        is_active: true,
        category: m.grupo === 'ti' ? 'Tecnologia' : 'Depreciação',
        cost_center: m.setor || (m.grupo === 'ti' ? 'Tecnologia' : 'Produção'),
        periodicity: 'mensal',
        origin: 'maquinario',
        readonly: true,
      }));
  } catch {
    return [];
  }
}

const fmtMoeda = v => `R$ ${(Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Próximo código livre: M001, M002… (TI usa T001). */
async function proximoCodigo(tenantId, grupo) {
  const prefixo = grupo === 'ti' ? 'T' : 'M';
  const { data } = await supabase.from('MAQUINAS').select('codigo').eq('tenant_id', tenantId).ilike('codigo', `${prefixo}%`);
  const maior = (data || []).reduce((mx, r) => Math.max(mx, parseInt(String(r.codigo).replace(/\D/g, ''), 10) || 0), 0);
  return `${prefixo}${String(maior + 1).padStart(3, '0')}`;
}

async function registrarEvento(req, maquinaId, ev) {
  const row = {
    tenant_id: req.tenantId, maquina_id: maquinaId,
    data: ev.data || hojeISO(), tipo: ev.tipo, descricao: ev.descricao || null,
    responsavel: ev.responsavel || req.user?.name || null,
    fornecedor: ev.fornecedor || null, custo: n(ev.custo),
    producao_impactada: ev.producao_impactada ?? null, horas_parada: ev.horas_parada ?? null,
    status: ev.status || 'concluido', peca_id: ev.peca_id || null, manutencao_id: ev.manutencao_id || null,
    detalhes: ev.detalhes || {}, user_id: req.user?.id || null,
  };
  const { data, error } = await supabase.from('MAQUINA_EVENTOS').insert(row).select().single();
  if (error) throw error;
  return data;
}

/**
 * A ETAPA PRODUÇÃO TERMINOU: O LOTE ENTRA NA VIDA DA MÁQUINA.
 *
 * O número digitado no início da etapa ("Número da máquina") é casado
 * com o cadastro pelo código (M001), pelo número (1, 01) ou pelo nome.
 * Quantidade = unidades do pedido menos a perda informada; horas = do
 * início ao fim da etapa. Máquina não encontrada não trava a produção.
 */
async function registrarProducaoDoPedido(req, { venda, log, perdas = 0, operador }) {
  const inicio = [...log].reverse().find(x => x.stage === 'producao' && x.action === 'start');
  const fim = [...log].reverse().find(x => x.stage === 'producao' && x.action === 'finish');
  const digitado = String(inicio?.maquina || '').trim();
  if (!digitado) return null;

  const { data: maquinas } = await supabase.from('MAQUINAS').select('id, codigo, nome, producao_ultima_revisao, intervalo_revisao_unidades')
    .eq('tenant_id', req.tenantId).eq('grupo', 'maquinario');
  const alvo = casarMaquina(maquinas || [], digitado);
  if (!alvo) return null;

  const itens = venda.VENDA_ITENS || [];
  const total = itens.reduce((s, i) => s + n(i.quantity), 0);
  const quantidade = Math.max(0, total - n(perdas));
  const horas = inicio?.at && fim?.at ? Math.max(0, (new Date(fim.at) - new Date(inicio.at)) / 3600000) : 0;

  const { data: existente } = await supabase.from('MAQUINA_PRODUCOES').select('id')
    .eq('maquina_id', alvo.id).eq('venda_id', venda.id).maybeSingle();
  const row = {
    tenant_id: req.tenantId, maquina_id: alvo.id, venda_id: venda.id,
    data: (fim?.at || new Date().toISOString()).slice(0, 10),
    produto: itens.map(i => i.product_name).filter(Boolean).join(', ').slice(0, 160) || null,
    product_id: itens[0]?.product_id || null,
    quantidade, perdas: n(perdas), horas: Math.round(horas * 100) / 100,
    operador: operador || null, origem: 'producao',
  };
  const r = existente
    ? await supabase.from('MAQUINA_PRODUCOES').update(row).eq('id', existente.id)
    : await supabase.from('MAQUINA_PRODUCOES').insert(row);
  if (r.error) throw r.error;
  return { maquina: alvo.codigo, quantidade };
}

function casarMaquina(maquinas, digitado) {
  const t = digitado.toLowerCase().trim();
  const num = parseInt(t.replace(/\D/g, ''), 10);
  return maquinas.find(m => String(m.codigo).toLowerCase() === t)
    || maquinas.find(m => String(m.nome).toLowerCase() === t)
    || (Number.isFinite(num) ? maquinas.find(m => parseInt(String(m.codigo).replace(/\D/g, ''), 10) === num) : null)
    || maquinas.find(m => String(m.nome).toLowerCase().includes(t))
    || null;
}

module.exports = {
  calcularMaquina, carregarComCalculo, linhasDoRateio, proximoCodigo, registrarEvento,
  registrarProducaoDoPedido, casarMaquina, proximaData, situacaoDaData, POR_MES, DIAS_DA_PERIODICIDADE, hojeISO,
};
