#!/usr/bin/env node
/**
 * Aplica as migrações pendentes de migrations/ direto no Postgres.
 *
 *   node backend/scripts/migrate.js            → lista o que falta e aplica
 *   node backend/scripts/migrate.js --dry      → só lista, não aplica
 *   node backend/scripts/migrate.js 063        → aplica só essa versão
 *
 * Precisa de DATABASE_URL no backend/.env (conexão direta do Supabase).
 * Cada arquivo roda inteiro dentro de uma transação: ou entra todo, ou
 * nada muda. O arquivo já se registra em _MIGRATIONS no final — o script
 * confere depois e avisa se algum esqueceu.
 */

const fs   = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { Client } = require('pg');

const DIR = path.join(__dirname, '..', '..', 'migrations');
const ARQUIVO = /^(\d{3})_.+\.sql$/;   // ignora README, RODAR_TUDO, PENDENTES_*

function pendentesNaPasta() {
  return fs.readdirSync(DIR)
    .map(f => ({ f, m: f.match(ARQUIVO) }))
    .filter(x => x.m)
    .map(x => ({ version: x.m[1], file: x.f }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL não definida em backend/.env — sem ela não dá para rodar migração.');
    process.exit(1);
  }
  const args   = process.argv.slice(2);
  const dry    = args.includes('--dry');
  const alvo   = args.find(a => /^\d{3}$/.test(a)) || null;

  // Supabase exige SSL; o certificado é da cadeia deles, não da máquina.
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const { rows } = await client.query('SELECT version FROM "_MIGRATIONS"');
    const aplicadas = new Set(rows.map(r => String(r.version)));
    const todas = pendentesNaPasta();
    let fila = todas.filter(m => !aplicadas.has(m.version));
    if (alvo) fila = fila.filter(m => m.version === alvo);

    console.log(`Banco: ${aplicadas.size} migrações aplicadas · pasta: ${todas.length} arquivos`);
    if (!fila.length) { console.log('Nada pendente.'); return; }

    console.log(`\nPendentes${alvo ? ` (filtrando ${alvo})` : ''}:`);
    fila.forEach(m => console.log(`  ${m.version}  ${m.file}`));
    if (dry) { console.log('\n--dry: nada foi aplicado.'); return; }

    for (const m of fila) {
      const sql = fs.readFileSync(path.join(DIR, m.file), 'utf8');
      process.stdout.write(`\n▶ ${m.file} ... `);
      try {
        await client.query('BEGIN');
        await client.query(sql);          // arquivo inteiro: não quebrar em ';' (há $$ de funções)
        // Alguns arquivos antigos não têm o INSERT em _MIGRATIONS no final —
        // sem isso eles apareceriam como pendentes para sempre. Registra aqui.
        const nome = m.file.replace(/^\d{3}_/, '').replace(/\.sql$/, '');
        const { rowCount } = await client.query(
          'INSERT INTO "_MIGRATIONS" (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
          [m.version, nome],
        );
        await client.query('COMMIT');
        console.log(rowCount ? 'OK (registrada pelo script)' : 'OK');
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        console.log('FALHOU');
        console.error(`   ${err.message}`);
        console.error('   Nada dessa migração foi aplicado. Parando aqui.');
        process.exitCode = 1;
        return;
      }
    }
    console.log('\nPronto.');
  } finally {
    await client.end();
  }
}

main().catch(err => { console.error(err.message); process.exit(1); });
