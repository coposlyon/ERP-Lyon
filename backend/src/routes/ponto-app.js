const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { recomputeDay, agoraSP } = require('../lib/ponto');
const { euSou, semVinculo } = require('../lib/euSou');

// App de marcação (self-service): qualquer colaborador logado bate o
// próprio ponto. NÃO é gated por módulo — todo funcionário usa.
//
// QUEM É O COLABORADOR e QUE HORAS SÃO AGORA são as duas perguntas
// desta tela, e as duas eram respondidas aqui dentro, do jeito daqui.
// Agora as duas vêm de lib/euSou.js e lib/ponto.js — as mesmas fontes
// que o Portal do Colaborador consulta. Enquanto cada tela casava
// e-mail do seu jeito, dava para abrir o portal e não conseguir bater
// o ponto com o mesmo login.

// Estado do dia: colaborador + marcações de hoje
router.get('/ponto', async (req, res) => {
  try {
    const emp = await euSou(req);
    if (!emp) return semVinculo(res);

    const { date } = agoraSP();
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
    const emp = await euSou(req);
    if (!emp) return semVinculo(res);

    const { date, time } = agoraSP();
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
