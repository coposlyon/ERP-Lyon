const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// Central de Contas: visão mensal de todos os lançamentos (a pagar/receber),
// despesas fixas recorrentes e geração automática das contas do mês.

const isMonth = v => /^\d{4}-\d{2}$/.test(String(v || ''));
const todayISO = () => new Date().toISOString().split('T')[0];

// Última data do mês (competência 'YYYY-MM')
function monthRange(month) {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${month}-01`, end: `${month}-${String(last).padStart(2, '0')}`, lastDay: last };
}

// A migração 040 pode não ter rodado ainda — devolve orientação clara
function missingMigration(err) {
  return /DESPESAS_FIXAS|fixed_expense_id|competence_month|does not exist|42P01|42703/i.test(err?.message || '');
}
function migrationError(res) {
  return res.status(400).json({
    error: 'Recurso ainda não habilitado no banco. Rode a migração 040_contas_precificacao.sql no Supabase.',
    code: 'MIGRATION_040',
  });
}

// ── Visão mensal ──────────────────────────────────────────
// GET /contas/month?month=YYYY-MM
// Devolve lançamentos do mês + vencidos de meses anteriores + resumo.
router.get('/month', async (req, res) => {
  const month = isMonth(req.query.month) ? req.query.month : todayISO().slice(0, 7);
  const { start, end } = monthRange(month);
  const today = todayISO();

  try {
    const sel = '*, FORNECEDORES(name), CLIENTES(name)';

    // Lançamentos com vencimento dentro do mês
    const { data: doMes, error: e1 } = await supabase
      .from('LANCAMENTOS').select(sel)
      .eq('tenant_id', req.tenantId)
      .gte('due_date', start).lte('due_date', end)
      .order('due_date');
    if (e1) throw e1;

    // Vencidos de meses ANTERIORES ainda em aberto (aparecem destacados)
    const { data: atrasados, error: e2 } = await supabase
      .from('LANCAMENTOS').select(sel)
      .eq('tenant_id', req.tenantId)
      .in('status', ['pending', 'partial', 'overdue'])
      .lt('due_date', start)
      .order('due_date')
      .limit(200);
    if (e2) throw e2;

    // Marca vencido dinamicamente (sem depender de job que atualize status)
    const enrich = l => ({
      ...l,
      overdue: ['pending', 'partial', 'overdue'].includes(l.status) && l.due_date < today,
      remaining: Math.max(0, (Number(l.amount) || 0) - (Number(l.paid_amount) || 0)),
    });
    const rows = (doMes || []).map(enrich);
    const late = (atrasados || []).map(enrich);

    // Resumo do mês
    const sum = { pagar: { total: 0, pago: 0, aberto: 0, vencido: 0, count: 0 },
                  receber: { total: 0, recebido: 0, aberto: 0, vencido: 0, count: 0 } };
    for (const l of rows) {
      if (l.status === 'cancelled') continue;
      const b = l.type === 'payable' ? sum.pagar : sum.receber;
      const paidKey = l.type === 'payable' ? 'pago' : 'recebido';
      b.total += Number(l.amount) || 0;
      b[paidKey] += Number(l.paid_amount) || 0;
      b.aberto += l.remaining;
      if (l.overdue) b.vencido += l.remaining;
      b.count += 1;
    }
    const atrasadoAnterior = {
      pagar:   late.filter(l => l.type === 'payable').reduce((s, l) => s + l.remaining, 0),
      receber: late.filter(l => l.type === 'receivable').reduce((s, l) => s + l.remaining, 0),
    };

    // Despesas fixas ativas que ainda NÃO viraram conta neste mês
    let fixasPendentes = [];
    let fixasTotal = 0;
    try {
      const { data: fixas, error: e3 } = await supabase
        .from('DESPESAS_FIXAS').select('*')
        .eq('tenant_id', req.tenantId).eq('is_active', true)
        .lte('start_month', start)
        .or(`end_month.is.null,end_month.gte.${start}`)
        .order('due_day');
      if (e3) throw e3;
      fixasTotal = (fixas || []).reduce((s, f) => s + (Number(f.amount) || 0), 0);
      // Geradas = mesma regra do /generate (competência do mês), para o aviso
      // bater exatamente com o que o botão "Gerar" faria.
      const { data: geradasRows } = await supabase
        .from('LANCAMENTOS').select('fixed_expense_id')
        .eq('tenant_id', req.tenantId)
        .eq('competence_month', start)
        .not('fixed_expense_id', 'is', null);
      const geradas = new Set((geradasRows || []).map(l => l.fixed_expense_id));
      fixasPendentes = (fixas || []).filter(f => !geradas.has(f.id));
    } catch (err) {
      if (!missingMigration(err)) throw err;
      // sem a migração 040, a visão mensal continua funcionando sem as fixas
    }

    res.json({
      month,
      transactions: rows,
      previous_overdue: late,
      summary: {
        ...sum,
        saldo_previsto: sum.receber.total - sum.pagar.total,
        saldo_realizado: sum.receber.recebido - sum.pagar.pago,
        atrasado_anterior: atrasadoAnterior,
        fixas_mes: fixasTotal,
        fixas_nao_geradas: fixasPendentes.length,
      },
      fixed_pending: fixasPendentes.map(f => ({ id: f.id, name: f.name, amount: f.amount, due_day: f.due_day })),
    });
  } catch (err) {
    console.error('[contas/month]', err.message);
    res.status(500).json({ error: 'Erro ao carregar as contas do mês' });
  }
});

// ── Despesas fixas: CRUD ──────────────────────────────────
router.get('/fixed-expenses', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('DESPESAS_FIXAS').select('*, FORNECEDORES(name)')
      .eq('tenant_id', req.tenantId)
      .order('is_active', { ascending: false })
      .order('due_day');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    if (missingMigration(err)) return migrationError(res);
    console.error('[contas/fixed-expenses]', err.message);
    res.status(500).json({ error: 'Erro ao listar despesas fixas' });
  }
});

router.post('/fixed-expenses', async (req, res) => {
  const { name, amount, due_day, supplier_id, chart_account_id, cost_center_id, notes, start_month, end_month, auto_generate } = req.body;
  const nm = String(name || '').trim();
  const amt = Number(amount);
  const day = Math.min(Math.max(parseInt(due_day) || 5, 1), 31);
  if (!nm) return res.status(400).json({ error: 'Informe o nome da despesa' });
  if (!(amt >= 0)) return res.status(400).json({ error: 'Informe um valor válido' });
  try {
    const { data, error } = await supabase.from('DESPESAS_FIXAS').insert({
      tenant_id: req.tenantId,
      name: nm, amount: amt, due_day: day,
      supplier_id: supplier_id || null,
      chart_account_id: chart_account_id || null,
      cost_center_id: cost_center_id || null,
      notes: String(notes || '').trim() || null,
      auto_generate: auto_generate !== false,
      start_month: isMonth(start_month) ? `${start_month}-01` : undefined,
      end_month: isMonth(end_month) ? `${end_month}-01` : null,
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'fixed_expense', data.id, { name: nm, amount: amt, due_day: day });
    res.status(201).json(data);
  } catch (err) {
    if (missingMigration(err)) return migrationError(res);
    console.error('[contas/fixed-expenses]', err.message);
    res.status(500).json({ error: 'Erro ao criar despesa fixa' });
  }
});

router.put('/fixed-expenses/:id', async (req, res) => {
  const { name, amount, due_day, supplier_id, chart_account_id, cost_center_id, notes, end_month, auto_generate, is_active } = req.body;
  try {
    const upd = { updated_at: new Date().toISOString() };
    if (name !== undefined) upd.name = String(name).trim();
    if (amount !== undefined) {
      const amt = Number(amount);
      if (!(amt >= 0)) return res.status(400).json({ error: 'Valor inválido' });
      upd.amount = amt;
    }
    if (due_day !== undefined) upd.due_day = Math.min(Math.max(parseInt(due_day) || 5, 1), 31);
    if (supplier_id !== undefined) upd.supplier_id = supplier_id || null;
    if (chart_account_id !== undefined) upd.chart_account_id = chart_account_id || null;
    if (cost_center_id !== undefined) upd.cost_center_id = cost_center_id || null;
    if (notes !== undefined) upd.notes = String(notes || '').trim() || null;
    if (end_month !== undefined) upd.end_month = isMonth(end_month) ? `${end_month}-01` : null;
    if (auto_generate !== undefined) upd.auto_generate = !!auto_generate;
    if (is_active !== undefined) upd.is_active = !!is_active;

    const { data, error } = await supabase.from('DESPESAS_FIXAS')
      .update(upd).eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'fixed_expense', data.id, upd);
    res.json(data);
  } catch (err) {
    if (missingMigration(err)) return migrationError(res);
    console.error('[contas/fixed-expenses]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar despesa fixa' });
  }
});

router.delete('/fixed-expenses/:id', async (req, res) => {
  try {
    // Desativa (mantém histórico dos lançamentos já gerados)
    const { data, error } = await supabase.from('DESPESAS_FIXAS')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, name').single();
    if (error) throw error;
    audit(req, 'delete', 'fixed_expense', data.id, { name: data.name });
    res.json({ success: true });
  } catch (err) {
    if (missingMigration(err)) return migrationError(res);
    console.error('[contas/fixed-expenses]', err.message);
    res.status(500).json({ error: 'Erro ao remover despesa fixa' });
  }
});

// ── Gerar as contas do mês a partir das despesas fixas ────
// POST /contas/fixed-expenses/generate { month: 'YYYY-MM' }
// Idempotente: despesa que já tem conta no mês é pulada.
router.post('/fixed-expenses/generate', async (req, res) => {
  const month = isMonth(req.body.month) ? req.body.month : todayISO().slice(0, 7);
  const { start, lastDay } = monthRange(month);
  try {
    const { data: fixas, error: e1 } = await supabase
      .from('DESPESAS_FIXAS').select('*')
      .eq('tenant_id', req.tenantId).eq('is_active', true)
      .lte('start_month', start)
      .or(`end_month.is.null,end_month.gte.${start}`);
    if (e1) throw e1;
    if (!fixas?.length) return res.json({ created: 0, skipped: 0, message: 'Nenhuma despesa fixa ativa' });

    // Quais já foram geradas neste mês?
    const { data: existentes, error: e2 } = await supabase
      .from('LANCAMENTOS').select('fixed_expense_id')
      .eq('tenant_id', req.tenantId)
      .eq('competence_month', start)
      .not('fixed_expense_id', 'is', null);
    if (e2) throw e2;
    const jaGeradas = new Set((existentes || []).map(l => l.fixed_expense_id));

    const label = month.split('-').reverse().join('/'); // MM/YYYY
    const rows = fixas
      .filter(f => !jaGeradas.has(f.id))
      .map(f => ({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        description: `${f.name} (${label})`,
        type: 'payable',
        amount: Number(f.amount) || 0,
        paid_amount: 0,
        due_date: `${month}-${String(Math.min(f.due_day, lastDay)).padStart(2, '0')}`,
        status: 'pending',
        supplier_id: f.supplier_id || null,
        chart_account_id: f.chart_account_id || null,
        cost_center_id: f.cost_center_id || null,
        fixed_expense_id: f.id,
        competence_month: start,
        reference_type: 'fixed_expense',
        reference_id: f.id,
      }));

    if (rows.length) {
      const { error: e3 } = await supabase.from('LANCAMENTOS').insert(rows);
      if (e3) throw e3;
      audit(req, 'generate', 'fixed_expense', null, { month, created: rows.length });
    }
    res.json({ created: rows.length, skipped: fixas.length - rows.length, month });
  } catch (err) {
    if (missingMigration(err)) return migrationError(res);
    console.error('[contas/generate]', err.message);
    res.status(500).json({ error: 'Erro ao gerar as contas do mês' });
  }
});

// ── Editar / cancelar lançamento ──────────────────────────
router.patch('/:id', async (req, res) => {
  const { description, amount, due_date, notes } = req.body;
  try {
    const { data: cur } = await supabase.from('LANCAMENTOS').select('*')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Lançamento não encontrado' });
    if (cur.status === 'paid') return res.status(400).json({ error: 'Lançamento já quitado não pode ser editado' });

    const upd = {};
    if (description !== undefined) upd.description = String(description).trim();
    if (amount !== undefined) {
      const amt = Number(amount);
      if (!(amt > 0)) return res.status(400).json({ error: 'Valor inválido' });
      if (amt < (Number(cur.paid_amount) || 0)) return res.status(400).json({ error: 'Valor menor que o já pago' });
      upd.amount = amt;
    }
    if (due_date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(due_date))) return res.status(400).json({ error: 'Data de vencimento inválida' });
      upd.due_date = due_date;
    }
    if (notes !== undefined) upd.notes = String(notes || '').trim() || null;

    const { data, error } = await supabase.from('LANCAMENTOS')
      .update(upd).eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'financial', data.id, upd);
    res.json(data);
  } catch (err) {
    console.error('[contas/patch]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar lançamento' });
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const { data: cur } = await supabase.from('LANCAMENTOS').select('id, status, description, paid_amount')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Lançamento não encontrado' });
    if (cur.status === 'paid') return res.status(400).json({ error: 'Lançamento quitado não pode ser cancelado' });
    if ((Number(cur.paid_amount) || 0) > 0) return res.status(400).json({ error: 'Lançamento com pagamento parcial não pode ser cancelado' });

    const { error } = await supabase.from('LANCAMENTOS')
      .update({ status: 'cancelled' })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'cancel', 'financial', cur.id, { description: cur.description });
    res.json({ success: true });
  } catch (err) {
    console.error('[contas/cancel]', err.message);
    res.status(500).json({ error: 'Erro ao cancelar lançamento' });
  }
});

module.exports = router;
