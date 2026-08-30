// ============================================================
// O QUE ESTÁ NA TELA AGORA.
//
// POR QUE ISTO EXISTE. O copiloto recebia só a lista de telas do menu
// ("Colaboradores → /employees") e mais nada. Perguntaram a ele como
// adicionar um filho no cadastro do colaborador, com a seção Filhos
// aberta na frente da pessoa e um botão "+ Adicionar filho" a dois
// centímetros do cursor. Ele respondeu para conferir a aba, recarregar
// a página e procurar o suporte técnico. Não foi burrice do modelo: ele
// estava adivinhando um sistema que nunca viu.
//
// Agora ele vê. Esta função varre a tela e devolve o ESQUELETO dela —
// títulos, rótulos de campo, botões, abas, avisos — que é o suficiente
// para responder "clique em + Adicionar filho" em vez de teorizar.
//
// O QUE NÃO VAI JUNTO, DE PROPÓSITO: o que a pessoa digitou.
//
// A tela de admissão tem CPF, e-mail, telefone e endereço de um
// colaborador de carne e osso. Mandar o VALOR dos campos para a Groq
// seria vazar dado pessoal de terceiro para um serviço de fora a cada
// pergunta — e sem nenhum ganho, porque a dúvida é sempre sobre onde
// clicar, não sobre o que está escrito na caixinha. Então vão os
// RÓTULOS ("CPF do cônjuge") e nunca os VALORES.
//
// Por isso a varredura é por elemento, e não um innerText do documento:
// innerText traria os dois misturados e não haveria como separar.
// ============================================================

// Teto de tamanho. Tela cheia de tabela geraria um prompt gigante a
// cada pergunta, e o que importa está sempre no começo (títulos e
// controles), não na milésima linha da grade.
const MAX_CHARS = 2500;

const limpa = s => String(s || '').replace(/\s+/g, ' ').trim();

// Elemento que a pessoa realmente enxerga. `offsetParent` nulo pega o
// display:none e o que está fora de aba fechada; a checagem de tamanho
// pega o que existe mas ocupa zero pixel.
function visivel(el) {
  if (!el || el.offsetParent === null) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * O esqueleto da tela, em texto.
 *
 * @param raiz  onde varrer (padrão: o documento)
 * @returns string pronta para o prompt, ou '' se não houver nada
 */
export function lerTela(raiz) {
  const doc = raiz || document;
  const secoes = [];
  const vistos = new Set();

  const junta = (rotulo, seletor, transf) => {
    const itens = [];
    for (const el of doc.querySelectorAll(seletor)) {
      // O próprio painel do assistente não conta: ele descreveria a si
      // mesmo ("Pergunte ou cole um print") no contexto da pergunta.
      if (el.closest('[data-copiloto]')) continue;
      if (!visivel(el)) continue;
      const t = limpa(transf ? transf(el) : el.textContent);
      if (!t || t.length > 120) continue;
      const chave = rotulo + '|' + t.toLowerCase();
      if (vistos.has(chave)) continue;
      vistos.add(chave);
      itens.push(t);
      if (itens.length >= 40) break;
    }
    if (itens.length) secoes.push(`${rotulo}: ${itens.join(' · ')}`);
  };

  junta('Títulos', 'h1, h2, h3, h4');
  junta('Botões', 'button, [role="button"], a[href]');
  junta('Abas', '[role="tab"]');
  junta('Campos', 'label');
  // Texto de estado — "Nenhum filho cadastrado" é exatamente o que a
  // pessoa está estranhando quando pergunta.
  junta('Avisos na tela', '[class*="empty"], [class*="vazio"], [class*="alert"], [class*="aviso"]');

  const texto = secoes.join('\n');
  return texto.length > MAX_CHARS ? texto.slice(0, MAX_CHARS) + ' …' : texto;
}

export default lerTela;
