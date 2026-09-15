#!/usr/bin/env node
/**
 * Gera ESTRUTURA_BANCO.md a partir do information_schema do banco do
 * DATABASE_URL (backend/.env). Só estrutura — nenhum dado, senha ou chave.
 *
 *   node backend/scripts/gerar-estrutura-banco.js
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

(async () => {
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const { rows: cols } = await client.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.udt_name, c.is_nullable, c.column_default
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.table_name NOT LIKE 'bkp\\_%'
    ORDER BY c.table_name, c.ordinal_position`);
  const { rows: fks } = await client.query(`
    SELECT cl.relname AS tabela, att.attname AS coluna, pa.relname AS referencia
    FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid
    JOIN pg_class pa ON pa.oid = co.confrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
    JOIN pg_attribute att ON att.attrelid = co.conrelid AND att.attnum = co.conkey[1]
    WHERE co.contype = 'f' AND array_length(co.conkey, 1) = 1`);
  const { rows: [mig] } = await client.query('SELECT max(version) AS v, count(*) AS n FROM "_MIGRATIONS"');
  await client.end();

  const ref = new Map(fks.map(f => [`${f.tabela}.${f.coluna}`, f.referencia]));
  const tipo = c => (c.data_type === 'USER-DEFINED' || c.data_type === 'ARRAY' ? c.udt_name.replace(/^_/, '') + (c.data_type === 'ARRAY' ? '[]' : '') : c.data_type);
  const tabelas = [...new Set(cols.map(c => c.table_name))];

  let md = '# Estrutura do banco - ERP Lyon\n\n';
  md += 'Gerado do information_schema por `node backend/scripts/gerar-estrutura-banco.js`. Somente estrutura: nenhum dado, senha, token ou chave.\n\n';
  md += `Gerado em ${new Date().toISOString().slice(0, 10)} · ${tabelas.length} tabelas · última migração aplicada: ${mig.v} (${mig.n} registradas).\n\n`;
  for (const t of tabelas) {
    md += `\n## ${t}\n\n`;
    for (const c of cols.filter(x => x.table_name === t)) {
      const r = ref.get(`${t}.${c.column_name}`);
      const def = c.column_default && !/^nextval|^gen_random_uuid|^now\(\)$/.test(c.column_default) ? ` default ${c.column_default}` : '';
      md += `- **${c.column_name}** ${tipo(c)}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${def}${r ? ` -> ${r}` : ''}\n`;
    }
  }
  fs.writeFileSync(path.join(__dirname, '..', '..', 'ESTRUTURA_BANCO.md'), md);
  console.log(`ESTRUTURA_BANCO.md: ${tabelas.length} tabelas, migração ${mig.v}`);
})().catch(err => { console.error(err.message); process.exit(1); });
