const express = require('express');
const router  = express.Router();
const supabase = require('../config/supabase');

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
router.get('/timesheet', async (req, res) => {
  const { employee_id, month } = req.query;
  if (!employee_id || !month)
    return res.status(400).json({ error: 'employee_id e month são obrigatórios' });
  const [year, m] = month.split('-');
  const daysInMonth = new Date(year, parseInt(m), 0).getDate();
  const startDate   = `${year}-${m}-01`;
  const endDate     = `${year}-${m}-${String(daysInMonth).padStart(2,'0')}`;
  try {
    const { data, error } = await supabase
      .from('RH_PONTO').select('*')
      .eq('tenant_id', req.tenantId).eq('employee_id', employee_id)
      .gte('work_date', startDate).lte('work_date', endDate)
      .order('work_date');
    if (error) throw error;
    res.json(data||[]);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/timesheet', async (req, res) => {
  const { employee_id, work_date, entry1, exit1, entry2, exit2, absence, justification, notes } = req.body;
  if (!employee_id || !work_date)
    return res.status(400).json({ error: 'employee_id e work_date são obrigatórios' });
  function timeDiff(s, e) {
    if (!s || !e) return 0;
    const [sh,sm] = s.split(':').map(Number);
    const [eh,em] = e.split(':').map(Number);
    return Math.max(0,(eh*60+em)-(sh*60+sm));
  }
  const total_minutes = timeDiff(entry1,exit1) + timeDiff(entry2,exit2);
  const extra_minutes = Math.max(0, total_minutes - 480);
  try {
    const { data, error } = await supabase
      .from('RH_PONTO')
      .upsert({
        tenant_id:    req.tenantId,
        employee_id,
        work_date,
        entry1:       entry1       || null,
        exit1:        exit1        || null,
        entry2:       entry2       || null,
        exit2:        exit2        || null,
        total_minutes,
        extra_minutes,
        absence:      absence      || false,
        justification:justification|| null,
        notes:        notes        || null,
      }, { onConflict: 'tenant_id,employee_id,work_date' })
      .select().single();
    if (error) throw error;
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
