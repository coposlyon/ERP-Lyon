// ============================================================
// O fundo das telas públicas: as silhuetas de copo em neon.
//
// São as mesmas formas da logo — retângulos abertos embaixo, como se o
// copo estivesse apoiado no chão — em contornos acesos, com o reflexo
// no piso escuro. Nada de imagem: é SVG, então acompanha qualquer
// tamanho de tela sem borrar e sem custar um download.
//
// O reflexo não é uma segunda lista de formas. É o MESMO grupo espelhado
// e apagado por uma máscara: desenhar duas vezes daria duas listas para
// sair de sincronia na primeira vez que alguém mexesse numa delas.
//
// `pointer-events: none` porque isto é cenário — o clique tem que
// atravessar e chegar no cartão.
// ============================================================

// x do lado esquerdo; o direito é o espelho, gerado abaixo.
// `d` termina sem a base de propósito: copo apoiado no chão não tem
// linha embaixo, e é isso que faz a forma "pousar" no piso.
const CHAO = 700;

const ESQUERDA = [
  { d: 'M6 700 V612 H78 V700',          cor: '#facc15', w: 3.5 },
  { d: 'M50 700 V508 H138 V700',        cor: '#eab308', w: 3.5 },
  { d: 'M108 700 V486 H196 V700',       cor: '#a3e635', w: 3.5 },
  // A taça: duas paredes que convergem no talo. É a peça central da
  // logo e a que dá a leitura de "copo" ao conjunto.
  { d: 'M190 352 L236 500 L236 700 M282 352 L240 500', cor: '#22d3ee', w: 4 },
  { d: 'M276 700 V430 H344 V700',       cor: '#3b82f6', w: 3.5 },
];

// Os grupos param a 344 de 1600 porque o cartão ocupa o miolo: encostar
// a última forma nele tira o respiro que faz o cenário parecer fundo, e
// não moldura.

// O lado direito é o mesmo desenho espelhado, com a outra metade do
// espectro. Espelhar em vez de repetir mantém o equilíbrio do quadro
// quando alguém mexer nas medidas de um lado só.
const CORES_DIREITA = ['#f472b6', '#ec4899', '#c026d3', '#a855f7', '#6366f1'];

export default function FundoNeon() {
  const direita = ESQUERDA.map((f, i) => ({ ...f, cor: CORES_DIREITA[i] }));

  const desenhar = (formas, chave) => formas.map((f, i) => (
    <path key={`${chave}${i}`} d={f.d} fill="none"
      stroke={f.cor} strokeWidth={f.w} strokeLinejoin="round" strokeLinecap="round"
      style={{ filter: `drop-shadow(0 0 7px ${f.cor}) drop-shadow(0 0 18px ${f.cor}80)` }} />
  ));

  return (
    <svg aria-hidden="true" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 w-full h-full pointer-events-none select-none">
      <defs>
        {/* O reflexo some ao descer: é piso polido, não um segundo andar. */}
        <linearGradient id="fn-fade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0.45" />
          <stop offset="45%"  stopColor="#fff" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id="fn-reflexo">
          <rect x="0" y={CHAO} width="1600" height="260" fill="url(#fn-fade)" />
        </mask>

        {/* O facho no chão, que é o que faz o piso parecer molhado. */}
        <linearGradient id="fn-risca" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#60a5fa" stopOpacity="0" />
          <stop offset="50%"  stopColor="#93c5fd" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
        </linearGradient>

        <radialGradient id="fn-piso" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
        </radialGradient>

        <g id="fn-formas">
          {desenhar(ESQUERDA, 'e')}
          <g transform="translate(1600,0) scale(-1,1)">{desenhar(direita, 'd')}</g>
        </g>
      </defs>

      <ellipse cx="800" cy={CHAO + 40} rx="880" ry="150" fill="url(#fn-piso)" />
      {/* A risca de luz na linha do chão: é ela que separa o piso da
          parede e faz as formas pousarem em vez de flutuarem. */}
      <rect x="0" y={CHAO - 1} width="1600" height="2" fill="url(#fn-risca)" />

      <use href="#fn-formas" />

      {/* Espelhado em torno da linha do chão: translate(0, 2*CHAO) + scaleY(-1) */}
      <g mask="url(#fn-reflexo)" transform={`translate(0,${CHAO * 2}) scale(1,-1)`}>
        <use href="#fn-formas" />
      </g>
    </svg>
  );
}
