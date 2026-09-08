require('dotenv').config();
const express = require('express');
const supabase = require('./src/config/supabase');
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
(async () => {
  const { data: u } = await supabase.from('USUARIOS').select('*').eq('tenant_id', T).eq('role','admin').maybeSingle();
  const app = express(); app.use(express.json());
  app.use((req,_r,n)=>{ req.tenantId=T; req.user={id:u.id,email:u.email}; req.userProfile=u; req.acesso={modules:null}; n(); });
  app.use('/customers', require('./src/routes/customers'));
  app.use('/products', require('./src/routes/products'));
  const s = app.listen(0); const base = `http://127.0.0.1:${s.address().port}`;
  for (const url of ['/customers?page=1&limit=100&type=cliente', '/customers?page=1&limit=100', '/customers?page=1&limit=100&type=CO']) {
    const r = await fetch(base + url);
    const b = await r.json().catch(() => null);
    const n = Array.isArray(b) ? b.length : (b?.data?.length ?? '—');
    console.log(`${url}\n   status ${r.status} | itens: ${n} | total: ${b?.total ?? '—'}${b?.error ? ' | ERRO: ' + b.error : ''}`);
  }
  s.close();
})().catch(e => { console.error('THROW:', e.message); process.exit(1); });
