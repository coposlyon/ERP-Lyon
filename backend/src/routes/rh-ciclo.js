// ============================================================
// AS DUAS PONTAS DO CICLO: ADMISSÃO E DESLIGAMENTO.
//
// ADMISSÃO acompanha o PROCESSO — o cadastro em si continua sendo as
// cinco etapas aprovadas (Dados Pessoais → Dados Trabalhistas →
// Contrato e Políticas → Documentação → Revisão). Captação é a fase
// ANTERIOR ao início da admissão, não uma sexta etapa (item 4). E o
// andamento não é digitado: ele é lido do que já existe no cadastro e
// no prontuário de documentos.
//
// DESLIGAMENTO é UM processo que alimenta tudo (item 11): cálculo
// rescisório, documentos, bloqueio de acesso, exame demissional quando
// aplicável, eSocial e FGTS. Homologação e exame são CONDICIONAIS —
// tratá-los como obrigação de todo desligamento enche o checklist de
// tarefa falsa.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { calcularRescisao, exigencias } = require('../lib/rescisao');
const { saldoDeFerias } = require('../lib/ferias');

const hojeISO = () => new Date().toISOString().slice(0, 10);

async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) { return { linhas: [], ok: false, erro: e.message }; }
}

// As cinco etapas aprovadas. Captação vem antes e não conta como etapa.
const ETAPAS = [
  { key: 'dados_pessoais', n: 1, titulo: 'Dados Pessoais' },
  { key: 'dados_trabalhistas', n: 2, titulo: 'Dados Trabalhistas' },
  { key: 'contrato', n: 3, titulo: 'Contrato e Políticas' },
  { key: 'documentacao', n: 4, titulo: 'Documentação' },
  { key: 'revisao', n: 5, titulo: 'Revisão e Conclusão' },
];

/**
 * Em que etapa o cadastro REALMENTE está.
 *
 * Ninguém marca "concluí a etapa 2": o sistema olha o que foi
 * preenchido. Assim o andamento não mente quando alguém volta e apaga
 * um campo obrigatório.
 */
function andamento(pessoa, docs = [], temAcesso = false) {
  const adm = pessoa.admission_data || {};
  const feitas = {
    dados_pessoais: !!(pessoa.name && pessoa.cpf_cnpj && (pessoa.birth_date || adm.birth_date) && pessoa.address?.city),
    dados_trabalhistas: !!(adm.sector && adm.start_date && adm.salary && adm.scale_id),
    contrato: !!(adm.contrato_assinado_em || Object.values(adm.politicas || {}).some(Boolean)),
    documentacao: docs.length > 0,
    revisao: !adm.has_access || temAcesso,
  };
  const concluidas = ETAPAS.filter(e => feitas[e.key]);
  const atual = ETAPAS.find(e => !feitas[e.key]) || ETAPAS[ETAPAS.length - 1];
  return {
    etapas: ETAPAS.map(e => ({ ...e, concluida: feitas[e.key] })),
    etapa_atual: atual.key,
    etapa_atual_titulo: atual.titulo,
    concluidas: concluidas.length,
    total: ETAPAS.length,
    pct: Math.round((concluidas.length / ETAPAS.length) * 100),
    completa: concluidas.length === ETAPAS.length,
  };
}

/**
 * GET /api/rh/admissoes
 * Os processos em andamento, com o andamento LIDO do cadastro.
 */
router.get('/admissoes', async (req, res) => {
  const t = req.tenantId;
  const avisos = [];
  try {
    const [proc, colab, docs, usuarios] = await Promise.all([
      tentar(() => supabase.from('RH_ADMISSOES').select('*').eq('tenant_id', t).order('created_at', { ascending: false })),
      tentar(() => supabase.from('CLIENTES').select('id, name, cpf_cnpj, birth_date, address, is_active, created_at, admission_data')
        .eq('tenant_id', t).eq('type', 'CO')),
      tentar(() => supabase.from('RH_DOCUMENTOS').select('employee_id, doc_key').eq('tenant_id', t)),
      tentar(() => supabase.from('USUARIOS').select('email, is_active').eq('tenant_id', t)),
    ]);
    if (!proc.ok) avisos.push(`admissões: ${proc.erro}`);

    const emails = new Set(usuarios.linhas.filter(u => u.is_active !== false).map(u => String(u.email).toLowerCase()));
    const docsDe = id => docs.linhas.filter(d => d.employee_id === id);

    // Todo colaborador cujo cadastro ainda não fechou é uma admissão em
    // curso — mesmo que ninguém tenha aberto um "processo" formal.
    const emCurso = colab.linhas
      .filter(c => c.is_active !== false)
      .map(c => {
        const acesso = emails.has(String(c.admission_data?.access_email || '').toLowerCase());
        const a = andamento(c, docsDe(c.id), acesso);
        const processo = proc.linhas.find(p => p.employee_id === c.id) || null;
        return {
          employee_id: c.id,
          processo_id: processo?.id || null,
          nome: c.name,
          cargo: c.admission_data?.role || null,
          departamento: c.admission_data?.sector || null,
          admissao_prevista: c.admission_data?.start_date || null,
          responsavel: processo?.responsible_id || null,
          documentos: `${docsDe(c.id).length}`,
          ...a,
          status: a.completa ? 'concluida' : (docsDe(c.id).length ? 'em_andamento' : 'aguardando_docs'),
        };
      })
      .filter(p => !p.completa || String(p.admissao_prevista || '').slice(0, 7) === hojeISO().slice(0, 7));

    // Captação: candidato sem cadastro ainda — fase ANTERIOR à admissão.
    const captacao = proc.linhas.filter(p => !p.employee_id && p.status !== 'cancelada');

    const porEtapa = {};
    for (const e of ETAPAS) porEtapa[e.key] = emCurso.filter(p => p.etapa_atual === e.key && !p.completa).length;

    res.json({
      cartoes: {
        em_andamento: emCurso.filter(p => !p.completa).length,
        captacao: captacao.length,
        aguardando_documentos: emCurso.filter(p => p.status === 'aguardando_docs').length,
        concluidas_no_mes: emCurso.filter(p => p.completa).length,
        etapas: porEtapa,
      },
      // Captação vem ANTES do funil das cinco etapas (item 4).
      funil: [
        { fase: 'Captação', anterior: true, quantidade: captacao.length },
        ...ETAPAS.map(e => ({ fase: e.titulo, etapa: e.key, quantidade: porEtapa[e.key] })),
      ],
      processos: emCurso,
      captacao: captacao.map(c => ({
        id: c.id, nome: c.candidate_name, cargo: c.cargo_id, previsto: c.expected_date, status: c.status,
      })),
      avisos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** POST /api/rh/admissoes/captacao — candidato antes de virar cadastro. */
router.post('/admissoes/captacao', async (req, res) => {
  const { candidate_name, expected_date, department_id, cargo_id } = req.body || {};
  if (!candidate_name) return res.status(400).json({ error: 'Informe o nome do candidato.' });
  try {
    const { data, error } = await supabase.from('RH_ADMISSOES').insert({
      tenant_id: req.tenantId, candidate_name, expected_date: expected_date || null,
      department_id: department_id || null, cargo_id: cargo_id || null,
      stage: 'captacao', status: 'em_andamento', responsible_id: req.userProfile?.id || null,
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'admissao', data.id, { candidato: candidate_name });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── DESLIGAMENTOS ───────────────────────────────────────────

/** Junta o contexto que a rescisão precisa: férias, faltas, ASO. */
async function contextoDe(t, employeeId, exitDate) {
  const [{ data: ferias }, { data: faltas }, { data: docs }] = await Promise.all([
    supabase.from('RH_FERIAS').select('*').eq('tenant_id', t).eq('employee_id', employeeId),
    supabase.from('RH_PONTO').select('work_date').eq('tenant_id', t).eq('employee_id', employeeId).eq('absence', true),
    supabase.from('RH_DOCUMENTOS').select('doc_key, document_date').eq('tenant_id', t).eq('employee_id', employeeId),
  ]);
  const asos = (docs || []).filter(d => String(d.doc_key || '').startsWith('aso'))
    .sort((a, b) => String(b.document_date).localeCompare(String(a.document_date)));
  return { ferias: ferias || [], faltas: (faltas || []).map(f => f.work_date), ultimo_aso: asos[0]?.document_date || null };
}

/**
 * GET /api/rh/desligamentos
 * Processos abertos e o que cada um ainda exige.
 */
router.get('/desligamentos', async (req, res) => {
  const t = req.tenantId;
  try {
    const [desl, colab] = await Promise.all([
      tentar(() => supabase.from('RH_DESLIGAMENTOS').select('*').eq('tenant_id', t).order('created_at', { ascending: false })),
      tentar(() => supabase.from('CLIENTES').select('id, name, admission_data, created_at').eq('tenant_id', t).eq('type', 'CO')),
    ]);
    const nomeDe = id => colab.linhas.find(p => p.id === id)?.name || '—';
    const cargoDe = id => colab.linhas.find(p => p.id === id)?.admission_data?.role || null;

    const lista = desl.linhas.map(d => ({
      ...d,
      colaborador: nomeDe(d.employee_id),
      cargo: cargoDe(d.employee_id),
      // O prazo do art. 477: 10 dias corridos da saída.
      prazo_pagamento: d.exit_date
        ? new Date(new Date(d.exit_date).getTime() + 10 * 864e5).toISOString().slice(0, 10) : null,
      pendencias: [
        ...(d.exam_required && !d.exam_done_on ? ['Exame demissional'] : []),
        ...(d.homolog_required && !d.homolog_on ? ['Homologação'] : []),
        ...(!d.access_revoked_at ? ['Bloqueio de acesso ao sistema'] : []),
        ...(!d.rescission_total ? ['Cálculo rescisório'] : []),
        ...(!d.esocial_status ? ['Evento S-2299'] : []),
      ],
    }));

    const abertos = lista.filter(d => d.status !== 'concluido' && d.status !== 'cancelado');
    res.json({
      cartoes: {
        no_mes: lista.filter(d => String(d.exit_date || '').startsWith(hojeISO().slice(0, 7))).length,
        em_andamento: abertos.length,
        aguardando_homologacao: abertos.filter(d => d.homolog_required && !d.homolog_on).length,
        documentos_pendentes: abertos.filter(d => d.exam_required && !d.exam_done_on).length,
        acessos_revogados: lista.filter(d => d.access_revoked_at).length,
        verbas: Math.round(lista.reduce((s, d) => s + (Number(d.rescission_total) || 0), 0) * 100) / 100,
      },
      desligamentos: lista,
      avisos: desl.ok ? [] : [desl.erro],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/desligamentos/simular
 * A conta ANTES de decidir. Não grava nada — é para o gestor saber
 * quanto custa cada caminho (dispensa, acordo, pedido) antes de
 * escolher, em vez de descobrir depois de assinado.
 */
router.post('/desligamentos/simular', async (req, res) => {
  const t = req.tenantId;
  const { employee_id, kind = 'sem_justa_causa', exit_date = hojeISO(), notice = 'indenizado', fgts_saldo, cct_exige_homologacao } = req.body || {};
  if (!employee_id) return res.status(400).json({ error: 'Informe o colaborador.' });

  try {
    const { data: pessoa } = await supabase.from('CLIENTES')
      .select('id, name, created_at, admission_data').eq('tenant_id', t).eq('id', employee_id).maybeSingle();
    if (!pessoa) return res.status(404).json({ error: 'Colaborador não encontrado.' });

    const ctx = await contextoDe(t, employee_id, exit_date);
    const admissao = pessoa.admission_data?.start_date || (pessoa.created_at || '').slice(0, 10);

    // Faltas por período aquisitivo — a mesma régua do art. 130.
    const base = saldoDeFerias({ admissao, gozadas: ctx.ferias, hoje: exit_date });
    const faltasPorPeriodo = {};
    for (const p of base.periodos) {
      faltasPorPeriodo[p.inicio] = ctx.faltas.filter(d => d >= p.inicio && d <= p.fim).length;
    }

    const calculo = calcularRescisao({
      colaborador: pessoa, kind, exit_date, notice,
      contexto: { ferias: ctx.ferias, faltasPorPeriodo, fgts_saldo },
    });
    const exige = exigencias({
      kind, admissao, exit_date, ultimo_aso: ctx.ultimo_aso, cct_exige_homologacao,
    });

    res.json({ colaborador: { id: pessoa.id, nome: pessoa.name, admissao }, calculo, exigencias: exige });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/desligamentos
 * Abre O processo — um só, que alimenta tudo (item 11).
 */
router.post('/desligamentos', async (req, res) => {
  const t = req.tenantId;
  const {
    employee_id, kind = 'sem_justa_causa', exit_date = hojeISO(), notice = 'indenizado',
    requested_by = 'empresa', fgts_saldo, cct_exige_homologacao = false,
  } = req.body || {};
  if (!employee_id) return res.status(400).json({ error: 'Informe o colaborador.' });

  try {
    const { data: pessoa } = await supabase.from('CLIENTES')
      .select('id, name, created_at, admission_data').eq('tenant_id', t).eq('id', employee_id).maybeSingle();
    if (!pessoa) return res.status(404).json({ error: 'Colaborador não encontrado.' });

    const ctx = await contextoDe(t, employee_id, exit_date);
    const admissao = pessoa.admission_data?.start_date || (pessoa.created_at || '').slice(0, 10);
    const base = saldoDeFerias({ admissao, gozadas: ctx.ferias, hoje: exit_date });
    const faltasPorPeriodo = {};
    for (const p of base.periodos) {
      faltasPorPeriodo[p.inicio] = ctx.faltas.filter(d => d >= p.inicio && d <= p.fim).length;
    }
    const calculo = calcularRescisao({
      colaborador: pessoa, kind, exit_date, notice,
      contexto: { ferias: ctx.ferias, faltasPorPeriodo, fgts_saldo },
    });
    const exige = exigencias({ kind, admissao, exit_date, ultimo_aso: ctx.ultimo_aso, cct_exige_homologacao });

    const { data, error } = await supabase.from('RH_DESLIGAMENTOS').insert({
      tenant_id: t, employee_id, kind, requested_by, notice, exit_date,
      // Condicionais, não obrigações padrão (item 11).
      exam_required: exige.exame_demissional.exigido,
      homolog_required: exige.homologacao.exigida,
      rescission_total: calculo.liquido,
      status: 'em_andamento',
    }).select().single();
    if (error) throw error;

    audit(req, 'create', 'desligamento', data.id, { colaborador: pessoa.name, kind, liquido: calculo.liquido });
    res.status(201).json({ desligamento: data, calculo, exigencias: exige });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * PATCH /api/rh/desligamentos/:id
 * Avança o processo. Revogar acesso desliga o login DE VERDADE — não é
 * só um risco na lista.
 */
router.patch('/desligamentos/:id', async (req, res) => {
  const t = req.tenantId;
  const { acao, exam_done_on, homolog_on, rescission_total } = req.body || {};

  try {
    const { data: proc } = await supabase.from('RH_DESLIGAMENTOS')
      .select('*').eq('tenant_id', t).eq('id', req.params.id).maybeSingle();
    if (!proc) return res.status(404).json({ error: 'Processo não encontrado.' });

    const patch = { updated_at: new Date().toISOString() };
    if (exam_done_on) patch.exam_done_on = exam_done_on;
    if (homolog_on) patch.homolog_on = homolog_on;
    if (rescission_total != null) patch.rescission_total = rescission_total;

    if (acao === 'revogar_acesso') {
      const { data: pessoa } = await supabase.from('CLIENTES')
        .select('admission_data').eq('tenant_id', t).eq('id', proc.employee_id).maybeSingle();
      const email = pessoa?.admission_data?.access_email;
      if (email) {
        await supabase.from('USUARIOS').update({ is_active: false })
          .eq('tenant_id', t).eq('email', email);
      }
      patch.access_revoked_at = new Date().toISOString();
    }

    if (acao === 'concluir') {
      patch.status = 'concluido';
      // Desligado sai do quadro — é isso que faz o Painel RH parar de
      // contá-lo como ativo, sem ninguém editar o cadastro.
      await supabase.from('CLIENTES').update({ is_active: false })
        .eq('tenant_id', t).eq('id', proc.employee_id);
    }
    if (acao === 'cancelar') patch.status = 'cancelado';

    const { data, error } = await supabase.from('RH_DESLIGAMENTOS')
      .update(patch).eq('tenant_id', t).eq('id', req.params.id).select().single();
    if (error) throw error;

    audit(req, acao || 'update', 'desligamento', req.params.id, patch);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
