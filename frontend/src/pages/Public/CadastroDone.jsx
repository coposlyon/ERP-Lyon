import { CheckCircle2 } from 'lucide-react';

// Card exibido após concluir um cadastro quando o "modo manutenção" está ligado.
// Mostra só a confirmação + botão para voltar ao WhatsApp.
function waLink(whatsapp) {
  let d = String(whatsapp || '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10 || d.length === 11) d = '55' + d; // adiciona DDI Brasil
  return `https://wa.me/${d}`;
}

export default function CadastroDone({ message, whatsapp }) {
  const link = waLink(whatsapp);
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
        {link && (
          <a href={link}
            className="mt-6 inline-flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-semibold rounded-xl px-5 py-3 transition-colors">
            Voltar para o WhatsApp
          </a>
        )}
      </div>
    </div>
  );
}
