// ============================================================
// A PEÇA QUE O CLIENTE ESCOLHEU — A FOTO DELA.
//
// Esta tela já teve duas respostas erradas antes desta.
//
// A primeira foi um desenho só, um copo cônico, para o catálogo
// inteiro: quem escolhia caneca via um long drink. A segunda foi um
// desenho por família — a caneca ganhou alça, a taça ganhou haste — e
// ainda estava errada, porque desenho continua sendo desenho. O cliente
// olha a prévia para decidir se compra, e o que ele precisa ver é O
// PRODUTO, não uma representação dele.
//
// Agora a prévia é A FOTO DO CADASTRO. Cada cor do modelo é um produto
// de verdade, com foto de verdade — 94 das 97 peças do catálogo têm a
// sua. Escolheu Preto, aparece a foto da peça preta. É a mesma imagem
// que a vitrine e a loja mostram: uma peça, uma foto, em todo lugar.
//
// O DESENHO NÃO FOI JOGADO FORA, virou o plano B: modelo sem foto
// cadastrada cai nele em vez de cair num quadrado vazio. As silhuetas
// por família continuam valendo lá, com as proporções medidas das fotos
// reais.
//
// O QUE A FOTO NÃO MOSTRA. Pintura, jateado e borda metalizada são
// serviço aplicado sobre a peça, e não existe foto de cada combinação —
// seriam 24 cores × 13 acabamentos por modelo. Nesses casos a foto
// mostra a peça certa e as cores escolhidas aparecem como selos ao lado,
// nomeadas. Mostrar a peça certa com o acabamento escrito é honesto;
// desenhar um copo que não é aquele não era.
// ============================================================

import { useState, useEffect } from 'react';

/** Socorro para cor sem hex no cadastro. Some sozinho conforme o Administrativo preenche. */
const POR_NOME = {
  'amarelo': '#facc15', 'amarelo canario': '#fde047', 'amarelo neon': '#fef08a',
  'azul': '#2563eb', 'azul royal': '#1d4ed8', 'azul bebe': '#93c5fd', 'azul bebê': '#93c5fd',
  'azul bic': '#1e40af', 'azul tifanny': '#5eead4', 'azul translucido': '#60a5fa',
  'branco': '#f8fafc', 'branca': '#f8fafc',
  'dourada': '#d4af37', 'dourado': '#d4af37',
  'gelo': '#e2e8f0', 'efeito gelo': '#e2e8f0',
  'laranja': '#f97316', 'laranja neon': '#fb923c', 'laranja opaco': '#ea580c',
  'perola': '#f1e9dd', 'pérola': '#f1e9dd',
  'pink opaco': '#ec4899', 'prata': '#c0c6cf', 'preta': '#111318', 'preto': '#111318',
  'preto translucido': '#3f3f46',
  'rosa': '#f43f7e', 'rosa bebe translucido': '#fbcfe8', 'rosa neon': '#fb7185', 'rosé': '#e6b8a2',
  'roxo': '#8b5cf6', 'roxo translucido': '#a78bfa', 'rubi translucido': '#be123c',
  'tifanny translucido': '#5eead4', 'transparente': '#dbeafe',
  'verde': '#22c55e', 'verde bandeira': '#15803d', 'verde garrafa translucido': '#166534',
  'verde neon': '#4ade80', 'vermelho': '#dc2626', 'vermelho opaco': '#b91c1c',
  'fosco natural': '#e5e7eb',
};

export function corDe(opcao, padrao = '#cbd5e1') {
  if (!opcao) return padrao;
  if (opcao.hex) return opcao.hex;
  const chave = String(opcao.name || '').toLowerCase().trim();
  return POR_NOME[chave] || padrao;
}

/** Quase transparente? Então o copo é vidro, e vidro deixa o fundo passar. */
const ehVidro = opcao =>
  /transparente|cristal/i.test(String(opcao?.name || ''));

// ── A FOTO QUE COMBINA COM A COR ESCOLHIDA ───────────────────
//
// Pintura não tem foto: `cor_base` é tinta aplicada sobre a peça
// transparente, e não existe foto de cada combinação. Mas existe foto da
// peça naquela COR — o Tradicional Verde é um produto de verdade, com
// foto de verdade — e é ela que chega mais perto do que o cliente vai
// receber. Escolheu Verde no Degradê, aparece a peça verde.
//
// Não é a peça exata: o degradê verde não é o verde chapado. É a mesma
// escolha que a vitrine já faz nos cards (cada acabamento aparece numa
// cor), e é infinitamente mais perto do que a peça transparente parada
// enquanto o cliente troca de cor achando que a tela travou.
//
// O casamento é por NOME, sem acento e sem caixa, e o quase-igual conta:
// a tinta "Verde" acha a peça "Verde Neon" quando não existe "Verde"
// exato. Sem isso, metade das tintas não teria par e a foto ficaria
// parada — que é justamente o problema.
const semAcento = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function fotoDaCor(opcao, produtos) {
  const alvo = semAcento(opcao?.name);
  if (!alvo || !Array.isArray(produtos) || !produtos.length) return null;

  const exata = produtos.find(p => p.imagem && semAcento(p.name) === alvo);
  if (exata) return { url: exata.imagem, peca: exata.name, exata: true };

  // "Verde" casa com "Verde Neon"; "Rosa" casa com "Rosa Bebe". A
  // primeira palavra é o que o olho reconhece como a cor.
  const raiz = alvo.split(' ')[0];
  const perto = produtos.find(p => p.imagem && semAcento(p.name).split(' ')[0] === raiz);
  return perto ? { url: perto.imagem, peca: perto.name, exata: false } : null;
}

/**
 * A cor que manda na foto, na ordem em que ela importa.
 *
 * `cor_produto` é a peça de verdade e ganha de tudo. Depois vem a tinta
 * que cobre a maior área — a base —, e por último as que cobrem pouco.
 * A cor da BOCA nunca entra: ela é Gelo ou Transparente, e trocaria a
 * peça inteira por causa de um detalhe de dois centímetros.
 */
const ORDEM_DA_FOTO = ['cor_produto', 'cor_base', 'cor_topo', 'cor_jateado', 'cor_meio'];

// ── A JANELA DA ARTE SOBRE A FOTO ────────────────────────────
//
// Em fração da foto, porque as fotos do cadastro são todas do mesmo
// jeito: a peça inteira, centralizada, ocupando a altura toda.
//
// `cx` não é 0,5 em todas. Na caneca a alça entra no enquadramento e
// empurra o corpo para o lado — o centro da FOTO não é o centro do
// CORPO, e a arte impressa vai no corpo. Os números saíram da mesma
// medição de silhueta que gerou os desenhos.
const JANELA_ARTE = {
  'long-drink': { cx: 0.50,  largura: 0.62, topo: 0.30, altura: 0.44 },
  twister:      { cx: 0.50,  largura: 0.56, topo: 0.30, altura: 0.42 },
  canecas:      { cx: 0.615, largura: 0.40, topo: 0.32, altura: 0.38 },
  tacas:        { cx: 0.50,  largura: 0.34, topo: 0.10, altura: 0.22 },
};
const JANELA_PADRAO = JANELA_ARTE['long-drink'];

// Os campos cuja cor a foto NÃO consegue mostrar: são serviço aplicado
// sobre a peça, não a peça. Viram selo nomeado ao lado da foto.
const ROTULO_ACABAMENTO = {
  cor_base: 'Base', cor_meio: 'Meio', cor_topo: 'Topo', cor_boca: 'Boca',
  cor_interna: 'Interna', cor_borda: 'Borda', cor_jateado: 'Jateado',
};

// ── OS FORMATOS ──────────────────────────────────────────────
//
// Todos desenham entre y=30 (a boca) e y=246 (o chão), variando só a
// LARGURA — que é onde está a diferença entre uma taça e uma caneca. A
// largura do viewBox muda com a peça, e o componente calcula a largura
// em pixels a partir dela: assim o long drink não fica esticado para
// caber na moldura de uma caneca.
//
// `arte` é a janela onde a arte do cliente entra, em cada peça no lugar
// onde a impressão realmente sai: no corpo do copo, no corpo da caneca
// (fugindo da alça) e na bojo da taça.

const FORMATOS = {
  // 0,36 de largura por altura: o mais magro da casa, e quase reto.
  'long-drink': {
    vb: 110,
    corpo: 'M15.5 30 L20 236 Q20.4 246 30 246 L80 246 Q89.6 246 90 236 L94.5 30 Z',
    boca: { cx: 55, cy: 30, rx: 39.5, ry: 8 },
    faixaBorda: 'M15.5 30 L16.6 54 L93.4 54 L94.5 30 Z',
    arte: { cx: 55, topo: 78, largura: 54, alturaMax: 140 },
    sombra: { cx: 55, cy: 252, rx: 40, ry: 6.5 },
  },

  // 0,54 no topo contra 0,39 embaixo: é a peça que mais afunila, e a
  // canelada em espiral é o que a faz ser reconhecida de longe.
  twister: {
    vb: 145,
    corpo: 'M13.5 30 L28 236 Q28.6 246 38 246 L107 246 Q116.4 246 117 236 L131.5 30 Z',
    boca: { cx: 72.5, cy: 30, rx: 59, ry: 11 },
    faixaBorda: 'M13.5 30 L15.2 54 L129.8 54 L131.5 30 Z',
    arte: { cx: 72.5, topo: 78, largura: 70, alturaMax: 138 },
    sombra: { cx: 72.5, cy: 252, rx: 52, ry: 8 },
    Extras: ({ id }) => (
      <g clipPath={`url(#${id}-recorte)`} opacity="0.5">
        {Array.from({ length: 14 }, (_, i) => (
          <path key={i} d={`M${-40 + i * 17} 246 L${20 + i * 17} 30`}
            stroke="rgba(255,255,255,0.55)" strokeWidth="2.4" fill="none" />
        ))}
        {Array.from({ length: 14 }, (_, i) => (
          <path key={`b${i}`} d={`M${20 + i * 17} 246 L${-40 + i * 17} 30`}
            stroke="rgba(0,0,0,0.14)" strokeWidth="2.4" fill="none" />
        ))}
      </g>
    ),
  },

  // O corpo é praticamente reto (0,58 do começo ao fim) e a alça come
  // mais um terço da largura. É por isso que o viewBox dela é o dobro do
  // long drink: caneca é peça larga, e fingir que não é foi o que fez o
  // cliente achar que estava vendo outro produto.
  canecas: {
    vb: 195,
    corpo: 'M56.5 30 L57.5 236 Q58 246 67 246 L174 246 Q183 246 183.5 236 L184.5 30 Z',
    boca: { cx: 120.5, cy: 30, rx: 64, ry: 11 },
    faixaBorda: 'M56.5 30 L57 54 L184 54 L184.5 30 Z',
    arte: { cx: 120.5, topo: 80, largura: 76, alturaMax: 136 },
    sombra: { cx: 116, cy: 252, rx: 72, ry: 8 },
    // A alça, à esquerda como na foto do cadastro, e traçada em vez de
    // preenchida: uma curva com espessura é a alça inteira, e acompanha
    // a cor do copo sem precisar de um segundo caminho por dentro.
    Extras: ({ corBase, vidro }) => (
      <g>
        <path d="M57 72 C20 77 11 96 11 118 C11 142 22 161 57 166"
          fill="none" stroke={corBase} strokeOpacity={vidro ? 0.4 : 0.95}
          strokeWidth="15" strokeLinecap="round" />
        <path d="M57 72 C20 77 11 96 11 118 C11 142 22 161 57 166"
          fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="15.8"
          strokeLinecap="round" strokeOpacity="0.35" style={{ mixBlendMode: 'overlay' }} />
      </g>
    ),
  },

  // Bojo, haste e base. As três taças do catálogo (vinho, chandon e
  // cerveja) dividem a mesma família e a mesma silhueta aqui: o que muda
  // entre elas é a curva do bojo, que nesta escala não se lê.
  tacas: {
    vb: 110,
    corpo: 'M12 30 C10 74 18 116 40 138 Q55 149 70 138 C92 116 100 74 98 30 Z',
    boca: { cx: 55, cy: 30, rx: 43, ry: 8 },
    faixaBorda: 'M12 30 L12.9 52 L97.1 52 L98 30 Z',
    arte: { cx: 55, topo: 58, largura: 46, alturaMax: 74 },
    sombra: { cx: 55, cy: 250, rx: 36, ry: 6 },
    Extras: ({ corBase, vidro }) => (
      <g fill={corBase} fillOpacity={vidro ? 0.42 : 0.92}>
        <rect x="50.5" y="140" width="9" height="94" rx="2" />
        <path d="M20.5 246 Q20.5 236 34 232 L76 232 Q89.5 236 89.5 246 Z" />
        <ellipse cx="55" cy="245" rx="34.5" ry="5" />
        <rect x="50.5" y="140" width="3.4" height="94" fill="rgba(255,255,255,0.35)" />
      </g>
    ),
  },
};

// Família nova entra no catálogo antes de alguém desenhar a silhueta
// dela. Até lá cai no long drink, que é o formato mais neutro — e nunca
// numa tela em branco.
const PADRAO = FORMATOS['long-drink'];

/**
 * O PLANO B: a peça desenhada.
 *
 * Só entra quando o modelo não tem foto no cadastro. As silhuetas por
 * família continuam valendo aqui — long drink magro, twister canelado,
 * caneca com alça, taça com haste — com as proporções medidas das fotos
 * reais. É melhor que um quadrado vazio e pior que a foto, e é por isso
 * que é o plano B.
 */
function Desenho({
  escolha = {}, familia = null, arte = null, altura = 300, gabarito = null, espelhar = false,
}) {
  const { acabamento, campos = {} } = escolha;
  const requer = acabamento?.requer || {};

  const base = campos.cor_base || campos.cor_produto || null;
  const topo = campos.cor_topo || null;
  const borda = campos.cor_borda || null;
  const jateado = campos.cor_jateado || null;

  const corBase = corDe(base, '#93a4c8');
  const corTopo = corDe(topo, corBase);
  const corBorda = corDe(borda, '#d4af37');

  const id = `copo-${familia || 'padrao'}`;
  const vidro = ehVidro(base) && !topo;

  const F = FORMATOS[familia] || PADRAO;
  const { Extras } = F;

  // A área de impressão, na proporção do gabarito quando ele existe.
  // Sem gabarito cadastrado fica a altura padrão da peça — melhor não
  // mostrar área de arte nenhuma que mostrar uma inventada.
  const larguraArte = F.arte.largura;
  const alturaArte = gabarito?.altura_mm && gabarito?.largura_mm
    ? Math.min(F.arte.alturaMax, larguraArte * (Number(gabarito.altura_mm) / Number(gabarito.largura_mm)))
    : Math.min(F.arte.alturaMax, larguraArte * 1.9);

  return (
    <figure className="flex flex-col items-center m-0">
      <svg viewBox={`0 0 ${F.vb} 268`} height={altura} width={altura * F.vb / 268} role="img"
        aria-label="Prévia da peça"
        style={{ transform: espelhar ? 'scaleX(-1)' : undefined }}>
        <defs>
          <linearGradient id={`${id}-corpo`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={corBase} stopOpacity={vidro ? 0.34 : 0.98} />
            <stop offset={topo ? '58%' : '100%'} stopColor={corBase} stopOpacity={vidro ? 0.28 : 0.94} />
            {topo && <stop offset="100%" stopColor={corTopo} stopOpacity={ehVidro(topo) ? 0.22 : 0.95} />}
          </linearGradient>

          <linearGradient id={`${id}-brilho`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.30" />
            <stop offset="26%" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="72%" stopColor="#fff" stopOpacity="0" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.16" />
          </linearGradient>

          <linearGradient id={`${id}-borda`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={corBorda} stopOpacity="0.72" />
            <stop offset="42%" stopColor="#fff" stopOpacity="0.92" />
            <stop offset="100%" stopColor={corBorda} stopOpacity="0.85" />
          </linearGradient>

          <clipPath id={`${id}-recorte`}><path d={F.corpo} /></clipPath>
        </defs>

        {/* a sombra no chão é o que tira a peça de "adesivo colado na tela" */}
        <ellipse {...F.sombra} fill="#000" opacity="0.42" />

        {/* A alça da caneca e a haste da taça vêm ANTES do corpo: assim o
            corpo passa por cima da emenda e ela não aparece. */}
        {Extras && <Extras id={id} corBase={corBase} vidro={vidro} />}

        <path d={F.corpo} fill={`url(#${id}-corpo)`} />

        {requer.jateamento && (
          <path d={F.corpo} fill={corDe(jateado, '#e5e7eb')} opacity="0.42" />
        )}

        <path d={F.corpo} fill={`url(#${id}-brilho)`} clipPath={`url(#${id}-recorte)`} />
        <path d={F.corpo} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="1" />

        {/* a boca: elipse aberta, e o anel metálico por cima quando o
            acabamento pede borda */}
        <ellipse {...F.boca} fill="rgba(255,255,255,0.13)"
          stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
        {requer.borda && (
          <>
            <path d={F.faixaBorda} fill={`url(#${id}-borda)`} opacity="0.9" />
            <ellipse {...F.boca} fill="none" stroke={corBorda} strokeWidth="2.4" />
          </>
        )}

        {/* A ARTE. Vem como SVG e é embutida por dangerouslySetInnerHTML —
            o vetor é da Lyon, cadastrado pelo Administrativo, e os textos
            que o cliente digita entram escapados na hora de montar (ver
            aplicarValores em CriarArte). */}
        {arte && (
          <g clipPath={`url(#${id}-recorte)`}>
            <foreignObject x={F.arte.cx - larguraArte / 2} y={F.arte.topo}
              width={larguraArte} height={alturaArte}>
              <div xmlns="http://www.w3.org/1999/xhtml"
                style={{ width: '100%', height: '100%', color: '#111318',
                         transform: espelhar ? 'scaleX(-1)' : undefined }}
                dangerouslySetInnerHTML={{ __html: arte }} />
            </foreignObject>
          </g>
        )}
      </svg>
    </figure>
  );
}


// ── A FOTO SEM O FUNDO ───────────────────────────────────────
//
// As fotos do cadastro vêm do estúdio: peça centralizada sobre papel
// branco. Sobre o azul-noite do catálogo aquele branco vira um cartão
// retangular atrás do copo — a peça deixa de flutuar e passa a parecer
// um adesivo colado num papel.
//
// Recortar 97 fotos à mão não é resposta. Esta é: o navegador abre a
// foto num canvas e apaga o fundo antes de mostrar. O apagador entra
// PELAS BORDAS e vai andando de pixel em pixel enquanto encontra a cor
// do papel — é assim que o branco de dentro do copo, o brilho da alça e
// a etiqueta clara continuam lá: eles não encostam na borda, e o
// apagador nunca chega neles.
//
// A borda do recorte não é seca. Quanto mais o pixel se afasta da cor do
// papel, mais opaco ele fica — é o que impede o serrilhado branco em
// volta da peça preta.
//
// TRÊS PORTAS DE SAÍDA, todas devolvendo a foto original intacta:
// PNG que já vem recortado (canto transparente), foto de outro domínio
// que o canvas se recusa a ler, e recorte que comeu quase tudo — se
// sobrou menos de um décimo da imagem, quem estava errado era o
// apagador, não a foto.

/** Duas fotos iguais em Frente e Verso: recorta uma vez, serve as duas. */
const CACHE_RECORTE = new Map();

/** Distância entre duas cores, sem raiz quadrada — só serve para comparar. */
const distancia2 = (r, g, b, fr, fg, fb) =>
  (r - fr) * (r - fr) + (g - fg) * (g - fg) + (b - fb) * (b - fb);

// Igual ao papel: some. Longe do papel: fica. No meio: meio a meio, que é
// o que faz a sombra suave do estúdio virar transparência suave.
const PERTO = 34 * 34 * 3;   // ainda é o papel
const LONGE = 96 * 96 * 3;   // já é a peça

function recortarFundo(src) {
  if (CACHE_RECORTE.has(src)) return CACHE_RECORTE.get(src);

  const promessa = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        const { naturalWidth: L, naturalHeight: A } = img;
        if (!L || !A) return resolve(null);

        const tela = document.createElement('canvas');
        tela.width = L; tela.height = A;
        const ctx = tela.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);

        const dados = ctx.getImageData(0, 0, L, A);
        const px = dados.data;

        // Canto já transparente? O PNG veio recortado do cadastro —
        // mexer nele só teria como resultado estragá-lo.
        if (px[3] < 250) return resolve(null);

        const fr = px[0], fg = px[1], fb = px[2];

        // O apagador anda pela imagem a partir das quatro bordas. Fila
        // em Int32Array porque um array comum de meio milhão de índices
        // é lento no celular, que é onde o cliente escolhe o copo.
        const visto = new Uint8Array(L * A);
        const fila = new Int32Array(L * A);
        let inicio = 0, fim = 0;
        const enfileirar = i => { if (!visto[i]) { visto[i] = 1; fila[fim++] = i; } };

        for (let x = 0; x < L; x++) { enfileirar(x); enfileirar((A - 1) * L + x); }
        for (let y = 0; y < A; y++) { enfileirar(y * L); enfileirar(y * L + L - 1); }

        let apagados = 0;
        while (inicio < fim) {
          const i = fila[inicio++];
          const p = i * 4;
          const d = distancia2(px[p], px[p + 1], px[p + 2], fr, fg, fb);
          if (d >= LONGE) continue;            // chegou na peça: para aqui

          if (d <= PERTO) { px[p + 3] = 0; }   // é papel: some
          else {
            // A franja: o pixel vira meio transparente na mesma medida em
            // que se afasta do papel.
            px[p + 3] = Math.round(255 * (d - PERTO) / (LONGE - PERTO));
            continue;                          // franja não propaga
          }
          apagados++;

          const x = i % L, y = (i - x) / L;
          if (x > 0) enfileirar(i - 1);
          if (x < L - 1) enfileirar(i + 1);
          if (y > 0) enfileirar(i - L);
          if (y < A - 1) enfileirar(i + L);
        }

        // Comeu a imagem inteira? Então a foto não era peça sobre papel —
        // devolve o original e ninguém fica sabendo.
        if (apagados > L * A * 0.9) return resolve(null);

        ctx.putImageData(dados, 0, 0);
        resolve(tela.toDataURL('image/png'));
      } catch {
        resolve(null); // canvas sujo por CORS: a foto original serve
      }
    };
    img.src = src;
  });

  CACHE_RECORTE.set(src, promessa);
  return promessa;
}

/**
 * A foto da peça, recortada quando dá. Enquanto o recorte não fica
 * pronto mostra a foto original: prévia que pisca em branco é pior que
 * meio segundo com o fundo do estúdio.
 */
function FotoDaPeca({ src, espelhar }) {
  const [recortada, setRecortada] = useState(null);

  useEffect(() => {
    let vivo = true;
    setRecortada(null);
    recortarFundo(src).then(url => { if (vivo && url) setRecortada(url); });
    return () => { vivo = false; };
  }, [src]);

  return (
    <img src={recortada || src} alt="Foto da peça escolhida" draggable={false}
      className="absolute inset-0 w-full h-full object-contain"
      style={{ transform: espelhar ? 'scaleX(-1)' : undefined }} />
  );
}


/**
 * A PRÉVIA.
 *
 * Foto do cadastro quando existe — é o que o cliente precisa ver para
 * decidir. Desenho só quando não existe foto.
 *
 * @param escolha     { acabamento, campos: { chave -> opção de cor } }
 * @param familia     slug da família — posiciona a arte e escolhe a silhueta
 * @param fotoModelo  a foto de referência do modelo, quando nenhuma cor foi escolhida
 * @param arte        SVG da arte já com os textos do cliente, ou null
 * @param face        'frente' | 'verso' — só muda o rótulo e a arte usada
 */
export default function CopoPreview({
  escolha = {}, familia = null, fotoModelo = null, fotosPorCor = null,
  arte = null, face = 'frente', altura = 300, gabarito = null,
}) {
  const { campos = {} } = escolha;
  // O VERSO É A MESMA PEÇA VISTA POR TRÁS. A foto do cadastro é uma só,
  // da frente; espelhá-la é o que põe a alça da caneca do outro lado,
  // que é onde ela está quando se olha o copo por trás. A arte NÃO
  // espelha junto — nome de casal ao contrário não é verso, é erro.
  const espelhar = face === 'verso';

  // A FOTO DA COR ESCOLHIDA, E A VERDADE SOBRE ELA.
  //
  // Há duas situações muito diferentes aqui, e a versão anterior tratava
  // as duas igual — que é como o cliente escolhia VERMELHO e via um copo
  // transparente sem nada avisando.
  //
  //   cor_produto  → a peça É aquela. Foto da peça, ponto.
  //   pintura      → a peça é transparente e recebe tinta. Não existe
  //                  foto disso, então a foto é sempre um SUBSTITUTO: a
  //                  peça de fábrica na cor mais parecida.
  //
  // E há um terceiro caso: tinta que não tem peça parecida nenhuma. São
  // duas das doze — Vermelho e Gelo — porque a fábrica não faz copo
  // vermelho, faz PINTURA vermelha. Aí a foto cai na transparente, que é
  // a peça de verdade antes de pintar, e a tela precisa DIZER isso.
  const decidiu = ORDEM_DA_FOTO
    .map(chave => {
      const opcao = campos[chave];
      if (!opcao) return null;
      if (opcao.imagem) return { chave, opcao, achado: { url: opcao.imagem, exata: true } };
      const achado = fotoDaCor(opcao, fotosPorCor);
      return achado ? { chave, opcao, achado } : { chave, opcao, achado: null };
    })
    .find(Boolean);

  const foto = decidiu?.achado?.url || fotoModelo || null;
  const pintado = decidiu && decidiu.chave !== 'cor_produto';

  // O aviso só existe quando a foto não é a peça. Peça de verdade não
  // precisa de nota de rodapé.
  const ressalva = !pintado ? null
    : decidiu.achado
      ? `Foto ilustrativa — a pintura ${decidiu.opcao.name} é aplicada sobre a peça.`
      : `Ainda não temos foto na cor ${decidiu.opcao.name}. A peça aparece transparente, que é como ela entra na pintura.`;

  // As cores que a foto não consegue mostrar, nomeadas. Pintura, borda e
  // jateado são serviço sobre a peça: a foto é da peça, e o acabamento
  // vira selo. Some sozinho no acabamento liso, que não tem nenhum.
  const aplicados = Object.entries(ROTULO_ACABAMENTO)
    .map(([chave, rotulo]) => (campos[chave] ? { rotulo, opcao: campos[chave] } : null))
    .filter(Boolean);

  // A prévia mora num palco BRANCO (ver Configurador): letra clara aqui
  // seria letra invisível.
  const rodape = (
    <figcaption className="text-[10.5px] tracking-[0.18em] uppercase mt-1.5"
      style={{ color: '#64748b' }}>
      {face === 'verso' ? 'Verso' : 'Frente'}
    </figcaption>
  );

  if (!foto) {
    return (
      <figure className="flex flex-col items-center m-0">
        <Desenho escolha={escolha} familia={familia} arte={arte}
          altura={altura} gabarito={gabarito} espelhar={espelhar} />
        {rodape}
        <Aplicados itens={aplicados} />
      </figure>
    );
  }

  const janela = JANELA_ARTE[familia] || JANELA_PADRAO;

  return (
    <figure className="flex flex-col items-center m-0">
      {/* SEM CARTÃO POR FOTO. O branco agora é o palco inteiro da prévia,
          desenhado uma vez lá no Configurador e cobrindo frente e verso.
          Um retângulo por foto emoldurava cada copo e os separava, quando
          são as duas faces da MESMA peça.
          O recorte continua valendo: foto com papel amarelado ou cinza
          entra no palco sem uma mancha em volta. */}
      <div className="relative" style={{ height: altura, width: altura * 0.78 }}>
        <FotoDaPeca src={foto} espelhar={espelhar} />

        {/* A ARTE, na janela onde a impressão realmente sai. Vem como SVG
            e é embutida por dangerouslySetInnerHTML — o vetor é da Lyon,
            cadastrado pelo Administrativo, e os textos que o cliente
            digita entram escapados na hora de montar (ver aplicarValores
            em CriarArte). */}
        {arte && (
          <div className="absolute" style={{
            // A janela acompanha o espelho: na caneca o corpo trocou de
            // lado junto com a alça, e é no corpo que a arte é impressa.
            left: `${((espelhar ? 1 - janela.cx : janela.cx) - janela.largura / 2) * 100}%`,
            top: `${janela.topo * 100}%`,
            width: `${janela.largura * 100}%`,
            height: `${janela.altura * 100}%`,
            color: '#111318',
          }} dangerouslySetInnerHTML={{ __html: arte }} />
        )}
      </div>
      {rodape}
      <Aplicados itens={aplicados} />
      {ressalva && (
        <p className="text-[10.5px] leading-snug text-center mt-1.5 max-w-[230px]"
          style={{ color: '#94a3b8' }}>{ressalva}</p>
      )}
    </figure>
  );
}

/** Os acabamentos escolhidos, nomeados — o que a foto não mostra. */
function Aplicados({ itens }) {
  if (!itens.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-1.5 mt-2 max-w-[220px]">
      {itens.map(({ rotulo, opcao }) => (
        <span key={rotulo} className="inline-flex items-center gap-1 rounded-full pl-1 pr-2 py-0.5 text-[10px]"
          style={{ background: 'rgba(15,23,42,0.06)', color: '#334155' }}
          title={`${rotulo}: ${opcao.name}`}>
          <span className="w-3 h-3 rounded-full shrink-0"
            style={{ background: corDe(opcao), border: '1px solid rgba(15,23,42,0.25)' }} />
          {rotulo}: {opcao.name}
        </span>
      ))}
    </div>
  );
}
