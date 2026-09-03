// ════════════════════════════════════════════════════════════
// RATEIO DE CUSTOS — centraliza os custos da empresa e distribui
// para produtos e pedidos. Regra: nada é digitado duas vezes —
// despesas vêm do Financeiro, custos e fretes de Compras, fichas
// da Formação de Preço, pedidos do Comercial.
// ════════════════════════════════════════════════════════════
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
// O que os adicionais cadastrados acrescentam na peca. A Engenharia
// de Custos LE o cadastro; ela nao e mais o lugar de digitar insumo.
const { custoDosAdicionaisPadrao } = require('../lib/adicionais');
const { audit } = require('../lib/audit');
const {
  VARIABLE_DEFAULTS, getConfig, saveConfig,
  fixedOverview, snapshotRateio, computeSheet, productCostMap,
  syncEmployeesToFixed, productionLabor, commissionBySeller,
  marketingSpend, extraVariableCosts, ensureSnapshot,
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
    let { data: product, error: pErr } = await findProduct('id, name, cost_price, sale_price, category_id, updated_at, CATEGORIAS(name)');
    if (pErr) ({ data: product } = await findProduct('id, name, cost_price, sale_price, category_id, CATEGORIAS(name)'));
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
    const [labor, commissions, marketing, extras, cfg, adic] = await Promise.all([
      productionLabor(req.tenantId), commissionBySeller(req.tenantId, month),
      marketingSpend(req.tenantId, month), extraVariableCosts(req.tenantId, month),
      getConfig(req.tenantId),
      // Borda, tinta e canudo marcados como "ja vem no preco". Os
      // opcionais NAO entram: encarecer o copo de quem nao pediu canudo
      // e o erro que faz o preco de tabela subir sozinho.
      custoDosAdicionaisPadrao(req.tenantId, product.id, product.category_id || null),
    ]);
    const units = ov.monthly_units;
    const pu = v => (units > 0 ? Math.round((v / units) * 10000) / 10000 : 0);
    const variavelUnit = pu(labor.total + commissions.total + marketing.total + extras.total);

    // ── Linhas com ORIGEM de cada custo
    const src = breakdown.source === 'ficha'
      ? { o: `Ficha "${breakdown.sheet_name}"`, l: '/pricing/formacao' }
      : { o: 'Cadastro do produto', l: '/products' };
    // CADA LINHA DIZ DE ONDE VEM E LEVA ATE LA. `explicacao` e o texto
    // que aparece ao passar o mouse sobre o valor; `link` e para onde o
    // clique vai. Numero de custo sem procedencia e numero que ninguem
    // conserta: quem discorda dele nao sabe onde discordar.
    const detalheAdic = adic.itens.length
      ? adic.itens.map(a => `${a.item.name}${a.item.color_name ? ' ' + a.item.color_name : ''} (${a.consumo} ${a.item.base_unit})`).join(', ')
      : 'nenhum adicional marcado como "já vem no preço"';
    const lines = [
      { key: 'materia_prima', label: 'Matéria-prima', value: breakdown.materia_prima, origin: src.o, link: src.l,
        explicacao: `Este valor vem ${breakdown.source === 'ficha' ? `da ficha de preço "${breakdown.sheet_name}"` : 'do custo cadastrado no produto'}. Clique para abrir e ajustar.` },
      { key: 'tintas',        label: 'Tinta',          value: breakdown.tintas,        origin: src.o, link: src.l,
        explicacao: 'Tinta lançada na ficha de preço. A tinta do cadastro de itens entra na linha "Adicionais".' },
      { key: 'serigrafia',    label: 'Tela / Serigrafia', value: breakdown.serigrafia, origin: src.o, link: src.l,
        explicacao: 'Custo de tela e serigrafia da ficha de preço deste produto.' },
      { key: 'caixa',         label: 'Embalagem',      value: breakdown.caixa,         origin: src.o, link: src.l,
        explicacao: 'Embalagem lançada na ficha de preço.' },
      { key: 'adicionais',    label: 'Adicionais que já vêm no preço (borda, tinta, canudo)',
        value: adic.custo, origin: 'Cadastros › Itens', link: '/cadastros/itens',
        explicacao: `Este valor vem do cadastro de itens: ${detalheAdic}. Clique para abrir os cadastros e ajustar o que se gasta e o que se cobra.` },
      { key: 'frete',         label: 'Frete de compra', value: breakdown.frete,        origin: 'Compras', link: '/purchases',
        explicacao: 'Frete rateado das compras de matéria-prima.' },
      { key: 'rateio',        label: 'Rateio de despesas fixas', value: breakdown.rateio, origin: 'Despesas Fixas', link: '/rateio/despesas-fixas',
        explicacao: `Este valor vem das Despesas Fixas, dividido por ${units || 0} unidades/mês. Clique para abrir e conferir aluguel, energia e salários.` },
      { key: 'variavel',      label: 'Custos variáveis (mão de obra, comissão, marketing)', value: variavelUnit, origin: 'Despesas Variáveis', link: '/rateio/despesas-variaveis',
        explicacao: 'Este valor vem das Despesas Variáveis do mês (mão de obra da produção, comissão de vendedor e marketing), dividido pelas unidades produzidas.' },
      { key: 'impostos',      label: 'Impostos', value: breakdown.impostos, origin: 'Fiscal', link: '/fiscal',
        explicacao: 'Imposto aplicado sobre o subtotal, na alíquota configurada no módulo Fiscal.' },
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
      breakdown: { ...breakdown, custo_total: custoTotal, variavel: variavelUnit, adicionais: adic.custo },
      lines,
      // Os opcionais nao entram no custo do copo, mas a tela precisa
      // mostrar quanto eles PODEM somar quando a cliente escolher.
      adicionais: {
        padrao: adic.itens.map(a => ({ nome: a.item.name, cor: a.item.color_name, custo: a.custo, preco: a.preco })),
        opcionais: adic.opcionais.map(a => ({ nome: a.item.name, cor: a.item.color_name, custo: a.custo, preco: a.preco })),
        custo_padrao: adic.custo,
        preco_padrao: adic.preco,
      },
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

// ════════════════════════════════════════════════════════════
// GET /rateio/categoria/:id — O RATEIO DE UMA CATEGORIA INTEIRA.
//
// POR QUE POR CATEGORIA E NÃO SÓ POR PRODUTO. Ninguém forma preço de
// Long Drink 400 ml sozinho: forma-se o preço de LONG DRINK. Abrir
// vinte e quatro fichas para descobrir que todas têm o mesmo rateio,
// o mesmo custo variável e o mesmo imposto é trabalho que a máquina
// faz melhor — e é o que fazia a Engenharia de Custos parecer grande
// demais para ser usada.
//
// O QUE É MÉDIA E O QUE NÃO É. Rateio fixo, custo variável e imposto
// são IGUAIS para todo produto: são despesa da empresa dividida pelas
// unidades do mês. O que varia de copo para copo é a matéria-prima e
// o que a ficha de cada um diz — isso, sim, sai como média, e a tela
// mostra o intervalo (do mais barato ao mais caro) junto, porque uma
// média sem dispersão esconde exatamente o copo que está no prejuízo.
// ════════════════════════════════════════════════════════════
router.get('/categoria/:id', async (req, res) => {
  try {
    const ov = await fixedOverview(req.tenantId);
    const { data: cat } = await supabase.from('CATEGORIAS')
      .select('id, name').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada' });

    const { data: produtos } = await supabase.from('PRODUTOS')
      .select('id, name, cost_price, sale_price')
      .eq('tenant_id', req.tenantId).eq('category_id', cat.id)
      .order('name').limit(500);
    const lista = produtos || [];
    if (!lista.length) return res.status(404).json({ error: 'Categoria sem produtos' });

    // As fichas de todos os produtos de uma vez — 500 produtos não
    // podem virar 500 idas ao banco.
    let fichas = [];
    try {
      const { data } = await supabase.from('PRECIFICACOES')
        .select('*').eq('tenant_id', req.tenantId).eq('is_active', true)
        .in('product_id', lista.map(p => p.id));
      fichas = data || [];
    } catch { /* migração 042 pendente */ }
    // Mais de uma ficha ativa por produto: fica a mais recente.
    const fichaDe = new Map();
    for (const f of fichas) {
      const atual = fichaDe.get(f.product_id);
      if (!atual || new Date(f.updated_at || 0) > new Date(atual.updated_at || 0)) fichaDe.set(f.product_id, f);
    }

    const month = new Date().toISOString().slice(0, 7);
    const [labor, commissions, marketing, extras, cfg, adic] = await Promise.all([
      productionLabor(req.tenantId), commissionBySeller(req.tenantId, month),
      marketingSpend(req.tenantId, month), extraVariableCosts(req.tenantId, month),
      getConfig(req.tenantId),
      // Sem product_id: o que vale para ESTA categoria e o que vale
      // para todo o catálogo. É o adicional da categoria inteira.
      custoDosAdicionaisPadrao(req.tenantId, null, cat.id),
    ]);
    const units = ov.monthly_units;
    const variavelUnit = units > 0
      ? Math.round(((labor.total + commissions.total + marketing.total + extras.total) / units) * 10000) / 10000
      : 0;

    // ── o que varia de copo para copo ──────────────────────────
    const porProduto = lista.map(p => {
      const sheet = fichaDe.get(p.id);
      const c = sheet ? computeSheet({ ...sheet, overhead_unit: ov.overhead_unit }) : null;
      const proprio = c
        ? c.mat_unit + c.tinta_unit + c.pers_unit + c.emb_unit + c.frete_unit
        : Number(p.cost_price) || 0;
      const custo = r2(proprio + ov.overhead_unit + variavelUnit + adic.custo);
      const impostos = r2(custo * (Number(ov.tax_pct_default) || 0) / 100);
      const total = r2(custo + impostos);
      const preco = Number(p.sale_price) || 0;
      return {
        id: p.id, name: p.name,
        com_ficha: !!sheet,
        custo_proprio: r2(proprio),
        custo_total: total,
        sale_price: preco,
        margem_pct: preco > 0 ? Math.round(((preco - total) / preco) * 1000) / 10 : null,
      };
    });

    const media = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
    const proprios = porProduto.map(p => p.custo_proprio);
    const proprioMedio = r2(media(proprios));
    const impostoMedio = r2((proprioMedio + ov.overhead_unit + variavelUnit + adic.custo) * (Number(ov.tax_pct_default) || 0) / 100);

    const detalheAdic = adic.itens.length
      ? adic.itens.map(a => `${a.item.name}${a.item.color_name ? ' ' + a.item.color_name : ''}`).join(', ')
      : 'nenhum adicional marcado como "já vem no preço" nesta categoria';

    const lines = [
      { key: 'proprio', label: 'Matéria-prima e ficha (média da categoria)', value: proprioMedio,
        origin: 'Formação de Preço', link: '/pricing/formacao',
        explicacao: `Média dos ${lista.length} produtos da categoria. ${porProduto.filter(p => p.com_ficha).length} têm ficha de preço; o resto usa o custo do cadastro.` },
      { key: 'adicionais', label: 'Adicionais que já vêm no preço', value: adic.custo,
        origin: 'Cadastros › Itens', link: '/cadastros/itens',
        explicacao: `Este valor vem do cadastro de itens aplicado a esta categoria: ${detalheAdic}. Clique para abrir os cadastros.` },
      { key: 'rateio', label: 'Rateio de despesas fixas', value: ov.overhead_unit,
        origin: 'Despesas Fixas', link: '/rateio/despesas-fixas',
        explicacao: `Igual para todo produto: despesa fixa do mês dividida por ${units || 0} unidades.` },
      { key: 'variavel', label: 'Custos variáveis', value: variavelUnit,
        origin: 'Despesas Variáveis', link: '/rateio/despesas-variaveis',
        explicacao: 'Igual para todo produto: mão de obra, comissão e marketing do mês, divididos pelas unidades.' },
      { key: 'impostos', label: 'Impostos', value: impostoMedio,
        origin: 'Fiscal', link: '/fiscal',
        explicacao: `Alíquota de ${ov.tax_pct_default || 0}% sobre o subtotal médio.` },
    ];
    const custoMedio = r2(lines.reduce((a, l) => a + (Number(l.value) || 0), 0));
    for (const l of lines) {
      l.value = Math.round((Number(l.value) || 0) * 10000) / 10000;
      l.pct = custoMedio > 0 ? Math.round((l.value / custoMedio) * 1000) / 10 : 0;
    }

    const totais = porProduto.map(p => p.custo_total).sort((a, b) => a - b);
    const comPreco = porProduto.filter(p => p.margem_pct != null);
    const metaMargem = Number(cfg.margin_pct) || 30;

    res.json({
      categoria: { id: cat.id, name: cat.name, produtos: lista.length },
      lines,
      custo_medio: custoMedio,
      // A DISPERSÃO É TÃO IMPORTANTE QUANTO A MÉDIA: é ela que mostra
      // se existe um copo fora da curva escondido atrás do número bonito.
      custo_min: totais[0] ?? 0,
      custo_max: totais[totais.length - 1] ?? 0,
      margem_meta: metaMargem,
      margem_media: comPreco.length
        ? Math.round((comPreco.reduce((a, p) => a + p.margem_pct, 0) / comPreco.length) * 10) / 10
        : null,
      abaixo_meta: porProduto.filter(p => p.margem_pct != null && p.margem_pct < metaMargem).length,
      sem_preco: porProduto.filter(p => !p.sale_price).length,
      sem_ficha: porProduto.filter(p => !p.com_ficha).length,
      produtos: porProduto.sort((a, b) => (a.margem_pct ?? 999) - (b.margem_pct ?? 999)),
      adicionais: {
        padrao: adic.itens.map(a => ({ nome: a.item.name, cor: a.item.color_name, custo: a.custo, preco: a.preco })),
        opcionais: adic.opcionais.map(a => ({ nome: a.item.name, cor: a.item.color_name, custo: a.custo, preco: a.preco })),
      },
    });
  } catch (err) {
    console.error('[rateio/categoria]', err.message);
    res.status(500).json({ error: 'Erro ao calcular o rateio da categoria' });
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

// ── Simulador de Metas ────────────────────────────────────
// Tudo automático. Simula por período, vendedor, cliente, produto,
// região e canal, usando os mesmos números do Rateio por Pedido.
router.get('/goals', async (req, res) => {
  try {
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [ov, cfg, ctx] = await Promise.all([
      fixedOverview(req.tenantId), getConfig(req.tenantId), orderCtx(req.tenantId, month),
    ]);

    // Margem média por unidade — vem da Formação de Preço (ficha:
    // preço praticado − custo unitário). Pode ser fixada manualmente.
    let avgMargin = 0, sheetCount = 0, sheetAt = null;
    try {
      const { data: sheets } = await supabase.from('PRECIFICACOES')
        .select('cost_unit, price_ideal, updated_at, PRODUTOS(sale_price)')
        .eq('tenant_id', req.tenantId).eq('is_active', true).limit(1000);
      const margins = (sheets || []).map(s => {
        const price = Number(s.PRODUTOS?.sale_price) > 0 ? Number(s.PRODUTOS.sale_price) : Number(s.price_ideal) || 0;
        return price - (Number(s.cost_unit) || 0);
      }).filter(m => m !== 0);
      sheetCount = margins.length;
      avgMargin = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
      sheetAt = (sheets || []).map(s => s.updated_at).filter(Boolean).sort().pop() || null;
    } catch { /* migração 042 pendente */ }

    // ── Vendas do período, com os mesmos filtros do painel
    const start = `${month}-01`;
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10);
    let q = supabase.from('VENDAS')
      .select('id, number, total, status, source, created_at, customer_id, CLIENTES(name, vendedor, address), VENDA_ITENS(product_id, quantity)')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(2000);
    if (req.query.customer_id) q = q.eq('customer_id', req.query.customer_id);
    if (req.query.source) q = q.eq('source', req.query.source);
    let { data: sales, error: sErr } = await q;
    if (sErr) {
      ({ data: sales } = await supabase.from('VENDAS')
        .select('id, number, total, status, created_at, customer_id, CLIENTES(name, vendedor, address), VENDA_ITENS(product_id, quantity)')
        .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
        .gte('created_at', start).lt('created_at', end).limit(2000));
    }
    sales = sales || [];
    if (req.query.seller) {
      const w = String(req.query.seller).trim().toLowerCase();
      sales = sales.filter(s => String(s.CLIENTES?.vendedor || '').trim().toLowerCase() === w);
    }
    if (req.query.state) {
      const uf = String(req.query.state).trim().toUpperCase();
      sales = sales.filter(s => String(s.CLIENTES?.address?.state || '').trim().toUpperCase() === uf);
    }
    if (req.query.product_id) {
      sales = sales.filter(s => (s.VENDA_ITENS || []).some(i => i.product_id === req.query.product_id));
    }
    // Linha de produto (categoria)
    if (req.query.line) {
      const ids = [...new Set(sales.flatMap(s => (s.VENDA_ITENS || []).map(i => i.product_id)).filter(Boolean))];
      let catOf = {};
      if (ids.length) {
        const { data: prods } = await supabase.from('PRODUTOS')
          .select('id, CATEGORIAS(name)').eq('tenant_id', req.tenantId).in('id', ids);
        catOf = Object.fromEntries((prods || []).map(p => [p.id, p.CATEGORIAS?.name || 'Sem categoria']));
      }
      sales = sales.filter(s => (s.VENDA_ITENS || []).some(i => catOf[i.product_id] === req.query.line));
    }

    const rows = await saleCosts(req.tenantId, sales, ov, ctx);
    const lucroMes = rows.reduce((s, o) => s + o.lucro, 0);
    const receitaMes = rows.reduce((s, o) => s + o.receita, 0);
    const unidadesMes = rows.reduce((s, o) => s + o.quantity, 0);
    const custoVarMes = rows.reduce((s, o) => s + o.custos + o.impostos + o.comissao + o.variavel, 0);

    // ── Base do cálculo
    const meta = cfg.profit_goal != null ? Number(cfg.profit_goal) : 0;
    const margemUnit = cfg.avg_margin_unit != null ? Number(cfg.avg_margin_unit) : avgMargin;
    const custoFixo = ov.total;
    // Margem de contribuição % (o que sobra da receita após os variáveis)
    const mcPct = receitaMes > 0 ? ((receitaMes - custoVarMes) / receitaMes) * 100 : 0;
    const ticketMedio = rows.length > 0 ? receitaMes / rows.length : 0;
    const precoMedio = unidadesMes > 0 ? receitaMes / unidadesMes : 0;

    // Faturamento necessário = (custo fixo + meta) ÷ margem de contribuição %
    const fatNecessario = mcPct > 0 ? (custoFixo + meta) / (mcPct / 100) : 0;
    const unNecessarias = margemUnit > 0 ? Math.ceil((custoFixo + meta) / margemUnit)
      : (precoMedio > 0 ? Math.ceil(fatNecessario / precoMedio) : 0);
    const pedidosNecessarios = ticketMedio > 0 ? Math.ceil(fatNecessario / ticketMedio) : 0;
    const pctMeta = meta > 0 ? (lucroMes / meta) * 100 : null;

    // ── Indicadores de tempo (dias, ritmo e projeção)
    const hoje = new Date();
    const ehMesAtual = month === hoje.toISOString().slice(0, 7);
    const diasNoMes = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
    const diaAtual = ehMesAtual ? hoje.getDate() : diasNoMes;
    const diasRestantes = Math.max(0, diasNoMes - diaAtual);
    const faltaFaturar = Math.max(0, fatNecessario - receitaMes);
    const metaDiaria = diasRestantes > 0 ? faltaFaturar / diasRestantes : 0;
    // Projeção linear pelo ritmo até aqui
    const projFaturamento = diaAtual > 0 ? (receitaMes / diaAtual) * diasNoMes : 0;
    const projLucro = diaAtual > 0 ? (lucroMes / diaAtual) * diasNoMes : 0;

    // ── Opções dos filtros
    const { data: sellersRaw } = await supabase.from('CLIENTES')
      .select('vendedor').eq('tenant_id', req.tenantId).not('vendedor', 'is', null).limit(2000);
    const sellerOpts = [...new Set((sellersRaw || []).map(c => String(c.vendedor).trim()).filter(Boolean))].sort();
    const customerOpts = [...new Map(sales.filter(s => s.customer_id && s.CLIENTES?.name)
      .map(s => [s.customer_id, { id: s.customer_id, name: s.CLIENTES.name }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const stateOpts = [...new Set(sales.map(s => String(s.CLIENTES?.address?.state || '').trim().toUpperCase()).filter(Boolean))].sort();
    const sourceOpts = [...new Set(sales.map(s => s.source).filter(Boolean))].sort();
    let lineOpts = [];
    try {
      const { data: cats } = await supabase.from('CATEGORIAS').select('name').eq('tenant_id', req.tenantId).limit(200);
      lineOpts = (cats || []).map(c => c.name).filter(Boolean).sort();
    } catch { /* sem categorias */ }

    res.json({
      month,
      fixed_total: r2(custoFixo),
      monthly_units: ov.monthly_units,
      overhead_unit: ov.overhead_unit,
      avg_margin_unit: r2(margemUnit),
      avg_margin_source: cfg.avg_margin_unit != null ? 'manual' : 'auto',
      sheet_count: sheetCount,
      profit_goal: cfg.profit_goal != null ? Number(cfg.profit_goal) : null,
      month_profit: r2(lucroMes),
      month_revenue: r2(receitaMes),
      month_units: unidadesMes,
      month_orders: rows.length,

      // O que é preciso para bater a meta
      necessario: {
        faturamento: r2(fatNecessario),
        unidades: unNecessarias,
        pedidos: pedidosNecessarios,
        margem_contribuicao_pct: Math.round(mcPct * 10) / 10,
        ticket_medio: r2(ticketMedio),
        preco_medio_un: r2(precoMedio),
        lucro_esperado: r2(meta),
        pct_meta_atingida: pctMeta == null ? null : Math.round(pctMeta * 10) / 10,
      },
      // Ritmo e projeção
      ritmo: {
        dias_no_mes: diasNoMes,
        dia_atual: diaAtual,
        dias_restantes: diasRestantes,
        falta_faturar: r2(faltaFaturar),
        meta_diaria: r2(metaDiaria),
        projecao_faturamento: r2(projFaturamento),
        projecao_lucro: r2(projLucro),
        projecao_bate_meta: meta > 0 ? projLucro >= meta : null,
      },
      origens: [
        { label: 'Despesas fixas do mês', origin: 'Despesas Fixas', link: '/rateio/despesas-fixas', detail: 'despesas ativas + folha administrativa' },
        { label: 'Produção e rateio unitário', origin: 'Produção / Metas', link: '/production', detail: 'produção mensal usada no rateio' },
        { label: 'Margem média por unidade', origin: 'Formação de Preço', link: '/pricing/formacao', detail: `média de ${sheetCount} ficha(s): preço − custo` },
        { label: 'Lucro e faturamento atuais', origin: 'Rateio por Pedido', link: '/rateio/pedido', detail: 'vendas do período, líquidas de custos' },
        { label: 'Custos variáveis', origin: 'Despesas Variáveis', link: '/rateio/despesas-variaveis', detail: 'mão de obra, comissão, marketing e extras' },
        { label: 'Impostos', origin: ov.tax_source === 'fiscal' ? 'Fiscal' : 'Precificação', link: '/fiscal', detail: `alíquota de ${String(ov.tax_pct_default).replace('.', ',')}%` },
      ],
      filtros: { sellers: sellerOpts, customers: customerOpts, states: stateOpts, sources: sourceOpts, lines: lineOpts },
      atualizacao: { fichas: sheetAt, calculado_em: new Date().toISOString() },
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

// ── Histórico de Rateios ──────────────────────────────────
// Carrega sozinho: se o mês corrente ainda não tem snapshot, ou se os
// números mudaram, grava uma nova versão antes de devolver a lista.
router.get('/historico', async (req, res) => {
  try {
    await ensureSnapshot(req.tenantId, req.user?.name || req.user?.email || null);
    const cfg = await getConfig(req.tenantId);
    let history = Array.isArray(cfg.rateio_history) ? [...cfg.rateio_history] : [];

    // Filtros de período
    if (/^\d{4}-\d{2}$/.test(req.query.start || '')) history = history.filter(h => h.period >= req.query.start);
    if (/^\d{4}-\d{2}$/.test(req.query.end || '')) history = history.filter(h => h.period <= req.query.end);

    // Centro de custo / categoria: recalcula o período só com o que casa
    const cc = req.query.cost_center, cat = req.query.category;
    if (cc || cat) {
      history = history.map(h => {
        const itens = (h.breakdown?.items || []).filter(i =>
          (!cc || (i.cost_center || 'Sem centro') === cc) &&
          (!cat || (i.category || 'Outros') === cat));
        const total = r2(itens.reduce((s, i) => s + (Number(i.amount) || 0), 0));
        const prod = Number(h.production) || 0;
        return {
          ...h, filtrado: true,
          total,
          per_unit: prod > 0 ? Math.round((total / prod) * 10000) / 10000 : 0,
          breakdown: { ...h.breakdown, items: itens },
        };
      }).filter(h => (h.breakdown?.items || []).length > 0);
    }

    // Só a última versão de cada período, com as anteriores anexadas
    const porPeriodo = new Map();
    for (const h of history) {
      const cur = porPeriodo.get(h.period);
      if (!cur || (Number(h.version) || 1) > (Number(cur.version) || 1)) porPeriodo.set(h.period, h);
    }
    const linhas = [...porPeriodo.values()]
      .sort((a, b) => b.period.localeCompare(a.period))
      .map(h => ({
        ...h,
        versoes: history.filter(x => x.period === h.period)
          .sort((a, b) => (Number(b.version) || 1) - (Number(a.version) || 1))
          .map(x => ({ version: x.version || 1, total: x.total, per_unit: x.per_unit, production: x.production, user_name: x.user_name, created_at: x.created_at, reason: x.reason })),
      }));

    // Alerta de variação relevante no rateio por unidade (>= 10%)
    for (let i = 0; i < linhas.length; i++) {
      const ant = linhas[i + 1];
      if (ant && Number(ant.per_unit) > 0) {
        const varia = ((linhas[i].per_unit - ant.per_unit) / ant.per_unit) * 100;
        linhas[i].variacao_pct = Math.round(varia * 10) / 10;
        linhas[i].alerta = Math.abs(varia) >= 10;
      } else {
        linhas[i].variacao_pct = null; linhas[i].alerta = false;
      }
    }

    // Opções de filtro vindas dos próprios snapshots
    const todosItens = (Array.isArray(cfg.rateio_history) ? cfg.rateio_history : [])
      .flatMap(h => h.breakdown?.items || []);
    const centros = [...new Set(todosItens.map(i => i.cost_center || 'Sem centro'))].sort();
    const categorias = [...new Set(todosItens.map(i => i.category || 'Outros'))].sort();

    res.json({
      historico: linhas,
      filtros: { cost_centers: centros, categories: categorias },
      atualizacao: {
        ultimo_snapshot: linhas[0]?.created_at || null,
        carregado_em: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error('[rateio/historico]', err.message);
    res.status(500).json({ error: 'Erro ao carregar o histórico de rateios' });
  }
});

// POST /rateio/historico/recalcular — grava uma nova versão do período
router.post('/historico/recalcular', async (req, res) => {
  const period = /^\d{4}-\d{2}$/.test(req.body?.period || '')
    ? req.body.period : new Date().toISOString().slice(0, 7);
  try {
    const history = await snapshotRateio(
      req.tenantId, period,
      req.user?.name || req.user?.email || null,
      { reason: 'recalculo' },
    );
    const nova = (history || []).find(h => h.period === period);
    audit(req, 'update', 'rateio_historico', period, { version: nova?.version });
    res.json({ ok: true, period, version: nova?.version || 1, per_unit: nova?.per_unit, total: nova?.total });
  } catch (err) {
    console.error('[rateio/historico/recalcular]', err.message);
    res.status(500).json({ error: 'Erro ao recalcular o rateio' });
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

    // ── Filtros (tudo vem de módulo; nada é digitado)
    let q = supabase.from('VENDAS')
      .select('id, total, status, source, created_at, customer_id, CLIENTES(name, vendedor, address), VENDA_ITENS(product_id, product_name, quantity, total)')
      .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
      .gte('created_at', start).lt('created_at', end).limit(2000);
    if (req.query.customer_id) q = q.eq('customer_id', req.query.customer_id);
    if (req.query.source) q = q.eq('source', req.query.source);
    let { data: sales, error: sErr } = await q;
    if (sErr) { // coluna source pode não existir
      ({ data: sales } = await supabase.from('VENDAS')
        .select('id, total, status, created_at, customer_id, CLIENTES(name, vendedor, address), VENDA_ITENS(product_id, product_name, quantity, total)')
        .eq('tenant_id', req.tenantId).neq('status', 'cancelled')
        .gte('created_at', start).lt('created_at', end).limit(2000));
    }
    sales = sales || [];
    if (req.query.seller) {
      const want = String(req.query.seller).trim().toLowerCase();
      sales = sales.filter(s => String(s.CLIENTES?.vendedor || '').trim().toLowerCase() === want);
    }
    if (req.query.state) {
      const uf = String(req.query.state).trim().toUpperCase();
      sales = sales.filter(s => String(s.CLIENTES?.address?.state || '').trim().toUpperCase() === uf);
    }
    if (req.query.product_id) {
      sales = sales.filter(s => (s.VENDA_ITENS || []).some(i => i.product_id === req.query.product_id));
    }

    // Custo VARIÁVEL do produto (sem overhead — o fixo entra como custo de período)
    const varCosts = await productCostMap(req.tenantId, 0, 0);
    const productIds = [...new Set(sales.flatMap(s => (s.VENDA_ITENS || []).map(i => i.product_id)).filter(Boolean))];
    let priceMap = {}, catMap = {};
    if (productIds.length) {
      const { data } = await supabase.from('PRODUTOS')
        .select('id, cost_price, CATEGORIAS(name)').eq('tenant_id', req.tenantId).in('id', productIds);
      priceMap = Object.fromEntries((data || []).map(p => [p.id, p.cost_price]));
      catMap = Object.fromEntries((data || []).map(p => [p.id, p.CATEGORIAS?.name || 'Sem categoria']));
    }
    const sellers = await sellerPctMap(req.tenantId);
    const defaultCommission = Number(cfg.variable_costs?.commission_pct) || 0;

    const taxPct = Number(ov.tax_pct_default) || 0;
    let receita = 0, custoProduto = 0, qtdVendida = 0, comissaoPedidos = 0;
    const perProduct = new Map();
    // Agrupamentos gerenciais
    const gSeller = new Map(), gCustomer = new Map(), gState = new Map(), gLine = new Map();
    const bump = (map, key, name, patch) => {
      const cur = map.get(key) || { name, receita: 0, custo: 0, qty: 0, pedidos: 0 };
      cur.receita += patch.receita || 0; cur.custo += patch.custo || 0;
      cur.qty += patch.qty || 0; cur.pedidos += patch.pedidos || 0;
      map.set(key, cur);
    };

    for (const s of sales) {
      const rec = Number(s.total) || 0;
      receita += rec;
      let custoPedido = 0, qtyPedido = 0;
      for (const it of (s.VENDA_ITENS || [])) {
        const q = Number(it.quantity) || 0;
        const recItem = Number(it.total) || 0;
        const cUnit = varCosts.get(it.product_id, priceMap[it.product_id]).cost_unit;
        const cost = cUnit * q;
        custoProduto += cost; qtdVendida += q;
        custoPedido += cost; qtyPedido += q;

        const key = it.product_id || it.product_name || '—';
        bump(perProduct, key, it.product_name || '—', { receita: recItem, custo: cost, qty: q });
        // Linha de produto = categoria
        const linha = catMap[it.product_id] || 'Sem categoria';
        bump(gLine, linha, linha, { receita: recItem, custo: cost, qty: q });
      }
      // Comissão do pedido (vendedor do cliente)
      const vend = s.CLIENTES?.vendedor || null;
      const pct = vend ? (sellers[String(vend).trim().toLowerCase()] ?? defaultCommission) : defaultCommission;
      comissaoPedidos += rec * pct / 100;

      bump(gSeller, vend || '—', vend || 'Sem vendedor', { receita: rec, custo: custoPedido, qty: qtyPedido, pedidos: 1 });
      const cliNome = s.CLIENTES?.name || 'Sem cliente';
      bump(gCustomer, s.customer_id || cliNome, cliNome, { receita: rec, custo: custoPedido, qty: qtyPedido, pedidos: 1 });
      const uf = String(s.CLIENTES?.address?.state || '').trim().toUpperCase() || '—';
      bump(gState, uf, uf === '—' ? 'Sem UF' : uf, { receita: rec, custo: custoPedido, qty: qtyPedido, pedidos: 1 });
    }

    const impostos = receita * taxPct / 100;
    const custoFixo = ov.total;               // despesas fixas + folha administrativa
    const maoObraProd = labor.total;          // mão de obra direta (produção)
    // Com filtro ativo a comissão vem dos pedidos filtrados; sem filtro,
    // usa o total do mês já apurado no módulo de variáveis.
    const temFiltro = !!(req.query.seller || req.query.customer_id || req.query.product_id || req.query.state || req.query.source);
    const comissoes = temFiltro ? comissaoPedidos : commissions.total;
    const mktVariavel = marketing.total;      // anúncios (Financeiro)
    const extrasVar = extras.total;           // perdas + frete de venda + outros
    const custoVariavel = custoProduto + impostos + comissoes + maoObraProd + mktVariavel + extrasVar;
    const lucroProjetado = receita - custoVariavel - custoFixo;

    // ── Indicadores gerenciais ──
    // Margem de contribuição = o que sobra da receita depois dos VARIÁVEIS
    const margemContribuicao = receita - custoVariavel;
    const mcPct = receita > 0 ? (margemContribuicao / receita) * 100 : 0;
    // Ponto de equilíbrio: faturamento que zera o resultado
    const pontoEquilibrio = mcPct > 0 ? (custoFixo / (mcPct / 100)) : 0;
    const precoMedio = qtdVendida > 0 ? receita / qtdVendida : 0;
    const peUnidades = precoMedio > 0 && mcPct > 0 ? Math.ceil(pontoEquilibrio / precoMedio) : 0;
    const ticketMedio = sales.length > 0 ? receita / sales.length : 0;

    // Rateia o custo fixo proporcional à receita para dar lucro por grupo
    const fixoSobreReceita = receita > 0 ? custoFixo / receita : 0;
    // Custos variáveis que não estão no custo do produto (rateados por receita)
    const varIndiretos = impostos + comissoes + maoObraProd + mktVariavel + extrasVar;
    const varSobreReceita = receita > 0 ? varIndiretos / receita : 0;
    const grupo = map => [...map.values()].map(g => {
      const custoTotal = g.custo + g.receita * (varSobreReceita + fixoSobreReceita);
      const lucro = g.receita - custoTotal;
      return {
        name: g.name, receita: r2(g.receita), qty: g.qty, pedidos: g.pedidos,
        custo: r2(custoTotal), lucro: r2(lucro),
        margem_pct: g.receita > 0 ? Math.round((lucro / g.receita) * 1000) / 10 : 0,
        ticket_medio: g.pedidos > 0 ? r2(g.receita / g.pedidos) : null,
      };
    }).sort((a, b) => b.lucro - a.lucro);

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

    // ── Opções dos filtros e data de atualização
    const { data: sellersRaw } = await supabase.from('CLIENTES')
      .select('vendedor').eq('tenant_id', req.tenantId).not('vendedor', 'is', null).limit(2000);
    const sellerOpts = [...new Set((sellersRaw || []).map(c => String(c.vendedor).trim()).filter(Boolean))].sort();
    const customerOpts = [...new Map(sales.filter(s => s.customer_id && s.CLIENTES?.name)
      .map(s => [s.customer_id, { id: s.customer_id, name: s.CLIENTES.name }])).values()]
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    const stateOpts = [...new Set(sales.map(s => String(s.CLIENTES?.address?.state || '').trim().toUpperCase()).filter(Boolean))].sort();
    const sourceOpts = [...new Set(sales.map(s => s.source).filter(Boolean))].sort();

    let sheetAt = null;
    try {
      const { data: sh } = await supabase.from('PRECIFICACOES').select('updated_at')
        .eq('tenant_id', req.tenantId).eq('is_active', true)
        .order('updated_at', { ascending: false }).limit(1).maybeSingle();
      sheetAt = sh?.updated_at || null;
    } catch { /* sem fichas */ }

    res.json({
      month,
      faturamento: r2(receita),
      quantidade: qtdVendida,
      pedidos: sales.length,
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

      // Indicadores gerenciais
      indicadores: {
        margem_contribuicao: r2(margemContribuicao),
        margem_contribuicao_pct: Math.round(mcPct * 10) / 10,
        ponto_equilibrio: r2(pontoEquilibrio),
        ponto_equilibrio_un: peUnidades,
        atingiu_equilibrio: receita >= pontoEquilibrio && pontoEquilibrio > 0,
        ticket_medio: r2(ticketMedio),
        preco_medio_un: r2(precoMedio),
      },
      // Lucro por dimensão
      por_vendedor: grupo(gSeller),
      por_cliente: grupo(gCustomer).slice(0, 20),
      por_regiao: grupo(gState),
      por_linha: grupo(gLine),

      // Origem de cada dado (nada é digitado nesta tela)
      origens: [
        { label: 'Faturamento', origin: 'Vendas', link: '/sales', detail: 'pedidos não cancelados do período' },
        { label: 'Custo dos produtos', origin: 'Formação de Preço', link: '/pricing/formacao', detail: 'ficha do produto (ou custo do cadastro)' },
        { label: 'Custo fixo', origin: 'Despesas Fixas', link: '/rateio/despesas-fixas', detail: 'despesas ativas + folha administrativa' },
        { label: 'Mão de obra / marketing / extras', origin: 'Despesas Variáveis', link: '/rateio/despesas-variaveis', detail: 'apurados nos módulos de origem' },
        { label: 'Comissões', origin: 'RH', link: '/employees', detail: '% do vendedor sobre as vendas' },
        { label: 'Impostos', origin: ov.tax_source === 'fiscal' ? 'Fiscal' : 'Precificação', link: '/fiscal', detail: `alíquota de ${String(taxPct).replace('.', ',')}%` },
        { label: 'Região / canal', origin: 'Cadastro de Clientes e Vendas', link: '/customers', detail: 'UF do cliente e origem do pedido' },
      ],
      filtros: { sellers: sellerOpts, customers: customerOpts, states: stateOpts, sources: sourceOpts },
      atualizacao: { fichas: sheetAt, calculado_em: new Date().toISOString() },
    });
  } catch (err) {
    console.error('[rateio/rentabilidade]', err.message);
    res.status(500).json({ error: 'Erro ao calcular a rentabilidade' });
  }
});

// POST /rateio/rentabilidade/recalcular
// Reprocessa TODAS as fichas ativas com o rateio atual. Não digita nada:
// só reaplica o cálculo sobre o que já está cadastrado.
router.post('/rentabilidade/recalcular', async (req, res) => {
  try {
    const ov = await fixedOverview(req.tenantId);
    const { data: sheets } = await supabase.from('PRECIFICACOES')
      .select('*').eq('tenant_id', req.tenantId).eq('is_active', true).limit(1000);

    let atualizadas = 0;
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
    audit(req, 'update', 'rentabilidade_recalculo', req.tenantId, { fichas: atualizadas });
    res.json({ ok: true, fichas_atualizadas: atualizadas, overhead_unit: ov.overhead_unit, calculado_em: new Date().toISOString() });
  } catch (err) {
    console.error('[rateio/rentabilidade/recalcular]', err.message);
    res.status(500).json({ error: 'Erro ao recalcular a rentabilidade' });
  }
});

module.exports = router;
