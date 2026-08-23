// ============================================================
// JORNADA / PONTO e OCORRÊNCIAS — as duas telas do mesmo fato.
//
// O ponto registra; a ocorrência trata. Elas leem a MESMA linha: é isso
// que impede o cartão dizer "0 críticas" enquanto a lista mostra uma
// crítica vencida (o defeito do item 6).
//
// PERCENTUAL SOBRE QUEM ESTAVA ESCALADO. "90% de presença" calculado
// sobre o quadro inteiro mente todo sábado, quando metade da empresa
// não trabalha. Aqui o denominador é quem tinha jornada NAQUELE dia,
// segundo a escala do cadastro (item 5).
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { justificar } = require('../lib/ocorrencias');
const { notificar, MENSAGENS } = require('../lib/notificacoes');

const DIA = 864e5;
const hojeISO = () => new Date().toISOString().slice(0, 10);
const dBR = d => String(d || '').slice(0, 10).split('-').reverse().join('/');

async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) { return { linhas: [], ok: false, erro: e.message }; }
}

/** A escala de cada pessoa, resolvida uma vez só. */
async function escalasPorPessoa(tenantId, pessoas) {
  const { data: escalas } = await supabase.from('ESCALAS').select('*').eq('tenant_id', tenantId);
  const porId = Object.fromEntries((escalas || []).map(e => [e.id, e]));
  const mapa = {};
  for (const p of pessoas) {
    const id = p.admission_data?.scale_id;
    mapa[p.id] = porId[id] || null;
  }
  return { mapa, escalas: escalas || [] };
}

/** Quem tinha jornada neste dia, segundo a escala do cadastro. */
function escaladoNoDia(escala, dataISO) {
  if (!escala) return false;
  const dow = new Date(`${dataISO}T12:00:00`).getDay();      // 0=Dom
  const dias = Array.isArray(escala.weekdays) ? escala.weekdays : [1, 2, 3, 4, 5];
  return dias.includes(dow);
}

/**
 * GET /api/rh/ponto?data=AAAA-MM-DD
 * O dia inteiro numa leitura: marcações, atrasos, faltas, intervalos em
 * aberto, justificativas pendentes e a semana para o gráfico.
 */
router.get('/ponto', async (req, res) => {
  const t = req.tenantId;
  const data = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.data || '')) ? req.query.data : hojeISO();
  const semanaInicio = new Date(new Date(data).getTime() - 6 * DIA).toISOString().slice(0, 10);
  const avisos = [];

  try {
    const [colab, ponto, marcacoes, ocor, ferias] = await Promise.all([
      tentar(() => supabase.from('CLIENTES')
        .select('id, name, is_active, admission_data').eq('tenant_id', t).eq('type', 'CO')),
      tentar(() => supabase.from('RH_PONTO').select('*')
        .eq('tenant_id', t).gte('work_date', semanaInicio).lte('work_date', data)),
      tentar(() => supabase.from('RH_MARCACOES').select('*')
        .eq('tenant_id', t).eq('work_date', data).order('punch_time')),
      tentar(() => supabase.from('RH_OCORRENCIAS').select('*')
        .eq('tenant_id', t).gte('occurred_on', semanaInicio)),
      tentar(() => supabase.from('RH_FERIAS').select('employee_id, kind, start_date, end_date, status')
        .eq('tenant_id', t)),
    ]);
    for (const [n, r] of [['colaboradores', colab], ['ponto', ponto], ['marcações', marcacoes], ['ocorrências', ocor]]) {
      if (!r.ok) avisos.push(`${n}: ${r.erro}`);
    }

    const pessoas = colab.linhas.filter(c => c.is_active !== false);
    const { mapa: escalaDe, escalas } = await escalasPorPessoa(t, pessoas);
    const nomeDe = id => pessoas.find(p => p.id === id)?.name || '—';
    const setorDe = id => pessoas.find(p => p.id === id)?.admission_data?.sector || null;

    // Quem está fora hoje (férias/afastamento) não conta como escalado —
    // senão vira "falta" de quem está de atestado.
    const foraHoje = new Set(ferias.linhas
      .filter(f => (f.start_date || '') <= data && (f.end_date || '') >= data && f.status !== 'cancelled')
      .map(f => f.employee_id));

    const escalados = pessoas.filter(p => escaladoNoDia(escalaDe[p.id], data) && !foraHoje.has(p.id));
    const doDia = ponto.linhas.filter(p => p.work_date === data);
    const semEscala = pessoas.filter(p => !escalaDe[p.id]);
    if (semEscala.length) {
      avisos.push(`${semEscala.length} colaborador(es) sem escala no cadastro — ficam fora do cálculo do dia.`);
    }

    const presentes = doDia.filter(p => !p.absence && (p.entry1 || p.total_minutes > 0));
    const atrasados = doDia.filter(p => (p.late_minutes || 0) > 0);
    const faltantes = doDia.filter(p => p.absence);
    // Intervalo em aberto: bateu a saída do almoço e não voltou.
    const intervaloAberto = doDia.filter(p => p.exit1 && !p.entry2);

    const pct = n => (escalados.length ? Math.round((n / escalados.length) * 100) : null);

    // A semana para o gráfico — dia a dia, sempre sobre os escalados.
    const semana = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(new Date(data).getTime() - i * DIA).toISOString().slice(0, 10);
      const doD = ponto.linhas.filter(p => p.work_date === d);
      const escD = pessoas.filter(p => escaladoNoDia(escalaDe[p.id], d)).length;
      semana.push({
        data: d,
        escalados: escD,
        presentes: doD.filter(p => !p.absence).length,
        atrasos: doD.filter(p => (p.late_minutes || 0) > 0).length,
        faltas: doD.filter(p => p.absence).length,
        presenca_pct: escD ? Math.round((doD.filter(p => !p.absence).length / escD) * 100) : null,
      });
    }

    const marcasDoDia = marcacoes.linhas.map(m => ({
      ...m,
      colaborador: nomeDe(m.employee_id),
      setor: setorDe(m.employee_id),
      hora: String(m.punch_time || '').slice(0, 5),
    }));

    res.json({
      data,
      cartoes: {
        escalados: escalados.length,
        presentes: presentes.length,
        presentes_pct: pct(presentes.length),
        atrasos: atrasados.length,
        atrasos_pct: pct(atrasados.length),
        faltas: faltantes.length,
        faltas_pct: pct(faltantes.length),
        intervalos_abertos: intervaloAberto.length,
        justificativas_pendentes: ocor.linhas.filter(o => o.status === 'em_analise').length,
        horas_extras_min: doDia.reduce((s, p) => s + (p.extra_minutes || 0), 0),
      },
      marcacoes: marcasDoDia,
      atrasos_e_faltas: [...atrasados, ...faltantes].map(p => {
        const oc = ocor.linhas.find(o => o.employee_id === p.employee_id && o.occurred_on === p.work_date);
        const esc = escalaDe[p.employee_id];
        return {
          employee_id: p.employee_id,
          colaborador: nomeDe(p.employee_id),
          setor: setorDe(p.employee_id),
          tipo: p.absence ? 'falta' : 'atraso',
          minutos: p.late_minutes || null,
          entrada: String(p.entry1 || '').slice(0, 5) || null,
          previsto: String(esc?.entry_time || '').slice(0, 5) || null,
          tolerancia: esc?.tolerance_minutes ?? null,
          ocorrencia_id: oc?.id || null,
          ocorrencia_status: oc?.status || null,
          notificado: !!oc?.notificado_em,
          justificativa: oc?.description?.includes('Justificativa:') || false,
          documento: oc?.document_url || null,
        };
      }),
      intervalos_abertos: intervaloAberto.map(p => ({
        employee_id: p.employee_id, colaborador: nomeDe(p.employee_id),
        saiu: String(p.exit1 || '').slice(0, 5),
        previsto_voltar: String(escalaDe[p.employee_id]?.entry_time || '').slice(0, 5) || null,
        minutos_fora: (() => {
          const [h, m] = String(p.exit1 || '00:00').split(':').map(Number);
          const agora = new Date();
          return Math.max(0, (agora.getHours() * 60 + agora.getMinutes()) - (h * 60 + m));
        })(),
      })),
      // As regras vêm da escala do cadastro — nada é escrito na tela.
      regras: escalas.map(e => ({
        id: e.id, nome: e.name,
        entrada: String(e.entry_time || '').slice(0, 5),
        saida: String(e.exit_time || '').slice(0, 5),
        intervalo_min: e.break_minutes,
        tolerancia_min: e.tolerance_minutes,
        dias: e.weekdays,
        colaboradores: pessoas.filter(p => p.admission_data?.scale_id === e.id).length,
      })),
      semana,
      resumo: {
        fechados: doDia.length,
        escalados: escalados.length,
        fechamento_pct: escalados.length ? Math.round((doDia.length / escalados.length) * 100) : null,
        inconsistencias: {
          atrasos_sem_justificativa: atrasados.filter(p => {
            const oc = ocor.linhas.find(o => o.employee_id === p.employee_id && o.occurred_on === p.work_date);
            return !oc || oc.status === 'aberta';
          }).length,
          intervalos_abertos: intervaloAberto.length,
          marcacoes_impares: doDia.filter(p => p.entry1 && !p.exit1).length,
          sem_escala: semEscala.length,
        },
      },
      avisos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/rh/ocorrencias
 * A lista e os indicadores — da MESMA leitura, para não divergirem.
 */
router.get('/ocorrencias', async (req, res) => {
  const t = req.tenantId;
  const dias = Number(req.query.dias) || 30;
  const desde = new Date(Date.now() - dias * DIA).toISOString().slice(0, 10);

  try {
    const [ocor, colab] = await Promise.all([
      tentar(() => supabase.from('RH_OCORRENCIAS').select('*')
        .eq('tenant_id', t).gte('occurred_on', desde).order('occurred_on', { ascending: false })),
      tentar(() => supabase.from('CLIENTES').select('id, name, admission_data')
        .eq('tenant_id', t).eq('type', 'CO')),
    ]);

    const nomeDe = id => colab.linhas.find(p => p.id === id)?.name || '—';
    const setorDe = id => colab.linhas.find(p => p.id === id)?.admission_data?.sector || null;
    const agora = new Date();

    const lista = ocor.linhas.map(o => ({
      ...o,
      colaborador: nomeDe(o.employee_id),
      setor: setorDe(o.employee_id),
      vencida: !!(o.sla_due_at && new Date(o.sla_due_at) < agora && ['aberta', 'em_analise', 'encaminhada'].includes(o.status)),
      tem_documento: !!o.document_url,
    }));

    const abertas = lista.filter(o => ['aberta', 'em_analise', 'encaminhada'].includes(o.status));
    const vencidas = lista.filter(o => o.vencida);
    const porTipo = k => lista.filter(o => o.kind === k).length;

    res.json({
      periodo_dias: dias,
      cartoes: {
        abertas: abertas.length,
        em_analise: lista.filter(o => o.status === 'em_analise').length,
        justificadas: lista.filter(o => o.status === 'justificada' || o.status === 'aprovada').length,
        advertencias: porTipo('advertencia'),
        // Reincidência: pessoas com 3+ ocorrências no período.
        reincidentes: (() => {
          const c = {};
          for (const o of lista) c[o.employee_id] = (c[o.employee_id] || 0) + 1;
          return Object.values(c).filter(n => n >= 3).length;
        })(),
        // O MESMO número que a lista mostra — nada de "0 críticas" com
        // uma crítica vencida na tabela ao lado.
        criticas: vencidas.length,
      },
      por_categoria: {
        atrasos: porTipo('atraso'), faltas: porTipo('falta'),
        justificativas: porTipo('justificativa'), advertencias: porTipo('advertencia'),
        suspensoes: porTipo('suspensao'), outros: porTipo('outro'),
      },
      sla: (() => {
        const analisadas = lista.filter(o => o.decided_at);
        const noPrazo = analisadas.filter(o => !o.sla_due_at || new Date(o.decided_at) <= new Date(o.sla_due_at));
        return {
          total: lista.length,
          no_prazo: noPrazo.length,
          vencidas: vencidas.length,
          no_prazo_pct: analisadas.length ? Math.round((noPrazo.length / analisadas.length) * 100) : null,
        };
      })(),
      ocorrencias: lista,
      avisos: ocor.ok ? [] : [ocor.erro],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * PATCH /api/rh/ocorrencias/:id
 * A DECISÃO É HUMANA. A IA pontua e aponta reincidência; quem justifica,
 * aprova, recusa ou adverte é uma pessoa autorizada — e fica gravado
 * quem foi.
 */
router.patch('/ocorrencias/:id', async (req, res) => {
  const t = req.tenantId;
  const { acao, nota, severity } = req.body || {};
  const mapa = {
    analisar: 'em_analise', justificar: 'justificada', aprovar: 'aprovada',
    recusar: 'recusada', encaminhar: 'encaminhada', advertir: 'advertencia',
  };
  if (!mapa[acao]) return res.status(400).json({ error: 'Ação inválida.' });

  try {
    const patch = {
      status: acao === 'advertir' ? 'encaminhada' : mapa[acao],
      updated_at: new Date().toISOString(),
    };
    if (acao === 'advertir') patch.kind = 'advertencia';
    if (severity) patch.severity = severity;
    if (nota) patch.description = nota;
    // Ato humano: nome e hora.
    if (['justificar', 'aprovar', 'recusar', 'advertir'].includes(acao)) {
      patch.decided_by = req.userProfile?.id || null;
      patch.decided_at = new Date().toISOString();
    }

    const { data, error } = await supabase.from('RH_OCORRENCIAS')
      .update(patch).eq('tenant_id', t).eq('id', req.params.id).select().single();
    if (error) throw error;

    // Avisa o colaborador do desfecho — pelo mesmo canal do pedido.
    if (['aprovar', 'recusar'].includes(acao)) {
      const { data: pessoa } = await supabase.from('CLIENTES')
        .select('id, name, phone, mobile, admission_data')
        .eq('tenant_id', t).eq('id', data.employee_id).maybeSingle();
      if (pessoa) {
        const texto = acao === 'aprovar'
          ? MENSAGENS.justificativa_aprovada({ nome: (pessoa.name || '').split(' ')[0], data: dBR(data.occurred_on) })
          : MENSAGENS.justificativa_recusada({ nome: (pessoa.name || '').split(' ')[0], data: dBR(data.occurred_on), motivo: nota });
        await notificar(t, {
          employee_id: pessoa.id,
          telefone: pessoa.admission_data?.whatsapp_notificacoes || pessoa.phone || pessoa.mobile,
          mensagem: texto, motivo: 'justificativa', ref_type: 'ocorrencia', ref_id: data.id,
        });
      }
    }

    audit(req, acao, 'ocorrencia', req.params.id, { status: patch.status });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/ocorrencias/justificar
 * A justificativa que chega do portal do colaborador. Entra em análise
 * automaticamente — quem decide continua sendo gente.
 */
router.post('/ocorrencias/justificar', async (req, res) => {
  const { employee_id, occurred_on, texto, document_url } = req.body || {};
  if (!employee_id || !occurred_on || !texto) {
    return res.status(400).json({ error: 'Informe o colaborador, a data e a justificativa.' });
  }
  try {
    const oc = await justificar(req.tenantId, { employee_id, occurred_on, texto, document_url });
    res.status(201).json(oc);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** GET /api/rh/notificacoes — o que o sistema avisou (ou tentou). */
router.get('/notificacoes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('RH_NOTIFICACOES')
      .select('*').eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false }).limit(Number(req.query.limite) || 50);
    if (error) throw error;
    res.json({
      notificacoes: data || [],
      pendentes: (data || []).filter(n => n.status === 'pendente').length,
      falhas: (data || []).filter(n => n.status === 'falhou').length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
