// Cotação e rastreio via API BrasPress.
//  - Cotação:  POST /v1/cotacao/calcular/json  → { prazo, totalFrete }
//  - Rastreio: GET  /v3/tracking/byNf/{cnpj}/{nota}/json
// Autenticação: Basic base64(usuario:senha).
//
// Credenciais vêm de EMPRESAS.settings.frete (bp_*), com fallback nas
// variáveis de ambiente BRASPRESS_*. Sem elas, o recurso responde
// "não configurada" e nada quebra.
const onlyDigits = s => String(s || '').replace(/\D/g, '');

// Garante protocolo na URL base (o lojista pode digitar "api.braspress.com" sem
// https:// — o fetch exige URL absoluta, senão a cotação estoura silenciosamente).
function normalizeBase(url, fallback) {
  let b = String(url || '').trim().replace(/\/+$/, '');
  if (!b) return fallback;
  if (!/^https?:\/\//i.test(b)) b = 'https://' + b;
  return b;
}

// Lê os campos bp_* já resolvidos pelo getFreteConfig (shipping.js)
function bpConfig(cfg) {
  return {
    enabled:   !!cfg.bp_enabled,
    base:      normalizeBase(cfg.bp_base_url, 'https://api.braspress.com'),
    user:      cfg.bp_user || '',
    password:  cfg.bp_password || '',
    cnpj:      onlyDigits(cfg.bp_cnpj),        // CNPJ remetente / pagador do frete
    cnpjDest:  onlyDigits(cfg.bp_cnpj_dest),   // CNPJ padrão do destinatário p/ cotação (consumidor sem CNPJ)
    modal:     (cfg.bp_modal || 'R').toUpperCase(),   // R = rodoviário, A = aéreo
    tipoFrete: Number(cfg.bp_tipo_frete) || 1,        // 1 = CIF, 2 = FOB
  };
}

// Precisa de usuário, senha e CNPJ para operar
function bpReady(cfg) {
  const c = bpConfig(cfg);
  return !!(c.user && c.password && c.cnpj);
}

function bpAuth(c) {
  return 'Basic ' + Buffer.from(`${c.user}:${c.password}`).toString('base64');
}

function bpNotConfigured() {
  const e = new Error('BrasPress não configurada. Vá em Configurações → Transportadora e preencha usuário, senha e CNPJ da API BrasPress.');
  e.status = 400; return e;
}

// Extrai uma mensagem de erro legível dos vários formatos da BrasPress
function bpErrMsg(raw, status) {
  if (Array.isArray(raw?.errorList) && raw.errorList.length) return raw.errorList.join('; ');
  return raw?.message || raw?.error || `HTTP ${status}`;
}

// Cotação de frete. Dimensões da cubagem em METROS; peso em kg.
// cubagem: [{ comprimento, largura, altura, volumes }]
async function braspressCotar(cfg, opts) {
  const c = bpConfig(cfg);
  if (!bpReady(cfg)) throw bpNotConfigured();
  const {
    cepOrigem, cepDestino, cnpjDestinatario, vlrMercadoria,
    peso, volumes, cubagem, modal, tipoFrete,
  } = opts || {};

  const body = {
    cnpjRemetente:    c.cnpj,
    cnpjDestinatario: onlyDigits(cnpjDestinatario) || c.cnpjDest || c.cnpj,
    modal:            (modal || c.modal || 'R').toUpperCase(),
    tipoFrete:        String(tipoFrete || c.tipoFrete || 1),
    cepOrigem:        onlyDigits(cepOrigem),
    cepDestino:       onlyDigits(cepDestino),
    vlrMercadoria:    Math.max(Number(vlrMercadoria) || 0, 0.01),
    peso:             Math.max(Number(peso) || 0, 0.1),
    volumes:          Math.max(1, parseInt(volumes) || 1),
    cubagem: (Array.isArray(cubagem) && cubagem.length ? cubagem : [
      { comprimento: 0.16, largura: 0.11, altura: 0.10, volumes: 1 },
    ]).map(v => ({
      comprimento: Math.max(Number(v.comprimento) || 0.01, 0.01),
      largura:     Math.max(Number(v.largura)     || 0.01, 0.01),
      altura:      Math.max(Number(v.altura)      || 0.01, 0.01),
      volumes:     Math.max(1, parseInt(v.volumes) || 1),
    })),
  };

  const resp = await fetch(`${c.base}/v1/cotacao/calcular/json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', Authorization: bpAuth(c) },
    body: JSON.stringify(body),
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(`BrasPress: ${bpErrMsg(raw, resp.status)}`);
    // 401 (credencial errada) é problema de configuração, não da BrasPress
    e.status = resp.status === 401 ? 400 : 502;
    throw e;
  }
  return {
    id:    raw.id != null ? String(raw.id) : null,
    price: Number(raw.totalFrete) || 0,
    days:  raw.prazo != null ? Number(raw.prazo) : null,
  };
}

// Rastreio por Nota Fiscal. `cnpj` é o pagador do frete (default: CNPJ da config).
async function braspressTracking(cfg, { cnpj, nf } = {}) {
  const c = bpConfig(cfg);
  if (!bpReady(cfg)) throw bpNotConfigured();
  const payer = onlyDigits(cnpj) || c.cnpj;
  const nota = onlyDigits(nf);
  if (!nota) { const e = new Error('Informe o número da Nota Fiscal.'); e.status = 400; throw e; }

  const resp = await fetch(`${c.base}/v3/tracking/byNf/${payer}/${nota}/json`, {
    headers: { Accept: 'application/json', Authorization: bpAuth(c) },
  });
  const raw = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    const e = new Error(`BrasPress: ${bpErrMsg(raw, resp.status)}`);
    e.status = resp.status === 404 ? 404 : 502;
    throw e;
  }

  const conhec = Array.isArray(raw?.conhecimentos) ? raw.conhecimentos[0] : (raw || {});
  const local = [conhec?.cidade, conhec?.uf].filter(Boolean).join(' / ') || null;
  // v3 traz `timeline`/`ocorrencias`; normaliza p/ o formato do painel de rastreio
  const src = conhec?.timeline || conhec?.ocorrencias || [];
  const events = (Array.isArray(src) ? src : []).map(o => ({
    time:   o.data || o.dataOcorrencia || null,
    status: o.descricao || o.ocorrencia || null,
    where:  o.cidade ? [o.cidade, o.uf].filter(Boolean).join(' / ') : local,
    desc:   o.descricao || null,
  }));

  return {
    nf: nota,
    numero:          conhec?.numero || null,
    status:          conhec?.status || conhec?.ultimaOcorrencia || null,
    previsaoEntrega: conhec?.previsaoEntrega || null,
    dataEntrega:     conhec?.dataEntrega || null,
    events,
  };
}

module.exports = { braspressCotar, braspressTracking, bpReady, bpConfig };
