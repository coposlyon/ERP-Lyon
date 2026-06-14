const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

// meta de vendas mensal
router.get('/goal', async (req, res) => {
  try {
    const { data } = await supabase.from('METAS').select('monthly_sales')
      .eq('tenant_id', req.tenantId).maybeSingle();
    res.json({ monthly_sales: Number(data?.monthly_sales) || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/goal', async (req, res) => {
  if (!['admin', 'manager'].includes(req.userProfile?.role)) {
    return res.status(403).json({ error: 'Apenas gestores podem definir a meta' });
  }
  const monthly_sales = Math.max(Number(req.body.monthly_sales) || 0, 0);
  try {
    const { data, error } = await supabase.from('METAS')
      .upsert({ tenant_id: req.tenantId, monthly_sales, updated_at: new Date().toISOString() }, { onConflict: 'tenant_id' })
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/', async (req, res) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const firstDayOfMonth = today.substring(0, 8) + '01';
  // mês anterior
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
  const prevEnd   = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0] + 'T23:59:59';
  const tenantId = req.tenantId;

  try {
    const [
      { data: salesToday },
      { data: salesMonth },
      { data: salesPrevMonth },
      { count: pendingOrders },
      { data: recentSales },
      { data: receivables },
      { data: openQuotes },
      { data: customizations },
      { data: overduePayables },
      { data: meta },
    ] = await Promise.all([
      supabase.from('VENDAS').select('total').eq('tenant_id', tenantId).neq('status', 'cancelled').gte('created_at', today),
      supabase.from('VENDAS').select('total').eq('tenant_id', tenantId).neq('status', 'cancelled').gte('created_at', firstDayOfMonth),
      supabase.from('VENDAS').select('total').eq('tenant_id', tenantId).neq('status', 'cancelled').gte('created_at', prevStart).lte('created_at', prevEnd),
      supabase.from('VENDAS').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['open', 'confirmed', 'in_production']),
      supabase.from('VENDAS').select('id, number, total, status, created_at, CLIENTES(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
      supabase.from('LANCAMENTOS').select('amount').eq('tenant_id', tenantId).eq('type', 'receivable').eq('status', 'pending'),
      supabase.from('ORCAMENTOS').select('total').eq('tenant_id', tenantId).in('status', ['open', 'sent']),
      supabase.from('PERSONALIZACOES').select('status').eq('tenant_id', tenantId).in('status', ['briefing', 'design', 'approval', 'printing', 'finishing', 'ready']),
      supabase.from('LANCAMENTOS').select('amount').eq('tenant_id', tenantId).eq('type', 'payable').in('status', ['pending', 'partial']).lt('due_date', today),
      supabase.from('METAS').select('monthly_sales').eq('tenant_id', tenantId).maybeSingle(),
    ]);

    const totalSalesToday = (salesToday || []).reduce((s, v) => s + (v.total || 0), 0);
    const totalSalesMonth = (salesMonth || []).reduce((s, v) => s + (v.total || 0), 0);
    const totalSalesPrevMonth = (salesPrevMonth || []).reduce((s, v) => s + (v.total || 0), 0);
    const totalReceivables = (receivables || []).reduce((s, t) => s + (t.amount || 0), 0);
    const totalOpenQuotesValue = (openQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
    const totalOverduePayables = (overduePayables || []).reduce((s, t) => s + (t.amount || 0), 0);
    const goal = Number(meta?.monthly_sales) || 0;

    const customizationsByStatus = {};
    (customizations || []).forEach(c => {
      customizationsByStatus[c.status] = (customizationsByStatus[c.status] || 0) + 1;
    });

    res.json({
      kpis: {
        sales_today: totalSalesToday,
        sales_month: totalSalesMonth,
        sales_prev_month: totalSalesPrevMonth,
        sales_mom_pct: totalSalesPrevMonth > 0 ? Number((((totalSalesMonth - totalSalesPrevMonth) / totalSalesPrevMonth) * 100).toFixed(1)) : null,
        monthly_goal: goal,
        goal_progress: goal > 0 ? Number(((totalSalesMonth / goal) * 100).toFixed(1)) : null,
        pending_orders: pendingOrders || 0,
        receivables_pending: totalReceivables,
        open_quotes_count: (openQuotes || []).length,
        open_quotes_value: totalOpenQuotesValue,
        active_customizations: (customizations || []).length,
        customizations_by_status: customizationsByStatus,
        overdue_payables: totalOverduePayables,
      },
      recent_sales: recentSales || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/sales-chart', async (req, res) => {
  const { days, month, year } = req.query;

  let startDate, endDate;

  if (month && year) {
    // Modo mês/ano específico
    const y = parseInt(year);
    const m = parseInt(month);
    const lastDay = new Date(y, m, 0).getDate();
    startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    endDate   = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}T23:59:59`;
  } else {
    // Modo últimos N dias (legado)
    const d = parseInt(days) || 30;
    const from = new Date();
    from.setDate(from.getDate() - d);
    startDate = from.toISOString();
    endDate   = new Date().toISOString();
  }

  try {
    const { data, error } = await supabase
      .from('VENDAS')
      .select('created_at, total')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .order('created_at');

    if (error) throw error;

    const grouped = {};
    (data || []).forEach(sale => {
      const date = sale.created_at.split('T')[0];
      grouped[date] = (grouped[date] || 0) + (sale.total || 0);
    });

    const labels = Object.keys(grouped).sort();
    const values = labels.map(l => grouped[l]);
    const total  = values.reduce((s, v) => s + v, 0);

    res.json({ labels, values, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Comparativo anual (últimos 3 anos) ────────────────────────────────────────
router.get('/year-comparison', async (req, res) => {
  const currentYear = new Date().getFullYear();

  try {
    const startDate = `${currentYear - 2}-01-01`;

    const { data, error } = await supabase
      .from('VENDAS')
      .select('created_at, total')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate)
      .order('created_at');

    if (error) throw error;

    // Agrupa por ano → mês (0-11)
    const byYear = {};
    (data || []).forEach(sale => {
      const d = new Date(sale.created_at);
      const y = d.getFullYear();
      const m = d.getMonth();
      if (!byYear[y]) byYear[y] = new Array(12).fill(0);
      byYear[y][m] += sale.total || 0;
    });

    const result = Object.entries(byYear)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([year, months]) => ({
        year:   parseInt(year),
        months,
        total:  months.reduce((s, v) => s + v, 0),
      }));

    res.json({ data: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
