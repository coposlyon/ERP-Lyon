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

module.exports = { getEscala, timeDiff, apurarDia, recomputeDay };
