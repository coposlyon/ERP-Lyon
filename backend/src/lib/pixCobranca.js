/**
 * Cobrança PIX — chave própria do lojista (ex.: Nubank).
 *
 * O dinheiro cai DIRETO na conta dona da chave: sem taxa, sem retenção
 * e sem intermediário. Em troca, o banco não avisa ninguém quando o PIX
 * cai — a confirmação é feita dentro do ERP (fila de Pagamentos da Loja).
 *
 * Config: EMPRESAS.settings.pix = { key, name, city }, com fallback nas
 * env PIX_KEY / PIX_MERCHANT_NAME / PIX_MERCHANT_CITY.
 */

const supabase = require('../config/supabase');
const QRCode = require('qrcode');
const { pixCopyPaste, txidValue } = require('./pixStatic');

async function pixConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.pix) || {};
  } catch { s = {}; }
  return {
    key:  String(s.key || process.env.PIX_KEY || '').trim(),
    name: s.name || process.env.PIX_MERCHANT_NAME || '',
    city: s.city || process.env.PIX_MERCHANT_CITY || '',
  };
}

// QR em base64 (sem o prefixo data:) — mesmo formato que o Mercado Pago
// devolve, para o front tratar os dois casos igual.
async function qrBase64(copy) {
  try {
    return (await QRCode.toDataURL(copy, { margin: 1, width: 320 })).split(',')[1] || null;
  } catch {
    return null; // sem imagem o copia-e-cola ainda funciona
  }
}

/**
 * Monta a cobrança. Devolve null quando não há chave configurada —
 * quem chama decide o fallback (Mercado Pago, ou seguir sem cobrar).
 */
async function gerarCobrancaPix({ tenantId, amount, txid, cfg }) {
  const c = cfg || await pixConfig(tenantId);
  if (!c.key) return null;
  const copy = pixCopyPaste({ key: c.key, name: c.name, city: c.city, amount, txid });
  return {
    key: c.key, name: c.name, city: c.city,
    copy_paste: copy,
    // txid como ele realmente foi para o BR Code (o padrão corta em 25 chars):
    // é esse valor que uma conciliação futura vai ter em mãos.
    txid: txidValue(txid),
    qr_base64: await qrBase64(copy),
  };
}

module.exports = { pixConfig, gerarCobrancaPix, qrBase64 };
