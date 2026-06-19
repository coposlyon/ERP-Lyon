const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/sales-summary', async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    const { data, error } = await supabase
      .from('VENDAS')
      .select('id, number, total, status, created_at, CLIENTES(name)')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', start_date || new Date(Date.now() - 30 * 86400000).toISOString())
      .lte('created_at', (end_date || new Date().toISOString().split('T')[0]) + 'T23:59:59')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const totalAmount = data.reduce((s, v) => s + (v.total || 0), 0);
    res.json({ data, summary: { total_amount: totalAmount, total_count: data.length } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stock-position', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('id, code, name, unit, current_stock, min_stock, cost_price, sale_price, supplier_id, variations, CATEGORIAS(name), FORNECEDORES(id, name, phone)')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .order('name');

    if (error) throw error;

    const totalCost = data.reduce((s, p) => s + (p.current_stock * p.cost_price), 0);
    const totalValue = data.reduce((s, p) => s + (p.current_stock * p.sale_price), 0);
    const belowMin = data.filter(p => p.current_stock <= p.min_stock).length;

    res.json({
      data,
      summary: {
        total_products: data.length,
        total_cost_value: totalCost,
        total_sale_value: totalValue,
        below_min_stock: belowMin,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/top-customers', async (req, res) => {
  const { start_date, end_date, limit = 10 } = req.query;

  try {
    const { data, error } = await supabase
      .from('VENDAS')
      .select('customer_id, total, CLIENTES(id, name, cpf_cnpj)')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .not('customer_id', 'is', null)
      .gte('created_at', start_date || new Date(Date.now() - 90 * 86400000).toISOString())
      .lte('created_at', (end_date || new Date().toISOString().split('T')[0]) + 'T23:59:59');

    if (error) throw error;

    const grouped = {};
    data.forEach(sale => {
      const cid = sale.customer_id;
      if (!grouped[cid]) grouped[cid] = { customer: sale.CLIENTES, total: 0, count: 0 };
      grouped[cid].total += sale.total || 0;
      grouped[cid].count += 1;
    });

    const sorted = Object.values(grouped)
      .sort((a, b) => b.total - a.total)
      .slice(0, Number(limit));

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/top-products', async (req, res) => {
  const { start_date, end_date, limit = 15 } = req.query;
  const startDate = start_date || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const endDate = (end_date || new Date().toISOString().split('T')[0]) + 'T23:59:59';

  try {
    // Step 1: get valid sale IDs in date range
    const { data: sales, error: salesError } = await supabase
      .from('VENDAS')
      .select('id')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate)
      .lte('created_at', endDate);

    if (salesError) throw salesError;

    const saleIds = (sales || []).map(s => s.id);
    if (saleIds.length === 0) return res.json([]);

    // Step 2: get items for those sales
    const { data: items, error: itemsError } = await supabase
      .from('VENDA_ITENS')
      .select('product_id, quantity, total, PRODUTOS(id, name, code, unit)')
      .in('sale_id', saleIds);

    if (itemsError) throw itemsError;

    // Step 3: aggregate
    const grouped = {};
    (items || []).forEach(item => {
      const pid = item.product_id;
      if (!pid) return;
      if (!grouped[pid]) {
        grouped[pid] = {
          product: item.PRODUTOS,
          total_qty: 0,
          total_value: 0,
          count: 0,
        };
      }
      grouped[pid].total_qty += Number(item.quantity) || 0;
      grouped[pid].total_value += Number(item.total) || 0;
      grouped[pid].count += 1;
    });

    const sorted = Object.values(grouped)
      .sort((a, b) => b.total_value - a.total_value)
      .slice(0, Number(limit));

    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/cashflow', async (req, res) => {
  const { start_date, end_date } = req.query;
  const startDate = start_date || new Date().toISOString().split('T')[0];
  const endDate = end_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  try {
    const { data, error } = await supabase
      .from('LANCAMENTOS')
      .select('type, amount, paid_amount, due_date, status, description')
      .eq('tenant_id', req.tenantId)
      .gte('due_date', startDate)
      .lte('due_date', endDate)
      .not('status', 'eq', 'cancelled')
      .order('due_date');

    if (error) throw error;

    // Group by date
    const byDate = {};
    (data || []).forEach(item => {
      const date = item.due_date;
      if (!byDate[date]) byDate[date] = { date, receivable: 0, payable: 0, balance: 0 };
      if (item.type === 'receivable') {
        byDate[date].receivable += item.amount || 0;
      } else {
        byDate[date].payable += item.amount || 0;
      }
    });

    // Build cumulative cashflow
    let accumulated = 0;
    const rows = Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date)).map(row => {
      accumulated += (row.receivable - row.payable);
      return { ...row, balance: accumulated };
    });

    const totalReceivable = (data || []).filter(i => i.type === 'receivable').reduce((s, i) => s + (i.amount || 0), 0);
    const totalPayable = (data || []).filter(i => i.type === 'payable').reduce((s, i) => s + (i.amount || 0), 0);

    res.json({ rows, summary: { total_receivable: totalReceivable, total_payable: totalPayable, net: totalReceivable - totalPayable }, items: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/quotes-summary', async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    const { data, error } = await supabase
      .from('ORCAMENTOS')
      .select('id, number, total, status, created_at, valid_until, CLIENTES(name)')
      .eq('tenant_id', req.tenantId)
      .gte('created_at', start_date || new Date(Date.now() - 30 * 86400000).toISOString())
      .lte('created_at', (end_date || new Date().toISOString().split('T')[0]) + 'T23:59:59')
      .order('created_at', { ascending: false });

    if (error) throw error;

    const summary = {
      total_count: data.length,
      total_value: data.reduce((s, q) => s + (q.total || 0), 0),
      by_status: {},
    };
    data.forEach(q => {
      summary.by_status[q.status] = (summary.by_status[q.status] || 0) + 1;
    });

    res.json({ data, summary });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Rentabilidade por pedido ──────────────────────────────
router.get('/profitability', async (req, res) => {
  const { start_date, end_date } = req.query;
  const startDate = start_date || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const endDate   = (end_date  || new Date().toISOString().split('T')[0]) + 'T23:59:59';

  try {
    const { data: sales, error: sErr } = await supabase
      .from('VENDAS')
      .select('id, number, total, discount, created_at, customer_id, CLIENTES(id,name)')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', startDate)
      .lte('created_at', endDate);
    if (sErr) throw sErr;
    if (!sales?.length)
      return res.json({ data:[], summary:{ revenue:0, cost:0, profit:0, margin:0 } });

    const saleIds = sales.map(s => s.id);
    const { data: items, error: iErr } = await supabase
      .from('VENDA_ITENS')
      .select('sale_id, quantity, total, PRODUTOS(id,name,cost_price)')
      .in('sale_id', saleIds);
    if (iErr) throw iErr;

    const costBySale = {};
    (items||[]).forEach(it => {
      const cost = (it.quantity||0) * (it.PRODUTOS?.cost_price||0);
      costBySale[it.sale_id] = (costBySale[it.sale_id]||0) + cost;
    });

    const data = sales.map(s => {
      const revenue = s.total || 0;
      const cost    = costBySale[s.id] || 0;
      const profit  = revenue - cost;
      const margin  = revenue > 0 ? (profit / revenue * 100) : 0;
      return { ...s, revenue, cost, profit, margin: parseFloat(margin.toFixed(2)) };
    });

    const totalRevenue = data.reduce((a,d) => a + d.revenue, 0);
    const totalCost    = data.reduce((a,d) => a + d.cost,    0);
    const totalProfit  = totalRevenue - totalCost;
    const avgMargin    = totalRevenue > 0
      ? parseFloat((totalProfit / totalRevenue * 100).toFixed(2)) : 0;

    res.json({
      data,
      summary: { revenue:totalRevenue, cost:totalCost, profit:totalProfit, margin:avgMargin },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Curva ABC de produtos (com margem) ────────────────────
// Classe A = primeiros 80% do faturamento, B = 80–95%, C = 95–100%.
router.get('/abc-products', async (req, res) => {
  const { start_date, end_date } = req.query;
  const startDate = start_date || new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0];
  const endDate   = (end_date || new Date().toISOString().split('T')[0]) + 'T23:59:59';
  try {
    const { data: sales } = await supabase
      .from('VENDAS').select('id')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', startDate).lte('created_at', endDate);
    const saleIds = (sales || []).map(s => s.id);
    if (saleIds.length === 0) return res.json({ data: [], summary: { revenue: 0, classes: {} } });

    const { data: items } = await supabase
      .from('VENDA_ITENS')
      .select('product_id, quantity, total, PRODUTOS(id, name, code, unit, cost_price)')
      .in('sale_id', saleIds);

    const grouped = {};
    for (const it of (items || [])) {
      const pid = it.product_id;
      if (!pid) continue;
      if (!grouped[pid]) {
        grouped[pid] = {
          product_id: pid, name: it.PRODUTOS?.name, code: it.PRODUTOS?.code, unit: it.PRODUTOS?.unit,
          qty: 0, revenue: 0, cost: 0,
        };
      }
      grouped[pid].qty     += Number(it.quantity) || 0;
      grouped[pid].revenue += Number(it.total) || 0;
      grouped[pid].cost    += (Number(it.quantity) || 0) * (Number(it.PRODUTOS?.cost_price) || 0);
    }

    const list = Object.values(grouped).sort((a, b) => b.revenue - a.revenue);
    const totalRevenue = list.reduce((s, p) => s + p.revenue, 0) || 1;

    let acc = 0;
    const data = list.map(p => {
      acc += p.revenue;
      const cumPct = (acc / totalRevenue) * 100;
      const klass = cumPct <= 80 ? 'A' : cumPct <= 95 ? 'B' : 'C';
      const profit = p.revenue - p.cost;
      return {
        ...p,
        profit,
        margin: p.revenue > 0 ? Number((profit / p.revenue * 100).toFixed(1)) : 0,
        share: Number((p.revenue / totalRevenue * 100).toFixed(1)),
        cumulative: Number(cumPct.toFixed(1)),
        abc: klass,
      };
    });

    const classes = data.reduce((acc2, p) => {
      acc2[p.abc] = (acc2[p.abc] || 0) + 1;
      return acc2;
    }, {});

    res.json({ data, summary: { revenue: totalRevenue, classes, products: data.length } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Comissão de vendedores ────────────────────────────────
router.get('/commissions', async (req, res) => {
  const { start_date, end_date } = req.query;
  const rate = Math.max(0, Number(req.query.rate) || 0); // % de comissão
  const startDate = start_date || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const endDate   = (end_date || new Date().toISOString().split('T')[0]) + 'T23:59:59';
  try {
    const { data: sales } = await supabase
      .from('VENDAS')
      .select('id, number, total, user_id, created_at, USUARIOS(id, name)')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', startDate).lte('created_at', endDate);

    const grouped = {};
    for (const s of (sales || [])) {
      const uid = s.user_id || 'sem_vendedor';
      if (!grouped[uid]) {
        grouped[uid] = { user_id: s.user_id || null, name: s.USUARIOS?.name || 'Sem vendedor', sales_count: 0, total: 0 };
      }
      grouped[uid].sales_count += 1;
      grouped[uid].total       += Number(s.total) || 0;
    }

    const data = Object.values(grouped)
      .map(v => ({ ...v, commission: Number((v.total * rate / 100).toFixed(2)) }))
      .sort((a, b) => b.total - a.total);

    const totalSold = data.reduce((s, v) => s + v.total, 0);
    res.json({
      data, rate,
      summary: { total_sold: totalSold, total_commission: Number((totalSold * rate / 100).toFixed(2)) },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Previsão de demanda ───────────────────────────────────
// Histórico mensal por produto → projeta o próximo mês por regressão linear
// (tendência) com piso na média móvel. Sugere quanto comprar vs. estoque atual.
router.get('/forecast', async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months) || 6, 3), 12);
  const t = req.tenantId;
  try {
    const now = new Date();
    // início = primeiro dia do mês, `months` meses atrás
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
    const startISO = start.toISOString();

    const { data: sales } = await supabase
      .from('VENDAS').select('id, created_at')
      .eq('tenant_id', t).neq('status', 'cancelled')
      .gte('created_at', startISO);
    const saleMonth = {};
    for (const s of (sales || [])) saleMonth[s.id] = String(s.created_at).slice(0, 7); // YYYY-MM
    const saleIds = Object.keys(saleMonth);

    // rótulos dos meses do período (ordenados)
    const labels = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      labels.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const idx = Object.fromEntries(labels.map((m, i) => [m, i]));

    const grouped = {};
    // busca itens em lotes (limite do .in)
    for (let i = 0; i < saleIds.length; i += 300) {
      const chunk = saleIds.slice(i, i + 300);
      if (!chunk.length) break;
      const { data: items } = await supabase
        .from('VENDA_ITENS')
        .select('sale_id, product_id, quantity, PRODUTOS(id, name, code, unit, current_stock, min_stock)')
        .in('sale_id', chunk);
      for (const it of (items || [])) {
        const pid = it.product_id; if (!pid) continue;
        const m = saleMonth[it.sale_id]; const j = idx[m]; if (j === undefined) continue;
        if (!grouped[pid]) {
          grouped[pid] = {
            product_id: pid, name: it.PRODUTOS?.name, code: it.PRODUTOS?.code, unit: it.PRODUTOS?.unit,
            current_stock: Number(it.PRODUTOS?.current_stock) || 0,
            min_stock: Number(it.PRODUTOS?.min_stock) || 0,
            series: new Array(months).fill(0),
          };
        }
        grouped[pid].series[j] += Number(it.quantity) || 0;
      }
    }

    const data = Object.values(grouped).map(p => {
      const y = p.series, n = y.length;
      const avg = y.reduce((a, b) => a + b, 0) / n;
      // regressão linear simples (x = 0..n-1)
      const xm = (n - 1) / 2;
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) { num += (i - xm) * (y[i] - avg); den += (i - xm) ** 2; }
      const slope = den ? num / den : 0;
      const linpred = avg + slope * ((n - 1) + 1 - xm); // projeção p/ x = n
      // piso na média dos últimos 3 meses p/ não subestimar
      const recent = y.slice(-3);
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const forecast = Math.max(0, Math.round(Math.max(linpred, recentAvg)));
      const trend = slope > 0.15 ? 'up' : slope < -0.15 ? 'down' : 'flat';
      const suggested = Math.max(0, Math.round(forecast + p.min_stock - p.current_stock));
      return {
        ...p, avg_month: Number(avg.toFixed(1)), forecast, trend, suggested_purchase: suggested,
        total_period: y.reduce((a, b) => a + b, 0),
      };
    })
    .filter(p => p.total_period > 0)
    .sort((a, b) => b.forecast - a.forecast);

    res.json({ months: labels, count: data.length, data });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
