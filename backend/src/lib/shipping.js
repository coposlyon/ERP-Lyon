const crypto = require('crypto');
const supabase = require('../config/supabase');

// Faixas de CEP → UF, para descobrir o estado quando só temos o CEP.
const CEP_UF = [
  [1000000, 19999999, 'SP'], [20000000, 28999999, 'RJ'], [29000000, 29999999, 'ES'],
  [30000000, 39999999, 'MG'], [40000000, 48999999, 'BA'], [49000000, 49999999, 'SE'],
  [50000000, 56999999, 'PE'], [57000000, 57999999, 'AL'], [58000000, 58999999, 'PB'],
  [59000000, 59999999, 'RN'], [60000000, 63999999, 'CE'], [64000000, 64999999, 'PI'],
  [65000000, 65999999, 'MA'], [66000000, 68899999, 'PA'], [68900000, 68999999, 'AP'],
  [69000000, 69299999, 'AM'], [69300000, 69399999, 'RR'], [69400000, 69899999, 'AM'],
  [69900000, 69999999, 'AC'], [70000000, 72799999, 'DF'], [72800000, 72999999, 'GO'],
  [73000000, 73699999, 'DF'], [73700000, 76799999, 'GO'], [76800000, 76999999, 'RO'],
  [77000000, 77999999, 'TO'], [78000000, 78899999, 'MT'], [79000000, 79999999, 'MS'],
  [80000000, 87999999, 'PR'], [88000000, 89999999, 'SC'], [90000000, 99999999, 'RS'],
];
function ufFromCep(cep) {
  const n = parseInt(String(cep || '').replace(/\D/g, ''), 10);
  if (!n) return '';
  const f = CEP_UF.find(([a, b]) => n >= a && n <= b);
  return f ? f[2] : '';
}

// Configuração de frete/transportadora (guardada em EMPRESAS.settings.frete)
async function getFreteConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.frete) || {};
  } catch { s = {}; }
  return {
    enabled:          !!s.enabled,                              // J&T (API) ligado
    // Credenciais: valor salvo em Configurações → Transportadora, com
    // fallback nas variáveis de ambiente (JT_*) do servidor.
    jt_base_url:      s.jt_base_url || process.env.JT_BASE_URL || 'https://openapi.jtjms-br.com',
    jt_api_account:   s.jt_api_account || process.env.JT_API_ACCOUNT || '',
    jt_private_key:   s.jt_private_key || process.env.JT_PRIVATE_KEY || '',
    jt_customer_code: s.jt_customer_code || process.env.JT_CUSTOMER_CODE || '',
    jt_password:      s.jt_password || process.env.JT_PASSWORD || '',
    jt_goods_type:    s.jt_goods_type || process.env.JT_GOODS_TYPE || 'bm000001',   // tipo de mercadoria p/ cotação
    jt_product_type:  s.jt_product_type || process.env.JT_PRODUCT_TYPE || 'EZ',     // EZ = Economy
    // BrasPress (cotação + rastreio). Fallback nas env BRASPRESS_*.
    // Liga pela caixa do painel OU automaticamente quando as credenciais vêm
    // das variáveis de ambiente (igual o Melhor Envio com o token).
    bp_enabled:       !!s.bp_enabled || !!(process.env.BRASPRESS_USER && process.env.BRASPRESS_PASSWORD && process.env.BRASPRESS_CNPJ),
    bp_base_url:      s.bp_base_url || process.env.BRASPRESS_BASE_URL || 'https://api.braspress.com',
    bp_user:          s.bp_user || process.env.BRASPRESS_USER || '',
    bp_password:      s.bp_password || process.env.BRASPRESS_PASSWORD || '',
    bp_cnpj:          s.bp_cnpj || process.env.BRASPRESS_CNPJ || '',
    bp_cnpj_dest:     s.bp_cnpj_dest || process.env.BRASPRESS_CNPJ_DEST || '',
    bp_modal:         s.bp_modal || process.env.BRASPRESS_MODAL || 'R',
    bp_tipo_frete:    s.bp_tipo_frete || process.env.BRASPRESS_TIPO_FRETE || 1,
    origin_cep:       String(s.origin_cep || '').replace(/\D/g, ''),
    weight_per_unit_g: Number(s.weight_per_unit_g) || 200,     // peso por copo (g) p/ estimar
    free_above:       Number(s.free_above) || 0,               // frete grátis acima de R$
    freight_markup:   (s.freight_markup != null && s.freight_markup !== '') ? Number(s.freight_markup) : null, // % de acréscimo no frete (caixa/peso)
    table:            Array.isArray(s.table) ? s.table : [],   // tabela por UF
    default_price:    Number(s.default_price) || 0,            // base p/ UF sem regra
    default_per_kg:   Number(s.default_per_kg) || 0,
    default_days:     Number(s.default_days) || 0,
  };
}

// Estimativa por tabela regional (UF) — funciona sem depender da API da J&T.
function estimateByTable(cfg, { uf, weightKg, subtotal }) {
  const row = (cfg.table || []).find(r => String(r.uf || '').toUpperCase() === String(uf || '').toUpperCase());
  const base = row ? Number(row.price) || 0 : cfg.default_price;
  const perKg = row ? Number(row.per_kg) || 0 : cfg.default_per_kg;
  const days = row ? Number(row.days) || 0 : cfg.default_days;
  let price = base + perKg * (Number(weightKg) || 0);
  if (cfg.free_above > 0 && Number(subtotal) >= cfg.free_above) price = 0;
  return {
    source: 'tabela',
    price: Math.round(price * 100) / 100,
    days: days || null,
    free: price === 0 && cfg.free_above > 0 && Number(subtotal) >= cfg.free_above,
  };
}

// ── J&T Open Platform (JMS Brasil) ────────────────────────────────────
// Autenticação (validada no ambiente de homologação):
//  - header digest  = Base64(MD5(bizContent + privateKey))
//  - digest de negócio (dentro do bizContent) =
//      Base64(MD5(customerCode + MD5HEX_MAIÚSCULO(senha + 'jadada236t2') + privateKey))
// Endpoints: /webopenplatformapi/api/{order/addOrder, order/cancelOrder,
//            order/printOrder, logistics/trace, ...}
function jtDigest(bizContent, privateKey) {
  return crypto.createHash('md5').update(bizContent + privateKey, 'utf8').digest('base64');
}

function jtBizDigest(cfg) {
  const cipher = crypto.createHash('md5')
    .update(cfg.jt_password + 'jadada236t2', 'utf8').digest('hex').toUpperCase();
  return crypto.createHash('md5')
    .update(cfg.jt_customer_code + cipher + cfg.jt_private_key, 'utf8').digest('base64');
}

function jtReady(cfg) {
  return !!(cfg.jt_api_account && cfg.jt_private_key && cfg.jt_customer_code && cfg.jt_password);
}

function jtNotConfigured() {
  const err = new Error('J&T não configurada. Vá em Configurações → Transportadora e preencha conta da API, código de cliente, senha e chave privada.');
  err.status = 400; return err;
}

async function jtRequest(cfg, path, bizObj) {
  const bizContent = JSON.stringify(bizObj);
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    apiAccount: cfg.jt_api_account,
    digest: jtDigest(bizContent, cfg.jt_private_key),
    timestamp: String(Date.now()),
  };
  const body = 'bizContent=' + encodeURIComponent(bizContent);
  const resp = await fetch(cfg.jt_base_url.replace(/\/$/, '') + path, { method: 'POST', headers, body });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(raw?.msg || raw?.message || `J&T HTTP ${resp.status}`);
    err.status = 502; throw err;
  }
  return raw;
}

// Chama a API e valida o código de negócio ("1" = sucesso)
async function jtCall(cfg, path, biz) {
  const raw = await jtRequest(cfg, path, {
    customerCode: cfg.jt_customer_code,
    digest: jtBizDigest(cfg),
    ...biz,
  });
  if (String(raw?.code) !== '1') {
    const err = new Error(`J&T: ${raw?.msg || 'erro desconhecido'} (código ${raw?.code || '?'})`);
    err.status = 400; err.jtCode = raw?.code; throw err;
  }
  return raw;
}

// Rastreio de uma encomenda pelo código (billCode/waybill).
async function rastrear(tenantId, code) {
  const cfg = await getFreteConfig(tenantId);
  if (!jtReady(cfg)) throw jtNotConfigured();
  const raw = await jtCall(cfg, '/webopenplatformapi/api/logistics/trace', {
    billCodes: String(code).trim(),
  });
  const first = Array.isArray(raw?.data) ? raw.data[0] : raw?.data;
  const details = first?.details || [];
  const events = (Array.isArray(details) ? details : []).map(d => ({
    time: d.scanTime || d.acceptTime || d.time || null,
    status: d.scanTypeName || d.scanType || d.status || null,
    where: d.scanNetworkName || d.scanNetworkCity || d.city || null,
    desc: d.desc || d.remark || null,
  }));
  return { code, events };
}

// Cria o pedido logístico (waybill). `order` já vem montado pela rota.
async function jtCriarPedido(tenantId, order) {
  const cfg = await getFreteConfig(tenantId);
  if (!jtReady(cfg)) throw jtNotConfigured();
  const raw = await jtCall(cfg, '/webopenplatformapi/api/order/addOrder', order);
  const first = raw?.data?.orderList?.[0] || {};
  return {
    billCode: first.billCode || raw?.data?.billCode || null,
    txlogisticId: first.txlogisticId || order.txlogisticId,
    createOrderTime: raw?.data?.createOrderTime || null,
  };
}

// Cancela um pedido logístico pelo txlogisticId (id do nosso lado).
async function jtCancelarPedido(tenantId, { txlogisticId, reason }) {
  const cfg = await getFreteConfig(tenantId);
  if (!jtReady(cfg)) throw jtNotConfigured();
  const raw = await jtCall(cfg, '/webopenplatformapi/api/order/cancelOrder', {
    txlogisticId, orderType: '1', reason: reason || 'Cancelado pelo ERP',
  });
  return raw?.data || { txlogisticId };
}

// Etiqueta em PDF (base64) de um billCode.
async function jtEtiqueta(tenantId, billCode) {
  const cfg = await getFreteConfig(tenantId);
  if (!jtReady(cfg)) throw jtNotConfigured();
  const raw = await jtCall(cfg, '/webopenplatformapi/api/order/printOrder', {
    billCode: String(billCode).trim(), printSize: '1', showCustomerOrderId: '1',
  });
  const b64 = raw?.data?.base64EncodeContent || null;
  if (!b64) {
    const err = new Error('J&T não devolveu a etiqueta para este código.');
    err.status = 502; throw err;
  }
  return b64;
}

// Cotação de frete + prazo (spmComCost/getComCostAndTime).
// O CEP de origem sai do contrato do customerCode — só o destino é enviado.
// Devolve { price, days }; a J&T responde cost em reais e aging em dias.
async function jtCotar(cfg, { cep, weightKg, subtotal, goodsTypeCode, productTypeCode } = {}) {
  if (!jtReady(cfg)) throw jtNotConfigured();
  const zip = String(cep || '').replace(/\D/g, '');
  if (zip.length !== 8) {
    const err = new Error('Informe um CEP de destino válido (8 dígitos).');
    err.status = 400; throw err;
  }
  const raw = await jtCall(cfg, '/webopenplatformapi/api/spmComCost/getComCostAndTime', {
    destinationZipCode: zip,
    goodsTypeCode:  goodsTypeCode   || cfg.jt_goods_type   || 'bm000001',
    productTypeCode: productTypeCode || cfg.jt_product_type || 'EZ',
    insuredAmount: (Math.max(Number(subtotal) || 0, 0)).toFixed(2),
    // Sem teto: limitar o peso aqui faria a J&T cotar um pedido grande como se
    // fosse pequeno. Acima do que o contrato aceita ela devolve erro e o
    // chamador cai na tabela por UF.
    weight: String(Math.max(Number(weightKg) || 0.1, 0.05)),
  });
  const d = raw?.data || {};
  return {
    price: Math.round((Number(d.cost) || 0) * 100) / 100,
    days: Number(d.aging) > 0 ? Number(d.aging) : null,
  };
}

// Cotação: tenta a J&T (se ligada e com CEP); senão usa a tabela regional.
async function cotar(tenantId, { uf, cep, qty, weightKg, subtotal }) {
  const cfg = await getFreteConfig(tenantId);
  const w = Number(weightKg) || ((Number(qty) || 0) * cfg.weight_per_unit_g) / 1000;
  const base = { weightKg: Math.round(w * 1000) / 1000, uf: String(uf || '').toUpperCase() };

  if (cfg.enabled && jtReady(cfg) && String(cep || '').replace(/\D/g, '').length === 8) {
    try {
      const jt = await jtCotar(cfg, { cep, weightKg: w, subtotal });
      // Homologação devolve cost 0; nesse caso a cotação não vale e caímos na tabela.
      if (jt.price > 0) {
        const free = cfg.free_above > 0 && Number(subtotal) >= cfg.free_above;
        return { ...base, source: 'jt', price: free ? 0 : jt.price, days: jt.days, free };
      }
    } catch (e) {
      console.error('[shipping:cotar] J&T', e.message);
    }
  }

  const est = estimateByTable(cfg, { uf, weightKg: w, subtotal });
  return { ...est, ...base };
}

module.exports = {
  getFreteConfig, estimateByTable, cotar, rastrear, ufFromCep,
  jtReady, jtCotar, jtCriarPedido, jtCancelarPedido, jtEtiqueta,
};
