const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

/**
 * POST /api/employees/access
 * Cria ou atualiza o acesso ao sistema de um colaborador.
 * Apenas admins podem chamar este endpoint.
 */
router.post('/access', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerenciar acessos' });
  }

  const { customer_id, email, password, name } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios para criar acesso' });
  }

  try {
    // Verifica se já existe usuário com esse email
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let authUserId;

    if (existingUser) {
      // Atualiza senha
      await supabase.auth.admin.updateUserById(existingUser.id, { password });
      authUserId = existingUser.id;
    } else {
      // Cria novo usuário no auth
      const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (authError) throw authError;
      authUserId = authUser.user.id;
    }

    // Upsert no USUARIOS
    const { error: profileError } = await supabase
      .from('USUARIOS')
      .upsert({
        id: authUserId,
        tenant_id: req.tenantId,
        name: name || email,
        email,
        role: 'operator',
        is_active: true,
      }, { onConflict: 'id' });

    if (profileError) throw profileError;

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

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
