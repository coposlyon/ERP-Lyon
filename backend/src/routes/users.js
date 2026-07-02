const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

// O index.js já aplica requireRole(['admin']) neste router inteiro.

// Lista usuários do tenant
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('USUARIOS')
      .select('id, name, email, role, is_active, allowed_modules, created_at')
      .eq('tenant_id', req.tenantId)
      .order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Cria usuário (auth + perfil)
router.post('/', async (req, res) => {
  const { name, email, password, role = 'operator', allowed_modules = null } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'Nome, e-mail e senha são obrigatórios' });
  if (String(password).length < 8)
    return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
  if (!['admin', 'manager', 'operator'].includes(role))
    return res.status(400).json({ error: 'Papel inválido' });

  try {
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (authError) {
      if (/already/i.test(authError.message))
        return res.status(409).json({ error: 'Já existe um usuário com este e-mail' });
      throw authError;
    }

    const { data, error } = await supabase
      .from('USUARIOS')
      .insert({
        id: authUser.user.id,
        tenant_id: req.tenantId,
        name, email, role,
        allowed_modules: role === 'admin' ? null : allowed_modules,
        is_active: true,
      })
      .select('id, name, email, role, is_active, allowed_modules')
      .single();
    if (error) throw error;
    audit(req, 'create', 'user', data.id, { email, role });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Atualiza nome, papel, módulos e status
router.patch('/:id', async (req, res) => {
  const { name, role, allowed_modules, is_active } = req.body;
  if (role && !['admin', 'manager', 'operator'].includes(role))
    return res.status(400).json({ error: 'Papel inválido' });

  // Impede o admin de remover o próprio papel/acesso (lockout)
  if (req.params.id === req.user.id && (role && role !== 'admin' || is_active === false))
    return res.status(400).json({ error: 'Você não pode rebaixar ou desativar a si mesmo' });

  try {
    const upd = {};
    if (name !== undefined)            upd.name = name;
    if (role !== undefined)            upd.role = role;
    if (is_active !== undefined)       upd.is_active = is_active;
    if (allowed_modules !== undefined) upd.allowed_modules = allowed_modules;
    if (upd.role === 'admin')          upd.allowed_modules = null;

    const { data, error } = await supabase
      .from('USUARIOS')
      .update(upd)
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select('id, name, email, role, is_active, allowed_modules')
      .single();
    if (error) throw error;
    audit(req, 'update', 'user', data.id, upd);
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Redefine a senha de um usuário
router.post('/:id/password', async (req, res) => {
  const { password } = req.body;
  if (!password || password.length < 8)
    return res.status(400).json({ error: 'Senha deve ter pelo menos 8 caracteres' });
  try {
    // garante que o usuário pertence ao tenant antes de mexer no auth
    const { data: target } = await supabase
      .from('USUARIOS').select('id')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

    const { error } = await supabase.auth.admin.updateUserById(req.params.id, { password });
    if (error) throw error;
    audit(req, 'password', 'user', req.params.id, null);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
