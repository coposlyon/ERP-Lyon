// ============================================================
// A JANELA PARA O SITE DE VERDADE.
//
// Nada de captura de tela guardada em algum lugar: o quadro abaixo é o
// site rodando agora, num iframe da mesma origem. O que o cliente vê é o
// que aparece aqui — inclusive a alteração salva há dez segundos.
//
// POR QUE ESCALA EM VEZ DE ENCOLHER A JANELA. Um iframe estreito faz o
// site cair no layout de celular, e o cartão mostraria o site errado. O
// truque é renderizar em largura de desktop e reduzir com transform: o
// desenho é o do computador, só que pequeno.
// ============================================================
import { useEffect, useRef, useState } from 'react';

/** Mede a largura do elemento e devolve o número (0 antes da primeira medida). */
function useLargura() {
  const ref = useRef(null);
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    setLargura(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, []);
  return [ref, largura];
}

/**
 * Miniatura do cartão: o site inteiro em desktop, reduzido e sem cliques —
 * quem quiser mexer abre o site ou entra no detalhe.
 */
export function MiniPreview({ caminho, altura = 168, versao = 0, larguraBase = 1280 }) {
  const [ref, largura] = useLargura();
  const escala = largura ? largura / larguraBase : 0;

  return (
    <div ref={ref} className="relative overflow-hidden rounded-xl bg-gray-100 border border-gray-200" style={{ height: altura }}>
      {escala > 0 && (
        <iframe
          key={versao}
          src={caminho}
          title={`Prévia ${caminho}`}
          loading="lazy"
          tabIndex={-1}
          style={{
            width: larguraBase,
            height: Math.round(altura / escala),
            border: 0,
            transform: `scale(${escala})`,
            transformOrigin: 'top left',
            pointerEvents: 'none',
          }}
        />
      )}
      {/* Véu de leitura: a miniatura é para reconhecer o site, não para ler. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />
    </div>
  );
}

export const APARELHOS = [
  { key: 'desktop', label: 'Computador', largura: 1280, altura: 800 },
  { key: 'tablet',  label: 'Tablet',     largura: 820,  altura: 1080 },
  { key: 'mobile',  label: 'Celular',    largura: 390,  altura: 780 },
];

/**
 * O quadro grande do detalhe. Renderiza na largura real do aparelho
 * escolhido e reduz só o que não couber — em tela larga o desktop sai 1:1.
 *
 * `interativo` liga os cliques: dá para navegar pelo site aqui dentro,
 * o que é o jeito honesto de conferir se o botão novo funciona.
 */
export function PreviewAparelho({ caminho, aparelho = 'desktop', versao = 0, interativo = true, alturaMax = 720 }) {
  const [ref, largura] = useLargura();
  const ap = APARELHOS.find(a => a.key === aparelho) || APARELHOS[0];
  const altura = Math.min(ap.altura, alturaMax);
  const escala = largura ? Math.min(1, largura / ap.largura) : 0;

  return (
    <div ref={ref} className="flex justify-center">
      <div
        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
        style={{ width: escala ? ap.largura * escala : '100%', height: altura * (escala || 1) }}
      >
        {escala > 0 && (
          <iframe
            key={`${aparelho}-${versao}`}
            src={caminho}
            title={`Site ${caminho}`}
            style={{
              width: ap.largura,
              height: altura,
              border: 0,
              transform: `scale(${escala})`,
              transformOrigin: 'top left',
              pointerEvents: interativo ? 'auto' : 'none',
            }}
          />
        )}
      </div>
    </div>
  );
}
