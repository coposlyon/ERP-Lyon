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
    const tel = est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : '';
    return {
      name:         raw.razao_social      || '',
      trade_name:   est.nome_fantasia     || '',
      email:        est.email             || '',
      phone:        tel,
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

// GET /api/cnpj/:digits — tenta 4 APIs em sequência no servidor (sem CORS)
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

  for (const api of apis) {
    try {
      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 6000);

      const response = await fetch(api.url, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json', 'User-Agent': 'ERP-Lyon/1.0' },
      });
      clearTimeout(timeout);

      if (!response.ok) continue;

      const data = await response.json();
      if (!api.ok(data)) continue;

      const result = normalize(api.name, data);
      if (!result?.name) continue;

      console.log(`[cnpj] ${cnpj} encontrado via ${api.name}`);
      return res.json({ ...result, source: api.name });

    } catch (err) {
      console.warn(`[cnpj] ${api.name} falhou: ${err.message}`);
      continue;
    }
  }

  res.status(404).json({ error: 'CNPJ não encontrado em nenhuma fonte' });
});

module.exports = router;
