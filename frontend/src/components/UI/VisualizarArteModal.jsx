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
// desenha aqui — para esse continua valendo abrir à parte, e o cartão
// diz isso em vez de mostrar um quadrado vazio.
// ============================================================
import { useEffect, useState } from 'react';
import { X, ZoomIn, ZoomOut, ExternalLink, Loader2, FileText } from 'lucide-react';

/** As extensões que o navegador desenha numa <img>. */
export const ehImagemDeArte = url =>
  /\.(png|jpe?g|webp|gif|svg|avif|bmp)(\?|$)/i.test(String(url || ''));

/**
 * @param {string|null} url    O arquivo da arte (null fecha o visualizador).
 * @param {string} titulo     O que aparece no topo — normalmente o código do pedido.
 * @param {string} notas      As observações da arte, quando houver.
 */
export default function VisualizarArteModal({ url, titulo = 'Arte do pedido', notas, className = '', onClose }) {
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

  return (
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
        <BotaoBarra titulo="Abrir o arquivo em outra aba"
          onClick={() => window.open(url, '_blank', 'noopener')}>
          <ExternalLink size={18} />
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
          <SemPreview onAbrir={() => window.open(url, '_blank', 'noopener')} />
        ) : falhou ? (
          <SemPreview erro onAbrir={() => window.open(url, '_blank', 'noopener')} />
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
  );
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
function SemPreview({ erro, onAbrir }) {
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
      <button type="button" onClick={onAbrir}
        className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold"
        style={{ border: '1.5px solid #4ade80', color: '#4ade80', background: 'rgba(74,222,128,0.10)' }}>
        <ExternalLink size={15} /> Abrir o arquivo
      </button>
    </div>
  );
}
