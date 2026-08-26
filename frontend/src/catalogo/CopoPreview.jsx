// ============================================================
// O COPO DESENHADO, COM O QUE O CLIENTE ESCOLHEU.
//
// Não é foto: é a peça montada na hora com a cor base, a cor da boca, a
// borda e a arte que a pessoa acabou de escolher. Foto de catálogo não
// resolve — seriam 24 cores × 13 acabamentos × 2 lados por modelo, e
// nenhuma delas mostraria o nome do casal escrito.
//
// CADA FAMÍLIA TEM O SEU FORMATO. Por muito tempo havia um desenho só,
// um copo cônico, para tudo: quem escolhia CANECA via um long drink com
// a cor certa e a alça em lugar nenhum. A cor estava certa e a peça
// estava errada — e a primeira reação de quem vê é achar que o site
// pegou o produto errado, que é o pior lugar para se perder a confiança
// (a tela seguinte é a de pagamento).
//
// AS PROPORÇÕES NÃO FORAM ESTIMADAS NO OLHO. Saíram da medição das
// fotos reais do cadastro, silhueta por silhueta — largura sobre altura
// em onze alturas de cada peça. Por isso o long drink é magro (0,36 de
// largura por altura) e o twister é atarracado (0,54): é o que a peça é.
//
// A COR VEM DO CADASTRO. `hex` de CONFIG_CORES manda. A tabela de nomes
// aqui embaixo é só o socorro para as cores que ainda estão sem hex
// cadastrado — sem ela o copo apareceria cinza e o cliente acharia que o
// site quebrou. É desenho, não regra: nada aqui muda preço, produção ou
// o que vai no pedido.
// ============================================================

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
 * @param escolha  { acabamento, campos: { chave -> opção de cor } }
 * @param familia  o slug da família do catálogo — decide o formato
 * @param arte     SVG da arte já com os textos do cliente, ou null
 * @param face     'frente' | 'verso' — só muda o rótulo e a arte usada
 */
export default function CopoPreview({
  escolha = {}, familia = null, arte = null, face = 'frente', altura = 300, gabarito = null,
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

  const id = `copo-${familia || 'padrao'}-${face}`;
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
    <figure className="flex flex-col items-center gap-1.5 m-0">
      <svg viewBox={`0 0 ${F.vb} 268`} height={altura} width={altura * F.vb / 268} role="img"
        aria-label={`Prévia da peça — ${face}`}>
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
                style={{ width: '100%', height: '100%', color: '#111318' }}
                dangerouslySetInnerHTML={{ __html: arte }} />
            </foreignObject>
          </g>
        )}
      </svg>

      <figcaption className="text-[10.5px] tracking-[0.18em] uppercase"
        style={{ color: 'rgba(255,255,255,0.55)' }}>
        {face === 'verso' ? 'Verso' : 'Frente'}
      </figcaption>
    </figure>
  );
}
