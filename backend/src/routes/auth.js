const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { makeClient } = require('../config/supabase');
const { loadSetor, resolverAcesso } = require('../lib/setores');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email e senha são obrigatórios' });
  }

  try {
    const clientSupabase = makeClient(supabaseUrl, supabaseAnonKey);
    const { data, error } = await clientSupabase.auth.signInWithPassword({ email, password });

    if (error) {
      return res.status(401).json({ error: 'Email ou senha inválidos' });
    }

    const { data: userProfile } = await supabase
      .from('USUARIOS')
      .select('*, EMPRESAS(*)')
      .eq('id', data.user.id)
      .single();

    // Restrição de horário: colaboradores só acessam dentro do seu horário de escala
    if (userProfile && userProfile.role !== 'admin') {
      const { data: empRecord } = await supabase
        .from('CLIENTES')
        .select('admission_data')
        .eq('email', data.user.email)
        .eq('type', 'CO')
        .maybeSingle();

      if (empRecord?.admission_data?.work_start && empRecord?.admission_data?.work_end) {
        const currentTime = new Intl.DateTimeFormat('pt-BR', {
          timeZone: 'America/Sao_Paulo',
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        }).format(new Date());

        const start = empRecord.admission_data.work_start;
        const end   = empRecord.admission_data.work_end;

        if (currentTime < start || currentTime > end) {
          return res.status(403).json({
            error: `Acesso permitido apenas das ${start} às ${end}`,
            code: 'OUTSIDE_WORK_HOURS',
          });
        }
      }
    }

    // Módulos permitidos: USUARIOS.allowed_modules é a fonte oficial
    // (fallback no admission_data do colaborador para registros antigos)
    let allowedModules = null;
    if (userProfile && userProfile.role !== 'admin') {
      if (userProfile.allowed_modules !== undefined && userProfile.allowed_modules !== null) {
        allowedModules = userProfile.allowed_modules;
      } else {
        const { data: empMods } = await supabase
          .from('CLIENTES')
          .select('admission_data')
          .eq('email', data.user.email)
          .eq('type', 'CO')
          .maybeSingle();
        if (empMods?.admission_data?.allowed_modules?.length) {
          allowedModules = empMods.admission_data.allowed_modules;
        }
      }
    }

    // O setor manda no acesso quando existir; sem setor, vale o que foi
    // resolvido acima (regra antiga). É a mesma função do middleware —
    // servidor e tela não podem discordar sobre quem pode o quê.
    const setor  = await loadSetor(userProfile?.tenant_id, userProfile?.sector_key);
    const acesso = resolverAcesso({ ...userProfile, allowed_modules: allowedModules }, setor);

    res.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        name: userProfile?.name,
        role: userProfile?.role,
        tenant: userProfile?.EMPRESAS,
        allowed_modules: acesso.modules,
        // Qual ERP esta pessoa vê: 'erp' inteiro ou a área enxuta do vendedor
        layout: acesso.layout,
        home_path: acesso.home,
        sector_key: acesso.setor,
        sector_name: acesso.setorName,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Falha no login' });
  }
});

router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    // revoga a sessão de verdade no Supabase (signOut() num client novo era no-op)
    try { await supabase.auth.admin.signOut(token); } catch { /* token já inválido */ }
  }
  res.json({ message: 'Logout realizado com sucesso' });
});

router.post('/refresh', async (req, res) => {
  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: 'Refresh token obrigatório' });
  }

  try {
    const clientSupabase = makeClient(supabaseUrl, supabaseAnonKey);
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
