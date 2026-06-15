const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { sendWhatsApp } = require('../lib/whatsapp');
const { postFacebook, postInstagram, fbConfigured, igConfigured } = require('../lib/social');
const { uploadDataUrl } = require('../lib/storage');
const { audit } = require('../lib/audit');

// Quais canais estão configurados (credenciais presentes)
router.get('/status', (req, res) => {
  res.json({
    whatsapp:  !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
    facebook:  fbConfigured(),
    instagram: igConfigured(),
  });
});

// Audiência de WhatsApp = clientes ativos com telefone, por filtro
async function audience(tenantId, { type, rating } = {}) {
  let q = supabase.from('CLIENTES').select('id, name, phone').eq('tenant_id', tenantId).eq('is_active', true);
  if (type === 'cliente') q = q.in('type', ['PF', 'PJ']);
  else if (type) q = q.eq('type', type);
  if (rating) q = q.eq('rating', parseInt(rating));
  const { data } = await q.limit(2000);
  return (data || []).filter(c => (c.phone || '').replace(/\D/g, '').length >= 10);
}

router.get('/audience', async (req, res) => {
  try {
    const list = await audience(req.tenantId, req.query);
    res.json({ count: list.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Histórico de campanhas
router.get('/campaigns', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('CAMPANHAS_MKT').select('*')
      .eq('tenant_id', req.tenantId).order('created_at', { ascending: false }).limit(50);
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Enviar / publicar campanha em um ou mais canais
router.post('/send', async (req, res) => {
  const { title, message, image, channels = [], segment = {} } = req.body;
  if (!Array.isArray(channels) || channels.length === 0) return res.status(400).json({ error: 'Escolha ao menos um canal' });
  if (!String(message || '').trim() && !image) return res.status(400).json({ error: 'Escreva a mensagem ou anexe uma imagem' });

  const results = {};
  try {
    // sobe a imagem (se houver) e usa a URL pública
    let imageUrl = null;
    if (image) imageUrl = await uploadDataUrl(image, 'marketing');

    // WhatsApp — dispara para a audiência filtrada
    if (channels.includes('whatsapp')) {
      const list = await audience(req.tenantId, segment);
      let ok = 0, fail = 0; let firstErr = null;
      for (const c of list) {
        const personalized = String(message || '').replace(/\{nome\}/gi, c.name || '');
        const r = await sendWhatsApp(c.phone, personalized);
        if (r.ok) ok++; else { fail++; if (!firstErr) firstErr = r.error; }
      }
      results.whatsapp = { total: list.length, sent: ok, failed: fail, ...(ok === 0 && firstErr ? { error: firstErr } : {}) };
    }

    // Facebook
    if (channels.includes('facebook')) {
      const r = await postFacebook({ message, imageUrl });
      results.facebook = r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
    }

    // Instagram
    if (channels.includes('instagram')) {
      const r = await postInstagram({ caption: message, imageUrl });
      results.instagram = r.ok ? { ok: true, id: r.id } : { ok: false, error: r.error };
    }

    // registra a campanha (não quebra se a tabela ainda não existir)
    let campaign = null;
    try {
      const { data } = await supabase.from('CAMPANHAS_MKT').insert({
        tenant_id: req.tenantId, user_id: req.user?.id || null,
        title: title || null, message: message || null, image_url: imageUrl,
        channels, segment, results, status: 'sent',
      }).select().single();
      campaign = data;
    } catch { /* tabela ausente: ignora o registro */ }

    audit(req, 'create', 'campaign', campaign?.id || null, { channels, results });
    res.json({ results, campaign });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
