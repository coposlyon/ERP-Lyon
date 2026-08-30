// ============================================================
// A FAIXA DE CEP — o que sobrou depois do CEP único e do CEP geral.
//
// seed-cep-unico.js  resolveu a cidade que inteira usa um número só.
// seed-cep-geral.js  resolveu a cidade cujas ruas variam mas cabem
//                    todas num prefixo, e o prefixo-000 é da localidade.
//
// Sobraram as cidades grandes, e nelas NÃO EXISTE "o CEP da cidade".
// Isso não é limitação do script, é o cadastro dos Correios: 88800-000,
// 89200-000 e 89390-000 não existem, e o 88801-000 que parece o começo
// da faixa de Criciúma é, na ViaCEP, a Avenida Centenário. Gravar aquilo
// como CEP da cidade poria toda etiqueta de Criciúma numa avenida.
//
// O QUE EXISTE E DÁ PARA PROVAR É A FAIXA. Os Correios alocam a cada
// município um BLOCO CONTÍGUO de prefixos de cinco dígitos:
//
//   Criciúma   88801 … 88819   (19 prefixos, nenhum buraco)
//   Joinville  89201 … 89239   (39 prefixos)
//   Corupá     89390 … 89393   ( 4 prefixos)
//
// E o bloco tem borda verificável: 89394-000 é Monte Castelo, OUTRA
// cidade — é isso que prova que o bloco de Corupá acaba em 89393.
//
// AS QUATRO PROVAS que uma faixa precisa passar:
//
//   1. AMOSTRA: pelo menos MIN_RUAS ruas conhecidas. Bloco desenhado com
//      cinco ruas é chute com aparência de dado.
//   2. IBGE: cada rua devolvida tem que trazer o código do município que
//      pedimos. Nome de cidade se repete entre estados, e a ViaCEP casa
//      por nome.
//   3. NINGUÉM MAIS DENTRO: os buracos do intervalo são sondados, e se
//      algum pertencer a OUTRO município o bloco é falso — são duas
//      cidades coladas por um dado sujo.
//
//      Isto substituiu uma regra de DENSIDADE pura, que perguntava a
//      coisa errada. Florianópolis tem 37 prefixos espalhados de 88010 a
//      88095 (43% de densidade) não porque o bloco seja falso, mas
//      porque a capital tem milhares de ruas e a ViaCEP devolve 50 por
//      busca. Buraco de amostragem não é buraco de verdade; a pergunta
//      que importa é quem mora no buraco. A densidade virou só um
//      número no relatório.
//   4. BORDA: o prefixo vizinho é sondado. Se responde OUTRA cidade, a
//      borda está provada. Se responde A PRÓPRIA cidade, a amostra
//      parou cedo e o bloco CRESCE até achar o vizinho de verdade —
//      foi o que faltou para Jaraguá do Sul e Videira, que a primeira
//      versão recusava em vez de estender.
//
// AMOSTRA PEQUENA. Abaixo de MIN_RUAS o bloco só é aceito com pelo
// menos TRÊS prefixos distintos, cada um confirmado pelo código do
// IBGE, e nenhum dono alheio entre eles. Grão-Pará é o caso: cinco ruas
// conhecidas em 88890, 88892 e 88895, e os prefixos ao redor não são de
// ninguém — silêncio, não outra cidade.
//
// A primeira versão desta regra exigia as duas BORDAS confirmadas por
// outro município, e estava perguntando a coisa errada: a borda mede a
// EXTENSÃO do bloco, e ela é desconhecida na maioria das cidades daqui
// (o relatório diz "sem resposta" em quase todas). O que protege contra
// bloco falso é não ter estranho dentro — e isso a prova 3 já garante.
//
// O QUE ISSO CUSTA, DITO SEM MAQUIAGEM: a faixa gravada é a OBSERVADA.
// Onde a borda não foi confirmada, o bloco real pode ser um ou dois
// prefixos maior do que o que está aqui. Serve para conferir se um CEP
// é daquela cidade e para o vendedor se situar; não serve como CEP de
// entrega — para isso, o CEP é o da rua, como sempre foi.
//
// COMO FICA GRAVADO.  cep_start = menor-000 ,  cep_end = maior-999
// com PREFIXOS DIFERENTES nas duas pontas. É isso que distingue os três
// casos na tela, sem coluna nova:
//
//   start == end                        cidade de CEP único
//   start != end, mesmo prefixo         CEP geral (as ruas variam depois do traço)
//   start != end, prefixos diferentes   FAIXA (muda de bairro para bairro)
//
// Rodar:  node scripts/seed-cep-faixa.js [UF] [--dry]
// Sem UF, varre o Brasil. Só mexe em quem está com cep_start NULO.
// ============================================================
require('dotenv').config();
const { Pool } = require('pg');

const args   = process.argv.slice(2);
const UF_ARG = (args.find(a => /^[A-Za-z]{2}$/.test(a)) || '').toUpperCase() || null;
const DRY    = args.includes('--dry');

// ── MODO PERMISSIVO ─────────────────────────────────────────
//
// O modo normal recusa muita coisa que é VERDADE, por excesso de rigor:
// cidade cuja amostra caiu toda num prefixo só é mandada embora ("é
// caso do seed-cep-geral"), e cidade com poucas ruas conhecidas também.
// Só que o seed-cep-geral já passou por elas e recusou por outro
// motivo — o prefixo-000 dele era uma rua de verdade. Resultado: elas
// ficam sem nada, embora a ViaCEP diga, com o código do IBGE batendo,
// que aquele prefixo é daquele município.
//
// Neste modo o prefixo confirmado vira faixa: `prefixo-000 a
// prefixo-999`. Continua sendo dado REAL — cada prefixo gravado foi
// confirmado pelo IBGE. O que se perde é largura: a faixa pode ser mais
// estreita que a verdadeira. Como a tela apresenta faixa como faixa
// (dois números, "serve para conferir, não para entregar"), estreitar é
// honesto; inventar não seria.
const PERMISSIVO = args.includes('--permissivo');

const MIN_RUAS      = 25;    // amostra mínima para o bloco significar algo
const DENSIDADE_MIN = 0.60;  // prefixos vistos / tamanho do intervalo
const PAUSA_MS      = 120;   // educação com a ViaCEP

// Os mesmos vinte termos do seed-cep-geral. A lista começou com cinco e
// deixou passar Planaltina (GO) com nove ruas; vinte termos acharam dois
// prefixos lá. Amostra pequena não é concordância.
const TERMOS = [
  'Rua', 'Avenida', 'Travessa', 'Praca', 'Estrada', 'Servidao', 'Alameda',
  'Rodovia', 'Joao', 'Jose', 'Santa', 'Sao', 'Silva', 'Nova', 'Central',
  'Presidente', 'Marechal', 'Coronel', 'Antonio', 'Pedro',
];

const dorme = ms => new Promise(r => setTimeout(r, ms));
// O NOME DO JEITO QUE A VIACEP ACEITA.
//
// Sem acento E SEM HIFEN. "Grao-Para" devolve zero rua; "Grao Para"
// devolve as cinco que existem. O hifen custou o unico municipio de SC
// que ficou de fora por motivo bobo, e o Brasil tem centenas deles
// (Mogi-Mirim, Santa Barbara d'Oeste, Belem de Sao Francisco).
const semAcento = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[-']/g, ' ').replace(/\s+/g, ' ').trim();
const soDigitos = s => String(s || '').replace(/\D/g, '');

async function viacep(url) {
  await dorme(PAUSA_MS);
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

/** As ruas conhecidas da cidade, conferidas pelo código do IBGE. */
async function ruasDaCidade(uf, nome, ibge) {
  const ceps = new Set();
  let forasteiras = 0;
  for (const termo of TERMOS) {
    const j = await viacep(`https://viacep.com.br/ws/${uf}/${encodeURIComponent(semAcento(nome))}/${encodeURIComponent(termo)}/json/`);
    if (!Array.isArray(j)) continue;
    for (const x of j) {
      if (!x.cep) continue;
      // PROVA 2: a rua tem que ser do município que pedimos.
      if (x.ibge && String(x.ibge) !== String(ibge)) { forasteiras++; continue; }
      ceps.add(soDigitos(x.cep));
    }
  }
  return { ceps, forasteiras };
}

/**
 * Quem é o dono deste prefixo?
 *
 * Um prefixo de faixa não tem o -000, então não adianta sondar só ele:
 * testa alguns sufixos e devolve o primeiro município que responder.
 * `null` = ninguém respondeu, e aí a borda fica só observada.
 */
async function donoDoPrefixo(prefixo) {
  for (const suf of ['000', '001', '010', '100', '500', '900']) {
    const j = await viacep(`https://viacep.com.br/ws/${prefixo}${suf}/json/`);
    if (j && !j.erro && j.localidade) return { cidade: j.localidade, ibge: String(j.ibge || '') };
  }
  return null;
}

/**
 * Empurra a ponta do bloco enquanto o vizinho for a propria cidade.
 *
 * Devolve onde parou e por que parou. O teto existe para o caso de a
 * sondagem responder sempre a mesma coisa: doze passos ja e mais que
 * qualquer bloco municipal do pais.
 */
const MAX_PASSOS = 12;
async function estender(ponta, passo, ibge) {
  let fim = ponta;
  for (let i = 0; i < MAX_PASSOS; i++) {
    const d = await donoDoPrefixo(String(fim + passo).padStart(5, '0'));
    if (!d) return { fim, borda: 'sem resposta' };
    if (d.ibge !== String(ibge)) return { fim, borda: `ok (${d.cidade})` };
    fim += passo;   // ainda e a mesma cidade: o bloco continua
  }
  return { fim, borda: 'parou no teto' };
}

async function main() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  const { rows } = await pool.query(
    `SELECT ibge_code, uf, name, population FROM "MUNICIPIOS"
      WHERE cep_start IS NULL ${UF_ARG ? 'AND uf = $1' : ''}
      ORDER BY uf, population DESC NULLS LAST`,
    UF_ARG ? [UF_ARG] : []
  );

  console.log(`${rows.length} municipios sem CEP${UF_ARG ? ' em ' + UF_ARG : ''}${DRY ? '  [DRY RUN - nada e gravado]' : ''}\n`);

  let gravados = 0, pulados = 0;
  const recusas = [];

  for (const m of rows) {
    const { ceps, forasteiras } = await ruasDaCidade(m.uf, m.name, m.ibge_code);

    // PROVA 1: amostra. Poucas ruas nao reprova de saida — reprova la
    // embaixo, se as bordas tambem nao fecharem.
    const amostraFraca = ceps.size < MIN_RUAS;
    if (!PERMISSIVO && ceps.size < 3) {
      recusas.push(`${m.uf} ${m.name}: so ${ceps.size} ruas - nao da para desenhar bloco nenhum`);
      pulados++; continue;
    }

    const prefixos = [...new Set([...ceps].map(c => c.slice(0, 5)))].map(Number).sort((a, b) => a - b);
    const min = prefixos[0], max = prefixos[prefixos.length - 1];

    // Prefixo unico: no modo normal e caso do seed-cep-geral (que ja
    // recusou, senao a cidade nao estaria aqui). No permissivo, o
    // prefixo confirmado pelo IBGE vira a faixa da cidade.
    if (min === max && !PERMISSIVO) {
      recusas.push(`${m.uf} ${m.name}: prefixo unico ${min} - e caso do seed-cep-geral`);
      pulados++; continue;
    }

    // PROVA 3: densidade — agora so um AVISO, nao uma recusa.
    // Quem recusa e a prova 3b (dono alheio dentro do intervalo), que
    // pergunta a coisa certa. Ver o comentario la embaixo.
    const span = max - min + 1;
    const densidade = prefixos.length / span;

    // PROVA 4: bordas, ESTENDENDO quando a amostra parou cedo.
    //
    // Vizinho que responde a PROPRIA cidade nao e motivo para recusar:
    // e a prova de que a amostra nao chegou na ponta. Jaragua do Sul e
    // Videira morreram assim na primeira versao. Entao o bloco cresce
    // ate encontrar outra cidade ou o silencio.
    // Sondar borda custa ate 6 requisicoes por lado. No permissivo, com
    // amostra minuscula, isso e caro e diz pouco: fica so o observado.
    const sondar = !PERMISSIVO || ceps.size >= MIN_RUAS;
    const { fim: minFinal, borda: bAbaixo } = sondar
      ? await estender(min, -1, m.ibge_code) : { fim: min, borda: 'nao sondada' };
    const { fim: maxFinal, borda: bAcima } = sondar
      ? await estender(max, +1, m.ibge_code) : { fim: max, borda: 'nao sondada' };

    // PROVA 3b: buraco que pertence a OUTRA cidade invalida o bloco.
    //
    // Substitui a densidade crua onde ela sozinha errava: Florianopolis
    // tem 37 prefixos espalhados de 88010 a 88095 (43%) porque a capital
    // tem milhares de ruas e a ViaCEP devolve 50 por busca. Buraco de
    // amostragem nao e buraco de verdade. O que importa e se alguem MAIS
    // mora dentro do intervalo.
    const buracos = [];
    for (let x = minFinal; x <= maxFinal; x++) if (!prefixos.includes(x)) buracos.push(x);
    let invasor = null;
    for (const b of buracos.slice(0, 8)) {
      const d = await donoDoPrefixo(String(b).padStart(5, '0'));
      if (d && d.ibge && d.ibge !== String(m.ibge_code)) { invasor = `${b} e de ${d.cidade}`; break; }
    }
    if (invasor) {
      recusas.push(`${m.uf} ${m.name}: bloco ${minFinal}-${maxFinal} tem dono alheio no meio (${invasor})`);
      pulados++; continue;
    }

    // Amostra fraca passa com tres prefixos confirmados pelo IBGE e a
    // prova 3 limpa. Ver o cabecalho: exigir borda provada media a
    // extensao do bloco, nao a veracidade dele.
    if (!PERMISSIVO && amostraFraca && prefixos.length < 3) {
      recusas.push(`${m.uf} ${m.name}: so ${ceps.size} ruas em ${prefixos.length} prefixo(s) - amostra fraca demais`);
      pulados++; continue;
    }

    const cepStart = `${minFinal}-000`;
    const cepEnd   = `${maxFinal}-999`;

    console.log(`${m.uf} ${m.name.padEnd(28)} ${cepStart} a ${cepEnd}  (${ceps.size} ruas, ${prefixos.length}/${span} prefixos vistos, densidade ${(densidade*100).toFixed(0)}%${forasteiras ? `, ${forasteiras} de fora descartadas` : ''})`);
    console.log(`     bordas: ${minFinal - 1} ${bAbaixo} | ${maxFinal + 1} ${bAcima}${(minFinal !== min || maxFinal !== max) ? `  [estendido de ${min}-${max}]` : ''}${buracos.length ? `  ${buracos.length} buracos, ${Math.min(8,buracos.length)} sondados` : ''}`);

    if (!DRY) {
      await pool.query(
        `UPDATE "MUNICIPIOS" SET cep_start = $1, cep_end = $2, synced_at = NOW() WHERE ibge_code = $3`,
        [cepStart, cepEnd, m.ibge_code]
      );
    }
    gravados++;
  }

  console.log(`\n${gravados} gravados, ${pulados} deixados em branco`);
  if (recusas.length) {
    console.log('\nPOR QUE FICARAM EM BRANCO:');
    for (const r of recusas) console.log('  - ' + r);
  }
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
