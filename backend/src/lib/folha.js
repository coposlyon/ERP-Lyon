// ============================================================
// A FOLHA — MONTADA DOS FATOS, NÃO DIGITADA.
//
// Salário, benefícios e comissão já existem no sistema: o salário está
// no cadastro do colaborador, as faltas e as horas extras estão no
// ponto, as férias estão em RH_FERIAS e a comissão sai das vendas
// ENTREGUES do vendedor. Pedir para o RH digitar isso de novo no
// fechamento é pedir para a folha discordar do resto do ERP — e é a
// folha que vai para o contador.
//
// A COMISSÃO NÃO É CAMPO DESTA TELA (item 7). Ela vem da configuração
// do vendedor (percentual × vendas entregues). E quem não tem perfil
// comercial não recebe comissão de vendas automaticamente: sem
// `commission_pct` no cadastro, o campo nem aparece.
//
// O QUE ESTA BIBLIOTECA NÃO FAZ. Ela não inventa acordo coletivo, não
// aplica dissídio e não decide política de banco de horas. Onde a
// empresa tem uma escolha a fazer, o valor vem do cadastro ou fica
// zerado e visível — nunca "estimado" no escuro.
// ============================================================
const { calcINSS, calcIRRF } = require('./calc');

const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

/** Dinheiro guardado como texto ("2.500,00") ou número. */
function valor(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// A hora normal sai da jornada mensal do cadastro; sem ela, 220h — que
// é a conta padrão da CLT para 44h semanais.
const horasMes = adm => Number(adm?.monthly_hours) || 220;

/**
 * A folha de UMA pessoa numa competência.
 *
 * `fatos` é o que os outros módulos já sabem:
 *   faltas          dias com ausência no ponto
 *   atrasos_min     minutos de atraso somados
 *   extras_min      minutos de hora extra
 *   ferias          { dias, tem } — férias gozadas no mês
 *   afastamento     { dias_empresa, dias_inss }
 *   comissao        R$ apurados das vendas ENTREGUES
 */
function montarFolha({ colaborador, competencia, fatos = {}, kind = 'mensal' }) {
  const adm = colaborador.admission_data || {};
  const base = valor(adm.salary);
  const horas = horasMes(adm);
  const valorHora = horas ? base / horas : 0;
  const valorDia = base / 30;

  // ── Proventos ───────────────────────────────────────────
  const extras = round2((fatos.extras_min || 0) / 60 * valorHora * 1.5);
  const comissao = round2(fatos.comissao || 0);
  const feriasDias = fatos.ferias?.dias || 0;
  const feriasValor = round2(feriasDias * valorDia);
  // Um terço constitucional sobre os dias de férias gozados.
  const tercoFerias = round2(feriasValor / 3);

  const proventos = [
    { rubrica: 'Salário base', valor: round2(base), tipo: 'provento' },
    ...(extras ? [{ rubrica: 'Horas extras (50%)', valor: extras, tipo: 'provento', ref: `${Math.round((fatos.extras_min || 0) / 6) / 10}h` }] : []),
    ...(comissao ? [{ rubrica: 'Comissão sobre vendas entregues', valor: comissao, tipo: 'provento' }] : []),
    ...(feriasDias ? [{ rubrica: 'Férias', valor: feriasValor, tipo: 'provento', ref: `${feriasDias}d` }] : []),
    ...(feriasDias ? [{ rubrica: '1/3 constitucional', valor: tercoFerias, tipo: 'provento' }] : []),
  ];

  // ── Descontos que vêm do ponto ──────────────────────────
  const faltas = fatos.faltas || 0;
  const descFaltas = round2(faltas * valorDia);
  const atrasoH = (fatos.atrasos_min || 0) / 60;
  const descAtrasos = round2(atrasoH * valorHora);

  // Afastamento: do 16º dia em diante quem paga é o INSS — a empresa
  // não lança esses dias como salário.
  const diasINSS = fatos.afastamento?.dias_inss || 0;
  const descAfastamento = round2(diasINSS * valorDia);

  // ── Benefícios (do cadastro) ────────────────────────────
  const vt = valor(adm.benefit_vt);
  const vr = valor(adm.benefit_vr);
  const saude = valor(adm.benefit_health);
  const outros = valor(adm.benefit_other);
  // VT: a lei permite descontar até 6% do salário base.
  const descVT = vt ? round2(Math.min(vt, base * 0.06)) : 0;

  // ── Bases e impostos ────────────────────────────────────
  const bruto = round2(proventos.reduce((s, p) => s + p.valor, 0)
    - descFaltas - descAtrasos - descAfastamento);
  const inss = round2(calcINSS(bruto));
  const irrf = round2(Math.max(0, calcIRRF(bruto, inss)));
  const fgts = round2(bruto * 0.08);

  const descontos = [
    ...(descFaltas ? [{ rubrica: 'Faltas', valor: descFaltas, tipo: 'desconto', ref: `${faltas}d` }] : []),
    ...(descAtrasos ? [{ rubrica: 'Atrasos', valor: descAtrasos, tipo: 'desconto', ref: `${Math.round(atrasoH * 10) / 10}h` }] : []),
    ...(descAfastamento ? [{ rubrica: 'Afastamento (INSS)', valor: descAfastamento, tipo: 'desconto', ref: `${diasINSS}d` }] : []),
    { rubrica: 'INSS', valor: inss, tipo: 'desconto' },
    ...(irrf ? [{ rubrica: 'IRRF', valor: irrf, tipo: 'desconto' }] : []),
    ...(descVT ? [{ rubrica: 'Vale-transporte (6%)', valor: descVT, tipo: 'desconto' }] : []),
  ];

  const liquido = round2(bruto - inss - irrf - descVT);

  return {
    employee_id: colaborador.id,
    nome: colaborador.name,
    setor: adm.sector || null,
    cargo: adm.role || null,
    competencia,
    kind,
    base_salary: round2(base),
    // O que a tela mostra em colunas
    comissao,
    beneficios: { vt, vr, saude, outros, total: round2(vt + vr + saude + outros) },
    horas_extras_min: fatos.extras_min || 0,
    faltas,
    atrasos_min: fatos.atrasos_min || 0,
    gross_salary: bruto,
    inss_deduction: inss,
    irrf_deduction: irrf,
    fgts_value: fgts,
    descontos_total: round2(descFaltas + descAtrasos + descAfastamento + inss + irrf + descVT),
    net_salary: liquido,
    // O holerite: rubrica a rubrica, para o colaborador conferir
    rubricas: [...proventos, ...descontos],
    // De onde veio cada coisa — é isto que evita a pergunta "de onde
    // saiu esse número?" no dia do fechamento.
    origens: {
      salario: 'cadastro do colaborador',
      faltas_atrasos: 'apuração do ponto',
      extras: 'apuração do ponto',
      comissao: comissao ? 'vendas entregues × % do cadastro' : null,
      ferias: feriasDias ? 'RH_FERIAS (dias gozados no mês)' : null,
      beneficios: 'cadastro do colaborador',
    },
  };
}

/** Os encargos da empresa sobre a folha — o custo que não aparece no holerite. */
function encargos(linhas) {
  const bruto = linhas.reduce((s, l) => s + l.gross_salary, 0);
  const fgts = linhas.reduce((s, l) => s + l.fgts_value, 0);
  return {
    // INSS patronal 20% + RAT + terceiros varia por CNAE; sem a alíquota
    // cadastrada, informa a base e deixa o número explícito.
    base: round2(bruto),
    inss_patronal: round2(bruto * 0.20),
    rat_terceiros: null,           // depende do CNAE/FAP da empresa
    fgts: round2(fgts),
    // Provisões: 1/12 de 13º + 1/12 de férias + 1/3
    provisao_decimo: round2(bruto / 12),
    provisao_ferias: round2((bruto / 12) * (4 / 3)),
  };
}

module.exports = { montarFolha, encargos, valor, round2 };
