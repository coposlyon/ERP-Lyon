// ============================================================
// VER A ARTE — inteira, de uma vez.
//
// "Visualizar arte" abria o arquivo no navegador (window.open na URL do
// storage). No computador funciona; no celular não: o Chrome abre a
// imagem crua no tamanho REAL dela. Uma arte de 3000 px numa tela de
// 400 aparece a sete vezes o tamanho — o vendedor via um pedaço branco
// do copo e tinha que arrastar a tela para descobrir o que era.
//
// Aqui a arte abre DENTRO do sistema, encaixada na tela: a imagem
// inteira aparece de primeira, sem arrastar nada. Quem precisa olhar o
// detalhe toca uma vez e ela vai para o tamanho real, com rolagem nos
// dois sentidos; toca de novo e volta a encaixar. É a mesma lógica do
// visualizador de fotos do celular, que é onde a pessoa já aprendeu.
//
// Arquivo que não é imagem (PDF, AI, CDR, EPS, PSD) o navegador não
// desenha aqui — para esse continua valendo baixar, e o cartão diz isso
// em vez de mostrar um quadrado vazio.
//
// "ABRIR EM OUTRA ABA" VIROU "BAIXAR", porque era o que já acontecia.
// O Storage devolve a arte com `Content-Disposition: attachment`: a aba
// nova abria, disparava o download e fechava. O botão prometia uma coisa
// e fazia outra — agora ele diz o que faz. E o download passou a ser de
// verdade (busca o arquivo e salva com um nome que se entende), em vez
// de um link que o navegador resolve como quiser.
// ============================================================
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ZoomIn, ZoomOut, Download, Loader2, FileText } from 'lucide-react';

/** As extensões que o navegador desenha numa <img>. */
export const ehImagemDeArte = url =>
  /\.(png|jpe?g|webp|gif|svg|avif|bmp)(\?|$)/i.test(String(url || ''));

/** A extensão do arquivo, lida da URL. */
const extensaoDe = url => (String(url || '').split('?')[0].match(/\.([a-z0-9]{2,5})$/i) || [])[1] || '';

/**
 * BAIXAR A ARTE COM UM NOME QUE SE ENTENDE.
 *
 * O arquivo mora no Storage com um uuid por nome. Salvar
 * "a1b2c3d4-….svg" na pasta de downloads do cliente é a mesma coisa que
 * não salvar: daqui a uma semana ninguém sabe de que pedido era.
 *
 * O bucket devolve `Access-Control-Allow-Origin: *`, então dá para
 * buscar o arquivo e salvá-lo renomeado. Se a busca falhar (rede, CORS
 * que mude, link expirado), cai no link direto — que baixa do mesmo
 * jeito, só com o nome feio. Falhar baixando é melhor que não baixar.
 */
async function baixarArte(url, nome) {
  const ext = extensaoDe(url);
  const arquivo = `${(nome || 'arte').replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '')}${ext ? `.${ext}` : ''}`;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(String(r.status));
    const blob = await r.blob();
    const href = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = arquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 10000);
  } catch {
    window.open(url, '_blank', 'noopener');
  }
}

/**
 * @param {string|null} url    O arquivo da arte (null fecha o visualizador).
 * @param {string} titulo     O que aparece no topo — normalmente o código do pedido.
 * @param {string} notas      As observações da arte, quando houver.
 */
export default function VisualizarArteModal({ url, titulo = 'Arte do pedido', notas, nomeArquivo, className = '', onClose }) {
  const [ampliada, setAmpliada] = useState(false);  // false = encaixada na tela
  const [carregando, setCarregando] = useState(true);
  const [falhou, setFalhou] = useState(false);

  // Abriu outra arte (ou reabriu a mesma): volta a encaixar.
  useEffect(() => {
    setAmpliada(false);
    setCarregando(true);
    setFalhou(false);
  }, [url]);

  // Esc fecha, e o fundo não rola enquanto a arte está aberta.
  useEffect(() => {
    if (!url) return undefined;
    const aoTeclar = e => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', aoTeclar);
    const antes = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', aoTeclar);
      document.body.style.overflow = antes;
    };
  }, [url, onClose]);

  if (!url) return null;

  const imagem = ehImagemDeArte(url);

  /**
   * SAI DE ONDE FOI CHAMADO E VAI PARA O <body>.
   *
   * `position: fixed` é relativo à JANELA — menos quando algum
   * ancestral tem `transform`, `filter` ou `backdrop-filter`, que é o
   * caso dos cartões de vidro desta interface: aí ele passa a ser
   * relativo ao CARTÃO, e a "tela cheia" vira um retângulo dentro do
   * card, com metade da página clicável por fora.
   *
   * Um portal resolve isso de uma vez para todos os lugares que abrem a
   * arte, em vez de cada tela descobrir o problema do seu jeito.
   */
  return createPortal((
    <div className={`fixed inset-0 z-[70] flex flex-col ${className}`} style={{ background: 'rgba(3,7,18,0.96)' }}>

      {/* ── Barra do topo ───────────────────────────────────────
          Fica fora da área da imagem de propósito: sobreposta, ela
          taparia justamente o alto da arte. */}
      <div className="shrink-0 flex items-center gap-2 px-3 py-2.5"
        style={{ borderBottom: '1px solid rgba(255,255,255,0.10)' }}>
        <p className="flex-1 min-w-0 truncate text-sm font-semibold text-white">{titulo}</p>

        {imagem && !falhou && (
          <BotaoBarra
            titulo={ampliada ? 'Encaixar a arte na tela' : 'Ver a arte em tamanho real'}
            onClick={() => setAmpliada(a => !a)}>
            {ampliada ? <ZoomOut size={18} /> : <ZoomIn size={18} />}
          </BotaoBarra>
        )}
        <BotaoBarra titulo="Baixar o arquivo da arte"
          onClick={() => baixarArte(url, nomeArquivo || titulo)}>
          <Download size={18} />
        </BotaoBarra>
        <BotaoBarra titulo="Fechar" onClick={onClose}>
          <X size={20} />
        </BotaoBarra>
      </div>

      {/* ── A arte ──────────────────────────────────────────────
          ENCAIXADA: a caixa não rola e a imagem se limita à altura e à
          largura disponíveis — é o que faz a arte inteira caber sem
          arrastar. AMPLIADA: a caixa rola nos dois sentidos e a imagem
          vai no tamanho natural. */}
      <div
        className={`relative flex-1 min-h-0 ${ampliada ? 'overflow-auto' : 'overflow-hidden flex items-center justify-center p-3'}`}
        onClick={() => imagem && !falhou && setAmpliada(a => !a)}
        style={{ WebkitOverflowScrolling: 'touch' }}>

        {!imagem ? (
          <SemPreview onBaixar={() => baixarArte(url, nomeArquivo || titulo)} />
        ) : falhou ? (
          <SemPreview erro onBaixar={() => baixarArte(url, nomeArquivo || titulo)} />
        ) : (
          <>
            {carregando && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <Loader2 size={28} className="animate-spin" style={{ color: 'rgba(255,255,255,0.6)' }} />
              </div>
            )}
            <img
              src={url}
              alt={titulo}
              onLoad={() => setCarregando(false)}
              onError={() => { setCarregando(false); setFalhou(true); }}
              className={ampliada ? 'max-w-none block' : 'block'}
              style={ampliada
                ? { minWidth: '100%', cursor: 'zoom-out' }
                : { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', cursor: 'zoom-in' }}
            />
          </>
        )}
      </div>

      {/* ── Rodapé ──────────────────────────────────────────── */}
      <div className="shrink-0 px-3 py-2 text-center space-y-0.5"
        style={{ borderTop: '1px solid rgba(255,255,255,0.10)' }}>
        {notas && <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.75)' }}>{notas}</p>}
        {imagem && !falhou && (
          <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
            {ampliada ? 'Toque na arte para encaixá-la na tela' : 'Toque na arte para ampliar'}
          </p>
        )}
      </div>
    </div>
  ), document.body);
}

// ── Peças pequenas ───────────────────────────────────────────
function BotaoBarra({ titulo, onClick, children }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} onClick={onClick}
      className="shrink-0 p-2 rounded-lg transition-opacity hover:opacity-70"
      style={{ color: '#ffffff', background: 'rgba(255,255,255,0.08)' }}>
      {children}
    </button>
  );
}

/** PDF, AI, CDR, PSD… ou a imagem que não carregou. */
function SemPreview({ erro, onBaixar }) {
  return (
    <div className="text-center px-6" onClick={e => e.stopPropagation()}>
      <FileText size={40} className="mx-auto mb-3" style={{ color: 'rgba(255,255,255,0.35)' }} />
      <p className="text-sm mb-1 text-white">
        {erro ? 'Não foi possível carregar a arte aqui.' : 'Este arquivo não abre dentro do sistema.'}
      </p>
      <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.55)' }}>
        {erro
          ? 'O arquivo pode ter sido movido ou o link expirou.'
          : 'PDF, AI, CDR, EPS e PSD abrem no programa do seu aparelho.'}
      </p>
      <button type="button" onClick={onBaixar}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
        style={{ border: '1.5px solid #4ade80', color: '#4ade80', background: 'rgba(74,222,128,0.10)' }}>
        <Download size={15} /> Baixar o arquivo
      </button>
    </div>
  );
}
