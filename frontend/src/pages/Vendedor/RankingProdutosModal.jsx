// ============================================================
// TELA 2 — Ranking de Produtos do Mês (1º ao 8º)
//
// Abre pelo "Ver ranking 1º ao 8º" do produto líder. Mostra posição,
// unidades, participação no total do mês e tendência contra o mês
// anterior; o 1º lugar ganha o destaque de Produto Líder e o botão
// "Criar oferta", que leva à seleção de clientes (Tela 3) já com este
// produto como referência.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { Trophy, X, ArrowUp, ArrowDown, Tag, Info } from 'lucide-react';
import api from '@/lib/api';
import { useVend, fmtUn, fmtPct, fmtBRL, Hint } from './ui';

// As três primeiras posições ganham cor de pódio; o resto fica neutro.
const PODIO = ['#f59e0b', '#cbd5e1', '#d97706'];

export default function RankingProdutosModal({ open, onClose, month, sellerId, onCriarOferta }) {
  const v = useVend();

  const { data, isLoading } = useQuery({
    queryKey: ['vendedor-ranking', month, sellerId],
    queryFn: () => api.get(`/vendedor/ranking-produtos?month=${month}${sellerId ? `&user_id=${sellerId}` : ''}`),
    enabled: open,
  });

  if (!open) return null;

  const produtos = data?.products || [];
  const lider = produtos[0];
  const mesAnterior = data?.prev_period?.month_key || 'mês anterior';

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl my-auto" style={v.card}>
        {/* Cabeçalho */}
        <div className="flex items-start justify-between gap-3 px-5 py-4"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.16)' }}>
              <Trophy size={20} style={{ color: '#60a5fa' }} />
            </div>
            <div>
              <h2 className="text-xl font-bold" style={{ color: v.textPrimary }}>Ranking de Produtos do Mês</h2>
              <p className="text-sm" style={{ color: v.textSubtle }}>1º ao {produtos.length || 8}º lugar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={20} />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center h-56">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : produtos.length === 0 ? (
          <p className="text-center py-16 text-sm" style={{ color: v.empty }}>
            Nenhum produto vendido neste mês.
          </p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-5">

            {/* Lista */}
            <div className="lg:col-span-2 overflow-x-auto">
              <div style={{ minWidth: 560 }}>
                {/* Cabeçalho — as larguras aqui casam com as das linhas abaixo */}
                <div className="flex items-center gap-3 px-3 pb-2 text-[10px] uppercase tracking-wider font-semibold"
                  style={{ color: v.textSubtle }}>
                  <span className="w-8 shrink-0">Posição</span>
                  <span className="flex-1 min-w-0">Produto</span>
                  <span className="w-24 text-right shrink-0">
                    Unidades <Hint text="Soma das unidades daquele produto nos pedidos válidos do mês." />
                  </span>
                  <span className="w-20 text-right shrink-0">
                    Particip. <Hint text="Unidades do produto ÷ total de unidades vendidas no mês × 100." />
                  </span>
                  <span className="w-28 text-right shrink-0">
                    Tendência <Hint text="Variação das unidades contra o mês anterior. Produto que não vendeu no mês anterior não tem tendência." />
                  </span>
                </div>

                <div className="space-y-2">
                  {produtos.map(p => {
                    const cor = PODIO[p.position - 1] || v.textMuted;
                    const sobe = (p.trend ?? 0) >= 0;
                    return (
                      <div key={p.product_id || p.name}
                        className="flex items-center gap-3 rounded-lg px-3 py-2.5"
                        style={{ background: v.surface, borderLeft: `3px solid ${p.position <= 3 ? cor : 'transparent'}` }}>
                        <span className="w-8 font-bold shrink-0" style={{ color: cor }}>{p.position}º</span>
                        <span className="flex-1 min-w-0 truncate font-medium flex items-center gap-2"
                          style={{ color: v.textPrimary }}>
                          {p.position <= 3 && <Trophy size={15} style={{ color: cor }} className="shrink-0" />}
                          {p.name}
                        </span>
                        <span className="w-24 text-right font-bold shrink-0"
                          style={{ color: p.position === 1 ? '#f59e0b' : '#60a5fa' }}>
                          {fmtUn(p.units)} un
                        </span>
                        <span className="w-20 text-right shrink-0"
                          style={{ color: p.position === 1 ? '#f59e0b' : v.textPrimary }}>
                          {fmtPct(p.share)}
                        </span>
                        <span className="w-28 text-right shrink-0">
                          {p.trend == null ? (
                            <span className="text-[11px]" style={{ color: v.textSubtle }}>novo no mês</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold"
                              style={{ color: sobe ? '#4ade80' : '#f87171' }}>
                              {sobe ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                              {sobe ? '+' : ''}{fmtPct(p.trend)}
                            </span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: v.textSubtle }}>
                <Info size={12} className="shrink-0" />
                Participação calculada sobre o total de {fmtUn(data?.total_units)} unidades vendidas no mês.
                Tendência comparada com {mesAnterior}.
              </p>
            </div>

            {/* Destaque do líder */}
            <div className="rounded-xl p-5 flex flex-col items-center text-center gap-1"
              style={{ background: v.surface, border: `1px solid ${v.divider}` }}>
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: v.textSubtle }}>
                Produto líder do mês
              </p>
              <Trophy size={62} className="text-yellow-400 my-2" />
              <p className="text-lg font-bold" style={{ color: '#f59e0b' }}>{lider.name}</p>
              <p className="text-2xl font-bold" style={{ color: '#60a5fa' }}>
                {fmtUn(lider.units)} <span className="text-sm">un</span>
              </p>
              <p className="text-xs" style={{ color: v.textMuted }}>{fmtPct(lider.share)} de participação</p>
              {lider.trend != null && (
                <p className="text-xs mt-1 inline-flex items-center gap-1 font-semibold"
                  style={{ color: lider.trend >= 0 ? '#4ade80' : '#f87171' }}>
                  {lider.trend >= 0 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                  {lider.trend >= 0 ? '+' : ''}{fmtPct(lider.trend)} vs {mesAnterior}
                </p>
              )}
              <p className="text-xs mt-1" style={{ color: v.textSubtle }}>
                Faturou {fmtBRL(lider.revenue)} no mês
              </p>

              <button onClick={() => onCriarOferta?.(lider)} className="btn-primary w-full mt-4">
                <Tag size={15} /> Criar oferta
              </button>
              <p className="text-[10px] leading-relaxed mt-1" style={{ color: v.textSubtle }}>
                Leva à seleção de clientes já com este produto como referência.
              </p>
            </div>
          </div>
        )}

        <div className="flex justify-end px-5 py-3" style={{ borderTop: `1px solid ${v.divider}` }}>
          <button onClick={onClose} className="btn-secondary btn-sm">Fechar</button>
        </div>
      </div>
    </div>
  );
}
