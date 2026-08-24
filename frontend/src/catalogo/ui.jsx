// ============================================================
// A CASCA DO CATÁLOGO.
//
// As quatro telas do catálogo são a mesma casca com miolo diferente:
// fundo azul-marinho, os cantos neon, a logo, o título e a trilha. Quem
// desce da vitrine para o configurador e sobe de volta não pode sentir
// que trocou de site — e é isso que uma casca compartilhada garante que
// duas telas escritas em dias diferentes não garantem.
//
// POR QUE NÃO O PortalPublico. Aquele é um cartão central estreito, feito
// para formulário de uma coluna (acompanhar pedido, cadastro). O catálogo
// é largo e de três colunas. Mesmo espectro de cor, enquadramento outro.
//
// NADA DO ERP ENTRA AQUI. Estas telas são o lado de fora.
// ============================================================
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// O espectro da logo, usado em toda a casca: ciano à esquerda, magenta à
// direita. Ficam num lugar só para a tela nova não inventar o quarto tom
// de azul.
export const NEON = {
  ciano: '#22d3ee',
  azul: '#3b82f6',
  roxo: '#a855f7',
  magenta: '#ec4899',
  rosa: '#f472b6',
  fundo: 'radial-gradient(1200px 640px at 50% -12%, #16205c 0%, #0a0f2c 46%, #050818 100%)',
  texto: '#ffffff',
  suave: 'rgba(255,255,255,0.62)',
  fraco: 'rgba(255,255,255,0.42)',
};

/** A borda acesa é um degradê pintado atrás — o CSS não tem border com gradiente. */
export function bordaNeon(cor = NEON.azul, opacidade = 0.42) {
  return {
    background: 'rgba(9,14,40,0.72)',
    border: `1px solid ${corComAlfa(cor, opacidade)}`,
    borderRadius: 14,
    boxShadow: `0 0 22px ${corComAlfa(cor, 0.13)} inset, 0 0 26px ${corComAlfa(cor, 0.09)}`,
  };
}

export function corComAlfa(hex, alfa) {
  const m = String(hex).replace('#', '');
  const n = parseInt(m.length === 3 ? m.split('').map(c => c + c).join('') : m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alfa})`;
}

/** Os cantos acesos das telas aprovadas. Decoração pura — não recebe clique. */
function CantosNeon() {
  const traco = (lado, cor) => (
    <svg viewBox="0 0 220 120" aria-hidden="true"
      className={`pointer-events-none absolute top-0 ${lado === 'e' ? 'left-0' : 'right-0 scale-x-[-1]'} w-[min(30vw,260px)]`}
      style={{ filter: `drop-shadow(0 0 10px ${corComAlfa(cor, 0.85)})` }}>
      <path d="M4 4 L120 4 L150 34" fill="none" stroke={cor} strokeWidth="3" strokeLinecap="round" />
      <path d="M4 18 L110 18 L138 46" fill="none" stroke={cor} strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  );
  return <>{traco('e', NEON.azul)}{traco('d', NEON.magenta)}</>;
}

/**
 * @param trilha  [{ nome, para }] — o último item é a página atual e não
 *                vira link, porque link para onde já se está é o tipo de
 *                detalhe que faz o cliente achar que travou.
 */
export function CatalogoShell({ titulo, subtitulo, trilha = [], largura = 'max-w-[1600px]', children }) {
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: NEON.fundo }}>
      <CantosNeon />

      <div className={`${largura} mx-auto px-4 sm:px-6 py-7 relative z-10`}>
        <div className="text-center">
          <Link to="/personalizados" className="inline-block">
            <img src="/lyon-logo.png" alt="Lyon Copos" width={190} height={54} draggable={false}
              className="mx-auto mb-3 w-[190px] max-w-[60%]"
              onError={e => { e.target.style.display = 'none'; }} />
          </Link>

          {titulo && (
            <h1 className="text-[26px] sm:text-[34px] font-bold leading-tight" style={{ color: NEON.texto }}>
              {titulo}
            </h1>
          )}
          {subtitulo && (
            <p className="text-[13px] sm:text-sm mt-1.5" style={{ color: NEON.suave }}>{subtitulo}</p>
          )}

          {trilha.length > 0 && (
            <nav className="flex items-center justify-center flex-wrap gap-1 mt-2.5 text-[12px]">
              {trilha.map((t, i) => {
                const ultimo = i === trilha.length - 1;
                return (
                  <span key={`${t.nome}-${i}`} className="inline-flex items-center gap-1">
                    {i > 0 && <ChevronRight size={12} style={{ color: NEON.fraco }} />}
                    {ultimo || !t.para
                      ? <span style={{ color: NEON.suave }}>{t.nome}</span>
                      : <Link to={t.para} style={{ color: NEON.ciano }} className="hover:underline">{t.nome}</Link>}
                  </span>
                );
              })}
            </nav>
          )}
        </div>

        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}

/** Um bloco da tela, com o título aceso na cor do bloco. */
export function Painel({ titulo, cor = NEON.azul, icone: Icone, children, className = '', ...props }) {
  return (
    <section {...props} style={{ ...bordaNeon(cor), ...(props.style || {}) }}
      className={`p-4 sm:p-5 ${className}`}>
      {titulo && (
        <h2 className="text-[14px] font-semibold flex items-center gap-2 mb-3.5" style={{ color: cor }}>
          {Icone && <Icone size={16} />} {titulo}
        </h2>
      )}
      {children}
    </section>
  );
}

/** Rótulo de campo — pequeno, claro, sempre acima do controle. */
export const Rotulo = ({ children }) => (
  <label className="block text-[11.5px] mb-1.5" style={{ color: NEON.suave }}>{children}</label>
);

/**
 * O botão de escolher: quadradinho com ícone em cima do texto, aceso
 * quando é o escolhido. É o controle que a tela aprovada usa para
 * acabamento, tipo de pedido, impressão e ocasião — um só, e não quatro
 * parecidos.
 */
/**
 * @param centralizado  texto centrado e sem ícone — para grades de
 *                      opções curtas (os 14 acabamentos), onde repetir o
 *                      mesmo ícone catorze vezes é ruído que não
 *                      distingue nada.
 * @param quebrar       deixa o texto usar duas linhas em vez de virar
 *                      "Personaliz…". Nome cortado numa opção que o
 *                      cliente precisa escolher é pior que o botão mais
 *                      alto.
 */
export function Opcao({
  ativo, cor = NEON.roxo, icone: Icone, titulo, sub, onClick,
  centralizado = false, quebrar = false, className = '', ...props
}) {
  return (
    <button type="button" onClick={onClick} aria-pressed={!!ativo} {...props}
      className={`px-3 py-2 rounded-xl transition-all active:scale-[0.985] ${centralizado ? 'text-center' : 'text-left'} ${className}`}
      style={{
        background: ativo ? corComAlfa(cor, 0.16) : 'rgba(255,255,255,0.035)',
        border: `1px solid ${ativo ? corComAlfa(cor, 0.85) : 'rgba(255,255,255,0.10)'}`,
        boxShadow: ativo ? `0 0 16px ${corComAlfa(cor, 0.35)}` : 'none',
        ...(props.style || {}),
      }}>
      <span className={`flex items-center gap-2 ${centralizado ? 'justify-center' : ''}`}>
        {Icone && !centralizado && (
          <Icone size={15} style={{ color: ativo ? cor : NEON.fraco, flexShrink: 0 }} />
        )}
        <span className="min-w-0">
          <span className={`block text-[12.5px] font-medium leading-tight ${quebrar || centralizado ? '' : 'truncate'}`}
            style={{ color: ativo ? NEON.texto : 'rgba(255,255,255,0.82)' }}>
            {titulo}
          </span>
          {sub && <span className="block text-[10.5px] leading-tight mt-0.5" style={{ color: NEON.fraco }}>{sub}</span>}
        </span>
      </span>
    </button>
  );
}

/** O botão de ação: contorno aceso, ou preenchido quando é O botão da tela. */
export function Botao({ cor = NEON.azul, cheio = false, icone: Icone, children, className = '', ...props }) {
  return (
    <button type="button" {...props}
      className={`w-full rounded-xl py-3 px-4 font-semibold text-[14px] flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed ${className}`}
      style={{
        color: cheio ? '#fff' : cor,
        background: cheio
          ? `linear-gradient(90deg, ${NEON.magenta} 0%, ${NEON.roxo} 46%, ${NEON.azul} 100%)`
          : corComAlfa(cor, 0.08),
        border: cheio ? 'none' : `1px solid ${corComAlfa(cor, 0.55)}`,
        boxShadow: cheio ? `0 0 26px ${corComAlfa(NEON.roxo, 0.5)}` : 'none',
        ...(props.style || {}),
      }}>
      {Icone && <Icone size={17} />} {children}
    </button>
  );
}

/** Campo de texto/numérico com o mesmo desenho em todas as telas. */
export function Campo({ className = '', ...props }) {
  return (
    <input {...props}
      className={`w-full rounded-lg px-3 py-2.5 text-[13.5px] outline-none ${className}`}
      style={{
        background: 'rgba(255,255,255,0.045)',
        border: '1px solid rgba(255,255,255,0.13)',
        color: NEON.texto,
        ...(props.style || {}),
      }} />
  );
}

/**
 * Select com a seta desenhada — a nativa some no fundo escuro.
 *
 * `colorScheme: dark` não é detalhe: a LISTA de opções é desenhada pelo
 * sistema, não pela página, e ela herda o esquema de cor do documento.
 * Sem isso o popup abre BRANCO sobre o catálogo escuro, e ainda por
 * cima com o fundo translúcido do campo resolvendo para branco.
 * A classe `lj-select` pinta as opções no navegador que ignora o
 * color-scheme.
 */
export function Seletor({ children, className = '', ...props }) {
  return (
    <div className="relative">
      <select {...props}
        className={`lj-select w-full appearance-none rounded-lg pl-3 pr-8 py-2.5 text-[13.5px] outline-none ${className}`}
        style={{
          background: 'rgba(255,255,255,0.045)',
          border: '1px solid rgba(255,255,255,0.13)',
          color: NEON.texto,
          colorScheme: 'dark',
          ...(props.style || {}),
        }}>
        {children}
      </select>
      <ChevronRight size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 rotate-90 pointer-events-none"
        style={{ color: NEON.fraco }} />
    </div>
  );
}

/** A bolinha de cor ao lado do nome. Sem hex cadastrado, vira contorno. */
export function Bolinha({ hex, tamanho = 12 }) {
  return (
    <span className="inline-block rounded-full shrink-0"
      style={{
        width: tamanho, height: tamanho,
        background: hex || 'transparent',
        border: hex ? '1px solid rgba(255,255,255,0.35)' : '1px dashed rgba(255,255,255,0.4)',
      }} />
  );
}

/** O aviso de rodapé de bloco — informação, não erro. */
export function Nota({ children, cor = NEON.ciano, icone: Icone }) {
  return (
    <p className="text-[11px] leading-relaxed flex items-start gap-1.5 mt-2.5" style={{ color: NEON.suave }}>
      {Icone && <Icone size={13} className="shrink-0 mt-[1px]" style={{ color: cor }} />}
      <span>{children}</span>
    </p>
  );
}

export const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  .format(Number(v) || 0);
