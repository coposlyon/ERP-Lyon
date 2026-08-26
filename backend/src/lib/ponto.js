const supabase = require('../config/supabase');

// Escala aplicável a um colaborador (por id explícito, scale_id ou nome).
async function getEscala(tenantId, employee_id, escala_id) {
  const fallback = { daily_minutes: 480, tolerance_minutes: 10, weekdays: [1,2,3,4,5], id: null };
  try {
    if (escala_id) {
      const { data } = await supabase.from('ESCALAS').select('*')
        .eq('tenant_id', tenantId).eq('id', escala_id).maybeSingle();
      if (data) return data;
    }
    const { data: emp } = await supabase.from('CLIENTES').select('admission_data')
      .eq('tenant_id', tenantId).eq('id', employee_id).maybeSingle();
    const adm = emp?.admission_data || {};
    if (adm.scale_id) {
      const { data } = await supabase.from('ESCALAS').select('*')
        .eq('tenant_id', tenantId).eq('id', adm.scale_id).maybeSingle();
      if (data) return data;
    }
    if (adm.scale) {
      const { data } = await supabase.from('ESCALAS').select('*')
        .eq('tenant_id', tenantId).eq('name', adm.scale).maybeSingle();
      if (data) return data;
    }
  } catch { /* fallback */ }
  return fallback;
}

function timeDiff(s, e) {
  if (!s || !e) return 0;
  const [sh,sm] = s.split(':').map(Number);
  const [eh,em] = e.split(':').map(Number);
  return Math.max(0, (eh*60+em) - (sh*60+sm));
}

function apurarDia({ total_minutes, hasMarks, expected, tolerance }) {
  const extra_minutes = Math.max(0, total_minutes - expected);
  let late_minutes = 0, status = 'worked';
  if (!hasMarks) status = 'absence';
  else {
    const shortfall = expected - total_minutes;
    if (shortfall > tolerance) { late_minutes = shortfall; status = 'late'; }
  }
  return { extra_minutes, late_minutes, status };
}

// Recalcula a apuração diária (RH_PONTO) a partir das marcações.
async function recomputeDay(tenantId, employee_id, work_date, escala_id, opts = {}) {
  const { data: marks } = await supabase
    .from('RH_MARCACOES').select('punch_time')
    .eq('tenant_id', tenantId).eq('employee_id', employee_id).eq('work_date', work_date)
    .order('punch_time');

  const times = (marks || []).map(m => String(m.punch_time).slice(0,5));
  let total = 0;
  for (let i = 0; i + 1 < times.length; i += 2) total += timeDiff(times[i], times[i+1]);
  const hasMarks = times.length > 0;

  const escala    = await getEscala(tenantId, employee_id, escala_id);
  const expected  = escala.daily_minutes ?? 480;
  const tolerance = escala.tolerance_minutes ?? 10;
  const { extra_minutes, late_minutes, status } = apurarDia({ total_minutes: total, hasMarks, expected, tolerance });

  const { data: existing } = await supabase
    .from('RH_PONTO').select('*')
    .eq('tenant_id', tenantId).eq('employee_id', employee_id).eq('work_date', work_date)
    .maybeSingle();

  const absence = opts.absence != null ? opts.absence : (existing?.absence || false);

  const payload = {
    tenant_id: tenantId, employee_id, work_date,
    entry1: times[0] || null, exit1: times[1] || null,
    entry2: times[2] || null, exit2: times[3] || null,
    total_minutes:    absence ? 0 : total,
    extra_minutes:    absence ? 0 : extra_minutes,
    expected_minutes: expected,
    late_minutes:     absence ? 0 : late_minutes,
    status:           absence ? 'absence' : status,
    escala_id:        escala.id || existing?.escala_id || null,
    absence,
    override_situation: existing?.override_situation || null,
    override_note:      existing?.override_note      || null,
    override_minutes:   existing?.override_minutes ?? null,
  };

  const { data, error } = await supabase
    .from('RH_PONTO')
    .upsert(payload, { onConflict: 'tenant_id,employee_id,work_date' })
    .select().single();
  if (error) throw error;
  return data;
}

// ============================================================
// O DIA DE HOJE, VISTO DE DENTRO.
//
// `recomputeDay` responde a pergunta do RH — "quanto essa pessoa
// trabalhou?" — e só sabe responder DEPOIS que o dia acabou. O
// colaborador faz outra pergunta, às 9h da manhã: "e agora, o que
// falta eu fazer?".
//
// As duas leem as MESMAS marcações e a MESMA escala. O que muda é o
// tempo verbal. Por isso esta função vive ao lado da outra, e não numa
// tela: no dia em que a escala ganhar intervalo variável, os dois
// tempos verbais mudam juntos.
//
// A leitura das batidas é posicional, igual à da apuração:
//   1ª entrada · 2ª saída para intervalo · 3ª retorno · 4ª saída.
// ============================================================

/**
 * A HORA DA EMPRESA, NÃO A DO SERVIDOR.
 *
 * A Discloud não roda no fuso de São Paulo, e `new Date()` do servidor
 * marcaria o ponto três horas fora. Todo mundo que precisa saber "que
 * horas são agora" pergunta aqui — o app de marcação e o portal
 * inclusive, para as duas telas nunca discordarem sobre que dia é hoje.
 */
function agoraSP() {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const pega = t => partes.find(p => p.type === t)?.value;
  const SEMANA = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${pega('year')}-${pega('month')}-${pega('day')}`,
    time: `${pega('hour')}:${pega('minute')}:${pega('second')}`,
    hhmm: `${pega('hour')}:${pega('minute')}`,
    weekday: SEMANA[pega('weekday')] ?? null,
  };
}

/** 'HH:MM' → minutos desde a meia-noite. */
function minutosDe(hhmm) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).slice(0, 5).split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
}

/** minutos desde a meia-noite → 'HH:MM' (passando da meia-noite, volta ao início). */
function paraHora(min) {
  if (min == null) return null;
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * O retrato do dia corrente para uma pessoa.
 *
 * @param escala      linha de ESCALAS (ou o fallback de getEscala)
 * @param marcacoes   horários 'HH:MM' do dia, em ordem
 * @param agora       'HH:MM' — passado de fora para o fuso ser decidido
 *                    em um lugar só (nowSP), e para o teste conseguir
 *                    fixar a hora
 * @param diaSemana   0=domingo … 6=sábado
 * @param folga       o dia já é sabidamente não-útil (feriado, férias,
 *                    afastamento) — quem sabe disso é quem chama
 */
function jornadaDoDia({ escala = {}, marcacoes = [], agora, diaSemana, folga = false }) {
  const entrada = escala.entry_time ? String(escala.entry_time).slice(0, 5) : null;
  const saida = escala.exit_time ? String(escala.exit_time).slice(0, 5) : null;
  const intervalo = escala.break_minutes ?? 60;
  const tolerancia = escala.tolerance_minutes ?? 10;
  const escalaDias = Array.isArray(escala.weekdays) ? escala.weekdays : [1, 2, 3, 4, 5];

  const t = (marcacoes || []).map(m => String(m).slice(0, 5)).filter(Boolean);
  const agoraMin = minutosDe(agora);
  const entradaMin = minutosDe(entrada);
  const saidaMin = minutosDe(saida);

  // Quanto já foi trabalhado: pares fechados + o par em aberto até agora.
  let trabalhado = 0;
  for (let i = 0; i + 1 < t.length; i += 2) trabalhado += Math.max(0, minutosDe(t[i + 1]) - minutosDe(t[i]));
  const dentro = t.length % 2 === 1;
  if (dentro && agoraMin != null) trabalhado += Math.max(0, agoraMin - minutosDe(t[t.length - 1]));

  const diaUtil = !folga && (diaSemana == null || escalaDias.includes(diaSemana));

  // O retorno do intervalo é o único horário que o sistema CALCULA em
  // vez de ler: sai da batida real de saída, não do horário previsto —
  // quem saiu 15 min atrasado para o almoço volta 15 min depois, e um
  // relógio que ignorasse isso acusaria atraso de quem cumpriu a pausa.
  const retornoPrevisto = t.length === 2 ? paraHora(minutosDe(t[1]) + intervalo) : null;

  let status, proximo = null;
  if (!diaUtil) {
    status = t.length ? 'trabalhando_na_folga' : 'folga';
  } else if (t.length === 0) {
    const atrasado = entradaMin != null && agoraMin != null && agoraMin > entradaMin + tolerancia;
    // Falta só depois do fim da jornada: antes disso ainda dá tempo de chegar.
    const acabou = saidaMin != null && agoraMin != null && agoraMin > saidaMin;
    status = acabou ? 'falta' : atrasado ? 'atraso' : 'aguardando';
    proximo = { acao: 'entrada', previsto: entrada };
  } else if (t.length === 1) {
    status = 'presente';
    // A escala guarda entrada e saída, não o horário do almoço. Dizer
    // um horário previsto aqui seria inventar um combinado que não
    // existe — o intervalo é quando a pessoa sair.
    proximo = { acao: 'intervalo', previsto: null };
  } else if (t.length === 2) {
    status = 'intervalo';
    proximo = { acao: 'retorno', previsto: retornoPrevisto };
  } else if (t.length === 3) {
    status = 'presente';
    proximo = { acao: 'saida', previsto: saida };
  } else {
    status = 'encerrado';
  }

  if (proximo) {
    const alvo = minutosDe(proximo.previsto);
    proximo.faltam_min = alvo != null && agoraMin != null ? alvo - agoraMin : null;
    proximo.atrasado = proximo.faltam_min != null && proximo.faltam_min < -tolerancia;
  }

  return {
    dia_util: diaUtil,
    status,
    escala: {
      nome: escala.name || null,
      entrada, saida,
      intervalo_min: intervalo,
      tolerancia_min: tolerancia,
      diaria_min: escala.daily_minutes ?? 480,
    },
    marcacoes: t,
    entrada_real: t[0] || null,
    saida_intervalo: t[1] || null,
    retorno_intervalo: t[2] || null,
    retorno_previsto: retornoPrevisto,
    saida_real: t[3] || null,
    trabalhado_min: trabalhado,
    falta_para_jornada_min: Math.max(0, (escala.daily_minutes ?? 480) - trabalhado),
    proximo,
  };
}

module.exports = { getEscala, timeDiff, apurarDia, recomputeDay, jornadaDoDia, agoraSP, minutosDe, paraHora };
