const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// ── Helpers INSS / IRRF Brasil (tabela 2024) ──────────────
function calcINSS(gross) {
  if (gross <= 1412.00) return parseFloat((gross * 0.075).toFixed(2));
  if (gross <= 2666.68) return parseFloat((gross * 0.09).toFixed(2));
  if (gross <= 4000.03) return parseFloat((gross * 0.12).toFixed(2));
  if (gross <= 7786.02) return parseFloat((gross * 0.14).toFixed(2));
  return 908.86; // teto INSS 2024
}
function calcIRRF(gross, inss) {
  const base = gross - inss;
  if (base <= 2259.20) return 0;
  if (base <= 2826.65) return parseFloat((base * 0.075 - 169.44).toFixed(2));
  if (base <= 3751.05) return parseFloat((base * 0.15  - 381.44).toFixed(2));
  if (base <= 4664.68) return parseFloat((base * 0.225 - 662.77).toFixed(2));
  return parseFloat((base * 0.275 - 896.00).toFixed(2));
}

// ── PONTO ─────────────────────────────────────────────────

// Busca a escala aplicável a um colaborador (por escala_id explícita,
// ou via admission_data.scale_id / scale name). Fallback 8h / tol 10min.
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
  } catch { /* usa fallback */ }
  return fallback;
}

// Calcula apuração de um dia a partir das marcações + escala
function apurarDia({ total_minutes, hasMarks, expected, tolerance }) {
  const extra_minutes = Math.max(0, total_minutes - expected);
  let late_minutes = 0;
  let status = 'worked';
  if (!hasMarks) {
    status = 'absence';
  } else {
    const shortfall = expected - total_minutes;
    if (shortfall > tolerance) { late_minutes = shortfall; status = 'late'; }
    else                       { late_minutes = 0;         status = 'worked'; }
  }
  return { extra_minutes, late_minutes, status };
}

function timeDiff(s, e) {
  if (!s || !e) return 0;
  const [sh,sm] = s.split(':').map(Number);
  const [eh,em] = e.split(':').map(Number);
  return Math.max(0,(eh*60+em)-(sh*60+sm));
}

// Recalcula a apuração diária (RH_PONTO) a partir das marcações (RH_MARCACOES).
// Pareia as batidas em (entrada,saída) para somar o total trabalhado.
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

// Substitui TODAS as marcações de um dia e recalcula a apuração.
async function applyDayMarks(tenantId, userId, { employee_id, work_date, times = [], absence = false, escala_id }) {
  await supabase.from('RH_MARCACOES').delete()
    .eq('tenant_id', tenantId).eq('employee_id', employee_id).eq('work_date', work_date);

  if (!absence) {
    const clean = [...new Set(
      times.filter(t => /^\d{1,2}:\d{2}/.test(t)).map(t => String(t).slice(0,5))
    )].sort();
    if (clean.length) {
      const { error } = await supabase.from('RH_MARCACOES').insert(
        clean.map(t => ({
          tenant_id: tenantId, employee_id, work_date,
          punch_time: `${t}:00`, source: 'manual', registered_by: userId || null,
        }))
      );
      if (error) throw error;
    }
  }
  return recomputeDay(tenantId, employee_id, work_date, escala_id, { absence });
}

// Apuração do mês (RH_PONTO) + marcações embutidas em cada dia
router.get('/timesheet', async (req, res) => {
  const { employee_id, month } = req.query;
  if (!employee_id || !month)
    return res.status(400).json({ error: 'employee_id e month são obrigatórios' });
  const [year, m] = month.split('-');
  const daysInMonth = new Date(year, parseInt(m), 0).getDate();
  const startDate   = `${year}-${m}-01`;
  const endDate     = `${year}-${m}-${String(daysInMonth).padStart(2,'0')}`;
  try {
    const [{ data: ponto, error: e1 }, { data: marks, error: e2 }] = await Promise.all([
      supabase.from('RH_PONTO').select('*')
        .eq('tenant_id', req.tenantId).eq('employee_id', employee_id)
        .gte('work_date', startDate).lte('work_date', endDate).order('work_date'),
      supabase.from('RH_MARCACOES').select('id,work_date,punch_time,source')
        .eq('tenant_id', req.tenantId).eq('employee_id', employee_id)
        .gte('work_date', startDate).lte('work_date', endDate).order('punch_time'),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const byDate = {};
    (marks || []).forEach(mk => {
      (byDate[mk.work_date] ||= []).push({ id: mk.id, time: String(mk.punch_time).slice(0,5), source: mk.source });
    });

    const rows = (ponto || []).map(r => ({ ...r, marks: byDate[r.work_date] || [] }));
    // dias que têm marcações mas (por algum motivo) ainda não têm linha de apuração
    const pontoDates = new Set((ponto || []).map(r => r.work_date));
    Object.keys(byDate).forEach(d => {
      if (!pontoDates.has(d)) rows.push({ employee_id, work_date: d, marks: byDate[d] });
    });
    rows.sort((a, b) => a.work_date < b.work_date ? -1 : 1);
    res.json(rows);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Lista marcações brutas (para o app de marcação / auditoria)
router.get('/marcacoes', async (req, res) => {
  const { employee_id, month, work_date } = req.query;
  try {
    let query = supabase.from('RH_MARCACOES').select('*')
      .eq('tenant_id', req.tenantId).order('work_date').order('punch_time');
    if (employee_id) query = query.eq('employee_id', employee_id);
    if (work_date)   query = query.eq('work_date', work_date);
    if (month) {
      const [y, mm] = month.split('-');
      const dim = new Date(y, parseInt(mm), 0).getDate();
      query = query.gte('work_date', `${y}-${mm}-01`).lte('work_date', `${y}-${mm}-${String(dim).padStart(2,'0')}`);
    }
    const { data, error } = await query;
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Registra UMA batida (entrada/saída) — usado pelo futuro app de marcação
router.post('/marcacoes', async (req, res) => {
  const { employee_id, work_date, time, source = 'app', device, latitude, longitude, notes } = req.body;
  if (!employee_id || !work_date || !time)
    return res.status(400).json({ error: 'employee_id, work_date e time são obrigatórios' });
  try {
    const { error } = await supabase.from('RH_MARCACOES').insert({
      tenant_id: req.tenantId, employee_id, work_date,
      punch_time: String(time).length === 5 ? `${time}:00` : time,
      source, device: device || null,
      latitude: latitude ?? null, longitude: longitude ?? null,
      registered_by: req.user?.id || null, notes: notes || null,
    });
    if (error) throw error;
    const ponto = await recomputeDay(req.tenantId, employee_id, work_date);
    res.status(201).json(ponto);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Substitui as marcações de um dia inteiro (editor manual do RH)
router.put('/marcacoes/day', async (req, res) => {
  const { employee_id, work_date, times = [], absence = false, escala_id } = req.body;
  if (!employee_id || !work_date)
    return res.status(400).json({ error: 'employee_id e work_date são obrigatórios' });
  try {
    const ponto = await applyDayMarks(req.tenantId, req.user?.id, { employee_id, work_date, times, absence, escala_id });
    res.json(ponto);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Remove uma batida específica e recalcula o dia
router.delete('/marcacoes/:id', async (req, res) => {
  try {
    const { data: mark } = await supabase.from('RH_MARCACOES')
      .select('employee_id,work_date').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    await supabase.from('RH_MARCACOES').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (mark) await recomputeDay(req.tenantId, mark.employee_id, mark.work_date);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Compat: editor antigo (entry1..exit2) → grava como marcações e recalcula
router.put('/timesheet', async (req, res) => {
  const { employee_id, work_date, entry1, exit1, entry2, exit2, absence, escala_id, times } = req.body;
  if (!employee_id || !work_date)
    return res.status(400).json({ error: 'employee_id e work_date são obrigatórios' });
  try {
    const list = Array.isArray(times) && times.length
      ? times
      : [entry1, exit1, entry2, exit2].filter(Boolean);
    const ponto = await applyDayMarks(req.tenantId, req.user?.id, {
      employee_id, work_date, times: list, absence: !!absence, escala_id,
    });
    res.json(ponto);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Ajusta APENAS a situação do dia (abonar, atestado, justificar, etc).
// Funciona mesmo em dias sem marcação (ex.: abonar uma falta).
// Passar override_situation = null/'' remove o ajuste.
router.put('/timesheet/situation', async (req, res) => {
  const { employee_id, work_date, override_situation, override_note, override_minutes, escala_id } = req.body;
  if (!employee_id || !work_date)
    return res.status(400).json({ error: 'employee_id e work_date são obrigatórios' });
  try {
    // pega registro existente (se houver) para preservar marcações
    const { data: existing } = await supabase
      .from('RH_PONTO').select('*')
      .eq('tenant_id', req.tenantId).eq('employee_id', employee_id).eq('work_date', work_date)
      .maybeSingle();

    const escala = await getEscala(req.tenantId, employee_id, escala_id || existing?.escala_id);

    const payload = {
      tenant_id:          req.tenantId,
      employee_id,
      work_date,
      entry1:             existing?.entry1 || null,
      exit1:              existing?.exit1  || null,
      entry2:             existing?.entry2 || null,
      exit2:              existing?.exit2  || null,
      total_minutes:      existing?.total_minutes  || 0,
      extra_minutes:      existing?.extra_minutes  || 0,
      expected_minutes:   existing?.expected_minutes ?? (escala.daily_minutes ?? 480),
      late_minutes:       existing?.late_minutes   || 0,
      status:             existing?.status || (existing?.entry1 ? 'worked' : 'absence'),
      escala_id:          escala.id || existing?.escala_id || null,
      absence:            existing?.absence || false,
      override_situation: override_situation || null,
      override_note:      override_note      || null,
      override_minutes:   override_minutes != null ? Number(override_minutes) : null,
    };

    const { data, error } = await supabase
      .from('RH_PONTO')
      .upsert(payload, { onConflict: 'tenant_id,employee_id,work_date' })
      .select().single();
    if (error) throw error;
    audit(req, 'situation', 'ponto', `${employee_id}:${work_date}`, {
      override_situation: override_situation || null,
      override_note: override_note || null,
    });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/timesheet/:id', async (req, res) => {
  try {
    await supabase.from('RH_PONTO').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FÉRIAS ─────────────────────────────────────────────────
router.get('/vacation', async (req, res) => {
  const { employee_id, status } = req.query;
  try {
    let query = supabase
      .from('RH_FERIAS')
      .select('*, CLIENTES(id,name,admission_data)')
      .eq('tenant_id', req.tenantId)
      .order('start_date', { ascending: false });
    if (employee_id) query = query.eq('employee_id', employee_id);
    if (status)      query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data||[]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/vacation', async (req, res) => {
  const { employee_id, start_date, end_date, notes } = req.body;
  if (!employee_id || !start_date || !end_date)
    return res.status(400).json({ error: 'Colaborador e datas são obrigatórios' });
  const days = Math.round((new Date(end_date) - new Date(start_date)) / 86400000) + 1;
  try {
    const { data, error } = await supabase
      .from('RH_FERIAS')
      .insert({
        tenant_id:   req.tenantId,
        employee_id,
        start_date,
        end_date,
        days,
        status:      'scheduled',
        approved_by: req.user.id,
        notes:       notes || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/vacation/:id', async (req, res) => {
  const { status, notes } = req.body;
  try {
    const { data, error } = await supabase
      .from('RH_FERIAS')
      .update({ status, notes, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/vacation/:id', async (req, res) => {
  try {
    await supabase.from('RH_FERIAS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── FOLHA DE PAGAMENTO ────────────────────────────────────
router.get('/payroll', async (req, res) => {
  const { employee_id, month, status } = req.query;
  try {
    let query = supabase
      .from('RH_SALARIOS')
      .select('*, CLIENTES(id,name,admission_data)')
      .eq('tenant_id', req.tenantId)
      .order('reference_month', { ascending: false });
    if (employee_id) query = query.eq('employee_id', employee_id);
    if (month)       query = query.eq('reference_month', month);
    if (status)      query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data||[]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Simula folha (sem salvar) para preview
router.post('/payroll/simulate', async (req, res) => {
  const { base_salary=0, bonus=0, overtime_pay=0, other_additions=0, other_deductions=0 } = req.body;
  const gross         = Number(base_salary)+Number(bonus)+Number(overtime_pay)+Number(other_additions);
  const inss          = calcINSS(gross);
  const irrf          = Math.max(0, calcIRRF(gross, inss));
  const fgts          = parseFloat((gross * 0.08).toFixed(2));
  const net           = parseFloat((gross - inss - irrf - Number(other_deductions)).toFixed(2));
  res.json({ gross_salary:gross, inss_deduction:inss, irrf_deduction:irrf, fgts_value:fgts, net_salary:net });
});

router.post('/payroll', async (req, res) => {
  const {
    employee_id, reference_month, base_salary,
    bonus=0, overtime_pay=0, other_additions=0, other_deductions=0,
    payment_method, notes
  } = req.body;
  if (!employee_id || !reference_month || !base_salary)
    return res.status(400).json({ error: 'Colaborador, mês e salário base são obrigatórios' });
  const gross = Number(base_salary)+Number(bonus)+Number(overtime_pay)+Number(other_additions);
  const inss  = calcINSS(gross);
  const irrf  = Math.max(0, calcIRRF(gross, inss));
  const fgts  = parseFloat((gross * 0.08).toFixed(2));
  const net   = parseFloat((gross - inss - irrf - Number(other_deductions)).toFixed(2));
  try {
    const { data, error } = await supabase
      .from('RH_SALARIOS')
      .upsert({
        tenant_id:       req.tenantId,
        employee_id,
        reference_month,
        base_salary:     Number(base_salary),
        bonus:           Number(bonus),
        overtime_pay:    Number(overtime_pay),
        other_additions: Number(other_additions),
        gross_salary:    gross,
        inss_deduction:  inss,
        irrf_deduction:  irrf,
        other_deductions:Number(other_deductions),
        fgts_value:      fgts,
        net_salary:      net,
        status:          'draft',
        payment_method:  payment_method || null,
        notes:           notes || null,
      }, { onConflict: 'tenant_id,employee_id,reference_month' })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/payroll/:id/status', async (req, res) => {
  const { status, payment_date } = req.body;
  if (!['draft','approved','paid'].includes(status))
    return res.status(400).json({ error: 'Status inválido' });
  try {
    const upd = { status };
    if (status === 'paid' && payment_date) upd.payment_date = payment_date;
    const { data, error } = await supabase
      .from('RH_SALARIOS').update(upd)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    audit(req, 'status', 'payroll', req.params.id, { status, net_salary: data?.net_salary });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/payroll/:id', async (req, res) => {
  try {
    await supabase.from('RH_SALARIOS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DOCUMENTOS ────────────────────────────────────────────
router.get('/documents', async (req, res) => {
  const { employee_id, type } = req.query;
  try {
    let query = supabase
      .from('RH_DOCUMENTOS')
      .select('*, CLIENTES(id,name)')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (employee_id) query = query.eq('employee_id', employee_id);
    if (type)        query = query.eq('type', type);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data||[]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/documents', async (req, res) => {
  const { employee_id, type, description, document_date, file_url, notes } = req.body;
  if (!employee_id || !type || !description)
    return res.status(400).json({ error: 'Colaborador, tipo e descrição são obrigatórios' });
  try {
    const { data, error } = await supabase
      .from('RH_DOCUMENTOS')
      .insert({
        tenant_id:     req.tenantId,
        employee_id,
        type,
        description,
        document_date: document_date || null,
        file_url:      file_url      || null,
        notes:         notes         || null,
      })
      .select().single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/documents/:id', async (req, res) => {
  try {
    await supabase.from('RH_DOCUMENTOS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Resumo geral RH ───────────────────────────────────────
router.get('/summary', async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const month = today.slice(0, 7);
    const [{ data: payroll }, { data: vacation }, { data: timesheet }] = await Promise.all([
      supabase.from('RH_SALARIOS').select('status,net_salary,gross_salary').eq('tenant_id', req.tenantId).eq('reference_month', month),
      supabase.from('RH_FERIAS').select('status,start_date,end_date').eq('tenant_id', req.tenantId).in('status',['scheduled','active']),
      supabase.from('RH_PONTO').select('extra_minutes,absence').eq('tenant_id', req.tenantId).gte('work_date', `${month}-01`),
    ]);
    res.json({
      payroll: {
        total_net:    payroll?.reduce((s,p)=>s+(p.net_salary||0),0)||0,
        total_gross:  payroll?.reduce((s,p)=>s+(p.gross_salary||0),0)||0,
        paid:         payroll?.filter(p=>p.status==='paid').length||0,
        pending:      payroll?.filter(p=>p.status!=='paid').length||0,
      },
      vacation:  vacation?.length||0,
      absences:  timesheet?.filter(t=>t.absence).length||0,
      extra_hours: Math.round((timesheet?.reduce((s,t)=>s+(t.extra_minutes||0),0)||0) / 60),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
