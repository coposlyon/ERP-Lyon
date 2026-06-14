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
    price_tiers
  } = req.body;

  if (!name) return res.status(400).json({ error: 'Nome do produto é obrigatório' });

  try {
    const { data, error } = await supabase
      .from('PRODUTOS')
      .insert({
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
      })
      .select()
      .single();

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
    price_tiers
  } = req.body;

  try {
    // captura preços atuais para a trilha de auditoria
    const { data: before } = await supabase
      .from('PRODUTOS')
      .select('cost_price, sale_price')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .maybeSingle();

    const { data, error } = await supabase
      .from('PRODUTOS')
      .update({
        name: name ? name.toUpperCase() : name,
        code, ean, description, category_id,
        cost_price, sale_price, min_stock, ncm, cst, cfop, is_active,
        supplier_id: supplier_id || null,
        height: height || null, weight: weight || null, thickness: thickness || null,
        base_circumference: base_circumference || null,
        mouth_circumference: mouth_circumference || null,
        length: length || null, width: width || null,
        price_tiers: price_tiers || [],
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

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
