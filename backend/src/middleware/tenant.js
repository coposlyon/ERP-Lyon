const supabase = require('../config/supabase');
const { loadSetor, resolverAcesso } = require('../lib/setores');

async function tenantMiddleware(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const { data: userProfile, error } = await supabase
      .from('USUARIOS')
      // A RELAÇÃO VAI EXPLÍCITA: `EMPRESAS!USUARIOS_tenant_id_fkey`.
      //
      // `EMPRESAS(*)` sozinho parou de funcionar e derrubou TODA
      // requisição autenticada do sistema com "Perfil de usuário não
      // encontrado" — as telas de Clientes e Produtos mostrando zero
      // cadastros como se os dados tivessem sumido.
      //
      // O motivo: o PostgREST monta o caminho entre duas tabelas pelas
      // chaves estrangeiras, e qualquer tabela que aponte para USUARIOS
      // E para EMPRESAS ao mesmo tempo é lida como tabela de ligação
      // entre as duas. VENDAS, COMPRAS, ORCAMENTOS e outras cinco já
      // eram; as duas do chat (migração 110) entraram na conta e, ao
      // recarregar o cache de schema, ele passou a recusar: "more than
      // one relationship was found".
      //
      // Nomear a chave encerra a dúvida — e continua encerrando no dia
      // em que a nona tabela ligar as duas.
      .select('*, EMPRESAS!USUARIOS_tenant_id_fkey(*)')
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
