// ============================================================
// Novo Pedido — duas portas, e a preferida é a de cima.
//
// A prioridade é o CLIENTE lançar o próprio pedido pelo site: ele digita
// o próprio nome, o próprio CEP e o próprio e-mail, e o que ele errar
// ele mesmo vê. Cada campo que o vendedor digita no lugar do cliente é
// um campo que pode sair errado sem ninguém perceber.
//
// A porta de baixo existe porque a realidade também: cliente idoso no
// balcão, atendimento por telefone, quem não se dá bem com celular.
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Link2, PenLine, X, Copy, Check, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVend } from './ui';
import { linkDaLoja } from './Catalogo';

export default function NovoPedidoModal({ open, onClose }) {
  const v = useVend();
  const navigate = useNavigate();
  const [copiado, setCopiado] = useState(false);
  const link = linkDaLoja();

  if (!open) return null;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link);
      setCopiado(true);
      toast.success('Link copiado');
      setTimeout(() => setCopiado(false), 2000);
    } catch { toast.error('Não foi possível copiar — selecione o link e copie à mão'); }
  }

  const zap = `https://wa.me/?text=${encodeURIComponent(
    `Olá! Faça seu pedido direto no nosso site, é rápido: ${link}`)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-lg" style={v.card}>
        <div className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div>
            <h2 className="text-lg font-bold" style={{ color: v.textPrimary }}>Novo Pedido</h2>
            <p className="text-sm" style={{ color: v.textSubtle }}>Como este pedido vai entrar?</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={18} />
          </button>
        </div>

        <div className="p-5 space-y-3">

          {/* Opção preferencial */}
          <div className="rounded-xl p-4" style={{ background: v.surface, border: '1px solid rgba(37,99,235,0.5)' }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(37,99,235,0.2)' }}>
                <Link2 size={19} style={{ color: '#60a5fa' }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold flex items-center gap-2" style={{ color: v.textPrimary }}>
                  Enviar link para o cliente
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: 'rgba(37,99,235,0.25)', color: '#93c5fd' }}>recomendado</span>
                </p>
                <p className="text-[12px] mt-0.5" style={{ color: v.textMuted }}>
                  O cliente se cadastra, escolhe produto e quantidade, informa o CEP, o frete, a data do
                  evento e o pagamento. Menos digitação sua, menos erro de cadastro.
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
              style={{ background: v.control.background, border: v.control.border }}>
              <span className="flex-1 min-w-0 truncate text-[12px] font-mono" style={{ color: v.textMuted }}>{link}</span>
              <button onClick={copiar} className="btn-secondary btn-sm shrink-0">
                {copiado ? <Check size={13} /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar'}
              </button>
            </div>

            <a href={zap} target="_blank" rel="noreferrer"
              className="btn w-full mt-2" style={{ background: '#16a34a', color: 'white' }}>
              <MessageCircle size={15} /> Enviar pelo WhatsApp
            </a>
          </div>

          {/* Opção de exceção */}
          <button onClick={() => { onClose(); navigate('/sales/new'); }}
            className="w-full rounded-xl p-4 text-left"
            style={{ background: v.surface, border: `1px solid ${v.divider}` }}>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: 'rgba(148,163,184,0.18)' }}>
                <PenLine size={19} style={{ color: v.textMuted }} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold" style={{ color: v.textPrimary }}>Lançar pedido manualmente</p>
                <p className="text-[12px] mt-0.5" style={{ color: v.textMuted }}>
                  Para atendimento presencial, telefone ou cliente que não se dá bem com o celular.
                  O sistema registra você como responsável, com data, hora e origem.
                </p>
              </div>
            </div>
          </button>

          <p className="text-[11px] text-center" style={{ color: v.textSubtle }}>
            Nos dois caminhos o pedido entra na sua carteira e conta para a sua meta.
          </p>
        </div>
      </div>
    </div>
  );
}
