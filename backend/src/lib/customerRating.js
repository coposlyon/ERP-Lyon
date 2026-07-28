const supabase = require('../config/supabase');

// Estrelas automáticas pela soma comprada nos últimos 12 meses.
// Cada estrela vale R$1.000: >=5.000=5★ | >=4.000=4★ | >=3.000=3★ |
// >=2.000=2★ | >=1.000=1★ | abaixo de 1.000 mantém o manual.
function starsFromTotal(total) {
  const t = Number(total) || 0;
  if (t >= 5000) return 5;
  if (t >= 4000) return 4;
  if (t >= 3000) return 3;
  if (t >= 2000) return 2;
  if (t >= 1000) return 1;
  return null;
}

function within12m(v) {
  const ref = v.operation_date ? new Date(v.operation_date) : new Date(v.created_at);
  return ref.getTime() >= Date.now() - 365 * 24 * 3600 * 1000;
}

// Recalcula o total de 12 meses (e as estrelas) de UM cliente.
async function recomputeRating(tenantId, customerId) {
  if (!customerId) return null;
  const { data } = await supabase
    .from('VENDAS')
    .select('total, status, created_at, operation_date')
    .eq('tenant_id', tenantId)
    .eq('customer_id', customerId);

  const total = (data || [])
    .filter(v => v.status !== 'cancelled' && v.status !== 'cancelada' && within12m(v))
    .reduce((s, v) => s + (Number(v.total) || 0), 0);

  const stars = starsFromTotal(total);
  const patch = { total_12m: total };
  if (stars) patch.rating = stars;          // só sobe estrela automática para quem atinge faixa
  await supabase.from('CLIENTES').update(patch).eq('id', customerId).eq('tenant_id', tenantId);
  return { total_12m: total, rating: stars };
}

// Recalcula TODOS os clientes do tenant (botão "Recalcular estrelas").
async function recomputeAll(tenantId) {
  const since = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  // pega as vendas não canceladas dos últimos 12 meses e soma por cliente
  const { data: sales } = await supabase
    .from('VENDAS')
    .select('customer_id, total, status, created_at, operation_date')
    .eq('tenant_id', tenantId)
    .gte('created_at', since);

  const totals = new Map();
  for (const v of (sales || [])) {
    if (!v.customer_id) continue;
    if (v.status === 'cancelled' || v.status === 'cancelada') continue;
    if (!within12m(v)) continue;
    totals.set(v.customer_id, (totals.get(v.customer_id) || 0) + (Number(v.total) || 0));
  }

  let updated = 0;
  for (const [customer_id, total] of totals) {
    const stars = starsFromTotal(total);
    const patch = { total_12m: total };
    if (stars) patch.rating = stars;
    await supabase.from('CLIENTES').update(patch).eq('id', customer_id).eq('tenant_id', tenantId);
    updated++;
  }

  // Zera o total 12m de quem ficou sem vendas válidas (ex.: venda de teste excluída)
  const { data: stale } = await supabase
    .from('CLIENTES')
    .select('id')
    .eq('tenant_id', tenantId)
    .gt('total_12m', 0);
  for (const c of (stale || [])) {
    if (totals.has(c.id)) continue;
    await supabase.from('CLIENTES').update({ total_12m: 0 }).eq('id', c.id).eq('tenant_id', tenantId);
    updated++;
  }
  return { customers: updated };
}

module.exports = { recomputeRating, recomputeAll, starsFromTotal };
