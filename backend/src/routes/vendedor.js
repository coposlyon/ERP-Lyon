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
const { sendWhatsApp, sendWhatsAppImage } = require('../lib/whatsapp');
const { uploadDataUrl } = require('../lib/storage');
const { audit } = require('../lib/audit');
const { cidadesDaUf } = require('../lib/municipios');
const { configDoProduto, validarCombinacao } = require('../lib/configProduto');

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

    // A META VEM DA FASE, NÃO DO CALENDÁRIO. Precisa da história toda:
    // quem bateu 15.000 há dois anos já subiu de faixa, e uma janela
    // curta apagaria a conquista.
    const unitsByMonth = await V.unitsByMonthAll(tenantId, userId, year, month);
    const plan   = V.faseDoMes(plans, unitsByMonth, year, month);
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

    // O ciclo do bônus olha para trás, sobre as mesmas unidades por mês
    // que decidiram a fase — uma consulta serve às duas contas.
    const cycle = V.cycleProgress(unitsByMonth, plans, year, month, cycleMonths);

    const states  = V.statesRanking(sales, config.territory);
    const ranking = V.productRanking(sales, prevSales, 8);
    const carteira = V.customerRanking(sales).slice(0, config.top_clients);

    // Nome do vendedor para o rodapé do painel
    const { data: profile } = await supabase
      .from('USUARIOS').select('id, name, email')
      .eq('id', userId).maybeSingle();

    // Quem responde por cada UF do território — o painel troca a sigla
    // do estado pelo rosto de quem atende ali.
    const responsaveis = await V.responsaveisPorUf(tenantId, config.territory);

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
        responsaveis,
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
      // O líder é quem vendeu. Com o território inteiro na lista, o
      // primeiro item pode ser um estado zerado — e coroar quem não
      // vendeu nada seria pior do que não coroar ninguém.
      leader_state: states.find(e => e.buyers > 0)?.uf || null,
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
    const linha = String(req.query.line || '').trim();
    const q = String(req.query.q || '').trim().toLowerCase();

    let list = V.customerRanking(sales);

    if (config.territory.length) list = list.filter(c => !c.uf || config.territory.includes(c.uf));
    if (uf && V.UF_REGEX.test(uf)) list = list.filter(c => c.uf === uf);
    if (linha) list = list.filter(c => c.line_keys.includes(linha));
    if (q) list = list.filter(c => (c.name || '').toLowerCase().includes(q));

    // As UFs e produtos dos filtros saem da própria carteira — o vendedor
    // não escolhe um filtro que devolve lista vazia.
    const ufs = [...new Set(V.customerRanking(sales).map(c => c.uf).filter(Boolean))].sort();
    // O filtro é por LINHA, igual ao ranking: "quem comprou twister 550"
    // não quer dizer "quem comprou o twister 550 verde garrafa".
    const products = V.productTotals(sales).map(p => ({
      key: p.key, name: p.name, product_ids: p.product_ids,
    }));

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
// ── Orçamento: o que cada produto aceita ──────────────
//
// A tela de orçamento não sabe o que é degradê. Ela pede a
// configuração do produto e recebe os acabamentos liberados, cada um
// carregando os CAMPOS que abre e de qual lista de cores cada campo se
// alimenta. Acabamento novo é linha no banco — nenhuma tela muda.

/** Os produtos que o vendedor pode orçar. */
router.get('/orcamento/produtos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('PRODUTOS')
      .select('id, code, name, sale_price, CATEGORIAS ( name )')
      .eq('tenant_id', req.tenantId).eq('is_active', true).order('name');
    if (error) throw error;
    res.json((data || []).map(p => ({
      id: p.id, codigo: p.code, nome: p.name,
      categoria: p.CATEGORIAS?.name || null,
      preco_base: Number(p.sale_price) || 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Acabamentos, cores e processos liberados para um produto. */
router.get('/orcamento/config/:produtoId', async (req, res) => {
  try {
    const cfg = await configDoProduto(req.tenantId, req.params.produtoId);
    if (cfg.erro) return res.status(404).json({ error: cfg.erro });
    res.json(cfg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A combinação escolhida é produzível?
 *
 * A tela já evita o impossível oferecendo só o liberado, mas a
 * checagem tem que existir aqui também: tela é conveniência, servidor
 * é regra. Sem isto, uma requisição montada à mão gravaria um
 * orçamento que a fábrica não produz — e o cliente já teria pago.
 */
router.post('/orcamento/validar', async (req, res) => {
  try {
    const cfg = await configDoProduto(req.tenantId, req.body?.produto_id);
    if (cfg.erro) return res.status(404).json({ error: cfg.erro });
    res.json(validarCombinacao(cfg, req.body || {}));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cidades de uma UF do território ──────────────────────────
//
// "Você atende o Paraná" não diz onde ir: são 399 cidades, e a
// diferença entre Curitiba e Doutor Ulysses é a diferença entre uma
// rota de um dia e uma de uma semana. Aqui sai a lista com o tamanho
// de cada uma, o DDD para ligar e se está em região metropolitana.
//
// Não há nada de sigiloso: é geografia pública do IBGE, a mesma para
// qualquer empresa. Por isso não filtra por território — o vendedor
// que quiser conferir a UF vizinha antes de pedir a área não está
// vendo dado de ninguém.
router.get('/territorio/:uf/cidades', async (req, res) => {
  try {
    res.json(await cidadesDaUf(req.params.uf));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

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

// ── Tela 4: artes aprovadas ──────────────────────────────────
/**
 * A biblioteca de artes que o vendedor pode anexar. Três fontes, todas
 * passando pelo Administrativo:
 *
 *   - ARTES_PROMOCIONAIS  arte solta subida pelo Admin
 *   - PROMOCOES_VENDEDOR  a arte da própria promoção
 *   - CAMPANHAS_MKT       campanha oficial já publicada no Marketing
 *
 * O vendedor não escolhe arquivo do computador dele: `enviar` recusa
 * qualquer URL que não esteja nesta lista.
 */
async function artesAprovadas(tenantId) {
  const hoje = new Date().toISOString().slice(0, 10);
  const [artes, promos, campanhas] = await Promise.all([
    supabase.from('ARTES_PROMOCIONAIS')
      .select('id, title, image_url, product_id')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .order('created_at', { ascending: false }),
    supabase.from('PROMOCOES_VENDEDOR')
      .select('id, title, image_url, product_id, valid_until, PRODUTOS ( name )')
      .eq('tenant_id', tenantId).eq('is_active', true)
      .not('image_url', 'is', null),
    supabase.from('CAMPANHAS_MKT')
      .select('id, title, image_url, created_at')
      .eq('tenant_id', tenantId).not('image_url', 'is', null)
      .order('created_at', { ascending: false }).limit(30),
  ]);

  const out = [];
  (artes.data || []).forEach(a => out.push({
    id: `arte:${a.id}`, title: a.title || 'Arte promocional',
    image_url: a.image_url, product_id: a.product_id, origem: 'Administrativo',
  }));
  (promos.data || []).filter(p => !p.valid_until || p.valid_until >= hoje).forEach(p => out.push({
    id: `promo:${p.id}`, title: p.title || p.PRODUTOS?.name || 'Promoção',
    image_url: p.image_url, product_id: p.product_id, origem: 'Promoção liberada',
  }));
  (campanhas.data || []).forEach(c => out.push({
    id: `campanha:${c.id}`, title: c.title || 'Campanha de Marketing',
    image_url: c.image_url, product_id: null, origem: 'Marketing',
  }));

  // A mesma arte pode aparecer na promoção e na campanha — uma linha só.
  const vistas = new Set();
  return out.filter(a => a.image_url && !vistas.has(a.image_url) && vistas.add(a.image_url));
}

router.get('/artes', async (req, res) => {
  try {
    res.json(await artesAprovadas(req.tenantId));
  } catch (err) {
    // Migração 066 pendente: sem biblioteca, e a tela já sabe dizer isso.
    if (V.tabelaAusente(err)) return res.json([]);
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
/**
 * Uma mensagem por cliente, com o nome dele dentro: Casas do Tur recebe
 * a dela, Mariana recebe a dela.
 *
 * Duas coisas acontecem antes de qualquer mensagem sair:
 *
 * 1. A arte é conferida contra a biblioteca aprovada. URL de fora —
 *    inclusive base64 subido pelo vendedor — é recusada. Arte comercial
 *    é decisão do Administrativo, não de quem está com o celular na mão.
 * 2. A campanha e uma linha POR DESTINATÁRIO são gravadas ANTES do
 *    disparo. Se o processo cair no meio, fica registrado quem já tinha
 *    recebido e quem ficou pendente — sem isso, uma queda no meio de 200
 *    clientes viraria um disparo cego.
 */
router.post('/oferta/enviar', async (req, res) => {
  const {
    customers = [], message, promo_id = null, product_id = null,
    product_name = null, image_url = null, personalize = true,
  } = req.body;

  if (!Array.isArray(customers) || customers.length === 0) {
    return res.status(400).json({ error: 'Selecione ao menos um cliente' });
  }
  if (!String(message || '').trim()) {
    return res.status(400).json({ error: 'Escreva a mensagem da oferta' });
  }

  try {
    // 1. A arte tem que estar na biblioteca aprovada
    let arte = null;
    if (image_url) {
      const aprovadas = await artesAprovadas(req.tenantId);
      arte = aprovadas.find(a => a.image_url === image_url)?.image_url || null;
      if (!arte) {
        return res.status(400).json({
          error: 'Esta arte não está liberada. Use uma das artes aprovadas pelo Administrativo.',
        });
      }
    }

    const vendedor = req.userProfile?.name || req.user?.email || null;

    // 2. Cabeçalho da campanha
    let oferta = null;
    try {
      const { data } = await supabase.from('OFERTAS_VENDEDOR').insert({
        tenant_id: req.tenantId,
        user_id: req.user.id,
        promo_id: promo_id || null,
        product_id: product_id || null,
        customers: customers.map(c => ({ id: c.customer_id || c.id || null, name: c.name, phone: c.phone })),
        message,
        image_url: arte,
        results: {},
        status: 'sending',
      }).select().single();
      oferta = data;
    } catch { /* migração pendente: segue sem cabeçalho */ }

    // 3. Uma linha por destinatário, antes de qualquer disparo
    const linhas = customers.map(c => {
      const digits = String(c.phone || '').replace(/\D/g, '');
      return {
        tenant_id: req.tenantId,
        oferta_id: oferta?.id || null,
        user_id: req.user.id,
        user_name: vendedor,
        customer_id: c.customer_id || c.id || null,
        customer_name: c.name || null,
        phone: c.phone || null,
        phone_digits: digits.length <= 11 ? `55${digits}` : digits,
        promo_id: promo_id || null,
        product_id: product_id || null,
        product_name: product_name || null,
        // O texto que ESTE cliente recebe, já com o nome dele dentro
        message: personalize
          ? String(message).replace(/\{nome do cliente\}/gi, c.name || '')
          : String(message),
        image_url: arte,
        status: digits.length >= 10 ? 'pending' : 'no_phone',
      };
    });

    let registros = [];
    try {
      const { data } = await supabase.from('OFERTAS_ENVIOS').insert(linhas).select();
      registros = data || [];
    } catch { /* migração 066 pendente: dispara sem registro individual */ }

    // 4. Disparo, atualizando cada linha com o que aconteceu
    let sent = 0, failed = 0, semTelefone = 0, firstError = null;

    for (let i = 0; i < linhas.length; i++) {
      const linha = linhas[i];
      const registro = registros[i] || null;

      if (linha.status === 'no_phone') { semTelefone++; continue; }

      const r = arte
        ? await sendWhatsAppImage(linha.phone, arte, linha.message)
        : await sendWhatsApp(linha.phone, linha.message);

      if (r.ok) sent++; else { failed++; if (!firstError) firstError = r.error; }

      if (registro) {
        await supabase.from('OFERTAS_ENVIOS').update({
          status: r.ok ? 'sent' : 'failed',
          provider_message_id: r.id || null,
          error: r.ok ? null : (r.error || 'falha no envio'),
          sent_at: r.ok ? new Date().toISOString() : null,
        }).eq('id', registro.id);
      }
    }

    const results = {
      total: customers.length,
      sent,
      failed,
      no_phone: semTelefone,
      ...(sent === 0 && firstError ? { error: firstError } : {}),
    };

    if (oferta) {
      await supabase.from('OFERTAS_VENDEDOR')
        .update({ results, status: sent > 0 ? 'sent' : 'failed' })
        .eq('id', oferta.id);
    }

    audit(req, 'create', 'oferta', oferta?.id || null, { results, promo_id, arte: !!arte });
    res.json({ results, oferta_id: oferta?.id || null, oferta });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Registro individual dos envios ───────────────────────────
// É o que responde "o que foi enviado para a Casas do Tur no dia 14, por
// quem, com qual produto, e o que ela respondeu".
router.get('/envios', async (req, res) => {
  try {
    let q = supabase.from('OFERTAS_ENVIOS')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000));

    // Vendedor vê os próprios envios; gestor vê os de todo mundo.
    if (!isManager(req)) q = q.eq('user_id', req.user.id);
    else if (req.query.user_id) q = q.eq('user_id', String(req.query.user_id));

    if (req.query.oferta_id)   q = q.eq('oferta_id', String(req.query.oferta_id));
    if (req.query.customer_id) q = q.eq('customer_id', String(req.query.customer_id));
    if (req.query.status)      q = q.eq('status', String(req.query.status));

    const { data, error } = await q;
    if (error) { if (V.tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
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

    // SÓ QUEM É VENDEDOR ENTRA NA LISTA.
    //
    // Antes vinha todo usuário ativo, e o seletor do painel oferecia o
    // financeiro, o produção e o administrativo como se cada um tivesse
    // meta e comissão. Abrir o painel de quem não vende não quebra nada
    // — mostra zero em tudo — mas enche a lista de nomes que nunca são a
    // resposta, e piora a cada colaborador novo.
    //
    // Vendedor é quem tem território/meta configurados (a linha em
    // VENDEDORES) ou o módulo liberado. Quem tem `allowed_modules` nulo
    // é admin: vê todos os módulos, este inclusive.
    const ehVendedor = u => {
      const cfg = byUser.get(u.id);
      if (cfg && cfg.is_active !== false) return true;
      if (u.allowed_modules == null) return true;
      return Array.isArray(u.allowed_modules) && u.allowed_modules.includes('vendedor');
    };

    res.json((users || []).filter(ehVendedor).map(u => ({
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

// ── Artes aprovadas (cadastro) ───────────────────────────────
router.get('/artes-admin', requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('ARTES_PROMOCIONAIS')
      .select('*, PRODUTOS ( id, name )')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (error) {
      if (V.tabelaAusente(error)) {
        return res.status(503).json({ error: 'Rode a migração 066_vendedor_artes_envios.sql no Supabase.' });
      }
      throw error;
    }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/artes-admin', requireManager, async (req, res) => {
  const { image, title = null, product_id = null } = req.body || {};
  if (!image) return res.status(400).json({ error: 'Envie a imagem da arte' });
  try {
    const url = await uploadDataUrl(image, 'artes-promocionais');
    if (!url) return res.status(400).json({ error: 'Não foi possível subir a imagem' });

    const { data, error } = await supabase.from('ARTES_PROMOCIONAIS').insert({
      tenant_id: req.tenantId,
      title: title ? String(title).slice(0, 120) : null,
      image_url: url,
      product_id: product_id || null,
      created_by: req.user.id,
    }).select().single();
    if (error) throw error;

    audit(req, 'create', 'arte_promocional', data.id, { title });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/artes-admin/:id', requireManager, async (req, res) => {
  try {
    const { error } = await supabase.from('ARTES_PROMOCIONAIS')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'arte_promocional', req.params.id, null);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// A arte pode chegar como data URL (upload novo) ou como a URL que já
// estava salva. Só sobe para o Storage quando é upload novo.
async function promoPayload(req) {
  const b = req.body || {};
  const image_url = b.image
    ? await uploadDataUrl(b.image, 'artes-promocionais')
    : (b.image_url || null);
  return {
    image_url,
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
      ...(await promoPayload(req)),
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'promocao_vendedor', data.id, { product_id: data.product_id });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/promocoes-admin/:id', requireManager, async (req, res) => {
  try {
    const { data, error } = await supabase.from('PROMOCOES_VENDEDOR')
      .update({ ...(await promoPayload(req)), updated_at: new Date().toISOString() })
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
