// ============================================================
// O COPO DESENHADO, COM O QUE O CLIENTE ESCOLHEU.
//
// Não é foto: é o copo montado na hora com a cor base, a cor da boca, a
// borda e a arte que a pessoa acabou de escolher. Foto de catálogo não
// resolve — seriam 24 cores × 13 acabamentos × 2 lados por modelo, e
// nenhuma delas mostraria o nome do casal escrito.
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

/**
 * @param escolha  { acabamento, campos: { chave -> opção de cor } }
 * @param arte     SVG da arte já com os textos do cliente, ou null
 * @param face     'frente' | 'verso' — só muda o rótulo e a arte usada
 */
export default function CopoPreview({
  escolha = {}, arte = null, face = 'frente', altura = 300, gabarito = null,
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

  const id = `copo-${face}`;
  const vidro = ehVidro(base) && !topo;

  // O corpo: boca mais larga que o fundo, como todo copo de festa.
  const CORPO = 'M22 34 L34 236 Q35 246 45 246 L95 246 Q105 246 106 236 L118 34 Z';

  // A área de impressão, na proporção do gabarito quando ele existe.
  // Sem gabarito cadastrado o retângulo some — melhor não mostrar área de
  // arte nenhuma que mostrar uma inventada.
  const larguraArte = 62;
  const alturaArte = gabarito?.altura_mm && gabarito?.largura_mm
    ? Math.min(150, larguraArte * (Number(gabarito.altura_mm) / Number(gabarito.largura_mm)))
    : 118;
  const topoArte = 78;

  return (
    <figure className="flex flex-col items-center gap-1.5 m-0">
      <svg viewBox="0 0 140 268" height={altura} width={altura * 140 / 268} role="img"
        aria-label={`Prévia do copo — ${face}`}>
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

          <clipPath id={`${id}-recorte`}><path d={CORPO} /></clipPath>
        </defs>

        {/* a sombra no chão é o que tira o copo de "adesivo colado na tela" */}
        <ellipse cx="70" cy="252" rx="46" ry="7" fill="#000" opacity="0.42" />

        <path d={CORPO} fill={`url(#${id}-corpo)`} />

        {requer.jateamento && (
          <path d={CORPO} fill={corDe(jateado, '#e5e7eb')} opacity="0.42" />
        )}

        <path d={CORPO} fill={`url(#${id}-brilho)`} clipPath={`url(#${id}-recorte)`} />
        <path d={CORPO} fill="none" stroke="rgba(255,255,255,0.34)" strokeWidth="1" />

        {/* a boca: elipse aberta, e o anel metálico por cima quando o
            acabamento pede borda */}
        <ellipse cx="70" cy="34" rx="48" ry="9" fill="rgba(255,255,255,0.13)"
          stroke="rgba(255,255,255,0.45)" strokeWidth="1" />
        {requer.borda && (
          <>
            <path d="M22 34 L23.4 58 L116.6 58 L118 34 Z" fill={`url(#${id}-borda)`} opacity="0.9" />
            <ellipse cx="70" cy="34" rx="48" ry="9" fill="none" stroke={corBorda} strokeWidth="2.4" />
          </>
        )}

        {/* A ARTE. Vem como SVG e é embutida por dangerouslySetInnerHTML —
            o vetor é da Lyon, cadastrado pelo Administrativo, e os textos
            que o cliente digita entram escapados na hora de montar (ver
            aplicarValores em CriarArte). */}
        {arte && (
          <g clipPath={`url(#${id}-recorte)`}>
            <foreignObject x={70 - larguraArte / 2} y={topoArte} width={larguraArte} height={alturaArte}>
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
