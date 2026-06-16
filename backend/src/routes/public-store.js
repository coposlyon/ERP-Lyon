const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { precoFaixa, precoComImpressao, PRINT_METHODS } = require('../lib/calc');
const { uploadDataUrl } = require('../lib/storage');
const { calcularFrete, packItem } = require('../lib/frete');

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
  // full=false é o fallback caso colunas novas ainda não existam (migrations 016/021)
  const build = (full) => {
    let q = supabase
      .from('PRODUTOS')
      .select(`id, name, code, unit, description, sale_price, price_tiers${full ? ', min_order_qty, store_group, store_color' : ''}, category_id, CATEGORIAS(name)`)
      .eq('tenant_id', STORE_TENANT)
      .eq('is_active', true)
      .order('name');
    if (category) q = q.eq('category_id', category);
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

    // Agrupa por modelo (store_group). Cada grupo vira 1 card; as cores ficam dentro.
    const groups = new Map();
    for (const p of (products || [])) {
      const key = (p.store_group && p.store_group.trim()) || p.name;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    const cards = [...groups.entries()].map(([key, items]) => {
      const rep = items[0];
      const prices = items.map(fromPrice).filter(v => v > 0);
      return {
        id: rep.id, name: key, code: rep.code, unit: rep.unit,
        description: rep.description,
        category: rep.CATEGORIAS?.name || null,
        from_price: prices.length ? Math.min(...prices) : fromPrice(rep),
        has_tiers: items.some(p => Array.isArray(p.price_tiers) && p.price_tiers.length > 0),
        colors: items.length > 1 ? items.length : 0,
        min_order_qty: Math.max(...items.map(p => p.min_order_qty || 1)),
      };
    }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

    res.json(cards);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Detalhe do produto ────────────────────────────────────
router.get('/products/:id', async (req, res) => {
  const build = (full) => supabase
    .from('PRODUTOS')
    .select(`id, name, code, unit, description, sale_price, price_tiers${full ? ', min_order_qty, print_pricing, store_group, store_color' : ''}, CATEGORIAS(name)`)
    .eq('tenant_id', STORE_TENANT).eq('id', req.params.id).eq('is_active', true)
    .maybeSingle();
  try {
    let { data: p, error } = await build(true);
    if (error) ({ data: p, error } = await build(false));
    if (error) throw error;
    if (!p) return res.status(404).json({ error: 'Produto não encontrado' });

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
      sale_price: Number(p.sale_price) || 0,
      price_tiers: Array.isArray(p.price_tiers) ? p.price_tiers : [],
      from_price: fromPrice(p),
      min_order_qty: p.min_order_qty || 1,
      print_pricing: p.print_pricing || {},
      print_methods: PRINT_METHODS,
      variants: variants || [],
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Enviar pedido de orçamento ────────────────────────────
router.post('/quote', async (req, res) => {
  const { customer = {}, items = [], notes, event_date, customer_id } = req.body;
  const name  = (customer.name  || '').trim();
  const phone = (customer.phone || '').trim();
  const email = (customer.email || '').trim();
  const company = (customer.company || '').trim();
  const eventDate = String(event_date || '').trim() || null;

  if (!name || !phone) return res.status(400).json({ error: 'Informe nome e telefone' });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Carrinho vazio' });

  try {
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
      orderItems.push({
        product_id: p.id,
        product_name: p.name + (it.color ? ` — ${it.color}` : '') + (printName ? ` (${printName})` : ''),
        quantity: qty,
        unit_price: unit,
        color: it.color || null,
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

    // Número do orçamento
    let number = null;
    try {
      const { data: numData } = await supabase.rpc('proximo_numero_orcamento', { p_tenant_id: STORE_TENANT });
      number = numData;
    } catch { /* sem RPC: número fica nulo */ }

    const subtotal = orderItems.reduce((s, i) => s + i.quantity * i.unit_price, 0);
    const eventNote = eventDate ? `\nData do evento: ${eventDate.split('-').reverse().join('/')}` : '';
    const fullNotes = `PEDIDO PELO SITE — Contato: ${name} / ${phone}${email ? ' / ' + email : ''}${company ? ' / ' + company : ''}${eventNote}${notes ? `\nObs: ${notes}` : ''}`;

    const baseQuote = {
      tenant_id: STORE_TENANT, user_id: null, number,
      customer_id: customerId, subtotal, discount: 0, total: subtotal,
      notes: fullNotes, status: 'open', delivery_days: 10,
    };
    // event_date pode não existir ainda (migration 024) → fallback sem ela
    let { data: quote, error: qErr } = await supabase.from('ORCAMENTOS')
      .insert({ ...baseQuote, event_date: eventDate }).select('id, number').single();
    if (qErr && /event_date/i.test(qErr.message || '')) {
      ({ data: quote, error: qErr } = await supabase.from('ORCAMENTOS').insert(baseQuote).select('id, number').single());
    }
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
        ...(i.print_name ? { impressao: i.print_name } : {}),
        ...(i.design ? { design: i.design } : {}),
        ...(i.preview ? { preview: i.preview } : {}),
      },
    }));
    await supabase.from('ORCAMENTO_ITENS').insert(quoteItems);

    res.status(201).json({ success: true, number: quote.number, items: orderItems.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
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
router.post('/cadastro', async (req, res) => {
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
      let { data: upd, error } = await supabase.from('CLIENTES').update(payload).eq('id', byDoc.id).eq('tenant_id', STORE_TENANT).select(sel).single();
      if (error && /birth_date/i.test(error.message || '')) {
        delete payload.birth_date;
        ({ data: upd, error } = await supabase.from('CLIENTES').update(payload).eq('id', byDoc.id).eq('tenant_id', STORE_TENANT).select(sel).single());
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Login da loja / consulta por CPF (também usado p/ pré-preencher edição) ──
router.post('/login', async (req, res) => {
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
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Status traduzido para o cliente ───────────────────────
function statusCliente(quote, sale) {
  if (sale) {
    const st = sale.production_stage || '';
    if (sale.status === 'completed' || sale.status === 'delivered') return { key: 'done', label: 'Concluído' };
    if (st === 'finalizado' || sale.status === 'ready')             return { key: 'ready', label: 'Pronto! 🎉' };
    if (['revelacao', 'producao', 'embalagem'].includes(st))        return { key: 'producing', label: 'Em produção' };
    return { key: 'preparing', label: 'Em preparação' };
  }
  const s = quote.status;
  if (s === 'approved')  return { key: 'approved', label: 'Aprovado' };
  if (s === 'rejected')  return { key: 'rejected', label: 'Recusado' };
  if (s === 'converted') return { key: 'producing', label: 'Em produção' };
  return { key: 'analysis', label: 'Em análise' };
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

    const sel = 'id, number, status, total, created_at, event_date, converted_sale_id, ORCAMENTO_ITENS(product_name, quantity, customization)';
    let { data: quotes, error } = await supabase.from('ORCAMENTOS').select(sel)
      .eq('tenant_id', STORE_TENANT).eq('customer_id', cid).order('created_at', { ascending: false }).limit(100);
    if (error) { // event_date pode não existir → tenta sem ela
      ({ data: quotes } = await supabase.from('ORCAMENTOS')
        .select('id, number, status, total, created_at, converted_sale_id, ORCAMENTO_ITENS(product_name, quantity, customization)')
        .eq('tenant_id', STORE_TENANT).eq('customer_id', cid).order('created_at', { ascending: false }).limit(100));
    }
    quotes = quotes || [];

    const saleIds = quotes.map(q => q.converted_sale_id).filter(Boolean);
    let salesById = {};
    if (saleIds.length) {
      const { data: sales } = await supabase.from('VENDAS')
        .select('id, status, production_stage, ship_date, max_delivery_date, production_photos, event_date')
        .eq('tenant_id', STORE_TENANT).in('id', saleIds);
      salesById = Object.fromEntries((sales || []).map(s => [s.id, s]));
    }

    const orders = quotes.map(q => {
      const sale = q.converted_sale_id ? salesById[q.converted_sale_id] : null;
      return {
        id: q.id, number: q.number, created_at: q.created_at,
        event_date: q.event_date || sale?.event_date || null,
        ship_date: sale?.ship_date || null,
        max_delivery_date: sale?.max_delivery_date || null,
        total: q.total,
        status: statusCliente(q, sale),
        photos: Array.isArray(sale?.production_photos) ? sale.production_photos : [],
        items: (q.ORCAMENTO_ITENS || []).map(it => ({
          name: it.product_name, quantity: it.quantity,
          preview: it.customization?.preview || null,
        })),
      };
    });
    res.json({ orders });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Frete por CEP (Melhor Envio) ──────────────────────────
router.post('/frete', async (req, res) => {
  const cep = String(req.body.cep || '').replace(/\D/g, '');
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  if (cep.length !== 8) return res.status(400).json({ error: 'CEP inválido' });
  try {
    // CEP de origem: env STORE_ORIGIN_CEP ou endereço da empresa
    let fromCep = process.env.STORE_ORIGIN_CEP || '';
    if (!fromCep) {
      const { data: emp } = await supabase.from('EMPRESAS').select('address').eq('id', STORE_TENANT).maybeSingle();
      const addr = emp?.address;
      if (addr && typeof addr === 'object') fromCep = addr.zip || addr.cep || '';
    }

    const ids = [...new Set(items.map(i => i.product_id).filter(Boolean))];
    let products = [];
    if (ids.length) {
      const { data: prods } = await supabase
        .from('PRODUTOS').select('id, sale_price, height, weight, length, width')
        .eq('tenant_id', STORE_TENANT).in('id', ids);
      const pm = Object.fromEntries((prods || []).map(p => [p.id, p]));
      products = items.filter(i => pm[i.product_id]).map(i => packItem(pm[i.product_id], i.quantity));
    }
    if (!products.length) return res.status(400).json({ error: 'Carrinho sem produtos do catálogo para calcular frete.' });

    const out = await calcularFrete({ fromCep, toCep: cep, products });
    if (!out.ok) return res.status(400).json({ error: out.error });
    res.json({ options: out.options });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Sugestão de design com IA (cliente descreve a marca)
router.post('/ai-design', async (req, res) => {
  const brief = String(req.body.brief || '').trim();
  if (!brief) return res.status(400).json({ error: 'Descreva sua marca ou evento' });
  try {
    const { designSuggestion } = require('./ai');
    const out = await designSuggestion(brief);
    if (out.error) return res.status(400).json({ error: out.error });
    res.json(out);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
