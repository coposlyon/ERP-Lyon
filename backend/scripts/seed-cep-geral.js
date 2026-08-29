// ============================================================
// O CEP GERAL DA LOCALIDADE — o que sobrou depois do CEP único.
//
// O seed-cep-unico.js resolveu 4.248 municípios: cidade pequena inteira
// usa um número só, e a ViaCEP devolve esse número. Sobraram 1.323 em
// branco, e a tela dizia (com razão) que faixa de CEP só existe no DNE
// dos Correios, que é pago.
//
// SÓ QUE NEM TODA CIDADE EM BRANCO TEM FAIXA DE VERDADE. Adrianópolis
// (PR, 6.256 habitantes) tem CEP por rua — 83490-005, 83490-972 — mas
// TODAS as ruas dela vivem no MESMO prefixo de cinco dígitos: 83490. Uma
// cidade assim tem um CEP geral, e ele é o prefixo com final 000:
// 83490-000. Isso não é chute, é o que os cinco dígitos já dizem.
//
// O QUE ESTE SCRIPT NÃO ACEITA. Almirante Tamandaré parece o mesmo caso
// e não é: as ruas dela vão de 83501-520 a 83514-030 — catorze prefixos.
// Ali não existe "o CEP da cidade", e o 83501-000 que parece o começo da
// faixa é, na ViaCEP, a Avenida Emílio Johnson. Gravar aquilo poria
// TODAS as etiquetas da cidade numa avenida específica.
//
// AS TRÊS PROVAS que um CEP precisa passar para ser gravado:
//
//   1. as ruas conhecidas da cidade cabem todas em UM prefixo
//   2. o código do IBGE bate (nome de cidade se repete entre estados)
//   3. o candidato prefixo-000 NÃO É UMA RUA na ViaCEP
//   4. a amostra tem ruas suficientes para a concordância significar algo
//
// A terceira separa Adrianópolis de Almirante Tamandaré. A quarta nasceu
// depois: com cinco termos de busca, Planaltina (GO) e Santo Antônio do
// Descoberto (GO) passaram com 9 e 3 ruas, e uma reconferência com vinte
// termos achou dois prefixos nas duas. Poucas ruas concordando não é
// concordância.
//
// COMO FICA GRAVADO. `cep_start` = o CEP geral, `cep_end` = prefixo-999.
// Os dois DIFERENTES de propósito: é assim que a tela sabe que aquilo é
// o CEP geral de uma faixa, e não o CEP único da cidade (onde start e
// end são iguais). A diferença importa para quem lê a etiqueta.
//
// Rodar:  node scripts/seed-cep-geral.js [UF] [--dry]
// Sem UF, varre o Brasil. Quem já tem CEP é pulado — pode rodar de novo.
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');

const args   = process.argv.slice(2);
const UF_ARG = (args.find(a => /^[A-Za-z]{2}$/.test(a)) || '').toUpperCase() || null;
const DRY    = args.includes('--dry');

// Termos que pegam fatias diferentes do cadastro. A ViaCEP devolve no
// máximo 50 por busca, e um termo só mostraria um pedaço da cidade que
// por acaso pode ser todo do mesmo prefixo.
//
// A LISTA COMEÇOU COM CINCO E ERROU DUAS VEZES. Planaltina (GO, 105 mil
// habitantes) e Santo Antônio do Descoberto (GO, 72 mil) passaram: os
// cinco termos acharam 9 e 3 ruas, todas do mesmo prefixo, e o
// prefixo-000 não era rua nenhuma. Com vinte termos apareceram DOIS
// prefixos nas duas, e o CEP teve que ser apagado. Poucas ruas
// concordando não é concordância — é amostra pequena.
const TERMOS = [
  'Rua', 'Avenida', 'Travessa', 'Praca', 'Estrada',
  'Sao', 'Jos', 'Ant', 'Sil', 'Dom', 'Cent', 'Ver',
  'Mar', 'Par', 'Bra', 'Nov', 'Alt', 'Pre', 'Ind', 'Jar',
];

// Abaixo disto não se conclui nada. Uma cidade em que a ViaCEP conhece
// três ruas pode ter trinta que ela não conhece, e as outras vinte e sete
// podem estar noutro prefixo. Em branco é a resposta honesta.
const MIN_RUAS = 8;
const SIMULTANEAS = 4;
const TENTATIVAS = 3;

const semAcento = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const espera = ms => new Promise(r => setTimeout(r, ms));
const soDigitos = c => String(c || '').replace(/\D/g, '');

async function pedir(url) {
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'ERP-LyonCopos/1.0' } });
      if (r.status === 429 || r.status >= 500) { await espera(1500 * t); continue; }
      if (!r.ok) return null;
      return await r.json();
    } catch { await espera(800 * t); }
  }
  return null;
}

/**
 * O candidato a CEP geral, ou null quando a cidade tem faixa de verdade.
 *
 * `null` aqui nao e falha: e a resposta certa para Curitiba. Cidade com
 * CEP que muda de bairro para bairro nao tem um numero que a represente,
 * e inventar um e o erro que este arquivo inteiro existe para evitar.
 */
async function cepGeral(uf, nome, ibge) {
  const cidade = encodeURIComponent(semAcento(nome));
  const prefixos = new Set();
  let viu = 0;

  for (const termo of TERMOS) {
    const lista = await pedir(`https://viacep.com.br/ws/${uf}/${cidade}/${termo}/json/`);
    if (!Array.isArray(lista) || !lista.length) continue;

    for (const r of lista) {
      // Xara em outro estado: a ViaCEP casa por texto, o IBGE nao mente.
      if (r.ibge && String(r.ibge) !== String(ibge)) return { motivo: 'xara' };
      const d = soDigitos(r.cep);
      if (d.length !== 8) continue;
      prefixos.add(d.slice(0, 5));
      viu++;
    }
    // Ja sabemos que ha mais de um prefixo: nao adianta pedir mais.
    if (prefixos.size > 1) return { motivo: 'faixa', prefixos: prefixos.size };
  }

  if (!viu) return { motivo: 'sem_dados' };
  if (prefixos.size !== 1) return { motivo: 'faixa', prefixos: prefixos.size };
  if (viu < MIN_RUAS) return { motivo: 'amostra_curta', viu };

  const prefixo = [...prefixos][0];
  const candidato = `${prefixo}-000`;

  // A PROVA QUE IMPORTA: se o candidato for uma rua, ele nao e da cidade.
  const conf = await pedir(`https://viacep.com.br/ws/${prefixo}000/json/`);
  if (conf && !conf.erro && (conf.logradouro || conf.bairro || conf.unidade)) {
    return { motivo: 'e_rua', rua: conf.logradouro };
  }
  // A ViaCEP responder "nao existe" e o esperado: o CEP geral de uma
  // faixa nao e um endereco, entao nao esta no cadastro de ruas dela.

  return { cep: candidato, fim: `${prefixo}-999`, amostra: viu };
}

(async () => {
  const pg = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: SIMULTANEAS + 1,
  });

  const { rows: cidades } = await pg.query(
    `select ibge_code, uf, name, population from "MUNICIPIOS"
      where cep_start is null ${UF_ARG ? 'and uf = $1' : ''}
      order by uf, name`,
    UF_ARG ? [UF_ARG] : []
  );

  console.log(`${cidades.length} cidade(s) sem CEP${UF_ARG ? ` em ${UF_ARG}` : ''}.`);
  if (DRY) console.log('(--dry: nada sera gravado)');
  console.log('');
  if (!cidades.length) { await pg.end(); return; }

  const contas = { gravados: 0, faixa: 0, e_rua: 0, sem_dados: 0, xara: 0, amostra_curta: 0 };
  const exemplos = [];
  let feitos = 0;

  async function trabalhar(fila) {
    for (const c of fila) {
      const r = await cepGeral(c.uf, c.name, c.ibge_code);
      if (r.cep) {
        if (!DRY) {
          await pg.query(
            'update "MUNICIPIOS" set cep_start = $1, cep_end = $2 where ibge_code = $3',
            [r.cep, r.fim, c.ibge_code]
          );
        }
        contas.gravados++;
        if (exemplos.length < 12) exemplos.push(`${c.uf} ${c.name} -> ${r.cep} (${r.amostra} ruas conferidas)`);
      } else {
        contas[r.motivo] = (contas[r.motivo] || 0) + 1;
        if (r.motivo === 'e_rua' && exemplos.length < 12) {
          exemplos.push(`${c.uf} ${c.name} -> RECUSADO: o prefixo-000 e "${r.rua}"`);
        }
      }
      if (++feitos % 50 === 0) console.log(`  ${feitos}/${cidades.length} — ${contas.gravados} gravados`);
    }
  }

  await Promise.all(Array.from({ length: SIMULTANEAS }, (_, i) =>
    trabalhar(cidades.filter((_, j) => j % SIMULTANEAS === i))));

  console.log('\n— amostra —');
  exemplos.forEach(e => console.log('  ' + e));

  console.log('\nCEP geral gravado:            ' + contas.gravados);
  console.log('Faixa de verdade (em branco): ' + contas.faixa);
  console.log('Recusados por serem rua:      ' + contas.e_rua);
  console.log('Amostra curta (em branco):    ' + contas.amostra_curta);
  console.log('ViaCEP nao conhece a cidade:  ' + contas.sem_dados);
  if (contas.xara) console.log('Xara em outro estado:         ' + contas.xara);

  const { rows: [t] } = await pg.query(
    `select count(*) filter (where cep_start is not null)::int com,
            count(*)::int total from "MUNICIPIOS" ${UF_ARG ? 'where uf = $1' : ''}`,
    UF_ARG ? [UF_ARG] : []
  );
  console.log(`\nTotal no banco: ${t.com} de ${t.total} (${Math.round(t.com / t.total * 100)}%)`);

  await pg.end();
})().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
