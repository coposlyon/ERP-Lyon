const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const {
  cotar, rastrear, getFreteConfig, ufFromCep,
  jtReady, jtCriarPedido, jtCancelarPedido, jtEtiqueta,
} = require('../lib/shipping');

// Transportadoras ativas (para escolher no pedido) — acessível ao módulo de vendas
router.get('/carriers', async (req, res) => {
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('id, name, trade_name, whatsapp, phone')
      .eq('tenant_id', req.tenantId).eq('is_active', true).order('name');
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// POST /api/shipping/quote — calcula frete + prazo
router.post('/quote', async (req, res) => {
  try {
    const { cep, qty, weightKg, subtotal } = req.body || {};
    const uf = (req.body?.uf || ufFromCep(cep) || '').toUpperCase();
    if (!uf) return res.status(400).json({ error: 'Informe o estado (UF) ou um CEP de destino.' });
    const r = await cotar(req.tenantId, { uf, cep, qty, weightKg, subtotal });
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// GET /api/shipping/track/:code — rastreia pela J&T
router.get('/track/:code', async (req, res) => {
  try {
    const r = await rastrear(req.tenantId, req.params.code);
    res.json(r);
  } catch (err) { res.status(err.status || 500).json({ error: err.message }); }
});

// GET /api/shipping/config — diz se a J&T está configurada (sem expor a chave)
router.get('/config', async (req, res) => {
  try {
    const c = await getFreteConfig(req.tenantId);
    res.json({
      enabled: c.enabled, has_jt: jtReady(c),
      jt_homolog: /demoopenapi/i.test(c.jt_base_url || ''),
      origin_cep: c.origin_cep, free_above: c.free_above,
      weight_per_unit_g: c.weight_per_unit_g, table_count: (c.table || []).length,
    });
  } catch (err) { res.status(500).json({ error: 'Erro ao carregar configuração de frete' }); }
});

// ── J&T Express: envio a partir de uma venda ──────────────────────────

// Endereços no ERP são JSONB com chaves variadas — leitor tolerante
function addrGet(a, ...keys) {
  if (!a || typeof a !== 'object') return '';
  for (const k of keys) { const v = a[k]; if (v != null && String(v).trim()) return String(v).trim(); }
  return '';
}
const soDigitos = v => String(v || '').replace(/\D/g, '');

// Monta o objeto sender/receiver no formato do addOrder da J&T Brasil
function jtParty({ name, phone, mobile, taxNumber, ieNumber, address }) {
  const street = addrGet(address, 'street', 'logradouro', 'rua');
  const number = addrGet(address, 'number', 'numero');
  const area   = addrGet(address, 'neighborhood', 'bairro', 'district');
  const city   = addrGet(address, 'city', 'cidade', 'localidade');
  const prov   = addrGet(address, 'state', 'uf', 'estado').toUpperCase();
  const zip    = soDigitos(addrGet(address, 'zip', 'cep', 'postal_code'));
  const comp   = addrGet(address, 'complement', 'complemento');
  const p = {
    name: String(name || '').slice(0, 32),
    mobile: soDigitos(mobile || phone).slice(0, 20) || '0000000000',
    phone:  soDigitos(phone || mobile).slice(0, 20) || '0000000000',
    countryCode: 'BRA',
    prov, city, area,
    street, streetNumber: number,
    address: [street && number ? `${street}, ${number}` : street, comp, area].filter(Boolean).join(' - ').slice(0, 150),
    postCode: zip,
    taxNumber: soDigitos(taxNumber),
  };
  if (ieNumber) p.ieNumber = String(ieNumber).trim();
  return p;
}

function partyProblems(p, who) {
  const faltas = [];
  if (!p.street)       faltas.push('rua');
  if (!p.streetNumber) faltas.push('número');
  if (!p.area)         faltas.push('bairro');
  if (!p.city)         faltas.push('cidade');
  if (!p.prov)         faltas.push('UF');
  if (p.postCode.length !== 8) faltas.push('CEP (8 dígitos)');
  if (!p.taxNumber)    faltas.push('CPF/CNPJ');
  return faltas.length ? `${who} sem: ${faltas.join(', ')}` : null;
}

// Dados da venda + empresa + NF para montar o envio
async function loadShipContext(req, saleId) {
  const { data: sale } = await supabase
    .from('VENDAS')
    .select('*, CLIENTES(*), VENDA_ITENS(product_name, quantity, unit_price)')
    .eq('id', saleId).eq('tenant_id', req.tenantId).maybeSingle();
  if (!sale) { const e = new Error('Venda não encontrada'); e.status = 404; throw e; }

  const { data: emp } = await supabase
    .from('EMPRESAS').select('name, phone, email, cnpj, address, settings')
    .eq('id', req.tenantId).maybeSingle();

  // IE da empresa: config fiscal → settings → ISENTO
  let ie = 'ISENTO';
  try {
    const { data: cf } = await supabase.from('CONFIG_FISCAL').select('*')
      .eq('tenant_id', req.tenantId).maybeSingle();
    ie = cf?.ie || cf?.inscricao_estadual || emp?.settings?.fiscal?.ie || 'ISENTO';
  } catch { /* tabela pode não existir */ }

  // NF-e autorizada da venda (se houver) para os campos fiscais do envio
  let nf = null;
  try {
    const { data } = await supabase.from('NOTAS_FISCAIS')
      .select('number, series, key, status')
      .eq('tenant_id', req.tenantId).eq('sale_id', saleId)
      .eq('status', 'autorizado')
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    nf = data || null;
  } catch { nf = null; }

  return { sale, emp, ie, nf };
}

// GET /api/shipping/jt/prefill/:saleId — sugestões para o formulário de envio
router.get('/jt/prefill/:saleId', async (req, res) => {
  try {
    const cfg = await getFreteConfig(req.tenantId);
    const { sale, emp, ie, nf } = await loadShipContext(req, req.params.saleId);
    const qty = (sale.VENDA_ITENS || []).reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const pesoKg = Math.max(0.1, Math.round((qty * cfg.weight_per_unit_g) / 10) / 100);

    const receiver = jtParty({
      name: sale.CLIENTES?.name, phone: sale.CLIENTES?.phone, mobile: sale.CLIENTES?.mobile,
      taxNumber: sale.CLIENTES?.cpf_cnpj, address: sale.CLIENTES?.address,
    });
    const sender = jtParty({
      name: emp?.name, phone: emp?.phone, taxNumber: emp?.cnpj, ieNumber: ie, address: emp?.address,
    });

    res.json({
      ready: jtReady(cfg),
      homolog: /demoopenapi/i.test(cfg.jt_base_url || ''),
      weight_kg: pesoKg,
      quantity: qty,
      has_nf: !!nf,
      invoice: nf ? {
        number: String(nf.number || ''), serial: String(nf.series || '1'),
        money: String(sale.total ?? ''), access_key: nf.key || '', tax_code: '5102',
      } : { number: '', serial: '1', money: String(sale.total ?? ''), access_key: '', tax_code: '5102' },
      problems: [partyProblems(sender, 'Empresa (remetente)'), partyProblems(receiver, 'Cliente (destinatário)')].filter(Boolean),
      tracking_code: sale.tracking_code || null,
      jt_tx_id: sale.jt_tx_id || null,
    });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/shipping/jt/order — cria o envio na J&T e grava o rastreio na venda
router.post('/jt/order', async (req, res) => {
  const { sale_id, weight_kg, goods_type, invoice = {}, ncm } = req.body || {};
  if (!sale_id) return res.status(400).json({ error: 'Informe a venda (sale_id)' });
  try {
    const { sale, emp, ie, nf } = await loadShipContext(req, sale_id);
    if (sale.tracking_code) {
      return res.status(409).json({ error: `Esta venda já tem envio (${sale.tracking_code}). Cancele antes de gerar outro.` });
    }

    const sender = jtParty({
      name: emp?.name, phone: emp?.phone, taxNumber: emp?.cnpj, ieNumber: ie, address: emp?.address,
    });
    const receiver = jtParty({
      name: sale.CLIENTES?.name, phone: sale.CLIENTES?.phone, mobile: sale.CLIENTES?.mobile,
      taxNumber: sale.CLIENTES?.cpf_cnpj, address: sale.CLIENTES?.address,
    });
    const problems = [partyProblems(sender, 'Empresa (remetente)'), partyProblems(receiver, 'Cliente (destinatário)')].filter(Boolean);
    if (problems.length) return res.status(400).json({ error: problems.join(' · ') });

    // NF-e: usa a informada no corpo, senão a autorizada da venda
    const inv = {
      number: String(invoice.number || nf?.number || '').trim(),
      serial: String(invoice.serial || nf?.series || '1').trim(),
      money: String(invoice.money || sale.total || '').trim(),
      access_key: soDigitos(invoice.access_key || nf?.key),
      tax_code: String(invoice.tax_code || '5102').trim(),
    };
    if (!inv.number || !inv.access_key || inv.access_key.length !== 44) {
      return res.status(400).json({
        error: 'A J&T exige os dados da NF-e: número da nota e chave de acesso (44 dígitos). Emita a NF-e da venda no módulo Fiscal ou informe manualmente.',
        code: 'NFE_REQUIRED',
      });
    }

    const peso = Math.min(Math.max(Number(weight_kg) || 0.5, 0.05), 100);
    const txid = `V${sale.number || ''}-${Date.now().toString(36).toUpperCase()}`;
    const defaultNcm = soDigitos(ncm) || soDigitos(emp?.settings?.frete?.jt_default_ncm) || '39241000';

    const items = (sale.VENDA_ITENS || []).slice(0, 30).map((i, idx) => ({
      number: Math.max(parseInt(i.quantity) || 1, 1),
      itemName: String(i.product_name || `Item ${idx + 1}`).slice(0, 30),
      itemValue: String(Number(i.unit_price) || 0),
      itemNcm: defaultNcm,
    }));

    const order = {
      txlogisticId: txid,
      expressType: 'EZ', orderType: '1', serviceType: '01', deliveryType: '03',
      goodsType: goods_type || 'bm000003',
      weight: peso,
      totalQuantity: 1,
      sender, receiver,
      items: items.length ? items : [{ number: 1, itemName: 'Mercadoria', itemValue: String(sale.total || 0), itemNcm: defaultNcm }],
      invoiceNumber: inv.number,
      invoiceSerialNumber: inv.serial,
      invoiceMoney: inv.money,
      invoiceAccessKey: inv.access_key,
      taxCode: inv.tax_code,
      remark: `Venda #${sale.number || ''} — ${emp?.name || ''}`.slice(0, 200),
    };

    const out = await jtCriarPedido(req.tenantId, order);

    // Grava rastreio na venda (+ transportadora J&T, se cadastrada)
    const upd = { tracking_code: out.billCode, jt_tx_id: txid };
    try {
      const { data: jtCarrier } = await supabase.from('TRANSPORTADORAS')
        .select('id').eq('tenant_id', req.tenantId).eq('is_active', true)
        .or('name.ilike.%J&T%,trade_name.ilike.%J&T%,name.ilike.%JT EXPRESS%')
        .limit(1).maybeSingle();
      if (jtCarrier) upd.carrier_id = jtCarrier.id;
    } catch { /* opcional */ }

    let { error: upErr } = await supabase.from('VENDAS').update(upd)
      .eq('id', sale.id).eq('tenant_id', req.tenantId);
    if (upErr && /jt_tx_id/i.test(upErr.message || '')) {
      // migração 041 ainda não rodou → grava só o rastreio
      delete upd.jt_tx_id;
      ({ error: upErr } = await supabase.from('VENDAS').update(upd)
        .eq('id', sale.id).eq('tenant_id', req.tenantId));
    }
    if (upErr) console.error('[jt/order] erro ao gravar rastreio:', upErr.message);

    audit(req, 'create', 'jt_shipment', sale.id, { billCode: out.billCode, txlogisticId: txid, weight: peso });
    res.status(201).json({ bill_code: out.billCode, txlogistic_id: txid, sale_number: sale.number });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// POST /api/shipping/jt/cancel — cancela o envio e limpa o rastreio da venda
router.post('/jt/cancel', async (req, res) => {
  const { sale_id, reason } = req.body || {};
  if (!sale_id) return res.status(400).json({ error: 'Informe a venda (sale_id)' });
  try {
    const { data: sale } = await supabase.from('VENDAS').select('id, number, tracking_code, jt_tx_id')
      .eq('id', sale_id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!sale) return res.status(404).json({ error: 'Venda não encontrada' });
    if (!sale.jt_tx_id) {
      return res.status(400).json({ error: 'Esta venda não tem um envio J&T gerado pelo sistema (nada a cancelar).' });
    }

    await jtCancelarPedido(req.tenantId, { txlogisticId: sale.jt_tx_id, reason });

    await supabase.from('VENDAS').update({ tracking_code: null, jt_tx_id: null })
      .eq('id', sale.id).eq('tenant_id', req.tenantId);
    audit(req, 'cancel', 'jt_shipment', sale.id, { txlogisticId: sale.jt_tx_id, reason: reason || null });
    res.json({ success: true });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

// GET /api/shipping/jt/label/:billCode — etiqueta em PDF (base64)
router.get('/jt/label/:billCode', async (req, res) => {
  try {
    const b64 = await jtEtiqueta(req.tenantId, req.params.billCode);
    res.json({ pdf_base64: b64 });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
module.exports.ufFromCep = ufFromCep;
