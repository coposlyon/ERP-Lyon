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

// Lê as últimas publicações do Instagram Business (para exibir na loja).
// Usa as mesmas credenciais do posting (IG_USER_ID + FB_PAGE_TOKEN) — precisa
// da permissão instagram_basic no app da Meta. Retorna [] se não configurado.
async function fetchInstagramMedia(limit = 8) {
  const igId = process.env.IG_USER_ID, token = process.env.FB_PAGE_TOKEN;
  if (!igId || !token) return { ok: false, error: 'Instagram não configurado (IG_USER_ID, FB_PAGE_TOKEN)', posts: [] };
  const n = Math.min(Math.max(parseInt(limit) || 8, 1), 24);
  try {
    // perfil (@usuário) — opcional, só para o link/cabeçalho
    let username = null;
    try {
      const pr = await fetch(`${GRAPH}/${igId}?fields=username&access_token=${encodeURIComponent(token)}`);
      const pd = await pr.json().catch(() => null);
      if (pr.ok) username = pd?.username || null;
    } catch { /* ignora — segue sem @ */ }

    const fields = 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp';
    const r = await fetch(`${GRAPH}/${igId}/media?fields=${fields}&limit=${n}&access_token=${encodeURIComponent(token)}`);
    const data = await r.json().catch(() => null);
    if (!r.ok) return { ok: false, error: data?.error?.message || `Instagram HTTP ${r.status}`, posts: [] };

    const posts = (Array.isArray(data?.data) ? data.data : [])
      .map(m => ({
        id: m.id,
        caption: m.caption || '',
        permalink: m.permalink || null,
        timestamp: m.timestamp || null,
        is_video: m.media_type === 'VIDEO',
        // VIDEO expõe o poster em thumbnail_url; imagem/álbum usam media_url
        image: (m.media_type === 'VIDEO' ? (m.thumbnail_url || m.media_url) : m.media_url) || null,
      }))
      .filter(p => p.image && p.permalink);
    return { ok: true, username, posts };
  } catch (e) { return { ok: false, error: e.message, posts: [] }; }
}

module.exports = { postFacebook, postInstagram, fbConfigured, igConfigured, fetchInstagramMedia };
