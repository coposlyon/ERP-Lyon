import { useMemo, useState } from 'react';
import { Search, Copy, Check, Package } from 'lucide-react';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

const STOP_WORDS = new Set(['DE', 'DA', 'DO', 'DOS', 'DAS', 'E', 'COM', 'PARA', 'A', 'O']);
// Iniciais do nome do modelo (ex.: "LONG DRINK TRADICIONAL" → "LDT").
export function initials(name) {
  const w = String(name || '').toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  let i = w.filter(x => !STOP_WORDS.has(x)).map(x => x[0]).join('');
  if (!i) i = w.map(x => x[0]).join('') || 'X';
  return i.slice(0, 8);
}
// Código da variação: iniciais + sequência de 4 dígitos dentro do modelo (LDT 0001).
export function variantCode(modelName, idx) {
  return `${initials(modelName)} ${String(idx + 1).padStart(4, '0')}`;
}
// Lista de variações já com código: [{ code, name }]
export function expandVariantsWithCode(p) {
  const pref = initials(p?.name || '');
  return expandVariants(p).map((name, i) => ({ name, code: `${pref} ${String(i + 1).padStart(4, '0')}` }));
}

// Expande o produto-base em todas as variações (cor × borda × volume),
// com o nome completo já descritivo. Mesma lógica do export CSV.
export function expandVariants(p) {
  if (!p) return [];
  const name = norm(p.name);
  const v = p.variations || {};
  // Lista real de variações (as linhas que de fato existem no catálogo).
  const items = [...new Set((v.items || []).map(norm).filter(Boolean))];
  if (items.length) return items;
  // Fallback (produtos antigos sem `items`): combinação cor × borda.
  const colors = [...new Set((v.colors || []).map(norm).filter(c => c && !/BORDA/i.test(c)))];
  const borders = [...new Set((v.borders || []).map(norm).filter(Boolean))];
  const volumes = [...new Set((v.volumes || []).map(norm).filter(Boolean))];
  const vols = volumes.length ? volumes : [''];
  const out = [];
  if (colors.length === 0) {
    for (const vol of vols) out.push(vol ? `${name} ${vol}` : name);
    return out;
  }
  for (const vol of vols) {
    for (const color of colors) {
      out.push(vol ? `${name} - ${color} ${vol}` : `${name} - ${color}`);
      for (const border of borders) {
        out.push(vol ? `${name} - ${color} - ${border} - ${vol}` : `${name} - ${color} - ${border}`);
      }
    }
  }
  return out;
}

export default function ProductVariantsModal({ product, onClose }) {
  const [term, setTerm] = useState('');
  const [copied, setCopied] = useState(false);

  const all = useMemo(() => expandVariantsWithCode(product), [product]);
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return all;
    return all.filter(x => x.name.toLowerCase().includes(t) || x.code.toLowerCase().includes(t));
  }, [all, term]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(filtered.map(x => `${x.code}\t${x.name}`).join('\n'));
      setCopied(true);
      toast.success(`${filtered.length} item(ns) copiado(s)`);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Não foi possível copiar');
    }
  }

  return (
    <Modal isOpen={!!product} onClose={onClose} title={product ? product.name : ''} size="lg">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Package size={15} className="text-indigo-500" />
          <span><b className="text-gray-800">{all.length}</b> variações no total</span>
        </div>

        {/* Busca + copiar */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              autoFocus
              type="text"
              placeholder="Pesquisar cor, borda, volume..."
              value={term}
              onChange={e => setTerm(e.target.value)}
              className="input pl-9 text-sm w-full"
            />
          </div>
          <button onClick={copiar} className="btn-secondary text-sm whitespace-nowrap" title="Copiar a lista (respeitando a busca)">
            {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />} Copiar
          </button>
        </div>

        {term && (
          <p className="text-xs text-gray-400">{filtered.length} de {all.length} encontrados</p>
        )}

        {/* Lista */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma variação encontrada.</p>
            ) : (
              filtered.map((x, i) => (
                <div key={i} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                  <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">{x.code}</span>
                  <span>{x.name}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
