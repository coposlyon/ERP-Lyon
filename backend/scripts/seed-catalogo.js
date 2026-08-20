// ============================================================
// Popula o catálogo (migração 076) com um ponto de partida.
//
//   node scripts/seed-catalogo.js
//
// O QUE ESTE SCRIPT É. O primeiro conteúdo do catálogo: as famílias da
// vitrine, as ocasiões de evento e um punhado de artes de casamento
// prontas para o editor. Rodar de novo é seguro — nada é duplicado e
// nada que já existe é sobrescrito.
//
// O QUE ELE NÃO INVENTA. GABARITO. A única medida que eu tenho por
// escrito é a do Long Drink (120 × 45 mm, margem de 2 mm). Chutar a
// medida das canecas e das taças seria pior que deixar em branco: a arte
// sairia da gráfica cortada e ninguém saberia de onde veio o número. As
// outras ficam para o Administrativo cadastrar, e o catálogo avisa
// quando falta em vez de fingir que sabe.
//
// As famílias sem produto (Baldes, Squeezes, Copos Eco...) são criadas
// assim mesmo: elas existem no cadastro esperando o produto chegar, e
// não aparecem na vitrine enquanto estiverem vazias.
// ============================================================
require('dotenv').config();
const { Client } = require('pg');

const slug = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── A vitrine ───────────────────────────────────────────────
// `categorias` casa por trecho do nome técnico. Vazio = família ainda
// sem produto, esperando o cadastro.
const FAMILIAS = [
  { name: 'Acqua Is Life',            icone: 'Droplet',    seq: 10,  categorias: [] },
  { name: 'Baldes',                   icone: 'Container',  seq: 20,  categorias: ['BALDE'] },
  { name: 'Caldereta',                icone: 'Soup',       seq: 30,  categorias: ['CALDERETA'] },
  { name: 'Canecas',                  icone: 'Coffee',     seq: 40,  categorias: ['CANECA'] },
  { name: 'Copos Eco',                icone: 'Leaf',       seq: 50,  categorias: ['ECO'] },
  { name: 'Long Drink',               icone: 'CupSoda',    seq: 60,  categorias: ['LONG DRINK'] },
  { name: 'Porta-Lata / Porta-Garrafa', icone: 'Beer',     seq: 70,  categorias: ['PORTA-LATA', 'PORTA LATA', 'PORTA-GARRAFA'] },
  { name: 'Squeezes',                 icone: 'Milk',       seq: 80,  categorias: ['SQUEEZE'] },
  { name: 'Taças',                    icone: 'Wine',       seq: 90,  categorias: ['TAÇA', 'TACA'] },
  { name: 'Twister',                  icone: 'GlassWater', seq: 100, categorias: ['TWISTER'] },
];

// O nome de vitrine de cada categoria técnica. Sem isto o cliente lê
// "CANECA SLIM TRADICIONAL" gritando na tela.
const NOMES_VITRINE = {
  'CANECA SLIM TRADICIONAL':  'Caneca Slim',
  'CANECA TRADICIONAL':       'Caneca',
  'LONG DRINK TRADICIONAL':   'Long Drink',
  'TAÇA CERVEJA TRADICIONAL': 'Taça Cerveja',
  'TAÇA CHANDON TRADICIONAL': 'Taça Chandon',
  'TAÇA DE VINHO TRADICIONAL': 'Taça de Vinho',
  'TWISTER TRADICIONAL':      'Twister',
};

// ── As ocasiões ─────────────────────────────────────────────
const OCASIOES = [
  { name: 'Casamento',         icone: 'Heart',       seq: 10,  destaque: true },
  { name: 'Formatura',         icone: 'GraduationCap', seq: 20, destaque: true },
  { name: 'Aniversário',       icone: 'Cake',        seq: 30,  destaque: true },
  { name: 'Corporativo',       icone: 'Building2',   seq: 40,  destaque: true },
  { name: 'Shows / Baladas',   icone: 'Music',       seq: 50,  destaque: true },
  { name: 'Dia das Mães',      icone: 'Flower2',     seq: 60 },
  { name: 'Dia dos Pais',      icone: 'Users',       seq: 70 },
  { name: 'Natal',             icone: 'TreePine',    seq: 80 },
  { name: 'Ano Novo',          icone: 'Sparkles',    seq: 90 },
  { name: 'Festa Junina',      icone: 'Flame',       seq: 100 },
  { name: '15 anos',           icone: 'Crown',       seq: 110 },
  { name: 'Batizado',          icone: 'Church',      seq: 120 },
  { name: 'Chá Revelação',     icone: 'Baby',        seq: 130 },
  { name: 'Chá de Bebê',       icone: 'Baby',        seq: 140 },
  { name: 'Igreja',            icone: 'Church',      seq: 150 },
  { name: 'Eventos esportivos', icone: 'Trophy',     seq: 160 },
];

// ── As artes ────────────────────────────────────────────────
//
// Desenhadas num quadrado 0–100 e encaixadas no gabarito de cada
// produto pelo próprio SVG (preserveAspectRatio). Assim a mesma arte
// serve num Long Drink alto e estreito e numa caneca larga sem virar
// dois cadastros.
//
// O que o cliente pode mexer está marcado com data-campo. O resto do
// vetor é intocável — é o que impede a arte de ser desmontada sem
// querer, e é a razão de o editor não ser um CorelDRAW no navegador.

const RAMO = `<path d="M35 88 Q50 80 65 88" fill="none" stroke="currentColor" stroke-width="0.8"/>
<path d="M38 88 Q40 84 44 85 Q41 88 38 88Z"/><path d="M44 89 Q46 84 50 85 Q47 89 44 89Z"/>
<path d="M50 89 Q54 84 56 85 Q53 89 50 89Z"/><path d="M56 88 Q60 84 62 85 Q59 88 56 88Z"/>
<path d="M50 82 q2.4-2.6 4 0 q-1.6 3-4 4.4 q-2.4-1.4-4-4.4 q1.6-2.6 4 0Z"/>`;

const FILETE = `<path d="M28 %Y% h14 M58 %Y% h14" stroke="currentColor" stroke-width="0.7" fill="none"/>
<path d="M50 %Y% m-6 0 q6-3.4 6 0 q0 3.4-6 0Z M50 %Y% m6 0 q-6-3.4-6 0 q0 3.4 6 0Z"/>
<circle cx="50" cy="%Y%" r="1.1"/>`;

const CORACAO = y => `<path d="M50 ${y} q2.4-2.8 4 0 q-1.6 3.2-4 4.6 q-2.4-1.4-4-4.6 q1.6-2.8 4 0Z"/>`;

const filete = y => FILETE.replace(/%Y%/g, y);

const texto = (campo, y, tamanho, extra = '') =>
  `<text data-campo="${campo}" x="50" y="${y}" text-anchor="middle" font-size="${tamanho}" ${extra}>%${campo.toUpperCase()}%</text>`;

/** O molde de todas as artes: mesmo enquadramento, mesma tipografia. */
const arte = miolo => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" fill="currentColor" font-family="Georgia, 'Times New Roman', serif">${miolo}</svg>`;

const CAMPOS_CASAL = [
  { key: 'nome1', label: 'Alterar nome 1', tipo: 'texto', padrao: 'Bruna', max: 18 },
  { key: 'nome2', label: 'Alterar nome 2', tipo: 'texto', padrao: 'Lucas', max: 18 },
  { key: 'data',  label: 'Alterar data',   tipo: 'data',  padrao: '15/08/2025' },
  { key: 'frase', label: 'Adicionar frase (opcional)', tipo: 'texto', padrao: '', max: 30 },
];

const FONTES = ['Georgia', 'Playfair Display', 'Cormorant', 'Montserrat', 'Great Vibes'];

const ARTES = [
  {
    codigo: 'CAS-001', name: 'Monograma com filetes', ocasiao: 'Casamento', seq: 10,
    campos: CAMPOS_CASAL,
    svg: arte(`${filete(20)}
      ${texto('nome1', 44, 13)}
      <text x="50" y="55" text-anchor="middle" font-size="8" font-style="italic">&amp;</text>
      ${texto('nome2', 68, 13)}
      ${filete(78)}
      ${texto('data', 92, 6)}`),
  },
  {
    codigo: 'CAS-002', name: 'Iniciais na coroa de louros', ocasiao: 'Casamento', seq: 20,
    campos: CAMPOS_CASAL,
    svg: arte(`<circle cx="50" cy="46" r="30" fill="none" stroke="currentColor" stroke-width="0.8"/>
      <circle cx="50" cy="46" r="27" fill="none" stroke="currentColor" stroke-width="0.4" stroke-dasharray="1.6 2.4"/>
      <text data-campo="nome1" data-iniciais="1" x="50" y="52" text-anchor="middle" font-size="22">%NOME1%</text>
      ${texto('data', 88, 6)}`),
  },
  {
    codigo: 'CAS-003', name: 'Nomes empilhados com ramo', ocasiao: 'Casamento', seq: 30,
    campos: CAMPOS_CASAL,
    svg: arte(`${CORACAO(14)}
      ${texto('nome1', 36, 12)}
      <text x="50" y="47" text-anchor="middle" font-size="7" font-style="italic">e</text>
      ${texto('nome2', 60, 12)}
      ${texto('data', 72, 6)}
      ${RAMO}`),
  },
  {
    codigo: 'CAS-004', name: 'Iniciais em moldura floral', ocasiao: 'Casamento', seq: 40,
    campos: CAMPOS_CASAL,
    svg: arte(`<circle cx="50" cy="44" r="29" fill="none" stroke="currentColor" stroke-width="0.7"/>
      <g>${[0, 45, 90, 135, 180, 225, 270, 315].map(a =>
        `<path transform="rotate(${a} 50 44) translate(0 -29)" d="M50 44 q2.6-3 4.4 0 q-1.8 3.4-4.4 5 q-2.6-1.6-4.4-5 q1.8-3 4.4 0Z"/>`).join('')}</g>
      <text data-campo="nome1" data-iniciais="1" x="50" y="50" text-anchor="middle" font-size="20">%NOME1%</text>
      ${texto('data', 88, 6)}`),
  },
  {
    codigo: 'CAS-005', name: 'Nomes com filete duplo', ocasiao: 'Casamento', seq: 50,
    campos: CAMPOS_CASAL,
    svg: arte(`<path d="M22 24 h56 M22 26.5 h56" stroke="currentColor" stroke-width="0.5" fill="none"/>
      ${texto('nome1', 46, 12)}
      <text x="50" y="57" text-anchor="middle" font-size="8" font-style="italic">&amp;</text>
      ${texto('nome2', 70, 12)}
      <path d="M22 78 h56 M22 80.5 h56" stroke="currentColor" stroke-width="0.5" fill="none"/>
      ${texto('data', 92, 6)}`),
  },
  {
    codigo: 'CAS-006', name: 'Iniciais no hexágono', ocasiao: 'Casamento', seq: 60,
    campos: CAMPOS_CASAL,
    svg: arte(`<path d="M50 16 L76 31 L76 61 L50 76 L24 61 L24 31 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
      <text data-campo="nome1" data-iniciais="1" x="50" y="52" text-anchor="middle" font-size="20">%NOME1%</text>
      ${texto('data', 88, 6)}`),
  },

  {
    codigo: 'FOR-001', name: 'Formatura — nome e curso', ocasiao: 'Formatura', seq: 10,
    campos: [
      { key: 'nome1', label: 'Nome do formando', tipo: 'texto', padrao: 'Maria Silva', max: 24 },
      { key: 'nome2', label: 'Curso', tipo: 'texto', padrao: 'Direito', max: 24 },
      { key: 'data',  label: 'Ano / data', tipo: 'texto', padrao: '2026' },
      { key: 'frase', label: 'Adicionar frase (opcional)', tipo: 'texto', padrao: '', max: 30 },
    ],
    svg: arte(`<path d="M50 14 L74 24 L50 34 L26 24 Z" fill="none" stroke="currentColor" stroke-width="0.9"/>
      <path d="M68 28 v10" stroke="currentColor" stroke-width="0.7" fill="none"/><circle cx="68" cy="39" r="1.6"/>
      ${texto('nome1', 56, 10)}
      ${texto('nome2', 68, 7, 'font-style="italic"')}
      ${filete(78)}
      ${texto('data', 90, 7)}`),
  },
  {
    codigo: 'ANI-001', name: 'Aniversário — nome e idade', ocasiao: 'Aniversário', seq: 10,
    campos: [
      { key: 'nome1', label: 'Nome', tipo: 'texto', padrao: 'João', max: 20 },
      { key: 'nome2', label: 'Idade', tipo: 'texto', padrao: '30 anos', max: 14 },
      { key: 'data',  label: 'Data', tipo: 'data', padrao: '15/08/2025' },
      { key: 'frase', label: 'Adicionar frase (opcional)', tipo: 'texto', padrao: '', max: 30 },
    ],
    svg: arte(`${texto('nome1', 40, 14)}
      ${filete(50)}
      ${texto('nome2', 66, 10, 'font-style="italic"')}
      ${texto('data', 86, 6)}`),
  },
  {
    codigo: 'COR-001', name: 'Corporativo — marca e frase', ocasiao: 'Corporativo', seq: 10,
    campos: [
      { key: 'nome1', label: 'Nome da empresa', tipo: 'texto', padrao: 'Sua Empresa', max: 24 },
      { key: 'frase', label: 'Frase / slogan', tipo: 'texto', padrao: '', max: 34 },
      { key: 'data',  label: 'Ano / evento', tipo: 'texto', padrao: '2026' },
    ],
    svg: arte(`<rect x="18" y="30" width="64" height="40" fill="none" stroke="currentColor" stroke-width="0.9"/>
      ${texto('nome1', 48, 10)}
      ${texto('frase', 60, 5.5, 'font-style="italic"')}
      ${texto('data', 84, 6)}`),
  },
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

  const { rows: cats } = await c.query(
    'SELECT id, name FROM "CATEGORIAS" WHERE tenant_id = $1', [tenant]);

  await c.query('BEGIN');

  // ── Nome de vitrine das categorias ────────────────────────
  let renomeadas = 0;
  for (const cat of cats) {
    const vitrine = NOMES_VITRINE[cat.name];
    if (!vitrine) continue;
    const { rowCount } = await c.query(
      'UPDATE "CATEGORIAS" SET nome_catalogo = $1 WHERE id = $2 AND nome_catalogo IS NULL',
      [vitrine, cat.id]);
    renomeadas += rowCount;
  }
  console.log(`nome de vitrine .... ${renomeadas} categoria(s)`);

  // ── Famílias ──────────────────────────────────────────────
  let comProduto = 0;
  for (const f of FAMILIAS) {
    const { rows } = await c.query(
      `INSERT INTO "CATALOGO_FAMILIAS" (tenant_id, name, slug, icone, seq)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenant, f.name, slug(f.name), f.icone, f.seq]);
    const familiaId = rows[0].id;

    const minhas = cats.filter(cat =>
      f.categorias.some(t => cat.name.toUpperCase().includes(t.toUpperCase())));
    if (minhas.length) comProduto++;

    for (const cat of minhas) {
      await c.query(
        `INSERT INTO "CATALOGO_FAMILIA_ITENS" (tenant_id, familia_id, category_id)
         SELECT $1,$2,$3
         WHERE NOT EXISTS (
           SELECT 1 FROM "CATALOGO_FAMILIA_ITENS"
            WHERE tenant_id=$1 AND familia_id=$2 AND category_id=$3)`,
        [tenant, familiaId, cat.id]);
    }
  }
  console.log(`famílias ........... ${FAMILIAS.length} (${comProduto} com produto hoje)`);

  // ── Gabarito: só o que está escrito na especificação ──────
  const longDrink = cats.find(cat => cat.name.toUpperCase().includes('LONG DRINK'));
  if (longDrink) {
    await c.query(
      `INSERT INTO "CATALOGO_GABARITOS" (tenant_id, category_id, altura_mm, largura_mm, margem_mm, permite_verso)
       SELECT $1,$2,120,45,2,TRUE
       WHERE NOT EXISTS (
         SELECT 1 FROM "CATALOGO_GABARITOS" WHERE tenant_id=$1 AND category_id=$2)`,
      [tenant, longDrink.id]);
  }
  const semGabarito = cats.filter(cat => !cat.name.toUpperCase().includes('LONG DRINK'));
  console.log(`gabaritos .......... 1 (Long Drink 120 × 45 mm)`);

  // ── Caixa do liso: a regra que já está em uso ─────────────
  for (const cat of cats) {
    await c.query(
      `INSERT INTO "CATALOGO_EMBALAGEM" (tenant_id, category_id, caixa_qtd, max_cores_caixa, min_caixas)
       SELECT $1,$2,100,4,1
       WHERE NOT EXISTS (
         SELECT 1 FROM "CATALOGO_EMBALAGEM" WHERE tenant_id=$1 AND category_id=$2)`,
      [tenant, cat.id]);
  }
  console.log(`caixa do liso ...... ${cats.length} categoria(s) — 100 un, até 4 cores`);

  // ── Ocasiões ──────────────────────────────────────────────
  const idOcasiao = {};
  for (const o of OCASIOES) {
    const { rows } = await c.query(
      `INSERT INTO "CATALOGO_OCASIOES" (tenant_id, name, slug, icone, seq, destaque)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (tenant_id, slug) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`,
      [tenant, o.name, slug(o.name), o.icone, o.seq, !!o.destaque]);
    idOcasiao[o.name] = rows[0].id;
  }
  console.log(`ocasiões ........... ${OCASIOES.length}`);

  // ── Artes ─────────────────────────────────────────────────
  for (const a of ARTES) {
    await c.query(
      `INSERT INTO "CATALOGO_ARTES"
         (tenant_id, codigo, name, ocasiao_id, svg, elementos, fontes, seq)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)
       ON CONFLICT (tenant_id, codigo) DO NOTHING`,
      [tenant, a.codigo, a.name, idOcasiao[a.ocasiao] || null, a.svg,
       JSON.stringify(a.campos), JSON.stringify(FONTES), a.seq]);
  }
  console.log(`artes .............. ${ARTES.length}`);

  await c.query('COMMIT');

  console.log('\nFALTA CADASTRAR (o catálogo avisa em vez de chutar):');
  console.log('  gabarito da arte —', semGabarito.map(x => x.name).join(', '));
  console.log('\nA medida do Long Drink veio da especificação. As outras só a');
  console.log('produção sabe: arte fora do gabarito volta cortada da gráfica.');
  await c.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
