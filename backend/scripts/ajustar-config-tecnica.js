// ============================================================
// Acerta a configuração técnica ao que a tela aprovada mostra.
//
//   node scripts/ajustar-config-tecnica.js
//
// O seed original (seed-config-tecnica.js) foi um ponto de partida antes
// da tela existir. A tela aprovada mostra coisas diferentes, e é a tela
// que manda:
//
//   • Degradê pede "Cor base" e "Cor boca", não "De" e "Para".
//   • A boca do degradê tem as opções cadastradas — Transparente e
//     Efeito Gelo aparecem no exemplo aprovado e não existiam na lista.
//   • Preto Fosco abre "Cor do produto" e "Cor interna", e existe também
//     em versão com borda. Faltavam os dois.
//   • Serigrafia 1 cor é tinta PS: a química casa com o material do
//     copo, e não é o cliente que escolhe.
//
// Rodar de novo é seguro: tudo é UPDATE sobre chave existente ou INSERT
// com "se não existir".
// ============================================================
require('dotenv').config();
const { Client } = require('pg');

// Rótulos que a tela aprovada usa.
const ROTULOS = {
  'Degradê': [
    { key: 'cor_base', label: 'Cor base', grupo: 'pintura', obrigatorio: true },
    { key: 'cor_topo', label: 'Cor boca', grupo: 'pintura', obrigatorio: true },
  ],
  'Degradê + Borda': [
    { key: 'cor_base',  label: 'Cor base',      grupo: 'pintura', obrigatorio: true },
    { key: 'cor_topo',  label: 'Cor boca',      grupo: 'pintura', obrigatorio: true },
    { key: 'cor_borda', label: 'Cor da borda',  grupo: 'borda',   obrigatorio: true },
  ],
  'Preto Fosco': [
    { key: 'cor_produto', label: 'Cor do produto', grupo: 'produto', obrigatorio: true },
    { key: 'cor_interna', label: 'Cor interna',    grupo: 'pintura', obrigatorio: false },
  ],
};

// Acabamento que faltava: a especificação lista "Preto Fosco com Borda".
const NOVOS = [
  {
    name: 'Preto Fosco + Borda', seq: 140, pintura: true, borda: true,
    campos: [
      { key: 'cor_produto', label: 'Cor do produto', grupo: 'produto', obrigatorio: true },
      { key: 'cor_interna', label: 'Cor interna',    grupo: 'pintura', obrigatorio: false },
      { key: 'cor_borda',   label: 'Cor da borda',   grupo: 'borda',   obrigatorio: true },
    ],
  },
];

// A boca do degradê, conforme o exemplo aprovado.
const CORES_NOVAS = [
  { grupo: 'pintura', name: 'Gelo',        seq: 105 },
  { grupo: 'pintura', name: 'Transparente', seq: 110 },
];

// Cada processo é uma linha de tinta. O cliente escolhe a COR; a química
// vem da ficha técnica do produto.
const TINTAS = {
  'Serigrafia — 1 cor':   'PS',
  'Serigrafia — 2 cores': 'PS',
  'Serigrafia — 3 cores': 'PS',
};

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

  let rotulados = 0;
  for (const [nome, campos] of Object.entries(ROTULOS)) {
    const { rowCount } = await c.query(
      'UPDATE "CONFIG_ACABAMENTOS" SET campos = $1::jsonb WHERE tenant_id = $2 AND name = $3',
      [JSON.stringify(campos), tenant, nome]);
    rotulados += rowCount;
  }
  console.log(`campos acertados ... ${rotulados} acabamento(s)`);

  for (const a of NOVOS) {
    await c.query(
      `INSERT INTO "CONFIG_ACABAMENTOS"
         (tenant_id, name, seq, requer_pintura, requer_borda, requer_jateamento, campos)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (tenant_id, name) DO NOTHING`,
      [tenant, a.name, a.seq, !!a.pintura, !!a.borda, !!a.jateamento, JSON.stringify(a.campos)]);
  }
  console.log(`acabamentos novos .. ${NOVOS.length}`);

  for (const cor of CORES_NOVAS) {
    await c.query(
      `INSERT INTO "CONFIG_CORES" (tenant_id, name, grupo, seq)
       VALUES ($1,$2,$3,$4) ON CONFLICT (tenant_id, grupo, name) DO NOTHING`,
      [tenant, cor.name, cor.grupo, cor.seq]);
  }
  console.log(`cores novas ........ ${CORES_NOVAS.length}`);

  for (const [nome, linha] of Object.entries(TINTAS)) {
    await c.query(
      'UPDATE "CONFIG_PROCESSOS" SET linha_tinta = $1 WHERE tenant_id = $2 AND name = $3 AND linha_tinta IS NULL',
      [linha, tenant, nome]);
  }

  // O que é novo precisa entrar na matriz, senão fica cadastrado e
  // invisível — que é o pior dos dois mundos.
  const { rows: cats }  = await c.query('SELECT id FROM "CATEGORIAS" WHERE tenant_id = $1', [tenant]);
  const { rows: novos } = await c.query(
    `SELECT id, 'acabamento' AS tipo FROM "CONFIG_ACABAMENTOS" WHERE tenant_id = $1 AND name = ANY($2)
     UNION ALL
     SELECT id, 'cor' FROM "CONFIG_CORES" WHERE tenant_id = $1 AND grupo = 'pintura' AND name = ANY($3)`,
    [tenant, NOVOS.map(a => a.name), CORES_NOVAS.map(x => x.name)]);

  let ligacoes = 0;
  for (const cat of cats) {
    for (const item of novos) {
      const { rowCount } = await c.query(
        `INSERT INTO "PRODUTO_COMPATIBILIDADE" (tenant_id, category_id, tipo, ref_id)
         SELECT $1,$2,$3,$4
         WHERE NOT EXISTS (
           SELECT 1 FROM "PRODUTO_COMPATIBILIDADE"
            WHERE tenant_id=$1 AND category_id=$2 AND tipo=$3 AND ref_id=$4)`,
        [tenant, cat.id, item.tipo, item.id]);
      ligacoes += rowCount;
    }
  }

  await c.query('COMMIT');
  console.log(`compatibilidades ... ${ligacoes} linha(s)`);
  console.log('\nO Administrativo fecha o que a fábrica não produzir — uma linha');
  console.log('com permitido = false, sem mexer em tela nenhuma.');
  await c.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
