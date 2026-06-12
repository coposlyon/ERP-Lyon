const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/', async (req, res) => {
  const { page = 1, limit = 50, status, type, start_date, end_date, search } = req.query;
  const offset = (page - 1) * limit;

  try {
    // If searching by customer name, first resolve matching customer IDs
    let customerIds = null;
    if (search) {
      const { data: customers } = await supabase
        .from('CLIENTES')
        .select('id')
        .eq('tenant_id', req.tenantId)
        .ilike('name', `%${search}%`)
        .limit(200);
      customerIds = (customers || []).map(c => c.id);
      if (customerIds.length === 0) {
        return res.json({ data: [], total: 0, page: Number(page), limit: Number(limit) });
      }
    }

    let query = supabase
      .from('VENDAS')
      .select('*, CLIENTES(id, name, cpf_cnpj), USUARIOS(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (type) query = query.eq('type', type);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date + 'T23:59:59');
    if (customerIds) query = query.in('customer_id', customerIds);
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
    const { data: sale, error: saleError } = await supabase
      .from('VENDAS')
      .select('*, CLIENTES(*), USUARIOS(name)')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (saleError || !sale) return res.status(404).json({ error: 'Venda não encontrada' });

    const { data: items } = await supabase
      .from('VENDA_ITENS')
      .select('*, PRODUTOS(id, name, code, unit)')
      .eq('sale_id', req.params.id);

    const { data: payments } = await supabase
      .from('LANCAMENTOS')
      .select('*')
      .eq('reference_type', 'sale')
      .eq('reference_id', req.params.id);

    res.json({ ...sale, items: items || [], payments: payments || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  const { customer_id, type, items, notes, discount, delivery_date, artwork_url, artwork_notes, payment_method } = req.body;

  if (!items || items.length === 0) {
    return res.status(400).json({ error: 'A venda deve ter ao menos um item' });
  }

  // Apenas admin/gerente podem praticar preço abaixo da tabela;
  // para os demais o servidor aplica o preço oficial (faixas/sale_price)
  const allowOverride = ['admin', 'manager'].includes(req.userProfile?.role);

  try {
    const { data, error } = await supabase.rpc('criar_venda', {
      _tenant_id:            req.tenantId,
      _user_id:              req.user.id,
      _customer_id:          customer_id || null,
      _type:                 type || 'sale',
      _items:                items,
      _discount:             Number(discount) || 0,
      _payment_method:       payment_method || null,
      _notes:                notes || null,
      _delivery_date:        delivery_date || null,
      _artwork_url:          artwork_url || null,
      _artwork_notes:        artwork_notes || null,
      _allow_price_override: allowOverride,
    });

    if (error) {
      // Função ainda não existe no banco (migração pendente) → caminho legado
      if (/criar_venda/i.test(error.message) && /function|não existe|does not exist/i.test(error.message)) {
        return legacyCreateSale(req, res);
      }
      // Erros de negócio da função (RAISE EXCEPTION) viram 400 legíveis
      return res.status(400).json({ error: error.message.replace(/^.*?:\s*/, '') });
    }

    res.status(201).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Caminho legado (não transacional) — usado apenas enquanto a função
// criar_venda não tiver sido criada no banco via MIGRATIONS.sql
async function legacyCreateSale(req, res) {
  const { customer_id, type, items, notes, discount, delivery_date, artwork_url, artwork_notes, payment_method } = req.body;
  try {
    const { data: nextNumber } = await supabase
      .rpc('proximo_numero_venda', { p_tenant_id: req.tenantId });

    const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.unit_price), 0);
    const totalDiscount = discount || 0;
    const total = subtotal - totalDiscount;

    const { data: sale, error: saleError } = await supabase
      .from('VENDAS')
      .insert({
        tenant_id: req.tenantId,
        number: nextNumber,
        type: type || 'sale',
        customer_id,
        user_id: req.user.id,
        status: 'confirmed',
        subtotal,
        discount: totalDiscount,
        total,
        notes,
        artwork_url,
        artwork_notes,
        delivery_date,
        payment_method,
      })
      .select()
      .single();

    if (saleError) throw saleError;

    const saleItems = items.map(item => ({
      sale_id: sale.id,
      product_id: item.product_id,
      quantity: item.quantity,
      unit_price: item.unit_price,
      discount: item.discount || 0,
      total: item.quantity * item.unit_price - (item.discount || 0),
      customization: item.customization || null,
    }));

    const { error: itemsError } = await supabase.from('VENDA_ITENS').insert(saleItems);
    if (itemsError) throw itemsError;

    for (const item of items) {
      await supabase.rpc('atualizar_estoque', {
        p_tenant_id: req.tenantId,
        p_product_id: item.product_id,
        p_quantity: -item.quantity,
        p_type: 'exit',
        p_reference_type: 'sale',
        p_reference_id: sale.id,
        p_user_id: req.user.id,
      });
    }

    res.status(201).json(sale);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['open', 'confirmed', 'in_production', 'ready', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  try {
    const { data, error } = await supabase
      .from('VENDAS')
      .update({ status })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
