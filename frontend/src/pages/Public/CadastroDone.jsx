import { useEffect, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';

// Card exibido após concluir um cadastro. Mostra a confirmação e leva
// o cliente de volta ao WhatsApp (fecha/sai do site automaticamente).
function waLink(whatsapp) {
  let d = String(whatsapp || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d; // adiciona DDI Brasil
  return `https://wa.me/${d}`;
}

export default function CadastroDone({ message, whatsapp }) {
  const link = waLink(whatsapp);
  const [redirecting, setRedirecting] = useState(false);

  // Volta sozinho ao WhatsApp depois de um instante. Se não houver número,
  // tenta fechar a aba (quando foi aberta pelo próprio site/WhatsApp).
  useEffect(() => {
    const t = setTimeout(() => {
      setRedirecting(true);
      if (link) window.location.href = link;
      else { try { window.close(); } catch {} }
    }, 2500);
    return () => clearTimeout(t);
  }, [link]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-violet-50 to-white px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-gray-100 p-8 text-center">
        <div className="w-16 h-16 mx-auto rounded-full bg-green-100 flex items-center justify-center mb-4">
          <CheckCircle2 size={36} className="text-green-600" />
        </div>
        <h1 className="text-xl font-extrabold text-gray-900 tracking-tight">
          VOCÊ CONCLUIU O CADASTRO
        </h1>
        <p className="text-gray-600 mt-2">
          {message || 'Você concluiu o cadastro! Volte para o WhatsApp.'}
        </p>
        {link ? (
          <>
            <a href={link}
              className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl px-5 py-3 transition-colors">
              Voltar para o WhatsApp
            </a>
            <p className="mt-3 text-xs text-gray-400 flex items-center justify-center gap-1.5">
              <Loader2 size={12} className={redirecting ? 'animate-spin' : ''} /> Voltando para o WhatsApp automaticamente…
            </p>
          </>
        ) : (
          <p className="mt-4 text-sm text-gray-500">Pode fechar esta janela e voltar para o WhatsApp.</p>
        )}
      </div>
    </div>
  );
}
