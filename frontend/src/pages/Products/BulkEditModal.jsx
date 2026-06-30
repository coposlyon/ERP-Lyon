import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Plus, Trash2, FolderPlus, Check, X } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import PrintPricingEditor, { cleanPrintPricing } from './PrintPricingEditor';
import toast from 'react-hot-toast';

export default function BulkEditModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [finish, setFinish] = useState(''); // '' | 'tradicional' | 'degrade'
  const [border, setBorder] = useState(''); // '' | 'com' | 'sem'
  const [selected, setSelected] = useState({});

  const [applyAll, setApplyAll] = useState(false);  // aplicar a TODOS do filtro
  // campos a aplicar (só os preenchidos)
  const [newCategoryId, setNewCategoryId] = useState(''); // '' = não alterar | '__none__' = limpar | id = define
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [ncm, setNcm] = useState('');
  const [cst, setCst] = useState('');
  const [cfop, setCfop] = useState('');
  const [applyPrint, setApplyPrint] = useState(false);
  const [printPricing, setPrintPricing] = useState({});

  const { data: cats } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => api.get('/products/categories/list'),
    enabled: isOpen,
  });

  // Filtros por botão (acabamento/borda) viram termos de busca (com exclusão) automaticamente
  const finishTerm = finish === 'tradicional' ? 'tradicional' : finish === 'degrade' ? 'degradê' : '';
  const borderTerm = border === 'com' ? 'borda' : border === 'sem' ? '-borda' : '';
  const effectiveSearch = [search, finishTerm, borderTerm].filter(Boolean).join(' ').trim();

  const { data, isFetching } = useQuery({
    queryKey: ['bulk-products', effectiveSearch, categoryId],
    queryFn: () => api.get(`/products?limit=1000&is_active=true${effectiveSearch ? `&search=${encodeURIComponent(effectiveSearch)}` : ''}${categoryId ? `&category_id=${categoryId}` : ''}`),
    enabled: isOpen,
  });
  const products = data?.data || [];
  const totalMatching = data?.total || 0;
  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const allSelected = products.length > 0 && products.every(p => selected[p.id]);

  const createType = useMutation({
    mutationFn: (name) => api.post('/products/categories', { name }),
    onSuccess: async (cat) => {
      await qc.invalidateQueries(['categories-list']);
      setNewCategoryId(cat.id); setCreatingType(false); setNewTypeName('');
      toast.success('Tipo criado!');
    },
    onError: (e) => toast.error(e.error || 'Erro ao criar tipo'),
  });
  function confirmNewType() {
    const n = newTypeName.trim().toUpperCase();
    if (!n) return;
    if ((cats || []).some(c => c.name?.toUpperCase() === n)) { toast.error('Esse tipo já existe'); return; }
    createType.mutate(n);
  }

  function toggle(id) { setSelected(s => ({ ...s, [id]: !s[id] })); }
  function toggleAll() {
    const n = { ...selected };
    if (allSelected) products.forEach(p => delete n[p.id]);
    else products.forEach(p => { n[p.id] = true; });
    setSelected(n);
  }
  function doSearch(e) { e.preventDefault(); setSearch(searchInput.trim()); }

  const fields = {};
  if (newCategoryId === '__none__') fields.category_id = null;
  else if (newCategoryId) fields.category_id = newCategoryId;
  if (costPrice !== '') fields.cost_price = costPrice;
  if (salePrice !== '') fields.sale_price = salePrice;
  if (minOrder !== '') fields.min_order_qty = minOrder;
  if (ncm.trim()) fields.ncm = ncm.trim();
  if (cst.trim()) fields.cst = cst.trim();
  if (cfop.trim()) fields.cfop = cfop.trim();
  if (applyPrint) fields.print_pricing = cleanPrintPricing(printPricing);
  const hasFields = Object.keys(fields).length > 0;

  const apply = useMutation({
    mutationFn: () => api.patch('/products/bulk', applyAll
      ? { all: true, match: { search: effectiveSearch, category_id: categoryId }, fields }
      : { ids: selectedIds, fields }),
    onSuccess: (r) => {
      toast.success(`${r.updated} produto(s) atualizado(s)!`);
      qc.invalidateQueries(['products']);
      qc.invalidateQueries(['bulk-products']);
      qc.invalidateQueries(['categories']);
      qc.invalidateQueries(['categories-list']);
      setSelected({});
    },
    onError: (e) => toast.error(e.error || 'Erro ao aplicar'),
  });

  const hasFilter = !!(effectiveSearch || categoryId);
  const targetCount = applyAll ? totalMatching : selectedIds.length;
  const canApply = hasFields && (applyAll ? totalMatching > 0 : selectedIds.length > 0);

  function doApply() {
    if (applyAll) {
      const alvo = hasFilter ? `${totalMatching} produto(s) do filtro` : `TODOS os ${totalMatching} produtos do catálogo`;
      if (!window.confirm(`Confirmar: aplicar as alterações a ${alvo}? Esta ação não pode ser desfeita.`)) return;
    }
    apply.mutate();
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Edição em massa" size="lg">
      <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-1">
        <p className="text-sm text-gray-500">
          Filtre por <b>categoria</b> ou <b>modelo</b>, selecione os produtos e defina o que quer alterar.
          Só os campos preenchidos são aplicados. Preço e faixas atualizam a loja automaticamente.
        </p>
        {/* Filtros rápidos por botão (acabamento + borda) */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 bg-gray-50 rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-500">Acabamento:</span>
            {[['', 'Todos'], ['tradicional', 'Tradicional'], ['degrade', 'Degradê']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setFinish(v)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${finish === v ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>{l}</button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-gray-500">Borda:</span>
            {[['', 'Todas'], ['sem', 'Sem borda'], ['com', 'Com borda']].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setBorder(v)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${border === v ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}`}>{l}</button>
            ))}
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-col sm:flex-row gap-2">
          <select className="input sm:w-56" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Todas as categorias</option>
            {(cats || []).filter(c => c.product_count > 0).map(c => <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>)}
          </select>
          <form onSubmit={doSearch} className="flex gap-2 flex-1">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Filtrar por modelo / nome / código..."
                value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn-secondary">Filtrar</button>
          </form>
        </div>

        {/* Lista */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-violet-600" />
              Selecionar todos ({products.length})
            </label>
            <span className="text-violet-600 font-medium">{selectedIds.length} selecionado(s)</span>
          </div>
          <div className="max-h-[46vh] min-h-[260px] overflow-y-auto divide-y divide-gray-50">
            {isFetching ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>
            ) : products.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Nenhum produto. Filtre por categoria ou modelo.</div>
            ) : products.map(p => (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} className="w-4 h-4 accent-violet-600" />
                <span className="flex-1 min-w-0">
                  <span className="font-medium block truncate">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.code || '—'} · Venda R$ {Number(p.sale_price || 0).toFixed(2)} · mín. {p.min_order_qty || 1}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Alterar o TIPO (categoria) em massa */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tipo do produto</p>
          {creatingType ? (
            <div className="flex gap-2">
              <input className="input flex-1 uppercase" autoFocus value={newTypeName}
                onChange={e => setNewTypeName(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmNewType(); } if (e.key === 'Escape') { setCreatingType(false); setNewTypeName(''); } }}
                placeholder="NOME DO NOVO TIPO (ex.: LONG DRINK - BORDA)" />
              <button type="button" onClick={confirmNewType} disabled={createType.isPending} className="btn-primary px-3" title="Salvar tipo">
                {createType.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              </button>
              <button type="button" onClick={() => { setCreatingType(false); setNewTypeName(''); }} className="btn-secondary px-3"><X size={15} /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select className="input flex-1" value={newCategoryId} onChange={e => setNewCategoryId(e.target.value)}>
                <option value="">— não alterar o tipo —</option>
                <option value="__none__">Sem tipo (limpar)</option>
                {(cats || []).filter(c => c.name?.toUpperCase().includes('LONG DRINK') || c.id === newCategoryId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <button type="button" onClick={() => setCreatingType(true)} className="btn-secondary px-3 whitespace-nowrap" title="Criar novo tipo">
                <FolderPlus size={15} /> Novo tipo
              </button>
            </div>
          )}
          {newCategoryId && newCategoryId !== '__none__' && (
            <p className="text-xs text-violet-600 mt-1">Os produtos selecionados passam a ser do tipo <b>{(cats || []).find(c => c.id === newCategoryId)?.name}</b>.</p>
          )}
        </div>

        {/* Preço + qtd mínima */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Preço e quantidade</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Custo (R$)</label>
              <input className="input" type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="label">Venda (R$)</label>
              <input className="input" type="number" step="0.01" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="—" />
            </div>
            <div>
              <label className="label">Qtd. mínima (loja)</label>
              <input className="input" type="number" min="1" value={minOrder} onChange={e => setMinOrder(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        {/* Tabelas de preço por impressão (Serigrafia 1 Cor / 2 Cores / Transfer / Laser) */}
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
            <input type="checkbox" checked={applyPrint} onChange={e => setApplyPrint(e.target.checked)} className="w-4 h-4 accent-violet-600" />
            Substituir as tabelas de preço (Serigrafia 1 Cor, 2 Cores, Transfer, Laser Frente, Laser F/V)
          </label>
          {applyPrint && <PrintPricingEditor value={printPricing} onChange={setPrintPricing} />}
        </div>

        {/* Fiscal */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fiscal (NCM / CST / CFOP)</p>
          <div className="grid grid-cols-3 gap-3">
            <input className="input" value={ncm} onChange={e => setNcm(e.target.value)} placeholder="NCM" />
            <input className="input" value={cst} onChange={e => setCst(e.target.value)} placeholder="CST / CSOSN" />
            <input className="input" value={cfop} onChange={e => setCfop(e.target.value)} placeholder="CFOP (ex.: 5101)" />
          </div>
          <p className="text-xs text-gray-400 mt-1">CFOP interno do Paraná (5101) vira 6101 automático para outros estados na NF-e.</p>
        </div>

        {/* Aplicar a todos do filtro */}
        <label className={`flex items-start gap-2 text-sm rounded-xl border p-3 cursor-pointer ${applyAll ? 'border-violet-300 bg-violet-50' : 'border-gray-200'}`}>
          <input type="checkbox" checked={applyAll} onChange={e => setApplyAll(e.target.checked)} className="mt-0.5 w-4 h-4 accent-violet-600" />
          <span>
            <span className="font-medium text-gray-800">
              Aplicar a TODOS os {totalMatching} produtos {hasFilter ? 'do filtro' : 'do catálogo'}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Ignora a seleção e altera todos que casam com o filtro atual (tipo + busca), mesmo além dos {products.length} visíveis.
              {!hasFilter && <b className="text-amber-600"> Sem filtro = aplica ao catálogo inteiro.</b>}
            </span>
          </span>
        </label>

        <div className="flex gap-2 justify-end pt-3 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={onClose} className="btn-secondary">Fechar</button>
          <button onClick={doApply}
            disabled={apply.isPending || !canApply}
            className="btn-primary disabled:opacity-50">
            {apply.isPending ? 'Aplicando...' : `Aplicar a ${targetCount} produto(s)`}
          </button>
        </div>
      </div>
    </Modal>
  );
}
