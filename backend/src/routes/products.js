const express = require('express');
const router = express.Router();
const Joi = require('joi');
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { validate } = require('../middleware/validate');

const productSchema = Joi.object({
  name:       Joi.string().min(1).required(),
  sale_price: Joi.number().min(0),
  cost_price: Joi.number().min(0),
  min_stock:  Joi.number().min(0),
}).unknown(true);

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, search, category_id, is_active } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('PRODUTOS')
      .select('*, CATEGORIAS(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('name');

    if (search) {
      const s = search.trim();
      query = query.or(`name.ilike.%${s}%,code.ilike.%${s}%,ean.ilike.%${s}%`);
    }
    if (category_id) query = query.eq('category_id', category_id);
    if (is_active !== undefined) query = query.eq('is_active', is_active === 'true');

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Edição em massa: aplica os campos enviados (fiscal, preço, qtd mínima,
// faixas de preço) a vários produtos de uma vez. Só altera o que for enviado.
router.patch('/bulk', async (req, res) => {
  const { ids, fields = {} } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) return res.status(400).json({ error: 'Selecione ao menos um produto' });
  const patch = {};
  // texto fiscal
  for (const k of ['ncm', 'cst', 'cfop']) {
    if (fields[k] != null && String(fields[k]).trim() !== '') patch[k] = String(fields[k]).trim();
  }
  // numéricos (preço de custo/venda)
  for (const k of ['cost_price', 'sale_price']) {
    if (fields[k] != null && fields[k] !== '') {
      const n = Number(fields[k]);
      if (!Number.isNaN(n) && n >= 0) patch[k] = n;
    }
  }
  // quantidade mínima de pedido (inteiro >= 1)
  if (fields.min_order_qty != null && fields.min_order_qty !== '') {
    const n = parseInt(fields.min_order_qty);
    if (!Number.isNaN(n)) patch.min_order_qty = Math.max(1, n);
  }
  // faixas de preço por quantidade (substitui as faixas dos selecionados).
  // Salva no formato lido pela loja: { min_qty, max_qty, price }.
  if (Array.isArray(fields.price_tiers)) {
    patch.price_tiers = fields.price_tiers
      .map(t => {
        const min = parseInt(t.min_qty ?? t.min) || 0;
        const maxRaw = t.max_qty ?? t.max;
        return { min_qty: min, max_qty: (maxRaw === '' || maxRaw == null) ? null : (parseInt(maxRaw) || null), price: Number(t.price) || 0 };
      })
      .filter(t => t.min_qty > 0 && t.price > 0);
  }
  // preço por tipo de impressão (Serigrafia/Transfer/DTF) — substitui as 3 tabelas
  if (fields.print_pricing && typeof fields.print_pricing === 'object' && !Array.isArray(fields.print_pricing)) {
    const pp = {};
    for (const key of ['serigrafia', 'transfer', 'dtf']) {
      const d = fields.print_pricing[key];
      if (!d || typeof d !== 'object') continue;
      const price = (d.price != null && d.price !== '') ? Number(d.price) : null;
      const tiers = Array.isArray(d.tiers)
        ? d.tiers.map(t => ({ min_qty: parseInt(t.min_qty) || 0, max_qty: (t.max_qty === '' || t.max_qty == null) ? null : (parseInt(t.max_qty) || null), price: Number(t.price) || 0 })).filter(t => t.min_qty > 0 && t.price > 0)
        : [];
      if ((price != null && !Number.isNaN(price)) || tiers.length) pp[key] = { ...(price != null && !Number.isNaN(price) ? { price } : {}), tiers };
    }
    patch.print_pricing = pp;
  }
  if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nada para aplicar — preencha ao menos um campo' });
  patch.updated_at = new Date().toISOString();

  const runUpdate = (p) => supabase
    .from('PRODUTOS').update(p)
    .eq('tenant_id', req.tenantId).in('id', ids.slice(0, 2000))
    .select('id');
  try {
    let { data, error } = await runUpdate(patch);
    // resiliência: se min_order_qty/print_pricing ainda não existem, aplica o resto
    if (error && /print_pricing|min_order_qty|does not exist|column|42703/i.test(error.message || '')) {
      const { print_pricing, min_order_qty, ...rest } = patch;
      ({ data, error } = await runUpdate(rest));
    }
    if (error) throw error;
    audit(req, 'update', 'product', null, { bulk: Object.keys(patch), count: (data || []).length });
    res.json({ updated: (data || []).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Importação de produtos/estoque a partir de planilha (linhas já parseadas no cliente).
// rows: [{ code, name, unit, saldo }]. Cria os que não existem (por código) e/ou
// atualiza o estoque (saldo) dos existentes.
router.post('/import', async (req, res) => {
  const { rows, create = true, update_stock = true } = req.body;
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Sem linhas para importar' });
  let created = 0, updated = 0, skipped = 0;
  try {
    // agrega por código (soma saldo de duplicados)
    const byCode = new Map();
    for (const r of rows) {
      const code = String(r.code || '').trim();
      const name = String(r.name || '').trim();
      if (!code || !name) { skipped++; continue; }
      const saldo = Number(r.saldo) || 0;
      let unit = String(r.unit || 'UN').trim(); if (!unit || unit.length > 6) unit = 'UN';
      if (byCode.has(code)) byCode.get(code).saldo += saldo;
      else byCode.set(code, { code, name: name.toUpperCase(), unit, saldo });
    }
    const items = [...byCode.values()];
    const codes = items.map(i => i.code);

    // mapeia códigos existentes
    const existing = {};
    for (let i = 0; i < codes.length; i += 300) {
      const { data } = await supabase.from('PRODUTOS').select('id, code')
        .eq('tenant_id', req.tenantId).in('code', codes.slice(i, i + 300));
      for (const p of (data || [])) existing[p.code] = p.id;
    }

    // categoria padrão
    const { data: cat } = await supabase.from('CATEGORIAS').select('id')
      .eq('tenant_id', req.tenantId).ilike('name', 'PRODUTO ACABADO').limit(1).maybeSingle();
    const catId = cat?.id || null;

    const toInsert = [], toUpdate = [];
    for (const it of items) {
      if (existing[it.code]) {
        if (update_stock) toUpdate.push({ id: existing[it.code], current_stock: it.saldo });
      } else if (create) {
        toInsert.push({ tenant_id: req.tenantId, code: it.code, name: it.name, unit: it.unit, current_stock: it.saldo, category_id: catId, is_active: true });
      } else skipped++;
    }

    for (let i = 0; i < toInsert.length; i += 500) {
      const batch = toInsert.slice(i, i + 500);
      const { error } = await supabase.from('PRODUTOS').insert(batch);
      if (error) throw error;
      created += batch.length;
    }
    for (const u of toUpdate) {
      const { error } = await supabase.from('PRODUTOS').update({ current_stock: u.current_stock }).eq('id', u.id).eq('tenant_id', req.tenantId);
      if (!error) updated++;
    }
    audit(req, 'import', 'product', null, { created, updated, skipped });
    res.json({ created, updated, skipped, total: items.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/categories/list', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('CATEGORIAS')
      .select('*, PRODUTOS(id)')
      .eq('tenant_id', req.tenantId)
      .order('name');

    if (error) throw error;
    // adiciona contagem de produtos por categoria
    const result = (data || []).map(c => ({
      ...c,
      product_count: Array.isArray(c.PRODUTOS) ? c.PRODUTOS.length : 0,
      PRODUTOS: undefined,
    }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
  try {
    const { data, error } = await supabase
      .from('CATEGORIAS')
      .insert({ tenant_id: req.tenantId, name })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/categories/:catId', async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'Nome da categoria é obrigatório' });
  try {
    const { data, error } = await supabase
      .from('CATEGORIAS')
      .update({ name })
      .eq('id', req.params.catId)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/categories/:catId', async (req, res) => {
  try {
    // Desvincula produtos desta categoria antes de deletar
    await supabase
      .from('PRODUTOS')
      .update({ category_id: null })
      .eq('category_id', req.params.catId)
      .eq('tenant_id', req.tenantId);

    const { error } = await supabase
      .from('CATEGORIAS')
      .delete()
      .eq('id', req.params.catId)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;
    res.json({ message: 'Categoria excluída' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .select('*, CATEGORIAS(id, name), FORNECEDORES(id, name)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Produto não encontrado' });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', validate(productSchema), async (req, res) => {
  const {
    name, code, ean, description, category_id, cost_price, sale_price,
    min_stock, ncm, cst, cfop, is_active, supplier_id,
    height, weight, thickness, base_circumference, mouth_circumference, length, width,
    price_tiers, min_order_qty, print_pricing, variations
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Nome do produto é obrigatório' });

  try {
    const payload = {
      tenant_id: req.tenantId,
      name: name.toUpperCase(),
      code, ean, description, category_id,
      cost_price: cost_price || 0,
      sale_price: sale_price || 0,
      min_stock: min_stock || 0,
      ncm, cst, cfop,
      is_active: is_active !== false,
      supplier_id: supplier_id || null,
      height: height || null, weight: weight || null, thickness: thickness || null,
      base_circumference: base_circumference || null,
      mouth_circumference: mouth_circumference || null,
      length: length || null, width: width || null,
      price_tiers: price_tiers || [],
      min_order_qty: Math.max(1, parseInt(min_order_qty) || 1),
      print_pricing: print_pricing || {},
      ...(variations != null ? { variations } : {}),
    };
    const ins = () => supabase.from('PRODUTOS').insert(payload).select().single();
    let { data, error } = await ins();
    if (error && /variations/i.test(error.message || '')) { delete payload.variations; ({ data, error } = await ins()); }

    if (error) throw error;
    audit(req, 'create', 'product', data.id, { name: data.name, code, sale_price, cost_price });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req, res) => {
  const {
    name, code, ean, description, category_id, cost_price, sale_price,
    min_stock, ncm, cst, cfop, is_active, supplier_id,
    height, weight, thickness, base_circumference, mouth_circumference, length, width,
    price_tiers, min_order_qty, print_pricing, variations
  } = req.body;

  try {
    // captura preços atuais para a trilha de auditoria
    const { data: before } = await supabase
      .from('PRODUTOS')
      .select('cost_price, sale_price')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    const payload = {
      name: name ? name.toUpperCase() : name,
      code, ean, description, category_id,
      cost_price, sale_price, min_stock, ncm, cst, cfop, is_active,
      supplier_id: supplier_id || null,
      height: height || null, weight: weight || null, thickness: thickness || null,
      base_circumference: base_circumference || null,
      mouth_circumference: mouth_circumference || null,
      length: length || null, width: width || null,
      price_tiers: price_tiers || [],
      ...(min_order_qty != null ? { min_order_qty: Math.max(1, parseInt(min_order_qty) || 1) } : {}),
      ...(print_pricing != null ? { print_pricing } : {}),
      ...(variations != null ? { variations } : {}),
      updated_at: new Date().toISOString(),
    };
    const upd = () => supabase.from('PRODUTOS').update(payload)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    let { data, error } = await upd();
    if (error && /variations/i.test(error.message || '')) { // coluna variations ausente (migration 027)
      delete payload.variations;
      ({ data, error } = await upd());
    }
    if (error) throw error;

    const details = { name: data.name };
    if (before && Number(before.sale_price) !== Number(data.sale_price))
      details.sale_price = { de: before.sale_price, para: data.sale_price };
    if (before && Number(before.cost_price) !== Number(data.cost_price))
      details.cost_price = { de: before.cost_price, para: data.cost_price };
    audit(req, 'update', 'product', data.id, details);

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase
      .from('PRODUTOS')
      .update({ is_active: false })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) throw error;
    audit(req, 'delete', 'product', req.params.id, null);
    res.json({ message: 'Produto desativado com sucesso' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Importação de catálogo agrupado: 1 produto por modelo, com variações
// (cores / bordas / volumes). Se o produto já existe, MESCLA as variações.
router.post('/import-grouped', async (req, res) => {
  const groups = Array.isArray(req.body.groups) ? req.body.groups : [];
  if (!groups.length) return res.status(400).json({ error: 'Nada para importar' });

  const uniq = arr => [...new Set((arr || []).map(s => String(s).trim()).filter(Boolean))].sort();
  // Categoria = primeiro nome do produto (ex.: "CANECA ALUMÍNIO" → CANECA)
  const categoriaDe = (nm) => {
    const n = String(nm || '').toUpperCase().trim();
    if (n.startsWith('LONG DRINK')) return 'LONG DRINK';
    if (n.startsWith('PORTA ')) return 'PORTA GARRAFA';
    return n.split(/\s+/)[0] || 'OUTROS';
  };
  const catCache = new Map();
  async function categoriaId(catName) {
    if (catCache.has(catName)) return catCache.get(catName);
    let { data: cat } = await supabase.from('CATEGORIAS').select('id')
      .eq('tenant_id', req.tenantId).ilike('name', catName).limit(1).maybeSingle();
    if (!cat) {
      const r = await supabase.from('CATEGORIAS').insert({ tenant_id: req.tenantId, name: catName }).select('id').single();
      cat = r.data;
    }
    const id = cat?.id || null;
    catCache.set(catName, id);
    return id;
  }

  let created = 0, updated = 0, skipped = 0;
  const errors = [];

  try {
    for (const g of groups) {
      const name = String(g.name || '').trim().toUpperCase();
      if (name.length < 3) { skipped++; continue; }
      const variations = { colors: uniq(g.colors), borders: uniq(g.borders), volumes: uniq(g.volumes) };
      const catId = await categoriaId(categoriaDe(name));

      // já existe um produto com esse nome neste tenant?
      let existing = null;
      try {
        const { data } = await supabase.from('PRODUTOS').select('id, variations')
          .eq('tenant_id', req.tenantId).eq('name', name).limit(1).maybeSingle();
        existing = data;
      } catch { /* coluna variations pode não existir ainda */
        const { data } = await supabase.from('PRODUTOS').select('id')
          .eq('tenant_id', req.tenantId).eq('name', name).limit(1).maybeSingle();
        existing = data;
      }

      if (existing) {
        const cur = existing.variations || {};
        const merged = {
          colors: uniq([...(cur.colors || []), ...variations.colors]),
          borders: uniq([...(cur.borders || []), ...variations.borders]),
          volumes: uniq([...(cur.volumes || []), ...variations.volumes]),
        };
        let { error } = await supabase.from('PRODUTOS').update({ variations: merged, category_id: catId })
          .eq('id', existing.id).eq('tenant_id', req.tenantId);
        if (error && /variations/i.test(error.message || '')) {
          ({ error } = await supabase.from('PRODUTOS').update({ category_id: catId })
            .eq('id', existing.id).eq('tenant_id', req.tenantId));
        }
        if (error) errors.push(`${name}: ${error.message}`); else updated++;
        continue;
      }

      // novo produto
      const baseRow = {
        tenant_id: req.tenantId, name, unit: 'UN', category_id: catId,
        sale_price: 0, cost_price: 0, current_stock: 0, is_active: true,
      };
      const fullRow = { ...baseRow, min_order_qty: 10, store_group: name, variations };
      let { error } = await supabase.from('PRODUTOS').insert(fullRow);
      if (error && /(variations|min_order_qty|store_group)/i.test(error.message || '')) {
        ({ error } = await supabase.from('PRODUTOS').insert(baseRow)); // colunas novas ausentes
      }
      if (error) { errors.push(`${name}: ${error.message}`); skipped++; } else created++;
    }
    audit(req, 'create', 'product_import', null, { created, updated, skipped });
    res.json({ created, updated, skipped, errors: errors.slice(0, 20), total: groups.length });
  } catch (err) {
    res.status(500).json({ error: err.message, created, updated, skipped });
  }
});

// Exclusão DEFINITIVA do produto (apaga de verdade)
router.post('/:id/delete', async (req, res) => {
  try {
    const { error } = await supabase
      .from('PRODUTOS')
      .delete()
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId);

    if (error) {
      if (/foreign key|viola|constraint/i.test(error.message || '')) {
        return res.status(409).json({
          error: 'Este produto tem movimentações ou vendas vinculadas. Rode a migração 022 para liberar a exclusão, ou apenas desative o produto.',
        });
      }
      throw error;
    }
    audit(req, 'delete', 'product', req.params.id, { hard: true });
    res.json({ message: 'Produto excluído definitivamente' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── Variantes ────────────────────────────────────────────────────
router.get('/:id/variants', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('VARIANTES_PRODUTO')
      .select('*')
      .eq('product_id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .order('type')
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/variants', async (req, res) => {
  const { name, type, value, extra_price } = req.body;
  if (!name || !value) return res.status(400).json({ error: 'Nome e valor são obrigatórios' });
  try {
    const { data, error } = await supabase
      .from('VARIANTES_PRODUTO')
      .insert({
        tenant_id: req.tenantId,
        product_id: req.params.id,
        name: name || value,
        type: type || 'custom',
        value,
        extra_price: parseFloat(extra_price) || 0,
        is_active: true,
      })
      .select()
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id/variants/:variantId', async (req, res) => {
  try {
    const { error } = await supabase
      .from('VARIANTES_PRODUTO')
      .delete()
      .eq('id', req.params.variantId)
      .eq('product_id', req.params.id)
      .eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json({ message: 'Variante removida' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
