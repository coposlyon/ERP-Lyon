import { Plus, Trash2 } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';

export const PRINT_METHODS = [
  { key: 'serigrafia_1', label: 'Serigrafia 1 Cor' },
  { key: 'serigrafia_2', label: 'Serigrafia 2 Cores' },
  { key: 'transfer',     label: 'Transfer' },
  { key: 'laser_frente', label: 'Gravação a Laser - Frente' },
  { key: 'laser_fv',     label: 'Gravação a Laser - Frente e Verso' },
];

const fmt = v => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');

// Editor das tabelas de preço por impressão.
// Só faixas por quantidade (sem preço base). value = { serigrafia_1:{tiers:[]}, ... }
export default function PrintPricingEditor({ value, onChange }) {
  const pp = value || {};
  // condições de pagamento (juros/desconto) p/ mostrar os valores calculados ao lado da faixa
  const { data: ptData } = useQuery({ queryKey: ['payment-terms'], queryFn: () => api.get('/sales/payment-terms') });
  const terms = (ptData?.data || []).filter(t => Number(t.percent) !== 0); // ignora "à vista" (0%)

  const set = (key, data) => onChange({ ...pp, [key]: { ...(pp[key] || {}), ...data } });
  const addTier = (key) => set(key, { tiers: [...(pp[key]?.tiers || []), { min_qty: '', max_qty: '', price: '' }] });
  const setTier = (key, i, field, v) => {
    const t = [...(pp[key]?.tiers || [])];
    t[i] = { ...t[i], [field]: v };
    set(key, { tiers: t });
  };
  const removeTier = (key, i) => set(key, { tiers: (pp[key]?.tiers || []).filter((_, idx) => idx !== i) });

  return (
    <div className="border border-violet-200 rounded-lg bg-violet-50/30 p-4 space-y-3">
      <p className="text-sm font-semibold text-violet-800">🎨 Tabelas de preço por impressão</p>
      <p className="text-xs text-violet-500 -mt-1">
        Cada tipo tem sua tabela por <b>quantidade</b>. Os valores de <b>PIX / parcelas</b> são calculados sozinhos pelos
        juros — ajuste os % em <b>Configurações → Pagamento</b>.
      </p>
      {PRINT_METHODS.map(m => {
        const tiers = pp[m.key]?.tiers || [];
        return (
          <div key={m.key} className="bg-white rounded-lg border border-violet-100 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-gray-700">{m.label}</span>
              <button type="button" onClick={() => addTier(m.key)}
                className="text-xs font-medium text-violet-700 bg-violet-100 hover:bg-violet-200 px-2 py-1 rounded-lg flex items-center gap-1">
                <Plus size={12} /> faixa
              </button>
            </div>
            {tiers.length === 0 && <p className="text-xs text-gray-400">Sem faixas. Clique em "faixa" para adicionar.</p>}
            {tiers.map((t, i) => {
              const base = parseFloat(String(t.price).replace(',', '.')) || 0;
              return (
                <div key={i} className="border-b border-gray-50 last:border-0 pb-2 last:pb-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <span className="text-xs text-gray-400">De</span>
                    <input type="number" className="input py-1 text-sm w-16 text-center" value={t.min_qty} onChange={e => setTier(m.key, i, 'min_qty', e.target.value)} placeholder="10" />
                    <span className="text-xs text-gray-400">até</span>
                    <input type="number" className="input py-1 text-sm w-16 text-center" value={t.max_qty} onChange={e => setTier(m.key, i, 'max_qty', e.target.value)} placeholder="20" />
                    <span className="text-xs text-gray-400">un → R$</span>
                    <input type="number" step="0.01" className="input py-1 text-sm w-20" value={t.price} onChange={e => setTier(m.key, i, 'price', e.target.value)} placeholder="0,00" />
                    <button type="button" onClick={() => removeTier(m.key, i)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
                  </div>
                  {base > 0 && terms.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 pl-2 text-[11px]">
                      {terms.map((term, k) => {
                        const v = base * (1 + (Number(term.percent) || 0) / 100);
                        const isDesc = Number(term.percent) < 0;
                        return (
                          <span key={k} className={isDesc ? 'text-green-600' : 'text-gray-500'} title={`${term.percent > 0 ? '+' : ''}${term.percent}%`}>
                            {term.label}: <b>{fmt(v)}</b>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// Limpa o estado do editor para salvar (números + remove faixas vazias). Só tiers (sem preço base).
export function cleanPrintPricing(pp) {
  const out = {};
  for (const m of PRINT_METHODS) {
    const d = pp?.[m.key];
    if (!d) continue;
    const tiers = (d.tiers || [])
      .map(t => ({ min_qty: parseInt(t.min_qty) || 0, max_qty: (t.max_qty === '' || t.max_qty == null) ? null : (parseInt(t.max_qty) || null), price: parseFloat(String(t.price).replace(',', '.')) || 0 }))
      .filter(t => t.min_qty > 0 && t.price > 0);
    if (tiers.length) out[m.key] = { tiers };
  }
  return out;
}
