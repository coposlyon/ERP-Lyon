// Helpers compartilhados de Precificação/Rateio — uma fonte só para
// config, despesas fixas, rateio por unidade e cálculo da ficha.
const supabase = require('../config/supabase');

const DEFAULTS = {
  margin_pct: 30,      // margem de lucro desejada
  tax_pct: 0,          // impostos sobre a venda (Simples etc.)
  card_fee_pct: 0,     // taxa média de cartão/gateway
  commission_pct: 0,   // comissão de vendedor
  freight_pct: 0,      // frete embutido no preço
  monthly_units: null, // meta de produção mensal p/ rateio (null = automático)
  tax_regime: 'simples',
  rateio_method: 'producao', // 'producao' (meta informada) | 'vendas' (média 90 dias)
  profit_goal: null,         // meta de lucro mensal (Simulador de Metas)
  avg_margin_unit: null,     // margem média/un informada (null = automática)
  variable_costs: null,      // taxas variáveis (bancárias, marketplace, comissão)
  rateio_history: [],        // snapshots do rateio por período
  category_colors: {},       // cor por categoria de despesa fixa { nome: '#hex' }
  expense_cards: [],         // cards personalizados de despesas fixas (nomes)
};

// Taxas variáveis padrão (Despesas Variáveis)
const VARIABLE_DEFAULTS = {
  commission_pct: 0,        // comissão de vendedor (%)
  pix_pct: 0,               // taxa PIX (%)
  boleto_fee: 0,            // taxa por boleto (R$)
  card_debit_pct: 0,        // débito (%)
  card_credit_pct: 0,       // crédito à vista (%)
  card_installment_pct: 0,  // crédito parcelado (%)
  antecipacao_pct: 0,       // antecipação de recebíveis (%)
  payment_link_pct: 0,      // link de pagamento (%)
  marketplace: { shopee: 0, mercado_livre: 0, amazon: 0, site_proprio: 0 }, // (%)
};

async function getConfig(tenantId) {
  const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
  return { ...DEFAULTS, ...(data?.settings?.pricing || {}) };
}

// Mescla e grava settings.pricing (preserva o resto do settings)
async function saveConfig(tenantId, patch) {
  const { data: emp } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
  const merged = { ...DEFAULTS, ...(emp?.settings?.pricing || {}), ...patch };
  const settings = { ...(emp?.settings || {}), pricing: merged };
  const { error } = await supabase.from('EMPRESAS').update({ settings }).eq('id', tenantId);
  if (error) throw error;
  return merged;
}

// Média de unidades vendidas/mês (últimos 90 dias)
async function autoMonthlyUnits(tenantId) {
  try {
    const since = new Date(Date.now() - 90 * 86400000).toISOString();
    const { data, error } = await supabase
      .from('VENDA_ITENS')
      .select('quantity, VENDAS!inner(tenant_id, status, created_at)')
      .eq('VENDAS.tenant_id', tenantId)
      .neq('VENDAS.status', 'cancelled')
      .gte('VENDAS.created_at', since)
      .limit(20000);
    if (error) throw error;
    const total = (data || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    return Math.round(total / 3);
  } catch { return 0; }
}

// Despesas fixas (ativas E inativas — o filtro de status é da tela;
// os cálculos do rateio usam só as ativas)
async function fixedExpenses(tenantId) {
  const sel = cols => supabase.from('DESPESAS_FIXAS').select(cols)
    .eq('tenant_id', tenantId)
    .order('amount', { ascending: false });
  try {
    // colunas das migrações 048/049 podem não existir ainda → fallbacks
    let { data, error } = await sel('id, name, amount, notes, due_day, is_active, employee_id, category, cost_center, periodicity, original_amount, due_month');
    if (error) ({ data, error } = await sel('id, name, amount, notes, due_day, is_active, employee_id'));
    if (error) ({ data, error } = await sel('id, name, amount, notes, due_day, is_active'));
    if (error) throw error;
    return data || [];
  } catch { return []; } // migração 040 pendente
}

// Salário aceita número puro (20000) e formato BR ("20.000,00")
function parseSalary(raw) {
  return (typeof raw === 'string' && raw.includes(','))
    ? (parseFloat(raw.replace(/\./g, '').replace(',', '.')) || 0)
    : (Number(raw) || 0);
}

// Departamento de produção → salário vai para Custos Variáveis
// (Gravação/Serigrafia é a produção da Lyon)
const isProductionSector = s => /produ|grava|serigraf/i.test(String(s || ''));

// Folha da PRODUÇÃO (mão de obra direta — Custos Variáveis)
async function productionLabor(tenantId) {
  try {
    const { data: emps, error } = await supabase.from('CLIENTES')
      .select('id, name, is_active, admission_data')
      .eq('tenant_id', tenantId).eq('type', 'CO');
    if (error) throw error;
    const items = (emps || [])
      .filter(e => e.is_active !== false && isProductionSector(e.admission_data?.sector))
      .map(e => ({
        id: e.id, name: e.name,
        role: e.admission_data?.sector || null,
        salary: parseSalary(e.admission_data?.salary),
      }))
      .filter(e => e.salary > 0);
    return { items, total: items.reduce((s, e) => s + e.salary, 0) };
  } catch { return { items: [], total: 0 }; }
}

// Garante que cada colaborador (CLIENTES type CO) com salário tem sua
// despesa fixa na categoria "Colaboradores" — roda ao abrir o Rateio,
// então colaboradores antigos entram sem precisar re-salvar o cadastro.
async function syncEmployeesToFixed(tenantId) {
  try {
    const { data: emps, error: e1 } = await supabase.from('CLIENTES')
      .select('id, name, is_active, admission_data')
      .eq('tenant_id', tenantId).eq('type', 'CO');
    if (e1) throw e1;
    if (!emps?.length) return;

    const { data: existing, error: e2 } = await supabase.from('DESPESAS_FIXAS')
      .select('id, amount, notes, is_active, name, employee_id')
      .eq('tenant_id', tenantId).not('employee_id', 'is', null);
    if (e2) throw e2; // migração 048 pendente
    const byEmp = new Map((existing || []).map(d => [d.employee_id, d]));

    for (const emp of emps) {
      const salary = parseSalary(emp.admission_data?.salary);
      // Produção NÃO entra nas fixas — a folha dela vai para Custos Variáveis
      const active = emp.is_active !== false && salary > 0
        && !isProductionSector(emp.admission_data?.sector);
      const cur = byEmp.get(emp.id);
      if (cur) {
        // também migra o nome antigo "Funcionários" → "Colaboradores"
        if (Number(cur.amount) !== salary || cur.notes !== emp.name || cur.is_active !== active || cur.name !== 'Colaboradores') {
          await supabase.from('DESPESAS_FIXAS').update({
            amount: salary, notes: emp.name, is_active: active,
            name: 'Colaboradores', updated_at: new Date().toISOString(),
          }).eq('id', cur.id);
        }
      } else if (active) {
        const row = {
          tenant_id: tenantId, name: 'Colaboradores', amount: salary,
          due_day: 5, notes: emp.name, employee_id: emp.id, category: 'RH',
        };
        let { error } = await supabase.from('DESPESAS_FIXAS').insert(row);
        if (error && /category/i.test(error.message || '')) {
          delete row.category; // migração 049 pendente
          await supabase.from('DESPESAS_FIXAS').insert(row);
        }
      }
    }
  } catch (err) {
    console.warn('[rateio/syncEmployees]', err.message);
  }
}

// Total das fixas + produção mensal → rateio por unidade
async function fixedOverview(tenantId) {
  const cfg = await getConfig(tenantId);
  const items = await fixedExpenses(tenantId);
  // Só as ativas entram no total/rateio (inativas aparecem na tela via filtro)
  const total = items.filter(f => f.is_active !== false)
    .reduce((s, f) => s + (Number(f.amount) || 0), 0);
  const autoUnits = await autoMonthlyUnits(tenantId);
  const manual = cfg.monthly_units != null && cfg.monthly_units > 0;
  // Método único: rateio por produção (a média de vendas de 90 dias é só
  // o fallback automático quando a produção não foi informada)
  const units = manual ? cfg.monthly_units : autoUnits;
  const overheadUnit = units > 0 ? total / units : 0;
  return {
    items, total,
    monthly_units: units,
    monthly_units_source: manual ? 'manual' : 'auto',
    rateio_method: 'producao',
    auto_monthly_units: autoUnits,
    overhead_unit: Math.round(overheadUnit * 10000) / 10000,
    tax_regime: cfg.tax_regime || 'simples',
    tax_pct_default: Number(cfg.tax_pct) || 0,
    category_colors: cfg.category_colors && typeof cfg.category_colors === 'object' ? cfg.category_colors : {},
  };
}

// Snapshot do rateio no histórico (1 por período; regrava se já existir)
async function snapshotRateio(tenantId, period, userName) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const ov = await fixedOverview(tenantId);
  const cfg = await getConfig(tenantId);
  const entry = {
    period,
    production: ov.monthly_units,
    total: Math.round(ov.total * 100) / 100,
    per_unit: ov.overhead_unit,
    method: ov.rateio_method,
    user_name: userName || null,
    created_at: new Date().toISOString(),
  };
  const history = (Array.isArray(cfg.rateio_history) ? cfg.rateio_history : [])
    .filter(h => h.period !== period);
  history.push(entry);
  history.sort((a, b) => b.period.localeCompare(a.period));
  await saveConfig(tenantId, { rateio_history: history.slice(0, 36) });
  return history.slice(0, 36);
}

// Mesmo cálculo da tela de Formação de Preço (fonte da verdade no servidor)
function computeSheet(sheet) {
  const qty = Math.max(1, Number(sheet.calc_quantity) || 1);
  const b = sheet.blocks || {};

  const mp   = b.materia_prima || {};
  const pers = b.personalizacao || {};
  const emb  = b.embalagem || {};
  const fr   = b.frete || {};
  const tintas = Array.isArray(b.tintas) ? b.tintas : [];

  const matUnit   = Number(mp.unit_cost) || 0;
  const persUnit  = (Number(pers.screen_cost) || 0) / Math.max(1, Number(pers.screen_uses) || qty);
  const tintaUnit = tintas.reduce((s, t) => s + (Number(t.amount) || 0), 0) / qty;
  const embUnit   = (Number(emb.units_per_box) > 0) ? (Number(emb.box_price) || 0) / Number(emb.units_per_box) : 0;
  const freteUnit = (Number(fr.freight_value) || 0) / Math.max(1, Number(fr.quantity_bought) || qty);
  const overhead  = Number(sheet.overhead_unit) || 0;

  const subtotal  = matUnit + persUnit + tintaUnit + embUnit + freteUnit + overhead;
  const taxPct    = Number(sheet.tax_pct) || 0;
  const taxUnit   = subtotal * taxPct / 100;
  const custoUnit = subtotal + taxUnit;

  const price = m => { const d = 1 - (Number(m) || 0) / 100; return d > 0 ? custoUnit / d : 0; };
  const r2 = v => Math.round(v * 100) / 100;
  const r4 = v => Math.round(v * 10000) / 10000;

  return {
    mat_unit: r4(matUnit), pers_unit: r4(persUnit), tinta_unit: r4(tintaUnit),
    emb_unit: r4(embUnit), frete_unit: r4(freteUnit), overhead_unit: r4(overhead),
    cost_direct: r4(matUnit),
    cost_subtotal: r4(subtotal),
    tax_unit: r4(taxUnit),
    cost_unit: r4(custoUnit),
    price_min: r2(price(sheet.margin_min_pct ?? 20)),
    price_ideal: r2(price(sheet.margin_ideal_pct ?? 40)),
    price_premium: r2(price(sheet.margin_premium_pct ?? 50)),
  };
}

// Mapa product_id → custo unitário (ficha mais recente de cada produto);
// produtos sem ficha caem no cost_price + rateio (+ imposto padrão).
async function productCostMap(tenantId, overheadUnit, taxPctDefault) {
  const map = new Map();
  try {
    const { data } = await supabase.from('PRECIFICACOES')
      .select('product_id, cost_unit, updated_at')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .not('product_id', 'is', null)
      .order('updated_at', { ascending: false });
    for (const s of (data || [])) {
      if (!map.has(s.product_id)) map.set(s.product_id, { cost_unit: Number(s.cost_unit) || 0, source: 'ficha' });
    }
  } catch { /* migração 042 pendente */ }
  return {
    get(productId, costPrice) {
      const hit = productId ? map.get(productId) : null;
      if (hit && hit.cost_unit > 0) return hit;
      const base = (Number(costPrice) || 0) + (Number(overheadUnit) || 0);
      const cost = base * (1 + (Number(taxPctDefault) || 0) / 100);
      return { cost_unit: Math.round(cost * 10000) / 10000, source: 'cadastro' };
    },
  };
}

module.exports = {
  DEFAULTS, VARIABLE_DEFAULTS,
  getConfig, saveConfig, autoMonthlyUnits,
  fixedExpenses, fixedOverview, snapshotRateio, syncEmployeesToFixed,
  productionLabor, isProductionSector,
  computeSheet, productCostMap,
};
