const supabase = require('../config/supabase');
const { randomUUID } = require('crypto');

// Bucket PÚBLICO para imagens da loja (fotos de produto, avatar, fotos da
// produção mostradas ao cliente, previews dos pedidos). Documentos sensíveis
// (CNH, contratos) continuam no bucket privado DOCUMENTOS via outras rotas.
const BUCKET = process.env.PUBLIC_STORAGE_BUCKET || 'loja-publico';

// Sobe uma imagem em base64 (data URL) para o Storage e devolve a URL pública.
// Se já for uma URL (http) ou vazio, devolve como está. Nunca lança — em
// caso de erro, retorna null para não derrubar a operação principal.
async function uploadDataUrl(dataUrl, folder = 'previews') {
  if (!dataUrl) return null;
  if (!/^data:/.test(dataUrl)) return dataUrl; // já é URL
  const m = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!m) return null;
  try {
    const mime = m[1];
    const buf = Buffer.from(m[2], 'base64');
    const ext = mime.includes('png') ? 'png' : mime.includes('jpeg') ? 'jpg' : mime.includes('webp') ? 'webp' : mime.includes('svg') ? 'svg' : 'bin';
    const path = `${folder}/${randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
    if (error) { console.error('[storage]', error.message); return null; }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    return publicUrl;
  } catch (err) {
    console.error('[storage]', err.message);
    return null;
  }
}

module.exports = { uploadDataUrl };
