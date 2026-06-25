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
    jt_base_url:      s.jt_base_url || 'https://openapi.jtjms-br.com',
    jt_api_account:   s.jt_api_account || '',
    jt_private_key:   s.jt_private_key || '',
    jt_customer_code: s.jt_customer_code || '',
    origin_cep:       String(s.origin_cep || '').replace(/\D/g, ''),
    weight_per_unit_g: Number(s.weight_per_unit_g) || 200,     // peso por copo (g) p/ estimar
    free_above:       Number(s.free_above) || 0,               // frete grátis acima de R$
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

// ── J&T Open Platform (best-effort) ──────────────────────────────────
// Assinatura padrão da plataforma: digest = Base64(MD5(bizContent + privateKey)).
// Precisa de conta de cliente J&T (apiAccount, customerCode, privateKey).
function jtDigest(bizContent, privateKey) {
  return crypto.createHash('md5').update(bizContent + privateKey, 'utf8').digest('base64');
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

// Rastreio de uma encomenda pelo código (billCode/waybill).
async function rastrear(tenantId, code) {
  const cfg = await getFreteConfig(tenantId);
  if (!cfg.jt_api_account || !cfg.jt_private_key) {
    const err = new Error('J&T não configurado. Vá em Configurações → Transportadora e informe a conta da API.');
    err.status = 400; throw err;
  }
  const raw = await jtRequest(cfg, '/webopenplatformapi/api/logistics/trace', {
    customerCode: cfg.jt_customer_code, billCode: code,
  });
  // normaliza o histórico (ajustável conforme o retorno real do contrato)
  const details = raw?.data?.details || raw?.details || raw?.data || [];
  const events = (Array.isArray(details) ? details : []).map(d => ({
    time: d.scanTime || d.acceptTime || d.time || null,
    status: d.scanType || d.status || d.desc || null,
    where: d.scanNetworkName || d.city || d.location || null,
    desc: d.desc || d.scanTypeName || d.remark || null,
  }));
  return { code, events, raw };
}

// Cotação: tenta J&T (se ligado); senão usa a tabela regional.
async function cotar(tenantId, { uf, cep, qty, weightKg, subtotal }) {
  const cfg = await getFreteConfig(tenantId);
  const w = Number(weightKg) || ((Number(qty) || 0) * cfg.weight_per_unit_g) / 1000;
  // (futuro) se a J&T expor cotação no contrato, chama aqui e cai na tabela em caso de erro
  const est = estimateByTable(cfg, { uf, weightKg: w, subtotal });
  return { ...est, weightKg: Math.round(w * 1000) / 1000, uf: String(uf || '').toUpperCase() };
}

module.exports = { getFreteConfig, estimateByTable, cotar, rastrear, ufFromCep };
