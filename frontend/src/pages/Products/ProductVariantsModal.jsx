import { useMemo, useState } from 'react';
import { Search, Copy, Check, Package } from 'lucide-react';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

const norm = s => String(s || '').replace(/\s+/g, ' ').trim();

// Expande o produto-base em todas as variações (cor × borda × volume),
// com o nome completo já descritivo. Mesma lógica do export CSV.
export function expandVariants(p) {
  if (!p) return [];
  const name = norm(p.name);
  const v = p.variations || {};
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

  const all = useMemo(() => expandVariants(product), [product]);
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return all;
    return all.filter(n => n.toLowerCase().includes(t));
  }, [all, term]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(filtered.join('\n'));
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
              filtered.map((nome, i) => (
                <div key={i} className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                  <span className="text-[11px] font-mono text-gray-300 w-10 shrink-0 text-right">{i + 1}</span>
                  <span>{nome}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}
