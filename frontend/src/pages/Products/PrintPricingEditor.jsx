import { Plus, Trash2 } from 'lucide-react';

export const PRINT_METHODS = [
  { key: 'serigrafia', label: 'Serigrafia (1 cor)' },
  { key: 'transfer',   label: 'Transfer (2 cores)' },
  { key: 'dtf',        label: 'DTF (3 cores)' },
  { key: 'laser',      label: 'Laser' },
];

// Editor das 3 tabelas de preço por tipo de impressão.
// value = { serigrafia:{price,tiers:[]}, transfer:{...}, dtf:{...} }
export default function PrintPricingEditor({ value, onChange }) {
  const pp = value || {};
  const set = (key, data) => onChange({ ...pp, [key]: { ...(pp[key] || {}), ...data } });
  const setPrice = (key, price) => set(key, { price });
  const addTier = (key) => set(key, { tiers: [...(pp[key]?.tiers || []), { min_qty: '', max_qty: '', price: '' }] });
  const setTier = (key, i, field, v) => {
    const t = [...(pp[key]?.tiers || [])];
    t[i] = { ...t[i], [field]: v };
    set(key, { tiers: t });
  };
  const removeTier = (key, i) => set(key, { tiers: (pp[key]?.tiers || []).filter((_, idx) => idx !== i) });

  return (
    <div className="border border-violet-200 rounded-lg bg-violet-50/30 p-4 space-y-3">
      <p className="text-sm font-semibold text-violet-800">🎨 Preço por tipo de impressão (loja)</p>
      <p className="text-xs text-violet-500 -mt-1">Cada tipo tem sua própria tabela por quantidade. Deixe em branco para usar o preço de venda padrão.</p>
      {PRINT_METHODS.map(m => {
        const d = pp[m.key] || {};
        const tiers = d.tiers || [];
        return (
          <div key={m.key} className="bg-white rounded-lg border border-violet-100 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-sm font-medium text-gray-700">{m.label}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Preço base R$</span>
                <input type="number" step="0.01" min="0" className="input py-1 text-sm w-24"
                  value={d.price ?? ''} onChange={e => setPrice(m.key, e.target.value)} placeholder="0,00" />
                <button type="button" onClick={() => addTier(m.key)}
                  className="text-xs font-medium text-violet-700 bg-violet-100 hover:bg-violet-200 px-2 py-1 rounded-lg flex items-center gap-1">
                  <Plus size={12} /> faixa
                </button>
              </div>
            </div>
            {tiers.map((t, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-xs text-gray-400">De</span>
                <input type="number" className="input py-1 text-sm w-16 text-center" value={t.min_qty} onChange={e => setTier(m.key, i, 'min_qty', e.target.value)} placeholder="10" />
                <span className="text-xs text-gray-400">até</span>
                <input type="number" className="input py-1 text-sm w-16 text-center" value={t.max_qty} onChange={e => setTier(m.key, i, 'max_qty', e.target.value)} placeholder="20" />
                <span className="text-xs text-gray-400">un → R$</span>
                <input type="number" step="0.01" className="input py-1 text-sm w-20" value={t.price} onChange={e => setTier(m.key, i, 'price', e.target.value)} placeholder="0,00" />
                <button type="button" onClick={() => removeTier(m.key, i)} className="text-gray-300 hover:text-red-500"><Trash2 size={13} /></button>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

// Limpa o estado do editor para salvar (números + remove faixas vazias).
export function cleanPrintPricing(pp) {
  const out = {};
  for (const m of PRINT_METHODS) {
    const d = pp?.[m.key];
    if (!d) continue;
    const price = (d.price !== '' && d.price != null) ? parseFloat(d.price) : null;
    const tiers = (d.tiers || [])
      .map(t => ({ min_qty: parseInt(t.min_qty) || 0, max_qty: (t.max_qty === '' || t.max_qty == null) ? null : (parseInt(t.max_qty) || null), price: parseFloat(t.price) || 0 }))
      .filter(t => t.min_qty > 0 && t.price > 0);
    if ((price != null && !Number.isNaN(price)) || tiers.length) {
      out[m.key] = { ...(price != null && !Number.isNaN(price) ? { price } : {}), tiers };
    }
  }
  return out;
}
