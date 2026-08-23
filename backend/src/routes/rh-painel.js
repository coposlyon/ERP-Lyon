// ============================================================
// O PAINEL DO RH — TODO NÚMERO CALCULADO, NENHUM ESCRITO.
//
// A regra que manda aqui é a primeira da lista do Pablo: nenhuma tela
// tem número fixo. Cada cartão desta resposta é uma CONTA feita sobre o
// cadastro mestre do colaborador e sobre os fatos que o sistema
// registrou — ponto, férias, folha, documentos, ocorrências. Trocou a
// jornada de alguém no cadastro? O painel muda no próximo carregamento,
// sem ninguém editar nada.
//
// FUNCIONA COM 5 OU COM 500. Não existe "20" escrito em lugar nenhum:
// o quadro é o que a tabela devolver.
//
// TABELA QUE AINDA NÃO EXISTE NÃO DERRUBA O PAINEL. As tabelas novas
// (migração 080) podem não ter sido rodadas ainda; cada bloco cai para
// zero e o painel diz o que não conseguiu ler, em vez de estourar 500 e
// deixar o RH sem tela.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { exigidosPara } = require('../lib/documentosCatalogo');

/** Consulta que pode falhar por tabela ausente: devolve [] e segue. */
async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) {
    return { linhas: [], ok: false, erro: e.message };
  }
}

const iso = d => d.toISOString().slice(0, 10);
const primeiroDia = (ano, mes) => `${ano}-${String(mes + 1).padStart(2, '0')}-01`;

/** A competência de referência: a que a tela pediu, ou o mês de hoje. */
function competencia(req) {
  const q = String(req.query.competencia || '').trim();
  if (/^\d{4}-\d{2}$/.test(q)) return q;
  return new Date().toISOString().slice(0, 7);
}

/**
 * GET /api/rh/painel?competencia=AAAA-MM
 *
 * Um pedido, o painel inteiro. Vários cartões leem as MESMAS linhas —
 * é isso que impede o "0 críticas" num cartão e uma crítica vencida no
 * outro, que era o defeito apontado no item 6.
 */
router.get('/painel', async (req, res) => {
  const t = req.tenantId;
  const comp = competencia(req);
  const hoje = new Date();
  const hojeISO = iso(hoje);
  const inicioMes = `${comp}-01`;
  const fimMes = iso(new Date(Number(comp.slice(0, 4)), Number(comp.slice(5, 7)), 0));
  const em15 = iso(new Date(hoje.getTime() + 15 * 864e5));
  const em30 = iso(new Date(hoje.getTime() + 30 * 864e5));

  const avisos = [];
  const anota = (nome, r) => { if (!r.ok) avisos.push(`${nome}: ${r.erro}`); return r.linhas; };

  try {
    const [colab, ferias, ponto, folha, docs, ocor, esoc, adm, desl] = await Promise.all([
      tentar(() => supabase.from('CLIENTES')
        .select('id, name, is_active, created_at, admission_data')
        .eq('tenant_id', t).eq('type', 'CO')),
      tentar(() => supabase.from('RH_FERIAS')
        .select('id, employee_id, status, start_date, end_date, days, kind, reason, cid, doc_url, exame_retorno_exigido, exame_retorno_em')
        .eq('tenant_id', t)),
      tentar(() => supabase.from('RH_PONTO')
        .select('employee_id, work_date, status, absence, late_minutes, extra_minutes')
        .eq('tenant_id', t).gte('work_date', inicioMes).lte('work_date', fimMes)),
      tentar(() => supabase.from('RH_SALARIOS')
        .select('employee_id, status, net_salary, gross_salary, reference_month')
        .eq('tenant_id', t).eq('reference_month', comp)),
      tentar(() => supabase.from('RH_DOCUMENTOS')
        .select('id, employee_id, doc_key, type, description, document_date, file_url')
        .eq('tenant_id', t)),
      tentar(() => supabase.from('RH_OCORRENCIAS')
        .select('id, employee_id, kind, status, severity, occurred_on, sla_due_at, decided_at')
        .eq('tenant_id', t)),
      tentar(() => supabase.from('ESOCIAL_EVENTOS')
        .select('id, tipo, status, per_apur, created_at').eq('tenant_id', t)),
      tentar(() => supabase.from('RH_ADMISSOES')
        .select('id, stage, status, expected_date, created_at').eq('tenant_id', t)),
      tentar(() => supabase.from('RH_DESLIGAMENTOS')
        .select('id, employee_id, exit_date, status, created_at').eq('tenant_id', t)),
    ]);

    const COLAB = anota('colaboradores', colab);
    const FERIAS = anota('férias', ferias);
    const PONTO = anota('ponto', ponto);
    const FOLHA = anota('folha', folha);
    const DOCS = anota('documentos', docs);
    const OCOR = anota('ocorrências', ocor);
    const ESOC = anota('eSocial', esoc);
    const ADM = anota('admissões', adm);
    const DESL = anota('desligamentos', desl);

    const ativos = COLAB.filter(c => c.is_active !== false);
    const admitidoEm = c => (c.admission_data?.start_date || c.created_at || '').slice(0, 10);

    // ── Quadro ──────────────────────────────────────────────
    const admissoesMes = ativos.filter(c => admitidoEm(c).startsWith(comp)).length;
    const desligamentosMes = DESL.filter(d => String(d.exit_date || '').startsWith(comp)).length;

    // Turnover 12 meses: (admissões + desligamentos) / 2 ÷ quadro médio.
    const doze = iso(new Date(hoje.getFullYear() - 1, hoje.getMonth(), 1));
    const adm12 = COLAB.filter(c => admitidoEm(c) >= doze).length;
    const des12 = DESL.filter(d => (d.exit_date || '') >= doze).length;
    const turnover = ativos.length
      ? Math.round((((adm12 + des12) / 2) / ativos.length) * 1000) / 10
      : 0;

    // ── Férias e afastamentos ──────────────────────
    //
    // A migração 081 separou os dois: `kind` diz se a linha é férias,
    // afastamento, licença ou suspensão. Antes disso o painel não sabia
    // responder quantas pessoas estavam afastadas — atestado de 20 dias
    // e férias de janeiro eram a mesma linha.
    const ehAfastamento = f => f.kind && f.kind !== 'ferias';
    const ativoHoje = f => (f.start_date || '') <= hojeISO && (f.end_date || '') >= hojeISO;
    const afastamentos = FERIAS.filter(ehAfastamento);
    const feriasProgramadas = FERIAS.filter(f => !ehAfastamento(f) && (f.start_date || '') > hojeISO && f.status !== 'cancelled');
    const feriasEmCurso = FERIAS.filter(f => !ehAfastamento(f) && ativoHoje(f));
    const retornos15 = FERIAS.filter(f => (f.end_date || '') >= hojeISO && (f.end_date || '') <= em15);
    const afastamentosAtivos = afastamentos.filter(ativoHoje).length;
    const examesPendentes = afastamentos.filter(f => f.exame_retorno_exigido && !f.exame_retorno_em).length;

    // ── Documentos ──────────────────────────────
    //
    // RH_DOCUMENTOS guarda o que FOI ANEXADO. O que FALTA sai do
    // catálogo — a MESMA função que a tela de Documentos usa, filtrada
    // pelo contrato, estado civil e filhos de cada um.
    //
    // Contar aqui de um jeito e lá de outro faria as duas telas darem
    // números diferentes para a mesma pergunta, e uma delas estaria
    // mentindo (item 13).
    //
    // Item 9 continua valendo: documento sem validade NÃO vence —
    // contrato CLT indeterminado nunca aparece vencendo.
    const docsAnexados = DOCS.length;
    const temDoc = (empId, key) =>
      DOCS.some(d => d.employee_id === empId && (d.doc_key === key || d.type === key));

    let docsPendentes = 0;
    let docsCriticos = 0;
    for (const p of ativos) {
      for (const cat of exigidosPara(p)) {
        if (temDoc(p.id, cat.key)) continue;
        docsPendentes += 1;
        if (cat.obrigatorio) docsCriticos += 1;
      }
    }

    // ── Ocorrências (uma leitura, todos os cartões) ─────────
    const ocorAbertas = OCOR.filter(o => ['aberta', 'em_analise', 'encaminhada'].includes(o.status));
    const ocorVencidas = ocorAbertas.filter(o => o.sla_due_at && new Date(o.sla_due_at) < hoje);

    // ── Ponto de hoje (percentual sobre quem ESTAVA ESCALADO) ─
    const doDia = PONTO.filter(p => p.work_date === hojeISO);
    const escalados = doDia.length;             // linha de ponto = pessoa escalada no dia
    const presentes = doDia.filter(p => !p.absence).length;
    const atrasos = doDia.filter(p => (p.late_minutes || 0) > 0).length;
    const faltas = doDia.filter(p => p.absence).length;

    // ── Folha ───────────────────────────────────────────────
    const folhaPrevista = FOLHA.reduce((s, f) => s + (Number(f.gross_salary) || 0), 0);
    const folhaLiquida = FOLHA.reduce((s, f) => s + (Number(f.net_salary) || 0), 0);

    // ── Gráficos ────────────────────────────────────────────
    // Evolução do quadro: 12 meses, contando quem já estava admitido
    // (e ainda não desligado) no fim de cada mês.
    const evolucao = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i + 1, 0);
      const fim = iso(d);
      const mes = fim.slice(0, 7);
      const desligadosAte = new Set(DESL.filter(x => (x.exit_date || '') <= fim).map(x => x.employee_id));
      const total = COLAB.filter(c => admitidoEm(c) && admitidoEm(c) <= fim).length;
      evolucao.push({
        mes,
        total,
        ativos: COLAB.filter(c => admitidoEm(c) <= fim && !desligadosAte.has(c.id)).length,
      });
    }

    const ano = comp.slice(0, 4);
    const admVsDes = [];
    for (let m = 0; m < 12; m++) {
      const chave = `${ano}-${String(m + 1).padStart(2, '0')}`;
      admVsDes.push({
        mes: chave,
        admissoes: COLAB.filter(c => admitidoEm(c).startsWith(chave)).length,
        desligamentos: DESL.filter(d => String(d.exit_date || '').startsWith(chave)).length,
      });
    }

    res.json({
      competencia: comp,
      gerado_em: new Date().toISOString(),
      // Cartões do topo
      cartoes: {
        colaboradores_ativos: ativos.length,
        admissoes_no_mes: admissoesMes,
        admissoes_pendentes: ADM.filter(a => a.status !== 'concluida' && a.status !== 'cancelada').length,
        admissoes_aguardando_aprovacao: ADM.filter(a => a.status === 'aguardando_aprovacao').length,
        documentos_anexados: docsAnexados,
        documentos_pendentes: docsPendentes,
        documentos_criticos: docsCriticos,
        afastamentos_ativos: afastamentosAtivos,
        afastamentos_ate_15_dias: afastamentos.filter(f => (f.end_date || '') >= hojeISO && (f.end_date || '') <= em15).length,
        exames_retorno_pendentes: examesPendentes,
        ferias_em_curso: feriasEmCurso.length,
        retornos_15_dias: retornos15.length,
        ferias_programadas: feriasProgramadas.length,
        ferias_proximos_30: feriasProgramadas.filter(f => f.start_date <= em30).length,
        folha_prevista: Math.round(folhaPrevista * 100) / 100,
        folha_liquida: Math.round(folhaLiquida * 100) / 100,
        folha_lancamentos: FOLHA.length,
        esocial_pendentes: ESOC.filter(e => ['pendente', 'erro', 'rejeitado'].includes(String(e.status || '').toLowerCase())).length,
        esocial_total: ESOC.length,
        ocorrencias_abertas: ocorAbertas.length,
        ocorrencias_urgentes: ocorVencidas.length,
      },
      // Resumo do RH (a coluna da direita)
      resumo: {
        colaboradores_ativos: ativos.length,
        colaboradores_totais: COLAB.length,
        admissoes_mes: admissoesMes,
        desligamentos_mes: desligamentosMes,
        turnover_12m: turnover,
        afastamentos_ativos: afastamentosAtivos,
        ferias_programadas: feriasProgramadas.length,
      },
      // Monitor do dia — percentual sobre quem estava ESCALADO hoje,
      // não sobre o quadro inteiro (item 5).
      monitor_dia: {
        data: hojeISO,
        escalados,
        presentes,
        presentes_pct: escalados ? Math.round((presentes / escalados) * 100) : null,
        atrasos,
        atrasos_pct: escalados ? Math.round((atrasos / escalados) * 100) : null,
        faltas,
        faltas_pct: escalados ? Math.round((faltas / escalados) * 100) : null,
        justificativas_pendentes: OCOR.filter(o => o.kind === 'justificativa' && o.status === 'aberta').length,
      },
      graficos: { evolucao, admissoes_x_desligamentos: admVsDes },
      // Pendências: cada linha aponta para a tela que resolve
      pendencias: [
        ...(examesPendentes ? [{ tipo: 'ferias', titulo: 'Exames de retorno pendentes', qtd: examesPendentes, prioridade: 'alta', destino: '/hr/ferias' }] : []),
        ...(FERIAS.filter(f => f.status === 'pending').length ? [{ tipo: 'ferias', titulo: 'Solicitações de férias aguardando decisão', qtd: FERIAS.filter(f => f.status === 'pending').length, prioridade: 'media', destino: '/hr/ferias' }] : []),
        ...(ocorVencidas.length ? [{ tipo: 'ocorrencias', titulo: 'Ocorrências com prazo vencido', qtd: ocorVencidas.length, prioridade: 'alta', destino: '/hr/ocorrencias' }] : []),
        ...(ADM.filter(a => a.status === 'aguardando_docs').length ? [{ tipo: 'admissoes', titulo: 'Admissões aguardando documentos', qtd: ADM.filter(a => a.status === 'aguardando_docs').length, prioridade: 'media', destino: '/hr/admissoes' }] : []),
        ...(afastamentos.filter(f => f.exame_retorno_exigido && !f.exame_retorno_em).length
          ? [{ tipo: 'ferias', titulo: 'Exames de retorno pendentes', qtd: afastamentos.filter(f => f.exame_retorno_exigido && !f.exame_retorno_em).length, prioridade: 'alta', destino: '/hr/ferias' }] : []),
        ...(FERIAS.filter(f => f.status === 'pending').length
          ? [{ tipo: 'ferias', titulo: 'Solicitações de férias aguardando decisão', qtd: FERIAS.filter(f => f.status === 'pending').length, prioridade: 'media', destino: '/hr/ferias' }] : []),
        ...(ESOC.filter(e => String(e.status).toLowerCase() === 'pendente').length ? [{ tipo: 'esocial', titulo: 'Eventos eSocial aguardando envio', qtd: ESOC.filter(e => String(e.status).toLowerCase() === 'pendente').length, prioridade: 'baixa', destino: '/hr/esocial' }] : []),
      ],
      // Próximos vencimentos — só o que TEM validade. Enquanto
      // RH_DOCUMENTOS não guardar data de validade, a lista sai vazia
      // (e não inventa vencimento para contrato indeterminado).
      vencimentos: [],
      // O que o painel não conseguiu ler (migração pendente, por exemplo)
      avisos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/rh/estrutura
 * O organograma e os cadastros que sustentam todo o RH. A contagem de
 * colaboradores de cada setor é CONTADA do cadastro — nunca digitada.
 */
router.get('/estrutura', async (req, res) => {
  const t = req.tenantId;
  const avisos = [];
  try {
    const [dep, car, cc, esc, colab] = await Promise.all([
      tentar(() => supabase.from('RH_DEPARTAMENTOS').select('*').eq('tenant_id', t).order('sort')),
      tentar(() => supabase.from('RH_CARGOS').select('*').eq('tenant_id', t).order('name')),
      tentar(() => supabase.from('CENTROS_CUSTO').select('*').eq('tenant_id', t).order('code')),
      tentar(() => supabase.from('ESCALAS').select('*').eq('tenant_id', t).order('name')),
      tentar(() => supabase.from('CLIENTES').select('id, name, is_active, admission_data').eq('tenant_id', t).eq('type', 'CO')),
    ]);
    for (const [nome, r] of [['departamentos', dep], ['cargos', car], ['centros', cc], ['escalas', esc], ['colaboradores', colab]]) {
      if (!r.ok) avisos.push(`${nome}: ${r.erro}`);
    }

    const pessoas = colab.linhas.filter(c => c.is_active !== false);
    const doSetor = alvo => pessoas.filter(p =>
      String(p.admission_data?.sector || '').toUpperCase() === String(alvo).toUpperCase());

    const escalaDe = id => esc.linhas.find(e => e.id === id) || null;

    res.json({
      departamentos: dep.linhas.map(d => ({
        ...d,
        colaboradores: doSetor(d.name).length,
        cargos: [...new Set(doSetor(d.name).map(p => p.admission_data?.role).filter(Boolean))],
        jornada_padrao: escalaDe(d.default_scale_id)?.name || null,
      })),
      cargos: car.linhas.map(c => ({
        ...c,
        colaboradores: pessoas.filter(p =>
          String(p.admission_data?.role || '').toUpperCase() === c.name.toUpperCase()).length,
      })),
      centros_custo: cc.linhas,
      escalas: esc.linhas.map(e => ({
        ...e,
        colaboradores: pessoas.filter(p => p.admission_data?.scale_id === e.id).length,
      })),
      totais: {
        departamentos: dep.linhas.length,
        cargos: car.linhas.length,
        centros_custo: cc.linhas.length,
        escalas: esc.linhas.length,
        colaboradores_ativos: pessoas.length,
        // Quem está sem setor ou sem escala aparece como pendência de
        // cadastro: é isso que faz o painel divergir da realidade.
        sem_departamento: pessoas.filter(p => !p.admission_data?.sector).length,
        sem_escala: pessoas.filter(p => !p.admission_data?.scale_id).length,
      },
      avisos,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
