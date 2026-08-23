// ============================================================
// A OCORRÊNCIA NASCE DO FATO, NÃO DA DIGITAÇÃO.
//
// O atraso já está no ponto: hora de entrada, jornada esperada,
// tolerância da escala. Pedir para alguém do RH abrir a tela de
// Ocorrências e digitar de novo "fulano atrasou 12 minutos" é pedir
// para o sistema ter duas versões do mesmo fato — e uma delas vai estar
// errada até o fim dos tempos.
//
// Por isso o ponto CHAMA esta função quando apura o dia. Ela é
// idempotente: recalcular o mesmo dia cinco vezes não cria cinco
// atrasos (o índice único da migração 082 garante isso no banco, e a
// busca prévia evita o erro).
//
// O QUE A IA FAZ E O QUE ELA NÃO FAZ. `ai_score` é triagem: aponta risco
// e reincidência para o RH olhar primeiro o que importa. Ela não decide
// advertência, não recusa justificativa e não desconta salário — a
// decisão fica em `decided_by`, e só gente preenche esse campo.
// ============================================================
const supabase = require('../config/supabase');
const { notificar, MENSAGENS } = require('./notificacoes');

const dBR = d => String(d || '').slice(0, 10).split('-').reverse().join('/');

/** Gravidade pelo tamanho do fato — a mesma régua para todo mundo. */
function gravidade({ kind, minutes }) {
  if (kind === 'falta') return 'alta';
  const m = Number(minutes) || 0;
  if (m >= 60) return 'alta';
  if (m >= 15) return 'media';
  return 'baixa';
}

/** Prazo de análise: quanto mais grave, menos tempo para olhar. */
function prazo(sev) {
  const horas = { alta: 24, media: 48, baixa: 72 }[sev] || 48;
  return new Date(Date.now() + horas * 3600e3).toISOString();
}

/**
 * Quantas vezes esta pessoa já teve o mesmo tipo de ocorrência nos
 * últimos 90 dias. É o número que separa "aconteceu" de "está virando
 * hábito" — e é dele que a triagem tira o risco.
 */
async function reincidencia(tenantId, employee_id, kind) {
  const desde = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  const { data } = await supabase.from('RH_OCORRENCIAS')
    .select('id').eq('tenant_id', tenantId).eq('employee_id', employee_id)
    .eq('kind', kind).gte('occurred_on', desde);
  return (data || []).length;
}

/**
 * Registra (uma vez) a ocorrência daquele dia e avisa o colaborador.
 *
 * `dia` é a linha de RH_PONTO recém-apurada. Devolve a ocorrência, ou
 * null quando não há o que registrar.
 */
async function daApuracaoDoPonto(tenantId, dia, opcoes = {}) {
  if (!dia || !dia.employee_id || !dia.work_date) return null;

  const kind = dia.absence ? 'falta' : ((dia.late_minutes || 0) > 0 ? 'atraso' : null);
  if (!kind) return null;

  try {
    // Já existe? Recalcular o dia não pode duplicar o fato.
    const { data: jaTem } = await supabase.from('RH_OCORRENCIAS')
      .select('id, minutes, status').eq('tenant_id', tenantId)
      .eq('employee_id', dia.employee_id).eq('occurred_on', dia.work_date)
      .eq('kind', kind).maybeSingle();

    if (jaTem) {
      // O minuto mudou (alguém corrigiu a marcação)? Atualiza o número,
      // mas não mexe no que já foi decidido por gente.
      if (kind === 'atraso' && jaTem.minutes !== dia.late_minutes && jaTem.status === 'aberta') {
        await supabase.from('RH_OCORRENCIAS')
          .update({ minutes: dia.late_minutes, updated_at: new Date().toISOString() })
          .eq('id', jaTem.id);
      }
      return jaTem;
    }

    const { data: pessoa } = await supabase.from('CLIENTES')
      .select('id, name, phone, mobile, admission_data')
      .eq('tenant_id', tenantId).eq('id', dia.employee_id).maybeSingle();

    const sev = gravidade({ kind, minutes: dia.late_minutes });
    const vezes = await reincidencia(tenantId, dia.employee_id, kind);

    const linha = {
      tenant_id: tenantId,
      employee_id: dia.employee_id,
      kind,
      occurred_on: dia.work_date,
      severity: sev,
      origin: 'ponto',
      status: 'aberta',
      minutes: kind === 'atraso' ? (dia.late_minutes || null) : null,
      description: kind === 'falta'
        ? 'Sem marcação de ponto no dia.'
        : `Entrada ${String(dia.entry1 || '').slice(0, 5)} — ${dia.late_minutes} min além da tolerância.`,
      // Triagem, não decisão: quanto mais reincidente, mais alto o
      // número que faz o RH olhar primeiro.
      ai_score: Math.min(100, (sev === 'alta' ? 60 : sev === 'media' ? 40 : 20) + vezes * 10),
      ai_note: vezes > 0
        ? `${vezes} ocorrência(s) do mesmo tipo nos últimos 90 dias.`
        : 'Primeira ocorrência deste tipo em 90 dias.',
      sla_due_at: prazo(sev),
      ponto_id: dia.id || null,
    };

    const { data: criada, error } = await supabase.from('RH_OCORRENCIAS').insert(linha).select().single();
    // Corrida entre dois recálculos simultâneos: o índice único barra o
    // segundo, e isso é sucesso, não erro.
    if (error) {
      if (/duplicate|unique/i.test(error.message || '')) return null;
      throw error;
    }

    // O aviso ao colaborador — pedindo a justificativa que vai voltar
    // para esta mesma ocorrência.
    if (opcoes.notificar !== false && pessoa) {
      const texto = kind === 'falta'
        ? MENSAGENS.falta({ nome: (pessoa.name || '').split(' ')[0], data: dBR(dia.work_date) })
        : MENSAGENS.atraso({
          nome: (pessoa.name || '').split(' ')[0],
          data: dBR(dia.work_date),
          minutos: dia.late_minutes,
          tolerancia: opcoes.tolerancia ?? 5,
        });
      const aviso = await notificar(tenantId, {
        employee_id: pessoa.id,
        telefone: pessoa.admission_data?.whatsapp_notificacoes || pessoa.phone || pessoa.mobile,
        mensagem: texto,
        motivo: kind,
        ref_type: 'ocorrencia',
        ref_id: criada.id,
      });
      if (aviso?.status === 'enviada') {
        await supabase.from('RH_OCORRENCIAS')
          .update({ notificado_em: new Date().toISOString() }).eq('id', criada.id);
      }
    }

    return criada;
  } catch (e) {
    // Ocorrência é consequência: se ela falhar, o ponto — que é o fato —
    // não pode falhar junto.
    console.error('[ocorrencias:daApuracaoDoPonto]', e.message);
    return null;
  }
}

/**
 * A justificativa que o colaborador manda pelo portal cai na ocorrência
 * do dia. Se não houver ocorrência (ele se antecipou), cria uma.
 */
async function justificar(tenantId, { employee_id, occurred_on, texto, document_url, origin = 'portal' }) {
  const { data: existente } = await supabase.from('RH_OCORRENCIAS')
    .select('*').eq('tenant_id', tenantId).eq('employee_id', employee_id)
    .eq('occurred_on', occurred_on).in('kind', ['atraso', 'falta'])
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  const patch = {
    status: 'em_analise',
    description: existente?.description
      ? `${existente.description}\nJustificativa: ${texto}`
      : `Justificativa: ${texto}`,
    document_url: document_url || existente?.document_url || null,
    updated_at: new Date().toISOString(),
  };

  if (existente) {
    const { data } = await supabase.from('RH_OCORRENCIAS')
      .update(patch).eq('id', existente.id).select().single();
    return data;
  }

  const { data } = await supabase.from('RH_OCORRENCIAS').insert({
    tenant_id: tenantId, employee_id, kind: 'justificativa',
    occurred_on, severity: 'baixa', origin, status: 'em_analise',
    description: `Justificativa: ${texto}`, document_url: document_url || null,
    sla_due_at: prazo('media'),
  }).select().single();
  return data;
}

module.exports = { daApuracaoDoPonto, justificar, gravidade, reincidencia };
