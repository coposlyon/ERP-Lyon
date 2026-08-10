// PIX estático (BR Code / EMV) — gera o "copia-e-cola" sem gateway. O dinheiro
// cai DIRETO na conta dona da chave (ex.: Nubank), sem retenção. A baixa
// automática é feita à parte (conciliação Open Finance), pois o PIX estático
// não notifica pagamento por si só.

// Campo EMV: ID(2) + tamanho(2) + valor
function emv(id, value) {
  const v = String(value);
  return `${id}${String(v.length).padStart(2, '0')}${v}`;
}

// CRC16/CCITT-FALSE: poly 0x1021, init 0xFFFF (exigido pelo padrão PIX no campo 63)
function crc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// Sanitiza texto p/ o BR Code (sem acentos, só A-Z 0-9 e espaço), com limite.
function txt(s, max) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '').trim().slice(0, max);
}
// txid: alfanumérico, até 25; vazio vira "***" (sem referência específica)
function txidValue(s) {
  const t = String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  return t || '***';
}

// Monta o copia-e-cola. { key, name, city, amount?, txid? }
function pixCopyPaste({ key, name, city, amount, txid }) {
  if (!key) throw new Error('Chave PIX não configurada');
  const mai = emv('26', emv('00', 'br.gov.bcb.pix') + emv('01', String(key).trim()));
  const amt = (amount != null && Number(amount) > 0) ? emv('54', Number(amount).toFixed(2)) : '';
  const adf = emv('62', emv('05', txidValue(txid)));
  const payload =
    emv('00', '01') +          // Payload Format Indicator
    emv('01', '11') +          // estático (reutilizável)
    mai +                      // conta PIX (GUI + chave)
    emv('52', '0000') +        // MCC
    emv('53', '986') +         // moeda BRL
    amt +                      // valor (opcional)
    emv('58', 'BR') +          // país
    emv('59', txt(name, 25) || 'RECEBEDOR') +
    emv('60', txt(city, 15) || 'BRASIL') +
    adf +                      // txid
    '6304';                    // CRC id+len (valor entra depois)
  return payload + crc16(payload);
}

module.exports = { pixCopyPaste, crc16, txidValue };
