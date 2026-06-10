const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  const today = new Date().toISOString().split('T')[0];
  const firstDayOfMonth = today.substring(0, 8) + '01';
  const tenantId = req.tenantId;

  try {
    const [
      { data: salesToday },
      { data: salesMonth },
      { count: pendingOrders },
      { data: recentSales },
      { data: receivables },
      { data: openQuotes },
      { data: customizations },
      { data: overduePayables },
    ] = await Promise.all([
      supabase.from('VENDAS').select('total').eq('tenant_id', tenantId).neq('status', 'cancelled').gte('created_at', today),
      supabase.from('VENDAS').select('total').eq('tenant_id', tenantId).neq('status', 'cancelled').gte('created_at', firstDayOfMonth),
      supabase.from('VENDAS').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).in('status', ['open', 'confirmed', 'in_production']),
      supabase.from('VENDAS').select('id, number, total, status, created_at, CLIENTES(name)').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(10),
      supabase.from('LANCAMENTOS').select('amount').eq('tenant_id', tenantId).eq('type', 'receivable').eq('status', 'pending'),
      supabase.from('ORCAMENTOS').select('total').eq('tenant_id', tenantId).in('status', ['open', 'sent']),
      supabase.from('PERSONALIZACOES').select('status').eq('tenant_id', tenantId).in('status', ['briefing', 'design', 'approval', 'printing', 'finishing', 'ready']),
      supabase.from('LANCAMENTOS').select('amount').eq('tenant_id', tenantId).eq('type', 'payable').in('status', ['pending', 'partial']).lt('due_date', today),
    ]);

    const totalSalesToday = (salesToday || []).reduce((s, v) => s + (v.total || 0), 0);
    const totalSalesMonth = (salesMonth || []).reduce((s, v) => s + (v.total || 0), 0);
    const totalReceivables = (receivables || []).reduce((s, t) => s + (t.amount || 0), 0);
    const totalOpenQuotesValue = (openQuotes || []).reduce((s, q) => s + (q.total || 0), 0);
    const totalOverduePayables = (overduePayables || []).reduce((s, t) => s + (t.amount || 0), 0);

    const customizationsByStatus = {};
    (customizations || []).forEach(c => {
      customizationsByStatus[c.status] = (customizationsByStatus[c.status] || 0) + 1;
    });

    res.json({
      kpis: {
        sales_today: totalSalesToday,
        sales_month: totalSalesMonth,
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
  const { days = 30 } = req.query;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - Number(days));

  try {
    const { data, error } = await supabase
      .from('VENDAS')
      .select('created_at, total')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate.toISOString())
      .order('created_at');

    if (error) throw error;

    const grouped = {};
    (data || []).forEach(sale => {
      const date = sale.created_at.split('T')[0];
      grouped[date] = (grouped[date] || 0) + (sale.total || 0);
    });

    const labels = Object.keys(grouped).sort();
    const values = labels.map(l => grouped[l]);

    res.json({ labels, values });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
