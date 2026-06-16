import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// Copia a mensagem + o link público de cadastro para a área de transferência.
// path: '/cadastro' (cliente) | '/cadastro-fornecedor' | '/cadastro-transportadora'
export default function CopyLinkButton({ path, label = 'Copiar link de cadastro', className = 'btn-secondary' }) {
  const [done, setDone] = useState(false);

  async function copy() {
    const url = `${window.location.origin}${path}`;
    const text = `Olá! Faça o seu cadastro na nossa empresa! ${url}`;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch { toast.error('Não consegui copiar'); document.body.removeChild(ta); return; }
      document.body.removeChild(ta);
    }
    setDone(true); setTimeout(() => setDone(false), 2000);
    toast.success('Link de cadastro copiado!');
  }

  return (
    <button type="button" onClick={copy} className={className} title="Copia a mensagem + o link de cadastro">
      {done ? <Check size={16} /> : <Link2 size={16} />} {label}
    </button>
  );
}
