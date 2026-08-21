// ============================================================
// A ARTE, DO CADASTRO ATÉ O COPO.
//
// A arte cadastrada é um vetor com buracos: onde vai o nome do casal
// está escrito `%NOME1%`, e o `<text>` carrega `data-campo="nome1"`.
// Este arquivo é quem tapa os buracos com o que o cliente digitou.
//
// POR QUE MARCADOR E NÃO UM EDITOR DE VETOR. O cliente pode trocar o
// nome, a data e a frase — não pode desmontar o desenho. O vetor é da
// Lyon e vai para a serigrafia do jeito que o designer fechou; o que
// muda é só o texto que o marcador libera. É a diferença entre uma arte
// que sai bonita da gráfica e uma que sai torta com o cliente jurando
// que na tela estava certo.
//
// O TEXTO DO CLIENTE É ESCAPADO. Ele vai parar dentro de um SVG que a
// tela injeta com dangerouslySetInnerHTML. Sem escapar, quem digitar
// `<script>` no campo "nome" executa script na página de quem abrir a
// prévia depois. Escapar aqui, num lugar só, é o que faz as três telas
// (prévia, editor e 3D) ficarem seguras de uma vez.
// ============================================================

/** `<` vira `&lt;`. O que o cliente digita é texto, nunca marcação. */
export function escapar(texto) {
  return String(texto ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** "Bruna" + "Lucas" → "B & L". Para as artes de monograma. */
function iniciais(valores) {
  const letra = t => String(t || '').trim().charAt(0).toUpperCase();
  return [letra(valores.nome1), letra(valores.nome2)].filter(Boolean).join(' &amp; ');
}

/**
 * O vetor da arte com os valores do cliente dentro.
 *
 * @param svg       o vetor cadastrado, com os marcadores `%CAMPO%`
 * @param elementos [{ key, label, tipo, padrao, max }] — o que é editável
 * @param valores   { nome1: 'Maria', data: '30/01/2026', … }
 * @param estilo    { fonte, alinhamento, x, y, escala }
 */
export function aplicarValores(svg, elementos = [], valores = {}, estilo = {}) {
  if (!svg) return null;
  let saida = String(svg);

  // 1. Os monogramas primeiro. O `<text data-iniciais>` mostra "B & L"
  //    e não o nome inteiro — e ele também carrega `%NOME1%`, então tem
  //    que ser resolvido ANTES da troca geral, ou vira "Bruna" grafado
  //    em corpo 22 atravessando o copo.
  saida = saida.replace(
    /(<text\b[^>]*\bdata-iniciais=(?:"1"|'1')[^>]*>)([\s\S]*?)(<\/text>)/gi,
    (_, abre, __, fecha) => `${abre}${iniciais(valores)}${fecha}`);

  // 2. Campo opcional em branco sai do desenho INTEIRO. Deixar o
  //    `<text>` vazio empurraria o resto do layout como se algo
  //    estivesse lá; deixar o marcador faria o copo sair com "%FRASE%"
  //    impresso — e isso já aconteceu em gráfica de verdade.
  for (const campo of elementos) {
    const valor = String(valores?.[campo.key] ?? '').trim();
    if (valor) continue;
    saida = saida.replace(
      new RegExp(`<text\\b[^>]*\\bdata-campo=(?:"${campo.key}"|'${campo.key}')[^>]*>[\\s\\S]*?<\\/text>`, 'gi'),
      '');
  }

  // 3. A troca dos marcadores que sobraram.
  for (const campo of elementos) {
    const valor = escapar(String(valores?.[campo.key] ?? '').slice(0, campo.max || 60));
    saida = saida.split(`%${campo.key.toUpperCase()}%`).join(valor);
  }
  // Marcador de campo que a arte tem e o cadastro não declarou: some, em
  // vez de ir impresso.
  saida = saida.replace(/%[A-Z0-9_]{2,20}%/g, '');

  return aplicarEstilo(saida, estilo);
}

/**
 * A fonte, o alinhamento e a posição escolhidos pelo cliente.
 *
 * Entram como atributo do `<svg>` raiz e como um `<g transform>` em
 * volta do miolo — o vetor original não é tocado, o que garante que
 * "desfazer" sempre volta para uma arte que a Lyon aprovou.
 */
function aplicarEstilo(svg, estilo = {}) {
  const { fonte, alinhamento, x = 0, y = 0, escala = 1 } = estilo;
  let saida = svg;

  if (fonte) {
    const familia = escapar(fonte);
    saida = /font-family=/.test(saida.slice(0, saida.indexOf('>') + 1))
      ? saida.replace(/font-family="[^"]*"/, `font-family="${familia}, Georgia, serif"`)
      : saida.replace(/<svg\b/, `<svg font-family="${familia}, Georgia, serif"`);
  }

  // O alinhamento mexe no ponto de ancoragem dos textos editáveis. Os
  // ornamentos (filetes, molduras, ramos) ficam onde estão: alinhar a
  // moldura junto seria desmontar a arte.
  if (alinhamento && alinhamento !== 'centro') {
    const ancora = alinhamento === 'esquerda' ? 'start' : 'end';
    const posicao = alinhamento === 'esquerda' ? '14' : '86';
    saida = saida.replace(/(<text\b[^>]*\bdata-campo=[^>]*>)/gi, trecho => trecho
      .replace(/text-anchor="[^"]*"/, `text-anchor="${ancora}"`)
      .replace(/\bx="[^"]*"/, `x="${posicao}"`));
  }

  const movida = x !== 0 || y !== 0 || escala !== 1;
  if (movida) {
    const miolo = saida.replace(/^[\s\S]*?<svg\b[^>]*>/i, '').replace(/<\/svg>\s*$/i, '');
    const abertura = saida.match(/^[\s\S]*?<svg\b[^>]*>/i)?.[0] || '<svg>';
    // Escala em torno do centro do quadro (50,50) — escalar a partir do
    // canto jogaria a arte para fora ao aumentar.
    const t = `translate(${50 + x} ${50 + y}) scale(${escala}) translate(-50 -50)`;
    saida = `${abertura}<g transform="${t}">${miolo}</g></svg>`;
  }

  return saida;
}

/** Os valores iniciais de uma arte: o que o cadastro deixou de exemplo. */
export function valoresPadrao(elementos = []) {
  const saida = {};
  for (const c of elementos) saida[c.key] = c.padrao ?? '';
  return saida;
}

export const ESTILO_PADRAO = { fonte: null, alinhamento: 'centro', x: 0, y: 0, escala: 1 };

/**
 * A arte cabe no gabarito?
 *
 * Mede de verdade, no navegador: monta o vetor fora da tela e pergunta a
 * caixa de cada texto. Contar caracteres não serve — "MMMM" e "iiii"
 * têm quatro letras e larguras que não se parecem.
 *
 * O quadro da arte (0–100) É a área segura: o editor encaixa o vetor
 * dentro da linha azul. Então qualquer coisa que passe de 0–100 já está
 * na margem de segurança, e é isso que esta função acusa.
 */
export function cabeNoGabarito(svgMontado) {
  if (typeof document === 'undefined' || !svgMontado) return { ok: true, estouros: [] };

  const caixa = document.createElement('div');
  caixa.setAttribute('aria-hidden', 'true');
  caixa.style.cssText = 'position:absolute;left:-9999px;top:0;width:400px;height:400px;visibility:hidden';
  caixa.innerHTML = svgMontado;
  document.body.appendChild(caixa);

  const estouros = [];
  try {
    const svg = caixa.querySelector('svg');
    if (!svg) return { ok: true, estouros: [] };
    svg.setAttribute('width', '400');
    svg.setAttribute('height', '400');

    for (const texto of svg.querySelectorAll('[data-campo]')) {
      let bb;
      try { bb = texto.getBBox(); } catch { continue; }
      if (!bb || (!bb.width && !bb.height)) continue;
      const folga = 0.6; // arredondamento de subpixel não é estouro
      const passou = bb.x < -folga || bb.y < -folga
        || bb.x + bb.width > 100 + folga || bb.y + bb.height > 100 + folga;
      if (passou) estouros.push(texto.getAttribute('data-campo'));
    }
  } finally {
    caixa.remove();
  }

  return { ok: estouros.length === 0, estouros: [...new Set(estouros)] };
}

/**
 * O vetor da arte virado imagem, para o 3D poder pintá-lo no copo.
 *
 * O WebGL não desenha SVG: ele quer uma textura. O caminho é rasterizar
 * o vetor num `<img>` e deixar a textura ser montada num canvas.
 *
 * DUAS COISAS QUEBRAM SE FOREM ESQUECIDAS:
 *
 *   `currentColor` — as artes são desenhadas com `fill="currentColor"`
 *   para herdar a cor da tinta escolhida. Fora do DOM não existe cor
 *   herdada, e o navegador resolve para PRETO. Sem a troca, a arte sai
 *   preta no copo mesmo com o cliente tendo escolhido branco.
 *
 *   width/height — um SVG só com `viewBox` rasteriza em tamanho
 *   indefinido (no Firefox, 0×0). A medida tem que ir explícita.
 */
export function svgParaImagem(svg, { cor = '#111318', largura = 640 } = {}) {
  return new Promise(resolve => {
    if (!svg || typeof window === 'undefined') return resolve(null);

    const altura = largura;
    const pintado = String(svg)
      .replace(/currentColor/g, cor)
      .replace(/<svg\b/, `<svg width="${largura}" height="${altura}"`);

    const url = URL.createObjectURL(new Blob([pintado], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

/**
 * A proporção do gabarito, para a tela desenhar o retângulo certo.
 *
 * O Long Drink é 120 × 45 mm: alto e estreito. A caneca é o contrário.
 * Desenhar um quadrado nos dois casos faria o cliente aprovar uma arte
 * num formato e receber outro.
 */
export function medidasDoGabarito(gabarito, alturaPx = 340) {
  const altura_mm = Number(gabarito?.altura_mm) || 0;
  const largura_mm = Number(gabarito?.largura_mm) || 0;
  const margem_mm = Number(gabarito?.margem_mm) || 0;
  if (!altura_mm || !largura_mm) return null;

  const escala = alturaPx / altura_mm;
  return {
    altura_mm, largura_mm, margem_mm,
    alturaPx: alturaPx,
    larguraPx: Math.round(largura_mm * escala),
    margemPx: Math.max(2, margem_mm * escala),
  };
}
