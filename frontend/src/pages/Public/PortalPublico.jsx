// ============================================================
// A casca das telas públicas da Lyon.
//
// Fundo azul-marinho com o clarão neon no topo, a logo e um cartão
// central de borda acesa. É o que o cliente vê antes de qualquer coisa,
// e por isso precisa ser a MESMA coisa em toda porta de entrada: o
// acompanhamento do pedido e os três links de cadastro. Duas telas de
// abertura ligeiramente diferentes fazem quem chega pelo link se
// perguntar se caiu no site certo.
//
// Nada do ERP entra aqui: estas telas são externas.
// ============================================================
import { HelpCircle } from 'lucide-react';
import FundoNeon from './FundoNeon';

export default function PortalPublico({
  children,
  largura = 'max-w-md',
  ajudaTexto = 'Precisa de ajuda? Fale com o vendedor',
  ajudaHref = '/loja',
  rodape = null,
  como = 'div',
  ...props
}) {
  const Cartao = como;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #16205c 0%, #0a0f2c 45%, #060a1f 100%)' }}>

      <FundoNeon />

      {/* onError esconde a tag em vez de deixar o ícone de imagem
          quebrada: a tela funciona sem a logo, e um retângulo cinza no
          topo passa a impressão de site fora do ar. */}
      <img src="/lyon-logo.png" alt="Lyon Copos" className="w-56 max-w-[70%] mb-8 relative z-10" draggable={false}
        onError={e => { e.target.style.display = 'none'; }} />

      {/* A BORDA É UM DEGRADÊ ACESO, não uma linha azul.
          Não existe `border` com gradiente no CSS, então o contorno é
          uma moldura de 1,5px pintada com o degradê e o cartão por
          cima: o que sobra nas beiradas é a borda. É o mesmo espectro
          da logo — ciano à esquerda, magenta à direita — e é ele que
          amarra o cartão ao cenário atrás. */}
      <div className={`w-full ${largura} relative z-10`}
        style={{
          padding: 1.5,
          borderRadius: 18,
          background: 'linear-gradient(140deg,#22d3ee 0%,#3b82f6 38%,#a855f7 72%,#ec4899 100%)',
          boxShadow: '0 0 44px rgba(56,120,255,0.35), 0 0 90px rgba(168,85,247,0.14)',
        }}>
        <Cartao {...props} className="w-full p-7 sm:p-8"
          style={{
            // Mais opaco que antes: com o cenário neon atrás, 72% deixava
            // as linhas passarem por trás do texto do formulário.
            background: 'rgba(9,14,40,0.90)',
            borderRadius: 16.5,
            backdropFilter: 'blur(12px)',
            display: 'block',
          }}>
          {children}

          {ajudaTexto && (
            <div className="mt-5 pt-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <a href={ajudaHref} className="text-sm inline-flex items-center gap-1.5" style={{ color: '#60a5fa' }}>
                <HelpCircle size={14} /> {ajudaTexto}
              </a>
            </div>
          )}

          {rodape && (
            <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {rodape}
            </div>
          )}
        </Cartao>
      </div>
    </div>
  );
}
