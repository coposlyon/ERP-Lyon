const express = require('express');
const router  = express.Router();

// GET /api/cep/:digits — proxy para ViaCEP (evita CSP no cliente)
router.get('/:digits', async (req, res) => {
  const cep = req.params.digits.replace(/\D/g, '');

  if (cep.length !== 8) {
    return res.status(400).json({ error: 'CEP inválido — deve ter 8 dígitos.' });
  }

  const controller = new AbortController();
  const timeout    = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
      signal:  controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      return res.status(502).json({ error: 'ViaCEP retornou erro.' });
    }

    const data = await response.json();

    if (data.erro) {
      return res.status(404).json({ error: 'CEP não encontrado.' });
    }

    return res.json({
      zip:          data.cep         || '',
      street:       data.logradouro  || '',
      complement:   data.complemento || '',
      neighborhood: data.bairro      || '',
      city:         data.localidade  || '',
      state:        data.uf          || '',
      ibge:         data.ibge        || '',
    });
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout ao consultar ViaCEP.' });
    }
    return res.status(502).json({ error: 'Erro ao consultar ViaCEP.' });
  }
});

module.exports = router;
