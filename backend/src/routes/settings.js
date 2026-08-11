const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { uploadDataUrl } = require('../lib/storage');

// Sobe as fotos do hero (data URLs) para o Storage e troca por URLs públicas.
// Mantém garrafas coloridas (sem foto) intactas. Nunca lança.
async function processHeroBottles(settings) {
  const bottles = settings?.site?.hero_bottles;
  if (!Array.isArray(bottles)) return;
  const out = [];
  for (const b of bottles) {
    if (b && typeof b.image === 'string' && /^data:/.test(b.image)) {
      const url = await uploadDataUrl(b.image, 'site-hero');
      out.push(url ? { image_url: url } : { color: b.color || '#F26522', gradient: b.gradient !== false });
    } else if (b && b.image_url) {
      out.push({ image_url: b.image_url });
    } else if (b) {
      out.push({ color: b.color || '#F26522', gradient: b.gradient !== false });
    }
  }
  settings.site.hero_bottles = out;
}

// Mesma ideia para as artes de promoção. Se o upload falhar, a arte fica no
// próprio settings (data URL) em vez de sumir: pesa mais, mas a promoção que o
// lojista acabou de cadastrar não some sem explicação.
async function processPromos(settings) {
  const promos = settings?.site?.promos;
  if (!Array.isArray(promos)) return;
  const out = [];
  for (const p of promos) {
    if (!p) continue;
    const { image, ...rest } = p;
    if (typeof image === 'string' && /^data:/.test(image)) {
      const url = await uploadDataUrl(image, 'site-promos');
      out.push({ ...rest, image_url: url || image });
    } else {
      out.push(rest);
    }
  }
  settings.site.promos = out;
}

async function processSiteImages(settings) {
  await processHeroBottles(settings);
  await processPromos(settings);
  return settings;
}

router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('EMPRESAS')
      .select('*')
      .eq('id', req.tenantId)
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/', async (req, res) => {
  const { name, app_name, cnpj, logo_url, phone, email, address, settings } = req.body;

  if (req.userProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem alterar as configurações da empresa' });
  }

  try {
    if (settings?.site) { try { await processSiteImages(settings); } catch (e) { console.error('[settings:hero]', e.message); } }
    const base = { name, app_name, cnpj, logo_url, phone, email, address, updated_at: new Date().toISOString() };
    let { data, error } = await supabase
      .from('EMPRESAS')
      .update({ ...base, settings })
      .eq('id', req.tenantId)
      .select()
      .single();

    // Se a coluna `settings` ainda não existe, salva o resto mesmo assim.
    if (error && /settings/i.test(error.message || '')) {
      ({ data, error } = await supabase
        .from('EMPRESAS')
        .update(base)
        .eq('id', req.tenantId)
        .select()
        .single());
    }

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Catálogo de acabamentos (cores/bordas por acabamento) ──────────
// Guardado em EMPRESAS.settings.acabamentos_catalog:
//   { 'Cor degradê': ['AZUL/ROSA', ...], '__borda': ['HOLOGRÁFICA DOURADO', ...] }
// Usado no Lançamento de Produto (PDV): ao marcar um acabamento, escolhe
// a cor da lista; o botão "cadastrar" adiciona aqui (POST).
router.get('/acabamentos', async (req, res) => {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    res.json(data?.settings?.acabamentos_catalog || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/acabamentos', async (req, res) => {
  const acabamento = String(req.body.acabamento || '').trim();
  const valor = String(req.body.valor || '').trim().toUpperCase();
  if (!acabamento || !valor) return res.status(400).json({ error: 'Informe o acabamento e a cor/borda' });
  try {
    const { data: emp } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const settings = emp?.settings || {};
    const catalog = { ...(settings.acabamentos_catalog || {}) };
    const list = Array.isArray(catalog[acabamento]) ? [...catalog[acabamento]] : [];
    if (!list.includes(valor)) list.push(valor);
    catalog[acabamento] = list;
    const { error } = await supabase.from('EMPRESAS')
      .update({ settings: { ...settings, acabamentos_catalog: catalog } }).eq('id', req.tenantId);
    if (error) throw error;
    res.json(catalog);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/acabamentos', async (req, res) => {
  const acabamento = String(req.query.acabamento || '').trim();
  const valor = String(req.query.valor || '').trim().toUpperCase();
  if (!acabamento || !valor) return res.status(400).json({ error: 'Informe o acabamento e a cor/borda' });
  try {
    const { data: emp } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const settings = emp?.settings || {};
    const catalog = { ...(settings.acabamentos_catalog || {}) };
    catalog[acabamento] = (catalog[acabamento] || []).filter(v => v !== valor);
    const { error } = await supabase.from('EMPRESAS')
      .update({ settings: { ...settings, acabamentos_catalog: catalog } }).eq('id', req.tenantId);
    if (error) throw error;
    res.json(catalog);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/users', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('USUARIOS')
      .select('id, name, email, role, is_active, created_at')
      .eq('tenant_id', req.tenantId)
      .order('name');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/users', async (req, res) => {
  const { name, email, password, role } = req.body;

  if (req.userProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem criar usuários' });
  }

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
  }

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError) throw authError;

    const { data: profile, error: profileError } = await supabase
      .from('USUARIOS')
      .insert({
        id: authUser.user.id,
        tenant_id: req.tenantId,
        name,
        email,
        role: role || 'operator',
        is_active: true,
      })
      .select()
      .single();

    if (profileError) throw profileError;
    res.status(201).json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id', async (req, res) => {
  const { name, role, is_active } = req.body;

  if (req.userProfile.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem editar usuários' });
  }

  try {
    const { data, error } = await supabase
      .from('USUARIOS')
      .update({ name, role, is_active })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
