const express = require('express');
const router  = express.Router();

// Normaliza dados vindos de qualquer API para um formato único
function normalize(source, raw) {
  if (source === 'brasilapi') {
    return {
      name:         raw.razao_social   || '',
      trade_name:   raw.nome_fantasia  || '',
      email:        raw.email          || '',
      phone:        raw.ddd_telefone_1 || raw.ddd_telefone_2 || '',
      ie:           raw.inscricao_estadual || '',
      street:       raw.logradouro     || '',
      number:       raw.numero         || '',
      complement:   raw.complemento    || '',
      neighborhood: raw.bairro         || '',
      city:         raw.municipio      || '',
      state:        raw.uf             || '',
      zip:          (raw.cep || '').replace(/\D/g, ''),
    };
  }

  if (source === 'cnpjws') {
    const est = raw.estabelecimento || {};
    // tenta montar telefone com DDD + número, fallback para telefone1 sozinho
    let phone = '';
    if (est.ddd1 && est.telefone1)       phone = `${est.ddd1}${est.telefone1}`;
    else if (est.telefone1)              phone = est.telefone1;
    else if (est.ddd2 && est.telefone2)  phone = `${est.ddd2}${est.telefone2}`;
    else if (est.telefone2)              phone = est.telefone2;

    // pega a primeira IE ativa; se nenhuma ativa, pega a primeira da lista
    const ies = est.inscricoes_estaduais || [];
    const ie  = (ies.find(x => x.ativo !== false) || ies[0])?.inscricao_estadual || '';

    return {
      name:         raw.razao_social      || '',
      trade_name:   est.nome_fantasia     || '',
      email:        est.email             || raw.email || '',
      phone:        phone.replace(/\D/g, ''),
      ie,
      street:       est.logradouro        || '',
      number:       est.numero            || '',
      complement:   est.complemento       || '',
      neighborhood: est.bairro            || '',
      city:         est.municipio?.nome   || '',
      state:        est.estado?.sigla     || '',
      zip:          (est.cep || '').replace(/\D/g, ''),
    };
  }

  if (source === 'receitaws') {
    return {
      name:         raw.nome        || '',
      trade_name:   raw.fantasia    || '',
      email:        raw.email       || '',
      phone:        (raw.telefone   || '').replace(/\D/g, ''),
      ie:           raw.inscricao_estadual || '',
      street:       raw.logradouro  || '',
      number:       raw.numero      || '',
      complement:   raw.complemento || '',
      neighborhood: raw.bairro      || '',
      city:         raw.municipio   || '',
      state:        raw.uf          || '',
      zip:          (raw.cep || '').replace(/\D/g, ''),
    };
  }

  if (source === 'minhareceita') {
    return {
      name:         raw.razao_social      || '',
      trade_name:   raw.nome_fantasia     || '',
      email:        raw.email             || '',
      phone:        raw.ddd_telefone_1    || '',
      ie:           raw.inscricao_estadual || '',
      street:       raw.logradouro        || '',
      number:       raw.numero            || '',
      complement:   raw.complemento       || '',
      neighborhood: raw.bairro            || '',
      city:         raw.municipio         || '',
      state:        raw.uf                || '',
      zip:          (raw.cep || '').replace(/\D/g, ''),
    };
  }

  return null;
}

async function fetchApi(api, cnpj) {
  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(api.url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json', 'User-Agent': 'ERP-Lyon/1.0' },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = await response.json();
    if (!api.ok(data)) return null;
    const result = normalize(api.name, data);
    return result?.name ? result : null;
  } catch {
    clearTimeout(timeout);
    return null;
  }
}

// GET /api/cnpj/:digits — tenta 4 APIs em paralelo/cascata e MESCLA campos
// Continua mesmo após achar o nome, para buscar email/telefone em outras fontes
router.get('/:digits', async (req, res) => {
  const { digits } = req.params;
  const cnpj = digits.replace(/\D/g, '');

  if (cnpj.length !== 14) {
    return res.status(400).json({ error: 'CNPJ inválido' });
  }

  const apis = [
    {
      name: 'brasilapi',
      url:  `https://brasilapi.com.br/api/cnpj/v1/${cnpj}`,
      ok:   d => !!d.razao_social,
    },
    {
      name: 'cnpjws',
      url:  `https://publica.cnpj.ws/cnpj/${cnpj}`,
      ok:   d => !!d.razao_social,
    },
    {
      name: 'minhareceita',
      url:  `https://minhareceita.org/${cnpj}`,
      ok:   d => !!d.razao_social,
    },
    {
      name: 'receitaws',
      url:  `https://www.receitaws.com.br/v1/cnpj/${cnpj}`,
      ok:   d => d.status === 'OK' && !!d.nome,
    },
  ];

  let merged = null;

  for (const api of apis) {
    // Se já temos todos os campos importantes, para
    if (merged?.name && merged?.email && merged?.phone && merged?.ie) break;

    const result = await fetchApi(api, cnpj);
    if (!result) continue;

    console.log(`[cnpj] ${cnpj} — dados de ${api.name} (email=${!!result.email}, phone=${!!result.phone})`);

    if (!merged) {
      // primeiro resultado vira a base
      merged = { ...result };
    } else {
      // preenche campos ainda vazios com dados de APIs posteriores
      if (!merged.email      && result.email)      merged.email      = result.email;
      if (!merged.phone      && result.phone)      merged.phone      = result.phone;
      if (!merged.ie         && result.ie)         merged.ie         = result.ie;
      if (!merged.trade_name && result.trade_name) merged.trade_name = result.trade_name;
      if (!merged.zip        && result.zip)        merged.zip        = result.zip;
      if (!merged.street     && result.street)     merged.street     = result.street;
      if (!merged.city       && result.city)       merged.city       = result.city;
    }
  }

  if (merged?.name) {
    return res.json({ ...merged, source: 'merged' });
  }

  res.status(404).json({ error: 'CNPJ não encontrado em nenhuma fonte' });
});

module.exports = router;
