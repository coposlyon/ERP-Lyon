/**
 * Cliente da API Focus NFe (https://focusnfe.com.br/doc/).
 * Autenticação: HTTP Basic com o token como usuário e senha vazia.
 * Homologação é gratuita para testes; produção exige plano contratado
 * e a empresa cadastrada no painel da Focus com certificado A1.
 */

const BASES = {
  homologacao: 'https://homologacao.focusnfe.com.br',
  producao:    'https://api.focusnfe.com.br',
};

function baseUrl(ambiente) {
  return BASES[ambiente] || BASES.homologacao;
}

function authHeader(token) {
  return 'Basic ' + Buffer.from(`${token}:`).toString('base64');
}

async function request(ambiente, token, method, path, body) {
  const res = await fetch(`${baseUrl(ambiente)}${path}`, {
    method,
    headers: {
      Authorization: authHeader(token),
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* respostas sem corpo */ }

  // Os HEADERS entram na resposta por causa da sincronia de notas
  // recebidas: a Focus devolve X-Max-Version e X-Total-Count fora do
  // corpo, e sem eles a proxima consulta nao sabe de onde continuar.
  return { ok: res.ok, status: res.status, data, headers: res.headers };
}

// Igual ao request, mas devolve TEXTO — o XML da nota vem cru, e passar
// um XML por JSON.parse so gera um erro que nao diz o que aconteceu.
async function requestText(ambiente, token, method, path) {
  const res = await fetch(`${baseUrl(ambiente)}${path}`, {
    method,
    headers: { Authorization: authHeader(token) },
  });
  let text = null;
  try { text = await res.text(); } catch { /* corpo vazio */ }
  return { ok: res.ok, status: res.status, text, headers: res.headers };
}

// Envia uma NF-e para autorização (processamento assíncrono na SEFAZ)
function emitirNfe(ambiente, token, ref, payload) {
  return request(ambiente, token, 'POST', `/v2/nfe?ref=${encodeURIComponent(ref)}`, payload);
}

// Consulta o status atual de uma NF-e pela ref
function consultarNfe(ambiente, token, ref) {
  return request(ambiente, token, 'GET', `/v2/nfe/${encodeURIComponent(ref)}?completa=0`);
}

// Cancela uma NF-e autorizada (justificativa: 15 a 255 caracteres)
function cancelarNfe(ambiente, token, ref, justificativa) {
  return request(ambiente, token, 'DELETE', `/v2/nfe/${encodeURIComponent(ref)}`, { justificativa });
}

// ── NOTAS RECEBIDAS: as compras do CNPJ ──────────────────────
//
// Distribuicao de DF-e da SEFAZ, servida pela Focus. Devolve TODA NF-e
// emitida contra o CNPJ informado — nao depende de o fornecedor mandar
// o XML nem de alguem digitar.
//
// `versao` e um marcador, nao uma data: pede-se o que veio DEPOIS da
// ultima versao conhecida, e a resposta traz em X-Max-Version a nova
// marca. E o que torna a sincronizacao incremental.
function listarRecebidas(ambiente, token, cnpj, versao = 0, filtros = {}) {
  const q = new URLSearchParams({ cnpj: String(cnpj || '').replace(/\D/g, '') });
  if (versao) q.set('versao', String(versao));
  // A SEFAZ cobra a ciencia da operacao em 10 dias; este filtro e o que
  // permite a tela perguntar "o que ainda falta manifestar?".
  if (filtros.pendente) q.set('pendente', '1');
  if (filtros.pendenteCiencia) q.set('pendente_ciencia', '1');
  return request(ambiente, token, 'GET', `/v2/nfes_recebidas?${q.toString()}`);
}

// O XML de uma nota recebida, pela chave de 44 digitos.
function xmlRecebida(ambiente, token, chave) {
  return requestText(ambiente, token, 'GET', `/v2/nfes_recebidas/${encodeURIComponent(chave)}.xml`);
}

/**
 * A MANIFESTACAO DO DESTINATARIO.
 *
 * Nao e enfeite: a SEFAZ da 10 dias para a empresa dar ciencia de cada
 * nota emitida contra ela, e o desconhecimento e o unico jeito de
 * recusar formalmente uma nota que nao e sua — que e como se defende de
 * nota fria emitida no seu CNPJ.
 *
 * `justificativa` so e exigida em 'nao_realizada', e ai entre 15 e 255
 * caracteres.
 */
const MANIFESTOS = ['ciencia', 'confirmacao', 'desconhecimento', 'nao_realizada'];

function manifestarRecebida(ambiente, token, chave, tipo, justificativa) {
  const corpo = { tipo };
  if (justificativa) corpo.justificativa = justificativa;
  return request(ambiente, token, 'POST',
    `/v2/nfes_recebidas/${encodeURIComponent(chave)}/manifesto`, corpo);
}

// Os caminhos de XML/DANFE retornados pela API são relativos à base
function fileUrl(ambiente, caminho) {
  if (!caminho) return null;
  return `${baseUrl(ambiente)}${caminho}`;
}

module.exports = {
  emitirNfe, consultarNfe, cancelarNfe, fileUrl,
  listarRecebidas, xmlRecebida, manifestarRecebida, MANIFESTOS,
};
