// Consulta de crédito (Serasa/SPC via API agregadora).
// Fica aqui porque clientes, fornecedores e transportadoras usam a mesma
// configuração e o mesmo adaptador de provedor.
const supabase = require('../config/supabase');

async function getCreditConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.credito) || {};
  } catch { s = {}; }
  return {
    provider:    s.provider    || process.env.CREDIT_PROVIDER || '',
    api_url:     s.api_url      || process.env.CREDIT_API_URL  || '',
    api_key:     s.api_key      || process.env.CREDIT_API_KEY  || '',
    auth_header: s.auth_header  || '',          // vazio = Authorization: Bearer
    cpf_field:   s.cpf_field    || 'cpf',
  };
}

// Adaptador do provedor: faz a chamada e normaliza o retorno.
// A leitura exata dos campos (score/negativado/restrições) é ajustada conforme
// a documentação do provedor escolhido — por isso fica isolada aqui.
async function consultarCredito(cpf, cfg) {
  if (!cfg.api_url || !cfg.api_key) {
    const err = new Error('Provedor de crédito não configurado. Vá em Configurações → Crédito e informe a URL e a chave da API.');
    err.status = 400; throw err;
  }
  const headers = { 'Content-Type': 'application/json' };
  if (cfg.auth_header) headers[cfg.auth_header] = cfg.api_key;
  else headers['Authorization'] = `Bearer ${cfg.api_key}`;

  const resp = await fetch(cfg.api_url, {
    method: 'POST', headers,
    body: JSON.stringify({ [cfg.cpf_field]: String(cpf).replace(/\D/g, '') }),
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const err = new Error(raw?.message || raw?.error || `Falha na consulta (HTTP ${resp.status})`);
    err.status = 502; throw err;
  }

  // Extração tolerante (ajusto os nomes dos campos com a doc do provedor)
  const pick = (...keys) => { for (const k of keys) { const v = k.split('.').reduce((o, kk) => (o == null ? o : o[kk]), raw); if (v != null) return v; } return null; };
  const score = pick('score', 'scoreValue', 'credit_score', 'pontuacao', 'Score', 'resultado.score');
  let negativado = pick('negativado', 'hasRestrictions', 'possuiRestricao', 'restricao');
  const restricoes = pick('restricoes', 'pendencias', 'negativacoes', 'restrictions') || [];
  const total = pick('totalRestricoes', 'valorTotalRestricoes', 'totalPendencias');
  if (negativado == null) negativado = Array.isArray(restricoes) ? restricoes.length > 0 : null;
  const n = Number(score);
  const faixa = isNaN(n) ? null : (n < 300 ? 'Muito baixo' : n < 500 ? 'Baixo' : n < 700 ? 'Médio' : n < 850 ? 'Bom' : 'Excelente');

  return {
    score: isNaN(n) ? null : n, score_faixa: faixa,
    negativado: negativado == null ? null : !!negativado,
    total_restricoes: total != null ? Number(total) : null,
    restricoes: Array.isArray(restricoes) ? restricoes : (restricoes ? [restricoes] : []),
    raw,
  };
}

module.exports = { getCreditConfig, consultarCredito };
