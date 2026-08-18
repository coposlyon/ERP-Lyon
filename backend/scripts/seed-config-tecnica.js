// ============================================================
// Popula a configuração técnica (migração 074) com um ponto de partida.
//
//   node scripts/seed-config-tecnica.js
//
// O QUE ESTE SCRIPT É E O QUE NÃO É. Ele monta o catálogo inicial de
// acabamentos, cores e processos, e libera tudo para as 7 categorias que
// já existem. É um ponto de partida para o Administrativo AJUSTAR — não
// é a verdade técnica da fábrica, que só quem produz conhece.
//
// As cores de produto NÃO foram inventadas: saem do próprio cadastro,
// lidas dos nomes dos 97 produtos. As de pintura, borda e personalização
// vêm dos exemplos da especificação e precisam ser conferidas.
//
// Rodar de novo é seguro: nada é duplicado (chaves únicas) e nada que
// já exista é sobrescrito.
// ============================================================
require('dotenv').config();
const { Client } = require('pg');

// Os campos que cada acabamento ABRE na tela. A tela não sabe o que é
// degradê — ela recebe esta lista e desenha os selects.
const ACABAMENTOS = [
  { name: 'Liso',              seq: 10, campos: [] },
  { name: 'Tradicional',       seq: 20,
    campos: [{ key: 'cor_produto', label: 'Cor do produto', grupo: 'produto', obrigatorio: true }] },
  { name: 'Degradê',           seq: 30, pintura: true,
    campos: [{ key: 'cor_base', label: 'De',   grupo: 'pintura', obrigatorio: true },
             { key: 'cor_topo', label: 'Para', grupo: 'pintura', obrigatorio: true }] },
  { name: 'Bicolor',           seq: 40, pintura: true,
    campos: [{ key: 'cor_base', label: 'Cor da base', grupo: 'pintura', obrigatorio: true },
             { key: 'cor_topo', label: 'Cor da boca', grupo: 'pintura', obrigatorio: true }] },
  { name: 'Tricolor',          seq: 50, pintura: true,
    campos: [{ key: 'cor_base',  label: 'Cor da base',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_meio',  label: 'Cor do meio',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_topo',  label: 'Cor da boca',  grupo: 'pintura', obrigatorio: true }] },
  { name: 'Jateado',           seq: 60, jateamento: true,
    campos: [{ key: 'cor_jateado', label: 'Cor do jateado', grupo: 'jateado', obrigatorio: true }] },
  { name: 'Preto Fosco',       seq: 70, pintura: true, campos: [] },
  { name: 'Efeito Gelo',       seq: 80, jateamento: true, campos: [] },
  { name: 'Borda Metalizada',  seq: 90, borda: true,
    campos: [{ key: 'cor_borda', label: 'Cor da borda', grupo: 'borda', obrigatorio: true }] },

  // As combinações são LINHAS, não código: "Degradê + Borda" é a soma
  // dos campos dos dois. Combinação nova entra aqui, sem deploy.
  { name: 'Degradê + Borda',   seq: 100, pintura: true, borda: true,
    campos: [{ key: 'cor_base',  label: 'De',            grupo: 'pintura', obrigatorio: true },
             { key: 'cor_topo',  label: 'Para',          grupo: 'pintura', obrigatorio: true },
             { key: 'cor_borda', label: 'Cor da borda',  grupo: 'borda',   obrigatorio: true }] },
  { name: 'Jateado + Borda',   seq: 110, jateamento: true, borda: true,
    campos: [{ key: 'cor_jateado', label: 'Cor do jateado', grupo: 'jateado', obrigatorio: true },
             { key: 'cor_borda',   label: 'Cor da borda',   grupo: 'borda',   obrigatorio: true }] },
  { name: 'Bicolor + Borda',   seq: 120, pintura: true, borda: true,
    campos: [{ key: 'cor_base',  label: 'Cor da base',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_topo',  label: 'Cor da boca',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_borda', label: 'Cor da borda', grupo: 'borda',   obrigatorio: true }] },
  { name: 'Tricolor + Borda',  seq: 130, pintura: true, borda: true,
    campos: [{ key: 'cor_base',  label: 'Cor da base',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_meio',  label: 'Cor do meio',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_topo',  label: 'Cor da boca',  grupo: 'pintura', obrigatorio: true },
             { key: 'cor_borda', label: 'Cor da borda', grupo: 'borda',   obrigatorio: true }] },
];

// Pintura, borda e personalização: dos exemplos da especificação. O
// Administrativo confere e completa — não sei quais tintas a fábrica tem.
const CORES_PINTURA = ['Azul Royal', 'Azul Bebê', 'Rosa', 'Roxo', 'Verde', 'Amarelo', 'Laranja', 'Vermelho', 'Preto', 'Branco'];
const CORES_BORDA   = ['Dourada', 'Prata', 'Rosé', 'Preta'];
const CORES_JATEADO = ['Fosco natural', 'Branco'];
const CORES_PERSO   = ['Branca', 'Preta', 'Dourada', 'Prata', 'Colorida'];

const PROCESSOS = [
  { name: 'Serigrafia — 1 cor',  max_cores: 1, seq: 10 },
  { name: 'Serigrafia — 2 cores', max_cores: 2, seq: 20 },
  { name: 'Serigrafia — 3 cores', max_cores: 3, seq: 30 },
  { name: 'Transfer — colorido',  max_cores: null, seq: 40 },
  { name: 'Laser',                max_cores: 1, seq: 50 },
];

(async () => {
  const c = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 20000,
  });
  await c.connect();

  const { rows: emp } = await c.query('SELECT id, name FROM "EMPRESAS" ORDER BY created_at LIMIT 1');
  if (!emp.length) throw new Error('Nenhuma empresa cadastrada.');
  const tenant = emp[0].id;
  console.log(`Empresa: ${emp[0].name}\n`);

  await c.query('BEGIN');

  // ── Acabamentos ───────────────────────────────────────────
  for (const a of ACABAMENTOS) {
    await c.query(
      `INSERT INTO "CONFIG_ACABAMENTOS"
         (tenant_id, name, seq, requer_pintura, requer_borda, requer_jateamento, campos)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenant, a.name, a.seq, !!a.pintura, !!a.borda, !!a.jateamento, JSON.stringify(a.campos)],
    );
  }
  console.log(`acabamentos .... ${ACABAMENTOS.length}`);

  // ── Cores de produto: lidas do próprio cadastro ───────────
  const { rows: doCadastro } = await c.query(
    `SELECT DISTINCT trim(split_part(name,' - ',2)) AS cor
       FROM "PRODUTOS" WHERE tenant_id = $1 AND name LIKE '% - % - %'
       ORDER BY 1`, [tenant]);

  const grupos = [
    ['produto',        doCadastro.map(r => r.cor).filter(Boolean)],
    ['pintura',        CORES_PINTURA],
    ['borda',          CORES_BORDA],
    ['jateado',        CORES_JATEADO],
    ['personalizacao', CORES_PERSO],
  ];
  for (const [grupo, lista] of grupos) {
    for (let i = 0; i < lista.length; i++) {
      await c.query(
        `INSERT INTO "CONFIG_CORES" (tenant_id, name, grupo, seq)
         VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, grupo, name) DO NOTHING`,
        [tenant, lista[i], grupo, (i + 1) * 10]);
    }
    console.log(`cores ${grupo.padEnd(15)} ${lista.length}`);
  }

  // ── Processos ─────────────────────────────────────────────
  for (const p of PROCESSOS) {
    await c.query(
      `INSERT INTO "CONFIG_PROCESSOS" (tenant_id, name, max_cores, seq)
       VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenant, p.name, p.max_cores, p.seq]);
  }
  console.log(`processos ...... ${PROCESSOS.length}`);

  // ── Compatibilidade: tudo liberado por CATEGORIA ──────────
  //
  // Abrir tudo é o ponto de partida honesto: o sistema não sabe o que a
  // fábrica não consegue fazer, e chutar restrição travaria venda de
  // verdade. O Administrativo FECHA o que não puder — e fechar é uma
  // linha com permitido = false, sem mexer no resto.
  const { rows: cats }  = await c.query('SELECT id FROM "CATEGORIAS" WHERE tenant_id = $1', [tenant]);
  const { rows: acabs } = await c.query('SELECT id FROM "CONFIG_ACABAMENTOS" WHERE tenant_id = $1', [tenant]);
  const { rows: cores } = await c.query('SELECT id FROM "CONFIG_CORES" WHERE tenant_id = $1', [tenant]);
  const { rows: procs } = await c.query('SELECT id FROM "CONFIG_PROCESSOS" WHERE tenant_id = $1', [tenant]);

  let ligacoes = 0;
  for (const cat of cats) {
    for (const [tipo, lista] of [['acabamento', acabs], ['cor', cores], ['processo', procs]]) {
      for (const item of lista) {
        const { rowCount } = await c.query(
          `INSERT INTO "PRODUTO_COMPATIBILIDADE" (tenant_id, category_id, tipo, ref_id)
           SELECT $1,$2,$3,$4
           WHERE NOT EXISTS (
             SELECT 1 FROM "PRODUTO_COMPATIBILIDADE"
              WHERE tenant_id=$1 AND category_id=$2 AND tipo=$3 AND ref_id=$4)`,
          [tenant, cat.id, tipo, item.id]);
        ligacoes += rowCount;
      }
    }
  }
  await c.query('COMMIT');
  console.log(`\ncompatibilidades gravadas: ${ligacoes} (${cats.length} categorias)`);
  console.log('\nTudo liberado por categoria. O Administrativo fecha o que a');
  console.log('fábrica não produz — chutar restrição aqui travaria venda real.');
  await c.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
