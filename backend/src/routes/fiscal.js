const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

router.get('/invoices', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('NOTAS_FISCAIS')
      .select('*, VENDAS(number, CLIENTES(name))', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false });

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('created_at', start_date);
    if (end_date) query = query.lte('created_at', end_date + 'T23:59:59');
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data, total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/emit/:sale_id', async (req, res) => {
  res.json({
    message: 'Emissão de NF-e enfileirada',
    note: 'Requer configuração do certificado digital A1 nas Configurações',
  });
});

router.get('/invoices/:id/pdf', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('NOTAS_FISCAIS')
      .select('pdf_url, key')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Nota fiscal não encontrada' });
    if (!data.pdf_url) return res.status(404).json({ error: 'PDF ainda não gerado' });

    res.json({ pdf_url: data.pdf_url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
