const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

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
    const { data, error } = await supabase
      .from('EMPRESAS')
      .update({ name, app_name, cnpj, logo_url, phone, email, address, settings, updated_at: new Date().toISOString() })
      .eq('id', req.tenantId)
      .select()
      .single();

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
