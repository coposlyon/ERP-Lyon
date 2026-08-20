require('dotenv').config();
const { Client } = require('pg');
(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query(process.argv[2]);
  console.log(JSON.stringify(r.rows, null, 1));
  await c.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
