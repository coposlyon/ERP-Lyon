const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// ════════════════════════════════════════════════════════════
// ENGENHARIA DE CUSTOS — INSUMOS
// Catálogo central de materiais. Custo por unidade base e custo
// por peça (por consumo ou por vida útil) são calculados aqui —
// fonte única para o Processo de Produção e a Formação de Preço.
// ════════════════════════════════════════════════════════════

const r6 = v => Math.round((Number(v) || 0) * 1e6) / 1e6;
const r4 = v => Math.round((Number(v) || 0) * 1e4) / 1e4;

// Enriqumece um insumo com os custos derivados
function withCost(i) {
  const qty = Number(i.package_qty) || 0;
  const price = Number(i.package_price) || 0;
  const unitCost = qty > 0 ? price / qty : 0; // R$ por base_unit
  let costPerPiece = 0;
  if (i.cost_method === 'vida_util') {
    const life = Number(i.lifespan) || 0;
    costPerPiece = life > 0 ? price / life : 0;
  } else {
    costPerPiece = unitCost * (Number(i.consumption) || 0);
  }
  return { ...i, unit_cost: r6(unitCost), cost_per_piece: r6(costPerPiece) };
}

function missing(err) {
  return /INSUMOS|does not exist|42P01|relation .* does not exist/i.test(err?.message || '');
}
function migErr(res) {
  return res.status(400).json({ error: 'Recurso não habilitado: rode a migração 050_insumos.sql no Supabase.', code: 'MIGRATION_050' });
}

const clean = body => {
  const out = {};
  const str = (k, max) => { if (body[k] !== undefined) out[k] = body[k] == null ? null : String(body[k]).trim().slice(0, max) || null; };
  str('category', 80); str('name', 160); str('supplier_name', 160); str('notes', 4000);
  if (body.supplier_id !== undefined) out.supplier_id = body.supplier_id || null;
  if (body.base_unit !== undefined) out.base_unit = String(body.base_unit || 'ml').trim().slice(0, 12) || 'ml';
  if (body.package_qty !== undefined) out.package_qty = Math.max(Number(body.package_qty) || 0, 0);
  if (body.package_price !== undefined) out.package_price = Math.max(Number(body.package_price) || 0, 0);
  if (body.cost_method !== undefined) out.cost_method = body.cost_method === 'vida_util' ? 'vida_util' : 'consumo';
  if (body.consumption !== undefined) out.consumption = Math.max(Number(body.consumption) || 0, 0);
  if (body.lifespan !== undefined) out.lifespan = Math.max(Number(body.lifespan) || 0, 0);
  if (body.is_active !== undefined) out.is_active = !!body.is_active;
  return out;
};

// GET /insumos?category=&search=&all=1
router.get('/', async (req, res) => {
  try {
    let q = supabase.from('INSUMOS')
      .select('*, FORNECEDORES(name)')
      .eq('tenant_id', req.tenantId)
      .order('category').order('name');
    if (!req.query.all) q = q.eq('is_active', true);
    if (req.query.category) q = q.eq('category', req.query.category);
    const { data, error } = await q;
    if (error) throw error;
    let rows = (data || []).map(withCost).map(i => ({ ...i, supplier: i.FORNECEDORES?.name || i.supplier_name || null }));
    if (req.query.search) {
      const s = String(req.query.search).toLowerCase();
      rows = rows.filter(i => (i.name || '').toLowerCase().includes(s) || (i.category || '').toLowerCase().includes(s));
    }
    res.json(rows);
  } catch (err) {
    if (missing(err)) return migErr(res);
    console.error('[insumos/list]', err.message);
    res.status(500).json({ error: 'Erro ao listar insumos' });
  }
});

// POST /insumos
router.post('/', async (req, res) => {
  const c = clean(req.body);
  if (!c.category) return res.status(400).json({ error: 'Informe a categoria' });
  if (!c.name) return res.status(400).json({ error: 'Informe o nome do insumo' });
  if (!(c.package_qty > 0)) return res.status(400).json({ error: 'O volume/quantidade da embalagem deve ser maior que zero' });
  try {
    const { data, error } = await supabase.from('INSUMOS')
      .insert({ tenant_id: req.tenantId, ...c }).select('*, FORNECEDORES(name)').single();
    if (error) throw error;
    audit(req, 'create', 'insumo', data.id, { name: c.name, category: c.category });
    res.status(201).json(withCost({ ...data, supplier: data.FORNECEDORES?.name || data.supplier_name || null }));
  } catch (err) {
    if (missing(err)) return migErr(res);
    console.error('[insumos/create]', err.message);
    res.status(500).json({ error: 'Erro ao salvar insumo' });
  }
});

// PUT /insumos/:id
router.put('/:id', async (req, res) => {
  const c = clean(req.body);
  c.updated_at = new Date().toISOString();
  try {
    const { data, error } = await supabase.from('INSUMOS')
      .update(c).eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('*, FORNECEDORES(name)').single();
    if (error) throw error;
    audit(req, 'update', 'insumo', data.id, c);
    res.json(withCost({ ...data, supplier: data.FORNECEDORES?.name || data.supplier_name || null }));
  } catch (err) {
    if (missing(err)) return migErr(res);
    console.error('[insumos/update]', err.message);
    res.status(500).json({ error: 'Erro ao atualizar insumo' });
  }
});

// DELETE /insumos/:id (desativa)
router.delete('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMOS')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select('id, name').single();
    if (error) throw error;
    audit(req, 'delete', 'insumo', data.id, { name: data.name });
    res.json({ success: true });
  } catch (err) {
    if (missing(err)) return migErr(res);
    console.error('[insumos/delete]', err.message);
    res.status(500).json({ error: 'Erro ao remover insumo' });
  }
});

module.exports = router;
