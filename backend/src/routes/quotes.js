const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { sendEmail } = require('../lib/email');
const { sendWhatsApp } = require('../lib/whatsapp');

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Listar orçamentos
router.get('/', async (req, res) => {
  const { page = 1, limit = 20, status, search, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;
  try {
    let q = supabase.from('ORCAMENTOS')
      .select('*, CLIENTES(id,name,cpf_cnpj)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    if (start_date) q = q.gte('created_at', start_date);
    if (end_date) q = q.lte('created_at', end_date + 'T23:59:59');
    q = q.range(offset, offset + limit - 1);
    const { data, error, count } = await q;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Buscar orçamento por ID
router.get('/:id', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ORCAMENTOS')
      .select('*, CLIENTES(id,name,cpf_cnpj,phone,email), ORCAMENTO_ITENS(*, PRODUTOS(id,name,unit,sale_price))')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !data) return res.status(404).json({ error: 'Orçamento não encontrado' });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar orçamento
router.post('/', async (req, res) => {
  const { customer_id, items = [], notes, valid_until, artwork_notes, payment_method, delivery_days, discount = 0 } = req.body;
  if (!items.length) return res.status(400).json({ error: 'Adicione pelo menos um item' });
  try {
    const { data: numData } = await supabase.rpc('proximo_numero_orcamento', { p_tenant_id: req.tenantId });
    const number = numData || 1;
    const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
    const total = subtotal - (discount || 0);
    const { data: quote, error } = await supabase.from('ORCAMENTOS').insert({
      tenant_id: req.tenantId, user_id: req.userId, number,
      customer_id: customer_id || null, subtotal, discount, total,
      notes, valid_until, artwork_notes, payment_method,
      delivery_days: delivery_days || 10, status: 'open',
    }).select().single();
    if (error) throw error;

    const quoteItems = items.map(i => ({
      quote_id: quote.id,
      product_id: i.product_id || null,
      product_name: i.product_name,
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount: i.discount || 0,
      total: (i.quantity * i.unit_price) - (i.discount || 0),
      customization: i.customization || {},
    }));
    const { error: itemsError } = await supabase.from('ORCAMENTO_ITENS').insert(quoteItems);
    if (itemsError) throw itemsError;

    res.status(201).json(quote);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualizar orçamento
router.put('/:id', async (req, res) => {
  const { customer_id, items, notes, valid_until, artwork_notes, payment_method, delivery_days, discount = 0, status } = req.body;
  try {
    let updateData = { notes, valid_until, artwork_notes, payment_method, delivery_days, status, discount, updated_at: new Date().toISOString() };
    if (customer_id !== undefined) updateData.customer_id = customer_id;

    if (items) {
      const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price), 0);
      updateData.subtotal = subtotal;
      updateData.total = subtotal - (discount || 0);
      await supabase.from('ORCAMENTO_ITENS').delete().eq('quote_id', req.params.id);
      const quoteItems = items.map(i => ({
        quote_id: req.params.id, product_id: i.product_id || null,
        product_name: i.product_name, quantity: i.quantity, unit_price: i.unit_price,
        discount: i.discount || 0, total: (i.quantity * i.unit_price) - (i.discount || 0),
        customization: i.customization || {},
      }));
      await supabase.from('ORCAMENTO_ITENS').insert(quoteItems);
    }

    const { data, error } = await supabase.from('ORCAMENTOS')
      .update(updateData).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Converter orçamento em venda
router.post('/:id/convert', async (req, res) => {
  try {
    const { data: quote, error: qErr } = await supabase.from('ORCAMENTOS')
      .select('*, ORCAMENTO_ITENS(*)').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (qErr || !quote) return res.status(404).json({ error: 'Orçamento não encontrado' });
    if (quote.status === 'converted') return res.status(400).json({ error: 'Orçamento já foi convertido' });

    const { data: numData } = await supabase.rpc('proximo_numero_venda', { p_tenant_id: req.tenantId });
    const baseSale = {
      tenant_id: req.tenantId, user_id: req.userId, number: numData || 1,
      customer_id: quote.customer_id, subtotal: quote.subtotal,
      discount: quote.discount, total: quote.total,
      notes: quote.notes, payment_method: quote.payment_method,
      status: 'confirmed',
    };
    // carrega data do evento / prazo do orçamento (podem não existir ainda)
    const extra = {};
    if (quote.event_date)        extra.event_date = quote.event_date;
    if (quote.max_delivery_date) extra.max_delivery_date = quote.max_delivery_date;
    let { data: sale, error: sErr } = await supabase.from('VENDAS').insert({ ...baseSale, ...extra }).select().single();
    if (sErr && /(event_date|max_delivery_date)/i.test(sErr.message || '')) {
      ({ data: sale, error: sErr } = await supabase.from('VENDAS').insert(baseSale).select().single());
    }
    if (sErr) throw sErr;

    const saleItems = (quote.ORCAMENTO_ITENS || []).map(i => ({
      sale_id: sale.id, product_id: i.product_id, product_name: i.product_name,
      quantity: i.quantity, unit_price: i.unit_price, discount: i.discount, total: i.total,
      customization: i.customization,
    }));
    if (saleItems.length) await supabase.from('VENDA_ITENS').insert(saleItems);
    await supabase.from('ORCAMENTOS').update({ status: 'converted', converted_sale_id: sale.id })
      .eq('id', req.params.id);

    res.json({ sale, message: 'Orçamento convertido em venda com sucesso!' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Alterar status
router.patch('/:id/status', async (req, res) => {
  const { status } = req.body;
  const allowed = ['open','sent','approved','rejected','expired','converted'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Status inválido' });
  try {
    const { data, error } = await supabase.from('ORCAMENTOS')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enviar orçamento ao cliente por e-mail ou WhatsApp
router.post('/:id/send', async (req, res) => {
  const channel = req.body.channel === 'whatsapp' ? 'whatsapp' : 'email';
  try {
    const { data: quote } = await supabase
      .from('ORCAMENTOS')
      .select('*, CLIENTES(name, email, phone), ORCAMENTO_ITENS(product_name, quantity, unit_price, total)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!quote) return res.status(404).json({ error: 'Orçamento não encontrado' });

    const cust = quote.CLIENTES || {};
    const items = quote.ORCAMENTO_ITENS || [];
    const num = String(quote.number || '').padStart(4, '0');

    if (channel === 'whatsapp') {
      if (!cust.phone) return res.status(400).json({ error: 'Cliente sem telefone cadastrado' });
      const lines = items.map(i => `• ${i.quantity}x ${i.product_name} — ${brl(i.total)}`).join('\n');
      const msg = `Olá ${cust.name || ''}! 👋\n\nSegue seu orçamento Nº ${num}:\n\n${lines}\n\n*Total: ${brl(quote.total)}*\nPrazo de entrega: ${quote.delivery_days || 10} dias.\n\nQualquer dúvida, estou à disposição!`;
      const r = await sendWhatsApp(cust.phone, msg);
      if (!r.ok) return res.status(400).json({ error: r.error });
    } else {
      if (!cust.email) return res.status(400).json({ error: 'Cliente sem e-mail cadastrado' });
      const rows = items.map(i => `<tr><td style="padding:6px;border-bottom:1px solid #eee">${i.quantity}x ${i.product_name}</td><td style="padding:6px;border-bottom:1px solid #eee" align="right">${brl(i.total)}</td></tr>`).join('');
      const html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto">
        <h2 style="color:#E8187A">Orçamento Nº ${num}</h2>
        <p>Olá ${cust.name || ''}, segue o seu orçamento:</p>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
        <h3 style="text-align:right">Total: ${brl(quote.total)}</h3>
        <p style="color:#666">Prazo de entrega: ${quote.delivery_days || 10} dias.</p>
      </div>`;
      const r = await sendEmail({ to: cust.email, subject: `Seu orçamento Nº ${num}`, html });
      if (!r.ok) return res.status(400).json({ error: r.error });
    }

    if (quote.status === 'open') {
      await supabase.from('ORCAMENTOS').update({ status: 'sent' }).eq('id', quote.id);
    }
    res.json({ ok: true, channel });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
