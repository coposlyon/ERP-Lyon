// ============================================================
// TELA 3A — Login do cliente / Acompanhar Pedido
//
// Tela externa: nada do ERP entra aqui. O cliente chega pelo link que o
// vendedor mandou, informa CPF e número do pedido, e passa para o
// acompanhamento.
//
// O acesso é CPF + PV porque não existe cadastro de senha para cliente
// nesta primeira versão. A trava de verdade está no servidor: os dois
// têm que ser do mesmo cadastro, e o erro é sempre a mesma frase — dizer
// "este pedido não existe" entregaria quais números existem.
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Tag, LogIn, Loader2, HelpCircle, AlertCircle } from 'lucide-react';
import api from '@/lib/api';

// 000.000.000-00 enquanto digita — o campo aceita colado com ou sem
// pontuação, e a máscara só ajuda a conferir.
function mascaraCPF(v) {
  const d = String(v).replace(/\D/g, '').slice(0, 11);
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, '$1.$2.$3-$4');
}

export default function AcompanharPedido() {
  const navigate = useNavigate();
  const [cpf, setCpf] = useState('');
  const [pedido, setPedido] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setErro('');
    setEnviando(true);
    try {
      const r = await api.post('/acompanhar/acesso', { cpf, pedido });
      // O token é o que dá acesso ao pedido dali em diante. Fica na
      // sessão e não no localStorage: fechou o navegador, acabou —
      // muita gente abre isso de um computador emprestado.
      sessionStorage.setItem('acompanhar_token', r.token);
      navigate('/acompanhar/pedido');
    } catch (err) {
      setErro(err.error || 'Não foi possível entrar agora. Tente de novo em instantes.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-10"
      style={{ background: 'radial-gradient(1200px 600px at 50% -10%, #16205c 0%, #0a0f2c 45%, #060a1f 100%)' }}>

      <img src="/lyon-logo.png" alt="Lyon Copos" className="w-56 max-w-[70%] mb-8" draggable={false} />

      <form onSubmit={entrar} className="w-full max-w-md rounded-2xl p-7 sm:p-8"
        style={{ background: 'rgba(10,16,45,0.72)', border: '1px solid rgba(96,165,250,0.35)',
                 boxShadow: '0 0 40px rgba(56,120,255,0.18)', backdropFilter: 'blur(10px)' }}>

        <h1 className="text-3xl font-bold text-center text-white">Acompanhar Pedido</h1>
        <p className="text-sm text-center mt-2" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Acesse seu painel para acompanhar o andamento do seu pedido em tempo real.
        </p>

        <div className="mt-7 space-y-3">
          <Campo Icon={User} placeholder="Digite seu CPF" value={cpf}
            onChange={e => setCpf(mascaraCPF(e.target.value))}
            inputMode="numeric" autoComplete="off" autoFocus />

          <Campo Icon={Tag} placeholder="Digite seu pedido de venda" value={pedido}
            onChange={e => setPedido(e.target.value.toUpperCase())}
            autoComplete="off" />
        </div>

        {erro && (
          <p className="flex items-start gap-2 text-sm mt-3 rounded-lg px-3 py-2"
            style={{ background: 'rgba(248,113,113,0.12)', color: '#fca5a5' }} role="alert">
            <AlertCircle size={15} className="shrink-0 mt-0.5" /> {erro}
          </p>
        )}

        <button type="submit" disabled={enviando || !cpf.trim() || !pedido.trim()}
          className="w-full mt-5 rounded-xl py-3.5 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'linear-gradient(90deg,#2563eb,#3b82f6)',
                   boxShadow: '0 0 24px rgba(59,130,246,0.45)' }}>
          {enviando ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />} Entrar
        </button>

        <p className="text-xs text-center mt-4 leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Use seu CPF no login e o número do pedido<br />(ex.: PV-000123) como acesso.
        </p>

        <div className="mt-5 pt-4 text-center" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <a href="/loja" className="text-sm inline-flex items-center gap-1.5" style={{ color: '#60a5fa' }}>
            <HelpCircle size={14} /> Precisa de ajuda? Fale com o vendedor
          </a>
        </div>
      </form>
    </div>
  );
}

function Campo({ Icon, ...props }) {
  return (
    <div className="relative">
      <Icon size={17} className="absolute left-4 top-1/2 -translate-y-1/2"
        style={{ color: 'rgba(147,197,253,0.75)' }} />
      <input {...props}
        className="w-full rounded-xl py-3.5 pl-12 pr-4 text-white placeholder:text-white/40 outline-none"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.35)' }} />
    </div>
  );
}
