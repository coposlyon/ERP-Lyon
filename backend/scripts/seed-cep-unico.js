// ============================================================
// O CEP ÚNICO DE CADA MUNICÍPIO.
//
// A coluna CEP da tela de cidades nasceu vazia por um motivo real: a
// FAIXA de CEP por município (de 80000-000 a 82999-999, por exemplo) só
// existe no DNE dos Correios, que é pago. Sem ela, chutar um número
// viraria etiqueta errada — e etiqueta errada volta como frete perdido.
//
// Só que metade do Brasil não tem faixa: tem CEP ÚNICO. Cidade pequena
// inteira usa um número só, e esse número É público. A ViaCEP responde
// com ele, e o jeito de perguntar é este:
//
//   GET /ws/{UF}/{cidade}/{termo}/json/
//
// Buscando um TERMO QUE NÃO EXISTE em rua nenhuma:
//   • cidade de CEP único  → devolve um registro só, com logradouro,
//                            bairro e unidade vazios: é o CEP da cidade.
//   • cidade com faixa     → devolve [] (nenhuma rua casa com o termo).
//
// O termo bobo é o que separa os dois casos numa requisição só. Buscar
// "Centro" ou "Rua" não serve: em cidade grande casa com rua de verdade,
// e em cidade pequena às vezes devolve o CEP da agência dos Correios em
// vez do CEP da cidade.
//
// O QUE ESTE SCRIPT NÃO FAZ: inventar faixa para Curitiba. Cidade com
// CEP por rua continua em branco, e é assim que tem que ser até o DNE
// entrar. Melhor a coluna vazia do que um número plausível e errado.
//
// Rodar:  node scripts/seed-cep-unico.js [UF]
// Sem UF, varre o Brasil inteiro. Quem já tem CEP gravado é pulado, então
// pode rodar de novo a qualquer momento sem repetir trabalho.
// ============================================================
require('dotenv').config();
// Pool, e nao Client: as cinco trilhas gravam em paralelo, e um
// cliente so enfileira as escritas (e reclama disso no console).
const { Pool } = require('pg');

const UF_ARG = (process.argv[2] || '').toUpperCase() || null;
const TERMO = 'Zzqxk';        // não existe em rua nenhuma do país
const SIMULTANEAS = 5;        // gentileza com uma API pública e gratuita
const TENTATIVAS = 3;

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const espera = ms => new Promise(r => setTimeout(r, ms));

/**
 * O CEP único da cidade, ou null quando ela tem faixa.
 *
 * A conferência do código do IBGE não é paranoia: nome de cidade se
 * repete entre estados e a ViaCEP casa por texto. Sem ela, um empate de
 * nome gravaria o CEP da cidade errada.
 */
async function cepUnico(uf, nome, ibge) {
  const url = `https://viacep.com.br/ws/${uf}/${encodeURIComponent(semAcento(nome))}/${TERMO}/json/`;

  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'ERP-LyonCopos/1.0' } });
      if (r.status === 429 || r.status >= 500) { await espera(1500 * t); continue; }
      if (!r.ok) return null;

      const corpo = await r.json();
      if (!Array.isArray(corpo) || corpo.length !== 1) return null;

      const c = corpo[0];
      if (c.logradouro || c.bairro || c.unidade) return null;   // é rua, não é a cidade
      if (String(c.ibge || '') !== String(ibge)) return null;    // xará em outro estado
      return /^\d{5}-?\d{3}$/.test(c.cep || '') ? c.cep : null;
    } catch {
      await espera(800 * t);
    }
  }
  return null;
}

(async () => {
  const pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: SIMULTANEAS + 1,
  });

  const { rows: cidades } = await pg.query(
    `select ibge_code, uf, name from "MUNICIPIOS"
      where cep_start is null ${UF_ARG ? 'and uf = $1' : ''}
      order by uf, name`,
    UF_ARG ? [UF_ARG] : []
  );

  console.log(`${cidades.length} cidade(s) sem CEP${UF_ARG ? ` em ${UF_ARG}` : ''}.\n`);
  if (!cidades.length) { await pg.end(); return; }

  let achados = 0, comFaixa = 0, feitos = 0;

  async function trabalhar(fila) {
    for (const c of fila) {
      const cep = await cepUnico(c.uf, c.name, c.ibge_code);
      if (cep) {
        // start = end porque a cidade inteira é um CEP só. A tela lê os
        // dois iguais e mostra "CEP único" em vez de "de X a X".
        await pg.query(
          'update "MUNICIPIOS" set cep_start = $1, cep_end = $1 where ibge_code = $2',
          [cep, c.ibge_code]
        );
        achados++;
      } else {
        comFaixa++;
      }
      if (++feitos % 100 === 0) {
        console.log(`  ${feitos}/${cidades.length} — ${achados} com CEP único, ${comFaixa} com faixa`);
      }
    }
  }

  // Divide a lista em N trilhas paralelas em vez de disparar tudo de uma
  // vez: cinco requisições no ar é ajuda, cinco mil é ataque.
  const trilhas = Array.from({ length: SIMULTANEAS }, (_, i) =>
    trabalhar(cidades.filter((_, j) => j % SIMULTANEAS === i)));
  await Promise.all(trilhas);

  const { rows: [t] } = await pg.query(
    `select count(*) filter (where cep_start is not null)::int com,
            count(*)::int total from "MUNICIPIOS" ${UF_ARG ? 'where uf = $1' : ''}`,
    UF_ARG ? [UF_ARG] : []
  );
  console.log(`\nCEP único encontrado: ${achados}`);
  console.log(`Cidades com faixa (ficam em branco): ${comFaixa}`);
  console.log(`Total no banco: ${t.com} de ${t.total} (${Math.round(t.com / t.total * 100)}%)`);

  await pg.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
