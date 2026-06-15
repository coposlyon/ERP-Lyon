// Publicação em Facebook Page e Instagram Business via Meta Graph API.
// Gated por env: FB_PAGE_ID + FB_PAGE_TOKEN (Facebook) e IG_USER_ID + FB_PAGE_TOKEN (Instagram).
const GRAPH = process.env.META_GRAPH_BASE || 'https://graph.facebook.com/v20.0';

const fbConfigured = () => !!(process.env.FB_PAGE_ID && process.env.FB_PAGE_TOKEN);
const igConfigured = () => !!(process.env.IG_USER_ID && process.env.FB_PAGE_TOKEN);

async function postJson(url, body) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => null);
  return { res, data };
}

// Publica na página do Facebook (com ou sem imagem).
async function postFacebook({ message, imageUrl }) {
  const pageId = process.env.FB_PAGE_ID, token = process.env.FB_PAGE_TOKEN;
  if (!pageId || !token) return { ok: false, error: 'Facebook não configurado (FB_PAGE_ID, FB_PAGE_TOKEN)' };
  try {
    const url = imageUrl ? `${GRAPH}/${pageId}/photos` : `${GRAPH}/${pageId}/feed`;
    const body = imageUrl ? { url: imageUrl, caption: message || '', access_token: token } : { message: message || '', access_token: token };
    const { res, data } = await postJson(url, body);
    if (!res.ok) return { ok: false, error: data?.error?.message || `Facebook HTTP ${res.status}` };
    return { ok: true, id: data?.post_id || data?.id };
  } catch (e) { return { ok: false, error: e.message }; }
}

// Publica no Instagram Business (exige imagem com URL pública).
async function postInstagram({ caption, imageUrl }) {
  const igId = process.env.IG_USER_ID, token = process.env.FB_PAGE_TOKEN;
  if (!igId || !token) return { ok: false, error: 'Instagram não configurado (IG_USER_ID, FB_PAGE_TOKEN)' };
  if (!imageUrl) return { ok: false, error: 'Instagram exige uma imagem na publicação' };
  try {
    // 1) cria o container de mídia
    const c = await postJson(`${GRAPH}/${igId}/media`, { image_url: imageUrl, caption: caption || '', access_token: token });
    if (!c.res.ok) return { ok: false, error: c.data?.error?.message || `Instagram (container) HTTP ${c.res.status}` };
    // 2) publica o container
    const p = await postJson(`${GRAPH}/${igId}/media_publish`, { creation_id: c.data.id, access_token: token });
    if (!p.res.ok) return { ok: false, error: p.data?.error?.message || `Instagram (publish) HTTP ${p.res.status}` };
    return { ok: true, id: p.data?.id };
  } catch (e) { return { ok: false, error: e.message }; }
}

module.exports = { postFacebook, postInstagram, fbConfigured, igConfigured };
