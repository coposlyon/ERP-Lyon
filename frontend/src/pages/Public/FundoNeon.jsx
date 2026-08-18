// ============================================================
// O fundo das telas públicas: as silhuetas de copo em neon.
//
// São as mesmas formas da logo — retângulos abertos embaixo, como copo
// apoiado no chão — em contornos acesos, com reflexo no piso.
//
// POR QUE DOIS SVG E NÃO UM SÓ COBRINDO A TELA. A primeira versão era um
// SVG de tela cheia com `slice`, e num monitor de 1920 ele ampliava 20%:
// as formas cresciam junto com a janela e passavam a dominar o quadro em
// vez de emoldurá-lo. Agora cada lado é um desenho de ALTURA FIXA,
// ancorado no rodapé — a tela cresce, o cenário não. É a diferença entre
// cenário e papel de parede.
//
// A linha do chão é uma só, atravessando a tela inteira, e por isso mora
// fora dos dois desenhos. A conta que a posiciona é a mesma proporção
// usada dentro do SVG: se as duas discordarem, as formas flutuam acima
// da linha ou afundam abaixo dela.
// ============================================================

// Coordenadas de UM lado: chão em y=400, reflexo até 545.
const CHAO = 400;
const FUNDO_SVG = 545;

// `d` termina sem a base de propósito: copo apoiado no chão não tem
// linha embaixo, e é isso que faz a forma pousar no piso.
const FORMAS = [
  { d: 'M6 400 V312 H72 V400',                       cor: '#facc15', w: 3.5 },
  { d: 'M50 400 V208 H138 V400',                     cor: '#eab308', w: 3.5 },
  { d: 'M108 400 V186 H196 V400',                    cor: '#a3e635', w: 3.5 },
  // A taça: duas paredes que convergem no talo. É a peça central da
  // logo e a que dá a leitura de "copo" ao conjunto.
  { d: 'M190 52 L236 200 L236 400 M282 52 L240 200', cor: '#22d3ee', w: 4 },
  { d: 'M276 400 V130 H344 V400',                    cor: '#3b82f6', w: 3.5 },
];

// O lado direito é o mesmo desenho espelhado, com a outra metade do
// espectro. Espelhar em vez de redesenhar mantém o equilíbrio do quadro
// quando alguém mexer nas medidas de um lado só.
const CORES_DIREITA = ['#f472b6', '#ec4899', '#c026d3', '#a855f7', '#6366f1'];

// Altura do cenário: teto em px para que monitor grande não vire vitrine
// de neon, piso em vh para caber em tela baixa.
const ALTURA = 'min(54vh, 470px)';
// A linha do chão, na mesma proporção do SVG: (545 − 400) / 545.
const ALTURA_CHAO = `calc(${ALTURA} * ${((FUNDO_SVG - CHAO) / FUNDO_SVG).toFixed(4)})`;

function Lado({ cores, espelhado }) {
  const id = espelhado ? 'fn-dir' : 'fn-esq';
  const formas = FORMAS.map((f, i) => (
    <path key={i} d={f.d} fill="none"
      stroke={cores[i]} strokeWidth={f.w} strokeLinejoin="round" strokeLinecap="round"
      style={{ filter: `drop-shadow(0 0 6px ${cores[i]}) drop-shadow(0 0 16px ${cores[i]}70)` }} />
  ));

  return (
    <svg aria-hidden="true" viewBox={`0 0 350 ${FUNDO_SVG}`} preserveAspectRatio="xMinYMax meet"
      style={{
        position: 'absolute', bottom: 0, [espelhado ? 'right' : 'left']: 0,
        height: ALTURA, width: 'auto',
        transform: espelhado ? 'scaleX(-1)' : undefined,
      }}>
      <defs>
        {/* O reflexo some ao descer: é piso polido, não um segundo andar. */}
        <linearGradient id={`${id}-fade`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#fff" stopOpacity="0.42" />
          <stop offset="45%"  stopColor="#fff" stopOpacity="0.10" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`${id}-reflexo`}>
          <rect x="0" y={CHAO} width="350" height={FUNDO_SVG - CHAO} fill={`url(#${id}-fade)`} />
        </mask>
        <g id={`${id}-formas`}>{formas}</g>
      </defs>

      <use href={`#${id}-formas`} />

      {/* Espelhado em torno da linha do chão. */}
      <g mask={`url(#${id}-reflexo)`} transform={`translate(0,${CHAO * 2}) scale(1,-1)`}>
        <use href={`#${id}-formas`} />
      </g>
    </svg>
  );
}

export default function FundoNeon() {
  return (
    // `pointer-events: none` porque isto é cenário — o clique tem que
    // atravessar e chegar no cartão.
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden pointer-events-none select-none">

      {/* O facho no piso, que é o que faz o chão parecer molhado. */}
      <div style={{
        position: 'absolute', left: '50%', bottom: ALTURA_CHAO,
        width: '150%', height: 240, transform: 'translate(-50%, 45%)',
        background: 'radial-gradient(closest-side, rgba(59,130,246,0.26), rgba(59,130,246,0))',
      }} />

      {/* A linha do chão: uma só, atravessando a tela. É ela que separa o
          piso da parede e faz as formas pousarem em vez de flutuarem. */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: ALTURA_CHAO, height: 2,
        background: 'linear-gradient(90deg, rgba(96,165,250,0) 0%, rgba(147,197,253,0.5) 50%, rgba(168,85,247,0) 100%)',
      }} />

      <Lado cores={FORMAS.map(f => f.cor)} />
      <Lado cores={CORES_DIREITA} espelhado />
    </div>
  );
}
