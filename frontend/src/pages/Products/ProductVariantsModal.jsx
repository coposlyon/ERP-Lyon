import { useMemo, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Copy, Check, Package, Pencil, Upload, X, Loader2, ImageOff } from 'lucide-react';
import api from '@/lib/api';
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
export function variantCode(modelName, idx) {
  return `${initials(modelName)} ${String(idx + 1).padStart(4, '0')}`;
}

// Lista de nomes das variações (strings). Usa variations.items quando existe.
export function expandVariants(p) {
  if (!p) return [];
  const name = norm(p.name);
  const v = p.variations || {};
  const items = [...new Set((v.items || []).map(norm).filter(Boolean))];
  if (items.length) return items;
  // Fallback (produtos antigos sem `items`): combinação cor × borda.
  const colors = [...new Set((v.colors || []).map(norm).filter(c => c && !/BORDA/i.test(c)))];
  const borders = [...new Set((v.borders || []).map(norm).filter(Boolean))];
  const volumes = [...new Set((v.volumes || []).map(norm).filter(Boolean))];
  const vols = volumes.length ? volumes : [''];
  const out = [];
  if (colors.length === 0) { for (const vol of vols) out.push(vol ? `${name} ${vol}` : name); return out; }
  for (const vol of vols) for (const color of colors) {
    out.push(vol ? `${name} - ${color} ${vol}` : `${name} - ${color}`);
    for (const border of borders) out.push(vol ? `${name} - ${color} - ${border} - ${vol}` : `${name} - ${color} - ${border}`);
  }
  return out;
}

// Variações com código, índice e foto (variations.images[nome]).
export function expandVariantsWithCode(p) {
  const pref = initials(p?.name || '');
  const images = (p?.variations && p.variations.images) || {};
  return expandVariants(p).map((name, i) => ({
    name, index: i, code: `${pref} ${String(i + 1).padStart(4, '0')}`, image: images[name] || null,
  }));
}

export default function ProductVariantsModal({ product, onClose }) {
  const qc = useQueryClient();
  const [term, setTerm] = useState('');
  const [copied, setCopied] = useState(false);
  const [editIdx, setEditIdx] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', image: null });
  const fileRef = useRef();

  // Busca os dados frescos do produto (pra refletir edições/fotos na hora)
  const { data: fresh } = useQuery({
    queryKey: ['product-variants-detail', product?.id],
    queryFn: () => api.get(`/products/${product.id}`),
    enabled: !!product?.id,
  });
  const prod = fresh || product;
  const hasItems = (prod?.variations?.items?.length || 0) > 0;

  const all = useMemo(() => expandVariantsWithCode(prod), [prod]);
  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return all;
    return all.filter(x => x.name.toLowerCase().includes(t) || x.code.toLowerCase().includes(t));
  }, [all, term]);

  const saveMut = useMutation({
    mutationFn: ({ index, name, oldName, image }) => api.patch(`/products/${prod.id}/variation`, { index, name, oldName, image }),
    onSuccess: () => {
      qc.invalidateQueries(['product-variants-detail', prod.id]);
      qc.invalidateQueries(['products']); qc.invalidateQueries(['stock-report']); qc.invalidateQueries(['pdv-all-products']);
      setEditIdx(null);
      toast.success('Variação atualizada!');
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  function startEdit(v) { setEditForm({ name: v.name, image: v.image, oldName: v.name, index: v.index }); setEditIdx(v.index); }
  function pickPhoto(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setEditForm(s => ({ ...s, image: reader.result }));
    reader.readAsDataURL(file);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(filtered.map(x => `${x.code}\t${x.name}`).join('\n'));
      setCopied(true); toast.success(`${filtered.length} item(ns) copiado(s)`); setTimeout(() => setCopied(false), 1500);
    } catch { toast.error('Não foi possível copiar'); }
  }

  return (
    <Modal isOpen={!!product} onClose={onClose} title={product ? product.name : ''} size="lg">
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Package size={15} className="text-indigo-500" />
          <span><b className="text-gray-800">{all.length}</b> variações no total</span>
          {hasItems && <span className="text-xs text-gray-400">· clique em ✎ para editar nome/foto</span>}
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input autoFocus type="text" placeholder="Pesquisar cor, borda, volume, código..."
              value={term} onChange={e => setTerm(e.target.value)} className="input pl-9 text-sm w-full" />
          </div>
          <button onClick={copiar} className="btn-secondary text-sm whitespace-nowrap" title="Copiar a lista (respeitando a busca)">
            {copied ? <Check size={15} className="text-green-500" /> : <Copy size={15} />} Copiar
          </button>
        </div>

        {term && <p className="text-xs text-gray-400">{filtered.length} de {all.length} encontrados</p>}

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="max-h-[55vh] overflow-y-auto divide-y divide-gray-50">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhuma variação encontrada.</p>
            ) : filtered.map((x) => (
              editIdx === x.index ? (
                /* ── Editor inline ── */
                <div key={x.index} className="px-4 py-3 bg-indigo-50/40">
                  <div className="flex gap-3">
                    <div className="shrink-0">
                      {editForm.image
                        ? <img src={editForm.image} alt="" className="w-16 h-16 rounded-lg object-cover border border-gray-200" />
                        : <div className="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center text-gray-300"><ImageOff size={20} /></div>}
                    </div>
                    <div className="flex-1 min-w-0 space-y-2">
                      <div>
                        <label className="text-[11px] text-gray-500">Nome da variação</label>
                        <input className="input text-sm" value={editForm.name}
                          onChange={e => setEditForm(s => ({ ...s, name: e.target.value.toUpperCase() }))} />
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => fileRef.current?.click()} className="btn-secondary btn-sm text-xs">
                          <Upload size={13} /> {editForm.image ? 'Trocar foto' : 'Adicionar foto'}
                        </button>
                        {editForm.image && (
                          <button type="button" onClick={() => setEditForm(s => ({ ...s, image: null }))} className="text-xs text-red-500 hover:underline">Remover foto</button>
                        )}
                        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 mt-2">
                    <button onClick={() => setEditIdx(null)} disabled={saveMut.isPending} className="btn-secondary btn-sm text-xs">Cancelar</button>
                    <button onClick={() => saveMut.mutate({ index: editForm.index, name: editForm.name.trim(), oldName: editForm.oldName, image: editForm.image })}
                      disabled={saveMut.isPending || !editForm.name.trim()} className="btn-primary btn-sm text-xs disabled:opacity-50">
                      {saveMut.isPending ? <><Loader2 size={13} className="animate-spin" /> Salvando...</> : <><Check size={13} /> Salvar</>}
                    </button>
                  </div>
                </div>
              ) : (
                /* ── Linha normal ── */
                <div key={x.index} className="px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-3">
                  {x.image
                    ? <img src={x.image} alt="" className="w-9 h-9 rounded object-cover border border-gray-100 shrink-0" />
                    : <div className="w-9 h-9 rounded bg-gray-50 flex items-center justify-center text-gray-300 shrink-0"><ImageOff size={14} /></div>}
                  <span className="text-[11px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0 whitespace-nowrap">{x.code}</span>
                  <span className="flex-1 min-w-0">{x.name}</span>
                  {hasItems && (
                    <button onClick={() => startEdit(x)} className="btn-ghost p-1.5 shrink-0" title="Editar nome / foto">
                      <Pencil size={14} />
                    </button>
                  )}
                </div>
              )
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
