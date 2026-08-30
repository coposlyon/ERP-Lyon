// ============================================================
// OS ÚLTIMOS MUNICÍPIOS — os quatro que o seed-cep-faixa não fecha.
//
// Depois de o script principal cobrir 5.567 dos 5.571 municípios,
// sobraram quatro, e por dois motivos diferentes. Um script separado
// porque cada motivo pede uma estratégia que não faz sentido no caminho
// geral — enfiá-las lá dentro encheria o script principal de exceção
// para resolver quatro casos.
//
// ── 1. BLOCO COM DONO ALHEIO NO MEIO (AM) ───────────────────
//
// Presidente Figueiredo tem ruas de 69720 a 69736, mas 69730 é de Novo
// Airão. No Amazonas os blocos se entrelaçam, e o script principal
// recusa — com razão: gravar 69720..69736 diria que um CEP de Novo
// Airão é de Presidente Figueiredo.
//
// A saída honesta é a MAIOR SEQUÊNCIA CONTÍGUA de prefixos confirmados
// pelo IBGE. É mais estreita que a faixa real, e é verdadeira: todo
// prefixo dentro dela foi confirmado como daquele município, e nenhum
// estranho mora ali.
//
// ── 2. A VIACEP NÃO CONHECE NENHUMA RUA (RN, RR) ────────────
//
// Olho d'Água do Borges e São Luiz do Anauá não respondem a busca por
// logradouro em grafia nenhuma — nem com apelido, nem com acento, nem
// sem. Mas a consulta por CEP funciona: um município pequeno costuma
// ter o seu `prefixo-000`, e ele responde com o nome e o código do
// IBGE da localidade.
//
// Então se varre a faixa do estado perguntando `XXXXX-000` e se para no
// primeiro que devolver o IBGE certo. É força bruta, mas é dirigida
// (uma requisição por prefixo, só o sufixo 000) e o resultado é o
// cadastro dos Correios respondendo, não um palpite.
//
// Rodar:  node scripts/seed-cep-restantes.js [--dry]
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');

const DRY = process.argv.includes('--dry');
const PAUSA_MS = 120;

const TERMOS = [
  'Rua', 'Avenida', 'Travessa', 'Praca', 'Estrada', 'Servidao', 'Alameda',
  'Rodovia', 'Joao', 'Jose', 'Santa', 'Sao', 'Silva', 'Nova', 'Central',
];

// Quem entra aqui, e como. Nada de varrer o país inteiro por engano.
const CASOS = [
  { ibge: '1303536', uf: 'AM', nome: 'Presidente Figueiredo', modo: 'maior-trecho' },
  { ibge: '1300680', uf: 'AM', nome: 'Boa Vista do Ramos',    modo: 'maior-trecho' },
  // A janela é a faixa de CEP do estado. RR inteiro cabe em 693xx; o RN
  // vai de 59000 a 59990, e por isso a varredura dele é a mais cara.
  { ibge: '1400605', uf: 'RR', nome: 'Sao Luiz do Anaua',      modo: 'varrer', de: 69300, ate: 69399 },
  { ibge: '2408409', uf: 'RN', nome: "Olho d'Agua do Borges",  modo: 'varrer', de: 59500, ate: 59999 },
];

const dorme = ms => new Promise(r => setTimeout(r, ms));
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

async function viacep(url, tentativas = 3) {
  for (let i = 1; i <= tentativas; i++) {
    await dorme(PAUSA_MS * i);
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.status === 429 || r.status >= 500) continue;
      if (!r.ok) return null;
      return await r.json();
    } catch { /* repete */ }
  }
  return null;
}

/** A maior sequência de prefixos seguidos, sem buraco. */
function maiorTrecho(prefixos) {
  let melhor = [prefixos[0], prefixos[0]], atual = [prefixos[0], prefixos[0]];
  for (let i = 1; i < prefixos.length; i++) {
    if (prefixos[i] === prefixos[i - 1] + 1) atual[1] = prefixos[i];
    else atual = [prefixos[i], prefixos[i]];
    if (atual[1] - atual[0] > melhor[1] - melhor[0]) melhor = [...atual];
  }
  return melhor;
}

async function porRuas(uf, nome, ibge) {
  const ceps = new Set();
  for (const termo of TERMOS) {
    const j = await viacep(`https://viacep.com.br/ws/${uf}/${encodeURIComponent(semAcento(nome))}/${encodeURIComponent(termo)}/json/`);
    if (!Array.isArray(j)) continue;
    for (const x of j) {
      if (x.cep && String(x.ibge) === String(ibge)) ceps.add(String(x.cep).replace('-', ''));
    }
  }
  return [...new Set([...ceps].map(c => c.slice(0, 5)))].map(Number).sort((a, b) => a - b);
}

async function varrer(de, ate, ibge) {
  const achados = [];
  for (let p = de; p <= ate; p++) {
    const j = await viacep(`https://viacep.com.br/ws/${String(p).padStart(5, '0')}000/json/`);
    if (j && !j.erro && String(j.ibge) === String(ibge)) {
      achados.push(p);
      console.log(`     achou ${p}-000 = ${j.localidade}`);
    }
  }
  return achados;
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  let gravados = 0;

  for (const c of CASOS) {
    const { rows } = await pool.query('SELECT name, cep_start FROM "MUNICIPIOS" WHERE ibge_code = $1', [c.ibge]);
    if (!rows.length) { console.log(`${c.uf} ${c.nome}: nao esta na base`); continue; }
    if (rows[0].cep_start) { console.log(`${c.uf} ${rows[0].name}: ja tem CEP (${rows[0].cep_start}) — pulando`); continue; }

    console.log(`\n${c.uf} ${rows[0].name} [${c.modo}]`);
    let min, max;

    if (c.modo === 'maior-trecho') {
      const prefixos = await porRuas(c.uf, c.nome, c.ibge);
      if (!prefixos.length) { console.log('     nenhuma rua confirmada — nada a gravar'); continue; }
      [min, max] = maiorTrecho(prefixos);
      console.log(`     prefixos vistos: ${prefixos.join(' ')}`);
      console.log(`     maior trecho contiguo: ${min}..${max}`);
    } else {
      console.log(`     varrendo ${c.de}..${c.ate} (${c.ate - c.de + 1} prefixos)…`);
      const achados = await varrer(c.de, c.ate, c.ibge);
      if (!achados.length) { console.log('     a varredura nao achou nada — fica em branco'); continue; }
      [min, max] = maiorTrecho(achados);
    }

    const cep5 = n => String(n).padStart(5, '0');
    const cepStart = `${cep5(min)}-000`;
    const cepEnd = `${cep5(max)}-999`;
    console.log(`     -> ${cepStart} a ${cepEnd}`);

    if (!DRY) {
      await pool.query('UPDATE "MUNICIPIOS" SET cep_start=$1, cep_end=$2, synced_at=NOW() WHERE ibge_code=$3',
        [cepStart, cepEnd, c.ibge]);
    }
    gravados++;
  }

  const { rows: f } = await pool.query('SELECT count(*)::int n FROM "MUNICIPIOS" WHERE cep_start IS NULL');
  console.log(`\n${gravados} gravados. Municipios sem CEP no Brasil: ${f[0].n}`);
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
