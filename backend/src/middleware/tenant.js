const supabase = require('../config/supabase');
const { loadSetor, resolverAcesso } = require('../lib/setores');

async function tenantMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data: userProfile, error } = await supabase
      .from('USUARIOS')
      .select('*, EMPRESAS(*)')
      .eq('id', req.user.id)
      .single();

    if (error || !userProfile) {
      return res.status(403).json({ error: 'Perfil de usuário não encontrado' });
    }

    if (!userProfile.is_active) {
      return res.status(403).json({ error: 'Usuário inativo' });
    }

    if (!userProfile.EMPRESAS?.is_active) {
      return res.status(403).json({ error: 'Empresa inativa' });
    }

    req.userProfile = userProfile;
    req.tenantId = userProfile.tenant_id;

    // O acesso efetivo (setor + extras do usuário) resolvido uma vez por
    // requisição. É o que o requireModules consulta logo adiante.
    const setor = await loadSetor(userProfile.tenant_id, userProfile.sector_key);
    req.acesso = resolverAcesso(userProfile, setor);

    next();
  } catch (err) {
    return res.status(500).json({ error: 'Falha ao carregar perfil do usuário' });
  }
}

module.exports = { tenantMiddleware };
