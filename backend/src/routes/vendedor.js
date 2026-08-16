// ============================================================
// Painel do Vendedor — as quatro telas.
//
//   GET  /dashboard            Tela 1 (KPIs, plano, estados, semanas,
//                              produto líder, cores, prévia da carteira)
//   GET  /ranking-produtos     Tela 2 (1º ao 8º + tendência)
//   GET  /carteira             Tela 3 (top compradores, com filtros)
//   GET  /promocoes            Tela 4 (ofertas liberadas pelo Admin)
//   POST /oferta/texto         Tela 4 (a IA escreve, não envia)
//   POST /oferta/enviar        Tela 4 (dispara individualmente)
//
// Administrativo (admin/gerente):
//   GET/PUT    /planos         faixas do plano de metas
//   GET/PUT    /config/:id     território e plano do vendedor
//   GET        /vendedores     quem tem painel
//   POST/PUT/DELETE /promocoes-admin
// ============================================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const V        = require('../lib/vendedor');
const { askClaude } = require('../lib/ai');
const { sendWhatsApp } = require('../lib/whatsapp');
const { uploadDataUrl } = require('../lib/storage');
const { audit } = require('../lib/audit');

const isManager = req => ['admin', 'manager'].includes(req.userProfile?.role);

/**
 * De quem é o painel.
 *
 * O vendedor vê o próprio e só o próprio: passar ?user_id= de outra
 * pessoa não muda nada para ele. Gerente e admin escolhem quem olhar.
 */
function sellerId(req) {
  if (isManager(req) && req.query.user_id) return String(req.query.user_id);
  return req.user.id;
}

// ── Tela 1 ───────────────────────────────────────────────────
router.get('/dashboard', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId   = sellerId(req);
    const { year, month } = V.parseMonth(req.query.month);
    const cur  = V.monthBounds(year, month);
    const prev = V.prevMonthOf({ year, month });
    const prevB = V.monthBounds(prev.year, prev.month);

    const config = await V.loadSellerConfig(tenantId, userId);
    const { plans, missing } = await V.loadPlans(tenantId, config.plan_group);
    const plan   = V.planForMonth(plans, month);
    const goal   = V.planGoal(plan);
    const pct    = Number(plan?.commission_pct) || 0;
    const cycleMonths = Number(plan?.cycle_months) || 3;

    const [sales, prevSales] = await Promise.all([
      V.fetchSales(tenantId, userId, cur.start, cur.end),
      V.fetchSales(tenantId, userId, prevB.start, prevB.end),
    ]);

    const units   = V.round2(sales.reduce((s, v) => s + V.saleUnits(v), 0));
    const revenue = V.round2(sales.reduce((s, v) => s + V.saleRevenue(v), 0));

    const commission = V.computeCommission(sales, goal, pct);
    const referenceMonth = V.monthKey(year, month);
    await V.persistCommission(tenantId, userId, referenceMonth, goal, pct, commission.rows);

    // O ciclo do bônus olha para trás: precisa dos meses anteriores.
    const unitsByMonth = await V.unitsByMonthBack(tenantId, userId, year, month, cycleMonths);
    const cycle = V.cycleProgress(unitsByMonth, plans, year, month, cycleMonths);

    const states  = V.statesRanking(sales);
    const ranking = V.productRanking(sales, prevSales, 8);
    const carteira = V.customerRanking(sales).slice(0, config.top_clients);

    // Nome do vendedor para o rodapé do painel
    const { data: profile } = await supabase
      .from('USUARIOS').select('id, name, email')
      .eq('id', userId).maybeSingle();

    res.json({
      // As tabelas de configuração nascem na migração 065, aplicada à mão
      // no Supabase. Sem elas o painel mostra as vendas e avisa o que falta.
      setup_pending: !!(missing || config.missing),
      seller: {
        user_id: userId,
        name: profile?.name || profile?.email || 'Vendedor',
        region_label: config.region_label,
        territory: config.territory,
        top_clients: config.top_clients,
      },
      period: { year, month, month_key: referenceMonth },
      kpis: {
        goal,
        units,
        avg_price: units > 0 ? V.round2(revenue / units) : 0,
        revenue,
        achievement: goal > 0 ? V.round2((units / goal) * 100) : null,
        missing: goal > 0 ? V.round2(Math.max(0, goal - units)) : 0,
        surplus: goal > 0 ? V.round2(Math.max(0, units - goal)) : 0,
        commission_value: commission.value,
        commission_units: commission.units,
        commission_amount: commission.amount,
        commission_pct: pct,
      },
      plan: plan ? {
        name: plan.name,
        monthly_goal: goal,
        commission_pct: pct,
        cycle_bonus: Number(plan.cycle_bonus) || 0,
        cycle_months: cycleMonths,
      } : null,
      cycle,
      states,
      leader_state: states[0]?.uf || null,
      weekly: V.weeklySales(sales, year, month),
      top_product: ranking[0] || null,
      colors: V.colorRanking(sales),
      carteira: carteira.map(c => ({
        customer_id: c.customer_id, name: c.name, uf: c.uf, units: c.units,
      })),
      eligible_orders: commission.rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tela 2 ───────────────────────────────────────────────────
router.get('/ranking-produtos', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId   = sellerId(req);
    const { year, month } = V.parseMonth(req.query.month);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 8, 1), 50);
    const cur  = V.monthBounds(year, month);
    const prev = V.prevMonthOf({ year, month });
    const prevB = V.monthBounds(prev.year, prev.month);

    const [sales, prevSales] = await Promise.all([
      V.fetchSales(tenantId, userId, cur.start, cur.end),
      V.fetchSales(tenantId, userId, prevB.start, prevB.end),
    ]);

    const products = V.productRanking(sales, prevSales, limit);
    const totalUnits = V.round2(sales.reduce((s, v) => s + V.saleUnits(v), 0));

    res.json({
      period: { year, month, month_key: V.monthKey(year, month) },
      prev_period: { month_key: V.monthKey(prev.year, prev.month) },
      total_units: totalUnits,
      products,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tela 3 ───────────────────────────────────────────────────
// Top compradores DO VENDEDOR: a lista nasce dos pedidos dele, então
// não há como enxergar cliente de outra carteira. O território, quando
// configurado, aperta mais um pouco (só as UFs que ele atende).
router.get('/carteira', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const userId   = sellerId(req);
    const { year, month } = V.parseMonth(req.query.month);
    const cur = V.monthBounds(year, month);

    // O período da carteira é maior que o do painel: cliente que compra
    // a cada dois meses sumiria de uma janela de 30 dias.
    const monthsBack = Math.min(Math.max(parseInt(req.query.months, 10) || 12, 1), 36);
    let from = { year, month };
    for (let i = 1; i < monthsBack; i++) from = V.prevMonthOf(from);

    const config = await V.loadSellerConfig(tenantId, userId);
    const sales  = await V.fetchSales(tenantId, userId, V.monthBounds(from.year, from.month).start, cur.end);

    const top = Math.min(Math.max(parseInt(req.query.top, 10) || config.top_clients || 10, 1), 200);
    const uf = String(req.query.uf || '').toUpperCase().trim();
    const productId = String(req.query.product_id || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();

    let list = V.customerRanking(sales);

    if (config.territory.length) list = list.filter(c => !c.uf || config.territory.includes(c.uf));
    if (uf && V.UF_REGEX.test(uf)) list = list.filter(c => c.uf === uf);
    if (productId) list = list.filter(c => c.product_ids.includes(productId));
    if (q) list = list.filter(c => (c.name || '').toLowerCase().includes(q));

    // As UFs e produtos dos filtros saem da própria carteira — o vendedor
    // não escolhe um filtro que devolve lista vazia.
    const ufs = [...new Set(V.customerRanking(sales).map(c => c.uf).filter(Boolean))].sort();
    const products = V.productTotals(sales)
      .filter(p => p.product_id)
      .map(p => ({ product_id: p.product_id, name: p.name }));

    res.json({
      period: { year, month, months: monthsBack },
      territory: config.territory,
      total: list.length,
      ufs,
      products,
      customers: list.slice(0, top).map(c => ({
        customer_id: c.customer_id,
        name: c.name,
        city: c.city,
        uf: c.uf,
        phone: c.phone,
        units: c.units,
        revenue: c.revenue,
        orders: c.orders,
        last_date: c.last_date,
        last_units: c.last_units,
        last_product: c.last_product,
        last_product_id: c.last_product_id,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tela 4: promoções liberadas ──────────────────────────────
router.get('/promocoes', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from('PROMOCOES_VENDEDOR')
      .select('*, PRODUTOS ( id, name, photos, sale_price )')
      .eq('tenant_id', req.tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    // Migração 065 pendente: nenhuma promoção liberada, e a tela de oferta
    // já sabe dizer isso ao vendedor.
    if (error) { if (V.tabelaAusente(error)) return res.json([]); throw error; }

    // Promoção vencida não some do cadastro, mas some da lista de quem vende.
    res.json((data || []).filter(p => !p.valid_until || p.valid_until >= today));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Tela 4: a IA escreve o texto ─────────────────────────────
// Ela não envia nada e não decide preço: pega o rascunho do vendedor e
// devolve escrito direito, para ele editar antes de disparar.
router.post('/oferta/texto', async (req, res) => {
  const brief = String(req.body.brief || '').trim();
  const product = String(req.body.product || '').trim();
  const sellerName = req.userProfile?.name || 'o vendedor';
  if (!brief) return res.status(400).json({ error: 'Descreva a oferta que você quer escrever' });

  const r = await askClaude({
    system: [
      'Você escreve mensagens de WhatsApp para um vendedor da Lyon Copos (copos e brindes personalizados).',
      'Português do Brasil, tom profissional e cordial, sem gírias e sem exagero de emoji (no máximo um).',
      'No máximo 4 parágrafos curtos. Use a variável {Nome do cliente} para o nome — escreva exatamente assim.',
      'NÃO invente preço, desconto, porcentagem, prazo de entrega nem condição de pagamento que não estejam no pedido do vendedor.',
      'Responda apenas com o texto da mensagem, sem títulos e sem aspas em volta.',
    ].join(' '),
    prompt: [
      `Vendedor: ${sellerName}.`,
      product ? `Produto em oferta: ${product}.` : '',
      `Pedido do vendedor: ${brief}`,
    ].filter(Boolean).join('\n'),
    max_tokens: 600,
  });

  if (!r.ok) return res.status(400).json({ error: r.error });
  res.json({ message: r.text });
});

// ── Tela 4: disparo ──────────────────────────────────────────
// Uma mensagem por cliente, com o nome dele dentro. Casas do Tur recebe
// a dela; Mariana recebe a dela.
router.post('/oferta/enviar', async (req, res) => {
  const { customers = [], message, promo_id = null, product_id = null, image = null, personalize = true } = req.body;

  if (!Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos um cliente' });
  }
  if (!String(message || '').trim()) {
    return res.status(400).json({ error: 'Escreva a mensagem da oferta' });
  }

  try {
    let imageUrl = null;
    if (image) imageUrl = await uploadDataUrl(image, 'ofertas');

    const alvos = customers.filter(c => String(c.phone || '').replace(/\D/g, '').length >= 10);
    const semTelefone = customers.length - alvos.length;

    let sent = 0, failed = 0, firstError = null;
    for (const c of alvos) {
      const texto = personalize
        ? String(message).replace(/\{nome do cliente\}/gi, c.name || '')
        : String(message);
      const r = await sendWhatsApp(c.phone, texto);
      if (r.ok) sent++; else { failed++; if (!firstError) firstError = r.error; }
    }

    const results = {
      total: customers.length,
      sent,
      failed,
      no_phone: semTelefone,
      ...(sent === 0 && firstError ? { error: firstError } : {}),
    };

    let oferta = null;
    try {
      const { data } = await supabase.from('OFERTAS_VENDEDOR').insert({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        promo_id: promo_id || null,
        product_id: product_id || null,
        customers: customers.map(c => ({ id: c.customer_id || c.id || null, name: c.name, phone: c.phone })),
        message,
        image_url: imageUrl,
        results,
        status: sent > 0 ? 'sent' : 'failed',
      }).select().single();
      oferta = data;
    } catch { /* tabela ausente: o disparo já aconteceu, não desfaz */ }

    audit(req, 'create', 'oferta', oferta?.id || null, { results, promo_id });
    res.json({ results, oferta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ofertas', async (req, res) => {
  try {
    let q = supabase.from('OFERTAS_VENDEDOR').select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!isManager(req)) q = q.eq('user_id', req.user.id);
    const { data, error } = await q;
    if (error) { if (V.tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Administrativo — daqui para baixo só admin e gerente
// ============================================================
function requireManager(req, res, next) {
  if (!isManager(req)) return res.status(403).json({ error: 'Apenas gestores podem alterar a configuração do vendedor' });
  next();
}

// ── Plano de metas ───────────────────────────────────────────
router.get('/planos', async (req, res) => {
  try {
    const group = String(req.query.plan_group || 'padrao');
    const { plans, missing } = await V.loadPlans(req.tenantId, group);
    res.json({ plan_group: group, setup_pending: missing, faixas: plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Substitui as faixas do grupo pelas enviadas. É um "salvar a tabela
 * inteira" de propósito: o Administrativo edita as 4 linhas de uma vez
 * e o que sumiu da tela tem que sumir do banco.
 */
router.put('/planos', requireManager, async (req, res) => {
  const group = String(req.body.plan_group || 'padrao');
  const faixas = Array.isArray(req.body.faixas) ? req.body.faixas : [];

  const limpo = faixas.map((f, i) => ({
    tenant_id: req.tenantId,
    plan_group: group,
    name: String(f.name || `Meta ${i + 1}`).slice(0, 60),
    seq: Number(f.seq) || i + 1,
    months: (Array.isArray(f.months) ? f.months : [])
      .map(m => parseInt(m, 10)).filter(m => m >= 1 && m <= 12),
    monthly_goal: Math.max(Number(f.monthly_goal) || 0, 0),
    cycle_bonus: Math.max(Number(f.cycle_bonus) || 0, 0),
    cycle_months: Math.min(Math.max(parseInt(f.cycle_months, 10) || 3, 1), 12),
    commission_pct: Math.max(Number(f.commission_pct) || 0, 0),
    is_active: f.is_active !== false,
  }));

  // Um mês em duas faixas deixaria a meta do vendedor ambígua.
  const vistos = new Set();
  for (const f of limpo) {
    for (const m of f.months) {
      if (vistos.has(m)) return res.status(400).json({ error: `O mês ${m} está em mais de uma faixa` });
      vistos.add(m);
    }
  }

  try {
    await supabase.from('VENDEDOR_PLANOS').delete()
      .eq('tenant_id', req.tenantId).eq('plan_group', group);
    if (limpo.length) {
      const { error } = await supabase.from('VENDEDOR_PLANOS').insert(limpo);
      if (error) throw error;
    }
    audit(req, 'update', 'vendedor_plano', group, { faixas: limpo.length });
    const { plans } = await V.loadPlans(req.tenantId, group);
    res.json({ plan_group: group, setup_pending: false, faixas: plans });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cadastro comercial dos vendedores ────────────────────────
router.get('/vendedores', requireManager, async (req, res) => {
  try {
    const [{ data: users }, { data: configs }] = await Promise.all([
      supabase.from('USUARIOS').select('id, name, email, role, is_active, allowed_modules')
        .eq('tenant_id', req.tenantId).eq('is_active', true).order('name'),
      supabase.from('VENDEDORES').select('*').eq('tenant_id', req.tenantId),
    ]);

    const byUser = new Map((configs || []).map(c => [c.user_id, c]));
    res.json((users || []).map(u => ({
      user_id: u.id,
      name: u.name,
      email: u.email,
      role: u.role,
      config: byUser.get(u.id) || null,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/config/:userId', async (req, res) => {
  // O vendedor pode ler a própria configuração (é o que o painel mostra
  // em "Território atendido"); mexer nela, só gestor.
  if (!isManager(req) && req.params.userId !== req.user.id) {
    return res.status(403).json({ error: 'Sem acesso a esta configuração' });
  }
  try {
    res.json(await V.loadSellerConfig(req.tenantId, req.params.userId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/config/:userId', requireManager, async (req, res) => {
  const b = req.body || {};
  const territory = (Array.isArray(b.territory) ? b.territory : [])
    .map(uf => String(uf).toUpperCase().trim())
    .filter(uf => V.UF_REGEX.test(uf));

  try {
    const { data, error } = await supabase.from('VENDEDORES').upsert({
      user_id: req.params.userId,
      tenant_id: req.tenantId,
      is_active: b.is_active !== false,
      region_label: b.region_label ? String(b.region_label).slice(0, 60) : null,
      territory,
      plan_group: String(b.plan_group || 'padrao').slice(0, 40),
      top_clients: Math.min(Math.max(parseInt(b.top_clients, 10) || 10, 1), 200),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' }).select().single();
    if (error) throw error;

    audit(req, 'update', 'vendedor', req.params.userId, { territory, plan_group: data.plan_group });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Promoções (cadastro) ─────────────────────────────────────
router.get('/promocoes-admin', requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PROMOCOES_VENDEDOR')
      .select('*, PRODUTOS ( id, name )')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      if (V.tabelaAusente(error)) {
        return res.status(503).json({ error: 'Rode a migração 065_vendedor.sql no Supabase para liberar promoções.' });
      }
      throw error;
    }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

function promoPayload(req) {
  const b = req.body || {};
  return {
    product_id: b.product_id || null,
    title: b.title ? String(b.title).slice(0, 120) : null,
    suggested_qty: b.suggested_qty != null && b.suggested_qty !== '' ? Math.max(Number(b.suggested_qty) || 0, 0) : null,
    valid_until: b.valid_until || null,
    promo_price: b.promo_price != null && b.promo_price !== '' ? Math.max(Number(b.promo_price) || 0, 0) : null,
    discount_pct: b.discount_pct != null && b.discount_pct !== '' ? Math.max(Number(b.discount_pct) || 0, 0) : null,
    message_template: b.message_template ? String(b.message_template).slice(0, 2000) : null,
    is_active: b.is_active !== false,
  };
}

router.post('/promocoes-admin', requireManager, async (req, res) => {
  if (!req.body?.product_id) return res.status(400).json({ error: 'Escolha o produto da promoção' });
  try {
    const { data, error } = await supabase.from('PROMOCOES_VENDEDOR').insert({
      tenant_id: req.tenantId,
      created_by: req.user.id,
      ...promoPayload(req),
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'promocao_vendedor', data.id, { product_id: data.product_id });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/promocoes-admin/:id', requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('PROMOCOES_VENDEDOR')
      .update({ ...promoPayload(req), updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'promocao_vendedor', req.params.id, null);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/promocoes-admin/:id', requireManager, async (req, res) => {
  try {
    const { error } = await supabase.from('PROMOCOES_VENDEDOR')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'promocao_vendedor', req.params.id, null);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
