import { useState } from 'react';
import { Link2, Check } from 'lucide-react';
import toast from 'react-hot-toast';

// Copia o link público de cadastro — SÓ O LINK.
//
// Antes ia junto um "Olá! Faça o seu cadastro na nossa empresa!" colado
// na frente do endereço. Quem clica aqui está prestes a colar o link em
// algum lugar, e quase nunca é num lugar que aceita a frase pronta: no
// WhatsApp a pessoa já escreveu o próprio recado e só falta o endereço;
// no campo de link do Instagram, num QR Code ou num e-mail a frase
// simplesmente quebra o link. Apagar a mensagem colada dava mais
// trabalho do que escrevê-la.
//
// Link limpo também é link que o app de destino reconhece e transforma
// em prévia clicável — texto antes do endereço atrapalha isso em vários.
//
// path: '/cadastro' (cliente) | '/cadastro-fornecedor' | '/cadastro-transportadora'
export default function CopyLinkButton({ path, label = 'Copiar link de cadastro', className = 'btn-secondary' }) {
  const [done, setDone] = useState(false);

  async function copy() {
    const text = `${window.location.origin}${path}`;
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
    <button type="button" onClick={copy} className={className} title="Copia só o endereço do cadastro, sem mensagem nenhuma">
      {done ? <Check size={16} /> : <Link2 size={16} />} {label}
    </button>
  );
}
