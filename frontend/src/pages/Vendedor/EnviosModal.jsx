// ============================================================
// Registro de envios — o antídoto do "disparo cego".
//
// Uma linha por cliente, com o texto que ELE recebeu (não o modelo),
// hora, status e a resposta que veio de volta. É o que responde
// "o que foi enviado para a Casas do Tur no dia 14, por quem, com qual
// produto, e o que ela respondeu".
//
// Vendedor vê os próprios envios; gerente e admin veem os de todos.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ClipboardList, X, Search, Check, CheckCheck, Clock, AlertTriangle,
  PhoneOff, MessageCircle, RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';
import { useVend, fmtDate } from './ui';

// O ciclo de vida de uma mensagem, do clique até a resposta.
const STATUS = {
  pending:   { label: 'Aguardando', Icon: Clock,         cor: '#94a3b8' },
  sent:      { label: 'Enviada',    Icon: Check,         cor: '#60a5fa' },
  delivered: { label: 'Entregue',   Icon: CheckCheck,    cor: '#38bdf8' },
  read:      { label: 'Lida',       Icon: CheckCheck,    cor: '#22d3ee' },
  replied:   { label: 'Respondeu',  Icon: MessageCircle, cor: '#4ade80' },
  failed:    { label: 'Falhou',     Icon: AlertTriangle, cor: '#f87171' },
  no_phone:  { label: 'Sem telefone', Icon: PhoneOff,    cor: '#fbbf24' },
};
const statusDe = s => STATUS[s] || STATUS.pending;

const dataHora = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

export default function EnviosModal({ open, onClose, ofertaId = null, sellerId = '' }) {
  const v = useVend();
  const [busca, setBusca]   = useState('');
  const [filtro, setFiltro] = useState('');
  const [aberto, setAberto] = useState(null);   // id da linha expandida

  const params = new URLSearchParams();
  if (ofertaId) params.set('oferta_id', ofertaId);
  if (sellerId) params.set('user_id', sellerId);

  const { data: envios = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['vendedor-envios', ofertaId, sellerId],
    queryFn: () => api.get(`/vendedor/envios?${params.toString()}`),
    enabled: open,
  });

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return envios.filter(e =>
      (!filtro || e.status === filtro) &&
      (!termo || `${e.customer_name || ''} ${e.phone || ''} ${e.product_name || ''}`.toLowerCase().includes(termo))
    );
  }, [envios, busca, filtro]);

  const resumo = useMemo(() => {
    const r = {};
    envios.forEach(e => { r[e.status] = (r[e.status] || 0) + 1; });
    return r;
  }, [envios]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl my-auto flex flex-col" style={{ ...v.card, maxHeight: '94vh' }}>

        <div className="flex items-start justify-between gap-3 px-5 py-4 shrink-0"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.16)' }}>
              <ClipboardList size={20} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: v.textPrimary }}>
                {ofertaId ? 'Envios desta campanha' : 'Registro de envios'}
              </h2>
              <p className="text-sm" style={{ color: v.textSubtle }}>
                Cliente, telefone, produto, data/hora, vendedor, status e resposta — um por linha.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={20} />
          </button>
        </div>

        {/* Filtros e resumo */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-3 shrink-0">
          <div className="relative flex-1 min-w-[180px]">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: v.textSubtle }} />
            <input value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por cliente, telefone ou produto..."
              style={{ ...v.control, paddingLeft: '2.25rem', width: '100%' }} />
          </div>
          <button onClick={() => setFiltro('')} className="px-3 py-1.5 rounded-lg text-[11px] font-semibold"
            style={!filtro ? { background: '#2563eb', color: 'white' }
                           : { background: v.surface, color: v.textMuted, border: `1px solid ${v.divider}` }}>
            Todos ({envios.length})
          </button>
          {Object.entries(resumo).map(([s, n]) => {
            const st = statusDe(s);
            return (
              <button key={s} onClick={() => setFiltro(f => f === s ? '' : s)}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5"
                style={filtro === s ? { background: st.cor, color: '#0b1020' }
                                    : { background: v.surface, color: st.cor, border: `1px solid ${v.divider}` }}>
                <st.Icon size={12} /> {st.label} ({n})
              </button>
            );
          })}
          <button onClick={() => refetch()} title="Atualizar" className="p-2 rounded-lg" style={{ color: v.textMuted }}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 pb-3">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : lista.length === 0 ? (
            <p className="text-center py-14 text-sm" style={{ color: v.empty }}>
              {envios.length === 0
                ? 'Nenhuma oferta enviada ainda. Cada disparo passa a aparecer aqui, cliente por cliente.'
                : 'Nenhum envio com esses filtros.'}
            </p>
          ) : (
            <div style={{ minWidth: 860 }}>
              <div className="flex items-center gap-3 px-3 py-2 sticky top-0 z-10 text-[10px] uppercase tracking-wider font-semibold"
                style={{ background: v.isDark ? 'rgba(17,17,27,0.92)' : '#ffffff',
                         borderBottom: `1px solid ${v.divider}`, color: v.textSubtle }}>
                <span className="flex-1 min-w-0">Cliente</span>
                <span className="w-36 shrink-0">Telefone</span>
                <span className="w-48 shrink-0">Produto ofertado</span>
                <span className="w-36 shrink-0">Data / hora</span>
                <span className="w-32 shrink-0">Vendedor</span>
                <span className="w-32 shrink-0">Status</span>
              </div>

              {lista.map(e => {
                const st = statusDe(e.status);
                const exp = aberto === e.id;
                return (
                  <div key={e.id} style={{ borderBottom: `1px solid ${v.divider}` }}>
                    <button onClick={() => setAberto(x => x === e.id ? null : e.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-sm text-left hover:opacity-90">
                      <span className="flex-1 min-w-0 truncate" style={{ color: v.textPrimary }}>{e.customer_name || '—'}</span>
                      <span className="w-36 shrink-0 truncate" style={{ color: v.textMuted }}>{e.phone || '—'}</span>
                      <span className="w-48 shrink-0 truncate" style={{ color: v.textMuted }}>{e.product_name || '—'}</span>
                      <span className="w-36 shrink-0" style={{ color: v.textMuted }}>{dataHora(e.sent_at || e.created_at)}</span>
                      <span className="w-32 shrink-0 truncate" style={{ color: v.textMuted }}>{e.user_name || '—'}</span>
                      <span className="w-32 shrink-0 flex items-center gap-1.5 font-semibold" style={{ color: st.cor }}>
                        <st.Icon size={13} /> {st.label}
                      </span>
                    </button>

                    {/* O que este cliente realmente recebeu, e o que respondeu */}
                    {exp && (
                      <div className="px-3 pb-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                        <div className="rounded-lg p-3" style={{ background: v.surface }}>
                          <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: v.textSubtle }}>
                            Mensagem recebida
                          </p>
                          {e.image_url && (
                            <img src={e.image_url} alt="Arte enviada" className="rounded mb-2" style={{ maxHeight: 140 }} />
                          )}
                          <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: v.textPrimary }}>
                            {e.message}
                          </p>
                        </div>
                        <div className="rounded-lg p-3 space-y-2" style={{ background: v.surface }}>
                          <p className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: v.textSubtle }}>
                            Resposta do cliente
                          </p>
                          {e.reply_text ? (
                            <>
                              <p className="text-[13px] whitespace-pre-wrap break-words" style={{ color: '#4ade80' }}>
                                {e.reply_text}
                              </p>
                              <p className="text-[10px]" style={{ color: v.textSubtle }}>em {dataHora(e.replied_at)}</p>
                            </>
                          ) : (
                            <p className="text-[13px]" style={{ color: v.empty }}>Sem resposta até agora.</p>
                          )}
                          {e.error && (
                            <p className="text-[11px]" style={{ color: '#f87171' }}>Erro no envio: {e.error}</p>
                          )}
                          <div className="text-[10px] space-y-0.5 pt-1" style={{ color: v.textSubtle }}>
                            {e.delivered_at && <p>Entregue em {dataHora(e.delivered_at)}</p>}
                            {e.read_at && <p>Lida em {dataHora(e.read_at)}</p>}
                            <p>Campanha criada em {fmtDate(e.created_at)}</p>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-5 py-3 shrink-0"
          style={{ borderTop: `1px solid ${v.divider}` }}>
          <p className="text-[11px]" style={{ color: v.textSubtle }}>
            Entregue, lida e a resposta chegam pelo webhook do WhatsApp — configure-o no painel da Meta
            apontando para <b>/api/webhooks/whatsapp</b>.
          </p>
          <button onClick={onClose} className="btn-secondary btn-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}
