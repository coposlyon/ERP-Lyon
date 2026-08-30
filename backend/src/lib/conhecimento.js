// ============================================================
// ACHAR O QUE INTERESSA NA BASE DE CONHECIMENTO.
//
// `scripts/gerar-conhecimento.js` colhe os cabeçalhos de 206 arquivos
// do repositório — 182 KB de regra de negócio escrita por quem fez cada
// peça. Isso é conhecimento demais para caber num prompt: 182 KB são
// perto de 45 mil tokens, e mandá-los a cada pergunta estouraria o
// limite do modelo, o limite de tokens por minuto da conta e o bolso,
// tudo de uma vez.
//
// Então não vai tudo: vai o que a pergunta pede. Esta busca pontua cada
// trecho contra a pergunta E contra a tela aberta, e devolve os
// melhores até encher um orçamento de caracteres.
//
// POR QUE A TELA ENTRA NA BUSCA. "Como faço isso aqui?" não tem
// nenhuma palavra útil. Mas a tela aberta tem: se ela diz "Formação de
// Preço" e "margem", a pergunta vazia vira uma consulta sobre preço. É
// o mesmo que um colega faz ao olhar por cima do seu ombro antes de
// responder.
//
// POR QUE BUSCA POR PALAVRA, E NÃO POR SIGNIFICADO. Busca semântica
// exigiria gerar e guardar vetores dos 206 trechos e um modelo de
// embedding em produção — numa máquina de 512 MB, para um ganho que
// aqui é pequeno: o vocabulário do ERP é fechado e literal ("borda",
// "rateio", "vegetal", "comprovante"), e quem pergunta usa as mesmas
// palavras que estão escritas na tela e no código.
// ============================================================

let BASE = [];
try {
  BASE = require('./conhecimento.json');
} catch {
  // Base ausente (esqueceram de gerar) não pode derrubar o assistente:
  // ele continua respondendo com o que sabe do prompt fixo.
  console.warn('[conhecimento] conhecimento.json ausente — rode: node scripts/gerar-conhecimento.js');
}

// Quanto do prompt o conhecimento pode ocupar. Sobra espaço para a
// instrução, a lista de telas, a tela lida e o histórico.
const ORCAMENTO = 9000;
const MAX_TRECHOS = 5;

// Palavras que aparecem em tudo e não distinguem nada. Sem esta lista,
// "como faço para" casa com os 206 trechos igualmente.
const VAZIAS = new Set(`
a o e de da do das dos que para por com sem em no na nos nas um uma uns umas
como qual quais quando onde porque pq nao sim isso isto aqui ali esse essa este
esta eles elas ele ela eu voce vc meu minha seu sua ao aos as os se ja mais
muito pouco tem ter tenho fazer faco faz feito ser sou e' esta estao foi era
sobre entre depois antes cada todo toda todos todas outro outra pode posso
preciso quero gostaria ajuda favor obrigado ok tela sistema botao clicar clique
`.trim().split(/\s+/));

const normaliza = s => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase();

function termos(texto) {
  const conta = new Map();
  for (const p of normaliza(texto).split(/[^a-z0-9]+/)) {
    if (p.length < 4 || VAZIAS.has(p)) continue;
    conta.set(p, (conta.get(p) || 0) + 1);
  }
  return conta;
}

// Índice montado uma vez, no boot: cada trecho vira um saco de palavras.
const INDICE = BASE.map(t => ({
  ...t,
  sacoTexto: normaliza(t.texto),
  sacoTitulo: normaliza(t.titulo + ' ' + t.arquivo + ' ' + t.area),
}));

/**
 * Os trechos que importam para esta pergunta.
 *
 * @param pergunta      o que a pessoa escreveu
 * @param contextoTela  o esqueleto da tela aberta (peso menor)
 * @returns string pronta para o prompt, ou '' se nada casar
 */
function buscar(pergunta, contextoTela) {
  if (!INDICE.length) return '';

  const daPergunta = termos(pergunta);
  // A tela ajuda a desambiguar, mas não manda: peso menor para ela não
  // sequestrar uma pergunta que mudou de assunto.
  const daTela = termos(contextoTela);
  if (!daPergunta.size && !daTela.size) return '';

  const pontuados = [];
  for (const t of INDICE) {
    let p = 0;
    for (const [palavra, vezes] of daPergunta) {
      if (t.sacoTitulo.includes(palavra)) p += 8 * vezes;   // título/arquivo: sinal forte
      if (t.sacoTexto.includes(palavra))  p += 3 * vezes;
    }
    for (const [palavra] of daTela) {
      if (t.sacoTitulo.includes(palavra)) p += 2;
      if (t.sacoTexto.includes(palavra))  p += 1;
    }
    if (p > 0) pontuados.push({ t, p });
  }

  if (!pontuados.length) return '';
  pontuados.sort((a, b) => b.p - a.p);

  const partes = [];
  let usado = 0;
  for (const { t } of pontuados.slice(0, MAX_TRECHOS)) {
    const bloco = `--- ${t.area} · ${t.titulo}\n(de ${t.arquivo})\n${t.texto}`;
    if (usado + bloco.length > ORCAMENTO) break;
    partes.push(bloco);
    usado += bloco.length;
  }
  return partes.join('\n\n');
}

/** O que a base cobre — para o copiloto saber o que existe. */
function indiceDeAreas() {
  const c = {};
  for (const t of BASE) c[t.area] = (c[t.area] || 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1]).map(([a]) => a).join(', ');
}

module.exports = { buscar, indiceDeAreas, total: () => BASE.length };
