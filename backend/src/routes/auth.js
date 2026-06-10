const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const supabase = require('../config/supabase');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const clientSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await clientSupabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const { data: userProfile } = await supabase
      .from('USUARIOS')
      .select('*, EMPRESAS(*)')
      .eq('id', data.user.id)
      .single();

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: userProfile?.name,
        role: userProfile?.role,
        tenant: userProfile?.EMPRESAS,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha no login' });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    const clientSupabase = createClient(supabaseUrl, supabaseAnonKey);
    await clientSupabase.auth.signOut();
  }
  res.json({ message: 'Logout realizado com sucesso' });
});

router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token obrigatório' });
  }

  try {
    const clientSupabase = createClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await clientSupabase.auth.refreshSession({ refresh_token });

    if (error) {
      return res.status(401).json({ error: 'Token inválido' });
    }

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha ao renovar token' });
  }
});

module.exports = router;
