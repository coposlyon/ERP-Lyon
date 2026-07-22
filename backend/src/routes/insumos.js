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

const COST_SOURCES = ['manual', 'compra', 'nfe'];
const clean = body => {
  const out = {};
  const str = (k, max) => { if (body[k] !== undefined) out[k] = body[k] == null ? null : String(body[k]).trim().slice(0, max) || null; };
  str('category', 80); str('name', 160); str('supplier_name', 160); str('notes', 4000);
  if (body.supplier_id !== undefined) out.supplier_id = body.supplier_id || null;
  if (body.product_id !== undefined) out.product_id = body.product_id || null;
  if (body.base_unit !== undefined) out.base_unit = String(body.base_unit || 'ml').trim().slice(0, 12) || 'ml';
  if (body.package_qty !== undefined) out.package_qty = Math.max(Number(body.package_qty) || 0, 0);
  if (body.package_price !== undefined) out.package_price = Math.max(Number(body.package_price) || 0, 0);
  if (body.cost_method !== undefined) out.cost_method = body.cost_method === 'vida_util' ? 'vida_util' : 'consumo';
  if (body.consumption !== undefined) out.consumption = Math.max(Number(body.consumption) || 0, 0);
  if (body.lifespan !== undefined) out.lifespan = Math.max(Number(body.lifespan) || 0, 0);
  if (body.min_stock !== undefined) out.min_stock = Math.max(Number(body.min_stock) || 0, 0);
  if (body.cost_source !== undefined) out.cost_source = COST_SOURCES.includes(body.cost_source) ? body.cost_source : 'manual';
  if (body.is_active !== undefined) out.is_active = !!body.is_active;
  return out;
};

// Grava um ponto no histórico de preço (silencioso se a 053 faltar)
async function logPreco(tenantId, insumo, extra = {}) {
  try {
    const qty = Number(insumo.package_qty) || 0;
    await supabase.from('INSUMO_PRECOS').insert({
      tenant_id: tenantId,
      insumo_id: insumo.id,
      supplier_id: insumo.supplier_id || null,
      supplier_name: insumo.supplier_name || null,
      package_qty: qty,
      package_price: Number(insumo.package_price) || 0,
      unit_cost: qty > 0 ? (Number(insumo.package_price) || 0) / qty : 0,
      source: extra.source || insumo.cost_source || 'manual',
      reference: extra.reference || null,
      user_name: extra.user_name || null,
    });
  } catch { /* migração 053 pendente */ }
}

// Estoque e última compra vêm do PRODUTO vinculado — compras e estoque
// já rodam sobre PRODUTOS, então não criamos uma segunda fonte de verdade.
async function enrichEstoque(tenantId, rows) {
  const ids = [...new Set(rows.map(i => i.product_id).filter(Boolean))];
  if (!ids.length) return rows.map(i => ({ ...i, stock: null, last_purchase: null }));

  let stockMap = {};
  try {
    const { data } = await supabase.from('PRODUTOS')
      .select('id, current_stock, unit').eq('tenant_id', tenantId).in('id', ids);
    stockMap = Object.fromEntries((data || []).map(p => [p.id, p]));
  } catch { /* sem coluna de estoque */ }

  // Última compra de cada produto (preço real pago)
  let lastBuy = {};
  try {
    const { data } = await supabase.from('COMPRA_ITENS')
      .select('product_id, quantity, unit_price, total, COMPRAS(number, created_at, status)')
      .eq('tenant_id', tenantId).in('product_id', ids)
      .order('created_at', { ascending: false }).limit(500);
    for (const it of data || []) {
      if (!it.product_id || lastBuy[it.product_id]) continue;
      lastBuy[it.product_id] = {
        unit_price: Number(it.unit_price) || 0,
        quantity: Number(it.quantity) || 0,
        number: it.COMPRAS?.number || null,
        date: it.COMPRAS?.created_at || null,
      };
    }
  } catch { /* sem compras */ }

  return rows.map(i => ({
    ...i,
    stock: i.product_id ? (Number(stockMap[i.product_id]?.current_stock) || 0) : null,
    last_purchase: i.product_id ? (lastBuy[i.product_id] || null) : null,
  }));
}

// Marca reposição quando o saldo bate no mínimo
const withAlert = i => ({
  ...i,
  precisa_repor: i.stock != null && Number(i.min_stock) > 0 && Number(i.stock) <= Number(i.min_stock),
});

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

    // Nº de fornecedores cadastrados por insumo
    try {
      const { data: forn } = await supabase.from('INSUMO_FORNECEDORES')
        .select('insumo_id').eq('tenant_id', req.tenantId);
      const cont = {};
      for (const f of forn || []) cont[f.insumo_id] = (cont[f.insumo_id] || 0) + 1;
      rows = rows.map(i => ({ ...i, fornecedores_count: cont[i.id] || 0 }));
    } catch { /* migração 053 pendente */ }

    rows = (await enrichEstoque(req.tenantId, rows)).map(withAlert);

    if (req.query.search) {
      const s = String(req.query.search).toLowerCase();
      rows = rows.filter(i => (i.name || '').toLowerCase().includes(s) || (i.category || '').toLowerCase().includes(s));
    }
    if (req.query.repor) rows = rows.filter(i => i.precisa_repor);
    res.json(rows);
  } catch (err) {
    if (missing(err)) return migErr(res);
    console.error('[insumos/list]', err.message);
    res.status(500).json({ error: 'Erro ao listar insumos' });
  }
});

// ── Fornecedores do insumo ────────────────────────────────
router.get('/:id/fornecedores', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMO_FORNECEDORES')
      .select('*, FORNECEDORES(name)')
      .eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id)
      .order('is_default', { ascending: false }).order('package_price');
    if (error) throw error;
    res.json((data || []).map(f => ({
      ...f,
      supplier: f.FORNECEDORES?.name || f.supplier_name || '—',
      unit_cost: Number(f.package_qty) > 0 ? r6(Number(f.package_price) / Number(f.package_qty)) : 0,
    })));
  } catch (err) {
    if (missing(err)) return migErr(res);
    res.status(500).json({ error: 'Erro ao listar fornecedores do insumo' });
  }
});

router.post('/:id/fornecedores', async (req, res) => {
  const b = req.body || {};
  const qty = Number(b.package_qty) || 0;
  if (!(qty > 0)) return res.status(400).json({ error: 'Informe a quantidade da embalagem' });
  try {
    const row = {
      tenant_id: req.tenantId, insumo_id: req.params.id,
      supplier_id: b.supplier_id || null,
      supplier_name: b.supplier_id ? null : (String(b.supplier_name || '').trim() || null),
      package_qty: qty,
      package_price: Math.max(Number(b.package_price) || 0, 0),
      lead_time_days: b.lead_time_days ? parseInt(b.lead_time_days) : null,
      is_default: !!b.is_default,
      notes: String(b.notes || '').trim() || null,
    };
    if (row.is_default) {
      await supabase.from('INSUMO_FORNECEDORES').update({ is_default: false })
        .eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id);
    }
    const { data, error } = await supabase.from('INSUMO_FORNECEDORES').insert(row).select().single();
    if (error) throw error;

    // Fornecedor padrão passa a definir o custo do insumo (e vira histórico)
    if (row.is_default) {
      const { data: ins } = await supabase.from('INSUMOS')
        .update({ package_qty: row.package_qty, package_price: row.package_price, cost_source: 'manual', updated_at: new Date().toISOString() })
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
      if (ins) await logPreco(req.tenantId, { ...ins, supplier_name: row.supplier_name }, {
        source: 'manual', user_name: req.user?.name || req.user?.email || null,
      });
    }
    audit(req, 'create', 'insumo_fornecedor', data.id, { insumo: req.params.id });
    res.status(201).json(data);
  } catch (err) {
    if (missing(err)) return migErr(res);
    console.error('[insumos/fornecedor]', err.message);
    res.status(500).json({ error: 'Erro ao salvar fornecedor' });
  }
});

router.delete('/:id/fornecedores/:fid', async (req, res) => {
  try {
    await supabase.from('INSUMO_FORNECEDORES').delete()
      .eq('id', req.params.fid).eq('tenant_id', req.tenantId);
    res.json({ success: true });
  } catch (err) {
    if (missing(err)) return migErr(res);
    res.status(500).json({ error: 'Erro ao remover fornecedor' });
  }
});

// ── Histórico de preço ────────────────────────────────────
router.get('/:id/precos', async (req, res) => {
  try {
    const { data, error } = await supabase.from('INSUMO_PRECOS')
      .select('*').eq('tenant_id', req.tenantId).eq('insumo_id', req.params.id)
      .order('created_at', { ascending: false }).limit(100);
    if (error) throw error;
    const rows = data || [];
    // variação entre pontos consecutivos
    const out = rows.map((p, i) => {
      const ant = rows[i + 1];
      const varia = ant && Number(ant.unit_cost) > 0
        ? ((Number(p.unit_cost) - Number(ant.unit_cost)) / Number(ant.unit_cost)) * 100 : null;
      return { ...p, variacao_pct: varia == null ? null : Math.round(varia * 10) / 10 };
    });
    res.json(out);
  } catch (err) {
    if (missing(err)) return migErr(res);
    res.status(500).json({ error: 'Erro ao carregar o histórico de preço' });
  }
});

// ── Alertas de reposição ──────────────────────────────────
router.get('/alertas/reposicao', async (req, res) => {
  try {
    const { data } = await supabase.from('INSUMOS').select('*')
      .eq('tenant_id', req.tenantId).eq('is_active', true);
    const rows = (await enrichEstoque(req.tenantId, (data || []).map(withCost))).map(withAlert);
    res.json(rows.filter(i => i.precisa_repor));
  } catch (err) {
    if (missing(err)) return migErr(res);
    res.status(500).json({ error: 'Erro ao carregar alertas' });
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
    await logPreco(req.tenantId, data, { user_name: req.user?.name || req.user?.email || null });
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
    // preço anterior, para só registrar histórico quando muda de fato
    const { data: antes } = await supabase.from('INSUMOS')
      .select('package_qty, package_price').eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();

    const { data, error } = await supabase.from('INSUMOS')
      .update(c).eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('*, FORNECEDORES(name)').single();
    if (error) throw error;

    const mudouPreco = antes && (
      Number(antes.package_price) !== Number(data.package_price) ||
      Number(antes.package_qty) !== Number(data.package_qty));
    if (mudouPreco) {
      await logPreco(req.tenantId, data, { user_name: req.user?.name || req.user?.email || null });
    }
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
