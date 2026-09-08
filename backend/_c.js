require('dotenv').config();
const { Client } = require('pg');
const T = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  for (const t of ['CLIENTES', 'PRODUTOS', 'CATEGORIAS', 'ITENS', 'FORNECEDORES']) {
    const tot = await c.query(`SELECT count(*) FROM "${t}" WHERE tenant_id=$1`, [T]);
    const geral = await c.query(`SELECT count(*) FROM "${t}"`);
    console.log(`${t.padEnd(14)} deste tenant: ${String(tot.rows[0].count).padStart(4)}   |  na tabela toda: ${geral.rows[0].count}`);
  }
  console.log('\n-- CLIENTES: is_active / type --');
  const r = await c.query(`SELECT is_active, type, count(*) FROM "CLIENTES" WHERE tenant_id=$1 GROUP BY 1,2 ORDER BY 3 DESC`, [T]);
  r.rows.forEach(x => console.log(`   is_active=${x.is_active} type=${x.type} -> ${x.count}`));
  console.log('\n-- 5 clientes --');
  const a = await c.query(`SELECT display_id, name, is_active, type FROM "CLIENTES" WHERE tenant_id=$1 ORDER BY created_at DESC LIMIT 5`, [T]);
  a.rows.forEach(x => console.log(`   ${x.display_id} ${x.name} ativo=${x.is_active} type=${x.type}`));
  await c.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
