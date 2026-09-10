// ============================================================
// Aplicação das migrações.
//
// A pasta migrations/ é a fonte da verdade; _MIGRATIONS no banco diz o
// que já entrou. Rodar isto na subida do servidor tira o passo manual
// do SQL Editor — o deploy passa a levar o schema junto com o código.
//
// Três cuidados que fazem isso ser seguro em produção:
//
//   1. Cada arquivo roda numa transação: entra inteiro ou não entra.
//      Falhou, para na hora e NÃO tenta os seguintes (uma migração
//      depende da anterior).
//   2. Lock de sessão no Postgres. Discloud pode subir duas instâncias
//      no deploy; sem o lock, as duas rodariam a mesma migração ao
//      mesmo tempo. A segunda espera e encontra tudo aplicado.
//   3. Falha de migração NÃO derruba o servidor. O ERP sobe com o
//      schema antigo (que funcionava até o deploy anterior) e o erro
//      fica no log e em /api/health — derrubar tudo por causa de um
//      ALTER TABLE seria pior que rodar sem a coluna nova.
// ============================================================
const fs   = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', '..', '..', 'migrations');
// Só os arquivos numerados. README, RODAR_TUDO e PENDENTES_* ficam de fora.
const ARQUIVO = /^(\d{3})_.+\.sql$/;

// Chave arbitrária e fixa do advisory lock — só precisa ser a mesma em
// todas as instâncias.
const LOCK_ID = 918273645;

// O último resultado, para /api/health contar o que aconteceu na subida.
let ultimoResultado = { estado: 'nao_executado' };
const estadoMigracoes = () => ultimoResultado;

function arquivosDaPasta() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR)
    .map(f => ({ f, m: f.match(ARQUIVO) }))
    .filter(x => x.m)
    .map(x => ({ version: x.m[1], file: x.f }))
    .sort((a, b) => a.version.localeCompare(b.version));
}

/**
 * DOIS ARQUIVOS COM O MESMO NÚMERO SÃO UM ERRO, E PRECISAM GRITAR.
 *
 * Isto aconteceu de verdade e passou meses despercebido. Havia
 * `099_itens_e_adicionais.sql` e `099_faixas_por_quantidade.sql`. O
 * controle do que já rodou é por NÚMERO: no dia em que o 099 do
 * primeiro foi registrado, o segundo virou invisível — não aparecia
 * como pendente, não aparecia como aplicado, simplesmente não existia
 * mais para o aplicador. As colunas que ele criava nunca chegaram ao
 * banco, e o `--dry` dizia "nada pendente" com toda a confiança.
 *
 * Um erro que se esconde é pior que um erro que derruba. Agora ele
 * aparece no log e em /api/health, com os nomes dos dois arquivos —
 * quem renomear um deles resolve em trinta segundos.
 *
 * NÃO IMPEDE A SUBIDA: as outras migrações continuam entrando. Travar o
 * deploy inteiro por causa de um arquivo mal numerado seria trocar um
 * problema silencioso por um problema barulhento demais.
 */
function numerosRepetidos(todas) {
  const porVersao = new Map();
  for (const m of todas) {
    if (!porVersao.has(m.version)) porVersao.set(m.version, []);
    porVersao.get(m.version).push(m.file);
  }
  return [...porVersao.entries()]
    .filter(([, arquivos]) => arquivos.length > 1)
    .map(([version, arquivos]) => ({ version, arquivos }));
}

/**
 * Aplica o que estiver pendente.
 *
 * @param {object}  opts
 * @param {boolean} opts.dry      só lista, não aplica
 * @param {string}  opts.alvo     aplica somente esta versão ('065')
 * @param {func}    opts.log      para onde escrever o progresso
 * @returns {Promise<{estado, aplicadas, pendentes, erro}>}
 */
async function rodarMigracoes({ dry = false, alvo = null, log = console.log } = {}) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    // A conexão direta (DATABASE_URL) é diferente da service_role usada
    // pelo PostgREST: DDL não passa pela API REST.
    const r = { estado: 'sem_database_url', aplicadas: [], pendentes: [],
                erro: 'DATABASE_URL não definida — migrações não podem rodar sozinhas.' };
    ultimoResultado = r;
    return r;
  }

  let Client;
  try { ({ Client } = require('pg')); }
  catch {
    const r = { estado: 'sem_driver', aplicadas: [], pendentes: [],
                erro: 'pacote pg não instalado — rode npm install no backend.' };
    ultimoResultado = r;
    return r;
  }

  // Supabase exige SSL; o certificado é da cadeia deles, não da máquina.
  // Os timeouts não são detalhe: sem eles, um host que não alcança o
  // Postgres direto (porta 5432 bloqueada, por exemplo) fica pendurado
  // no connect e o servidor nunca chega ao listen — 503 permanente.
  const client = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15000,
    statement_timeout: 120000,
  });
  const aplicadas = [];

  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_MIGRATIONS" (
        version    TEXT PRIMARY KEY,
        name       TEXT,
        applied_at TIMESTAMPTZ DEFAULT now()
      )`);

    // Quem não pegar o lock não fica esperando: a outra instância vai
    // aplicar tudo, e um servidor parado no boot é pior que um segundo.
    const { rows: [{ pg_try_advisory_lock: pegou }] } =
      await client.query('SELECT pg_try_advisory_lock($1)', [LOCK_ID]);
    if (!pegou) {
      const r = { estado: 'outra_instancia', aplicadas: [], pendentes: [], erro: null };
      ultimoResultado = r;
      return r;
    }

    try {
      const { rows } = await client.query('SELECT version FROM "_MIGRATIONS"');
      const jaAplicadas = new Set(rows.map(r => String(r.version)));
      const todas = arquivosDaPasta();

      // Ver numerosRepetidos(): o arquivo que divide o número com outro
      // some sem deixar rastro. Isto é o rastro.
      const repetidos = numerosRepetidos(todas);
      for (const r of repetidos) {
        log(`[migrate] ATENÇÃO: número ${r.version} usado por ${r.arquivos.length} arquivos `
          + `(${r.arquivos.join(', ')}). Só um deles roda — renomeie os outros.`);
      }
      let fila = todas.filter(m => !jaAplicadas.has(m.version));
      if (alvo) fila = fila.filter(m => m.version === alvo);

      if (!fila.length) {
        log(`[migrate] ${jaAplicadas.size} migrações aplicadas, nada pendente.`);
        const r = { estado: 'em_dia', aplicadas: [], pendentes: [], erro: null, repetidos };
        ultimoResultado = r;
        return r;
      }

      log(`[migrate] ${fila.length} pendente(s): ${fila.map(m => m.version).join(', ')}`);
      if (dry) {
        const r = { estado: 'dry', aplicadas: [], pendentes: fila.map(m => m.file), erro: null, repetidos };
        ultimoResultado = r;
        return r;
      }

      for (const m of fila) {
        const sql = fs.readFileSync(path.join(DIR, m.file), 'utf8');
        try {
          await client.query('BEGIN');
          // O arquivo inteiro de uma vez: quebrar em ';' partiria os
          // corpos $$ ... $$ das funções no meio.
          await client.query(sql);
          // Arquivos antigos nem sempre se registram sozinhos; sem isto
          // apareceriam como pendentes para sempre.
          const nome = m.file.replace(/^\d{3}_/, '').replace(/\.sql$/, '');
          await client.query(
            'INSERT INTO "_MIGRATIONS" (version, name) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING',
            [m.version, nome],
          );
          await client.query('COMMIT');
          aplicadas.push(m.file);
          log(`[migrate] ✔ ${m.file}`);
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          log(`[migrate] ✘ ${m.file}: ${err.message}`);
          log('[migrate] Nada dessa migração foi aplicado. Parando aqui — as seguintes dependem dela.');
          const r = {
            estado: 'falhou', aplicadas,
            pendentes: fila.slice(fila.indexOf(m)).map(x => x.file),
            erro: `${m.file}: ${err.message}`,
          };
          ultimoResultado = r;
          return r;
        }
      }

      log(`[migrate] ${aplicadas.length} migração(ões) aplicada(s).`);
      const r = { estado: 'aplicou', aplicadas, pendentes: [], erro: null };
      ultimoResultado = r;
      return r;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => {});
    }
  } catch (err) {
    log(`[migrate] falha de conexão: ${err.message}`);
    const r = { estado: 'erro_conexao', aplicadas, pendentes: [], erro: err.message };
    ultimoResultado = r;
    return r;
  } finally {
    await client.end().catch(() => {});
  }
}

module.exports = { rodarMigracoes, estadoMigracoes, arquivosDaPasta };
