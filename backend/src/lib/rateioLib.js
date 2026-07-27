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
  // Taxas por operadora de cartão e faixa de parcelas (%)
  card_operators: [],   // [{ name, debito, credito, inst_2_6, inst_7_12, antecipacao }]
  // Canais de marketplace extras além dos padrão: [{ name, pct }]
  marketplace_channels: [],
};

async function getConfig(tenantId) {
  const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
  return { ...DEFAULTS, ...(data?.settings?.pricing || {}) };
}

// Alíquota de venda — o FISCAL é a fonte da verdade. Só cai no valor
// da precificação se o fiscal ainda não tiver alíquota definida.
async function taxRate(tenantId, cfg) {
  try {
    const { data, error } = await supabase.from('CONFIG_FISCAL')
      .select('aliquota_venda, regime_tributario').eq('tenant_id', tenantId).maybeSingle();
    if (error) throw error;
    const a = Number(data?.aliquota_venda);
    if (Number.isFinite(a) && a > 0) {
      return { pct: a, source: 'fiscal', regime: data?.regime_tributario || 'simples' };
    }
  } catch { /* coluna/tabela ausente → usa a precificação */ }
  return { pct: Number(cfg?.tax_pct) || 0, source: 'precificacao', regime: cfg?.tax_regime || 'simples' };
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

const round2 = v => Math.round((Number(v) || 0) * 100) / 100;
const monthBounds = month => {
  const m = /^\d{4}-\d{2}$/.test(month || '') ? month : new Date().toISOString().slice(0, 7);
  const start = `${m}-01`;
  const end = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 1).toISOString().slice(0, 10);
  return { m, start, end };
};

// Despesas fixas (ativas E inativas — o filtro de status é da tela;
// os cálculos do rateio usam só as ativas)
async function fixedExpenses(tenantId) {
  const sel = cols => supabase.from('DESPESAS_FIXAS').select(cols)
    .eq('tenant_id', tenantId)
    .order('amount', { ascending: false });
  try {
    // colunas das migrações 048/049/051 podem não existir ainda → fallbacks
    let { data, error } = await sel('id, name, amount, notes, due_day, is_active, employee_id, category, cost_center, periodicity, original_amount, due_month, origin');
    if (error) ({ data, error } = await sel('id, name, amount, notes, due_day, is_active, employee_id, category, cost_center, periodicity, original_amount, due_month'));
    if (error) ({ data, error } = await sel('id, name, amount, notes, due_day, is_active, employee_id'));
    if (error) ({ data, error } = await sel('id, name, amount, notes, due_day, is_active'));
    if (error) throw error;
    return data || [];
  } catch { return []; } // migração 040 pendente
}

// Unidades efetivamente PRODUZIDAS no mês (módulo de Produção):
// pedidos em fabricação ou já entregues, somando os itens.
async function producedUnits(tenantId, month) {
  const { start, end } = monthBounds(month);
  try {
    const { data, error } = await supabase.from('VENDAS')
      .select('created_at, status, VENDA_ITENS(quantity)')
      .eq('tenant_id', tenantId)
      .in('status', [
        'aguardando_estoque', 'aguardando_arte', 'aguardando_vegetal',
        'aguardando_revelacao', 'aguardando_coleta', 'em_transito', 'entregue',
        'confirmed', 'in_production', 'ready', 'delivered',
      ])
      .gte('created_at', start).lt('created_at', end)
      .limit(2000);
    if (error) throw error;
    return (data || []).reduce((s, v) =>
      s + (v.VENDA_ITENS || []).reduce((n, i) => n + (Number(i.quantity) || 0), 0), 0);
  } catch { return 0; }
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

// Comissão por vendedor: vendas ENTREGUES do mês, atribuídas ao vendedor
// do CLIENTE (CLIENTES.vendedor, texto), × comissão % do colaborador (RH).
// Comissão é custo VARIÁVEL (lançada separada do salário fixo).
async function commissionBySeller(tenantId, month) {
  const { m, start, end } = monthBounds(month);
  try {
    const { data: emps, error: e1 } = await supabase.from('CLIENTES')
      .select('id, name, admission_data')
      .eq('tenant_id', tenantId).eq('type', 'CO');
    if (e1) throw e1;
    const sellers = (emps || []).map(e => ({
      id: e.id, name: e.name,
      pct: Number(e.admission_data?.commission_pct) || 0,
      goal: parseSalary(e.admission_data?.sales_goal),
    })).filter(s => s.pct > 0);
    if (!sellers.length) return { month: m, items: [], total: 0 };

    const { data: sales, error: e2 } = await supabase.from('VENDAS')
      .select('total, CLIENTES(vendedor)')
      .eq('tenant_id', tenantId)
      .in('status', ['entregue', 'delivered'])
      .gte('created_at', start).lt('created_at', end)
      .limit(5000);
    if (e2) throw e2;

    // Soma o faturamento entregue por vendedor (match por nome, case-insensitive)
    const salesByName = {};
    for (const s of sales || []) {
      const v = String(s.CLIENTES?.vendedor || '').trim().toLowerCase();
      if (!v) continue;
      salesByName[v] = (salesByName[v] || 0) + (Number(s.total) || 0);
    }
    const items = sellers.map(s => {
      const vendas = salesByName[s.name.trim().toLowerCase()] || 0;
      return {
        id: s.id, name: s.name, pct: s.pct,
        sales: round2(vendas),
        commission: round2(vendas * s.pct / 100),
        goal: s.goal || 0,
        goal_pct: s.goal > 0 ? Math.round((vendas / s.goal) * 1000) / 10 : null,
      };
    }).filter(s => s.sales > 0 || s.commission > 0);
    return { month: m, items, total: round2(items.reduce((a, b) => a + b.commission, 0)) };
  } catch { return { month: m, items: [], total: 0 }; }
}

// Palavras que identificam gasto com anúncio/tráfego pago
const MKT_RX = /marketing|publicidad|an[úu]ncio|ads|tr[áa]fego|meta|google|instagram|facebook|impulsion/i;
// Lançamentos que JÁ são contabilizados em outro bloco — não podem
// entrar em "outros" para não contar duas vezes
const DUP_RX = /comiss[ãa]o|sal[áa]rio|folha|imposto|tributo|das\b|simples|frete/i;

// Marketing VARIÁVEL: gasto real de anúncio lançado no Financeiro.
// (o marketing fixo continua nas Despesas Fixas — aqui é só o variável)
async function marketingSpend(tenantId, month) {
  const { m, start, end } = monthBounds(month);
  const run = sel => supabase.from('LANCAMENTOS').select(sel)
    .eq('tenant_id', tenantId).eq('type', 'payable')
    .neq('status', 'cancelled')
    .is('fixed_expense_id', null)          // despesa fixa não entra aqui
    .gte('due_date', start).lt('due_date', end)
    .limit(1000);
  try {
    // com plano de contas (ideal) → sem plano de contas (fallback)
    let { data, error } = await run('id, description, amount, paid_amount, status, due_date, PLANO_CONTAS(name)');
    if (error) ({ data, error } = await run('id, description, amount, paid_amount, status, due_date'));
    if (error) throw error;

    const items = (data || [])
      .filter(l => MKT_RX.test(`${l.PLANO_CONTAS?.name || ''} ${l.description || ''}`))
      .map(l => ({
        id: l.id,
        description: l.description || 'Anúncio',
        account: l.PLANO_CONTAS?.name || null,
        amount: Number(l.amount) || 0,
        paid: Number(l.paid_amount) || 0,
        date: l.due_date,
      }));
    return { month: m, items, total: round2(items.reduce((s, i) => s + i.amount, 0)) };
  } catch { return { month: m, items: [], total: 0 }; }
}

// Custos variáveis extras, todos automáticos:
//   perdas de produção · frete pago nas vendas · demais lançamentos variáveis
async function extraVariableCosts(tenantId, month) {
  const { m, start, end } = monthBounds(month);
  const out = { month: m, perdas: 0, frete_venda: 0, outros: 0, items: [], total: 0 };

  // 1) Perdas de produção (qtd perdida × custo do produto)
  try {
    const { data: perdas } = await supabase.from('PRODUCAO_PERDAS')
      .select('quantity, product_id, product_name, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', start).lt('created_at', end).limit(2000);
    const ids = [...new Set((perdas || []).map(p => p.product_id).filter(Boolean))];
    let costs = {};
    if (ids.length) {
      const { data: prods } = await supabase.from('PRODUTOS')
        .select('id, cost_price').eq('tenant_id', tenantId).in('id', ids);
      costs = Object.fromEntries((prods || []).map(p => [p.id, Number(p.cost_price) || 0]));
    }
    const qty = (perdas || []).reduce((s, p) => s + (Number(p.quantity) || 0), 0);
    out.perdas = round2((perdas || []).reduce((s, p) =>
      s + (Number(p.quantity) || 0) * (costs[p.product_id] || 0), 0));
    if (out.perdas > 0 || qty > 0) {
      out.items.push({ label: 'Perdas de produção', value: out.perdas, hint: `${qty} un perdidas`, source: 'Produção' });
    }
  } catch { /* módulo de perdas ausente */ }

  // 2) Frete pago nas vendas do mês
  try {
    const { data: vendas } = await supabase.from('VENDAS')
      .select('freight').eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(2000);
    out.frete_venda = round2((vendas || []).reduce((s, v) => s + (Number(v.freight) || 0), 0));
    if (out.frete_venda > 0) {
      out.items.push({ label: 'Frete das vendas', value: out.frete_venda, hint: 'frete cobrado nos pedidos', source: 'Vendas' });
    }
  } catch { /* coluna freight ausente */ }

  // 3) Demais lançamentos variáveis do Financeiro (exclui o que já é
  //    contado em outro bloco: comissão, salário, imposto, frete, marketing)
  try {
    const run = sel => supabase.from('LANCAMENTOS').select(sel)
      .eq('tenant_id', tenantId).eq('type', 'payable')
      .neq('status', 'cancelled').is('fixed_expense_id', null)
      .gte('due_date', start).lt('due_date', end).limit(1000);
    let { data, error } = await run('id, description, amount, PLANO_CONTAS(name)');
    if (error) ({ data, error } = await run('id, description, amount'));
    if (error) throw error;
    const outros = (data || []).filter(l => {
      const txt = `${l.PLANO_CONTAS?.name || ''} ${l.description || ''}`;
      return !MKT_RX.test(txt) && !DUP_RX.test(txt);
    });
    out.outros = round2(outros.reduce((s, l) => s + (Number(l.amount) || 0), 0));
    if (out.outros > 0) {
      out.items.push({ label: 'Outros lançamentos variáveis', value: out.outros, hint: `${outros.length} lançamento(s)`, source: 'Financeiro' });
    }
  } catch { /* sem lançamentos */ }

  out.total = round2(out.perdas + out.frete_venda + out.outros);
  return out;
}

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
          due_day: 5, notes: emp.name, employee_id: emp.id,
          category: 'RH', cost_center: 'RH', origin: 'rh',
        };
        let { error } = await supabase.from('DESPESAS_FIXAS').insert(row);
        if (error && /category|cost_center|origin/i.test(error.message || '')) {
          delete row.category; delete row.cost_center; delete row.origin;
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
  // Produção mensal — 3 fontes, nesta ordem de prioridade:
  //   meta      → meta definida no Simulador de Metas
  //   producao  → unidades realmente produzidas no mês (módulo Produção)
  //   vendas    → média de vendas dos últimos 90 dias (fallback)
  const [autoUnits, produced, tax] = await Promise.all([
    autoMonthlyUnits(tenantId),
    producedUnits(tenantId, null),
    taxRate(tenantId, cfg),
  ]);
  const meta = cfg.monthly_units != null && cfg.monthly_units > 0 ? Number(cfg.monthly_units) : 0;
  const units = meta || produced || autoUnits;
  const source = meta ? 'meta' : (produced ? 'producao' : 'vendas');
  const overheadUnit = units > 0 ? total / units : 0;
  return {
    items, total,
    monthly_units: units,
    monthly_units_source: source,
    production_sources: { meta, producao: produced, vendas: autoUnits },
    rateio_method: 'producao',
    tax_source: tax.source,
    auto_monthly_units: autoUnits,
    overhead_unit: Math.round(overheadUnit * 10000) / 10000,
    tax_regime: tax.regime,
    tax_pct_default: tax.pct,
    category_colors: cfg.category_colors && typeof cfg.category_colors === 'object' ? cfg.category_colors : {},
  };
}

// Snapshot do rateio no histórico (1 por período; regrava se já existir)
// Grava um snapshot do rateio COM a composição completa daquele momento.
// Mantém versões: salvar de novo no mesmo mês cria a versão seguinte,
// preservando o que foi calculado antes (auditoria).
async function snapshotRateio(tenantId, period, userName, opts = {}) {
  if (!/^\d{4}-\d{2}$/.test(period || '')) return null;
  const ov = await fixedOverview(tenantId);
  const cfg = await getConfig(tenantId);

  // Composição: só despesas ativas (as que formaram o total)
  const ativas = (ov.items || []).filter(f => f.is_active !== false);
  const somaPor = campo => {
    const m = new Map();
    for (const f of ativas) {
      const k = f[campo] || (campo === 'category' ? 'Outros' : 'Sem centro');
      m.set(k, (m.get(k) || 0) + (Number(f.amount) || 0));
    }
    return [...m.entries()].map(([name, total]) => ({ name, total: round2(total) }))
      .sort((a, b) => b.total - a.total);
  };

  const history = Array.isArray(cfg.rateio_history) ? [...cfg.rateio_history] : [];
  const doPeriodo = history.filter(h => h.period === period);
  const versao = doPeriodo.length
    ? Math.max(...doPeriodo.map(h => Number(h.version) || 1)) + 1
    : 1;

  const entry = {
    id: `${period}-v${versao}`,
    period,
    version: versao,
    production: ov.monthly_units,
    production_source: ov.monthly_units_source || null,
    total: round2(ov.total),
    per_unit: ov.overhead_unit,
    method: ov.rateio_method,
    tax_pct: ov.tax_pct_default,
    tax_source: ov.tax_source || null,
    user_name: userName || null,
    created_at: new Date().toISOString(),
    reason: opts.reason || 'manual',
    breakdown: {
      by_category: somaPor('category'),
      by_cost_center: somaPor('cost_center'),
      items: ativas.map(f => ({
        name: f.name,
        notes: f.notes || null,
        category: f.category || 'Outros',
        cost_center: f.cost_center || null,
        origin: f.origin || (f.employee_id ? 'rh' : 'manual'),
        periodicity: f.periodicity || 'mensal',
        amount: round2(f.amount),
      })).sort((a, b) => b.amount - a.amount),
    },
  };

  history.push(entry);
  // ordena por período (desc) e, dentro do período, versão (desc)
  history.sort((a, b) => b.period.localeCompare(a.period) || (Number(b.version) || 1) - (Number(a.version) || 1));
  const cortado = history.slice(0, 120);
  await saveConfig(tenantId, { rateio_history: cortado });
  return cortado;
}

// Devolve o histórico, criando o snapshot do mês corrente se ainda não
// existir ou se os números mudaram — assim a tela nunca depende de
// alguém lembrar de salvar.
async function ensureSnapshot(tenantId, userName) {
  const cfg = await getConfig(tenantId);
  const history = Array.isArray(cfg.rateio_history) ? cfg.rateio_history : [];
  const period = new Date().toISOString().slice(0, 7);
  const ov = await fixedOverview(tenantId);

  const ultima = history.filter(h => h.period === period)
    .sort((a, b) => (Number(b.version) || 1) - (Number(a.version) || 1))[0];

  const mudou = !ultima
    || round2(ultima.total) !== round2(ov.total)
    || Number(ultima.production) !== Number(ov.monthly_units);

  if (mudou) return await snapshotRateio(tenantId, period, userName, { reason: ultima ? 'auto-alteracao' : 'auto-inicial' });
  return history;
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

// ── Tabela de Precificação: preço calculado pela ficha ─────
// A ficha de Formação de Preço (PRECIFICACOES) vira a "tabela mestre".
// A FAIXA de quantidade é só a ficha avaliada naquela quantidade: o custo
// já cai com a qtd (tela/frete diluídos em computeSheet). O custo da
// impressão escolhida vem de blocks.print_costs (R$/peça por método).
//
// Estrutura esperada em ficha.blocks:
//   tiers:       [{ min_qty, max_qty }]                 — faixas exibidas
//   print_costs: { <metodo>: custo }                    — R$/peça por método
//     onde <custo> pode ser:
//       · um número          → custo fixo por peça, qualquer quantidade
//       · [{min_qty,max_qty,cost}] → custo POR FAIXA (a tela/tinta se
//         dilui em mais peças → quanto maior a qtd, menor o custo/peça).
//         É daqui que sai o desconto por volume.
//
// A personalização (serigrafia/tintas) NÃO entra pelos blocos de custo da
// ficha: entra pelo método escolhido na loja. Por isso zeramos
// personalizacao/tintas ao avaliar o custo base.

// Faixa (tier) que cobre a quantidade pedida; null se nenhuma casar.
function tierForQty(tiers, qty) {
  const q = Number(qty) || 0;
  for (const t of (tiers || [])) {
    const min = Number(t.min_qty) || 0;
    const max = (t.max_qty == null || t.max_qty === '') ? Infinity : Number(t.max_qty);
    if (q >= min && q <= max) return t;
  }
  return null;
}

// Custo de impressão de um método na quantidade pedida.
// Aceita número (fixo) ou lista de faixas [{min_qty,max_qty,cost}].
function printCostForQty(entry, qty) {
  if (entry == null) return 0;
  if (typeof entry === 'number') return entry;
  if (Array.isArray(entry)) {
    const t = tierForQty(entry, qty);
    return t ? (Number(t.cost) || 0) : 0;
  }
  return Number(entry) || 0;
}

// Preço final calculado pela ficha para (quantidade, método de impressão).
// opts.margin  → margem % explícita; senão usa opts.margin_key
// opts.margin_key → 'min' | 'ideal' (padrão) | 'premium'
function precoPorFicha(ficha, qty, method, opts = {}) {
  if (!ficha) return null;
  const q = Math.max(1, Number(qty) || 1);
  const blocks = ficha.blocks || {};

  // Custo base SEM personalização — a impressão entra pelo print_costs.
  const base = computeSheet({
    ...ficha,
    calc_quantity: q,
    blocks: { ...blocks, personalizacao: {}, tintas: [] },
  });

  const printCosts = blocks.print_costs || {};
  const printUnit = printCostForQty(printCosts[method], q);

  const subtotal = (Number(base.cost_subtotal) || 0) + printUnit;
  const taxPct   = Number(ficha.tax_pct) || 0;
  const custoUnit = subtotal * (1 + taxPct / 100);

  const marginKey = opts.margin_key || 'ideal';
  const margin = opts.margin != null
    ? Number(opts.margin)
    : Number(ficha[`margin_${marginKey}_pct`]) || 0;
  const price = (margin >= 0 && margin < 100) ? custoUnit / (1 - margin / 100) : 0;

  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  const r4 = v => Math.round((Number(v) || 0) * 10000) / 10000;
  return {
    quantity:   q,
    method:     method || null,
    tier:       tierForQty(blocks.tiers, q),
    print_unit: r4(printUnit),
    unit_cost:  r4(custoUnit),
    margin_pct: margin,
    unit_price: r2(price),
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
  fixedExpenses, fixedOverview, snapshotRateio, ensureSnapshot, syncEmployeesToFixed,
  productionLabor, isProductionSector, commissionBySeller, producedUnits,
  marketingSpend, extraVariableCosts,
  computeSheet, productCostMap,
  precoPorFicha, tierForQty,
};
