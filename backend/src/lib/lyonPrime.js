const supabase = require('../config/supabase');

// ── Programa Lyon Prime ─────────────────────────────────────────────
// Estrelas pelo faturamento dos últimos 12 meses + benefícios por nível.
// Os limiares de 3/4/5 estrelas seguem a regra automática que já existia
// (customerRating.js: 1.000 / 2.000 / 5.000).
const TIERS = [
  { stars: 1, min: 200,  credit: 500,  boleto: 0,  perks: ['Cadastro Lyon Prime'] },
  { stars: 2, min: 500,  credit: 1000, boleto: 7,  perks: ['Boleto para até 7 dias'] },
  { stars: 3, min: 1000, credit: 2000, boleto: 15, perks: ['Boleto para até 15 dias', 'Atendimento prioritário'] },
  { stars: 4, min: 2000, credit: 3000, boleto: 30, perks: ['Boleto para até 30 dias', 'Atendimento prioritário', 'Prioridade na produção'] },
  { stars: 5, min: 5000, credit: 5000, boleto: 45, perks: ['Boleto para até 45 dias', 'Atendimento e produção prioritários', 'Condições comerciais exclusivas'] },
];

function tierOf(total) {
  let t = null;
  for (const tier of TIERS) if (total >= tier.min) t = tier;
  return t; // null = 0 estrelas
}
function nextTierOf(total) {
  for (const tier of TIERS) if (total < tier.min) return tier;
  return null; // já está no topo
}

function within12m(v) {
  const ref = v.operation_date ? new Date(v.operation_date) : new Date(v.created_at);
  return ref.getTime() >= Date.now() - 365 * 24 * 3600 * 1000;
}

// Grava um evento no histórico de evolução (ignora se a tabela não existe)
async function logPrime(tenantId, customerId, entry) {
  try {
    await supabase.from('LYON_PRIME_HISTORICO').insert({
      tenant_id: tenantId, customer_id: customerId, ...entry,
    });
  } catch { /* migration 045 ainda não rodou */ }
}

// Calcula o estado Lyon Prime completo de um cliente e registra no
// histórico as mudanças de estrelas/selo desde o último cálculo.
async function computePrime(tenantId, customerId) {
  const { data: cli } = await supabase.from('CLIENTES').select('*')
    .eq('id', customerId).eq('tenant_id', tenantId).maybeSingle();
  if (!cli) return null;

  const [{ data: sales }, { data: recv }] = await Promise.all([
    supabase.from('VENDAS').select('total, status, created_at, operation_date')
      .eq('tenant_id', tenantId).eq('customer_id', customerId),
    supabase.from('LANCAMENTOS').select('amount, paid_amount, status, due_date')
      .eq('tenant_id', tenantId).eq('customer_id', customerId).eq('type', 'receivable'),
  ]);

  const valid = (sales || []).filter(v => v.status !== 'cancelled' && v.status !== 'cancelada');
  const last12 = valid.filter(within12m);
  const total12m = last12.reduce((s, v) => s + (Number(v.total) || 0), 0);
  const pedidos12m = last12.length;
  const ticketMedio = pedidos12m ? total12m / pedidos12m : 0;

  const tier = tierOf(total12m);
  const next = nextTierOf(total12m);
  const stars = tier ? tier.stars : 0;

  // ── financeiro: pendências vencidas + comportamento de pagamento ──
  const today = new Date().toISOString().slice(0, 10);
  const open = (recv || []).filter(l => l.status !== 'paid');
  const overdue = open.filter(l => l.due_date && l.due_date < today);
  const overdueTotal = overdue.reduce((s, l) => s + Math.max(0, (l.amount || 0) - (l.paid_amount || 0)), 0);
  const openTotal = open.reduce((s, l) => s + Math.max(0, (l.amount || 0) - (l.paid_amount || 0)), 0);
  const paidCount = (recv || []).filter(l => l.status === 'paid').length;

  // ── Selo de Confiança: 3+ títulos pagos, nada vencido e não bloqueado ──
  const selo = paidCount >= 3 && overdue.length === 0 && !cli.blocked;
  const seloCriteria = [
    { label: '3 ou mais títulos pagos', ok: paidCount >= 3, atual: `${paidCount} pago(s)` },
    { label: 'Nenhuma conta vencida em aberto', ok: overdue.length === 0, atual: overdue.length ? `${overdue.length} vencida(s)` : 'em dia' },
    { label: 'Cadastro sem bloqueio', ok: !cli.blocked, atual: cli.blocked ? 'bloqueado' : 'liberado' },
  ];

  // ── registra evolução (estrelas / selo) e atualiza o cliente ──
  const prevStars = Number(cli.rating) || 0;
  if (stars !== prevStars) {
    await logPrime(tenantId, customerId, {
      event: 'stars', stars_from: prevStars, stars_to: stars, total_12m: total12m,
      note: stars > prevStars ? 'Subiu de nível pelo faturamento de 12 meses' : 'Nível recalculado pelo faturamento de 12 meses',
    });
  }
  const prevSelo = !!cli.selo_confianca;
  if (selo !== prevSelo) {
    await logPrime(tenantId, customerId, {
      event: 'selo', selo, total_12m: total12m,
      note: selo ? 'Selo de Confiança conquistado' : 'Selo de Confiança perdido',
    });
  }
  // atualiza o cadastro (com fallback se as colunas 045 não existirem)
  const patch = { rating: stars || null, total_12m: total12m, selo_confianca: selo };
  let { error: upErr } = await supabase.from('CLIENTES').update(patch)
    .eq('id', customerId).eq('tenant_id', tenantId);
  if (upErr && /selo_confianca/i.test(upErr.message || '')) {
    delete patch.selo_confianca;
    await supabase.from('CLIENTES').update(patch).eq('id', customerId).eq('tenant_id', tenantId);
  }

  // histórico de evolução (mais recente primeiro)
  let historico = [];
  try {
    const { data: hist } = await supabase.from('LYON_PRIME_HISTORICO').select('*')
      .eq('tenant_id', tenantId).eq('customer_id', customerId)
      .order('created_at', { ascending: false }).limit(30);
    historico = hist || [];
  } catch { /* tabela ainda não existe */ }

  return {
    total_12m: total12m,
    pedidos_12m: pedidos12m,
    ticket_medio: ticketMedio,
    stars,
    tier: tier ? { ...tier } : null,
    next: next ? { ...next, faltam: Math.max(0, next.min - total12m) } : null,
    progress: next ? Math.min(1, total12m / next.min) : 1,
    selo: { earned: selo, criteria: seloCriteria },
    financeiro: {
      em_aberto: openTotal,
      vencido: overdueTotal,
      vencidos_count: overdue.length,
      pagos_count: paidCount,
      situacao: cli.blocked ? 'Bloqueado' : (overdue.length ? 'Inadimplente' : 'Regular'),
      pagamentos: paidCount === 0 ? 'Sem histórico' : (overdue.length === 0 ? 'Excelente' : (overdueTotal > openTotal * 0.5 ? 'Ruim' : 'Atenção')),
    },
    credit_limit: Number(cli.credit_limit) || 0,
    credit_suggested: tier ? tier.credit : 0,
    boleto_days: cli.boleto_days != null ? cli.boleto_days : (tier ? tier.boleto : 0),
    boleto_suggested: tier ? tier.boleto : 0,
    historico,
    tiers: TIERS,
  };
}

module.exports = { computePrime, TIERS };
