// ============================================================
// TELA 2 — Ranking de Produtos do Mês (1º ao 8º)
//
// Abre pelo "Ver ranking 1º ao 8º" do produto líder. Mostra posição,
// unidades, participação no total do mês e tendência contra o mês
// anterior; o 1º lugar ganha o destaque de Produto Líder e o botão
// "Criar oferta", que leva à seleção de clientes (Tela 3) já com este
// produto como referência.
//
// O pódio se lê pela cor antes de se ler pelo número: taça de ouro,
// prata e bronze na frente do nome, a mesma cor na barra da esquerda da
// linha e nos números daquela linha. Do 4º em diante tudo fica azul —
// não existe quarto lugar de pódio, e inventar uma cor para ele diria
// que existe.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import {
  Trophy, X, ArrowUp, ArrowDown, Tag, Info,
  Beer, Wine, Martini, CupSoda, GlassWater, Coffee,
} from 'lucide-react';
import api from '@/lib/api';
import { useVend, fmtUn, fmtPct, Hint, Trofeu, TONS_PODIO, TOM_DA_POSICAO, MESES } from './ui';

const AZUL = '#60a5fa';

/**
 * A louça de cada produto, pelo nome.
 *
 * Fora do pódio o desenho é o que diferencia as linhas de relance: oito
 * nomes parecidos ("Long Drink 350", "Long Drink 330", "Copo Eco 400")
 * viram oito linhas iguais sem ele. A busca vai do mais específico para
 * o mais genérico — "taça chandon" tem que cair em taça, não em copo.
 */
function IconeProduto({ nome, ...props }) {
  const n = String(nome || '').toLowerCase();
  if (/ta[çc]a|gin|chandon|champ|espumante/.test(n)) return <Martini {...props} />;
  if (/vinho|wine/.test(n))                          return <Wine {...props} />;
  if (/caneca|chopp|chope|mug/.test(n))              return <Beer {...props} />;
  if (/x[íi]cara|caf[ée]/.test(n))                   return <Coffee {...props} />;
  if (/twister|shake|milk/.test(n))                  return <CupSoda {...props} />;
  return <GlassWater {...props} />;
}

// "2025-12" vira "dez/2025". O mês por extenso não cabe na célula da
// tendência, e "12/2025" se confunde com dia.
function mesCurto(chave) {
  const [ano, mes] = String(chave || '').split('-');
  const i = Number(mes) - 1;
  if (!ano || !MESES[i]) return chave || 'mês anterior';
  return `${MESES[i].slice(0, 3).toLowerCase()}/${ano}`;
}

/**
 * O confete em volta da taça do líder.
 *
 * É enfeite, e enfeite tem que ser barato: são oito retângulos
 * posicionados à mão, sem animação e sem imagem. Fica atrás da taça
 * (`-z-10`) para nunca passar por cima do número.
 */
const CONFETE = [
  { t: '4%',  l: '6%',  cor: '#f7c948', g: -20 }, { t: '2%',  l: '76%', cor: '#fb923c', g: 35 },
  { t: '26%', l: '-2%', cor: '#ffe9a3', g: 60 },  { t: '20%', l: '92%', cor: '#f7c948', g: -45 },
  { t: '58%', l: '2%',  cor: '#fb923c', g: 15 },  { t: '62%', l: '88%', cor: '#ffe9a3', g: -10 },
  { t: '84%', l: '14%', cor: '#f7c948', g: 50 },  { t: '88%', l: '78%', cor: '#f7c948', g: -30 },
];

function Confete() {
  return (
    <span aria-hidden="true" className="absolute inset-0 -z-10">
      {CONFETE.map((c, i) => (
        <span key={i} className="absolute rounded-[1px]"
          style={{
            top: c.t, left: c.l, width: 4, height: 9, background: c.cor,
            transform: `rotate(${c.g}deg)`, opacity: 0.75,
          }} />
      ))}
    </span>
  );
}

// Grade única para o cabeçalho e para as linhas: as colunas só ficam
// alinhadas porque os dois leem a mesma constante.
//
// As fixas são apertadas de propósito. Cada pixel que elas tomam sai do
// nome do produto, e "Taça Chandon 1..." não diz qual taça é — o
// número cortado é justamente o que separa um produto do outro.
const COLUNAS = '70px minmax(0,1fr) 132px 100px 132px';

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
  const mesAnterior = mesCurto(data?.prev_period?.month_key);

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-6xl my-auto" style={v.card}>

        {/* ── Cabeçalho ─────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
              style={{ background: 'rgba(59,130,246,0.16)' }}>
              <Trophy size={22} style={{ color: AZUL }} />
            </div>
            <div>
              <h2 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Ranking de Produtos do Mês</h2>
              <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>1º ao {produtos.length || 8}º lugar</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:opacity-70" style={{ color: v.textMuted }}>
            <X size={22} />
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
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 px-6">

              {/* ── Tabela ────────────────────────────────── */}
              <div className="lg:col-span-2 overflow-x-auto">
                <div style={{ minWidth: 660 }}>

                  <div className="grid items-center px-4 pb-3 text-[10px] uppercase tracking-wide font-bold whitespace-nowrap"
                    style={{ gridTemplateColumns: COLUNAS, color: v.textSubtle }}>
                    <span>Posição</span>
                    <span>Produto</span>
                    <span>
                      Unidades vendidas <Hint text="Soma das unidades daquele produto nos pedidos válidos do mês." />
                    </span>
                    <span>
                      Participação <Hint text="Unidades do produto ÷ total de unidades vendidas no mês × 100." />
                    </span>
                    <span>
                      Tendência <Hint text="Variação das unidades contra o mês anterior. Produto que não vendeu no mês anterior não tem tendência." />
                    </span>
                  </div>

                  <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${v.divider}` }}>
                    {produtos.map((p, i) => {
                      const tom  = TOM_DA_POSICAO(p.position);
                      const cor  = tom ? TONS_PODIO[tom].texto : AZUL;
                      const sobe = (p.trend ?? 0) >= 0;
                      return (
                        <div key={p.product_id || p.name}
                          className="grid items-center px-4 py-3"
                          style={{
                            gridTemplateColumns: COLUNAS,
                            // A barra colorida só existe no pódio; sem ela a
                            // linha encolheria três pixels, então as demais
                            // levam uma barra transparente da mesma espessura.
                            borderLeft: `3px solid ${tom ? cor : 'transparent'}`,
                            background: tom ? `${cor}0f` : 'transparent',
                            borderBottom: i < produtos.length - 1 ? `1px solid ${v.divider}` : 'none',
                          }}>

                          <span className="text-lg font-bold" style={{ color: cor }}>{p.position}º</span>

                          <span className="flex items-center gap-2.5 min-w-0 pr-3">
                            {tom
                              ? <Trofeu size={26} numero={p.position} tom={tom} />
                              : <IconeProduto nome={p.name} size={20} style={{ color: v.textSubtle }} className="shrink-0" />}
                            <span className="truncate" style={{ color: v.textPrimary }}>{p.name}</span>
                          </span>

                          <span className="text-[15px] font-bold" style={{ color: cor }}>
                            {fmtUn(p.units)} un
                          </span>

                          <span className="text-[15px] font-bold" style={{ color: cor }}>
                            {fmtPct(p.share)}
                          </span>

                          {p.trend == null ? (
                            <span className="text-[11px]" style={{ color: v.textSubtle }}>novo no mês</span>
                          ) : (
                            <span className="flex items-center gap-2">
                              <span className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                                style={{ background: sobe ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.18)' }}>
                                {sobe
                                  ? <ArrowUp   size={13} style={{ color: '#4ade80' }} />
                                  : <ArrowDown size={13} style={{ color: '#f87171' }} />}
                              </span>
                              <span className="leading-tight">
                                <span className="block text-[13px] font-bold"
                                  style={{ color: sobe ? '#4ade80' : '#f87171' }}>
                                  {sobe ? '+' : ''}{fmtPct(p.trend)}
                                </span>
                                <span className="block text-[10px]" style={{ color: v.textSubtle }}>
                                  vs. {mesAnterior}
                                </span>
                              </span>
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* ── Destaque do líder ─────────────────────── */}
              <div className="rounded-2xl p-6 flex flex-col items-center text-center"
                style={{ background: v.surface, border: `1px solid ${v.divider}` }}>
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: v.textSubtle }}>
                  Produto líder do mês
                </p>

                {/* O brilho e o confete atrás da taça são o que separam este
                    bloco do resto do painel sem precisar de mais uma borda. */}
                <div className="relative my-4">
                  <Confete />
                  <div className="relative" style={{ filter: 'drop-shadow(0 0 22px rgba(247,201,72,0.45))' }}>
                    <Trofeu size={118} numero={1} tom="ouro" />
                  </div>
                </div>

                <p className="text-xl font-bold" style={{ color: TONS_PODIO.ouro.texto }}>{lider.name}</p>
                <p className="text-3xl font-bold mt-1" style={{ color: AZUL }}>
                  {fmtUn(lider.units)} <span className="text-base">un</span>
                </p>
                <p className="text-sm mt-1.5" style={{ color: v.textMuted }}>
                  {fmtPct(lider.share)} de participação
                </p>

                {lider.trend != null && (
                  <div className="mt-4 w-full rounded-lg py-2 flex items-center justify-center gap-2"
                    style={{ border: `1px solid ${v.divider}` }}>
                    <span className="w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: lider.trend >= 0 ? 'rgba(34,197,94,0.18)' : 'rgba(248,113,113,0.18)' }}>
                      {lider.trend >= 0
                        ? <ArrowUp   size={13} style={{ color: '#4ade80' }} />
                        : <ArrowDown size={13} style={{ color: '#f87171' }} />}
                    </span>
                    <span className="text-sm font-bold"
                      style={{ color: lider.trend >= 0 ? '#4ade80' : '#f87171' }}>
                      {lider.trend >= 0 ? '+' : ''}{fmtPct(lider.trend)}
                    </span>
                    <span className="text-xs" style={{ color: v.textSubtle }}>vs. {mesAnterior}</span>
                  </div>
                )}

                <button onClick={() => onCriarOferta?.(lider)} className="btn-primary w-full mt-4 justify-center">
                  <Tag size={15} /> Criar oferta
                </button>
              </div>
            </div>

            {/* ── Rodapé ────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-5">
              <p className="text-[11px] flex items-center gap-1.5" style={{ color: v.textSubtle }}>
                <Info size={12} className="shrink-0" />
                Participação calculada sobre o total de {fmtUn(data?.total_units)} unidades vendidas no mês.
              </p>
              <button onClick={onClose} className="btn-secondary">Fechar</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
