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
//
// A FILA, E POR QUE ELA EXISTE. Cada prévia é o aplicativo inteiro
// abrindo de novo. Sete cartões abrindo juntos são sete downloads do
// mesmo pacote de 1,3 MB ao mesmo tempo, todos furando o cache porque
// nenhum terminou ainda — a tela inteira parece travada. Um de cada vez
// resolve: o primeiro paga o download, os outros seis pegam do cache e
// entram quase instantâneos. E só entra na fila o cartão que está
// realmente visível — prévia de coisa fora da tela é trabalho jogado
// fora.
// ============================================================
import { useEffect, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';

// ── A fila: uma prévia carregando por vez, no app inteiro ──
const espera = [];
let ativo = null;

function girar() {
  if (ativo) return;
  while (espera.length) {
    const t = espera.shift();
    if (t.cancelado) continue;
    ativo = t;
    t.comecar();
    return;
  }
}

/** Entra na fila. Devolve a função de saída (obrigatória no desmonte). */
function entrarNaFila(comecar) {
  const t = { comecar, cancelado: false };
  espera.push(t);
  girar();
  return () => {
    t.cancelado = true;
    if (ativo === t) { ativo = null; girar(); }
  };
}

/**
 * Estado de uma prévia: entra na fila quando aparece na tela, avisa
 * quando o site terminou de abrir e libera o próximo da fila.
 *
 * O prazo de 10s não é decoração: site que demora demais não pode
 * segurar a fila inteira: passou disso, o próximo começa.
 */
function usePreviaNaFila(chave = '') {
  const alvo = useRef(null);
  const [visivel, setVisivel] = useState(false);
  const [carregar, setCarregar] = useState(false);
  const [pronto, setPronto] = useState(false);
  const soltarVez = useRef(null);

  // Recarregar (ou trocar de aparelho) traz o véu de volta: o quadro
  // com o desenho antigo enquanto o novo abre é o que parece bug.
  useEffect(() => { setPronto(false); }, [chave]);

  // Só o que está (ou está quase) na tela entra na fila.
  //
  // A CONTA DE GEOMETRIA VEM ANTES DO OBSERVADOR, e não é preciosismo: o
  // IntersectionObserver só entrega aviso quando o navegador está
  // desenhando. Em aba de segundo plano ele cala, e o cartão que está
  // bem no meio da tela ficaria em "Abrindo o site..." para sempre.
  // Medir o retângulo funciona desenhando ou não; o observador fica para
  // o que ainda vai chegar rolando a página.
  useEffect(() => {
    const el = alvo.current;
    if (!el) return;
    const naTela = () => {
      const r = el.getBoundingClientRect();
      const alturaJanela = window.innerHeight || document.documentElement.clientHeight || 0;
      return r.bottom > -200 && r.top < alturaJanela + 200;
    };
    if (naTela()) { setVisivel(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisivel(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A VEZ SÓ SE DEVOLVE EM TRÊS MOMENTOS: o site abriu, estourou o prazo,
  // ou o cartão saiu da tela. Nada mais — e é por isso que `carregar` não
  // entra nas dependências: quando ele entrava, ligar o iframe refazia o
  // efeito, a limpeza devolvia a vez no mesmo instante e as sete prévias
  // disparavam em cascata. A fila existia no papel e não segurava nada.
  useEffect(() => {
    if (!visivel) return;
    let sair = null;
    let prazo;
    const soltar = () => { clearTimeout(prazo); if (sair) { sair(); sair = null; } };
    sair = entrarNaFila(() => {
      setCarregar(true);
      prazo = setTimeout(soltar, 10000);
    });
    soltarVez.current = soltar;
    return () => { soltar(); soltarVez.current = null; };
  }, [visivel]);

  // O site abriu: marca como pronto e passa a vez.
  const aoAbrir = () => {
    setPronto(true);
    soltarVez.current?.();
  };

  return { alvo, carregar, pronto, aoAbrir };
}

/** Mede a largura do elemento e devolve o número (0 antes da primeira medida). */
function useLargura(ref) {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setLargura(e.contentRect.width));
    ro.observe(el);
    setLargura(el.getBoundingClientRect().width);
    return () => ro.disconnect();
  }, [ref]);
  return largura;
}

/** O véu de "abrindo o site" — some quando o iframe termina de carregar. */
function Carregando({ pronto, texto = 'Abrindo o site...' }) {
  if (pronto) return null;
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gray-50 text-gray-400">
      <Loader2 size={20} className="animate-spin" />
      <span className="text-xs">{texto}</span>
    </div>
  );
}

/**
 * Miniatura do cartão: o site inteiro em desktop, reduzido e sem cliques —
 * quem quiser mexer abre o site ou entra no detalhe.
 */
export function MiniPreview({ caminho, altura = 168, versao = 0, larguraBase = 1280 }) {
  const { alvo, carregar, pronto, aoAbrir } = usePreviaNaFila(`${caminho}|${versao}`);
  const largura = useLargura(alvo);
  const escala = largura ? largura / larguraBase : 0;

  return (
    <div ref={alvo} className="relative overflow-hidden rounded-xl bg-gray-100 border border-gray-200" style={{ height: altura }}>
      {carregar && escala > 0 && (
        <iframe
          key={versao}
          src={caminho}
          title={`Prévia ${caminho}`}
          onLoad={aoAbrir}
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
      <Carregando pronto={pronto} />
      {/* Véu de leitura: a miniatura é para reconhecer o site, não para ler. */}
      {pronto && <div className="absolute inset-0 bg-gradient-to-t from-black/10 to-transparent pointer-events-none" />}
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
  const { alvo, carregar, pronto, aoAbrir } = usePreviaNaFila(`${caminho}|${aparelho}|${versao}`);
  const largura = useLargura(alvo);
  const ap = APARELHOS.find(a => a.key === aparelho) || APARELHOS[0];
  const altura = Math.min(ap.altura, alturaMax);
  const escala = largura ? Math.min(1, largura / ap.largura) : 0;

  return (
    <div ref={alvo} className="flex justify-center">
      <div
        className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm"
        style={{ width: escala ? ap.largura * escala : '100%', height: altura * (escala || 1) }}
      >
        {carregar && escala > 0 && (
          <iframe
            key={`${aparelho}-${versao}`}
            src={caminho}
            title={`Site ${caminho}`}
            onLoad={aoAbrir}
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
        <Carregando pronto={pronto} />
      </div>
    </div>
  );
}
