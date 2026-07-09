const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { uploadDataUrl } = require('../lib/storage');

// Sobe as fotos do hero (data URLs) para o Storage e troca por URLs públicas.
// Mantém garrafas coloridas (sem foto) intactas. Nunca lança.
async function processSiteImages(settings) {
  const bottles = settings?.site?.hero_bottles;
  if (!Array.isArray(bottles)) return settings;
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
