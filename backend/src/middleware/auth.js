const { makeClient } = require('../config/supabase');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

/**
 * UM cliente, criado na subida, reaproveitado por todas as requisições.
 *
 * Antes era um cliente NOVO a cada chamada de API — e este middleware
 * roda em TODA rota autenticada, que é o caminho mais quente do
 * servidor. Cada cliente carrega o próprio temporizador e a própria
 * conexão, e nada nunca era fechado: o processo ia inchando até
 * pendurar. Do lado de fora isso aparecia como "qualquer aba fica só
 * carregando", com as telas públicas funcionando normalmente.
 *
 * Não há estado por requisição para guardar: getUser recebe o token
 * como argumento.
 */
const supabaseAuth = makeClient(supabaseUrl, supabaseAnonKey);

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Authentication failed' });
  }
}

function requireRole(roles) {
  return (req, res, next) => {
    if (!req.userProfile) {
      return res.status(403).json({ error: 'Perfil de usuário não carregado' });
    }

    if (!roles.includes(req.userProfile.role)) {
      return res.status(403).json({ error: 'Permissão insuficiente' });
    }

    next();
  };
}

module.exports = { authMiddleware, requireRole };
