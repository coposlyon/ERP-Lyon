// ============================================================
// VISUALIZAR EM 3D — girar o copo para conferir a arte.
//
// O QUE ISTO É, EXATAMENTE. O copo é um cilindro, e a arte está enrolada
// nele. Girar significa deslizar a arte em volta do cilindro: no meio ela
// aparece inteira, nas laterais aparece comprimida, e depois some pela
// beirada e a outra face entra. É isso que a conta abaixo faz.
//
// Não é uma cena com malha, luz e reflexo — é a projeção cilíndrica, que
// é a parte que importa para a pergunta que o cliente faz aqui: "meu nome
// vai ficar torto? vai caber?". Para responder isso, o que precisa estar
// certo é a largura da arte em volta do copo, e essa parte está.
//
// Roda a 60 quadros no celular sem carregar biblioteca de 600 KB, e é o
// mesmo desenho da prévia da tela — o cliente não vê dois copos
// diferentes conforme o botão que aperta.
// ============================================================
import { useState, useRef, useEffect, useCallback } from 'react';
import { X, RotateCcw, MousePointer2 } from 'lucide-react';
import { NEON, corComAlfa } from './ui';
import { corDe } from './CopoPreview';

// Quanto do copo o olho enxerga de uma vez: pouco mais de meia volta.
const ARCO_VISIVEL = 200;

/**
 * Onde a arte de uma face aparece, e quanto ela está comprimida.
 *
 * @param anguloFace  onde a face está enrolada no copo (0 = frente, 180 = verso)
 * @param giro        quanto o cliente já girou
 * @returns null quando a face está do outro lado, escondida
 */
function projetar(anguloFace, giro) {
  // Normaliza para −180…180: é a diferença entre onde a face está e
  // onde o olho está.
  let d = ((anguloFace - giro + 540) % 360) - 180;
  if (Math.abs(d) > ARCO_VISIVEL / 2) return null;

  const rad = (d * Math.PI) / 180;
  return {
    // seno = quanto a face andou para o lado; cosseno = quanto ela ainda
    // está de frente (e portanto quanto continua legível)
    deslocamento: Math.sin(rad),
    achatamento: Math.max(0.04, Math.cos(rad)),
    profundidade: Math.cos(rad),
  };
}

export default function Visualizar3DPlano({ escolha = {}, faces = {}, gabarito, onFechar }) {
  const [giro, setGiro] = useState(0);
  const arrastando = useRef(null);

  // Esc fecha: quem abre um visualizador em tela cheia tenta o Esc antes
  // de procurar o X.
  useEffect(() => {
    const tecla = e => { if (e.key === 'Escape') onFechar(); };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [onFechar]);

  const mover = useCallback(clientX => {
    if (arrastando.current == null) return;
    const delta = clientX - arrastando.current.x;
    setGiro(arrastando.current.giro - delta * 0.55);
    }, []);

  useEffect(() => {
    const up = () => { arrastando.current = null; };
    const move = e => mover(e.touches ? e.touches[0].clientX : e.clientX);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    window.addEventListener('touchmove', move, { passive: true });
    window.addEventListener('touchend', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', up);
    };
  }, [mover]);

  function pegar(e) {
    const x = e.touches ? e.touches[0].clientX : e.clientX;
    arrastando.current = { x, giro };
  }

  const { acabamento, campos = {} } = escolha;
  const requer = acabamento?.requer || {};
  const base = campos.cor_base || campos.cor_produto || null;
  const corBase = corDe(base, '#93a4c8');
  const corTopo = corDe(campos.cor_topo, corBase);
  const corBorda = corDe(campos.cor_borda, '#d4af37');

  const CORPO = 'M40 60 L62 430 Q64 448 82 448 L178 448 Q196 448 198 430 L220 60 Z';

  const larguraArte = 118;
  const alturaArte = gabarito?.altura_mm && gabarito?.largura_mm
    ? Math.min(280, larguraArte * (Number(gabarito.altura_mm) / Number(gabarito.largura_mm)))
    : 230;

  // Verso primeiro: quem está atrás desenha antes, senão passa por cima.
  const visiveis = [
    { chave: 'verso', angulo: 180, svg: faces.verso },
    { chave: 'frente', angulo: 0, svg: faces.frente },
  ]
    .map(f => ({ ...f, proj: projetar(f.angulo, giro) }))
    .filter(f => f.svg && f.proj)
    .sort((a, b) => a.proj.profundidade - b.proj.profundidade);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center px-4 py-6"
      style={{ background: 'rgba(4,7,20,0.94)', backdropFilter: 'blur(6px)' }}
      role="dialog" aria-modal="true" aria-label="Visualizar o copo em 3D">

      <button type="button" onClick={onFechar} aria-label="Fechar"
        className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
        style={{ border: `1px solid ${corComAlfa(NEON.azul, 0.5)}`, color: NEON.texto }}>
        <X size={19} />
      </button>

      <svg viewBox="0 0 260 470" className="max-h-[68vh] cursor-grab active:cursor-grabbing touch-none"
        onMouseDown={pegar} onTouchStart={pegar}>
        <defs>
          <linearGradient id="v3d-corpo" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={corBase} stopOpacity="0.98" />
            <stop offset={campos.cor_topo ? '58%' : '100%'} stopColor={corBase} stopOpacity="0.95" />
            {campos.cor_topo && <stop offset="100%" stopColor={corTopo} stopOpacity="0.95" />}
          </linearGradient>
          {/* o brilho é o que dá volume: claro na esquerda, escuro no meio,
              reflexo fino na direita — é assim que o olho lê "cilindro" */}
          <linearGradient id="v3d-volume" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#000" stopOpacity="0.34" />
            <stop offset="16%" stopColor="#fff" stopOpacity="0.30" />
            <stop offset="45%" stopColor="#fff" stopOpacity="0.02" />
            <stop offset="82%" stopColor="#000" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.20" />
          </linearGradient>
          <linearGradient id="v3d-borda" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={corBorda} stopOpacity="0.7" />
            <stop offset="42%" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="100%" stopColor={corBorda} stopOpacity="0.85" />
          </linearGradient>
          <clipPath id="v3d-recorte"><path d={CORPO} /></clipPath>
        </defs>

        <ellipse cx="130" cy="456" rx="82" ry="11" fill="#000" opacity="0.5" />
        <path d={CORPO} fill="url(#v3d-corpo)" />
        {requer.jateamento && <path d={CORPO} fill={corDe(campos.cor_jateado, '#e5e7eb')} opacity="0.42" />}

        <g clipPath="url(#v3d-recorte)">
          {visiveis.map(f => (
            <foreignObject key={f.chave}
              x={130 - larguraArte / 2 + f.proj.deslocamento * 74}
              y={150} width={larguraArte} height={alturaArte}
              style={{
                // achatamento = a arte comprimindo conforme dá a volta;
                // a opacidade tira o que está passando pelo outro lado
                transform: `scaleX(${f.proj.achatamento})`,
                transformOrigin: `${130 + f.proj.deslocamento * 74}px 265px`,
                opacity: Math.max(0, Math.min(1, f.proj.profundidade * 1.5 + 0.25)),
              }}>
              <div xmlns="http://www.w3.org/1999/xhtml"
                style={{ width: '100%', height: '100%', color: '#111318' }}
                dangerouslySetInnerHTML={{ __html: f.svg }} />
            </foreignObject>
          ))}
        </g>

        <path d={CORPO} fill="url(#v3d-volume)" clipPath="url(#v3d-recorte)" />
        <path d={CORPO} fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.4" />

        <ellipse cx="130" cy="60" rx="90" ry="17" fill="rgba(255,255,255,0.12)"
          stroke="rgba(255,255,255,0.5)" strokeWidth="1.4" />
        {requer.borda && (
          <>
            <path d="M40 60 L42.6 104 L217.4 104 L220 60 Z" fill="url(#v3d-borda)" opacity="0.92" />
            <ellipse cx="130" cy="60" rx="90" ry="17" fill="none" stroke={corBorda} strokeWidth="4" />
          </>
        )}
      </svg>

      <div className="flex items-center gap-3 mt-5">
        <p className="text-[12px] flex items-center gap-1.5" style={{ color: NEON.suave }}>
          <MousePointer2 size={13} style={{ color: NEON.ciano }} />
          Arraste para girar o copo
        </p>
        <button type="button" onClick={() => setGiro(0)}
          className="text-[12px] flex items-center gap-1.5 px-3 py-1.5 rounded-lg"
          style={{ border: `1px solid ${corComAlfa(NEON.azul, 0.45)}`, color: NEON.azul }}>
          <RotateCcw size={13} /> Voltar à frente
        </button>
      </div>
    </div>
  );
}
