// ============================================================
// BACKUP REDUNDANTE DA EMPRESA (Cláusula de segurança da informação)
//
// Uma cópia completa dos dados da empresa, feita pelo próprio ERP, fora
// do Postgres: JSON compactado no bucket privado BACKUPS do Storage.
//
// O QUE ENTRA. Toda tabela do schema public que tem `tenant_id` (filtrada
// pela empresa) e toda tabela-FILHA sem `tenant_id` que aponta, por chave
// estrangeira, para uma delas (VENDA_ITENS, TABELA_PRECO_ITENS…). A lista
// sai do catálogo do Postgres a cada backup — tabela nova entra sozinha,
// ninguém precisa lembrar de acrescentar.
//
// O QUE NÃO ENTRA. Tabelas de referência sem empresa (MUNICIPIOS, faixas
// de CEP), backups manuais antigos (bkp_*) e o controle de migrações —
// tudo isso é recriado pelas migrações e seeds.
//
// Formato do arquivo (.json.gz):
//   { formato: 'erp-lyon-backup', versao: 1, gerado_em, tenant_id,
//     migracao, tabelas: { NOME: [linhas…] }, ordem: [NOME…] }
// `ordem` é a sequência segura para restaurar (pais antes de filhos).
// ============================================================
const zlib = require('zlib');
const crypto = require('crypto');
const supabase = require('../config/supabase');

const BUCKET = process.env.BACKUP_STORAGE_BUCKET || 'BACKUPS';
const IGNORAR = /^(bkp_|_MIGRATIONS$|MUNICIPIOS$|TOTALEXPRESS_(ABRANGENCIA|GEOGRAFIAS|TARIFAS)$)/;
const RETER_DIARIOS = 30;
const RETER_MESES = 12;

async function conectar() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL não definida — o backup lê o banco por conexão direta.');
  const { Client } = require('pg');
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000, statement_timeout: 300000 });
  await client.connect();
  return client;
}

/** Tabelas com empresa, filhas por FK e a ordem segura de restauração. */
async function mapearTabelas(client) {
  const { rows: comTenant } = await client.query(`
    SELECT c.table_name FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name AND t.table_type = 'BASE TABLE'
    WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'`);
  const tenant = new Set(comTenant.map(r => r.table_name).filter(t => !IGNORAR.test(t)));

  const { rows: fks } = await client.query(`
    SELECT cl.relname AS filha, pa.relname AS pai, att.attname AS coluna
    FROM pg_constraint co
    JOIN pg_class cl ON cl.oid = co.conrelid
    JOIN pg_class pa ON pa.oid = co.confrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace AND ns.nspname = 'public'
    JOIN pg_attribute att ON att.attrelid = co.conrelid AND att.attnum = co.conkey[1]
    WHERE co.contype = 'f' AND array_length(co.conkey, 1) = 1`);

  // Filhas sem tenant_id: pegam as linhas pelo pai que tem tenant_id.
  const filhas = new Map();
  for (const fk of fks) {
    if (tenant.has(fk.filha) || IGNORAR.test(fk.filha) || !tenant.has(fk.pai)) continue;
    if (!filhas.has(fk.filha)) filhas.set(fk.filha, fk);
  }

  // Ordem topológica: pai antes de filho (ciclos e autorreferência são ignorados).
  const todas = [...tenant, ...filhas.keys()];
  const deps = new Map(todas.map(t => [t, new Set()]));
  for (const fk of fks) {
    if (deps.has(fk.filha) && deps.has(fk.pai) && fk.filha !== fk.pai) deps.get(fk.filha).add(fk.pai);
  }
  const ordem = [];
  const visitado = new Set();
  const emCurso = new Set();
  const visitar = t => {
    if (visitado.has(t) || emCurso.has(t)) return;
    emCurso.add(t);
    for (const p of deps.get(t) || []) visitar(p);
    emCurso.delete(t);
    visitado.add(t);
    ordem.push(t);
  };
  // EMPRESAS primeiro: é o pai de quase tudo.
  visitar('EMPRESAS');
  todas.sort().forEach(visitar);
  return { tenant, filhas, ordem: ordem.filter(t => t === 'EMPRESAS' || tenant.has(t) || filhas.has(t)) };
}

async function garantirBucket() {
  const { data } = await supabase.storage.getBucket(BUCKET);
  if (data) return;
  const { error } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (error && !/already exists/i.test(error.message)) throw error;
}

/**
 * Gera um backup completo da empresa.
 * @returns a linha de BACKUPS já concluída (status ok ou erro)
 */
async function gerarBackup(tenantId, { origem = 'manual', usuario = null, userId = null } = {}) {
  const { data: registro, error: e0 } = await supabase.from('BACKUPS')
    .insert({ tenant_id: tenantId, origem, usuario, user_id: userId, status: 'gerando' }).select().single();
  if (e0) throw e0;

  let client;
  try {
    client = await conectar();
    const { tenant, filhas, ordem } = await mapearTabelas(client);
    const { rows: [mig] } = await client.query('SELECT max(version) AS v FROM "_MIGRATIONS"').catch(() => ({ rows: [{}] }));

    const tabelas = {};
    const detalhes = {};
    let linhas = 0;
    for (const t of ordem) {
      let sql;
      if (t === 'EMPRESAS') sql = { text: 'SELECT * FROM "EMPRESAS" WHERE id = $1', values: [tenantId] };
      else if (tenant.has(t)) sql = { text: `SELECT * FROM "${t}" WHERE tenant_id = $1`, values: [tenantId] };
      else {
        const fk = filhas.get(t);
        sql = { text: `SELECT f.* FROM "${t}" f JOIN "${fk.pai}" p ON p.id = f."${fk.coluna}" WHERE p.tenant_id = $1`, values: [tenantId] };
      }
      // O próprio registro de backups fica de fora (ele descreve os arquivos).
      if (t === 'BACKUPS') continue;
      const { rows } = await client.query(sql);
      tabelas[t] = rows;
      detalhes[t] = rows.length;
      linhas += rows.length;
    }

    const conteudo = {
      formato: 'erp-lyon-backup', versao: 1, gerado_em: new Date().toISOString(),
      tenant_id: tenantId, migracao: mig?.v || null,
      ordem: ordem.filter(t => t !== 'BACKUPS'), tabelas,
    };
    const json = Buffer.from(JSON.stringify(conteudo));
    const gz = zlib.gzipSync(json, { level: 9 });
    const sha256 = crypto.createHash('sha256').update(gz).digest('hex');

    await garantirBucket();
    const agora = new Date();
    const carimbo = agora.toISOString().replace(/[-:]/g, '').replace('T', '_').slice(0, 15);
    const arquivo = `${tenantId}/backup_${carimbo}_${origem}.json.gz`;
    const { error: eUp } = await supabase.storage.from(BUCKET).upload(arquivo, gz, { contentType: 'application/gzip', upsert: false });
    if (eUp) throw eUp;

    const { data: ok } = await supabase.from('BACKUPS').update({
      status: 'ok', concluido_em: new Date().toISOString(), arquivo, bytes: gz.length, bytes_json: json.length,
      sha256, tabelas: Object.keys(tabelas).length, linhas, detalhes,
    }).eq('id', registro.id).select().single();

    aplicarRetencao(tenantId).catch(err => console.error('[backup] retenção:', err.message));
    return ok;
  } catch (err) {
    console.error('[backup] falhou:', err.message);
    const { data: falha } = await supabase.from('BACKUPS').update({
      status: 'erro', concluido_em: new Date().toISOString(), erro: String(err.message || err).slice(0, 2000),
    }).eq('id', registro.id).select().single();
    return falha;
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

/** Mantém os 30 diários mais recentes e o primeiro de cada mês por 12 meses. */
async function aplicarRetencao(tenantId) {
  const { data } = await supabase.from('BACKUPS').select('id, criado_em, arquivo')
    .eq('tenant_id', tenantId).eq('status', 'ok').order('criado_em', { ascending: false });
  const lista = data || [];
  const manter = new Set(lista.slice(0, RETER_DIARIOS).map(b => b.id));
  const limiteMes = new Date(); limiteMes.setMonth(limiteMes.getMonth() - RETER_MESES);
  const primeiroDoMes = new Map();
  for (const b of [...lista].reverse()) {
    const mes = b.criado_em.slice(0, 7);
    if (new Date(b.criado_em) >= limiteMes && !primeiroDoMes.has(mes)) primeiroDoMes.set(mes, b.id);
  }
  primeiroDoMes.forEach(id => manter.add(id));
  const expirar = lista.filter(b => !manter.has(b.id));
  if (!expirar.length) return 0;
  await supabase.storage.from(BUCKET).remove(expirar.map(b => b.arquivo).filter(Boolean));
  await supabase.from('BACKUPS').update({ status: 'expirado' }).in('id', expirar.map(b => b.id));
  return expirar.length;
}

async function linkDownload(arquivo, segundos = 600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(arquivo, segundos, { download: arquivo.split('/').pop() });
  if (error) throw error;
  return data.signedUrl;
}

/** Baixa o arquivo de novo e confere o SHA-256 e se o JSON abre. */
async function verificarBackup(b) {
  const { data, error } = await supabase.storage.from(BUCKET).download(b.arquivo);
  if (error) return { ok: false, motivo: `Arquivo não encontrado no Storage: ${error.message}` };
  const buf = Buffer.from(await data.arrayBuffer());
  const sha = crypto.createHash('sha256').update(buf).digest('hex');
  if (sha !== b.sha256) return { ok: false, motivo: 'O SHA-256 do arquivo não confere com o registrado — o arquivo foi alterado ou corrompido.' };
  try {
    const conteudo = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
    const linhas = Object.values(conteudo.tabelas || {}).reduce((s, r) => s + r.length, 0);
    if (linhas !== Number(b.linhas)) return { ok: false, motivo: `O arquivo tem ${linhas} linhas e o registro diz ${b.linhas}.` };
    return { ok: true, sha256: sha, tabelas: Object.keys(conteudo.tabelas).length, linhas };
  } catch (err) {
    return { ok: false, motivo: `O arquivo não abre: ${err.message}` };
  }
}

/**
 * BACKUP AUTOMÁTICO DIÁRIO.
 *
 * De hora em hora, cada empresa cujo último backup bom tem mais de 24 h
 * ganha um novo. O lock do Postgres impede que duas instâncias (deploy
 * do Discloud) gerem o mesmo backup ao mesmo tempo.
 */
function iniciarAgendamento() {
  if (process.env.BACKUP_AUTOMATICO === 'false' || !process.env.DATABASE_URL) return;
  const rodar = async () => {
    let client;
    try {
      client = await conectar();
      const { rows: [lock] } = await client.query('SELECT pg_try_advisory_lock(918273646) AS ok');
      if (!lock.ok) return;
      const { data: empresas } = await supabase.from('EMPRESAS').select('id');
      for (const e of empresas || []) {
        const { data: ultimo } = await supabase.from('BACKUPS').select('criado_em, status')
          .eq('tenant_id', e.id).in('status', ['ok', 'gerando']).order('criado_em', { ascending: false }).limit(1).maybeSingle();
        const idadeH = ultimo ? (Date.now() - new Date(ultimo.criado_em)) / 3600000 : Infinity;
        // "gerando" há mais de 2 h é um backup que morreu no meio: não bloqueia.
        if (ultimo?.status === 'gerando' && idadeH < 2) continue;
        if (ultimo?.status === 'ok' && idadeH < 24) continue;
        const r = await gerarBackup(e.id, { origem: 'automatico', usuario: 'Sistema' });
        console.log(`[backup] automático ${e.id}: ${r?.status} (${r?.linhas ?? 0} linhas)`);
      }
      await client.query('SELECT pg_advisory_unlock(918273646)');
    } catch (err) {
      console.error('[backup] agendamento:', err.message);
    } finally {
      if (client) await client.end().catch(() => {});
    }
  };
  setTimeout(rodar, 5 * 60 * 1000);        // 5 min depois de subir
  setInterval(rodar, 60 * 60 * 1000).unref();
}

module.exports = { gerarBackup, aplicarRetencao, linkDownload, verificarBackup, iniciarAgendamento, mapearTabelas, conectar, BUCKET };
