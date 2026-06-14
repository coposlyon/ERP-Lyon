const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');

// Busca global: produtos, clientes e vendas (Ctrl+K)
router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ products: [], customers: [], sales: [] });
  const s = q.replace(/[,()%]/g, ' ');
  const isNum = /^\d+$/.test(s);
  try {
    const [{ data: products }, { data: customers }, { data: sales }] = await Promise.all([
      supabase.from('PRODUTOS').select('id, name, code, sale_price')
        .eq('tenant_id', req.tenantId).eq('is_active', true)
        .or(`name.ilike.%${s}%,code.ilike.%${s}%`).limit(6),
      supabase.from('CLIENTES').select('id, name, cpf_cnpj, phone, type')
        .eq('tenant_id', req.tenantId)
        .or(`name.ilike.%${s}%,cpf_cnpj.ilike.%${s}%,phone.ilike.%${s}%`).limit(6),
      isNum
        ? supabase.from('VENDAS').select('id, number, total, status, CLIENTES(name)')
            .eq('tenant_id', req.tenantId).eq('number', parseInt(s)).limit(5)
        : Promise.resolve({ data: [] }),
    ]);
    res.json({ products: products || [], customers: customers || [], sales: sales || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
