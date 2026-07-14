const express  = require('express');
const router   = express.Router();
const rateLimit = require('express-rate-limit');
const supabase = require('../config/supabase');
const { precoFaixa, precoComImpressao, PRINT_METHODS } = require('../lib/calc');
const { uploadDataUrl } = require('../lib/storage');
const { calcularFrete, packItem } = require('../lib/frete');
const { cotar, ufFromCep, getFreteConfig, jtCotar, jtReady } = require('../lib/shipping');
const { braspressCotar, bpReady } = require('../lib/braspress');
const { fetchInstagramMedia } = require('../lib/social');

// Loja pública: serve UM tenant (a empresa dona da loja).
// Sem autenticação — montada antes do authMiddleware.
const STORE_TENANT = process.env.STORE_TENANT_ID || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// Erros internos não expõem detalhes do banco em rotas públicas
function fail(res, err, where) {
  console.error(`[public-store${where ? ':' + where : ''}]`, err.message || err);
  res.status(500).json({ error: 'Erro interno. Tente novamente em instantes.' });
}

// Limites por IP: rotas de identidade (CPF), cadastros e IA são alvo de
// enumeração/spam/abuso de custo — o limite global de 500/15min é frouxo demais.
const identityLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 30,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});
const cadastroLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 20,
  message: { error: 'Muitos cadastros em sequência. Aguarde um pouco e tente de novo.' },
});
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, max: 10,
  message: { error: 'Limite de sugestões de IA atingido. Tente novamente mais tarde.' },
});

// preço "a partir de": menor entre sale_price e as faixas
function fromPrice(p) {
  const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
  const prices = [Number(p.sale_price) || 0, ...tiers.map(t => Number(t.price) || 0)].filter(v => v > 0);
  return prices.length ? Math.min(...prices) : Number(p.sale_price) || 0;
}

// 1ª foto disponível de um produto: principal, por cor, ou por variação
const firstImg = p => p.image_url
  || (p.variation_images && typeof p.variation_images === 'object' && Object.values(p.variation_images).find(Boolean))
  || (p.variations?.images && typeof p.variations.images === 'object' && Object.values(p.variations.images).find(Boolean))
  || null;

// Produtos "com borda" não têm campo estruturado — tipo, cor do copo e cor da
// borda vivem no NOME. Ex.:
//  "LONG DRINK TRADICIONAL - AMARELO CANÁRIO - BORDA HOLOGRÁFICA DOURADO - 350 ML"
//   → { type:'LONG DRINK TRADICIONAL', cup:'AMARELO CANÁRIO',
//       border:'BORDA HOLOGRÁFICA DOURADO', volume:'350 ML' }
// Validado nos 364 produtos com borda da loja (0 falhas de parse).
function parseBorda(rawName) {
  const name = String(rawName || '').trim();
  if (!/\bBORDA\b/i.test(name)) return null;
  const vm = name.match(/(\d{2,4})\s*ML/i);
  const volume = vm ? `${vm[1]} ML` : null;
  const n = name.replace(/\s*[-–]?\s*\d{2,4}\s*ML/i, '').trim();
  const parts = n.split(/\s+-\s+/).map(x => x.trim()).filter(Boolean);
  const type = parts[0] || n;
  const bi = parts.findIndex(p => /^BORDA\b/i.test(p));
  let border, cup;
  if (bi >= 0) { border = parts.slice(bi).join(' - '); cup = parts.slice(1, bi).join(' - '); }
  else {
    const m = n.match(/^(.*?)\bBORDA\b(.*)$/i);
    border = ('BORDA ' + (m ? m[2] : '')).trim();
    cup = (m ? m[1] : '').replace(type, '').replace(/^\s*-\s*/, '').trim();
  }
  border = border.toUpperCase().replace(/\s+/g, ' ').trim();
  if (!type || !cup || !border) return null;
  return { type, cup, border, volume };
}
const bordaKey = (type, border) => `${type} :: ${border}`;

// Carrega os produtos visíveis da loja (com fallback p/ colunas novas ausentes)
async function loadVisibleProducts() {
  const sel = full => `id, name, code, unit, description, sale_price, price_tiers${full ? ', min_order_qty, store_group, store_color, variations, image_url, variation_images, show_in_store' : ''}, category_id, CATEGORIAS(name)`;
  const build = full => supabase.from('PRODUTOS').select(sel(full))
    .eq('tenant_id', STORE_TENANT).eq('is_active', true).order('name').limit(500);
  let { data, error } = await build(true);
  if (error) ({ data, error } = await build(false));
  if (error) throw error;
  return (data || []).filter(p => p.show_in_store !== false);
}

// ── Informações da loja ───────────────────────────────────
router.get('/store', async (req, res) => {
  try {
    const { data: empresa } = await supabase
      .from('EMPRESAS').select('name, phone, email, cnpj, address')
      .eq('id', STORE_TENANT).maybeSingle();
    // Lê settings separadamente — se a coluna ainda não existir, ignora sem quebrar a loja.
    let s = {};
    try {
      const { data: cfg } = await supabase
        .from('EMPRESAS').select('settings').eq('id', STORE_TENANT).maybeSingle();
      s = cfg?.settings || {};
    } catch { s = {}; }
    const onlyDigits = v => String(v || '').replace(/\D/g, '');
    res.json({
      name:  empresa?.name  || 'Nossa Loja',
      phone: empresa?.phone || null,
      email: empresa?.email || null,
      cnpj:  empresa?.cnpj  || null,
      // Modo manutenção dos cadastros: quando ativo, após concluir qualquer
      // cadastro o site mostra só um card pedindo para voltar ao WhatsApp.
      cadastro: {
        maintenance: !!s.cadastro_maintenance,
        whatsapp: onlyDigits(s.cadastro_whatsapp || empresa?.phone) || null,
        message: s.cadastro_message || 'Você concluiu o cadastro! Volte para o WhatsApp.',
      },
      // Textos/opções editáveis do site (Configurações → Site)
      site: s.site || {},
    });
  } catch (err) { fail(res, err); }
});

// ── Feed do Instagram (cache em memória p/ não bater na Graph API toda visita) ──
let igCache = { at: 0, data: null };
const IG_TTL = 10 * 60 * 1000; // 10 min
router.get('/instagram', async (req, res) => {
  try {
    const now = Date.now();
    if (igCache.data && now - igCache.at < IG_TTL) return res.json(igCache.data);
    const out = await fetchInstagramMedia(8);
    const payload = { ok: !!out.ok, username: out.username || null, posts: out.posts || [] };
    // só guarda em cache quando deu certo (erro/temporário não fica preso 10 min)
    if (out.ok) igCache = { at: now, data: payload };
    res.json(payload);
  } catch (err) {
    console.error('[public-store:instagram]', err.message || err);
    res.json({ ok: false, posts: [] });
  }
});

// ── Categorias com contagem ───────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const { data } = await supabase
      .from('CATEGORIAS').select('id, name')
      .eq('tenant_id', STORE_TENANT).order('name');
    res.json(data || []);
  } catch (err) { fail(res, err); }
});

// ── Tipos de produto (menu do site) com suas categorias ──
// Cada tipo (COPOS, CANECAS...) traz as categorias dos produtos visíveis
// que pertencem a ele — vira o menu superior com dropdown na loja.
router.get('/types', async (req, res) => {
  try {
    const { data: tipos, error: tErr } = await supabase
      .from('TIPOS_PRODUTO').select('id, name')
      .eq('tenant_id', STORE_TENANT).order('name');
    if (tErr) return res.json([]); // tabela ainda não existe → menu some, loja segue

    const { data: prods, error: pErr } = await supabase
      .from('PRODUTOS')
      .select('tipo_id, category_id, show_in_store, CATEGORIAS(id, name)')
      .eq('tenant_id', STORE_TENANT).eq('is_active', true)
      .not('tipo_id', 'is', null);
    if (pErr) return res.json((tipos || []).map(t => ({ ...t, categories: [] })));

    const catsByTipo = new Map();
    for (const p of (prods || [])) {
      if (p.show_in_store === false || !p.tipo_id) continue;
      if (!catsByTipo.has(p.tipo_id)) catsByTipo.set(p.tipo_id, new Map());
      if (p.CATEGORIAS?.id) catsByTipo.get(p.tipo_id).set(p.CATEGORIAS.id, p.CATEGORIAS.name);
    }
    const result = (tipos || []).map(t => ({
      id: t.id, name: t.name,
      categories: [...(catsByTipo.get(t.id) || new Map()).entries()]
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
    })).filter(t => catsByTipo.has(t.id)); // só tipos com produto visível
    res.json(result);
  } catch (err) {
    console.error('[public-store:types]', err.message || err);
    res.json([]);
  }
});

// ── Catálogo ──────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const { search, category, type } = req.query;
  // full=false é o fallback caso colunas novas ainda não existam (migrations 016/021)
  const build = (full) => {
    let q = supabase
      .from('PRODUTOS')
      .select(`id, name, code, unit, description, sale_price, price_tiers${full ? ', min_order_qty, store_group, store_color, variations, image_url, variation_images, show_in_store' : ''}, category_id, CATEGORIAS(name)`)
      .eq('tenant_id', STORE_TENANT)
      .eq('is_active', true)
      .order('name');
    if (category) q = q.eq('category_id', category);
    // filtro por tipo só no modo "full" — se a coluna tipo_id ainda não existe,
    // o fallback ignora o filtro em vez de quebrar a loja
    if (type && full) q = q.eq('tipo_id', type);
    if (search) {
      const s = String(search).replace(/[,()]/g, ' ').trim();
      q = q.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
    }
    return q.limit(500);
  };
  try {
    let { data: products, error } = await build(true);
    if (error) ({ data: products, error } = await build(false));
    if (error) throw error;

    // Só mostra na loja produtos marcados como visíveis (show_in_store).
    // Se a coluna ainda não existe (fallback), products vem sem o campo → mostra todos.
    products = (products || []).filter(p => p.show_in_store !== false);

    // Produtos com borda: colapsam em cards por (tipo + cor da borda), ignorando
    // a cor do copo — 364 cards viram ~54. Os demais seguem o agrupamento normal.
    const bordaProds = [], normalProds = [];
    for (const p of (products || [])) (parseBorda(p.name) ? bordaProds : normalProds).push(p);

    // Agrupa o resto por modelo (store_group). Cada grupo vira 1 card; cores dentro.
    const groups = new Map();
    for (const p of normalProds) {
      const key = (p.store_group && p.store_group.trim()) || p.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const cards = [...groups.entries()].map(([key, items]) => {
      const rep = items[0];
      const prices = items.map(fromPrice).filter(v => v > 0);
      // cores: nº de variações (modelo único) ou nº de produtos-irmãos (modelo antigo)
      const varColors = items.reduce((n, p) => n + ((p.variations?.colors?.length) || 0), 0);
      return {
        id: rep.id, name: key, code: rep.code, unit: rep.unit,
        description: rep.description,
        category: rep.CATEGORIAS?.name || null,
        image_url: items.map(firstImg).find(Boolean) || null,
        from_price: prices.length ? Math.min(...prices) : fromPrice(rep),
        has_tiers: items.some(p => Array.isArray(p.price_tiers) && p.price_tiers.length > 0),
        colors: items.length > 1 ? items.length : varColors,
        min_order_qty: Math.max(...items.map(p => p.min_order_qty || 1)),
      };
    });

    // Cards de borda: 1 por (tipo + cor da borda). Clicar abre as cores de copo.
    const bmap = new Map();
    for (const p of bordaProds) {
      const info = parseBorda(p.name);
      const key = bordaKey(info.type, info.border);
      if (!bmap.has(key)) bmap.set(key, { info, items: [] });
      bmap.get(key).items.push(p);
    }
    for (const { info, items } of bmap.values()) {
      const prices = items.map(fromPrice).filter(v => v > 0);
      const cups = new Set(items.map(p => parseBorda(p.name).cup));
      cards.push({
        kind: 'border',
        id: `borda:${bordaKey(info.type, info.border)}`,
        name: info.border,               // título do card = a cor da borda
        type: info.type, border: info.border,
        category: info.type,             // rótulo pequeno = o tipo do copo
        image_url: items.map(firstImg).find(Boolean) || null,
        from_price: prices.length ? Math.min(...prices) : 0,
        has_tiers: items.some(p => Array.isArray(p.price_tiers) && p.price_tiers.length > 0),
        colors: cups.size,               // nº de cores de copo com essa borda
        min_order_qty: Math.max(...items.map(p => p.min_order_qty || 1)),
      });
    }

    cards.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
    res.json(cards);
  } catch (err) { fail(res, err); }
});

// ── Cores de copo de um grupo de borda (tipo + cor da borda) ──────────
// Precede /products/:id senão o ":id" capturaria "border".
router.get('/products/border', async (req, res) => {
  const type = String(req.query.type || '').trim();
  const border = String(req.query.border || '').trim().toUpperCase().replace(/\s+/g, ' ');
  if (!type || !border) return res.status(400).json({ error: 'Informe o tipo e a cor da borda.' });
  try {
    const products = await loadVisibleProducts();
    const items = products
      .map(p => ({ p, info: parseBorda(p.name) }))
      .filter(({ info }) => info && info.type === type && info.border === border)
      .map(({ p, info }) => ({
        id: p.id, name: p.name,
        cup: info.cup, volume: info.volume,
        image_url: firstImg(p),
        from_price: fromPrice(p),
        has_tiers: Array.isArray(p.price_tiers) && p.price_tiers.length > 0,
      }))
      .sort((a, b) => a.cup.localeCompare(b.cup, 'pt-BR'));
    res.json({ type, border, count: items.length, items });
  } catch (err) { fail(res, err); }
});

// ── Detalhe do produto ────────────────────────────────────
router.get('/products/:id', async (req, res) => {
  const build = (full) => supabase
    .from('PRODUTOS')
    .select(`id, name, code, unit, description, sale_price, price_tiers${full ? ', min_order_qty, print_pricing, store_group, store_color, variations' : ''}, CATEGORIAS(name)`)
    .eq('tenant_id', STORE_TENANT).eq('id', req.params.id).eq('is_active', true)
    .maybeSingle();
  try {
    let { data: p, error } = await build(true);
    if (error) ({ data: p, error } = await build(false));
    if (error) throw error;
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

    // Variações + fotos — busca isolada para não depender das outras colunas novas
    let pvars = { colors: [], borders: [], volumes: [] };
    let imageUrl = null, variationImages = {};
    try {
      let { data: pv, error: pvErr } = await supabase.from('PRODUTOS')
        .select('variations, image_url, variation_images').eq('tenant_id', STORE_TENANT).eq('id', req.params.id).maybeSingle();
      if (pvErr) { // colunas de imagem podem não existir (migration 032) → pega só variations
        ({ data: pv } = await supabase.from('PRODUTOS')
          .select('variations').eq('tenant_id', STORE_TENANT).eq('id', req.params.id).maybeSingle());
      }
      if (pv?.variations && typeof pv.variations === 'object') {
        pvars = {
          colors:  Array.isArray(pv.variations.colors)  ? pv.variations.colors  : [],
          borders: Array.isArray(pv.variations.borders) ? pv.variations.borders : [],
          volumes: Array.isArray(pv.variations.volumes) ? pv.variations.volumes : [],
        };
      }
      imageUrl = pv?.image_url || null;
      if (pv?.variation_images && typeof pv.variation_images === 'object') variationImages = pv.variation_images;
    } catch { /* colunas ainda não existem */ }

    const { data: variants } = await supabase
      .from('VARIANTES_PRODUTO')
      .select('id, name, type, value, extra_price')
      .eq('tenant_id', STORE_TENANT).eq('product_id', p.id)
      .order('name');

    // Cores = outros produtos do mesmo modelo (store_group)
    let colorOptions = [];
    if (p.store_group) {
      const { data: sib } = await supabase
        .from('PRODUTOS')
        .select('id, name, store_color, sale_price, price_tiers')
        .eq('tenant_id', STORE_TENANT).eq('is_active', true).eq('store_group', p.store_group)
        .order('store_color');
      colorOptions = (sib || []).map(s => ({
        id: s.id,
        label: (s.store_color && s.store_color.trim()) || s.name,
        from_price: fromPrice(s),
      }));
    }

    res.json({
      id: p.id, name: p.name, code: p.code, unit: p.unit,
      description: p.description, category: p.CATEGORIAS?.name || null,
      group: p.store_group || null,
      color_label: p.store_color || null,
      color_options: colorOptions,
      variations: pvars,
      image_url: imageUrl,
      variation_images: variationImages,
      sale_price: Number(p.sale_price) || 0,
      price_tiers: Array.isArray(p.price_tiers) ? p.price_tiers : [],
      from_price: fromPrice(p),
      min_order_qty: p.min_order_qty || 1,
      print_pricing: p.print_pricing || {},
      print_methods: PRINT_METHODS,
      variants: variants || [],
    });
  } catch (err) { fail(res, err); }
});

// ── Enviar pedido de orçamento ────────────────────────────
router.post('/quote', async (req, res) => {
  const { customer = {}, items = [], notes, event_date, customer_id, freight } = req.body;
  const name  = (customer.name  || '').trim();
  const phone = (customer.phone || '').trim();
  const email = (customer.email || '').trim();
  const company = (customer.company || '').trim();
  const eventDate = String(event_date || '').trim() || null;

  if (!name || !phone) return res.status(400).json({ error: 'Informe nome e telefone' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrinho vazio' });

  try {
    // Login obrigatório: o pedido só é aceito de um cliente cadastrado/logado.
    if (!customer_id) return res.status(401).json({ error: 'Faça login para finalizar o pedido.', code: 'LOGIN_REQUIRED' });
    {
      const { data: cust } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', STORE_TENANT).eq('id', customer_id).limit(1).maybeSingle();
      if (!cust) return res.status(401).json({ error: 'Sessão inválida. Entre novamente para finalizar o pedido.', code: 'LOGIN_REQUIRED' });
    }

    // Busca produtos do carrinho para recalcular o preço no servidor
    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    const fetchProds = (full) => supabase
      .from('PRODUTOS').select(`id, name, unit, sale_price, price_tiers${full ? ', min_order_qty, print_pricing' : ''}`)
      .eq('tenant_id', STORE_TENANT).in('id', ids);
    let { data: prods, error: pErr } = await fetchProds(true);
    if (pErr) ({ data: prods } = await fetchProds(false));
    const prodMap = Object.fromEntries((prods || []).map(p => [p.id, p]));
    const printLabel = Object.fromEntries(PRINT_METHODS.map(m => [m.key, m.label]));

    const orderItems = [];
    for (const it of items) {
      const p = prodMap[it.product_id];
      // respeita a quantidade mínima do produto (definida no ERP)
      const minQ = Math.max(1, p?.min_order_qty || 1);
      const qty = Math.max(parseInt(it.quantity) || 0, minQ);
      if (!p) {
        orderItems.push({
          product_id: null, product_name: it.product_name || 'Personalizado',
          quantity: qty, unit_price: 0, color: it.color || null,
          design: it.design || null, preview: it.preview || null,
        });
        continue;
      }
      const printMethod = it.print_method || null;
      const unit = precoComImpressao(p, printMethod, qty);
      const printName = printMethod ? printLabel[printMethod] || null : null;
      const border = it.border ? String(it.border).trim() : null;
      const volume = it.volume ? String(it.volume).trim() : null;
      const extra = [it.color, volume, border].filter(Boolean).join(' / ');
      orderItems.push({
        product_id: p.id,
        product_name: p.name + (extra ? ` — ${extra}` : '') + (printName ? ` (${printName})` : ''),
        quantity: qty,
        unit_price: unit,
        color: it.color || null,
        border, volume,
        print_method: printMethod, print_name: printName,
        design: it.design || null, preview: it.preview || null,
      });
    }

    // Cliente (lead): cliente logado → reaproveita por telefone/e-mail → cria novo
    let customerId = null;
    let existing = null;
    if (customer_id) {
      const { data } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', STORE_TENANT).eq('id', customer_id).limit(1).maybeSingle();
      existing = data;
    }
    if (!existing && phone) {
      const { data } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', STORE_TENANT).eq('phone', phone).limit(1).maybeSingle();
      existing = data;
    }
    if (!existing && email) {
      const { data } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', STORE_TENANT).eq('email', email).limit(1).maybeSingle();
      existing = data;
    }
    if (existing) {
      customerId = existing.id;
    } else {
      const { data: novo, error: cErr } = await supabase.from('CLIENTES').insert({
        tenant_id: STORE_TENANT, type: 'PF',
        name: company || name, phone, email: email || null,
        nome_fantasia: company || null,
        is_active: true,
      }).select('id').single();
      if (cErr) throw cErr;
      customerId = novo.id;
    }

    // Número da venda
    let number = null;
    try {
      const { data: numData } = await supabase.rpc('proximo_numero_venda', { p_tenant_id: STORE_TENANT });
      number = numData;
    } catch { /* sem RPC: número fica nulo */ }

    const subtotal = orderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const freightVal = Number(freight) || 0;
    const eventNote = eventDate ? `\nData do evento: ${eventDate.split('-').reverse().join('/')}` : '';
    const fullNotes = `PEDIDO PELO SITE — Contato: ${name} / ${phone}${email ? ' / ' + email : ''}${company ? ' / ' + company : ''}${eventNote}${notes ? `\nObs: ${notes}` : ''}`;

    // Pedido do site → vira VENDA "Aguardando aprovação" (source=site, status=open)
    const baseSale = {
      tenant_id: STORE_TENANT, user_id: null, number,
      customer_id: customerId, subtotal, discount: 0, freight: freightVal, total: subtotal + freightVal,
      notes: fullNotes, status: 'iniciando_pedido',
    };
    const trySale = (extra) => supabase.from('VENDAS').insert({ ...baseSale, ...extra }).select('id, number').single();
    let { data: sale, error: sErr } = await trySale({ source: 'site', event_date: eventDate });
    if (sErr && /(source|event_date)/i.test(sErr.message || '')) {
      ({ data: sale, error: sErr } = await trySale({ source: 'site' }));     // sem event_date
      if (sErr && /source/i.test(sErr.message || '')) ({ data: sale, error: sErr } = await trySale({})); // sem source
    }
    if (sErr) throw sErr;

    // sobe os previews dos itens personalizados para o Storage (não no banco)
    for (const i of orderItems) {
      if (i.preview) i.preview = await uploadDataUrl(i.preview, 'pedidos');
    }

    const saleItems = orderItems.map(i => ({
      sale_id: sale.id, product_id: i.product_id, product_name: i.product_name,
      quantity: i.quantity, unit_price: i.unit_price,
      discount: 0, total: i.quantity * i.unit_price,
      customization: {
        ...(i.color ? { cor: i.color } : {}),
        ...(i.border ? { borda: i.border } : {}),
        ...(i.volume ? { volume: i.volume } : {}),
        ...(i.print_name ? { impressao: i.print_name } : {}),
        ...(i.design ? { design: i.design } : {}),
        ...(i.preview ? { preview: i.preview } : {}),
      },
    }));
    await supabase.from('VENDA_ITENS').insert(saleItems);

    res.status(201).json({ success: true, number: sale.number, items: orderItems.length });
  } catch (err) { fail(res, err); }
});

// ── Validação de CPF/CNPJ (dígitos verificadores) ─────────
function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
function validaCPF(v) {
  const c = soDigitos(v);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0; return d === +c[10];
}
function validaCNPJ(v) {
  const c = soDigitos(v);
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len) => { let pos = len - 7, sum = 0; for (let i = len; i >= 1; i--) { sum += +c[len - i] * pos--; if (pos < 2) pos = 9; } const r = sum % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +c[12] && calc(13) === +c[13];
}

// ── Autocadastro de cliente (link público) ────────────────
router.post('/cadastro', cadastroLimiter, async (req, res) => {
  const { type, name, cpf_cnpj, email, phone, mobile, instagram, rg_ie, ie_isento, can_publish, address, birth_date, update } = req.body;
  const nm = String(name || '').trim();
  const ph = String(phone || '').trim();
  const em = String(email || '').trim();
  const isPJ = type === 'PJ';
  const docDigits = soDigitos(cpf_cnpj);
  if (!nm) return res.status(400).json({ error: 'Informe o nome' });
  if (!docDigits) return res.status(400).json({ error: `Informe o ${isPJ ? 'CNPJ' : 'CPF'}` });
  if (!(isPJ ? validaCNPJ(docDigits) : validaCPF(docDigits))) {
    return res.status(400).json({ error: `${isPJ ? 'CNPJ' : 'CPF'} inválido. Confira os números digitados.` });
  }
  if (!ph) return res.status(400).json({ error: 'Informe o telefone' });
  if (!em) return res.status(400).json({ error: 'Informe o e-mail' });
  // normaliza o @ do instagram (aceita url, @handle ou handle puro)
  const ig = String(instagram || '').trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').replace(/^@/, '') || null;
  try {
    const payload = {
      tenant_id: STORE_TENANT,
      type: type === 'PJ' ? 'PJ' : 'PF',
      name: nm.toUpperCase(),
      cpf_cnpj: String(cpf_cnpj || '').trim() || null,
      rg_ie: String(rg_ie || '').trim() || null,
      email: em || null,
      phone: ph || null,
      mobile: String(mobile || '').trim() || null,
      instagram: ig,
      address: address && typeof address === 'object' ? address : {},
      admission_data: { ie_isento: !!ie_isento, can_publish: !!can_publish },
      is_active: true,
    };
    // Data de nascimento (apenas pessoa física)
    const bd = String(birth_date || '').trim();
    if (!isPJ && bd) payload.birth_date = bd;

    const sel = 'id, name, type, cpf_cnpj, email, phone, mobile, instagram, address';

    // Já existe cadastro com este CPF/CNPJ?
    let byDoc = null;
    if (docDigits) {
      let { data, error: docErr } = await supabase.from('CLIENTES')
        .select('id').eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle();
      if (docErr) { // coluna doc_digits ainda não existe (migration 015) → compara manualmente
        const { data: all } = await supabase.from('CLIENTES').select('id, cpf_cnpj').eq('tenant_id', STORE_TENANT).limit(5000);
        data = (all || []).find(c => soDigitos(c.cpf_cnpj) === docDigits) || null;
      }
      byDoc = data;
    }

    // Existe e NÃO é uma atualização → avisa que já tem cadastro (não bloqueia seco)
    if (byDoc && !update) {
      return res.status(409).json({ error: `Este ${isPJ ? 'CNPJ' : 'CPF'} já está cadastrado.`, exists: true, customer_id: byDoc.id });
    }

    // Atualização dos dados de um cliente existente
    if (byDoc && update) {
      const updPayload = { ...payload, updated_at: new Date().toISOString() };
      let { data: upd, error } = await supabase.from('CLIENTES').update(updPayload).eq('id', byDoc.id).eq('tenant_id', STORE_TENANT).select(sel).single();
      if (error && /(birth_date|updated_at)/i.test(error.message || '')) {
        delete updPayload.birth_date; delete updPayload.updated_at;
        ({ data: upd, error } = await supabase.from('CLIENTES').update(updPayload).eq('id', byDoc.id).eq('tenant_id', STORE_TENANT).select(sel).single());
      }
      if (error) throw error;
      return res.json({ success: true, updated: true, customer: upd });
    }

    // Novo cadastro
    let { data: created, error } = await supabase.from('CLIENTES').insert(payload).select(sel).single();
    if (error && /birth_date/i.test(error.message || '')) {
      // coluna birth_date ainda não existe (migration 023) → tenta sem ela
      delete payload.birth_date;
      ({ data: created, error } = await supabase.from('CLIENTES').insert(payload).select(sel).single());
    }
    if (error) throw error;
    res.status(201).json({ success: true, customer: created });
  } catch (err) { fail(res, err); }
});

// ── Autocadastro de FORNECEDORA (link público) ────────────
router.post('/cadastro-fornecedor', cadastroLimiter, async (req, res) => {
  const { name, nome_fantasia, cnpj, ie, ie_isento, email, phone, mobile, contact_name, instagram, address } = req.body;
  const nm = String(name || '').trim();
  const em = String(email || '').trim();
  const ph = String(phone || '').trim();
  const docDigits = soDigitos(cnpj);
  if (!nm) return res.status(400).json({ error: 'Informe a razão social' });
  if (!docDigits) return res.status(400).json({ error: 'Informe o CNPJ' });
  if (!validaCNPJ(docDigits)) return res.status(400).json({ error: 'CNPJ inválido. Confira os números digitados.' });
  if (!ie_isento && !String(ie || '').trim()) return res.status(400).json({ error: 'Informe a Inscrição Estadual (ou marque Isento)' });
  if (!em) return res.status(400).json({ error: 'Informe o e-mail' });
  if (!ph) return res.status(400).json({ error: 'Informe o telefone' });
  const ig = String(instagram || '').trim()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').replace(/^@/, '') || null;
  try {
    // Bloqueia se o CNPJ já existir
    const { data: all } = await supabase.from('FORNECEDORES').select('id, cnpj').eq('tenant_id', STORE_TENANT).limit(5000);
    if ((all || []).some(s => soDigitos(s.cnpj) === docDigits)) {
      return res.status(409).json({ error: 'Este CNPJ já está cadastrado no nosso sistema.' });
    }

    const addr = address && typeof address === 'object' ? { ...address } : {};
    if (String(nome_fantasia || '').trim()) addr.nome_fantasia = String(nome_fantasia).trim();
    if (String(mobile || '').trim()) addr.mobile = String(mobile).trim();
    if (ig) addr.instagram = ig;

    const base = {
      tenant_id: STORE_TENANT,
      name: nm.toUpperCase(),
      cnpj: String(cnpj || '').trim() || null,
      email: em || null,
      phone: ph || null,
      contact_name: String(contact_name || '').trim() || null,
      address: addr,
      is_active: true,
    };
    const payload = { ...base, ie: ie_isento ? 'ISENTO' : (String(ie || '').trim() || null) };
    let { error } = await supabase.from('FORNECEDORES').insert(payload);
    if (error && /\bie\b/i.test(error.message || '')) { // coluna ie ainda não existe (migration 023)
      ({ error } = await supabase.from('FORNECEDORES').insert(base));
    }
    if (error) throw error;
    res.status(201).json({ success: true });
  } catch (err) { fail(res, err); }
});

// ── Autocadastro de TRANSPORTADORA (link público) ─────────
router.post('/cadastro-transportadora', cadastroLimiter, async (req, res) => {
  const { name, trade_name, cnpj, ie, ie_isento, email, phone, whatsapp, contact_name, address } = req.body;
  const nm = String(name || '').trim();
  const em = String(email || '').trim();
  const ph = String(phone || '').trim();
  const docDigits = soDigitos(cnpj);
  if (!nm) return res.status(400).json({ error: 'Informe a razão social' });
  if (!docDigits) return res.status(400).json({ error: 'Informe o CNPJ' });
  if (!validaCNPJ(docDigits)) return res.status(400).json({ error: 'CNPJ inválido. Confira os números digitados.' });
  if (!ie_isento && !String(ie || '').trim()) return res.status(400).json({ error: 'Informe a Inscrição Estadual (ou marque Isento)' });
  if (!em) return res.status(400).json({ error: 'Informe o e-mail' });
  if (!ph) return res.status(400).json({ error: 'Informe o telefone' });
  try {
    const { data: all } = await supabase.from('TRANSPORTADORAS').select('id, cnpj').eq('tenant_id', STORE_TENANT).limit(5000);
    if ((all || []).some(s => soDigitos(s.cnpj) === docDigits)) {
      return res.status(409).json({ error: 'Este CNPJ já está cadastrado no nosso sistema.' });
    }
    const payload = {
      tenant_id: STORE_TENANT,
      name: nm.toUpperCase(),
      trade_name: String(trade_name || '').trim().toUpperCase() || null,
      cnpj: String(cnpj || '').trim() || null,
      ie: ie_isento ? 'ISENTO' : (String(ie || '').trim() || null),
      email: em || null,
      phone: ph || null,
      whatsapp: String(whatsapp || '').trim() || null,
      contact_name: String(contact_name || '').trim() || null,
      address: address && typeof address === 'object' ? address : {},
      is_active: true,
    };
    const { error } = await supabase.from('TRANSPORTADORAS').insert(payload);
    if (error) throw error;
    res.status(201).json({ success: true });
  } catch (err) { fail(res, err); }
});

// ── Só verifica se o CPF/CNPJ já existe (sem expor os dados) ──
router.post('/check-doc', identityLimiter, async (req, res) => {
  const docDigits = soDigitos(req.body.cpf || req.body.cpf_cnpj);
  if (!docDigits) return res.json({ exists: false });
  try {
    let { data, error } = await supabase.from('CLIENTES').select('id, name, type, birth_date')
      .eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle();
    if (error && /birth_date/i.test(error.message || '')) {
      ({ data, error } = await supabase.from('CLIENTES').select('id, name, type')
        .eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle());
    }
    if (error) { // coluna doc_digits ainda não existe → compara manualmente
      const { data: all } = await supabase.from('CLIENTES').select('*').eq('tenant_id', STORE_TENANT).limit(5000);
      data = (all || []).find(c => soDigitos(c.cpf_cnpj) === docDigits) || null;
    }
    if (!data) return res.json({ exists: false });
    res.json({ exists: true, first_name: (data.name || '').trim().split(/\s+/)[0], type: data.type, has_birth: !!data.birth_date });
  } catch (err) { fail(res, err); }
});

// ── Comprova identidade pela data de nascimento e devolve o cliente ──
router.post('/verify-birth', identityLimiter, async (req, res) => {
  const docDigits = soDigitos(req.body.cpf || req.body.cpf_cnpj);
  const birth = String(req.body.birth_date || '').trim(); // ISO AAAA-MM-DD
  if (!docDigits) return res.status(400).json({ error: 'Informe o CPF' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return res.status(400).json({ error: 'Informe a data de nascimento' });
  const full = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data, birth_date';
  const basic = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data';
  try {
    let { data: cli, error } = await supabase.from('CLIENTES').select(full)
      .eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle();
    if (error && /birth_date/i.test(error.message || '')) {
      // sem coluna birth_date (migration 023 não rodada) → não dá p/ verificar, libera
      ({ data: cli } = await supabase.from('CLIENTES').select(basic)
        .eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle());
      if (cli) return res.json({ success: true, customer: cli });
    }
    if (error) { // coluna doc_digits ausente → compara manualmente
      const { data: all } = await supabase.from('CLIENTES').select(full + ', cpf_cnpj').eq('tenant_id', STORE_TENANT).limit(5000);
      cli = (all || []).find(c => soDigitos(c.cpf_cnpj) === docDigits) || null;
    }
    if (!cli) return res.status(404).json({ error: 'CPF não encontrado.' });

    // Cliente sem nascimento no cadastro → aceita e já salva o informado
    // (a data é obrigatória na entrada, então nunca libera sem verificação)
    if (!cli.birth_date) {
      await supabase.from('CLIENTES').update({ birth_date: birth }).eq('id', cli.id).eq('tenant_id', STORE_TENANT);
      cli.birth_date = birth;
      return res.json({ success: true, customer: cli });
    }
    if (String(cli.birth_date).slice(0, 10) !== birth) {
      return res.status(403).json({ error: 'Data de nascimento não confere. Tente novamente.' });
    }
    res.json({ success: true, customer: cli });
  } catch (err) { fail(res, err); }
});

// ── Perfil do cliente (loja): consulta ────────────────────
router.get('/profile', async (req, res) => {
  const id = req.query.customer_id;
  if (!id) return res.status(400).json({ error: 'Cliente não identificado' });
  const full  = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data, birth_date, avatar_url, profile_history, created_at, updated_at';
  const basic = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data';
  try {
    let { data, error } = await supabase.from('CLIENTES').select(full)
      .eq('tenant_id', STORE_TENANT).eq('id', id).maybeSingle();
    if (error) { // colunas novas (migrations 023/025/026) podem faltar
      ({ data } = await supabase.from('CLIENTES').select(basic)
        .eq('tenant_id', STORE_TENANT).eq('id', id).maybeSingle());
    }
    if (!data) return res.status(404).json({ error: 'Cliente não encontrado' });
    res.json({ customer: data });
  } catch (err) { fail(res, err); }
});

// ── Perfil do cliente (loja): atualizar dados + foto, com histórico ──
router.post('/profile', async (req, res) => {
  const { customer_id, avatar, name, email, phone, mobile, instagram, birth_date, address } = req.body;
  if (!customer_id) return res.status(400).json({ error: 'Cliente não identificado' });
  const full  = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data, birth_date, avatar_url, profile_history';
  const basic = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data';
  try {
    let { data: cur, error: e0 } = await supabase.from('CLIENTES').select(full)
      .eq('tenant_id', STORE_TENANT).eq('id', customer_id).maybeSingle();
    if (e0) ({ data: cur } = await supabase.from('CLIENTES').select(basic)
      .eq('tenant_id', STORE_TENANT).eq('id', customer_id).maybeSingle());
    if (!cur) return res.status(404).json({ error: 'Cliente não encontrado' });

    const ig = instagram != null
      ? (String(instagram).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').replace(/^@/, '') || null)
      : cur.instagram;

    const next = {
      name:      name != null ? String(name).trim().toUpperCase() : cur.name,
      email:     email != null ? String(email).trim() || null : cur.email,
      phone:     phone != null ? String(phone).trim() || null : cur.phone,
      mobile:    mobile != null ? String(mobile).trim() || null : cur.mobile,
      instagram: ig,
      birth_date: birth_date !== undefined ? (birth_date || null) : cur.birth_date,
      address:   (address && typeof address === 'object') ? address : (cur.address || {}),
    };

    // foto de perfil
    let avatarUrl = cur.avatar_url || null;
    if (avatar) { const url = await uploadDataUrl(avatar, 'avatars'); if (url) avatarUrl = url; }

    // monta o histórico das mudanças
    const track = [['name','Nome'],['email','E-mail'],['phone','Telefone'],['mobile','Telefone p/ recado'],['instagram','Instagram'],['birth_date','Data de nascimento']];
    const changes = [];
    for (const [k, label] of track) {
      const from = cur[k] == null ? '' : String(cur[k]);
      const to   = next[k] == null ? '' : String(next[k]);
      if (from !== to) changes.push({ label, from, to });
    }
    if (JSON.stringify(cur.address || {}) !== JSON.stringify(next.address || {})) changes.push({ label: 'Endereço', to: 'atualizado' });
    if (avatar && avatarUrl !== (cur.avatar_url || null)) changes.push({ label: 'Foto de perfil', to: 'atualizada' });

    const history = Array.isArray(cur.profile_history) ? cur.profile_history : [];
    if (changes.length) history.push({ at: new Date().toISOString(), source: 'site', changes });

    // tenta gravar tudo; se faltarem colunas novas, grava só o básico
    const sel = full;
    const payload = { ...next, avatar_url: avatarUrl, profile_history: history, updated_at: new Date().toISOString() };
    let { data: upd, error } = await supabase.from('CLIENTES').update(payload)
      .eq('id', customer_id).eq('tenant_id', STORE_TENANT).select(sel).single();
    if (error) {
      ({ data: upd, error } = await supabase.from('CLIENTES').update(next)
        .eq('id', customer_id).eq('tenant_id', STORE_TENANT).select(basic).single());
    }
    if (error) throw error;
    res.json({ success: true, customer: upd });
  } catch (err) { fail(res, err); }
});

// ── Login da loja / consulta por CPF (também usado p/ pré-preencher edição) ──
router.post('/login', identityLimiter, async (req, res) => {
  const docDigits = soDigitos(req.body.cpf || req.body.cpf_cnpj);
  if (!docDigits) return res.status(400).json({ error: 'Informe o CPF' });
  const full = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data, birth_date';
  const basic = 'id, name, type, cpf_cnpj, rg_ie, email, phone, mobile, instagram, address, admission_data';
  try {
    // tenta com birth_date; se a coluna não existir (migration 023), cai p/ básico
    let sel = full;
    let { data: cli, error } = await supabase.from('CLIENTES')
      .select(sel).eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle();
    if (error && /birth_date/i.test(error.message || '')) {
      sel = basic;
      ({ data: cli, error } = await supabase.from('CLIENTES')
        .select(sel).eq('tenant_id', STORE_TENANT).eq('doc_digits', docDigits).limit(1).maybeSingle());
    }
    if (error) { // coluna doc_digits ainda não existe → compara manualmente
      const { data: all } = await supabase.from('CLIENTES').select(sel + ', cpf_cnpj')
        .eq('tenant_id', STORE_TENANT).limit(5000);
      cli = (all || []).find(c => soDigitos(c.cpf_cnpj) === docDigits) || null;
    }
    if (!cli) return res.status(404).json({ error: 'CPF não encontrado. Faça seu cadastro primeiro.' });
    res.json({ success: true, customer: cli });
  } catch (err) { fail(res, err); }
});

// ── Status da VENDA traduzido para o cliente ──────────────
function statusCliente(sale) {
  const s = sale.status || '';
  const st = sale.production_stage || '';
  if (s === 'cancelled')                                              return { key: 'rejected', label: 'Cancelado' };
  if (['entregue', 'delivered', 'completed'].includes(s))            return { key: 'done', label: 'Entregue 🎉' };
  if (s === 'em_transito')                                           return { key: 'ready', label: 'A caminho 🚚' };
  if (s === 'aguardando_coleta' || s === 'ready' || st === 'finalizado') return { key: 'ready', label: 'Pronto! 🎉' };
  if (['aguardando_arte', 'aguardando_vegetal', 'aguardando_revelacao'].includes(s) || ['revelacao', 'producao', 'embalagem'].includes(st) || s === 'in_production')
    return { key: 'producing', label: 'Em produção' };
  if (['aguardando_financeiro', 'aguardando_estoque', 'confirmed'].includes(s)) return { key: 'preparing', label: 'Em preparação' };
  return { key: 'analysis', label: 'Aguardando aprovação' }; // iniciando_pedido / open
}

// ── Meus pedidos (loja) — status + fotos do produto ───────
router.get('/my-orders', async (req, res) => {
  let cid = req.query.customer_id || null;
  const cpf = soDigitos(req.query.cpf);
  try {
    if (!cid && cpf) {
      let { data, error } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', STORE_TENANT).eq('doc_digits', cpf).limit(1).maybeSingle();
      if (error) {
        const { data: all } = await supabase.from('CLIENTES').select('id, cpf_cnpj').eq('tenant_id', STORE_TENANT).limit(5000);
        data = (all || []).find(c => soDigitos(c.cpf_cnpj) === cpf) || null;
      }
      cid = data?.id || null;
    }
    if (!cid) return res.status(400).json({ error: 'Cliente não identificado' });

    // Pedidos do cliente = VENDAS (inclui os feitos pelo site)
    const full = 'id, number, status, total, created_at, event_date, ship_date, max_delivery_date, production_stage, production_photos, VENDA_ITENS(product_name, quantity, customization)';
    const basic = 'id, number, status, total, created_at, production_stage, VENDA_ITENS(product_name, quantity, customization)';
    let { data: sales, error } = await supabase.from('VENDAS').select(full)
      .eq('tenant_id', STORE_TENANT).eq('customer_id', cid).order('created_at', { ascending: false }).limit(100);
    if (error) { // colunas novas (migration 024) podem faltar
      ({ data: sales } = await supabase.from('VENDAS').select(basic)
        .eq('tenant_id', STORE_TENANT).eq('customer_id', cid).order('created_at', { ascending: false }).limit(100));
    }
    sales = sales || [];

    const orders = sales.map(s => ({
      id: s.id, number: s.number, created_at: s.created_at,
      event_date: s.event_date || null,
      ship_date: s.ship_date || null,
      max_delivery_date: s.max_delivery_date || null,
      total: s.total,
      status: statusCliente(s),
      photos: Array.isArray(s.production_photos) ? s.production_photos : [],
      items: (s.VENDA_ITENS || []).map(it => ({
        name: it.product_name, quantity: it.quantity,
        preview: it.customization?.preview || null,
      })),
    }));
    res.json({ orders });
  } catch (err) { fail(res, err); }
});

// ── Frete por CEP (Melhor Envio) ──────────────────────────
router.post('/frete', async (req, res) => {
  const cep = String(req.body.cep || '').replace(/\D/g, '');
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (cep.length !== 8) return res.status(400).json({ error: 'CEP inválido' });
  try {
    const cfg = await getFreteConfig(STORE_TENANT);
    // CEP de origem: 1º o campo de Transportadora (cfg.origin_cep), depois env,
    // depois o endereço da empresa. Sem ele, BrasPress/Melhor Envio não cotam.
    let fromCep = String(cfg.origin_cep || '').replace(/\D/g, '') || process.env.STORE_ORIGIN_CEP || '';
    if (!fromCep) {
      const { data: emp } = await supabase.from('EMPRESAS').select('address').eq('id', STORE_TENANT).maybeSingle();
      const addr = emp?.address;
      if (addr && typeof addr === 'object') fromCep = String(addr.zip || addr.cep || '').replace(/\D/g, '');
    }

    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    let products = [];
    let qty = 0, subtotal = 0;
    if (ids.length) {
      const { data: prods } = await supabase
        .from('PRODUTOS').select('id, sale_price, height, weight, length, width')
        .eq('tenant_id', STORE_TENANT).in('id', ids);
      const pm = Object.fromEntries((prods || []).map(p => [p.id, p]));
      products = items.filter(i => pm[i.product_id]).map(i => packItem(pm[i.product_id], i.quantity));
      for (const i of items) {
        const p = pm[i.product_id]; if (!p) continue;
        qty += Number(i.quantity) || 0;
        subtotal += (Number(p.sale_price) || 0) * (Number(i.quantity) || 0);
      }
    }

    let options = [];

    // 1) Melhor Envio (cotação real multi-transportadora) — se houver token
    if (process.env.MELHORENVIO_TOKEN && products.length) {
      const out = await calcularFrete({ fromCep, toCep: cep, products });
      if (out.ok && (out.options || []).length) options = out.options;
    }

    // 2) BrasPress (cotação por CNPJ) — anexa como opção extra, se configurada
    if (cfg.bp_enabled && bpReady(cfg) && products.length && String(fromCep).replace(/\D/g, '').length === 8) {
      try {
        const cubagem = products.map(p => ({
          comprimento: Math.max((Number(p.length) || 1) / 100, 0.01),
          largura:     Math.max((Number(p.width)  || 1) / 100, 0.01),
          altura:      Math.max((Number(p.height) || 1) / 100, 0.01),
          volumes:     Math.max(1, Number(p.quantity) || 1),
        }));
        const pesoTotal    = products.reduce((s, p) => s + (Number(p.weight) || 0) * (Number(p.quantity) || 1), 0);
        const volumesTotal = products.reduce((s, p) => s + (Number(p.quantity) || 1), 0);
        const bp = await braspressCotar(cfg, {
          cepOrigem: fromCep, cepDestino: cep, vlrMercadoria: subtotal,
          peso: pesoTotal, volumes: volumesTotal, cubagem,
        });
        if (bp.price > 0) {
          options.push({
            id: 'braspress', company: 'BrasPress',
            service: cfg.bp_modal === 'A' ? 'Aéreo' : 'Rodoviário',
            price: bp.price, days: bp.days,
          });
        }
      } catch (e) { console.error('[public-store:frete] BrasPress', e.message); }
    }

    // 3) J&T Express (cotação + prazo pelo contrato) — anexa como opção extra
    if (cfg.enabled && jtReady(cfg)) {
      try {
        const pesoTotal = products.reduce((s, p) => s + (Number(p.weight) || 0) * (Number(p.quantity) || 1), 0)
          || (qty * cfg.weight_per_unit_g) / 1000;
        const jt = await jtCotar(cfg, { cep, weightKg: pesoTotal, subtotal });
        if (jt.price > 0) {
          options.push({ id: 'jt', company: 'J&T Express', service: 'Economy', price: jt.price, days: jt.days });
        }
      } catch (e) { console.error('[public-store:frete] J&T', e.message); }
    }

    // 4) Fallback: tabela por estado (Configurações → Transportadora) — só se nada retornou
    if (!options.length) {
      const uf = ufFromCep(cep);
      if (!uf) return res.status(400).json({ error: 'Não consegui identificar o estado pelo CEP.' });
      const r = await cotar(STORE_TENANT, { uf, cep, qty, subtotal });
      options = [{ id: 'tabela', company: 'Entrega', service: r.free ? 'Frete grátis' : 'Padrão', price: r.price, days: r.days }];
    }

    // Markup automático sobre o frete (custo de caixa + variação de peso) — padrão 14%
    const markup = (cfg.freight_markup != null && cfg.freight_markup !== '') ? Number(cfg.freight_markup) : 14;
    if (markup) options = options.map(o => ({ ...o, price: Math.round((Number(o.price) || 0) * (1 + markup / 100) * 100) / 100 }));

    // DEBUG temporário: por que BrasPress/J&T não cotaram
    const _debug = {
      from_cep: fromCep, products: products.length,
      bp_enabled: !!cfg.bp_enabled, bp_ready: bpReady(cfg),
      jt_enabled: !!cfg.enabled, jt_ready: jtReady(cfg),
    };
    res.json({ options, _debug });
  } catch (err) { fail(res, err); }
});

// Sugestão de design com IA (cliente descreve a marca)
router.post('/ai-design', aiLimiter, async (req, res) => {
  const brief = String(req.body.brief || '').trim();
  if (!brief) return res.status(400).json({ error: 'Descreva sua marca ou evento' });
  try {
    const { designSuggestion } = require('./ai');
    const out = await designSuggestion(brief);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  } catch (err) { fail(res, err); }
});

module.exports = router;
