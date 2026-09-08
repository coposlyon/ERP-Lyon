const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const P = require('../lib/preco');

// Precificação: calcula o custo REAL de cada produto (custo direto +
// rateio das despesas fixas + percentuais de venda) e sugere o preço
// que entrega a margem desejada.
//
// Fórmula (markup divisor):
//   preço = custo_total / (1 - (impostos% + cartão% + comissão% + frete% + margem%) / 100)

// Config, rateio e cálculo ficam em lib/rateioLib (compartilhado com /rateio)
const {
  getConfig, saveConfig, autoMonthlyUnits, fixedExpenses,
  fixedOverview, computeSheet,
} = require('../lib/rateioLib');

// Total mensal das despesas fixas ativas (0 se a migração 040 não rodou)
async function fixedMonthlyTotal(tenantId) {
  const items = await fixedExpenses(tenantId);
  return items.reduce((s, f) => s + (Number(f.amount) || 0), 0);
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
    if (req.body.tax_regime !== undefined) {
      const r = String(req.body.tax_regime || 'simples').slice(0, 40);
      clean.tax_regime = r;
    }
    if (req.body.rateio_method !== undefined) {
      clean.rateio_method = req.body.rateio_method === 'vendas' ? 'vendas' : 'producao';
    }
    // soma dos percentuais precisa deixar espaço no divisor
    const cur = await getConfig(req.tenantId);
    const merged = { ...cur, ...clean };
    const soma = ['margin_pct', 'tax_pct', 'card_fee_pct', 'commission_pct', 'freight_pct']
      .reduce((s, k) => s + (Number(merged[k]) || 0), 0);
    if (soma >= 100) return res.status(400).json({ error: 'A soma de margem + percentuais precisa ser menor que 100%' });

    const saved = await saveConfig(req.tenantId, clean);
    audit(req, 'update', 'pricing_config', req.tenantId, clean);
    res.json(saved);
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
//
// ESTA É A ÚNICA ROTA QUE GRAVA PREÇO DE VENDA no sistema. O cadastro
// de produto, a edição em massa e o ajuste de vitrine mostram o preço
// e mandam para cá — quatro telas gravando o mesmo campo era o que
// fazia o cadastro dizer R$ 2,11 e o pedido puxar outro número.
// A conta e o registro moram em lib/preco.js.
router.put('/products/:id', async (req, res) => {
  try {
    const r = await P.definirPreco(req, req.params.id, req.body.sale_price);
    if (r.erro) return res.status(r.http || 400).json({ error: r.erro });
    res.json(r.produto);
  } catch (err) {
    console.error('[pricing/apply]', err.message);
    res.status(500).json({ error: 'Erro ao aplicar preço' });
  }
});

// ════════════════════════════════════════════════════════════
// FORMAÇÃO DE PREÇO (fichas de precificação) — migração 042
// ════════════════════════════════════════════════════════════

const missing042 = err => /PRECIFICACOES|does not exist|42P01|42703|schema cache/i.test(err?.message || '');
const err042 = res => res.status(400).json({
  error: 'Rode a migração 042_precificacao.sql no Supabase (SQL Editor) para usar a Formação de Preço.',
});

// Somente as colunas calculadas que existem na tabela PRECIFICACOES
const computedCols = c => ({
  cost_direct: c.cost_direct, cost_subtotal: c.cost_subtotal, cost_unit: c.cost_unit,
  price_min: c.price_min, price_ideal: c.price_ideal, price_premium: c.price_premium,
});

// Resumo dos custos fixos p/ a faixa "CUSTOS FIXOS MENSAIS" e o Rateio
router.get('/fixed-summary', async (req, res) => {
  try {
    res.json(await fixedOverview(req.tenantId));
  } catch (err) {
    console.error('[pricing/fixed-summary]', err.message);
    res.status(500).json({ error: 'Erro ao carregar os custos fixos' });
  }
});

// Integração com COMPRAS: última compra do produto → matéria-prima e frete
router.get('/purchase-info/:productId', async (req, res) => {
  try {
    const { data: item, error } = await supabase
      .from('COMPRA_ITENS')
      .select('quantity, unit_price, created_at, COMPRAS!inner(id, number, created_at, status, tenant_id, freight, subtotal, FORNECEDORES(name))')
      .eq('product_id', req.params.productId)
      .eq('COMPRAS.tenant_id', req.tenantId)
      .neq('COMPRAS.status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!item) return res.json({ found: false });

    const compra = item.COMPRAS || {};
    // Quantidade total da compra (para ratear o frete entre todos os itens)
    let totalQty = Number(item.quantity) || 0;
    try {
      const { data: allItems } = await supabase.from('COMPRA_ITENS')
        .select('quantity').eq('purchase_id', compra.id);
      totalQty = (allItems || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0) || totalQty;
    } catch { /* mantém a qty do item */ }

    res.json({
      found: true,
      unit_price: Number(item.unit_price) || 0,
      quantity: Number(item.quantity) || 0,
      purchase_number: compra.number,
      purchase_date: compra.created_at,
      supplier_name: compra.FORNECEDORES?.name || '',
      freight: Number(compra.freight) || 0,
      purchase_total_qty: totalQty,
    });
  } catch (err) {
    // coluna freight pode não existir (migração 042 pendente) → tenta sem ela
    if (/freight/i.test(err.message || '')) {
      try {
        const { data: item } = await supabase
          .from('COMPRA_ITENS')
          .select('quantity, unit_price, created_at, COMPRAS!inner(id, number, created_at, status, tenant_id, FORNECEDORES(name))')
          .eq('product_id', req.params.productId)
          .eq('COMPRAS.tenant_id', req.tenantId)
          .neq('COMPRAS.status', 'cancelled')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!item) return res.json({ found: false });
        return res.json({
          found: true,
          unit_price: Number(item.unit_price) || 0,
          quantity: Number(item.quantity) || 0,
          purchase_number: item.COMPRAS?.number,
          purchase_date: item.COMPRAS?.created_at,
          supplier_name: item.COMPRAS?.FORNECEDORES?.name || '',
          freight: 0,
          purchase_total_qty: Number(item.quantity) || 0,
        });
      } catch (e2) { console.error('[pricing/purchase-info]', e2.message); }
    }
    console.error('[pricing/purchase-info]', err.message);
    res.status(500).json({ error: 'Erro ao buscar a última compra do produto' });
  }
});

// ── Fichas: CRUD ──────────────────────────────────────────
const SHEET_FIELDS = [
  'product_id', 'category_id', 'name', 'category', 'capacity', 'color_model', 'print_type',
  'print_colors', 'calc_quantity', 'calc_reference', 'description', 'blocks',
  'tax_regime', 'tax_pct', 'tax_notes',
  'margin_min_pct', 'margin_ideal_pct', 'margin_premium_pct', 'is_master',
];

function pickSheetBody(body) {
  const out = {};
  for (const k of SHEET_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (out.is_master !== undefined) out.is_master = !!out.is_master;
  if (out.category_id === '') out.category_id = null;
  if (out.name !== undefined) out.name = String(out.name || '').trim();
  if (out.calc_quantity !== undefined) out.calc_quantity = Math.max(1, parseInt(out.calc_quantity) || 1);
  if (out.print_colors !== undefined) out.print_colors = Math.min(Math.max(parseInt(out.print_colors) || 1, 0), 8);
  for (const k of ['tax_pct', 'margin_min_pct', 'margin_ideal_pct', 'margin_premium_pct']) {
    if (out[k] !== undefined) {
      const v = Number(out[k]);
      out[k] = Number.isFinite(v) ? Math.min(Math.max(v, 0), 95) : 0;
    }
  }
  if (out.product_id === '') out.product_id = null;
  return out;
}

// ============================================================
// O PREÇO É DA CATEGORIA, NÃO DO ITEM.
//
// A ficha de Formação de Preço nasceu por PRODUTO: uma ficha para cada
// copo. Só que os 35 twisters tradicionais têm o mesmo copo cru, a mesma
// tela, a mesma tinta e a mesma caixa — muda a cor, que não muda custo.
// Precificar um por um é fazer 35 vezes a mesma conta e conseguir 35
// respostas ligeiramente diferentes, que é o começo de um catálogo em
// que o mesmo copo custa R$ 1,08 numa cor e R$ 1,12 na outra.
//
// A ficha passa a ser da CATEGORIA. Uma conta, um preço, e o preço vale
// para todos os produtos dela.
//
// APLICAR CONTINUA SENDO UM CLIQUE, e não uma consequência de salvar.
// Salvar a ficha guarda a conta; aplicar mexe no preço de venda de
// dezenas de produtos ao mesmo tempo, e isso é decisão de gente. É a
// mesma regra que já vale no rateio: o sistema calcula e sugere, quem
// muda o preço é quem responde por ele.
// ============================================================

/**
 * As categorias, com quantos produtos têm e por quanto vendem hoje.
 *
 * O de/para é o que responde "essa mudança é grande?" antes de ela
 * acontecer. Uma categoria que vende a R$ 1,05 e vai para R$ 1,08 é
 * ajuste; a que vai para R$ 3,00 é outra conversa, e quem clica tem de
 * ver isso na tela.
 */
router.get('/categorias', async (req, res) => {
  try {
    const [{ data: cats, error: e1 }, { data: prods, error: e2 }] = await Promise.all([
      supabase.from('CATEGORIAS').select('id, name').eq('tenant_id', req.tenantId).order('name'),
      supabase.from('PRODUTOS')
        .select('id, category_id, sale_price, cost_price, is_active, price_tiers, min_order_qty')
        .eq('tenant_id', req.tenantId).eq('is_active', true).limit(5000),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;

    const porCat = new Map();
    for (const p of prods || []) {
      if (!p.category_id) continue;
      if (!porCat.has(p.category_id)) porCat.set(p.category_id, []);
      porCat.get(p.category_id).push(p);
    }

    const media = xs => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
    const r2 = v => Math.round(v * 100) / 100;

    // Categoria sem produto não entra: não há a quem aplicar o preço, e
    // escolhê-la só levaria a uma conta que não vale para ninguém.
    const comProduto = (cats || []).filter(c => (porCat.get(c.id) || []).length > 0);

    res.json(comProduto.map(c => {
      const lista = porCat.get(c.id) || [];
      const precos = lista.map(p => Number(p.sale_price) || 0).filter(v => v > 0);
      const custos = lista.map(p => Number(p.cost_price) || 0).filter(v => v > 0);
      return {
        id: c.id, name: c.name,
        produtos: lista.length,
        // QUANTOS TÊM PREÇO, e não só a média dos que têm. A média
        // ignora o zero — então uma categoria com um produto a R$ 4,53
        // e nove zerados aparecia como "hoje R$ 4,53", que descreve um
        // décimo da categoria e esconde justamente o que precisa de
        // preço.
        com_preco: precos.length,
        preco_medio: r2(media(precos)),
        preco_min: precos.length ? r2(Math.min(...precos)) : 0,
        preco_max: precos.length ? r2(Math.max(...precos)) : 0,
        // O custo do cadastro é um bom chute inicial para a matéria-prima:
        // é o que se paga pelo copo cru. A tela oferece, não impõe.
        custo_medio: r2(media(custos)),
        // AS FAIXAS QUE JÁ VALEM HOJE — o ponto de partida do bloco de
        // desconto por volume na ficha. Elas foram escritas antes, na
        // tela do modelo, e recomeçar do zero faria a ficha apagar sem
        // querer o que já estava no ar.
        //
        // `divergem` é a verdade quando os produtos da categoria não
        // concordam entre si: mostrar uma das listas calado seria
        // esconder que as outras existem.
        ...(() => {
          const listas = lista.map(p => JSON.stringify(p.price_tiers || []));
          const minimos = lista.map(p => Number(p.min_order_qty) || 0).filter(v => v > 0);
          return {
            faixas: lista.find(p => (p.price_tiers || []).length)?.price_tiers || [],
            faixas_divergem: new Set(listas).size > 1,
            min_pedido: minimos.length ? Math.max(...minimos) : 0,
          };
        })(),
      };
    }));
  } catch (err) {
    console.error('[pricing/categorias]', err.message);
    res.status(500).json({ error: 'Erro ao listar as categorias' });
  }
});

/**
 * Põe o preço calculado em todos os produtos da categoria.
 *
 * `simular: true` NÃO GRAVA — devolve exatamente o que gravaria. É o que
 * a tela usa para mostrar "35 produtos, de R$ 1,05 para R$ 1,08" antes
 * de alguém confirmar. Sem isso, a única forma de saber o tamanho da
 * mudança é fazê-la.
 */
/**
 * AS FAIXAS DE QUANTIDADE, ARRUMADAS PELO SERVIDOR.
 *
 * A tela pergunta duas coisas por linha — "a partir de quantos" e "por
 * quanto" — e o FIM de cada faixa é calculado do começo da seguinte.
 * Pedir as duas pontas à mão é como nascem faixas que se sobrepõem
 * (100–200 e 150–300) e um preço que depende da ordem em que as linhas
 * foram lidas.
 *
 * Duas faixas começando na mesma quantidade é recusa, e não "a última
 * vence": são dois preços para o mesmo pedido, e escolher um calado é
 * escolher errado metade das vezes.
 *
 * Lista vazia é uma ordem legítima — significa TIRAR as faixas e voltar
 * a vender tudo pelo preço de tabela.
 */
function normalizarFaixas(lista) {
  const limpas = (Array.isArray(lista) ? lista : [])
    .map(t => ({
      min: parseInt(t?.min_qty ?? t?.min, 10),
      price: Number(String(t?.price ?? '').toString().replace(',', '.')),
    }))
    .filter(t => Number.isFinite(t.min) && t.min > 0 && Number.isFinite(t.price) && t.price >= 0)
    .sort((a, b) => a.min - b.min);

  if (new Set(limpas.map(t => t.min)).size !== limpas.length) {
    return { erro: 'Duas faixas começam na mesma quantidade.' };
  }
  return {
    faixas: limpas.map((t, i) => ({
      min_qty: t.min,
      max_qty: i + 1 < limpas.length ? limpas[i + 1].min - 1 : null,
      price: Math.round(t.price * 100) / 100,
    })),
  };
}

/** Duas listas de faixas são a mesma coisa? (ordem já normalizada) */
const mesmasFaixas = (a, b) => JSON.stringify(a || []) === JSON.stringify(b || []);

router.post('/aplicar-categoria', async (req, res) => {
  const categoryId = String(req.body?.category_id || '').trim();
  const preco = Number(req.body?.price);
  const simular = !!req.body?.simular;

  if (!categoryId) return res.status(400).json({ error: 'Escolha a categoria.' });
  if (!Number.isFinite(preco) || preco <= 0) {
    return res.status(400).json({ error: 'O preço tem de ser maior que zero.' });
  }

  /**
   * O DESCONTO POR VOLUME VEM JUNTO — quando a tela mandar.
   *
   * Ele morava na tela do modelo do produto, e ali era outra conta em
   * outro lugar: o preço de tabela saía daqui, e o "de 100 para cima
   * sai a tanto" saía de lá, sem nenhuma das duas telas saber da outra.
   * Preço é uma pergunta só — e por isso as faixas passaram a ser
   * escritas na mesma ficha, e aplicadas no mesmo clique.
   *
   * `undefined` significa "não mexa nas faixas" (chamada antiga, ou
   * quem só quer trocar o preço de tabela). Lista vazia significa
   * "tire as faixas". Os dois casos existem, e são diferentes.
   */
  const mexeFaixa = req.body?.price_tiers !== undefined;
  const { faixas, erro: erroFaixa } = mexeFaixa
    ? normalizarFaixas(req.body.price_tiers)
    : { faixas: null };
  if (erroFaixa) return res.status(400).json({ error: erroFaixa });

  const minimo = req.body?.min_order_qty === undefined
    ? null
    : Math.max(1, parseInt(req.body.min_order_qty, 10) || 1);

  // Faixa que começa abaixo do mínimo do pedido nunca é alcançada: o
  // catálogo já sobe a quantidade para o mínimo antes de procurar a
  // faixa. Recusar aqui é mais honesto que gravar uma linha morta.
  if (faixas?.length && minimo && faixas[0].min_qty < minimo) {
    return res.status(400).json({
      error: `A primeira faixa começa em ${faixas[0].min_qty} un, abaixo do mínimo do pedido (${minimo} un).`,
    });
  }

  try {
    const { data: cat } = await supabase.from('CATEGORIAS')
      .select('id, name').eq('id', categoryId).eq('tenant_id', req.tenantId).maybeSingle();
    if (!cat) return res.status(404).json({ error: 'Categoria não encontrada.' });

    const { data: prods, error } = await supabase.from('PRODUTOS')
      .select('id, code, name, sale_price, price_tiers, min_order_qty')
      .eq('tenant_id', req.tenantId).eq('category_id', categoryId).eq('is_active', true)
      .order('name').limit(5000);
    if (error) throw error;

    const novo = Math.round(preco * 100) / 100;
    const alvo = (prods || []).map(p => ({
      id: p.id, code: p.code, name: p.name,
      de: Math.round((Number(p.sale_price) || 0) * 100) / 100,
      para: novo,
      faixa_muda: mexeFaixa && !mesmasFaixas(p.price_tiers, faixas),
      minimo_muda: minimo != null && (Number(p.min_order_qty) || 0) !== minimo,
    }));
    // Produto que já está no preço não entra na conta do que muda: dizer
    // "35 produtos alterados" quando 12 ficaram iguais é inflar o
    // resultado de um botão que mexe em preço.
    const mudam = alvo.filter(x => x.de !== x.para);
    const mudamFaixa = alvo.filter(x => x.faixa_muda || x.minimo_muda);
    // O que faz o botão valer a pena apertar: preço OU faixa.
    const mexeEmAlgo = mudam.length > 0 || mudamFaixa.length > 0;

    const resumoFaixa = {
      faixas: faixas || null,
      min_order_qty: minimo,
      faixas_alteradas: mudamFaixa.length,
    };

    if (simular) {
      return res.json({
        simulado: true, categoria: cat.name,
        produtos: alvo.length, alterados: mudam.length,
        preco: novo, itens: mudam.slice(0, 200),
        ...resumoFaixa,
      });
    }

    if (!mexeEmAlgo) {
      return res.json({
        ok: true, categoria: cat.name, produtos: alvo.length, alterados: 0, preco: novo, ...resumoFaixa,
      });
    }

    // UM UPDATE PARA TODOS, e não um por produto: são dezenas de
    // linhas, e o meio do caminho de um laço que falha deixa metade da
    // categoria num preço e metade no outro.
    const patch = { sale_price: novo, updated_at: new Date().toISOString() };
    if (mexeFaixa) patch.price_tiers = faixas;
    if (minimo != null) patch.min_order_qty = minimo;

    const { error: erroUp } = await supabase.from('PRODUTOS')
      .update(patch)
      .eq('tenant_id', req.tenantId).eq('category_id', categoryId).eq('is_active', true);
    if (erroUp) throw erroUp;

    audit(req, 'update', 'product', categoryId, {
      preco_por_categoria: cat.name, preco: novo,
      produtos: alvo.length, alterados: mudam.length,
      de_ate: mudam.length ? [Math.min(...mudam.map(x => x.de)), Math.max(...mudam.map(x => x.de))] : null,
      faixas: mexeFaixa ? faixas : undefined,
      faixas_alteradas: mexeFaixa ? mudamFaixa.length : undefined,
      min_order_qty: minimo ?? undefined,
    });

    res.json({
      ok: true, categoria: cat.name, produtos: alvo.length,
      alterados: mudam.length, preco: novo, ...resumoFaixa,
    });
  } catch (err) {
    console.error('[pricing/aplicar-categoria]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Tabelas mestre (fichas marcadas como is_master) — usado pelo seletor
// "Tabela de Precificação" no cadastro de produto. Só id + nome.
router.get('/tables', async (req, res) => {
  try {
    const { data, error } = await supabase.from('PRECIFICACOES')
      .select('id, name, capacity, category, category_id')
      .eq('tenant_id', req.tenantId).eq('is_active', true).eq('is_master', true)
      .order('name').limit(500);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    // coluna is_master ausente (migração 057 pendente) → lista vazia, não quebra
    if (missing042(err) || /is_master/i.test(err.message || '')) return res.json([]);
    console.error('[pricing/tables]', err.message);
    res.status(500).json({ error: 'Erro ao listar as tabelas de precificação' });
  }
});

router.get('/sheets', async (req, res) => {
  const { search, include_inactive } = req.query;
  try {
    let q = supabase.from('PRECIFICACOES')
      .select('*, PRODUTOS(id, name, sale_price)')
      .eq('tenant_id', req.tenantId)
      .order('updated_at', { ascending: false })
      .limit(500);
    if (include_inactive !== '1') q = q.eq('is_active', true);
    if (search) {
      const s = String(search).replace(/[%,()]/g, ' ').trim();
      if (s) q = q.or(`name.ilike.%${s}%,category.ilike.%${s}%`);
    }
    const { data, error } = await q;
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    if (missing042(err)) return err042(res);
    console.error('[pricing/sheets]', err.message);
    res.status(500).json({ error: 'Erro ao listar as fichas de precificação' });
  }
});

router.get('/sheets/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('PRECIFICACOES')
      .select('*, PRODUTOS(id, name, sale_price)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Ficha não encontrada' });
    res.json(data);
  } catch (err) {
    if (missing042(err)) return err042(res);
    console.error('[pricing/sheets/:id]', err.message);
    res.status(500).json({ error: 'Erro ao carregar a ficha' });
  }
});

router.post('/sheets', async (req, res) => {
  const body = pickSheetBody(req.body);
  if (!body.name) return res.status(400).json({ error: 'Informe o nome do produto' });
  try {
    const fixed = await fixedOverview(req.tenantId);
    const sheet = { ...body, overhead_unit: fixed.overhead_unit };
    const computed = computedCols(computeSheet(sheet));
    const { data, error } = await supabase.from('PRECIFICACOES').insert({
      ...sheet, ...computed,
      tenant_id: req.tenantId, user_id: req.userId || req.user?.id || null,
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'pricing_sheet', data.id, { name: data.name, cost_unit: data.cost_unit, price_ideal: data.price_ideal });
    res.status(201).json(data);
  } catch (err) {
    if (missing042(err)) return err042(res);
    console.error('[pricing/sheets POST]', err.message);
    res.status(500).json({ error: 'Erro ao salvar a ficha de precificação' });
  }
});

router.put('/sheets/:id', async (req, res) => {
  const body = pickSheetBody(req.body);
  if (body.name !== undefined && !body.name) return res.status(400).json({ error: 'Informe o nome do produto' });
  try {
    const { data: cur, error: e1 } = await supabase.from('PRECIFICACOES')
      .select('*').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (e1) throw e1;
    if (!cur) return res.status(404).json({ error: 'Ficha não encontrada' });

    const fixed = await fixedOverview(req.tenantId);
    const merged = { ...cur, ...body, overhead_unit: fixed.overhead_unit };
    const computed = computedCols(computeSheet(merged));
    const { data, error } = await supabase.from('PRECIFICACOES')
      .update({ ...body, overhead_unit: fixed.overhead_unit, ...computed, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select().single();
    if (error) throw error;
    audit(req, 'update', 'pricing_sheet', data.id, { name: data.name, cost_unit: data.cost_unit, price_ideal: data.price_ideal });
    res.json(data);
  } catch (err) {
    if (missing042(err)) return err042(res);
    console.error('[pricing/sheets PUT]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar a ficha' });
  }
});

router.delete('/sheets/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('PRECIFICACOES')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, name').single();
    if (error) throw error;
    audit(req, 'delete', 'pricing_sheet', data.id, { name: data.name });
    res.json({ success: true });
  } catch (err) {
    if (missing042(err)) return err042(res);
    console.error('[pricing/sheets DELETE]', err.message);
    res.status(500).json({ error: 'Erro ao excluir a ficha' });
  }
});

// ── Relatório: custo/lucro/margem por ficha (ranking) ─────
router.get('/report', async (req, res) => {
  try {
    const [{ data, error }, fixed] = await Promise.all([
      supabase.from('PRECIFICACOES')
        .select('id, name, category, capacity, print_type, calc_quantity, tax_pct, margin_ideal_pct, cost_direct, cost_subtotal, cost_unit, overhead_unit, price_min, price_ideal, price_premium, updated_at, PRODUTOS(id, name, sale_price)')
        .eq('tenant_id', req.tenantId).eq('is_active', true)
        .order('updated_at', { ascending: false }).limit(1000),
      fixedOverview(req.tenantId),
    ]);
    if (error) throw error;

    const rows = (data || []).map(s => {
      const salePrice = Number(s.PRODUTOS?.sale_price) || 0;
      const priceUsed = salePrice > 0 ? salePrice : Number(s.price_ideal) || 0;
      const lucroUnit = priceUsed - (Number(s.cost_unit) || 0);
      const margem = priceUsed > 0 ? (lucroUnit / priceUsed) * 100 : 0;
      return {
        ...s,
        product_name: s.PRODUTOS?.name || null,
        sale_price: salePrice || null,
        price_used: Math.round(priceUsed * 100) / 100,
        price_source: salePrice > 0 ? 'cadastro' : 'ideal',
        lucro_unit: Math.round(lucroUnit * 100) / 100,
        margem_pct: Math.round(margem * 10) / 10,
      };
    });
    res.json({ fixed, sheets: rows });
  } catch (err) {
    if (missing042(err)) return err042(res);
    console.error('[pricing/report]', err.message);
    res.status(500).json({ error: 'Erro ao gerar o relatório de precificação' });
  }
});

module.exports = router;
