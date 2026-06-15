import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

export default function BulkFiscalModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState({});
  const [ncm, setNcm] = useState('');
  const [cst, setCst] = useState('');
  const [cfop, setCfop] = useState('');

  const { data, isFetching } = useQuery({
    queryKey: ['bulk-products', search],
    queryFn: () => api.get(`/products?search=${encodeURIComponent(search)}&limit=300&is_active=true`),
    enabled: isOpen,
  });
  const products = data?.data || [];
  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const allSelected = products.length > 0 && products.every(p => selected[p.id]);

  function toggle(id) { setSelected(s => ({ ...s, [id]: !s[id] })); }
  function toggleAll() {
    const n = { ...selected };
    if (allSelected) products.forEach(p => delete n[p.id]);
    else products.forEach(p => { n[p.id] = true; });
    setSelected(n);
  }

  const apply = useMutation({
    mutationFn: () => api.patch('/products/bulk', { ids: selectedIds, fields: { ncm, cst, cfop } }),
    onSuccess: (r) => {
      toast.success(`${r.updated} produto(s) atualizado(s)!`);
      qc.invalidateQueries(['products']);
      qc.invalidateQueries(['bulk-products']);
      setSelected({}); setNcm(''); setCst(''); setCfop('');
    },
    onError: (e) => toast.error(e.error || 'Erro ao aplicar'),
  });

  function doSearch(e) { e.preventDefault(); setSearch(searchInput.trim()); }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cadastro fiscal em massa" size="lg">
      <div className="space-y-4">
        <p className="text-sm text-gray-500">
          Filtre por modelo (ex.: <b>long drink</b>), selecione os produtos e defina NCM / CST / CFOP.
          Apenas os campos preenchidos são aplicados.
        </p>

        <form onSubmit={doSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" placeholder="Filtrar por modelo / nome / código..."
              value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>
          <button type="submit" className="btn-secondary">Filtrar</button>
        </form>

        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-violet-600" />
              Selecionar todos ({products.length})
            </label>
            <span className="text-violet-600 font-medium">{selectedIds.length} selecionado(s)</span>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-gray-50">
            {isFetching ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>
            ) : products.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Nenhum produto. Filtre por modelo acima.</div>
            ) : products.map(p => (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} className="w-4 h-4 accent-violet-600" />
                <span className="flex-1 min-w-0">
                  <span className="font-medium block truncate">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.code || '—'} · NCM {p.ncm || '—'} · CST {p.cst || '—'} · CFOP {p.cfop || '—'}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">NCM</label>
            <input className="input" value={ncm} onChange={e => setNcm(e.target.value)} placeholder="Ex.: 39241000" />
          </div>
          <div>
            <label className="label">CST / CSOSN</label>
            <input className="input" value={cst} onChange={e => setCst(e.target.value)} placeholder="Ex.: 101" />
          </div>
          <div>
            <label className="label">CFOP</label>
            <input className="input" value={cfop} onChange={e => setCfop(e.target.value)} placeholder="Ex.: 5101" />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          Informe o CFOP interno do Paraná (ex.: <b>5101</b>). Na emissão da NF-e ele vira <b>6101</b> automaticamente para outros estados.
        </p>

        <div className="flex gap-2 justify-end pt-3 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={() => apply.mutate()}
            disabled={apply.isPending || selectedIds.length === 0 || (!ncm.trim() && !cst.trim() && !cfop.trim())}
            className="btn-primary disabled:opacity-50">
            {apply.isPending ? 'Aplicando...' : `Aplicar a ${selectedIds.length} produto(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
