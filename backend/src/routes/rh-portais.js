// ============================================================
// OS TRÊS PORTAIS — COLABORADOR, GESTOR E CONTADOR.
//
// Aqui não existe módulo 'hr': quem entra nestes endpoints é o próprio
// colaborador olhando a própria vida, o gestor olhando SÓ a equipe
// dele, e o contador olhando SÓ o que é fiscal. Por isso as rotas não
// passam por requireModules('hr') — passam por um recorte de quem é
// você (item 14).
//
// E nenhum deles tem conta própria: o portal lê exatamente as mesmas
// funções que as telas do RH usam (saldoDeFerias, montarPrevia da
// folha, ocorrencias.justificar). Se o holerite do portal fosse
// calculado aqui, um dia ele discordaria do que o RH fechou — e quem
// descobriria seria o colaborador, com o holerite na mão.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { saldoDeFerias } = require('../lib/ferias');
const { justificar } = require('../lib/ocorrencias');
const { criarFerias } = require('./rh-ferias');
const { montarPrevia } = require('./rh-folha');
const { calcularRescisao, exigencias } = require('../lib/rescisao');

const hojeISO = () => new Date().toISOString().slice(0, 10);
const compAtual = () => hojeISO().slice(0, 7);

/**
 * Quem é o colaborador por trás do usuário logado.
 *
 * A ligação é o e-mail de acesso gravado na admissão — o mesmo campo
 * que a tela de cadastro usa para criar o login. Não há segundo
 * cadastro de "usuário do portal": seria uma segunda verdade sobre a
 * mesma pessoa.
 */
async function euSou(req) {
  const email = String(req.userProfile?.email || '').toLowerCase();
  if (!email) return null;
  const { data } = await supabase.from('CLIENTES')
    .select('id, name, cpf_cnpj, birth_date, phone, email, address, created_at, admission_data, is_active')
    .eq('tenant_id', req.tenantId).eq('type', 'CO');
  return (data || []).find(p =>
    String(p.admission_data?.access_email || '').toLowerCase() === email ||
    String(p.email || '').toLowerCase() === email) || null;
}

function semVinculo(res) {
  return res.status(404).json({
    error: 'Seu usuário não está ligado a um cadastro de colaborador.',
    dica: 'O RH precisa preencher o e-mail de acesso na admissão para o portal reconhecer você.',
  });
}

// ── PORTAL DO COLABORADOR ───────────────────────────────────

/**
 * GET /api/portal/eu
 * Tudo que é meu, em uma tela: ponto do mês, férias, pendências e
 * holerites. Nenhum número é digitado — todos saem do mesmo lugar de
 * onde o RH lê.
 */
router.get('/eu', async (req, res) => {
  try {
    const eu = await euSou(req);
    if (!eu) return semVinculo(res);
    const t = req.tenantId;
    const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();
    const inicio = `${comp}-01`;
    const fim = new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0).toISOString().slice(0, 10);

    const [{ data: ponto }, { data: marc }, { data: fer }, { data: oco }, { data: docs }, { data: hol }, { data: deps }] =
      await Promise.all([
        supabase.from('RH_PONTO').select('*').eq('tenant_id', t).eq('employee_id', eu.id)
          .gte('work_date', inicio).lte('work_date', fim).order('work_date'),
        supabase.from('RH_MARCACOES').select('*').eq('tenant_id', t).eq('employee_id', eu.id)
          .gte('marked_at', `${inicio}T00:00:00`).order('marked_at', { ascending: false }).limit(20),
        supabase.from('RH_FERIAS').select('*').eq('tenant_id', t).eq('employee_id', eu.id),
        supabase.from('RH_OCORRENCIAS').select('*').eq('tenant_id', t).eq('employee_id', eu.id)
          .order('occurred_on', { ascending: false }).limit(30),
        supabase.from('RH_DOCUMENTOS').select('*').eq('tenant_id', t).eq('employee_id', eu.id),
        supabase.from('RH_SALARIOS').select('reference_month, net_salary, gross_salary')
          .eq('tenant_id', t).eq('employee_id', eu.id).order('reference_month', { ascending: false }).limit(13),
        supabase.from('RH_DEPARTAMENTOS').select('id, code, name, manager_id').eq('tenant_id', t),
      ]);

    const adm = eu.admission_data || {};
    const admissao = adm.start_date || (eu.created_at || '').slice(0, 10);

    // Saldo de férias pela mesma régua do art. 130 que o RH enxerga.
    const gozadas = (fer || []).filter(f => (!f.kind || f.kind === 'ferias') && f.status !== 'cancelled');
    const { data: todasFaltas } = await supabase.from('RH_PONTO')
      .select('work_date').eq('tenant_id', t).eq('employee_id', eu.id).eq('absence', true);
    const base = saldoDeFerias({ admissao, gozadas });
    const faltasPorPeriodo = {};
    for (const p of base.periodos) {
      faltasPorPeriodo[p.inicio] = (todasFaltas || []).filter(f => f.work_date >= p.inicio && f.work_date <= p.fim).length;
    }
    const ferias = saldoDeFerias({ admissao, gozadas, faltasPorPeriodo });

    const dias = ponto || [];
    const minutos = c => dias.reduce((s, d) => s + (d[c] || 0), 0);

    // O que ESTÁ ESPERANDO DE MIM — a razão de o portal existir.
    const pendencias = (oco || [])
      .filter(o => o.status === 'aberta' && ['atraso', 'falta'].includes(o.kind))
      .map(o => ({
        id: o.id, tipo: o.kind, data: o.occurred_on, minutos: o.minutes,
        gravidade: o.severity, prazo: o.sla_due_at,
        vencida: o.sla_due_at ? new Date(o.sla_due_at) < new Date() : false,
      }));

    const meuDep = (deps || []).find(d => d.code === adm.sector || d.name === adm.sector) || null;

    res.json({
      colaborador: {
        id: eu.id, nome: eu.name, cargo: adm.role || null, departamento: meuDep?.name || adm.sector || null,
        admissao, contrato: adm.contract_type || null, jornada: adm.scale_name || null,
        foto: adm.photo_url || null, matricula: adm.registration || null,
      },
      mes: {
        competencia: comp,
        dias_trabalhados: dias.filter(d => !d.absence).length,
        faltas: dias.filter(d => d.absence).length,
        atrasos_min: minutos('late_minutes'),
        extras_min: minutos('extra_minutes'),
        // Banco de horas é extras menos atrasos — não uma coluna que alguém edita.
        saldo_min: minutos('extra_minutes') - minutos('late_minutes'),
      },
      marcacoes: (marc || []).map(m => ({
        id: m.id, quando: m.marked_at, tipo: m.kind || null, origem: m.source || null,
      })),
      ferias: {
        saldo: ferias.saldo_total,
        periodos: ferias.periodos,
        proximas: (fer || []).filter(f => (f.start_date || '') >= hojeISO() && f.status !== 'cancelled'),
        historico: gozadas.filter(f => (f.end_date || '') < hojeISO()),
      },
      afastamentos: (fer || []).filter(f => f.kind && f.kind !== 'ferias'),
      pendencias,
      ocorrencias: oco || [],
      documentos: (docs || []).map(d => ({
        id: d.id, doc_key: d.doc_key, nome: d.name || d.doc_key,
        data: d.document_date, validade: d.expires_at, url: d.file_url, status: d.status,
      })),
      holerites: (hol || []).map(h => ({ competencia: h.reference_month, liquido: h.net_salary, bruto: h.gross_salary })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * GET /api/portal/eu/holerite?competencia=AAAA-MM
 * O MESMO cálculo da folha do RH, filtrado em mim. Se a competência
 * ainda não fechou, vem marcada como prévia — em vez de parecer um
 * holerite definitivo que ainda pode mudar.
 */
router.get('/eu/holerite', async (req, res) => {
  try {
    const eu = await euSou(req);
    if (!eu) return semVinculo(res);
    const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();

    const previa = await montarPrevia(req.tenantId, comp);
    const minha = previa.linhas.find(l => l.employee_id === eu.id);
    if (!minha) {
      return res.status(404).json({ error: `Sem folha para ${comp}.`, competencia: comp });
    }
    res.json({
      competencia: comp,
      fechada: previa.fechada,
      previa: !previa.fechada,
      colaborador: { id: eu.id, nome: eu.name, cargo: eu.admission_data?.role || null },
      holerite: minha,
      avisos: previa.avisos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/portal/eu/justificativa
 * A justificativa nasce aqui, mas a decisão NÃO. A ocorrência muda
 * para 'justificada' e vai para a fila do gestor — quem aprova é
 * gente (item 6).
 */
router.post('/eu/justificativa', async (req, res) => {
  try {
    const eu = await euSou(req);
    if (!eu) return semVinculo(res);
    const { occurred_on, texto, document_url } = req.body || {};
    if (!occurred_on || !texto) return res.status(400).json({ error: 'Informe o dia e o motivo.' });

    const r = await justificar(req.tenantId, {
      employee_id: eu.id, occurred_on, texto, document_url, origin: 'portal',
    });
    audit(req, 'justificar', 'ocorrencia', r?.id || null, { dia: occurred_on });
    res.status(201).json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/portal/eu/ferias
 * Reusa o handler do RH: a checagem de saldo é a mesma, e o pedido
 * entra como 'pending' porque veio do portal.
 */
router.post('/eu/ferias', async (req, res) => {
  try {
    const eu = await euSou(req);
    if (!eu) return semVinculo(res);
    req.body = { ...(req.body || {}), employee_id: eu.id, kind: 'ferias', origin: 'portal' };
    return criarFerias(req, res);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/portal/eu/demissao
 * Pedido de demissão pelo portal (item 11). Abre O MESMO processo de
 * desligamento que o RH abriria — com requested_by='colaborador' e
 * status 'solicitado', porque pedir não é ser desligado: o RH ainda
 * precisa acolher.
 */
router.post('/eu/demissao', async (req, res) => {
  try {
    const eu = await euSou(req);
    if (!eu) return semVinculo(res);
    const { exit_date = hojeISO(), notice = 'trabalhado', motivo } = req.body || {};

    const { data: jaTem } = await supabase.from('RH_DESLIGAMENTOS')
      .select('id, status').eq('tenant_id', req.tenantId).eq('employee_id', eu.id)
      .in('status', ['solicitado', 'em_andamento']).maybeSingle();
    if (jaTem) return res.status(409).json({ error: 'Já existe um processo de desligamento aberto para você.', id: jaTem.id });

    const admissao = eu.admission_data?.start_date || (eu.created_at || '').slice(0, 10);
    const calculo = calcularRescisao({ colaborador: eu, kind: 'pedido_demissao', exit_date, notice });
    const exige = exigencias({ kind: 'pedido_demissao', admissao, exit_date });

    const { data, error } = await supabase.from('RH_DESLIGAMENTOS').insert({
      tenant_id: req.tenantId, employee_id: eu.id, kind: 'pedido_demissao',
      requested_by: 'colaborador', notice, exit_date,
      exam_required: exige.exame_demissional.exigido,
      homolog_required: exige.homologacao.exigida,
      rescission_total: calculo.liquido,
      status: 'solicitado',
    }).select().single();
    if (error) throw error;

    audit(req, 'create', 'desligamento', data.id, { origem: 'portal', colaborador: eu.name, motivo: motivo || null });
    res.status(201).json({
      desligamento: data,
      calculo,
      exigencias: exige,
      aviso: 'Seu pedido foi registrado. O RH vai confirmar a data e as condições com você.',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PORTAL DO GESTOR ────────────────────────────────────────

/**
 * A equipe de quem está logado: o departamento em que ele é gestor.
 *
 * Sem cadastro de colaborador não há equipe nenhuma. Sem esta guarda,
 * `p.admission_data?.manager_id === eu?.id` vira `undefined ===
 * undefined` — e um usuário sem vínculo passa a enxergar todo mundo
 * cujo gestor ainda não foi definido, ou seja, a empresa inteira.
 */
async function minhaEquipe(req, eu) {
  if (!eu?.id) return { departamentos: [], time: [] };
  const t = req.tenantId;
  const [{ data: deps }, { data: pessoas }] = await Promise.all([
    supabase.from('RH_DEPARTAMENTOS').select('id, code, name, manager_id').eq('tenant_id', t),
    supabase.from('CLIENTES').select('id, name, is_active, admission_data').eq('tenant_id', t).eq('type', 'CO'),
  ]);
  const meus = (deps || []).filter(d => d.manager_id && d.manager_id === eu.id);
  const chaves = new Set(meus.flatMap(d => [d.code, d.name]).filter(Boolean));
  const time = (pessoas || []).filter(p => {
    if (p.is_active === false || p.id === eu.id) return false;
    const adm = p.admission_data || {};
    return (adm.sector && chaves.has(adm.sector)) || (adm.manager_id && adm.manager_id === eu.id);
  });
  return { departamentos: meus, time };
}

/**
 * GET /api/portal/gestor
 * Só o que depende de decisão dele. O gestor não recebe uma cópia do
 * Painel RH: recebe a fila dele.
 */
router.get('/gestor', async (req, res) => {
  try {
    const eu = await euSou(req);
    const t = req.tenantId;
    const { departamentos, time } = await minhaEquipe(req, eu);

    // Vale para todo mundo, inclusive admin: sem equipe, esta tela não
    // tem o que mostrar — e dizer isso é melhor que exibir zeros.
    if (!departamentos.length && !time.length) {
      return res.json({
        gestor: eu ? { id: eu.id, nome: eu.name } : null,
        equipe: [], aprovacoes: [], cartoes: {},
        aviso: 'Você não é gestor de nenhum departamento. Peça ao RH para indicar você em Estrutura da Empresa.',
      });
    }

    const ids = time.map(p => p.id);
    const [{ data: oco }, { data: fer }, { data: ponto }] = await Promise.all([
      ids.length ? supabase.from('RH_OCORRENCIAS').select('*').eq('tenant_id', t).in('employee_id', ids)
        .in('status', ['aberta', 'justificada', 'em_analise']).order('occurred_on', { ascending: false })
        : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('RH_FERIAS').select('*').eq('tenant_id', t).in('employee_id', ids)
        : Promise.resolve({ data: [] }),
      ids.length ? supabase.from('RH_PONTO').select('*').eq('tenant_id', t).in('employee_id', ids)
        .gte('work_date', `${compAtual()}-01`) : Promise.resolve({ data: [] }),
    ]);
    const nome = id => time.find(p => p.id === id)?.name || '—';

    const aprovacoes = [
      ...(oco || []).filter(o => o.status === 'justificada').map(o => ({
        tipo: 'justificativa', id: o.id, colaborador: nome(o.employee_id),
        resumo: `${o.kind} em ${o.occurred_on}`, detalhe: o.description,
        documento: o.document_url, prazo: o.sla_due_at, ai_score: o.ai_score, ai_note: o.ai_note,
      })),
      ...(fer || []).filter(f => f.status === 'pending').map(f => ({
        tipo: 'ferias', id: f.id, colaborador: nome(f.employee_id),
        resumo: `${f.days} dia(s): ${f.start_date} a ${f.end_date}`,
        detalhe: f.abono_pecuniario ? `com abono de ${f.abono_dias} dia(s)` : null,
      })),
    ];

    res.json({
      gestor: eu ? { id: eu.id, nome: eu.name } : null,
      departamentos,
      cartoes: {
        equipe: time.length,
        aguardando_decisao: aprovacoes.length,
        ocorrencias_abertas: (oco || []).filter(o => o.status === 'aberta').length,
        em_ferias_hoje: (fer || []).filter(f =>
          f.start_date <= hojeISO() && f.end_date >= hojeISO() && f.status !== 'cancelled').length,
        faltas_no_mes: (ponto || []).filter(p => p.absence).length,
      },
      equipe: time.map(p => {
        const meu = (ponto || []).filter(x => x.employee_id === p.id);
        const afast = (fer || []).find(f => f.employee_id === p.id &&
          f.start_date <= hojeISO() && f.end_date >= hojeISO() && f.status !== 'cancelled');
        return {
          id: p.id, nome: p.name, cargo: p.admission_data?.role || null,
          situacao: afast ? (afast.kind === 'ferias' ? 'Em férias' : 'Afastado') : 'Ativo',
          faltas: meu.filter(x => x.absence).length,
          atrasos_min: meu.reduce((s, x) => s + (x.late_minutes || 0), 0),
          pendencias: (oco || []).filter(o => o.employee_id === p.id && o.status !== 'aprovada').length,
        };
      }),
      aprovacoes,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/portal/gestor/decidir
 * A decisão humana. Grava QUEM decidiu — é o que separa a triagem da
 * IA de uma consequência para a pessoa (item 6).
 */
router.post('/gestor/decidir', async (req, res) => {
  const { tipo, id, decisao, motivo } = req.body || {};
  if (!['justificativa', 'ferias'].includes(tipo)) return res.status(400).json({ error: 'Tipo inválido.' });
  if (!['aprovar', 'recusar'].includes(decisao)) return res.status(400).json({ error: 'Decisão inválida.' });

  try {
    const eu = await euSou(req);
    const { time } = await minhaEquipe(req, eu);
    const ids = new Set(time.map(p => p.id));
    const tabela = tipo === 'ferias' ? 'RH_FERIAS' : 'RH_OCORRENCIAS';

    const { data: alvo } = await supabase.from(tabela)
      .select('*').eq('tenant_id', req.tenantId).eq('id', id).maybeSingle();
    if (!alvo) return res.status(404).json({ error: 'Registro não encontrado.' });
    if (!ids.has(alvo.employee_id) && req.userProfile?.role !== 'admin') {
      return res.status(403).json({ error: 'Esse colaborador não é da sua equipe.' });
    }

    const patch = tipo === 'ferias'
      ? { status: decisao === 'aprovar' ? 'scheduled' : 'cancelled', approved_at: new Date().toISOString() }
      : {
          status: decisao === 'aprovar' ? 'aprovada' : 'recusada',
          decided_by: req.userProfile?.id || null, decided_at: new Date().toISOString(),
          description: motivo ? `${alvo.description || ''}\n[gestor] ${motivo}`.trim() : alvo.description,
        };

    const { data, error } = await supabase.from(tabela)
      .update(patch).eq('tenant_id', req.tenantId).eq('id', id).select().single();
    if (error) throw error;

    // Justificativa aprovada apaga a falta do ponto — senão o mesmo dia
    // continuaria descontando na folha depois de perdoado.
    if (tipo === 'justificativa' && decisao === 'aprovar' && alvo.kind === 'falta') {
      await supabase.from('RH_PONTO')
        .update({ absence: false, notes: 'Falta justificada e aprovada pelo gestor' })
        .eq('tenant_id', req.tenantId).eq('employee_id', alvo.employee_id).eq('work_date', alvo.occurred_on);
    }

    audit(req, decisao, tipo, id, { motivo: motivo || null });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── PORTAL DO CONTADOR ──────────────────────────────────────

/**
 * GET /api/portal/contador
 * Leitura fiscal, e só. O contador não vê ocorrência disciplinar nem
 * documento pessoal — vê competência, encargo, evento e prazo.
 */
router.get('/contador', async (req, res) => {
  const t = req.tenantId;
  const comp = /^\d{4}-\d{2}$/.test(String(req.query.competencia || '')) ? req.query.competencia : compAtual();
  try {
    const [{ data: fechadas }, { data: eventos }, { data: desl }] = await Promise.all([
      supabase.from('RH_SALARIOS').select('*').eq('tenant_id', t).order('reference_month', { ascending: false }).limit(400),
      supabase.from('ESOCIAL_EVENTOS').select('*').eq('tenant_id', t).order('created_at', { ascending: false }).limit(200),
      supabase.from('RH_DESLIGAMENTOS').select('*').eq('tenant_id', t).order('exit_date', { ascending: false }).limit(50),
    ]);

    const porComp = {};
    for (const l of fechadas || []) {
      const c = l.reference_month;
      porComp[c] = porComp[c] || { competencia: c, colaboradores: 0, bruto: 0, liquido: 0, inss: 0, irrf: 0, fgts: 0 };
      porComp[c].colaboradores += 1;
      porComp[c].bruto += Number(l.gross_salary) || 0;
      porComp[c].liquido += Number(l.net_salary) || 0;
      porComp[c].inss += Number(l.inss_deduction) || 0;
      porComp[c].irrf += Number(l.irrf_deduction) || 0;
      porComp[c].fgts += Number(l.fgts_value) || 0;
    }
    const competencias = Object.values(porComp)
      .map(c => ({
        ...c,
        bruto: Math.round(c.bruto * 100) / 100,
        liquido: Math.round(c.liquido * 100) / 100,
        inss: Math.round(c.inss * 100) / 100,
        irrf: Math.round(c.irrf * 100) / 100,
        fgts: Math.round(c.fgts * 100) / 100,
        // FGTS Digital vence no dia 20 do mês seguinte (item 10).
        fgts_vencimento: `${new Date(Number(c.competencia.slice(0, 4)), Number(c.competencia.slice(5, 7)), 20)
          .toISOString().slice(0, 10)}`,
      }))
      .sort((a, b) => b.competencia.localeCompare(a.competencia));

    const atual = competencias.find(c => c.competencia === comp) || null;
    const previa = atual ? null : await montarPrevia(t, comp).catch(() => null);

    res.json({
      competencia: comp,
      cartoes: {
        competencias_fechadas: competencias.length,
        ultima: competencias[0]?.competencia || null,
        eventos_pendentes: (eventos || []).filter(e => !['aceito', 'processado'].includes(String(e.status))).length,
        desligamentos_no_mes: (desl || []).filter(d => String(d.exit_date || '').startsWith(comp)).length,
      },
      atual: atual || (previa ? {
        competencia: comp, previa: true, colaboradores: previa.linhas.length,
        bruto: previa.cartoes.folha_bruta, liquido: previa.cartoes.folha_liquida,
        inss: previa.cartoes.inss, irrf: previa.cartoes.irrf, fgts: previa.cartoes.fgts,
      } : null),
      competencias,
      encargos: atual ? null : previa?.encargos || null,
      eventos: (eventos || []).map(e => ({
        id: e.id, tipo: e.tipo, status: e.status, referencia: e.reference_month || null, criado: e.created_at,
      })),
      rescisoes: (desl || []).filter(d => d.status === 'concluido').map(d => ({
        id: d.id, saida: d.exit_date, tipo: d.kind, total: d.rescission_total,
        prazo_pagamento: d.exit_date ? new Date(new Date(d.exit_date).getTime() + 10 * 864e5).toISOString().slice(0, 10) : null,
      })),
      avisos: atual ? [] : ['Competência ainda não fechada — os números são prévia da folha.'],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
