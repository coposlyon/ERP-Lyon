// ════════════════════════════════════════════════════════════
// RATEIO DE CUSTOS — centraliza os custos da empresa e distribui
// para produtos e pedidos. Regra: nada é digitado duas vezes —
// despesas vêm do Financeiro, custos e fretes de Compras, fichas
// da Formação de Preço, pedidos do Comercial.
// ════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const {
  VARIABLE_DEFAULTS, getConfig, saveConfig,
  fixedOverview, snapshotRateio, computeSheet, productCostMap,
  syncEmployeesToFixed, productionLabor, commissionBySeller,
  marketingSpend, extraVariableCosts,
} = require('../lib/rateioLib');

const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
// R$ com 4 casas, para exibir custo unitário dentro das fórmulas
const fmt4 = v => `R$ ${(Number(v) || 0).toFixed(4).replace('.', ',')}`;
const userName = req => req.user?.name || req.user?.email || null;

// ── Despesas Fixas: visão geral + histórico ───────────────
router.get('/summary', async (req, res) => {
  try {
    // Roteia os salários: Produção → Custos Variáveis; demais → Despesas Fixas
    await syncEmployeesToFixed(req.tenantId);
    const [ov, cfg, labor] = await Promise.all([
      fixedOverview(req.tenantId), getConfig(req.tenantId), productionLabor(req.tenantId),
    ]);
    res.json({
      ...ov,
      manual_units: cfg.monthly_units,
      history: Array.isArray(cfg.rateio_history) ? cfg.rateio_history : [],
      expense_cards: Array.isArray(cfg.expense_cards) ? cfg.expense_cards : [],
      prod_labor_total: labor.total,
    });
  } catch (err) {
    console.error('[rateio/summary]', err.message);
    res.status(500).json({ error: 'Erro ao carregar o rateio de custos' });
  }
});

// Salva produção/método e registra o snapshot do período no histórico
router.put('/config', async (req, res) => {
  const { monthly_units, rateio_method, period } = req.body;
  try {
    const patch = {};
    if (monthly_units !== undefined) {
      patch.monthly_units = monthly_units === null || monthly_units === ''
        ? null : Math.max(0, parseInt(monthly_units) || 0);
    }
    if (rateio_method !== undefined) {
      patch.rateio_method = rateio_method === 'vendas' ? 'vendas' : 'producao';
    }
    if (Object.keys(patch).length) await saveConfig(req.tenantId, patch);
    const history = await snapshotRateio(req.tenantId, period, userName(req));
    const ov = await fixedOverview(req.tenantId);
    audit(req, 'update', 'rateio_config', req.tenantId, patch);
    res.json({ ...ov, history: history || [] });
  } catch (err) {
    console.error('[rateio/config]', err.message);
    res.status(500).json({ error: 'Erro ao salvar o rateio' });
  }
});

// ── Cards personalizados de despesas fixas (organização visual) ──
router.put('/expense-cards', async (req, res) => {
  const { expense_cards } = req.body;
  if (!Array.isArray(expense_cards)) return res.status(400).json({ error: 'expense_cards inválido' });
  try {
    const clean = [...new Set(expense_cards.map(c => String(c).trim()).filter(Boolean))].slice(0, 30);
    await saveConfig(req.tenantId, { expense_cards: clean });
    audit(req, 'update', 'rateio_expense_cards', req.tenantId, { count: clean.length });
    res.json({ expense_cards: clean });
  } catch (err) {
    console.error('[rateio/expense-cards]', err.message);
    res.status(500).json({ error: 'Erro ao salvar os cards' });
  }
});

// ── Cores por categoria (personalização visual da tabela/gráfico) ──
// Endpoint leve: mescla no settings.pricing sem registrar snapshot.
router.put('/category-colors', async (req, res) => {
  const { category_colors } = req.body;
  if (!category_colors || typeof category_colors !== 'object' || Array.isArray(category_colors)) {
    return res.status(400).json({ error: 'category_colors inválido' });
  }
  try {
    const cfg = await getConfig(req.tenantId);
    const merged = { ...(cfg.category_colors || {}) };
    for (const [name, color] of Object.entries(category_colors)) {
      const nm = String(name).trim();
      if (!nm) continue;
      // cor vazia/null remove a personalização daquela categoria
      if (!color) delete merged[nm];
      else if (/^#[0-9a-fA-F]{6}$/.test(String(color))) merged[nm] = String(color);
    }
    const saved = await saveConfig(req.tenantId, { category_colors: merged });
    audit(req, 'update', 'rateio_category_colors', req.tenantId, { count: Object.keys(merged).length });
    res.json({ category_colors: saved.category_colors || {} });
  } catch (err) {
    console.error('[rateio/category-colors]', err.message);
    res.status(500).json({ error: 'Erro ao salvar as cores das categorias' });
  }
});

// ── Despesas Variáveis: taxas + fretes de compra (integração) ──
router.get('/variable', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    const variable = {
      ...VARIABLE_DEFAULTS,
      ...(cfg.variable_costs || {}),
      marketplace: { ...VARIABLE_DEFAULTS.marketplace, ...((cfg.variable_costs || {}).marketplace || {}) },
    };

    // Fretes reais lançados nas Compras (não se digita duas vezes)
    let freights = [];
    try {
      const { data } = await supabase.from('COMPRAS')
        .select('id, number, freight, total, created_at, FORNECEDORES(name)')
        .eq('tenant_id', req.tenantId)
        .gt('freight', 0)
        .order('created_at', { ascending: false })
        .limit(20);
      freights = (data || []).map(c => ({
        id: c.id, number: c.number,
        supplier: c.FORNECEDORES?.name || '—',
        freight: Number(c.freight) || 0,
        total: Number(c.total) || 0,
        date: c.created_at,
      }));
    } catch { /* coluna freight (042) pendente */ }
    const freightTotal = freights.reduce((s, f) => s + f.freight, 0);

    // Mão de obra direta: folha dos colaboradores da PRODUÇÃO (vem do RH)
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [labor, ov, commissions, marketing, extras] = await Promise.all([
      productionLabor(req.tenantId), fixedOverview(req.tenantId),
      commissionBySeller(req.tenantId, month),
      marketingSpend(req.tenantId, month), extraVariableCosts(req.tenantId, month),
    ]);
    const units = ov.monthly_units;
    const perUnit = v => (units > 0 ? Math.round((v / units) * 10000) / 10000 : 0);

    // Custo variável por unidade que alimenta Formação de Preço,
    // Rateio por Pedido e Painel de Rentabilidade
    const variableUnit = perUnit(labor.total + commissions.total + marketing.total + extras.total);

    res.json({
      variable, freights, freight_total: r2(freightTotal),
      prod_labor: {
        items: labor.items,
        total: r2(labor.total),
        per_unit: perUnit(labor.total),
        monthly_units: units,
      },
      commissions, // { month, items:[{name,pct,sales,commission,goal_pct}], total }
      marketing: { ...marketing, per_unit: perUnit(marketing.total) },
      extras: { ...extras, per_unit: perUnit(extras.total) },
      variable_unit: variableUnit,
      monthly_units: units,
    });
  } catch (err) {
    console.error('[rateio/variable]', err.message);
    res.status(500).json({ error: 'Erro ao carregar as despesas variáveis' });
  }
});

router.put('/variable', async (req, res) => {
  try {
    const v = req.body || {};
    const pct = x => Math.min(Math.max(Number(x) || 0, 0), 95);
    const clean = {
      commission_pct: pct(v.commission_pct),
      pix_pct: pct(v.pix_pct),
      boleto_fee: Math.max(Number(v.boleto_fee) || 0, 0),
      card_debit_pct: pct(v.card_debit_pct),
      card_credit_pct: pct(v.card_credit_pct),
      card_installment_pct: pct(v.card_installment_pct),
      antecipacao_pct: pct(v.antecipacao_pct),
      payment_link_pct: pct(v.payment_link_pct),
      marketplace: {
        shopee: pct(v.marketplace?.shopee),
        mercado_livre: pct(v.marketplace?.mercado_livre),
        amazon: pct(v.marketplace?.amazon),
        site_proprio: pct(v.marketplace?.site_proprio),
      },
      // Operadoras de cartão: taxa por bandeira/adquirente e faixa de parcelas
      card_operators: (Array.isArray(v.card_operators) ? v.card_operators : [])
        .filter(o => String(o?.name || '').trim())
        .slice(0, 20)
        .map(o => ({
          name: String(o.name).trim().slice(0, 60),
          debito: pct(o.debito),
          credito: pct(o.credito),
          inst_2_6: pct(o.inst_2_6),
          inst_7_12: pct(o.inst_7_12),
          antecipacao: pct(o.antecipacao),
        })),
      // Canais de marketplace adicionais
      marketplace_channels: (Array.isArray(v.marketplace_channels) ? v.marketplace_channels : [])
        .filter(c => String(c?.name || '').trim())
        .slice(0, 20)
        .map(c => ({ name: String(c.name).trim().slice(0, 60), pct: pct(c.pct) })),
    };
    await saveConfig(req.tenantId, { variable_costs: clean });
    audit(req, 'update', 'rateio_variable', req.tenantId, clean);
    res.json(clean);
  } catch (err) {
    console.error('[rateio/variable]', err.message);
    res.status(500).json({ error: 'Erro ao salvar as despesas variáveis' });
  }
});

// ── Rateio por Produto: composição completa do custo ──────
router.get('/product/:id', async (req, res) => {
  try {
    const ov = await fixedOverview(req.tenantId);
    const findProduct = sel => supabase.from('PRODUTOS').select(sel)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    // updated_at pode não existir em bases antigas
    let { data: product, error: pErr } = await findProduct('id, name, cost_price, sale_price, updated_at, CATEGORIAS(name)');
    if (pErr) ({ data: product } = await findProduct('id, name, cost_price, sale_price, CATEGORIAS(name)'));
    if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

    // Ficha de Formação de Preço mais recente do produto
    let sheet = null;
    try {
      const { data } = await supabase.from('PRECIFICACOES')
        .select('*').eq('tenant_id', req.tenantId).eq('product_id', product.id)
        .eq('is_active', true).order('updated_at', { ascending: false })
        .limit(1).maybeSingle();
      sheet = data || null;
    } catch { /* migração 042 pendente */ }

    let breakdown;
    if (sheet) {
      const c = computeSheet({ ...sheet, overhead_unit: ov.overhead_unit });
      breakdown = {
        source: 'ficha', sheet_id: sheet.id, sheet_name: sheet.name,
        materia_prima: c.mat_unit,
        tintas: c.tinta_unit,
        serigrafia: c.pers_unit,
        caixa: c.emb_unit,
        frete: c.frete_unit,
        rateio: ov.overhead_unit,
        subtotal: c.cost_subtotal,
        impostos: c.tax_unit,
        custo_total: c.cost_unit,
        preco_ideal: c.price_ideal,
      };
    } else {
      // Sem ficha: custo do cadastro + rateio + imposto padrão
      const base = Number(product.cost_price) || 0;
      const subtotal = base + ov.overhead_unit;
      const impostos = subtotal * ov.tax_pct_default / 100;
      breakdown = {
        source: 'cadastro', sheet_id: null, sheet_name: null,
        materia_prima: r2(base), tintas: 0, serigrafia: 0, caixa: 0, frete: 0,
        rateio: ov.overhead_unit,
        subtotal: r2(subtotal),
        impostos: r2(impostos),
        custo_total: r2(subtotal + impostos),
        preco_ideal: null,
      };
    }

    // ── Custo VARIÁVEL por unidade (vem do módulo de Despesas Variáveis)
    const month = new Date().toISOString().slice(0, 7);
    const [labor, commissions, marketing, extras, cfg] = await Promise.all([
      productionLabor(req.tenantId), commissionBySeller(req.tenantId, month),
      marketingSpend(req.tenantId, month), extraVariableCosts(req.tenantId, month),
      getConfig(req.tenantId),
    ]);
    const units = ov.monthly_units;
    const pu = v => (units > 0 ? Math.round((v / units) * 10000) / 10000 : 0);
    const variavelUnit = pu(labor.total + commissions.total + marketing.total + extras.total);

    // ── Linhas com ORIGEM de cada custo
    const src = breakdown.source === 'ficha'
      ? { o: `Ficha "${breakdown.sheet_name}"`, l: '/pricing/formacao' }
      : { o: 'Cadastro do produto', l: '/products' };
    const lines = [
      { key: 'materia_prima', label: 'Matéria-prima', value: breakdown.materia_prima, origin: src.o, link: src.l },
      { key: 'tintas',        label: 'Tinta',          value: breakdown.tintas,        origin: src.o, link: src.l },
      { key: 'serigrafia',    label: 'Tela / Serigrafia', value: breakdown.serigrafia, origin: src.o, link: src.l },
      { key: 'caixa',         label: 'Embalagem',      value: breakdown.caixa,         origin: src.o, link: src.l },
      { key: 'frete',         label: 'Frete de compra', value: breakdown.frete,        origin: 'Compras', link: '/purchases' },
      { key: 'rateio',        label: 'Rateio de despesas fixas', value: breakdown.rateio, origin: 'Despesas Fixas', link: '/rateio/despesas-fixas' },
      { key: 'variavel',      label: 'Custos variáveis (mão de obra, comissão, marketing)', value: variavelUnit, origin: 'Despesas Variáveis', link: '/rateio/despesas-variaveis' },
      { key: 'impostos',      label: 'Impostos', value: breakdown.impostos, origin: 'Fiscal', link: '/fiscal' },
    ];
    const custoTotal = r2(lines.reduce((s, l) => s + (Number(l.value) || 0), 0));
    for (const l of lines) {
      l.value = Math.round((Number(l.value) || 0) * 10000) / 10000;
      l.pct = custoTotal > 0 ? Math.round((l.value / custoTotal) * 1000) / 10 : 0;
    }

    // ── Datas de atualização (alerta quando o custo está velho)
    const dates = [
      sheet?.updated_at ? { label: 'Ficha de preço', at: sheet.updated_at } : null,
      product.updated_at ? { label: 'Cadastro do produto', at: product.updated_at } : null,
    ].filter(Boolean);
    let insumoAt = null;
    try {
      const { data: ins } = await supabase.from('INSUMOS').select('updated_at')
        .eq('tenant_id', req.tenantId).eq('is_active', true)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      if (ins?.updated_at) { insumoAt = ins.updated_at; dates.push({ label: 'Insumos', at: ins.updated_at }); }
    } catch { /* migração 050 pendente */ }

    const oldest = dates.length ? dates.reduce((a, b) => (new Date(a.at) < new Date(b.at) ? a : b)) : null;
    const newest = dates.length ? dates.reduce((a, b) => (new Date(a.at) > new Date(b.at) ? a : b)) : null;
    const days = newest ? Math.floor((Date.now() - new Date(newest.at)) / 86400000) : null;

    const preco = Number(product.sale_price) || 0;
    const metaMargem = Number(cfg.margin_pct) || 30;
    const precoSugerido = (1 - metaMargem / 100) > 0 ? r2(custoTotal / (1 - metaMargem / 100)) : 0;
    const lucro = preco > 0 ? r2(preco - custoTotal) : null;
    const margem = preco > 0 ? Math.round(((preco - custoTotal) / preco) * 1000) / 10 : null;

    res.json({
      product: {
        id: product.id, name: product.name,
        category: product.CATEGORIAS?.name || null,
        sale_price: preco,
      },
      breakdown: { ...breakdown, custo_total: custoTotal, variavel: variavelUnit },
      lines,
      custo_total: custoTotal,
      variavel_unit: variavelUnit,
      monthly_units: units,
      lucro_unit: lucro,
      margem_pct: margem,
      margem_meta: metaMargem,
      preco_sugerido: precoSugerido,
      abaixo_meta: margem != null && margem < metaMargem,
      atualizacao: {
        itens: dates,
        mais_recente: newest?.at || null,
        mais_antiga: oldest?.at || null,
        dias: days,
        // custo parado há mais de 30 dias merece revisão
        alerta: days != null && days > 30,
      },
    });
  } catch (err) {
    console.error('[rateio/product]', err.message);
    res.status(500).json({ error: 'Erro ao calcular o rateio do produto' });
  }
});

// POST /rateio/product/:id/recalcular
// Regrava a ficha com o rateio e os custos ATUAIS. Não inventa valores:
// só recalcula os campos derivados a partir do que está cadastrado hoje.
router.post('/product/:id/recalcular', async (req, res) => {
  try {
    const ov = await fixedOverview(req.tenantId);
    const { data: sheet } = await supabase.from('PRECIFICACOES')
      .select('*').eq('tenant_id', req.tenantId).eq('product_id', req.params.id)
      .eq('is_active', true).order('updated_at', { ascending: false })
      .limit(1).maybeSingle();

    if (!sheet) {
      return res.status(400).json({
        error: 'Este produto não tem ficha de preço. Crie a ficha na Formação de Preço para recalcular.',
        code: 'NO_SHEET',
      });
    }

    const c = computeSheet({ ...sheet, overhead_unit: ov.overhead_unit });
    const { data, error } = await supabase.from('PRECIFICACOES').update({
      overhead_unit: ov.overhead_unit,
      cost_direct: c.cost_direct,
      cost_subtotal: c.cost_subtotal,
      cost_unit: c.cost_unit,
      price_min: c.price_min,
      price_ideal: c.price_ideal,
      price_premium: c.price_premium,
      updated_at: new Date().toISOString(),
    }).eq('id', sheet.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;

    audit(req, 'update', 'rateio_recalculo', req.params.id, { cost_unit: c.cost_unit });
    res.json({ ok: true, cost_unit: c.cost_unit, overhead_unit: ov.overhead_unit, updated_at: data.updated_at });
  } catch (err) {
    console.error('[rateio/recalcular]', err.message);
    res.status(500).json({ error: 'Erro ao recalcular os custos' });
  }
});

// Comissão % de cada vendedor (RH) → mapa por nome
async function sellerPctMap(tenantId) {
  try {
    const { data } = await supabase.from('CLIENTES')
      .select('name, admission_data').eq('tenant_id', tenantId).eq('type', 'CO');
    const map = {};
    for (const e of data || []) {
      const pct = Number(e.admission_data?.commission_pct) || 0;
      if (pct > 0) map[String(e.name).trim().toLowerCase()] = pct;
    }
    return map;
  } catch { return {}; }
}

// Custo de cada item de uma venda. TUDO vem dos módulos:
// produto (ficha/cadastro) · fixo (rateio) · variável (despesas variáveis)
// · comissão (RH × vendedor do cliente) · imposto (Fiscal)
async function saleCosts(tenantId, sales, ov, ctx = {}) {
  const { variableUnit = 0, sellers = {}, defaultCommission = 0 } = ctx;
  const costs = await productCostMap(tenantId, ov.overhead_unit, ov.tax_pct_default);
  const productIds = [...new Set(sales.flatMap(s => (s.VENDA_ITENS || []).map(i => i.product_id)).filter(Boolean))];
  let priceMap = {};
  if (productIds.length) {
    const { data } = await supabase.from('PRODUTOS')
      .select('id, cost_price').eq('tenant_id', tenantId).in('id', productIds);
    priceMap = Object.fromEntries((data || []).map(p => [p.id, p.cost_price]));
  }
  return sales.map(s => {
    const receita = Number(s.total) || 0;
    let custo = 0, qty = 0;
    for (const it of (s.VENDA_ITENS || [])) {
      const q = Number(it.quantity) || 0;
      qty += q;
      custo += costs.get(it.product_id, priceMap[it.product_id]).cost_unit * q;
    }
    const seller = s.CLIENTES?.vendedor || null;
    const pct = seller ? (sellers[String(seller).trim().toLowerCase()] ?? defaultCommission) : defaultCommission;
    const comissao = receita * pct / 100;
    const variavel = variableUnit * qty;
    const impostos = receita * ov.tax_pct_default / 100;
    const lucro = receita - custo - impostos - comissao - variavel;
    return {
      id: s.id, number: s.number, date: s.created_at, status: s.status,
      customer: s.CLIENTES?.name || null,
      customer_id: s.customer_id || null,
      seller,
      seller_pct: pct,
      quantity: qty,
      receita: r2(receita), custos: r2(custo), impostos: r2(impostos),
      comissao: r2(comissao), variavel: r2(variavel),
      lucro: r2(lucro),
      margem_pct: receita > 0 ? Math.round((lucro / receita) * 1000) / 10 : 0,
    };
  });
}

// Contexto de custos que vem dos outros módulos (usado por /orders e /order)
async function orderCtx(tenantId, month) {
  const [ov, labor, commissions, marketing, extras, cfg, sellers] = await Promise.all([
    fixedOverview(tenantId), productionLabor(tenantId),
    commissionBySeller(tenantId, month), marketingSpend(tenantId, month),
    extraVariableCosts(tenantId, month), getConfig(tenantId), sellerPctMap(tenantId),
  ]);
  const units = ov.monthly_units;
  // custo variável/un SEM comissão (a comissão é aplicada por pedido)
  const variableUnit = units > 0
    ? (labor.total + marketing.total + extras.total) / units
    : 0;
  return {
    ov, sellers,
    variableUnit: Math.round(variableUnit * 10000) / 10000,
    defaultCommission: Number(cfg.variable_costs?.commission_pct) || 0,
    parts: { labor: labor.total, marketing: marketing.total, extras: extras.total, commissions: commissions.total },
  };
}

// ── Rateio por Pedido: lucro real de cada venda ───────────
// Filtros: período (month OU start/end), vendedor, cliente e produto.
router.get('/orders', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  const isDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v || '');
  try {
    const start = isDate(req.query.start) ? req.query.start : `${month}-01`;
    const end = isDate(req.query.end)
      ? new Date(new Date(req.query.end).getTime() + 86400000).toISOString().slice(0, 10) // fim inclusivo
      : new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10);

    const ctx = await orderCtx(req.tenantId, month);

    let q = supabase.from('VENDAS')
      .select('id, number, total, status, created_at, customer_id, CLIENTES(name, vendedor), VENDA_ITENS(product_id, quantity)')
      .eq('tenant_id', req.tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end)
      .order('created_at', { ascending: false })
      .limit(1000);
    if (req.query.customer_id) q = q.eq('customer_id', req.query.customer_id);
    const { data: sales, error } = await q;
    if (error) throw error;

    let list = sales || [];
    // Produto: mantém só pedidos que contêm o produto escolhido
    if (req.query.product_id) {
      list = list.filter(s => (s.VENDA_ITENS || []).some(i => i.product_id === req.query.product_id));
    }
    // Vendedor: vem do cadastro do cliente
    if (req.query.seller) {
      const want = String(req.query.seller).trim().toLowerCase();
      list = list.filter(s => String(s.CLIENTES?.vendedor || '').trim().toLowerCase() === want);
    }

    const rows = await saleCosts(req.tenantId, list, ctx.ov, ctx);
    const totals = rows.reduce((a, o) => ({
      receita: a.receita + o.receita, custos: a.custos + o.custos,
      impostos: a.impostos + o.impostos, comissao: a.comissao + o.comissao,
      variavel: a.variavel + o.variavel, lucro: a.lucro + o.lucro,
      quantity: a.quantity + o.quantity,
    }), { receita: 0, custos: 0, impostos: 0, comissao: 0, variavel: 0, lucro: 0, quantity: 0 });

    // Opções dos filtros — todas vindas dos módulos, nada digitado
    const { data: sellersRaw } = await supabase.from('CLIENTES')
      .select('vendedor').eq('tenant_id', req.tenantId).not('vendedor', 'is', null).limit(2000);
    const sellers = [...new Set((sellersRaw || []).map(c => String(c.vendedor).trim()).filter(Boolean))].sort();
    const customers = [...new Map((sales || [])
      .filter(s => s.customer_id && s.CLIENTES?.name)
      .map(s => [s.customer_id, { id: s.customer_id, name: s.CLIENTES.name }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    res.json({
      month, start, orders: rows,
      variable_unit: ctx.variableUnit,
      totals: {
        receita: r2(totals.receita), custos: r2(totals.custos),
        impostos: r2(totals.impostos), comissao: r2(totals.comissao),
        variavel: r2(totals.variavel), lucro: r2(totals.lucro),
        quantity: totals.quantity,
        margem_pct: totals.receita > 0 ? Math.round((totals.lucro / totals.receita) * 1000) / 10 : 0,
      },
      filters: { sellers, customers },
    });
  } catch (err) {
    console.error('[rateio/orders]', err.message);
    res.status(500).json({ error: 'Erro ao calcular o rateio por pedido' });
  }
});

// POST /rateio/order/:id/recalcular
// Atualiza as fichas dos produtos do pedido com o rateio ATUAL e
// devolve o pedido recalculado. Nada é digitado — só reprocessado.
router.post('/order/:id/recalcular', async (req, res) => {
  try {
    const ov = await fixedOverview(req.tenantId);
    const { data: sale } = await supabase.from('VENDAS')
      .select('id, VENDA_ITENS(product_id)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const ids = [...new Set((sale.VENDA_ITENS || []).map(i => i.product_id).filter(Boolean))];
    let atualizadas = 0;
    if (ids.length) {
      const { data: sheets } = await supabase.from('PRECIFICACOES')
        .select('*').eq('tenant_id', req.tenantId).eq('is_active', true).in('product_id', ids);
      for (const sheet of sheets || []) {
        const c = computeSheet({ ...sheet, overhead_unit: ov.overhead_unit });
        const { error } = await supabase.from('PRECIFICACOES').update({
          overhead_unit: ov.overhead_unit,
          cost_direct: c.cost_direct, cost_subtotal: c.cost_subtotal, cost_unit: c.cost_unit,
          price_min: c.price_min, price_ideal: c.price_ideal, price_premium: c.price_premium,
          updated_at: new Date().toISOString(),
        }).eq('id', sheet.id).eq('tenant_id', req.tenantId);
        if (!error) atualizadas++;
      }
    }
    audit(req, 'update', 'rateio_pedido_recalculo', req.params.id, { fichas: atualizadas });
    res.json({
      ok: true, fichas_atualizadas: atualizadas, produtos: ids.length,
      overhead_unit: ov.overhead_unit,
    });
  } catch (err) {
    console.error('[rateio/order/recalcular]', err.message);
    res.status(500).json({ error: 'Erro ao recalcular o pedido' });
  }
});

// Detalhe de um pedido (item a item)
router.get('/order/:id', async (req, res) => {
  try {
    const { data: sale, error } = await supabase.from('VENDAS')
      .select('id, number, total, subtotal, discount, freight, status, created_at, CLIENTES(name, vendedor), VENDA_ITENS(product_id, product_name, quantity, unit_price, total)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const ctx = await orderCtx(req.tenantId, String(sale.created_at || '').slice(0, 7));
    const ov = ctx.ov;

    const costs = await productCostMap(req.tenantId, ov.overhead_unit, ov.tax_pct_default);
    const productIds = [...new Set((sale.VENDA_ITENS || []).map(i => i.product_id).filter(Boolean))];
    let priceMap = {};
    if (productIds.length) {
      const { data } = await supabase.from('PRODUTOS')
        .select('id, cost_price').eq('tenant_id', req.tenantId).in('id', productIds);
      priceMap = Object.fromEntries((data || []).map(p => [p.id, p.cost_price]));
    }

    const items = (sale.VENDA_ITENS || []).map(it => {
      const q = Number(it.quantity) || 0;
      const c = costs.get(it.product_id, priceMap[it.product_id]);
      const receita = Number(it.total) || 0;
      const custo = c.cost_unit * q;
      return {
        product_name: it.product_name, quantity: q,
        unit_price: Number(it.unit_price) || 0,
        receita: r2(receita),
        custo_unit: c.cost_unit, custo: r2(custo),
        lucro: r2(receita - custo),
        cost_source: c.source,
      };
    });

    const receita = Number(sale.total) || 0;
    const custos = items.reduce((s, i) => s + i.custo, 0);
    const qtdTotal = items.reduce((s, i) => s + i.quantity, 0);
    const impostos = receita * ov.tax_pct_default / 100;

    // Comissão do vendedor do cliente + variáveis rateados por unidade
    const seller = sale.CLIENTES?.vendedor || null;
    const pct = seller ? (ctx.sellers[String(seller).trim().toLowerCase()] ?? ctx.defaultCommission) : ctx.defaultCommission;
    const comissao = receita * pct / 100;
    const variavel = ctx.variableUnit * qtdTotal;
    const lucro = receita - custos - impostos - comissao - variavel;

    // ORIGEM de cada custo — tudo puxado de módulo, nada digitado aqui
    const origens = [
      { key: 'produtos', label: 'Custo dos produtos', value: r2(custos),
        origin: 'Formação de Preço / Cadastro', link: '/pricing/formacao',
        formula: 'custo unitário da ficha (ou cadastro + rateio) × quantidade' },
      { key: 'variavel', label: 'Custos variáveis rateados', value: r2(variavel),
        origin: 'Despesas Variáveis', link: '/rateio/despesas-variaveis',
        formula: `${fmt4(ctx.variableUnit)}/un × ${qtdTotal} un (mão de obra + marketing + extras ÷ produção)` },
      { key: 'comissao', label: 'Comissão do vendedor', value: r2(comissao),
        origin: seller ? `RH — ${seller}` : 'Despesas Variáveis (taxa padrão)', link: '/employees',
        formula: `${String(pct).replace('.', ',')}% sobre a receita${seller ? ` · vendedor do cliente` : ' · sem vendedor definido'}` },
      { key: 'impostos', label: 'Impostos', value: r2(impostos),
        origin: ov.tax_source === 'fiscal' ? 'Fiscal' : 'Precificação', link: '/fiscal',
        formula: `${String(ov.tax_pct_default).replace('.', ',')}% sobre a receita` },
    ];

    res.json({
      order: {
        id: sale.id, number: sale.number, date: sale.created_at, status: sale.status,
        customer: sale.CLIENTES?.name || null,
        seller, seller_pct: pct,
        quantity: qtdTotal,
      },
      items,
      origens,
      receita: r2(receita), custos: r2(custos), impostos: r2(impostos),
      comissao: r2(comissao), variavel: r2(variavel),
      variable_unit: ctx.variableUnit,
      lucro: r2(lucro),
      margem_pct: receita > 0 ? Math.round((lucro / receita) * 1000) / 10 : 0,
    });
  } catch (err) {
    console.error('[rateio/order]', err.message);
    res.status(500).json({ error: 'Erro ao calcular o lucro do pedido' });
  }
});

// ── Simulador de Metas + Dashboard do Rateio ──────────────
router.get('/goals', async (req, res) => {
  try {
    const month = new Date().toISOString().slice(0, 7);
    const [ov, cfg] = await Promise.all([fixedOverview(req.tenantId), getConfig(req.tenantId)]);

    // Margem média por unidade (fichas salvas: preço usado − custo)
    let avgMargin = 0, sheetCount = 0;
    try {
      const { data: sheets } = await supabase.from('PRECIFICACOES')
        .select('cost_unit, price_ideal, PRODUTOS(sale_price)')
        .eq('tenant_id', req.tenantId).eq('is_active', true).limit(1000);
      const margins = (sheets || []).map(s => {
        const price = Number(s.PRODUTOS?.sale_price) > 0 ? Number(s.PRODUTOS.sale_price) : Number(s.price_ideal) || 0;
        return price - (Number(s.cost_unit) || 0);
      }).filter(m => m !== 0);
      sheetCount = margins.length;
      avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    } catch { /* migração 042 pendente */ }

    // Lucro do mês atual (mesmo cálculo do Rateio por Pedido)
    const start = `${month}-01`;
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10);
    const { data: sales } = await supabase.from('VENDAS')
      .select('id, number, total, status, created_at, CLIENTES(name), VENDA_ITENS(product_id, quantity)')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(500);
    const rows = await saleCosts(req.tenantId, sales || [], ov);
    const lucroMes = rows.reduce((s, o) => s + o.lucro, 0);
    const receitaMes = rows.reduce((s, o) => s + o.receita, 0);
    const unidadesMes = rows.reduce((s, o) => s + o.quantity, 0);

    res.json({
      month,
      fixed_total: r2(ov.total),
      monthly_units: ov.monthly_units,
      overhead_unit: ov.overhead_unit,
      avg_margin_unit: r2(cfg.avg_margin_unit != null ? cfg.avg_margin_unit : avgMargin),
      avg_margin_source: cfg.avg_margin_unit != null ? 'manual' : 'auto',
      sheet_count: sheetCount,
      profit_goal: cfg.profit_goal != null ? Number(cfg.profit_goal) : null,
      month_profit: r2(lucroMes),
      month_revenue: r2(receitaMes),
      month_units: unidadesMes,
      month_orders: rows.length,
    });
  } catch (err) {
    console.error('[rateio/goals]', err.message);
    res.status(500).json({ error: 'Erro ao carregar as metas' });
  }
});

router.put('/goals', async (req, res) => {
  try {
    const patch = {};
    if (req.body.profit_goal !== undefined) {
      patch.profit_goal = req.body.profit_goal === null || req.body.profit_goal === ''
        ? null : Math.max(0, Number(req.body.profit_goal) || 0);
    }
    if (req.body.avg_margin_unit !== undefined) {
      patch.avg_margin_unit = req.body.avg_margin_unit === null || req.body.avg_margin_unit === ''
        ? null : Math.max(0, Number(req.body.avg_margin_unit) || 0);
    }
    await saveConfig(req.tenantId, patch);
    audit(req, 'update', 'rateio_goals', req.tenantId, patch);
    res.json({ ok: true });
  } catch (err) {
    console.error('[rateio/goals]', err.message);
    res.status(500).json({ error: 'Erro ao salvar a meta' });
  }
});

// ── Comparativo das despesas fixas ────────────────────────
// Mês atual x mês anterior x média de 12 meses. O histórico vem das
// contas realmente geradas (LANCAMENTOS de despesa fixa); o mês
// corrente usa o total ao vivo, já que as contas podem não ter sido
// geradas ainda.
router.get('/comparativo', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  try {
    const [y, m] = month.split('-').map(Number);
    const shift = n => {
      const d = new Date(y, m - 1 + n, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    };
    const from = `${shift(-12)}-01`;

    const { data: rows, error } = await supabase.from('LANCAMENTOS')
      .select('amount, competence_month')
      .eq('tenant_id', req.tenantId)
      .not('fixed_expense_id', 'is', null)
      .neq('status', 'cancelled')
      .gte('competence_month', from)
      .limit(5000);
    if (error) throw error;

    const byMonth = {};
    for (const l of rows || []) {
      const k = String(l.competence_month || '').slice(0, 7);
      if (!k) continue;
      byMonth[k] = (byMonth[k] || 0) + (Number(l.amount) || 0);
    }

    const ov = await fixedOverview(req.tenantId);
    const isCurrent = month === new Date().toISOString().slice(0, 7);
    const atual = isCurrent ? ov.total : (byMonth[month] || 0);
    const anterior = byMonth[shift(-1)] || 0;

    // Média dos 12 meses anteriores que têm lançamento
    const past = [];
    for (let i = 1; i <= 12; i++) {
      const v = byMonth[shift(-i)];
      if (v > 0) past.push(v);
    }
    const media12 = past.length ? past.reduce((a, b) => a + b, 0) / past.length : 0;

    res.json({
      month,
      atual: r2(atual),
      anterior: r2(anterior),
      media_12m: r2(media12),
      meses_com_dados: past.length,
      variacao_pct: anterior > 0 ? Math.round(((atual - anterior) / anterior) * 1000) / 10 : null,
      variacao_valor: r2(atual - anterior),
      vs_media_pct: media12 > 0 ? Math.round(((atual - media12) / media12) * 1000) / 10 : null,
      historico: Object.entries(byMonth).sort((a, b) => a[0].localeCompare(b[0]))
        .map(([mes, total]) => ({ mes, total: r2(total) })),
    });
  } catch (err) {
    console.error('[rateio/comparativo]', err.message);
    res.status(500).json({ error: 'Erro ao montar o comparativo' });
  }
});

// ── Painel de Rentabilidade ───────────────────────────────
// Fecha o ciclo: faturamento, custo fixo, custo variável, margem por
// produto e lucro projetado. Separa fixo (despesas + salário fixo) de
// variável (produto + impostos + comissões + mão de obra da produção).
// O preço NÃO muda sozinho: se a margem cai abaixo da meta, sugere reajuste.
router.get('/rentabilidade', async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
  try {
    const start = `${month}-01`;
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10);
    const ov = await fixedOverview(req.tenantId);
    const [commissions, labor, cfg, marketing, extras] = await Promise.all([
      commissionBySeller(req.tenantId, month),
      productionLabor(req.tenantId),
      getConfig(req.tenantId),
      marketingSpend(req.tenantId, month),
      extraVariableCosts(req.tenantId, month),
    ]);
    const marginGoalPct = Number(cfg.margin_pct) || 30; // meta de margem

    const { data: sales } = await supabase.from('VENDAS')
      .select('id, total, status, created_at, VENDA_ITENS(product_id, product_name, quantity, total)')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(2000);

    // Custo VARIÁVEL do produto (sem overhead — o fixo entra como custo de período)
    const varCosts = await productCostMap(req.tenantId, 0, 0);
    const productIds = [...new Set((sales || []).flatMap(s => (s.VENDA_ITENS || []).map(i => i.product_id)).filter(Boolean))];
    let priceMap = {};
    if (productIds.length) {
      const { data } = await supabase.from('PRODUTOS').select('id, cost_price').eq('tenant_id', req.tenantId).in('id', productIds);
      priceMap = Object.fromEntries((data || []).map(p => [p.id, p.cost_price]));
    }

    const taxPct = Number(ov.tax_pct_default) || 0;
    let receita = 0, custoProduto = 0, qtdVendida = 0;
    const perProduct = new Map();
    for (const s of sales || []) {
      receita += Number(s.total) || 0;
      for (const it of (s.VENDA_ITENS || [])) {
        const q = Number(it.quantity) || 0;
        const rec = Number(it.total) || 0;
        const cUnit = varCosts.get(it.product_id, priceMap[it.product_id]).cost_unit;
        const cost = cUnit * q;
        custoProduto += cost; qtdVendida += q;
        const key = it.product_id || it.product_name || '—';
        const agg = perProduct.get(key) || { name: it.product_name || '—', receita: 0, custo: 0, qty: 0 };
        agg.receita += rec; agg.custo += cost; agg.qty += q;
        perProduct.set(key, agg);
      }
    }

    const impostos = receita * taxPct / 100;
    const custoFixo = ov.total;               // despesas fixas + folha administrativa
    const maoObraProd = labor.total;          // mão de obra direta (produção)
    const comissoes = commissions.total;
    const mktVariavel = marketing.total;      // anúncios (Financeiro)
    const extrasVar = extras.total;           // perdas + frete de venda + outros
    const custoVariavel = custoProduto + impostos + comissoes + maoObraProd + mktVariavel + extrasVar;
    const lucroProjetado = receita - custoVariavel - custoFixo;

    // Margem por produto (variável) + sugestão de reajuste quando abaixo da meta
    const produtos = [...perProduct.values()].map(p => {
      const margem = p.receita > 0 ? ((p.receita - p.custo) / p.receita) * 100 : 0;
      const abaixoMeta = margem < marginGoalPct;
      // Preço sugerido p/ atingir a meta (não altera nada — só sugere)
      const precoAtualUnit = p.qty > 0 ? p.receita / p.qty : 0;
      const custoUnit = p.qty > 0 ? p.custo / p.qty : 0;
      const precoSugeridoUnit = (1 - marginGoalPct / 100) > 0 ? custoUnit / (1 - marginGoalPct / 100) : 0;
      return {
        name: p.name, receita: r2(p.receita), custo: r2(p.custo), qty: p.qty,
        margem_pct: Math.round(margem * 10) / 10,
        abaixo_meta: abaixoMeta,
        preco_atual_unit: r2(precoAtualUnit),
        preco_sugerido_unit: abaixoMeta ? r2(precoSugeridoUnit) : null,
        reajuste_pct: abaixoMeta && precoAtualUnit > 0 ? Math.round(((precoSugeridoUnit / precoAtualUnit) - 1) * 1000) / 10 : null,
      };
    }).sort((a, b) => b.receita - a.receita);

    res.json({
      month,
      faturamento: r2(receita),
      quantidade: qtdVendida,
      custo_fixo: r2(custoFixo),
      custo_variavel: r2(custoVariavel),
      variavel_breakdown: {
        produtos: r2(custoProduto), impostos: r2(impostos),
        comissoes: r2(comissoes), mao_obra_producao: r2(maoObraProd),
        marketing: r2(mktVariavel), extras: r2(extrasVar),
      },
      lucro_projetado: r2(lucroProjetado),
      margem_pct: receita > 0 ? Math.round((lucroProjetado / receita) * 1000) / 10 : 0,
      margin_goal_pct: marginGoalPct,
      commissions: commissions.items,
      produtos,
    });
  } catch (err) {
    console.error('[rateio/rentabilidade]', err.message);
    res.status(500).json({ error: 'Erro ao calcular a rentabilidade' });
  }
});

module.exports = router;
