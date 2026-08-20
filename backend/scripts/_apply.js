require('dotenv').config();
const fs = require('fs');
const { Client } = require('pg');
(async () => {
  const sql = fs.readFileSync(process.argv[2], 'utf8');
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query(sql);
  console.log('OK:', process.argv[2]);
  await c.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
