const { createClient } = require('@supabase/supabase-js');
const WebSocket = require('ws');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
}

/**
 * Sempre inclui ws como transport (obrigatório no Node.js < 22).
 *
 * E SEMPRE DESLIGA O AUTO-REFRESH. O padrão do supabase-js liga um
 * temporizador que fica renovando a sessão sozinho — faz sentido num
 * navegador, onde existe UM cliente que vive enquanto a aba estiver
 * aberta. No servidor, onde se cria um cliente por requisição, cada um
 * deixa o próprio temporizador rodando para sempre: o processo vai
 * acumulando milhares deles, e um dia para de responder.
 *
 * Foi exatamente isso que derrubou a produção — todas as rotas
 * autenticadas pendurando, enquanto as públicas (que usam o cliente
 * único criado na subida) continuavam respondendo. Aqui o padrão passa a
 * ser o seguro; quem precisar de sessão viva pede explicitamente.
 */
function makeClient(url, key, opts = {}) {
  return createClient(url, key, {
    ...opts,
    auth: { autoRefreshToken: false, persistSession: false, ...(opts.auth || {}) },
    realtime: { transport: WebSocket, ...(opts.realtime || {}) },
  });
}

const supabase = makeClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

module.exports = supabase;
module.exports.makeClient = makeClient;
