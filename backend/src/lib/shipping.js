const crypto = require('crypto');
const supabase = require('../config/supabase');

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

module.exports = { getFreteConfig, estimateByTable, cotar, rastrear };
