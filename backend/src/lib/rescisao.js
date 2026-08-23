// ============================================================
// A RESCISÃO — A CONTA MAIS CARA DE ERRAR.
//
// Rescisão errada volta como reclamatória. Por isso ela é montada dos
// mesmos fatos que o resto do RH usa: a admissão do cadastro, o saldo
// de férias calculado em lib/ferias.js, as faltas do ponto e o salário
// vigente. Nenhum número é digitado no fechamento.
//
// O QUE MUDA COM O MOTIVO — e é isso que faz a conta existir:
//
//   sem_justa_causa   aviso + 13º + férias + multa de 40% do FGTS
//   pedido_demissao   sem aviso indenizado, sem multa, sem saque
//   acordo (484-A)    metade do aviso, metade da multa (20%)
//   justa_causa       só saldo de salário e férias VENCIDAS
//   termino_contrato  sem aviso e sem multa (prazo determinado)
//
// AVISO PRÉVIO PROPORCIONAL (Lei 12.506/2011): 30 dias + 3 por ano
// completo de casa, teto de 90. Muita gente ainda paga 30 fixos — e é
// exatamente aí que nasce o processo.
//
// O QUE ESTA BIBLIOTECA NÃO DECIDE: se há homologação (depende da CCT),
// se cabe exame demissional (depende do tempo de casa e da NR) e o
// valor exato de INSS/IRRF sobre verbas indenizatórias, que têm regra
// própria. O que não é certeza vem marcado como estimativa.
// ============================================================
const { saldoDeFerias } = require('./ferias');
const { calcINSS, calcIRRF } = require('./calc');

const DIA = 864e5;
const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

/**
 * Lê 'AAAA-MM-DD' como data LOCAL.
 *
 * `new Date('2026-08-19')` é meia-noite UTC — que no Brasil é dia 18 às
 * 21h. Um dia a menos em getDate() derruba o 13º de quem trabalhou
 * exatamente 15 dias no mês. Aqui a data é montada pedaço a pedaço.
 */
function dt(iso) {
  const [a, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  return new Date(a, (m || 1) - 1, d || 1);
}

function valor(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Anos completos entre duas datas. */
function anosDeCasa(admissao, saida) {
  if (!admissao || !saida) return 0;
  const a = dt(admissao), b = dt(saida);
  let anos = b.getFullYear() - a.getFullYear();
  const m = b.getMonth() - a.getMonth();
  if (m < 0 || (m === 0 && b.getDate() < a.getDate())) anos -= 1;
  return Math.max(0, anos);
}

/** Aviso prévio proporcional: 30 + 3 por ano completo, teto 90. */
function diasDeAviso(admissao, saida) {
  return Math.min(90, 30 + anosDeCasa(admissao, saida) * 3);
}

const diasDoMes = (ano, mes) => new Date(ano, mes, 0).getDate();  // mes 1..12

/**
 * Meses para o 13º: mês com 15 dias ou mais de trabalho conta inteiro.
 *
 * A contagem começa no MAIS TARDE entre a admissão e 1º de janeiro do
 * ano da saída. Contar sempre de janeiro daria 8/12 de 13º a quem foi
 * admitido em agosto e saiu em agosto — dinheiro pago por tempo que
 * ninguém trabalhou.
 */
function mesesParaDecimo(admissao, saida) {
  const s = dt(saida);
  const ano = s.getFullYear();
  const a = admissao ? dt(admissao) : new Date(ano, 0, 1);
  const inicio = a.getFullYear() < ano ? new Date(ano, 0, 1) : a;
  if (inicio.getFullYear() > ano || inicio > s) return 0;

  const mesInicio = inicio.getMonth() + 1;
  const mesFim = s.getMonth() + 1;

  // Admitido e desligado no mesmo mês: um mês, e só se deu 15 dias.
  if (mesFim === mesInicio) {
    return (s.getDate() - inicio.getDate() + 1) >= 15 ? 1 : 0;
  }

  let meses = mesFim - mesInicio + 1;
  // O mês da ADMISSÃO só conta se sobraram 15 dias ou mais nele.
  if ((diasDoMes(ano, mesInicio) - inicio.getDate() + 1) < 15) meses -= 1;
  // O mês da SAÍDA só conta se teve 15 dias ou mais.
  if (s.getDate() < 15) meses -= 1;
  return Math.max(0, Math.min(12, meses));
}

/**
 * A rescisão completa.
 *
 * `contexto` traz o que os outros módulos já sabem: as férias gozadas,
 * as faltas do ponto e o saldo do FGTS informado pela empresa (o extrato
 * é do banco, não do ERP).
 */
function calcularRescisao({ colaborador, kind = 'sem_justa_causa', exit_date, notice = 'indenizado', contexto = {} }) {
  const adm = colaborador?.admission_data || {};
  const admissao = adm.start_date || (colaborador?.created_at || '').slice(0, 10);
  const saida = exit_date;
  const base = valor(adm.salary);
  const valorDia = base / 30;

  const anos = anosDeCasa(admissao, saida);
  const avisoDias = diasDeAviso(admissao, saida);

  // ── Saldo de salário: dias trabalhados no mês da saída ──
  // Quem foi admitido DENTRO do mês da saída não recebe o mês inteiro:
  // a contagem começa no dia em que ele entrou.
  const primeiroDoMes = `${String(saida).slice(0, 7)}-01`;
  const inicioNoMes = admissao && admissao > primeiroDoMes ? admissao : primeiroDoMes;
  const diasSaldo = Math.max(0, Math.round((new Date(saida) - new Date(inicioNoMes)) / DIA) + 1);
  const saldoSalario = round2(diasSaldo * valorDia);

  // ── Aviso prévio ────────────────────────────────────────
  // Indenizado só existe quando a EMPRESA dispensa sem justa causa (ou
  // metade, no acordo). Pedido de demissão e justa causa não geram.
  let avisoValor = 0;
  if (notice === 'indenizado') {
    if (kind === 'sem_justa_causa') avisoValor = round2(avisoDias * valorDia);
    else if (kind === 'acordo') avisoValor = round2((avisoDias * valorDia) / 2);
  }
  // Pedido de demissão sem cumprir o aviso: a empresa DESCONTA os 30
  // dias. Mas se foi a empresa que DISPENSOU o cumprimento, não há o
  // que descontar — quem abriu mão do aviso foi ela.
  const avisoDescontado = (kind === 'pedido_demissao' && notice === 'indenizado')
    ? round2(30 * valorDia) : 0;

  // ── 13º proporcional ────────────────────────────────────
  const mesesDecimo = Math.max(0, Math.min(12, mesesParaDecimo(admissao, saida)));
  // Justa causa não perde o 13º proporcional (Súmula 14 do TST trata do
  // aviso; o 13º proporcional é devido em quase todos os casos, exceto
  // justa causa — aqui seguimos a leitura mais comum e marcamos como tal).
  const decimo = kind === 'justa_causa' ? 0 : round2((base / 12) * mesesDecimo);

  // ── Férias: vencidas + proporcionais + 1/3 ──────────────
  const s = saldoDeFerias({
    admissao,
    gozadas: contexto.ferias || [],
    faltasPorPeriodo: contexto.faltasPorPeriodo || {},
    hoje: saida,
  });
  const vencidas = s.periodos.filter(p => p.fechado).reduce((acc, p) => acc + p.saldo, 0);
  const aberto = s.periodos.find(p => !p.fechado);
  const proporcionais = aberto ? aberto.saldo : 0;

  // Justa causa perde as proporcionais; as VENCIDAS são sempre devidas.
  const diasFerias = kind === 'justa_causa' ? vencidas : (vencidas + proporcionais);
  const feriasValor = round2(diasFerias * valorDia);
  const tercoFerias = round2(feriasValor / 3);

  // ── FGTS ────────────────────────────────────────────────
  // O saldo real vem do extrato (Caixa/FGTS Digital). Sem ele, a multa
  // é ESTIMADA sobre 8% de cada mês trabalhado — e vai marcada como
  // estimativa, porque pagar multa por cima de saldo chutado é errar
  // para os dois lados.
  const mesesTotais = Math.max(0, Math.round((new Date(saida) - new Date(admissao)) / (30 * DIA)));
  const fgtsSaldoInformado = contexto.fgts_saldo != null ? Number(contexto.fgts_saldo) : null;
  const fgtsSaldo = fgtsSaldoInformado != null ? fgtsSaldoInformado : round2(base * 0.08 * mesesTotais);
  const pctMulta = { sem_justa_causa: 0.4, acordo: 0.2 }[kind] || 0;
  const multaFgts = round2(fgtsSaldo * pctMulta);
  const podeSacar = ['sem_justa_causa', 'acordo', 'termino_contrato'].includes(kind);

  // ── Verbas ──────────────────────────────────────────────
  const verbas = [
    { rubrica: 'Saldo de salário', valor: saldoSalario, tipo: 'provento', ref: `${diasSaldo} dia(s)`, tributavel: true },
    ...(avisoValor ? [{ rubrica: `Aviso prévio indenizado (${avisoDias} dias${kind === 'acordo' ? ', 50%' : ''})`, valor: avisoValor, tipo: 'provento', tributavel: false }] : []),
    ...(decimo ? [{ rubrica: '13º salário proporcional', valor: decimo, tipo: 'provento', ref: `${mesesDecimo}/12`, tributavel: true }] : []),
    ...(feriasValor ? [{ rubrica: `Férias (${vencidas ? `${vencidas}d vencidas` : ''}${vencidas && proporcionais && kind !== 'justa_causa' ? ' + ' : ''}${kind !== 'justa_causa' && proporcionais ? `${proporcionais}d proporcionais` : ''})`, valor: feriasValor, tipo: 'provento', tributavel: false }] : []),
    ...(tercoFerias ? [{ rubrica: '1/3 constitucional', valor: tercoFerias, tipo: 'provento', tributavel: false }] : []),
    ...(multaFgts ? [{ rubrica: `Multa do FGTS (${pctMulta * 100}%)`, valor: multaFgts, tipo: 'provento', tributavel: false, estimado: fgtsSaldoInformado == null }] : []),
  ];

  // ── Descontos ───────────────────────────────────────────
  // INSS e IRRF incidem sobre as verbas SALARIAIS; as indenizatórias
  // (aviso, férias indenizadas, 1/3, multa) não sofrem incidência.
  const baseTributavel = round2(verbas.filter(v => v.tributavel).reduce((sm, v) => sm + v.valor, 0));
  const inss = round2(calcINSS(baseTributavel));
  const irrf = round2(Math.max(0, calcIRRF(baseTributavel, inss)));

  const descontos = [
    ...(avisoDescontado ? [{ rubrica: 'Aviso prévio não cumprido', valor: avisoDescontado, tipo: 'desconto' }] : []),
    ...(inss ? [{ rubrica: 'INSS sobre verbas salariais', valor: inss, tipo: 'desconto' }] : []),
    ...(irrf ? [{ rubrica: 'IRRF', valor: irrf, tipo: 'desconto' }] : []),
  ];

  const proventos = round2(verbas.reduce((sm, v) => sm + v.valor, 0));
  const totalDescontos = round2(descontos.reduce((sm, v) => sm + v.valor, 0));

  return {
    kind, exit_date: saida, notice,
    admissao, anos_de_casa: anos, meses_totais: mesesTotais,
    aviso_dias: avisoDias,
    ferias: { vencidas, proporcionais, dias: diasFerias },
    fgts: {
      saldo: fgtsSaldo,
      saldo_estimado: fgtsSaldoInformado == null,
      multa_pct: pctMulta * 100,
      multa: multaFgts,
      pode_sacar: podeSacar,
    },
    verbas, descontos,
    total_proventos: proventos,
    total_descontos: totalDescontos,
    liquido: round2(proventos - totalDescontos),
    // O que a tela precisa avisar em voz alta.
    observacoes: [
      ...(round2(proventos - totalDescontos) < 0
        ? ['O desconto do aviso é maior que as verbas: a rescisão fecha NEGATIVA. Confira o art. 477 § 5º antes de cobrar a diferença.'] : []),
      ...(fgtsSaldoInformado == null
        ? ['Saldo do FGTS ESTIMADO (8% por mês trabalhado). Informe o saldo do extrato para a multa sair exata.'] : []),
      ...(kind === 'justa_causa'
        ? ['Justa causa: sem aviso, sem multa, sem 13º proporcional e sem férias proporcionais. Só as férias VENCIDAS são devidas.'] : []),
      ...(kind === 'acordo'
        ? ['Acordo (art. 484-A): metade do aviso, multa de 20% e saque de até 80% do FGTS. Não dá direito ao seguro-desemprego.'] : []),
      ...(kind === 'pedido_demissao'
        ? ['Pedido de demissão: sem multa do FGTS e sem saque. Não dá direito ao seguro-desemprego.'] : []),
      'INSS e IRRF calculados sobre as verbas salariais; verbas indenizatórias não sofrem incidência.',
    ],
  };
}

/**
 * O que este desligamento EXIGE — e o que não exige.
 *
 * Homologação no sindicato deixou de ser obrigatória para todo mundo
 * (Reforma de 2017): ela depende da CCT aplicável. Exame demissional
 * também é condicional — a NR-7 dispensa quando há ASO recente. Tratar
 * os dois como obrigação padrão enche o checklist de tarefa falsa, e
 * checklist com tarefa falsa é checklist que ninguém cumpre.
 */
function exigencias({ kind, admissao, exit_date, ultimo_aso, cct_exige_homologacao = false }) {
  const meses = admissao && exit_date
    ? Math.round((new Date(exit_date) - new Date(admissao)) / (30 * DIA)) : 0;

  // NR-7: dispensa o demissional se o último ASO tem menos de 135 dias
  // (risco baixo) — usamos 90 como régua conservadora e configurável.
  const diasDesdeASO = ultimo_aso
    ? Math.round((new Date(exit_date) - new Date(ultimo_aso)) / DIA) : null;

  return {
    exame_demissional: {
      exigido: diasDesdeASO == null || diasDesdeASO > 90,
      motivo: diasDesdeASO == null
        ? 'Sem ASO recente no prontuário.'
        : (diasDesdeASO > 90 ? `Último ASO há ${diasDesdeASO} dias.` : `ASO de ${diasDesdeASO} dias atrás dispensa o demissional.`),
    },
    homologacao: {
      exigida: !!cct_exige_homologacao,
      motivo: cct_exige_homologacao
        ? 'A CCT aplicável exige homologação.'
        : 'Não é obrigatória por lei desde 2017 — só quando a CCT exigir.',
    },
    prazo_pagamento: {
      dias: 10,
      motivo: 'Art. 477 da CLT: até 10 dias corridos do término do contrato.',
    },
    seguro_desemprego: ['sem_justa_causa'].includes(kind),
    saque_fgts: ['sem_justa_causa', 'acordo', 'termino_contrato'].includes(kind),
    meses_de_casa: meses,
  };
}

module.exports = { calcularRescisao, exigencias, diasDeAviso, anosDeCasa, valor };
