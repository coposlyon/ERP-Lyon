const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

/**
 * POST /api/employees/access
 * Cria ou atualiza o acesso ao sistema de um colaborador.
 * Apenas admins podem chamar este endpoint.
 */
router.post('/access', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerenciar acessos' });
  }

  const { customer_id, email, password, name, allowed_modules } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório' });
  }

  try {
    // Verifica se já existe usuário com esse email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let authUserId;

    if (existingUser) {
      // Atualiza senha apenas se uma nova foi informada
      if (password) {
        await supabase.auth.admin.updateUserById(existingUser.id, { password });
      }
      authUserId = existingUser.id;
    } else {
      if (!password) {
        return res.status(400).json({ error: 'Senha é obrigatória para criar um novo acesso' });
      }
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) throw authError;
      authUserId = authUser.user.id;
    }

    // Upsert no USUARIOS — allowed_modules é a fonte usada pelo
    // middleware de permissões em toda requisição
    const { error: profileError } = await supabase
      .from('USUARIOS')
      .upsert({
        id: authUserId,
        tenant_id: req.tenantId,
        name: name || email,
        email,
        role: 'operator',
        allowed_modules: Array.isArray(allowed_modules) ? allowed_modules : [],
        is_active: true,
      }, { onConflict: 'id' });

    if (profileError) throw profileError;

    audit(req, 'access', 'employee', customer_id || authUserId, {
      email,
      password_changed: !!password,
      modules: Array.isArray(allowed_modules) ? allowed_modules.length : 0,
    });
    res.json({ success: true, user_id: authUserId });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Erro ao criar acesso' });
  }
});

/**
 * DELETE /api/employees/access/:userId
 * Desativa o acesso ao sistema de um colaborador.
 */
router.delete('/access/:userId', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem remover acessos' });
  }

  try {
    await supabase
      .from('USUARIOS')
      .update({ is_active: false })
      .eq('id', req.params.userId)
      .eq('tenant_id', req.tenantId);

    audit(req, 'revoke', 'user', req.params.userId, null);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
