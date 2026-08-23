// ============================================================
// A CONTA DAS FÉRIAS — UMA SÓ, PARA TODO MUNDO LER.
//
// Saldo de férias não é um número guardado: é uma CONTA feita a partir
// de três fatos — quando a pessoa foi admitida, quantos dias já gozou e
// quantas faltas teve. Guardar o saldo numa coluna seria criar um
// número que envelhece sozinho: passa a discordar do fato no dia
// seguinte, e ninguém descobre até alguém tirar férias a mais.
//
// Por isso esta biblioteca fica FORA das rotas: a tela de Férias, a
// Folha, o eSocial e o Desligamento fazem a mesma conta chamando o
// mesmo código. Duas implementações da mesma regra é como o RH acaba
// com dois saldos diferentes para a mesma pessoa.
//
// O QUE A LEI MANDA (CLT):
//
//   art. 130  as faltas injustificadas cortam dias de férias, em faixas
//   art. 134  o gozo acontece nos 12 meses seguintes ao período
//             aquisitivo — é o período CONCESSIVO
//   art. 137  passou do concessivo, as férias viram dobradas
//
// Nada disso é opinião do sistema: é a régua que o RH já usa no papel.
// ============================================================

const DIA = 864e5;

const iso = d => new Date(d).toISOString().slice(0, 10);
const soma = (data, dias) => iso(new Date(new Date(data).getTime() + dias * DIA));

/** Mesma data, N anos depois (respeitando 29/02). */
function maisAnos(dataISO, anos) {
  const d = new Date(dataISO + 'T00:00:00');
  d.setFullYear(d.getFullYear() + anos);
  return iso(d);
}

/** Meses inteiros completados entre duas datas. */
function mesesEntre(inicioISO, fimISO) {
  const a = new Date(inicioISO + 'T00:00:00');
  const b = new Date(fimISO + 'T00:00:00');
  let m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) m -= 1;
  return Math.max(0, m);
}

/**
 * Dias de férias a que a pessoa tem direito, conforme as faltas
 * INJUSTIFICADAS do período aquisitivo (CLT art. 130).
 *
 * Até 5 faltas: 30 dias. A partir daí a lei corta em degraus — e mais
 * de 32 faltas zera o direito daquele período.
 */
function diasPorFaltas(faltas = 0) {
  const f = Number(faltas) || 0;
  if (f <= 5) return 30;
  if (f <= 14) return 24;
  if (f <= 23) return 18;
  if (f <= 32) return 12;
  return 0;
}

/**
 * Os períodos aquisitivos da pessoa, da admissão até hoje.
 *
 * Cada período começa no aniversário de admissão e fecha 12 meses
 * depois. O período que ainda não fechou entra como `em_curso`: ele
 * acumula 1/12 de direito por mês trabalhado, e é isso que sustenta o
 * "saldo proporcional" que o desligamento vai precisar.
 */
function periodosAquisitivos(admissaoISO, hojeISO = iso(new Date())) {
  if (!admissaoISO) return [];
  const periodos = [];
  let inicio = admissaoISO;
  // Trava de segurança: 60 períodos são 60 anos de casa. Ninguém tem —
  // mas uma data de admissão digitada errada (1900) não pode travar o
  // servidor num laço infinito.
  for (let i = 0; i < 60; i++) {
    const fim = soma(maisAnos(inicio, 1), -1);      // 12 meses menos um dia
    const fechado = fim < hojeISO;
    periodos.push({
      inicio,
      fim,
      // Concessivo: os 12 meses SEGUINTES ao fechamento (art. 134)
      concessivo_fim: maisAnos(fim, 1),
      fechado,
      meses_trabalhados: fechado ? 12 : mesesEntre(inicio, hojeISO),
    });
    if (!fechado) break;
    inicio = soma(fim, 1);
  }
  return periodos;
}

/**
 * O saldo de férias de UMA pessoa.
 *
 * `gozadas` são as linhas de RH_FERIAS já concluídas ou em curso;
 * `faltas` é um mapa { 'AAAA-MM-DD_inicio': quantidade } por período
 * aquisitivo — quem conta falta é o ponto, não esta função.
 *
 * Devolve período a período, com o status que a tela precisa mostrar:
 *
 *   em_curso     ainda acumulando
 *   disponivel   fechado, dentro do prazo de gozo
 *   a_vencer     faltam menos de 90 dias para o fim do concessivo
 *   vencido      passou do concessivo — férias em dobro (art. 137)
 */
function saldoDeFerias({ admissao, gozadas = [], faltasPorPeriodo = {}, hoje = iso(new Date()) }) {
  const periodos = periodosAquisitivos(admissao, hoje).map(p => {
    const faltas = Number(faltasPorPeriodo[p.inicio] || 0);
    const direitoCheio = diasPorFaltas(faltas);
    // Período aberto rende 1/12 por mês trabalhado (2,5 dias/mês no caso
    // cheio) — é o proporcional que a rescisão paga.
    const direito = p.fechado
      ? direitoCheio
      : Math.floor((direitoCheio / 12) * p.meses_trabalhados);

    // Dias já gozados que pertencem a este período aquisitivo. Quem não
    // tem período marcado é atribuído pela data de início.
    const dias = gozadas
      .filter(g => g.kind === 'ferias' && g.status !== 'cancelled')
      .filter(g => (g.aquisitivo_inicio ? g.aquisitivo_inicio === p.inicio
        : (g.start_date >= p.inicio && g.start_date <= p.concessivo_fim)))
      .reduce((s, g) => s + (Number(g.days) || 0) + (Number(g.abono_dias) || 0), 0);

    const saldo = Math.max(0, direito - dias);
    const diasAteVencer = Math.round((new Date(p.concessivo_fim) - new Date(hoje)) / DIA);

    let status = 'em_curso';
    if (p.fechado) {
      if (saldo === 0) status = 'gozado';
      else if (diasAteVencer < 0) status = 'vencido';
      else if (diasAteVencer <= 90) status = 'a_vencer';
      else status = 'disponivel';
    }

    return { ...p, faltas, direito, gozados: dias, saldo, dias_ate_vencer: diasAteVencer, status };
  });

  const abertos = periodos.filter(p => p.saldo > 0);
  return {
    periodos,
    saldo_total: periodos.reduce((s, p) => s + p.saldo, 0),
    // O que a tela mostra na linha da pessoa: o período mais antigo com
    // saldo é o que precisa ser resolvido primeiro.
    periodo_atual: abertos[0] || periodos[periodos.length - 1] || null,
    tem_vencido: periodos.some(p => p.status === 'vencido'),
    tem_a_vencer: periodos.some(p => p.status === 'a_vencer'),
  };
}

/**
 * Regras do afastamento que mudam quem paga e o que o eSocial recebe.
 *
 *   até 15 dias   a empresa paga; nada de INSS
 *   16 dias ou +  do 16º em diante é o INSS (evento S-2230)
 *   mais de 30    o retorno exige exame médico (NR-7)
 */
function regrasAfastamento({ start_date, end_date }) {
  if (!start_date || !end_date) return { dias: 0, inss_apos_15: false, exame_retorno_exigido: false };
  const dias = Math.round((new Date(end_date) - new Date(start_date)) / DIA) + 1;
  return {
    dias,
    inss_apos_15: dias > 15,
    exame_retorno_exigido: dias > 30,
    dias_empresa: Math.min(dias, 15),
    dias_inss: Math.max(0, dias - 15),
  };
}

module.exports = {
  diasPorFaltas, periodosAquisitivos, saldoDeFerias, regrasAfastamento,
  mesesEntre, maisAnos, soma, iso,
};
