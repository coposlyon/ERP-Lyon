const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { recomputeDay } = require('../lib/ponto');

// App de marcação (self-service): qualquer colaborador logado bate o
// próprio ponto. NÃO é gated por módulo — todo funcionário usa.

// Data/hora no fuso de São Paulo
function nowSP() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}:${get('second')}`,
  };
}

// Resolve o colaborador (CLIENTES type CO) do usuário logado pelo e-mail
async function getMyEmployee(req) {
  const { data } = await supabase
    .from('CLIENTES').select('id, name, admission_data, address')
    .eq('tenant_id', req.tenantId).eq('type', 'CO')
    .eq('email', req.user.email).maybeSingle();
  return data;
}

// Estado do dia: colaborador + marcações de hoje
router.get('/ponto', async (req, res) => {
  try {
    const emp = await getMyEmployee(req);
    if (!emp) {
      return res.status(404).json({
        error: 'Seu acesso não está vinculado a um cadastro de colaborador com o mesmo e-mail.',
        code: 'NO_EMPLOYEE',
      });
    }
    const { date } = nowSP();
    const { data: marks } = await supabase
      .from('RH_MARCACOES').select('id, punch_time, source')
      .eq('tenant_id', req.tenantId).eq('employee_id', emp.id).eq('work_date', date)
      .order('punch_time');

    res.json({
      employee: { id: emp.id, name: emp.name, sector: emp.admission_data?.sector || null },
      work_date: date,
      marks: (marks || []).map(m => ({ id: m.id, time: String(m.punch_time).slice(0,5), source: m.source })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Registra uma batida do próprio colaborador
router.post('/ponto/punch', async (req, res) => {
  const { latitude, longitude } = req.body;
  try {
    const emp = await getMyEmployee(req);
    if (!emp) return res.status(404).json({ error: 'Colaborador não encontrado', code: 'NO_EMPLOYEE' });

    const { date, time } = nowSP();
    const { error } = await supabase.from('RH_MARCACOES').insert({
      tenant_id: req.tenantId, employee_id: emp.id,
      work_date: date, punch_time: time, source: 'app',
      latitude: latitude ?? null, longitude: longitude ?? null,
      registered_by: req.user.id,
    });
    if (error) throw error;

    // recalcula a apuração do dia
    await recomputeDay(req.tenantId, emp.id, date);

    const { data: marks } = await supabase
      .from('RH_MARCACOES').select('id, punch_time, source')
      .eq('tenant_id', req.tenantId).eq('employee_id', emp.id).eq('work_date', date)
      .order('punch_time');

    res.status(201).json({
      success: true,
      time: time.slice(0, 5),
      marks: (marks || []).map(m => ({ id: m.id, time: String(m.punch_time).slice(0,5), source: m.source })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
