const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { custoMedio } = require('../lib/calc');
const { audit } = require('../lib/audit');
const { parseNFe } = require('../lib/nfe');

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('COMPRAS')
      .select('*, FORNECEDORES(id, name, cnpj)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date + 'T23:59:59');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { data: purchase, error } = await supabase
      .from('COMPRAS')
      .select('*, FORNECEDORES(*)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !purchase) return res.status(404).json({ error: 'Compra não encontrada' });

    const { data: items } = await supabase
      .from('COMPRA_ITENS')
      .select('*, PRODUTOS(id, name, code, unit)')
      .eq('purchase_id', req.params.id);

    res.json({ ...purchase, items: items || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Grava o frete da compra (coluna da migração 042; ignora se não existir)
async function setPurchaseFreight(purchaseId, tenantId, freight) {
  const v = Number(freight);
  if (!(v > 0) || !purchaseId) return;
  try {
    await supabase.from('COMPRAS').update({ freight: v })
      .eq('id', purchaseId).eq('tenant_id', tenantId);
  } catch { /* migração 042 pendente */ }
}

router.post('/', async (req, res) => {
  const { supplier_id, items, notes, discount, freight } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'A compra deve ter ao menos um item' });
  }

  try {
    const { data, error } = await supabase.rpc('criar_compra', {
      _tenant_id:   req.tenantId,
      _user_id:     req.user.id,
      _supplier_id: supplier_id || null,
      _items:       items,
      _discount:    Number(discount) || 0,
      _notes:       notes || null,
    });
    if (error) {
      if (/criar_compra/i.test(error.message) && /function|does not exist|não existe|schema cache/i.test(error.message)) {
        return legacyCreatePurchase(req, res);
      }
      return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });
    }
    await setPurchaseFreight(data?.id, req.tenantId, freight);
    audit(req, 'create', 'purchase', data?.id, { number: data?.number, total: data?.total, items: items.length });
    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar o frete de uma compra existente (usado pela Precificação)
router.patch('/:id/freight', async (req, res) => {
  const v = Number(req.body.freight);
  if (!Number.isFinite(v) || v < 0) return res.status(400).json({ error: 'Valor de frete inválido' });
  try {
    const { data, error } = await supabase.from('COMPRAS')
      .update({ freight: v })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId)
      .select('id, number, freight').single();
    if (error) throw error;
    audit(req, 'update', 'purchase_freight', data.id, { number: data.number, freight: v });
    res.json(data);
  } catch (err) {
    if (/freight|42703|schema cache/i.test(err.message || '')) {
      return res.status(400).json({ error: 'Rode a migração 042_precificacao.sql para habilitar o frete nas compras.' });
    }
    res.status(500).json({ error: err.message });
  }
});

// Caminho legado (não transacional) — usado só enquanto a função
// criar_compra não existir no banco (migração 010 pendente).
async function legacyCreatePurchase(req, res) {
  const { supplier_id, items, notes, discount, freight } = req.body;
  try {
    const { data: nextNumber } = await supabase
      .rpc('proximo_numero_compra', { p_tenant_id: req.tenantId });

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalDiscount = discount || 0;
    const total = subtotal - totalDiscount;

    const { data: purchase, error: purchaseError } = await supabase
      .from('COMPRAS')
      .insert({
        tenant_id: req.tenantId,
        number: nextNumber,
        supplier_id,
        user_id: req.user.id,
        status: 'received',
        subtotal,
        discount: totalDiscount,
        total,
        notes,
      })
      .select()
      .single();

    if (purchaseError) throw purchaseError;
    await setPurchaseFreight(purchase.id, req.tenantId, freight);

    const purchaseItems = items.map(item => ({
      purchase_id: purchase.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total: item.quantity * item.unit_price,
    }));

    await supabase.from('COMPRA_ITENS').insert(purchaseItems);

    // Custo médio ponderado: lê o estoque/custo atual ANTES da entrada
    const productIds = [...new Set(items.map(i => i.product_id))];
    const { data: currentProducts } = await supabase
      .from('PRODUTOS').select('id, current_stock, cost_price')
      .eq('tenant_id', req.tenantId).in('id', productIds);
    const before = Object.fromEntries((currentProducts || []).map(p => [p.id, p]));

    for (const item of items) {
      await supabase.rpc('atualizar_estoque', {
        p_tenant_id: req.tenantId,
        p_product_id: item.product_id,
        p_quantity: item.quantity,
        p_type: 'entry',
        p_reference_type: 'purchase',
        p_reference_id: purchase.id,
        p_user_id: req.user.id,
      });

      // Recalcula o custo médio ponderado a cada entrada de compra
      const prev = before[item.product_id];
      if (prev && Number(item.unit_price) > 0) {
        const novoCusto = custoMedio(prev.current_stock, prev.cost_price, item.quantity, item.unit_price);
        await supabase.from('PRODUTOS')
          .update({ cost_price: novoCusto })
          .eq('id', item.product_id).eq('tenant_id', req.tenantId);
      }
    }

    res.status(201).json(purchase);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

// ── Importar NF-e de entrada (XML do fornecedor) ──────────

// Pré-visualização: parseia e mostra o que vai casar/criar (não grava)
router.post('/import-nfe/preview', async (req, res) => {
  const { xml } = req.body;
  if (!xml) return res.status(400).json({ error: 'Envie o XML da NF-e' });
  try {
    const nfe = parseNFe(xml);
    let supplierId = null;
    if (nfe.supplier.cnpj) {
      const { data } = await supabase.from('FORNECEDORES').select('id, name')
        .eq('tenant_id', req.tenantId).eq('cnpj', nfe.supplier.cnpj).maybeSingle();
      supplierId = data?.id || null;
    }
    const codes = nfe.items.map(i => i.code).filter(Boolean);
    const eans  = nfe.items.map(i => i.ean).filter(Boolean);
    const [{ data: byCode }, { data: byEan }] = await Promise.all([
      codes.length ? supabase.from('PRODUTOS').select('id, name, code').eq('tenant_id', req.tenantId).in('code', codes) : Promise.resolve({ data: [] }),
      eans.length  ? supabase.from('PRODUTOS').select('id, name, ean').eq('tenant_id', req.tenantId).in('ean', eans)   : Promise.resolve({ data: [] }),
    ]);
    const codeMap = Object.fromEntries((byCode || []).map(p => [p.code, p]));
    const eanMap  = Object.fromEntries((byEan  || []).map(p => [p.ean, p]));
    const items = nfe.items.map(it => {
      const m = (it.code && codeMap[it.code]) || (it.ean && eanMap[it.ean]) || null;
      return { ...it, matched_product_id: m?.id || null, matched_name: m?.name || null };
    });
    res.json({
      ...nfe,
      supplier: { ...nfe.supplier, matched_id: supplierId },
      summary: {
        new_products: items.filter(i => !i.matched_product_id).length,
        new_supplier: !supplierId,
      },
      items,
    });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// Importa: cria fornecedor/produtos faltantes + compra transacional
router.post('/import-nfe', async (req, res) => {
  const { xml } = req.body;
  if (!xml) return res.status(400).json({ error: 'Envie o XML da NF-e' });
  try {
    const nfe = parseNFe(xml);

    // fornecedor
    let supplierId = null, createdSupplier = false;
    if (nfe.supplier.cnpj) {
      const { data } = await supabase.from('FORNECEDORES').select('id')
        .eq('tenant_id', req.tenantId).eq('cnpj', nfe.supplier.cnpj).maybeSingle();
      supplierId = data?.id || null;
    }
    if (!supplierId) {
      const { data, error } = await supabase.from('FORNECEDORES').insert({
        tenant_id: req.tenantId, name: nfe.supplier.name, cnpj: nfe.supplier.cnpj || null,
        phone: nfe.supplier.phone || null, address: nfe.supplier.address || {}, is_active: true,
      }).select('id').single();
      if (error) throw error;
      supplierId = data.id; createdSupplier = true;
    }

    // produtos
    let createdProducts = 0;
    const items = [];
    for (const it of nfe.items) {
      let prod = null;
      if (it.code) { const { data } = await supabase.from('PRODUTOS').select('id').eq('tenant_id', req.tenantId).eq('code', it.code).maybeSingle(); prod = data; }
      if (!prod && it.ean) { const { data } = await supabase.from('PRODUTOS').select('id').eq('tenant_id', req.tenantId).eq('ean', it.ean).maybeSingle(); prod = data; }
      let productId = prod?.id;
      if (!productId) {
        const { data, error } = await supabase.from('PRODUTOS').insert({
          tenant_id: req.tenantId, name: (it.name || 'Produto').toUpperCase(),
          code: it.code || null, ean: it.ean || null, ncm: it.ncm || null, cfop: it.cfop || null,
          unit: it.unit || 'UN', cost_price: it.unit_price || 0, sale_price: 0,
          supplier_id: supplierId, is_active: true,
        }).select('id').single();
        if (error) throw error;
        productId = data.id; createdProducts++;
      }
      items.push({ product_id: productId, quantity: it.quantity, unit_price: it.unit_price });
    }

    // compra transacional (entrada de estoque + custo médio)
    const { data: purchase, error: pErr } = await supabase.rpc('criar_compra', {
      _tenant_id: req.tenantId, _user_id: req.user.id, _supplier_id: supplierId,
      _items: items, _discount: nfe.discount || 0,
      _notes: `Importado da NF-e ${nfe.number || ''}`.trim(),
    });
    if (pErr) return res.status(400).json({ error: 'Rode a migração 010 (criar_compra) antes de importar NF-e. ' + pErr.message });
    await setPurchaseFreight(purchase?.id, req.tenantId, nfe.freight);

    audit(req, 'import', 'purchase', purchase?.id, { nfe: nfe.number, items: items.length, created_products: createdProducts, created_supplier: createdSupplier });
    res.status(201).json({ purchase, created_products: createdProducts, created_supplier: createdSupplier, items: items.length });
  } catch (err) { res.status(400).json({ error: err.message }); }
});

module.exports = router;
