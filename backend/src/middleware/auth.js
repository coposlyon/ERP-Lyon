const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

// Quanto tempo esperar o Supabase confirmar o token antes de desistir.
// Oito segundos é muito mais do que a chamada leva (décimos de segundo) e
// muito menos do que o tempo em que o navegador desiste.
const TEMPO_LIMITE = 8000;

/**
 * VERIFICAÇÃO DE TOKEN SEM O CLIENTE DO SUPABASE.
 *
 * `supabase.auth.getUser(token)` é uma chamada HTTP simples embrulhada
 * numa biblioteca — e o embrulho custou caro duas vezes:
 *
 * 1. CRIANDO UM CLIENTE POR REQUISIÇÃO (como era originalmente): cada um
 *    carrega conexão e temporizador próprios, nada é fechado, e o
 *    processo incha até parar de responder. Medido: ~30 KB retidos por
 *    requisição mesmo após o coletor de lixo.
 *
 * 2. COM UM CLIENTE ÚNICO COMPARTILHADO (a correção anterior): o cliente
 *    de autenticação do supabase-js SERIALIZA as chamadas num cadeado
 *    interno. Uma única chamada travada segura todas as outras atrás
 *    dela — e o ERP inteiro para, que foi o 504 visto em produção.
 *
 * Aqui é `fetch` direto no mesmo endereço que a biblioteca chamaria, sem
 * estado entre requisições, sem cadeado e COM PRAZO. O prazo é a parte
 * que faltava desde sempre: sem ele, um Supabase lento não deixa o ERP
 * lento — deixa o ERP parado, porque a requisição nunca termina e o
 * navegador fica girando.
 *
 * Timeout responde 503, e não 401: dizer "token inválido" quando o
 * problema é a rede faria o sistema deslogar todo mundo por engano.
 */
async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }

  const token = authHeader.split(' ')[1];

  // AbortController em vez de AbortSignal.timeout: funciona em qualquer
  // Node 18+, sem depender da versão do runtime da hospedagem.
  const ctrl = new AbortController();
  const alarme = setTimeout(() => ctrl.abort(), TEMPO_LIMITE);

  try {
    const r = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${token}` },
      signal: ctrl.signal,
    });

    if (!r.ok) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    // O endereço devolve o usuário na raiz do corpo. Aceito também a
    // forma aninhada por segurança: se um dia o formato mudar, o pior
    // caso é continuar funcionando — e não deslogar a empresa inteira
    // porque o `id` mudou de lugar.
    const corpo = await r.json();
    const user = corpo?.id ? corpo : corpo?.user;
    if (!user?.id) {
      console.error('[auth] resposta sem id do usuário:', Object.keys(corpo || {}).join(','));
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.user = user;
    req.token = token;
    next();
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[auth] Supabase não respondeu em', TEMPO_LIMITE, 'ms');
      return res.status(503).json({
        error: 'A verificação de acesso está demorando. Tente de novo em instantes.',
      });
    }
    console.error('[auth]', err.message);
    return res.status(401).json({ error: 'Authentication failed' });
  } finally {
    clearTimeout(alarme);
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
