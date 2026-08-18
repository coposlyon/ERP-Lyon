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

      <Cartao {...props} className={`w-full ${largura} rounded-2xl p-7 sm:p-8 relative z-10`}
        style={{
          background: 'rgba(10,16,45,0.72)',
          border: '1px solid rgba(96,165,250,0.35)',
          boxShadow: '0 0 40px rgba(56,120,255,0.18)',
          backdropFilter: 'blur(10px)',
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
  );
}
