// ============================================================
// FÉRIAS E AFASTAMENTOS.
//
// Duas coisas que a tabela antiga tratava como uma só, e que o negócio
// trata como opostas: férias são um DIREITO que se programa; afastamento
// é um FATO que acontece. A primeira precisa de saldo e aprovação; o
// segundo, de atestado, CID e prazo — e muda quem paga a partir do 16º
// dia.
//
// O SALDO NÃO SE GUARDA, SE CALCULA. Tudo aqui chama lib/ferias.js, a
// mesma conta que a Folha e o Desligamento vão usar. Enquanto o saldo
// era coluna, bastava alguém esquecer de atualizar para o RH conceder
// férias que a pessoa não tinha.
//
// AS FALTAS VÊM DO PONTO. Ninguém digita "8 faltas" aqui: o art. 130
// corta dias de férias com base no que o ponto registrou, e é o ponto
// que continua sendo a origem daquele número.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { saldoDeFerias, regrasAfastamento, iso } = require('../lib/ferias');

const DIA = 864e5;
const hojeISO = () => new Date().toISOString().slice(0, 10);

async function tentar(fn) {
  try {
    const { data, error } = await fn();
    if (error) return { linhas: [], ok: false, erro: error.message };
    return { linhas: data || [], ok: true };
  } catch (e) { return { linhas: [], ok: false, erro: e.message }; }
}

const EM_CURSO = ['scheduled', 'active', 'approved', 'pending'];

/**
 * GET /api/rh/ferias?mes=AAAA-MM
 * Tudo o que a tela mostra, numa leitura só — para nenhum cartão
 * discordar do outro.
 */
router.get('/ferias', async (req, res) => {
  const t = req.tenantId;
  const mes = /^\d{4}-\d{2}$/.test(String(req.query.mes || '')) ? req.query.mes : hojeISO().slice(0, 7);
  const inicioMes = `${mes}-01`;
  const fimMes = iso(new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0));
  const hoje = hojeISO();
  const em15 = iso(new Date(Date.now() + 15 * DIA));
  const avisos = [];

  try {
    const [colab, eventos, ponto] = await Promise.all([
      tentar(() => supabase.from('CLIENTES')
        .select('id, name, is_active, created_at, admission_data')
        .eq('tenant_id', t).eq('type', 'CO')),
      tentar(() => supabase.from('RH_FERIAS').select('*').eq('tenant_id', t)),
      // As faltas do ponto — a origem do corte do art. 130.
      tentar(() => supabase.from('RH_PONTO')
        .select('employee_id, work_date, absence').eq('tenant_id', t).eq('absence', true)),
    ]);
    if (!colab.ok) avisos.push(`colaboradores: ${colab.erro}`);
    if (!eventos.ok) avisos.push(`férias: ${eventos.erro}`);
    if (!ponto.ok) avisos.push(`faltas: ${ponto.erro}`);

    const pessoas = colab.linhas.filter(c => c.is_active !== false);
    const TODOS = eventos.linhas;
    const nomeDe = id => pessoas.find(p => p.id === id)?.name || '—';
    const setorDe = id => pessoas.find(p => p.id === id)?.admission_data?.sector || '—';

    // Faltas agrupadas por pessoa (a atribuição ao período aquisitivo é
    // feita dentro do cálculo, comparando as datas).
    const faltasDe = id => ponto.linhas.filter(p => p.employee_id === id).map(p => p.work_date);

    const saldos = pessoas.map(p => {
      const admissao = p.admission_data?.start_date || (p.created_at || '').slice(0, 10) || null;
      const minhas = TODOS.filter(e => e.employee_id === p.id);
      const faltas = faltasDe(p.id);

      // Faltas por período aquisitivo: conta quantas caíram dentro de cada um.
      const base = saldoDeFerias({ admissao, gozadas: minhas, hoje });
      const faltasPorPeriodo = {};
      for (const per of base.periodos) {
        faltasPorPeriodo[per.inicio] = faltas.filter(d => d >= per.inicio && d <= per.fim).length;
      }
      const s = saldoDeFerias({ admissao, gozadas: minhas, faltasPorPeriodo, hoje });

      return {
        employee_id: p.id,
        nome: p.name,
        setor: p.admission_data?.sector || null,
        admissao,
        saldo_total: s.saldo_total,
        tem_vencido: s.tem_vencido,
        tem_a_vencer: s.tem_a_vencer,
        periodo: s.periodo_atual && {
          inicio: s.periodo_atual.inicio,
          fim: s.periodo_atual.fim,
          vence_em: s.periodo_atual.concessivo_fim,
          dias_ate_vencer: s.periodo_atual.dias_ate_vencer,
          status: s.periodo_atual.status,
          faltas: s.periodo_atual.faltas,
          direito: s.periodo_atual.direito,
        },
        periodos: s.periodos,
      };
    });

    // ── O que acontece no mês pedido (o calendário) ─────────
    const noMes = TODOS.filter(e =>
      (e.start_date || '') <= fimMes && (e.end_date || '') >= inicioMes);

    const enriquece = e => ({
      ...e,
      colaborador: nomeDe(e.employee_id),
      setor: setorDe(e.employee_id),
      dias: e.days || (e.start_date && e.end_date
        ? Math.round((new Date(e.end_date) - new Date(e.start_date)) / DIA) + 1 : null),
    });

    const ativoHoje = e => (e.start_date || '') <= hoje && (e.end_date || '') >= hoje;
    const afastamentos = TODOS.filter(e => e.kind && e.kind !== 'ferias');
    const feriasTodas = TODOS.filter(e => !e.kind || e.kind === 'ferias');

    res.json({
      mes,
      hoje,
      cartoes: {
        ferias_programadas: feriasTodas.filter(e => (e.start_date || '') > hoje && EM_CURSO.includes(e.status)).length,
        ferias_em_curso: feriasTodas.filter(ativoHoje).length,
        solicitacoes_pendentes: TODOS.filter(e => e.status === 'pending').length,
        afastamentos_ativos: afastamentos.filter(ativoHoje).length,
        retornos_previstos: TODOS.filter(e => (e.end_date || '') >= hoje && (e.end_date || '') <= em15).length,
        saldos_a_vencer: saldos.filter(s => s.tem_a_vencer || s.tem_vencido).length,
        exames_retorno: afastamentos.filter(e => e.exame_retorno_exigido && !e.exame_retorno_em).length,
      },
      calendario: noMes.map(enriquece),
      saldos: saldos.sort((a, b) => b.saldo_total - a.saldo_total),
      afastamentos_ativos: afastamentos.filter(ativoHoje).map(enriquece),
      proximos_retornos: TODOS
        .filter(e => (e.end_date || '') >= hoje && (e.end_date || '') <= em15)
        .sort((a, b) => a.end_date.localeCompare(b.end_date))
        .map(e => ({ ...enriquece(e), em_dias: Math.round((new Date(e.end_date) - new Date(hoje)) / DIA) })),
      aprovacoes: TODOS.filter(e => e.status === 'pending')
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map(enriquece),
      pendencias: [
        ...(TODOS.filter(e => e.status === 'pending').length
          ? [{ tipo: 'aprovacao', texto: `${TODOS.filter(e => e.status === 'pending').length} solicitação(ões) aguardando aprovação` }] : []),
        ...(afastamentos.filter(e => e.exame_retorno_exigido && !e.exame_retorno_em).length
          ? [{ tipo: 'exame', texto: `${afastamentos.filter(e => e.exame_retorno_exigido && !e.exame_retorno_em).length} exame(s) de retorno pendente(s)` }] : []),
        ...(saldos.filter(s => s.tem_vencido).length
          ? [{ tipo: 'vencido', texto: `${saldos.filter(s => s.tem_vencido).length} colaborador(es) com férias VENCIDAS (art. 137 — pagamento em dobro)` }] : []),
        ...(saldos.filter(s => s.tem_a_vencer && !s.tem_vencido).length
          ? [{ tipo: 'a_vencer', texto: `${saldos.filter(s => s.tem_a_vencer && !s.tem_vencido).length} com saldo a vencer nos próximos 90 dias` }] : []),
        ...(afastamentos.filter(e => ativoHoje(e) && !e.end_date).length
          ? [{ tipo: 'sem_retorno', texto: 'Afastamento sem data de retorno prevista' }] : []),
      ],
      // Conformidade: cada linha é uma verificação, não um enfeite.
      conformidade: [
        { item: 'Férias dentro do prazo legal', ok: !saldos.some(s => s.tem_vencido) },
        { item: 'Exames de retorno em dia', ok: !afastamentos.some(e => e.exame_retorno_exigido && !e.exame_retorno_em) },
        { item: 'Afastamentos com atestado anexado', ok: !afastamentos.some(e => !e.doc_url) },
        { item: 'Solicitações analisadas', ok: !TODOS.some(e => e.status === 'pending') },
      ],
      indicadores: (() => {
        // Absenteísmo do mês: dias perdidos ÷ dias-pessoa previstos.
        const diasAfastados = TODOS
          .filter(e => (e.start_date || '') <= fimMes && (e.end_date || '') >= inicioMes)
          .filter(e => e.kind && e.kind !== 'ferias')
          .reduce((s, e) => {
            const ini = e.start_date > inicioMes ? e.start_date : inicioMes;
            const fim = e.end_date < fimMes ? e.end_date : fimMes;
            return s + Math.max(0, Math.round((new Date(fim) - new Date(ini)) / DIA) + 1);
          }, 0);
        const faltasMes = ponto.linhas.filter(p => p.work_date >= inicioMes && p.work_date <= fimMes).length;
        const diasUteis = 22 * (pessoas.length || 0);
        return {
          absenteismo_pct: diasUteis ? Math.round(((faltasMes + diasAfastados) / diasUteis) * 1000) / 10 : null,
          dias_afastados: diasAfastados,
          faltas_mes: faltasMes,
          // Custo do afastamento depende da folha; sem folha gerada, não
          // se inventa um valor.
          custo_afastamentos: null,
        };
      })(),
      avisos,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * POST /api/rh/ferias
 * Programa férias ou registra um afastamento.
 *
 * Férias sem saldo são recusadas aqui, no servidor — a tela pode ter
 * uma versão velha do saldo em mãos, o banco não.
 */
const criarFerias = async (req, res) => {
  const t = req.tenantId;
  const {
    employee_id, kind = 'ferias', start_date, end_date, reason, cid, doc_url,
    abono_pecuniario, abono_dias, adiantar_decimo, origin = 'rh', notes,
  } = req.body || {};

  if (!employee_id || !start_date || !end_date) {
    return res.status(400).json({ error: 'Informe o colaborador e o período.' });
  }
  if (end_date < start_date) {
    return res.status(400).json({ error: 'A data final não pode ser antes da inicial.' });
  }

  try {
    const { data: pessoa } = await supabase.from('CLIENTES')
      .select('id, name, admission_data, created_at')
      .eq('tenant_id', t).eq('id', employee_id).maybeSingle();
    if (!pessoa) return res.status(404).json({ error: 'Colaborador não encontrado.' });

    const dias = Math.round((new Date(end_date) - new Date(start_date)) / DIA) + 1;
    const linha = {
      tenant_id: t, employee_id, kind, start_date, end_date, days: dias,
      reason: reason || null, cid: cid || null, doc_url: doc_url || null,
      notes: notes || null, origin,
      status: origin === 'portal' ? 'pending' : 'scheduled',
      requested_by: req.userProfile?.id || null,
    };

    if (kind === 'ferias') {
      const { data: minhas } = await supabase.from('RH_FERIAS')
        .select('*').eq('tenant_id', t).eq('employee_id', employee_id);
      const { data: faltas } = await supabase.from('RH_PONTO')
        .select('work_date').eq('tenant_id', t).eq('employee_id', employee_id).eq('absence', true);

      const admissao = pessoa.admission_data?.start_date || (pessoa.created_at || '').slice(0, 10);
      const base = saldoDeFerias({ admissao, gozadas: minhas || [] });
      const faltasPorPeriodo = {};
      for (const p of base.periodos) {
        faltasPorPeriodo[p.inicio] = (faltas || []).filter(f => f.work_date >= p.inicio && f.work_date <= p.fim).length;
      }
      const s = saldoDeFerias({ admissao, gozadas: minhas || [], faltasPorPeriodo });
      const pedidos = dias + (Number(abono_dias) || 0);

      if (pedidos > s.saldo_total) {
        return res.status(400).json({
          error: `Saldo insuficiente: ${pessoa.name} tem ${s.saldo_total} dia(s) e o pedido é de ${pedidos}.`,
          saldo: s.saldo_total,
        });
      }
      // O período aquisitivo mais antigo com saldo é o que se consome
      // primeiro — é ele que está correndo risco de vencer.
      linha.aquisitivo_inicio = s.periodo_atual?.inicio || null;
      linha.aquisitivo_fim = s.periodo_atual?.fim || null;
      linha.abono_pecuniario = !!abono_pecuniario;
      linha.abono_dias = Number(abono_dias) || null;
      linha.adiantar_decimo = !!adiantar_decimo;
    } else {
      // Afastamento: as regras de INSS e exame saem do próprio período.
      const r = regrasAfastamento({ start_date, end_date });
      linha.inss_apos_15 = r.inss_apos_15;
      linha.exame_retorno_exigido = r.exame_retorno_exigido;
      linha.status = 'active';
    }

    const { data, error } = await supabase.from('RH_FERIAS').insert(linha).select().single();
    if (error) throw error;

    audit(req, 'create', kind === 'ferias' ? 'ferias' : 'afastamento', data.id, {
      colaborador: pessoa.name, periodo: `${start_date}..${end_date}`, dias,
    });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
router.post('/ferias', criarFerias);

/**
 * PATCH /api/rh/ferias/:id
 * Aprovar, recusar, cancelar ou registrar o retorno.
 * Aprovação é ato humano: fica gravado quem foi e quando.
 */
router.patch('/ferias/:id', async (req, res) => {
  const t = req.tenantId;
  const { acao, retorno_real, exame_retorno_em, notes } = req.body || {};
  const mapa = { aprovar: 'scheduled', recusar: 'rejected', cancelar: 'cancelled', concluir: 'done' };

  try {
    const patch = { updated_at: new Date().toISOString() };
    if (acao && mapa[acao]) {
      patch.status = mapa[acao];
      if (acao === 'aprovar') {
        patch.approved_by = req.userProfile?.id || null;
        patch.approved_at = new Date().toISOString();
      }
    }
    if (retorno_real) { patch.retorno_real = retorno_real; patch.status = 'done'; }
    if (exame_retorno_em) patch.exame_retorno_em = exame_retorno_em;
    if (notes !== undefined) patch.notes = notes;

    const { data, error } = await supabase.from('RH_FERIAS')
      .update(patch).eq('tenant_id', t).eq('id', req.params.id).select().single();
    if (error) throw error;

    audit(req, acao || 'update', 'ferias', req.params.id, patch);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.criarFerias = criarFerias;
