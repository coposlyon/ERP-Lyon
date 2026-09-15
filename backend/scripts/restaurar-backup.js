#!/usr/bin/env node
/**
 * RESTAURA UM BACKUP DO ERP (recuperação de desastre).
 *
 *   node backend/scripts/restaurar-backup.js <arquivo.json.gz> --conferir
 *       só abre o arquivo e lista tabelas e linhas; não toca no banco
 *
 *   node backend/scripts/restaurar-backup.js <arquivo.json.gz> --simular
 *       faz a restauração inteira dentro de uma transação e DESFAZ no fim:
 *       mostra o que entraria e o que falharia, sem gravar nada
 *
 *   node backend/scripts/restaurar-backup.js <arquivo.json.gz> --restaurar
 *       insere as linhas no banco do DATABASE_URL (backend/.env)
 *
 * Como funciona:
 *   1. O banco de destino precisa ter o esquema: rode antes
 *      `node backend/scripts/migrate.js` (cria todas as tabelas).
 *   2. As tabelas entram na ordem gravada no backup (pais antes de filhos).
 *   3. Cada linha entra com ON CONFLICT (id) DO NOTHING — o que já existe
 *      no destino NÃO é sobrescrito. Restaurar duas vezes não duplica.
 *   4. Só as colunas que existem no destino são usadas: um backup antigo
 *      restaura num esquema mais novo.
 *   5. Linha que falha por chave estrangeira volta para uma segunda e
 *      terceira passada, depois que as outras tabelas entraram.
 *
 * O arquivo sai de Configurações › Backup › Baixar.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const [arquivo, modo] = process.argv.slice(2);
if (!arquivo || !['--conferir', '--simular', '--restaurar'].includes(modo)) {
  console.log('Uso: node backend/scripts/restaurar-backup.js <arquivo.json.gz> --conferir | --simular | --restaurar');
  process.exit(1);
}

(async () => {
  const buf = fs.readFileSync(arquivo);
  console.log(`Arquivo: ${arquivo}`);
  console.log(`SHA-256: ${crypto.createHash('sha256').update(buf).digest('hex')}  (compare com o da tela de Backup)`);
  const b = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  if (b.formato !== 'erp-lyon-backup') throw new Error('Este arquivo não é um backup do ERP.');
  console.log(`Gerado em ${b.gerado_em} · empresa ${b.tenant_id} · migração ${b.migracao}`);
  let total = 0;
  for (const t of b.ordem) { const n = (b.tabelas[t] || []).length; total += n; if (n) console.log(`  ${t.padEnd(32)} ${n}`); }
  console.log(`Total: ${b.ordem.length} tabelas, ${total} linhas`);
  if (modo === '--conferir') return;

  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não definida em backend/.env');
  const { Client } = require('pg');
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  // Tudo numa transação; cada linha num savepoint, para uma falha não
  // derrubar as outras. --simular desfaz no fim.
  await client.query('BEGIN');

  // Colunas geradas pelo banco (GENERATED ALWAYS) não aceitam valor: ficam de fora e o banco recalcula.
  const { rows: cols } = await client.query(`SELECT table_name, column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND is_generated <> 'ALWAYS' AND coalesce(identity_generation, '') <> 'ALWAYS'`);
  const colunas = new Map();
  for (const c of cols) {
    if (!colunas.has(c.table_name)) colunas.set(c.table_name, new Map());
    colunas.get(c.table_name).set(c.column_name, c.data_type);
  }

  let pendentes = [];
  const inserir = async (t, linha) => {
    const destino = colunas.get(t);
    const chaves = Object.keys(linha).filter(k => destino.has(k));
    const valores = chaves.map(k => {
      const v = linha[k];
      return v != null && ['json', 'jsonb'].includes(destino.get(k)) ? JSON.stringify(v) : v;
    });
    const temId = destino.has('id');
    const sql = `INSERT INTO "${t}" (${chaves.map(k => `"${k}"`).join(',')}) VALUES (${chaves.map((_, i) => `$${i + 1}`).join(',')})${temId ? ' ON CONFLICT (id) DO NOTHING' : ' ON CONFLICT DO NOTHING'}`;
    await client.query('SAVEPOINT linha');
    try {
      const r = await client.query(sql, valores);
      await client.query('RELEASE SAVEPOINT linha');
      return r.rowCount;
    } catch (err) {
      await client.query('ROLLBACK TO SAVEPOINT linha');
      throw err;
    }
  };

  let inseridas = 0;
  for (const t of b.ordem) {
    if (!colunas.has(t)) { console.warn(`  ! ${t} não existe no destino — pulada`); continue; }
    for (const linha of b.tabelas[t] || []) {
      try { inseridas += await inserir(t, linha); }
      catch (err) { pendentes.push({ t, linha, erro: err.message }); }
    }
  }
  for (let passada = 2; passada <= 3 && pendentes.length; passada++) {
    const agora = pendentes; pendentes = [];
    for (const p of agora) {
      try { inseridas += await inserir(p.t, p.linha); } catch (err) { pendentes.push({ ...p, erro: err.message }); }
    }
  }
  await client.query(modo === '--simular' ? 'ROLLBACK' : 'COMMIT');
  await client.end();
  console.log(`\n${modo === '--simular' ? 'SIMULAÇÃO (nada foi gravado) — entrariam' : 'Inseridas'}: ${inseridas} linhas (as que já existiam foram mantidas).`);
  if (pendentes.length) {
    const log = `${arquivo}.falhas.json`;
    fs.writeFileSync(log, JSON.stringify(pendentes, null, 2));
    console.log(`Não entraram: ${pendentes.length} linhas — detalhes em ${log}`);
    process.exit(2);
  }
})().catch(err => { console.error('ERRO:', err.message); process.exit(1); });
