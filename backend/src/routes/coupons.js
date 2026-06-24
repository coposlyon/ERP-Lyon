const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

const norm = c => String(c || '').trim().toUpperCase().replace(/\s+/g, '');

// Calcula o desconto que o cupom dá sobre um total.
function calcDiscount(coupon, total) {
  const t = Number(total) || 0;
  if (coupon.discount_type === 'percent') {
    return Math.min(t, Math.round(t * (Number(coupon.discount_value) || 0)) / 100);
  }
  return Math.min(t, Number(coupon.discount_value) || 0);
}

// Verifica se o cupom pode ser usado e devolve o motivo quando não pode.
async function checkCoupon(tenantId, coupon, total, customerId) {
  if (!coupon) return { ok: false, reason: 'Cupom não encontrado.' };
  if (!coupon.active) return { ok: false, reason: 'Cupom inativo.' };
  const today = new Date().toISOString().slice(0, 10);
  if (coupon.valid_from && today < coupon.valid_from) return { ok: false, reason: 'Cupom ainda não está válido.' };
  if (coupon.valid_until && today > coupon.valid_until) return { ok: false, reason: 'Cupom expirado.' };
  if (coupon.max_uses != null && coupon.used_count >= coupon.max_uses) return { ok: false, reason: 'Cupom esgotado.' };
  if (Number(total) < (Number(coupon.min_total) || 0)) {
    return { ok: false, reason: `Pedido mínimo de R$ ${Number(coupon.min_total).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.` };
  }
  if (coupon.customer_id && customerId && coupon.customer_id !== customerId) {
    return { ok: false, reason: 'Cupom exclusivo de outro cliente.' };
  }
  if (coupon.customer_id && !customerId) {
    return { ok: false, reason: 'Cupom exige o cliente identificado.' };
  }
  if (coupon.per_customer != null && customerId) {
    const { count } = await supabase.from('CUPONS_USOS').select('*', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('coupon_id', coupon.id).eq('customer_id', customerId);
    if ((count || 0) >= coupon.per_customer) return { ok: false, reason: 'Você já usou este cupom o número máximo de vezes.' };
  }
  return { ok: true };
}

async function findByCode(tenantId, code) {
  const { data } = await supabase.from('CUPONS').select('*').eq('tenant_id', tenantId).ilike('code', norm(code)).maybeSingle();
  return data;
}

// ── Listagem / CRUD ──────────────────────────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase.from('CUPONS').select('*')
      .eq('tenant_id', req.tenantId).order('created_at', { ascending: false });
    if (error) throw error;
    // anexa o nome do cliente exclusivo (se houver)
    const ids = [...new Set((data || []).map(c => c.customer_id).filter(Boolean))];
    let names = {};
    if (ids.length) {
      const { data: cl } = await supabase.from('CLIENTES').select('id, name, display_id').in('id', ids);
      names = Object.fromEntries((cl || []).map(c => [c.id, c]));
    }
    res.json({ data: (data || []).map(c => ({ ...c, customer: c.customer_id ? names[c.customer_id] : null })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', async (req, res) => {
  const b = req.body || {};
  const code = norm(b.code);
  if (!code) return res.status(400).json({ error: 'Informe o código do cupom.' });
  if (!['percent', 'value'].includes(b.discount_type)) return res.status(400).json({ error: 'Tipo de desconto inválido.' });
  if (!(Number(b.discount_value) > 0)) return res.status(400).json({ error: 'Informe o valor do desconto.' });
  if (b.discount_type === 'percent' && Number(b.discount_value) > 100) return res.status(400).json({ error: 'Percentual não pode passar de 100%.' });
  try {
    const exists = await findByCode(req.tenantId, code);
    if (exists) return res.status(409).json({ error: 'Já existe um cupom com esse código.' });
    const payload = {
      tenant_id: req.tenantId,
      code,
      description: b.description || null,
      discount_type: b.discount_type,
      discount_value: Number(b.discount_value),
      min_total: Number(b.min_total) || 0,
      max_uses: b.max_uses ? Number(b.max_uses) : null,
      per_customer: b.per_customer ? Number(b.per_customer) : null,
      customer_id: b.customer_id || null,
      valid_from: b.valid_from || null,
      valid_until: b.valid_until || null,
      active: b.active !== false,
    };
    const { data, error } = await supabase.from('CUPONS').insert(payload).select().single();
    if (error) throw error;
    audit(req, 'create', 'coupon', data.id, { code });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', async (req, res) => {
  const b = req.body || {};
  try {
    const patch = {
      description: b.description ?? null,
      discount_type: b.discount_type,
      discount_value: Number(b.discount_value),
      min_total: Number(b.min_total) || 0,
      max_uses: b.max_uses ? Number(b.max_uses) : null,
      per_customer: b.per_customer ? Number(b.per_customer) : null,
      customer_id: b.customer_id || null,
      valid_from: b.valid_from || null,
      valid_until: b.valid_until || null,
      active: b.active !== false,
      updated_at: new Date().toISOString(),
    };
    if (b.code) patch.code = norm(b.code);
    const { data, error } = await supabase.from('CUPONS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'coupon', req.params.id, {});
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('CUPONS').delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) {
      // tem usos vinculados → apenas desativa
      await supabase.from('CUPONS').update({ active: false }).eq('id', req.params.id).eq('tenant_id', req.tenantId);
    }
    audit(req, 'delete', 'coupon', req.params.id, {});
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Validar (calcula o desconto sem consumir) ────────────────────────
router.post('/validate', async (req, res) => {
  const { code, total, customer_id } = req.body || {};
  try {
    const coupon = await findByCode(req.tenantId, code);
    const chk = await checkCoupon(req.tenantId, coupon, total, customer_id || null);
    if (!chk.ok) return res.status(400).json({ error: chk.reason });
    const discount = calcDiscount(coupon, total);
    if (discount <= 0) return res.status(400).json({ error: 'Cupom não gera desconto para este valor.' });
    res.json({
      coupon_id: coupon.id, code: coupon.code, description: coupon.description,
      discount_type: coupon.discount_type, discount_value: coupon.discount_value, discount,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Resgatar (consome 1 uso) — chamado ao finalizar a venda ──────────
router.post('/redeem', async (req, res) => {
  const { coupon_id, customer_id, sale_id, discount } = req.body || {};
  if (!coupon_id) return res.status(400).json({ error: 'coupon_id é obrigatório' });
  try {
    const { data: coupon } = await supabase.from('CUPONS').select('*').eq('id', coupon_id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!coupon) return res.status(404).json({ error: 'Cupom não encontrado' });
    await supabase.from('CUPONS_USOS').insert({
      tenant_id: req.tenantId, coupon_id, customer_id: customer_id || null,
      sale_id: sale_id || null, discount: Number(discount) || 0,
    });
    await supabase.from('CUPONS').update({ used_count: (coupon.used_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq('id', coupon_id).eq('tenant_id', req.tenantId);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
module.exports.findByCode = findByCode;
module.exports.checkCoupon = checkCoupon;
module.exports.calcDiscount = calcDiscount;
