// ============================================================
// A SESSÃO DO CLIENTE QUE VAI COMPRAR.
//
// O login da loja e do catálogo é CPF + data de nascimento. Antes ele
// devolvia só o cadastro, e o navegador guardava o cadastro e mandava o
// `customer_id` no pagamento — o servidor acreditava. Qualquer um que
// soubesse (ou inventasse) um id fechava pedido em nome de outra pessoa,
// e "Identificado como" aparecia sem ninguém ter entrado.
//
// Agora o login devolve uma chave assinada, e o pagamento só aceita a
// chave. O id no corpo da requisição não vale mais nada.
// ============================================================
const jwt = require('jsonwebtoken');

// Mesmo segredo do acompanhamento do pedido (public-pedido.js).
const SEGREDO = process.env.PEDIDO_TOKEN_SECRET
  || process.env.JWT_SECRET
  || process.env.SUPABASE_SERVICE_KEY;

// Escopo próprio: a chave do acompanhamento não fecha compra, e esta não
// abre pedido de ninguém.
const ESCOPO = 'compra';
const VALIDADE = '7d';

function assinarSessao(customerId) {
  return jwt.sign({ customer_id: customerId, escopo: ESCOPO }, SEGREDO, { expiresIn: VALIDADE });
}

/** O cliente da chave em `Authorization: Bearer`, ou null. */
function clienteDaSessao(req) {
  const bruto = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '');
  if (!bruto) return null;
  try {
    const dados = jwt.verify(bruto, SEGREDO);
    return dados.escopo === ESCOPO && dados.customer_id ? dados.customer_id : null;
  } catch {
    return null;
  }
}

module.exports = { assinarSessao, clienteDaSessao };
