const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// Precificação: calcula o custo REAL de cada produto (custo direto +
// rateio das despesas fixas + percentuais de venda) e sugere o preço
// que entrega a margem desejada.
//
// Fórmula (markup divisor):
//   preço = custo_total / (1 - (impostos% + cartão% + comissão% + frete% + margem%) / 100)

const DEFAULTS = {
  margin_pct: 30,      // margem de lucro desejada
  tax_pct: 0,          // impostos sobre a venda (Simples etc.)
  card_fee_pct: 0,     // taxa média de cartão/gateway
  commission_pct: 0,   // comissão de vendedor
  freight_pct: 0,      // frete embutido no preço
  monthly_units: null, // unidades vendidas/mês p/ rateio (null = automático)
};

async function getConfig(tenantId) {
  const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
  return { ...DEFAULTS, ...(data?.settings?.pricing || {}) };
}

// Total mensal das despesas fixas ativas (0 se a migração 040 não rodou)
async function fixedMonthlyTotal(tenantId) {
  try {
    const { data, error } = await supabase.from('DESPESAS_FIXAS')
      .select('amount').eq('tenant_id', tenantId).eq('is_active', true);
    if (error) throw error;
    return (data || []).reduce((s, f) => s + (Number(f.amount) || 0), 0);
  } catch { return 0; }
}

// Média de unidades vendidas/mês (últimos 90 dias) — usada como sugestão
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

function computePrice(product, cfg, overheadUnit) {
  const custoDireto = Number(product.cost_price) || 0;
  const custoTotal  = custoDireto + overheadUnit;
  const pctVenda    = (Number(cfg.tax_pct) || 0) + (Number(cfg.card_fee_pct) || 0)
                    + (Number(cfg.commission_pct) || 0) + (Number(cfg.freight_pct) || 0);
  const divisor     = 1 - (pctVenda + (Number(cfg.margin_pct) || 0)) / 100;
  const sugerido    = divisor > 0 ? custoTotal / divisor : null;

  const preco = Number(product.sale_price) || 0;
  // margem atual = o que sobra do preço depois de custo total e % sobre venda
  const margemAtual = preco > 0
    ? ((preco - custoTotal - preco * pctVenda / 100) / preco) * 100
    : null;

  let status = 'ok';
  if (preco <= 0 || custoDireto <= 0) status = 'sem_dados';
  else if (preco < custoTotal) status = 'prejuizo';
  else if (margemAtual != null && margemAtual < (Number(cfg.margin_pct) || 0)) status = 'abaixo';

  return {
    custo_direto: custoDireto,
    custo_fixo_unit: overheadUnit,
    custo_total: custoTotal,
    margem_atual: margemAtual != null ? Math.round(margemAtual * 10) / 10 : null,
    preco_sugerido: sugerido != null ? Math.round(sugerido * 100) / 100 : null,
    status,
  };
}

// ── Configuração ──────────────────────────────────────────
router.get('/config', async (req, res) => {
  try {
    const cfg = await getConfig(req.tenantId);
    const [fixas, autoUnits] = await Promise.all([
      fixedMonthlyTotal(req.tenantId),
      autoMonthlyUnits(req.tenantId),
    ]);
    res.json({ ...cfg, fixed_monthly_total: fixas, auto_monthly_units: autoUnits });
  } catch (err) {
    console.error('[pricing/config]', err.message);
    res.status(500).json({ error: 'Erro ao carregar configuração de precificação' });
  }
});

router.put('/config', async (req, res) => {
  try {
    const clean = {};
    for (const k of ['margin_pct', 'tax_pct', 'card_fee_pct', 'commission_pct', 'freight_pct']) {
      if (req.body[k] !== undefined) {
        const v = Number(req.body[k]);
        if (!Number.isFinite(v) || v < 0 || v > 95) return res.status(400).json({ error: `Percentual inválido em ${k}` });
        clean[k] = v;
      }
    }
    if (req.body.monthly_units !== undefined) {
      const u = req.body.monthly_units === null || req.body.monthly_units === ''
        ? null : Math.max(0, parseInt(req.body.monthly_units) || 0);
      clean.monthly_units = u;
    }
    // soma dos percentuais precisa deixar espaço no divisor
    const cur = await getConfig(req.tenantId);
    const merged = { ...cur, ...clean };
    const soma = ['margin_pct', 'tax_pct', 'card_fee_pct', 'commission_pct', 'freight_pct']
      .reduce((s, k) => s + (Number(merged[k]) || 0), 0);
    if (soma >= 100) return res.status(400).json({ error: 'A soma de margem + percentuais precisa ser menor que 100%' });

    const { data: emp } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const settings = { ...(emp?.settings || {}), pricing: merged };
    const { error } = await supabase.from('EMPRESAS').update({ settings }).eq('id', req.tenantId);
    if (error) throw error;
    audit(req, 'update', 'pricing_config', req.tenantId, clean);
    res.json(merged);
  } catch (err) {
    console.error('[pricing/config]', err.message);
    res.status(500).json({ error: 'Erro ao salvar configuração' });
  }
});

// ── Visão geral: todos os produtos com custo real e preço sugerido ──
router.get('/overview', async (req, res) => {
  const { search, status } = req.query;
  try {
    const cfg = await getConfig(req.tenantId);
    const [fixasTotal, autoUnits] = await Promise.all([
      fixedMonthlyTotal(req.tenantId),
      autoMonthlyUnits(req.tenantId),
    ]);
    const units = cfg.monthly_units != null && cfg.monthly_units > 0 ? cfg.monthly_units : autoUnits;
    const overheadUnit = units > 0 ? fixasTotal / units : 0;

    let q = supabase.from('PRODUTOS')
      .select('id, name, code, unit, cost_price, sale_price, price_tiers, current_stock, CATEGORIAS(name)')
      .eq('tenant_id', req.tenantId).eq('is_active', true)
      .order('name').limit(1000);
    if (search) {
      const s = String(search).replace(/[%,()]/g, ' ').trim();
      if (s) q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
    }
    const { data: products, error } = await q;
    if (error) throw error;

    let rows = (products || []).map(p => ({
      id: p.id, name: p.name, code: p.code, unit: p.unit,
      category: p.CATEGORIAS?.name || null,
      current_stock: p.current_stock,
      sale_price: Number(p.sale_price) || 0,
      has_tiers: Array.isArray(p.price_tiers) && p.price_tiers.length > 0,
      ...computePrice(p, cfg, overheadUnit),
    }));
    if (status) rows = rows.filter(r => r.status === status);

    const resumo = {
      total: rows.length,
      prejuizo: rows.filter(r => r.status === 'prejuizo').length,
      abaixo: rows.filter(r => r.status === 'abaixo').length,
      ok: rows.filter(r => r.status === 'ok').length,
      sem_dados: rows.filter(r => r.status === 'sem_dados').length,
    };

    res.json({
      config: cfg,
      fixed_monthly_total: fixasTotal,
      monthly_units: units,
      auto_monthly_units: autoUnits,
      overhead_unit: Math.round(overheadUnit * 100) / 100,
      summary: resumo,
      products: rows,
    });
  } catch (err) {
    console.error('[pricing/overview]', err.message);
    res.status(500).json({ error: 'Erro ao calcular a precificação' });
  }
});

// ── Aplicar preço sugerido (ou manual) ao produto ─────────
router.put('/products/:id', async (req, res) => {
  const price = Number(req.body.sale_price);
  if (!(price > 0)) return res.status(400).json({ error: 'Preço inválido' });
  try {
    const { data: cur } = await supabase.from('PRODUTOS').select('id, name, sale_price')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cur) return res.status(404).json({ error: 'Produto não encontrado' });

    const { data, error } = await supabase.from('PRODUTOS')
      .update({ sale_price: price })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, name, sale_price').single();
    if (error) throw error;
    audit(req, 'price', 'product', data.id, { name: cur.name, de: cur.sale_price, para: price });
    res.json(data);
  } catch (err) {
    console.error('[pricing/apply]', err.message);
    res.status(500).json({ error: 'Erro ao aplicar preço' });
  }
});

module.exports = router;
