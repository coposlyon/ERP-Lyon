const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { precoFaixa } = require('../lib/calc');
const { uploadDataUrl } = require('../lib/storage');

// Loja pública: serve UM tenant (a empresa dona da loja).
// Sem autenticação — montada antes do authMiddleware.
const STORE_TENANT = process.env.STORE_TENANT_ID || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

// preço "a partir de": menor entre sale_price e as faixas
function fromPrice(p) {
  const tiers = Array.isArray(p.price_tiers) ? p.price_tiers : [];
  const prices = [Number(p.sale_price) || 0, ...tiers.map(t => Number(t.price) || 0)].filter(v => v > 0);
  return prices.length ? Math.min(...prices) : Number(p.sale_price) || 0;
}

// ── Informações da loja ───────────────────────────────────
router.get('/store', async (req, res) => {
  try {
    const { data: empresa } = await supabase
      .from('EMPRESAS').select('name, phone, email, cnpj, address')
      .eq('id', STORE_TENANT).maybeSingle();
    res.json({
      name:  empresa?.name  || 'Nossa Loja',
      phone: empresa?.phone || null,
      email: empresa?.email || null,
      cnpj:  empresa?.cnpj  || null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Categorias com contagem ───────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const { data } = await supabase
      .from('CATEGORIAS').select('id, name')
      .eq('tenant_id', STORE_TENANT).order('name');
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Catálogo ──────────────────────────────────────────────
router.get('/products', async (req, res) => {
  const { search, category } = req.query;
  try {
    let query = supabase
      .from('PRODUTOS')
      .select('id, name, code, unit, description, sale_price, price_tiers, category_id, CATEGORIAS(name)')
      .eq('tenant_id', STORE_TENANT)
      .eq('is_active', true)
      .order('name');
    if (category) query = query.eq('category_id', category);
    if (search) {
      const s = String(search).replace(/[,()]/g, ' ').trim();
      query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%`);
    }
    const { data: products, error } = await query.limit(300);
    if (error) throw error;

    // contagem de variantes (cores) por produto
    const ids = (products || []).map(p => p.id);
    let variantCount = {};
    if (ids.length) {
      const { data: variants } = await supabase
        .from('VARIANTES_PRODUTO')
        .select('product_id')
        .eq('tenant_id', STORE_TENANT)
        .in('product_id', ids);
      for (const v of (variants || [])) variantCount[v.product_id] = (variantCount[v.product_id] || 0) + 1;
    }

    res.json((products || []).map(p => ({
      id: p.id, name: p.name, code: p.code, unit: p.unit,
      description: p.description,
      category: p.CATEGORIAS?.name || null,
      from_price: fromPrice(p),
      has_tiers: Array.isArray(p.price_tiers) && p.price_tiers.length > 0,
      colors: variantCount[p.id] || 0,
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Detalhe do produto ────────────────────────────────────
router.get('/products/:id', async (req, res) => {
  try {
    const { data: p, error } = await supabase
      .from('PRODUTOS')
      .select('id, name, code, unit, description, sale_price, price_tiers, CATEGORIAS(name)')
      .eq('tenant_id', STORE_TENANT).eq('id', req.params.id).eq('is_active', true)
      .maybeSingle();
    if (error) throw error;
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

    const { data: variants } = await supabase
      .from('VARIANTES_PRODUTO')
      .select('id, name, type, value, extra_price')
      .eq('tenant_id', STORE_TENANT).eq('product_id', p.id)
      .order('name');

    res.json({
      id: p.id, name: p.name, code: p.code, unit: p.unit,
      description: p.description, category: p.CATEGORIAS?.name || null,
      sale_price: Number(p.sale_price) || 0,
      price_tiers: Array.isArray(p.price_tiers) ? p.price_tiers : [],
      from_price: fromPrice(p),
      variants: variants || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Enviar pedido de orçamento ────────────────────────────
router.post('/quote', async (req, res) => {
  const { customer = {}, items = [], notes } = req.body;
  const name  = (customer.name  || '').trim();
  const phone = (customer.phone || '').trim();
  const email = (customer.email || '').trim();
  const company = (customer.company || '').trim();

  if (!name || !phone) return res.status(400).json({ error: 'Informe nome e telefone' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrinho vazio' });

  try {
    // Busca produtos do carrinho para recalcular o preço no servidor
    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    const { data: prods } = await supabase
      .from('PRODUTOS').select('id, name, unit, sale_price, price_tiers')
      .eq('tenant_id', STORE_TENANT).in('id', ids);
    const prodMap = Object.fromEntries((prods || []).map(p => [p.id, p]));

    const orderItems = [];
    for (const it of items) {
      const p = prodMap[it.product_id];
      const qty = Math.max(parseInt(it.quantity) || 0, 1);
      if (!p) {
        orderItems.push({
          product_id: null, product_name: it.product_name || 'Personalizado',
          quantity: qty, unit_price: 0, color: it.color || null,
          design: it.design || null, preview: it.preview || null,
        });
        continue;
      }
      const unit = precoFaixa(p.price_tiers, p.sale_price, qty);
      orderItems.push({
        product_id: p.id,
        product_name: p.name + (it.color ? ` — ${it.color}` : ''),
        quantity: qty,
        unit_price: unit,
        color: it.color || null,
        design: it.design || null, preview: it.preview || null,
      });
    }

    // Cliente (lead): reaproveita por telefone/e-mail ou cria novo
    let customerId = null;
    let existing = null;
    if (phone) {
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

    // Número do orçamento
    let number = null;
    try {
      const { data: numData } = await supabase.rpc('proximo_numero_orcamento', { p_tenant_id: STORE_TENANT });
      number = numData;
    } catch { /* sem RPC: número fica nulo */ }

    const subtotal = orderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const fullNotes = `PEDIDO PELO SITE — Contato: ${name} / ${phone}${email ? ' / ' + email : ''}${company ? ' / ' + company : ''}${notes ? `\nObs: ${notes}` : ''}`;

    const { data: quote, error: qErr } = await supabase.from('ORCAMENTOS').insert({
      tenant_id: STORE_TENANT, user_id: null, number,
      customer_id: customerId, subtotal, discount: 0, total: subtotal,
      notes: fullNotes, status: 'open', delivery_days: 10,
    }).select('id, number').single();
    if (qErr) throw qErr;

    // sobe os previews dos itens personalizados para o Storage (não no banco)
    for (const i of orderItems) {
      if (i.preview) i.preview = await uploadDataUrl(i.preview, 'pedidos');
    }

    const quoteItems = orderItems.map(i => ({
      quote_id: quote.id, product_id: i.product_id, product_name: i.product_name,
      quantity: i.quantity, unit_price: i.unit_price,
      discount: 0, total: i.quantity * i.unit_price,
      customization: {
        ...(i.color ? { cor: i.color } : {}),
        ...(i.design ? { design: i.design } : {}),
        ...(i.preview ? { preview: i.preview } : {}),
      },
    }));
    await supabase.from('ORCAMENTO_ITENS').insert(quoteItems);

    res.status(201).json({ success: true, number: quote.number, items: orderItems.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
