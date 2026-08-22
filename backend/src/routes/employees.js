const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');

/**
 * O ACESSO DE UM COLABORADOR AO SISTEMA.
 *
 * O colaborador vive em CLIENTES (type='CO'); o login dele vive em
 * USUARIOS + Supabase Auth. A ponte entre os dois é o e-mail de acesso.
 *
 * Três coisas viajam por aqui e não podem se separar: o papel (admin /
 * gerente / operador), os MÓDULOS (o que a API entrega) e as TELAS (o
 * que a pessoa enxerga e por onde navega). Salvar tela sem módulo
 * esconderia o caminho e deixaria o direito — por isso as duas listas
 * são gravadas na mesma chamada, do mesmo formulário.
 */

const PAPEIS = ['admin', 'manager', 'operator'];

/** A coluna allowed_screens nasceu na migração 079; antes dela, ignora. */
const semColunaTelas = err =>
  /allowed_screens/i.test(`${err?.message || ''} ${err?.details || ''}`);

/**
 * GET /api/employees/access?email=...
 * O acesso atual daquele e-mail: papel, módulos e telas liberadas.
 * É o que a tela de cadastro carrega para marcar as caixinhas certas.
 */
router.get('/access', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem ver acessos' });
  }
  const email = String(req.query.email || '').trim().toLowerCase();
  if (!email) return res.status(400).json({ error: 'Informe o e-mail' });

  try {
    const { data, error } = await supabase
      .from('USUARIOS')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .eq('email', email)
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.json({ existe: false });

    res.json({
      existe: true,
      user_id: data.id,
      name: data.name,
      role: data.role,
      is_active: data.is_active !== false,
      sector_key: data.sector_key || null,
      allowed_modules: data.allowed_modules ?? null,
      // undefined = a coluna ainda não existe no banco; null = sem
      // restrição por tela. A tela precisa saber a diferença.
      allowed_screens: data.allowed_screens ?? null,
      suporta_telas: Object.prototype.hasOwnProperty.call(data, 'allowed_screens'),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/employees/access
 * Cria ou atualiza o acesso ao sistema de um colaborador.
 * Apenas admins podem chamar este endpoint.
 */
router.post('/access', async (req, res) => {
  if (req.userProfile?.role !== 'admin') {
    return res.status(403).json({ error: 'Apenas administradores podem gerenciar acessos' });
  }

  const {
    customer_id, email, password, name, phone,
    allowed_modules, allowed_screens, role, sector_key,
  } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório' });
  }
  if (role && !PAPEIS.includes(role)) {
    return res.status(400).json({ error: 'Papel inválido' });
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

    const papel = PAPEIS.includes(role) ? role : 'operator';

    const perfil = {
      id: authUserId,
      tenant_id: req.tenantId,
      name: name || email,
      email,
      role: papel,
      // Admin não carrega lista: ele vê tudo, e uma lista guardada aqui
      // viraria mentira no dia em que um módulo novo nascesse.
      allowed_modules: papel === 'admin' ? null : (Array.isArray(allowed_modules) ? allowed_modules : []),
      is_active: true,
    };
    if (phone !== undefined) perfil.phone = phone || null;
    if (sector_key !== undefined) perfil.sector_key = sector_key || null;

    const telas = papel === 'admin' ? null : (Array.isArray(allowed_screens) ? allowed_screens : null);

    // Primeiro com as telas; se a coluna ainda não existe (migração 079
    // não rodada), grava o resto e avisa — melhor um acesso criado sem a
    // lista de telas do que um botão de salvar que não salva nada.
    let telasSalvas = true;
    let { error: profileError } = await supabase
      .from('USUARIOS')
      .upsert({ ...perfil, allowed_screens: telas }, { onConflict: 'id' });

    if (profileError && semColunaTelas(profileError)) {
      telasSalvas = false;
      ({ error: profileError } = await supabase
        .from('USUARIOS').upsert(perfil, { onConflict: 'id' }));
    }
    if (profileError) throw profileError;

    audit(req, 'access', 'employee', customer_id || authUserId, {
      email,
      password_changed: !!password,
      role: papel,
      modules: Array.isArray(allowed_modules) ? allowed_modules.length : 0,
      screens: Array.isArray(allowed_screens) ? allowed_screens.length : null,
    });
    res.json({
      success: true,
      user_id: authUserId,
      telas_salvas: telasSalvas,
      aviso: telasSalvas ? null
        : 'O acesso foi salvo, mas as permissões por tela não: rode a migração 079 no banco.',
    });
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
