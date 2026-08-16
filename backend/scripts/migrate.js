#!/usr/bin/env node
/**
 * Aplica as migrações pendentes pela linha de comando.
 *
 *   node backend/scripts/migrate.js            → aplica o que falta
 *   node backend/scripts/migrate.js --dry      → só lista, não aplica
 *   node backend/scripts/migrate.js 065        → aplica só essa versão
 *
 * O servidor já faz isso sozinho na subida (backend/src/lib/migrate.js);
 * este script é para rodar fora do deploy — conferir o que falta, aplicar
 * uma versão específica depois de corrigir um SQL, esse tipo de coisa.
 *
 * Precisa de DATABASE_URL no backend/.env (conexão direta do Supabase).
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { rodarMigracoes } = require('../src/lib/migrate');

const args = process.argv.slice(2);
const dry  = args.includes('--dry');
const alvo = args.find(a => /^\d{3}$/.test(a)) || null;

rodarMigracoes({ dry, alvo })
  .then(r => {
    if (r.erro) { console.error(r.erro); process.exit(1); }
    console.log(`\nEstado: ${r.estado}`);
    if (r.pendentes.length) console.log(`Pendentes: ${r.pendentes.join(', ')}`);
  })
  .catch(err => { console.error(err.message); process.exit(1); });
