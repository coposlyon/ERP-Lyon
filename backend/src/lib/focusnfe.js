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

  return { ok: res.ok, status: res.status, data };
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

// Os caminhos de XML/DANFE retornados pela API são relativos à base
function fileUrl(ambiente, caminho) {
  if (!caminho) return null;
  return `${baseUrl(ambiente)}${caminho}`;
}

module.exports = { emitirNfe, consultarNfe, cancelarNfe, fileUrl };
