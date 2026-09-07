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
import { Loader2 } from 'lucide-react';

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

/**
  * A COR DE UMA OPCAO — pelo hex do cadastro, ou pelo nome.
  *
  * Boa parte das cores foi cadastrada SEM hex: sao linhas com nome e
  * mais nada. Por isso o mapa por nome existe — e por isso a busca
  * ignora acento: o cadastro tem "AMARELO CANARIO" e "AMARELO
  * CANÁRIO", e um mapa que so responde a uma das grafias deixa metade
  * das cores cinza sem ninguem entender por que.
  */
export function corDe(opcao, padrao = '#cbd5e1') {
  if (!opcao) return padrao;
  if (opcao.hex) return opcao.hex;
  const semAcento = t => String(t || '').normalize('NFD')
    .replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const chave = String(opcao.name || '').toLowerCase().trim();
  if (POR_NOME[chave]) return POR_NOME[chave];
  const alvo = semAcento(chave);
  const achado = Object.keys(POR_NOME).find(k => semAcento(k) === alvo);
  return achado ? POR_NOME[achado] : padrao;
}

/** Quase transparente? Então o copo é vidro, e vidro deixa o fundo passar. */
const ehVidro = opcao =>
  /transparente|cristal/i.test(String(opcao?.name || ''));

// ── AS FAIXAS DE COR DO CORPO ────────────────────────────────
//
// UM COPO DE DUAS CORES TEM DUAS PARTES, e é assim que a dona da
// fábrica descreve a peça: «a de baixo é a primeira cor, a de cima é a
// segunda». Com três, a do meio entra entre elas. A prévia não mostrava
// nada disso — o degradê ia da base ao topo por igual e a cor do MEIO
// era simplesmente ignorada: o Tricolor aparecia com duas cores.
//
// A ORDEM É DE BAIXO PARA CIMA, sempre. Cor 1 é o fundo do copo, a
// última é a boca. É a ordem em que a peça é montada e a ordem em que
// os campos aparecem na tela — trocá-la aqui faria a prévia contradizer
// os dois.
//
// SEM CAMPO DE COR NA PEÇA, QUEM PINTA É A IMPRESSÃO. «Serigrafia 2
// cores» é o jeito que a Lyon vende o copo de duas cores: a cliente
// escolhe as duas e espera ver o copo nelas. Enquanto o acabamento não
// pedir as cores da peça, são essas que desenham as faixas.
export function faixasDoCorpo(campos = {}, coresArte = []) {
  const daPeca = [campos.cor_base, campos.cor_meio, campos.cor_topo].filter(Boolean);
  if (daPeca.length >= 2) return daPeca;
  if (coresArte.length >= 2) return coresArte;
  return [];
}

/** Uma faixa e outra sao a mesma cor? Compara por id, e por nome quando falta. */
const mesmaCor = (a, b) => !!a && !!b && ((a.id && a.id === b.id) || a.name === b.name);

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
  // As cores da TINTA escolhidas no tipo de impressão — hexadecimais,
  // na ordem em que a cliente escolheu.
  coresArte = [],
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

  // As faixas do corpo, de baixo para cima. Duas ou mais viram bandas
  // de verdade; uma só continua sendo o corpo inteiro de uma cor.
  const faixas = faixasDoCorpo(campos, coresArte);

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
    <figure className="flex flex-col items-center m-0 min-w-0 max-w-full">
      {/* `altura` é o tamanho DESEJADO, não o obrigatório: em tela
          estreita a peça encolhe em vez de empurrar a página para fora.
          Ver a nota do mesmo assunto na prévia com foto, abaixo. */}
      <svg viewBox={`0 0 ${F.vb} 268`} height={altura} width={altura * F.vb / 268} role="img"
        aria-label="Prévia da peça"
        style={{ maxWidth: '100%', height: 'auto', transform: espelhar ? 'scaleX(-1)' : undefined }}>
        <defs>
          {/* DUAS PARADAS POR FAIXA — é o que faz a troca de cor ser
              uma LINHA e não um esfumado. Bicolor e Tricolor são peças
              de partes coladas: a emenda é visível na peça de verdade,
              e um degradê suave aqui mostraria um produto que a fábrica
              não faz. */}
          <linearGradient id={`${id}-corpo`} x1="0" y1="1" x2="0" y2="0">
            {faixas.length >= 2 ? faixas.map(f => corDe(f)).flatMap((hex, i) => ([
              <stop key={`${i}a`} offset={`${(i / faixas.length) * 100}%`}
                stopColor={hex} stopOpacity="0.96" />,
              <stop key={`${i}b`} offset={`${((i + 1) / faixas.length) * 100}%`}
                stopColor={hex} stopOpacity="0.96" />,
            ])) : (
              <>
                <stop offset="0%" stopColor={corBase} stopOpacity={vidro ? 0.34 : 0.98} />
                <stop offset={topo ? '58%' : '100%'} stopColor={corBase} stopOpacity={vidro ? 0.28 : 0.94} />
                {topo && <stop offset="100%" stopColor={corTopo} stopOpacity={ehVidro(topo) ? 0.22 : 0.95} />}
              </>
            )}
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

/**
 * ONDE A PEÇA COMEÇA E ONDE ELA ACABA, lida do próprio recorte.
 *
 * Depois do apagador, o que sobrou opaco É a peça. A primeira linha com
 * pixel opaco é o aro; a última é o fundo do copo. É essa medida que
 * permite pintar a borda metalizada EM CIMA DO ARO de cada foto, em vez
 * de chutar uma porcentagem que acerta num modelo e erra na caneca.
 *
 * Devolve frações da altura (0 a 1) porque a foto é exibida em tamanhos
 * diferentes — fração sobrevive ao redimensionamento, pixel não.
 */
function geometriaDaPeca(px, L, A) {
  let topo = -1, base = -1, esq = L, dir = -1;
  for (let y = 0; y < A; y++) {
    let temPeca = false;
    for (let x = 0; x < L; x++) {
      if (px[(y * L + x) * 4 + 3] >= 128) {
        temPeca = true;
        if (x < esq) esq = x;
        if (x > dir) dir = x;
      }
    }
    if (temPeca) { if (topo < 0) topo = y; base = y; }
  }
  if (topo < 0) return null;
  // A LARGURA TAMBÉM. Ela não servia para a borda metalizada, que
  // atravessa a peça de lado a lado, mas serve para encaixar a foto de
  // uma cor sobre a de outra: sem ela as duas casam pela borda da
  // imagem, e o copo de cima sai deslocado do de baixo.
  return { topo: topo / A, base: (base + 1) / A, esq: esq / L, dir: (dir + 1) / L };
}

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
        // mexer nele só teria como resultado estragá-lo. Mas a
        // geometria continua servindo: é dela que sai onde fica o aro.
        if (px[3] < 250) return resolve({ url: null, geo: geometriaDaPeca(px, L, A) });

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
        resolve({ url: tela.toDataURL('image/png'), geo: geometriaDaPeca(px, L, A) });
      } catch {
        resolve(null); // canvas sujo por CORS: a foto original serve
      }
    };
    img.src = src;
  });

  CACHE_RECORTE.set(src, promessa);
  return promessa;
}

// ════════════════════════════════════════════════════════════
// A BORDA METALIZADA, PINTADA NO ARO.
//
// O cabeçalho deste arquivo diz que acabamento não se desenha sobre a
// foto, e continua valendo para pintura e jateado: são serviço sobre a
// peça inteira, e fingir isso numa foto seria inventar um produto. A
// BORDA É OUTRA COISA. Ela ocupa uma faixa estreita e conhecida — o aro
// —, e dela existe A FOTO DE VERDADE, cadastrada em Cadastros › Bordas.
// Não é desenho: é a textura real, no lugar real.
//
// E É O LUGAR REAL PORQUE NINGUÉM CHUTOU. A faixa não é uma
// porcentagem escolhida a olho: o aro sai da geometria que o recorte de
// fundo já mediu nesta mesma foto. Porcentagem fixa acertaria no long
// drink e erraria na caneca, que tem alça e enquadramento diferentes.
//
// `source-atop` É O QUE FAZ A BORDA SEGUIR A PEÇA. A textura só pinta
// onde já existe pixel opaco, então ela para exatamente na silhueta —
// inclusive na elipse do aro — sem nenhum recorte escrito à mão.
// ════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════
// AS FAIXAS DE COR, PINTADAS NA FOTO.
//
// CADA FAIXA É A FOTO DAQUELA COR, e não uma aproximação dela. Cor 2 =
// "Roxo Translúcido" é um produto do cadastro, fotografado no estúdio;
// pintar a metade de cima com um lilás de tabela devolve uma cor que
// não é a do catálogo — e foi exatamente a reclamação: "a segunda cor
// não está puxando as cores corretas". Agora a metade de cima é
// recortada da FOTO do Roxo Translúcido e colada por cima da foto da
// Cor 1. As duas são o mesmo modelo, no mesmo estúdio, no mesmo
// enquadramento: o resultado é o copo bicolor de verdade, com o brilho
// e o volume de cada cor.
//
// A PRIMEIRA FAIXA NÃO SE PINTA. A foto de base JÁ É a da Cor 1 (ver
// `escolhaVisual` no configurador) — repintá-la por cima de si mesma só
// tira nitidez.
//
// AS DUAS FOTOS SE ALINHAM PELA PEÇA, não pela borda da imagem. Cada
// foto tem seu enquadramento, e o recorte de fundo já mediu em qual
// altura a peça começa e acaba nas duas; a de cima é escalada até a
// peça dela ocupar a mesma faixa de pixels da peça de baixo. Encaixar
// pela imagem inteira deixaria o aro de uma no meio do corpo da outra.
//
// `source-atop` É O QUE FAZ A COR PARAR NA SILHUETA, sem recorte
// escrito à mão — o mesmo mecanismo da borda metalizada.
//
// SEM FOTO DA COR, CAI NA TINTA CHAPADA translúcida, que é o que havia
// antes: pior que a foto, melhor que não mostrar a segunda cor.
// ════════════════════════════════════════════════════════════

const CACHE_FAIXAS = new Map();

/** Quanto da tinta chapada deixa a foto aparecer por baixo. */
const FORCA_DA_FAIXA = 0.82;

/**
 * Onde a peça de uma foto tem que cair para casar com a peça da outra.
 *
 * ESCALA PARA COBRIR, e não para caber. As fotos do estúdio não são
 * milimetricamente iguais — um copo saiu um fio mais estreito que o
 * outro —, e uma peça que "cabe" deixa a de baixo aparecendo numa
 * franja de um ou dois pixels em volta, que lê como defeito na peça.
 * Cobrindo, ela sobra; e o que sobra é cortado pelo `source-atop`, que
 * só pinta onde a peça de baixo já é opaca. Sobrar não custa nada,
 * faltar custa a prévia inteira.
 *
 * E o encaixe é pelo CENTRO DA PEÇA nos dois eixos, não pelo canto da
 * imagem: é a peça que tem que coincidir com a peça.
 */
function encaixe(imgB, geoB, L, A, geoA) {
  const Bw = imgB.naturalWidth, Bh = imgB.naturalHeight;
  const altB = (geoB.base - geoB.topo) * Bh;
  const largB = (geoB.dir - geoB.esq) * Bw;
  if (!altB || !largB) return null;

  const alvoAlt = (geoA.base - geoA.topo) * A;
  const alvoLarg = (geoA.dir - geoA.esq) * L;
  // Um por cento a mais mata a franja que sobra do arredondamento.
  const escala = Math.max(alvoAlt / altB, alvoLarg / largB) * 1.01;

  const centroAx = (geoA.esq + geoA.dir) / 2 * L;
  const centroAy = (geoA.topo + geoA.base) / 2 * A;
  const centroBx = (geoB.esq + geoB.dir) / 2 * Bw * escala;
  const centroBy = (geoB.topo + geoB.base) / 2 * Bh * escala;

  return {
    x: centroAx - centroBx,
    y: centroAy - centroBy,
    larg: Bw * escala,
    alt: Bh * escala,
  };
}

/** A foto de uma cor, já sem o fundo do estúdio, pronta para colar. */
function pecaRecortada(url) {
  return recortarFundo(url).then(r => {
    if (!r || !r.geo || r.geo.esq === undefined) return null;
    return new Promise(resolve => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onerror = () => resolve(null);
      img.onload = () => resolve({ img, geo: r.geo });
      img.src = r.url || url;
    });
  }).catch(() => null);
}

/**
 * A foto da peça repartida nas cores escolhidas, de baixo para cima.
 *
 * Devolve `null` sempre que não der certo — sem geometria, menos de
 * duas cores, canvas sujo por CORS. Nunca lança: prévia sem faixa é
 * prévia; prévia quebrada é tela branca.
 */
function pintarFaixas(fonte, geo, faixas) {
  if (!fonte || !geo || !Array.isArray(faixas) || faixas.length < 2) {
    return Promise.resolve(null);
  }
  const chave = `${fonte.slice(-64)}|${faixas.map(f => f?.id || f?.name).join('>')}`;
  if (CACHE_FAIXAS.has(chave)) return CACHE_FAIXAS.get(chave);

  const promessa = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = async () => {
      try {
        const { naturalWidth: L, naturalHeight: A } = img;
        if (!L || !A) return resolve(null);

        const tela = document.createElement('canvas');
        tela.width = L; tela.height = A;
        const ctx = tela.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const topo = geo.topo * A;
        const altura = (geo.base - geo.topo) * A;
        const faixa = altura / faixas.length;

        // As fotos das cores de cima, buscadas de uma vez. A primeira
        // não entra: ela já é a foto de base.
        const pecas = await Promise.all(
          faixas.map((f, i) => (i === 0 || !f?.imagem) ? null : pecaRecortada(f.imagem)));

        for (let i = 1; i < faixas.length; i++) {
          // `i` conta de BAIXO para cima: a primeira cor é o fundo do
          // copo, a última é a boca.
          const y = topo + altura - (i + 1) * faixa;
          // Meio pixel de folga entre as faixas: sem isso o
          // arredondamento deixa uma linha da foto de baixo aparecendo
          // na emenda, que parece defeito na peça.
          const alturaDaFaixa = faixa + 1;

          ctx.save();
          ctx.beginPath();
          ctx.rect(0, y - 0.5, L, alturaDaFaixa);
          ctx.clip();
          ctx.globalCompositeOperation = 'source-atop';

          const peca = pecas[i];
          const enc = (peca && geo.esq !== undefined)
            ? encaixe(peca.img, peca.geo, L, A, geo) : null;
          if (enc) {
            ctx.drawImage(peca.img, enc.x, enc.y, enc.larg, enc.alt);
          } else {
            ctx.globalAlpha = FORCA_DA_FAIXA;
            ctx.fillStyle = corDe(faixas[i]);
            ctx.fillRect(0, y - 0.5, L, alturaDaFaixa);
          }
          ctx.restore();
        }

        resolve(tela.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.src = fonte;
  });

  CACHE_FAIXAS.set(chave, promessa);
  return promessa;
}

const CACHE_BORDA = new Map();

/** Quanto do copo a borda ocupa. Medida da faixa real das metalizadas. */
const FAIXA_DA_BORDA = 0.075;

/** A textura da borda, na altura da faixa e repetida ao longo dela. */
function texturaDaBorda(fotoUrl, altura) {
  return new Promise(resolve => {
    if (!fotoUrl) return resolve(null);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = () => {
      try {
        // Esticar uma foto quadrada numa faixa larga e baixa deforma o
        // desenho do mosaico. Escalar pela ALTURA e repetir na
        // horizontal mantém a proporção — é o mesmo que a borda faz na
        // peça, que é uma fita dando a volta.
        const L = Math.max(1, Math.round(img.naturalWidth * (altura / img.naturalHeight)));
        const t = document.createElement('canvas');
        t.width = L; t.height = Math.max(1, Math.round(altura));
        t.getContext('2d').drawImage(img, 0, 0, t.width, t.height);
        resolve(t);
      } catch { resolve(null); }
    };
    img.src = fotoUrl;
  });
}

/**
 * A foto da peça com a borda escolhida pintada no aro.
 *
 * Devolve `null` sempre que não der certo — sem geometria, sem foto,
 * canvas sujo. Nunca lança: a prévia sem borda é uma prévia; a prévia
 * quebrada é uma tela branca.
 */
function pintarBorda(fonte, geo, borda) {
  if (!fonte || !geo || !borda) return Promise.resolve(null);
  const chave = `${fonte.slice(-64)}|${borda.foto || borda.cor_hex || borda.nome}`;
  if (CACHE_BORDA.has(chave)) return CACHE_BORDA.get(chave);

  const promessa = new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onerror = () => resolve(null);
    img.onload = async () => {
      try {
        const { naturalWidth: L, naturalHeight: A } = img;
        if (!L || !A) return resolve(null);

        const tela = document.createElement('canvas');
        tela.width = L; tela.height = A;
        const ctx = tela.getContext('2d');
        ctx.drawImage(img, 0, 0);

        const y0 = geo.topo * A;
        const h = Math.max(3, (geo.base - geo.topo) * A * FAIXA_DA_BORDA);

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y0, L, h);
        ctx.clip();
        // Só pinta sobre o que já é peça: fora dela, nada acontece.
        ctx.globalCompositeOperation = 'source-atop';

        const textura = await texturaDaBorda(borda.foto, h);
        if (textura) {
          const padrao = ctx.createPattern(textura, 'repeat-x');
          if (padrao) {
            padrao.setTransform?.(new DOMMatrix().translate(0, y0));
            ctx.fillStyle = padrao;
          } else {
            ctx.fillStyle = borda.cor_hex || '#c0c6cf';
          }
        } else {
          // Borda ainda sem foto cadastrada: a cor aproximada já mostra
          // onde ela fica e que ela existe.
          ctx.fillStyle = borda.cor_hex || '#c0c6cf';
        }
        ctx.fillRect(0, y0, L, h);
        ctx.restore();

        resolve(tela.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.src = fonte;
  });

  CACHE_BORDA.set(chave, promessa);
  return promessa;
}

/**
 * A foto da peça, recortada quando dá — e com a borda escolhida pintada
 * no aro. Enquanto o trabalho não fica pronto mostra a foto original:
 * prévia que pisca em branco é pior que meio segundo com o fundo do
 * estúdio.
 */
function FotoDaPeca({ src, espelhar, borda = null, faixas = [] }) {
  const [pronta, setPronta] = useState(null);
  // TRABALHO INVISÍVEL PARECE TRAVAMENTO. Recortar o fundo e pintar o
  // aro são duas passadas de canvas sobre a foto inteira, e no celular
  // isso leva um tempo que a cliente sente. Sem aviso, ela vê a peça
  // antiga parada depois de já ter clicado na cor nova — e clica de
  // novo, o que troca duas vezes.
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setPronta(null);
    // O VÉU SÓ APARECE SE A ESPERA FOR SENTIDA. Foto já processada volta
    // do cache em milissegundos; piscar um "carregando" nesse caso faz a
    // tela tremer a cada clique — que é o oposto de tranquilizar.
    const aviso = setTimeout(() => { if (vivo) setOcupado(true); }, 120);
    recortarFundo(src)
      .then(async r => {
        if (!vivo) return;
        if (!r) return;
        // AS FAIXAS PRIMEIRO, A BORDA POR CIMA. A borda metalizada
        // ocupa o aro, que é o topo da última faixa: pintá-la antes
        // seria pintá-la e cobri-la em seguida.
        let atual = r.url || src;
        if (faixas.length >= 2) atual = (await pintarFaixas(atual, r.geo, faixas)) || atual;
        if (!vivo) return;
        if (borda) atual = (await pintarBorda(atual, r.geo, borda)) || atual;
        if (vivo) setPronta(atual === src ? (r.url || null) : atual);
      })
      .finally(() => { clearTimeout(aviso); if (vivo) setOcupado(false); });
    return () => { vivo = false; clearTimeout(aviso); };
  }, [src, borda?.foto, borda?.cor_hex, borda?.nome,
      faixas.map(f => f?.id || f?.name).join('>')]); // eslint-disable-line

  return (
    <>
      <img src={pronta || src} alt="Foto da peça escolhida" draggable={false}
        className="absolute inset-0 w-full h-full object-contain transition-opacity duration-200"
        style={{ transform: espelhar ? 'scaleX(-1)' : undefined, opacity: ocupado ? 0.35 : 1 }} />
      {ocupado && (
        // O palco da prévia é BRANCO (ver Configurador): véu claro e
        // letra escura, ou o aviso fica invisível justamente na tela em
        // que ele precisa aparecer.
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 pointer-events-none"
          style={{ background: 'rgba(255,255,255,0.55)' }}>
          <Loader2 size={20} className="animate-spin" style={{ color: '#7c3aed' }} />
          <span className="text-[10.5px] tracking-wide" style={{ color: '#64748b' }}>
            montando a prévia…
          </span>
        </span>
      )}
    </>
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
  // A borda metalizada escolhida no bloco de Adicionais: { foto,
  // cor_hex, nome }. Vem de fora porque quem sabe o que a cliente
  // marcou é o configurador, não a prévia.
  borda = null,
  // Canudo, tampa e o que mais a cliente marcar. Ao contrário da
  // borda, estes NÃO se pintam sobre o copo: são peças separadas, que
  // vêm na caixa junto. Desenhar um canudo dentro do copo seria
  // inventar um produto; mostrá-lo AO LADO é o que a caixa mostra.
  acessorios = [],
  // As cores da TINTA escolhidas no tipo de impressao. Passam direto
  // para o desenho: e la que a area de impressao e marcada com elas.
  coresArte = [],
}) {
  const { campos = {} } = escolha;
  // O VERSO É A MESMA PEÇA VISTA POR TRÁS. A foto do cadastro é uma só,
  // da frente; espelhá-la é o que põe a alça da caneca do outro lado,
  // que é onde ela está quando se olha o copo por trás. A arte NÃO
  // espelha junto — nome de casal ao contrário não é verso, é erro.
  // QUAL DAS DUAS FACES SAI ESPELHADA.
  //
  // Ja mudou de lado duas vezes, e as duas por quem olha a peca de
  // verdade: primeiro era o verso, depois a frente, e em 06/09/2026 o
  // Pablo pediu para inverter as duas de novo — a foto de catalogo da
  // Lyon tem a alca do lado oposto ao que estava saindo aqui.
  //
  // Este `===` e o interruptor inteiro: as duas imagens viram junto,
  // porque frente e verso sao a MESMA peca e so uma das duas pode estar
  // espelhada. Quem conhece a peca e a fabrica; a tela segue.
  const espelhar = face === 'verso';

  // As faixas de cor do corpo, de baixo para cima — ver `faixasDoCorpo`.
  const faixas = faixasDoCorpo(campos, coresArte);

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
  // A COR QUE É UMA PEÇA DE VERDADE NÃO PRECISA DE RESSALVA.
  // Desde que a paleta passou a ser a da categoria, «Cor 1 = Azul Bic»
  // é a peça Azul Bic — o mesmo produto, a mesma foto. Chamar isso de
  // "foto ilustrativa" põe dúvida onde não há nenhuma.
  const pintado = decidiu && decidiu.chave !== 'cor_produto' && !decidiu.opcao.produto_id;

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
      <figure className="flex flex-col items-center m-0 min-w-0 max-w-full">
        <Desenho escolha={escolha} familia={familia} arte={arte} coresArte={coresArte}
          altura={altura} gabarito={gabarito} espelhar={espelhar} />
        {rodape}
        <Acessorios itens={acessorios} />
        <Aplicados itens={aplicados} />
      </figure>
    );
  }

  const janela = JANELA_ARTE[familia] || JANELA_PADRAO;

  return (
    <figure className="flex flex-col items-center m-0 min-w-0 max-w-full">
      {/* SEM CARTÃO POR FOTO. O branco agora é o palco inteiro da prévia,
          desenhado uma vez lá no Configurador e cobrindo frente e verso.
          Um retângulo por foto emoldurava cada copo e os separava, quando
          são as duas faces da MESMA peça.
          O recorte continua valendo: foto com papel amarelado ou cinza
          entra no palco sem uma mancha em volta. */}
      {/* A LARGURA PEDIDA, NÃO A IMPOSTA.
          Isto era `height: altura; width: altura * 0.78` — dois números
          em pixels que não sabiam o tamanho da tela. No celular a prévia
          de frente E verso somava 148 + 148 + folga: mais largo que a
          coluna, e como a coluna cresce com o filho, a PÁGINA INTEIRA
          ficava mais larga que o aparelho. O catálogo esconde o estouro
          (`overflow-x-hidden` na casca), então nada rolava para o lado —
          simplesmente sumia: "Boleto", "Arte colorida" e "Frente e
          verso" ficavam cortados fora da tela, sem como alcançar.
          Agora `altura` é o tamanho desejado e `maxWidth: 100%` é a
          palavra final; a proporção segura o resto, e a janela da arte
          continua certa porque é toda em porcentagem. */}
      <div className="relative"
        style={{ width: altura * 0.78, maxWidth: '100%', aspectRatio: '0.78' }}>
        <FotoDaPeca src={foto} espelhar={espelhar} borda={borda} faixas={faixas} />

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
      <Acessorios itens={acessorios} />
      <Aplicados itens={aplicados} />
      {ressalva && (
        <p className="text-[10.5px] leading-snug text-center mt-1.5 max-w-[230px]"
          style={{ color: '#94a3b8' }}>{ressalva}</p>
      )}
    </figure>
  );
}

/**
 * O QUE VAI JUNTO NA CAIXA — canudo, tampa, e o que mais for marcado.
 *
 * A BORDA SE PINTA NO COPO; ESTES NÃO. Borda é acabamento aplicado na
 * peça, e existe foto dela para pôr no aro. Canudo e tampa são peças
 * separadas: desenhá-los encaixados no copo seria inventar uma imagem
 * de produto que ninguém fotografou. Ao lado, com a foto de cada um, é
 * o que a cliente vai receber — e é honesto.
 */
function Acessorios({ itens }) {
  if (!itens?.length) return null;
  return (
    <div className="flex flex-wrap justify-center gap-2 mt-2.5 max-w-[240px]">
      {itens.map(a => (
        <span key={a.item_id} className="flex flex-col items-center gap-1"
          style={{ width: 58 }} title={a.cor ? `${a.nome} ${a.cor}` : a.nome}>
          {a.foto ? (
            <img src={a.foto} alt="" className="w-11 h-11 rounded-lg object-cover"
              style={{ border: '1px solid #e2e8f0' }} />
          ) : (
            <span className="w-11 h-11 rounded-lg"
              style={{ background: a.cor_hex || '#f1f5f9', border: '1px solid #e2e8f0' }} />
          )}
          <span className="text-[9px] leading-tight text-center" style={{ color: '#475569' }}>
            {a.nome}
            {a.cor && (
              <span className="block" style={{ color: '#94a3b8' }}>{a.cor}</span>
            )}
          </span>
        </span>
      ))}
    </div>
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
