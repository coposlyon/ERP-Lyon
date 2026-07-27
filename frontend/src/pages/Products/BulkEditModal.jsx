import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, FolderPlus, Check, X, Image as ImageIcon, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

export default function BulkEditModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [selected, setSelected] = useState({});

  const [applyAll, setApplyAll] = useState(false);  // aplicar a TODOS do filtro
  // campos a aplicar (só os preenchidos)
  const [newCategoryId, setNewCategoryId] = useState(''); // '' = não alterar | '__none__' = limpar | id = define
  const [creatingType, setCreatingType] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');
  const [costPrice, setCostPrice] = useState('');
  const [ncm, setNcm] = useState('');
  const [cst, setCst] = useState('');
  const [cfop, setCfop] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: cats } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => api.get('/products/categories/list'),
    enabled: isOpen,
  });

  const effectiveSearch = search.trim();

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
  if (ncm.trim()) fields.ncm = ncm.trim();
  if (cst.trim()) fields.cst = cst.trim();
  if (cfop.trim()) fields.cfop = cfop.trim();
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

  // Ao fechar, zera a seleção e os campos para o modal abrir limpo na próxima vez.
  function handleClose() {
    setSelected({});
    setApplyAll(false);
    setNewCategoryId(''); setCreatingType(false); setNewTypeName('');
    setCostPrice('');
    setNcm(''); setCst(''); setCfop('');
    setConfirmOpen(false);
    onClose();
  }

  // Resumo da confirmação: compara os valores novos com os atuais dos produtos-alvo
  // (carregados) e conta, por campo, quantos já têm o valor / têm outro / estão vazios.
  const catName = (id) => (cats || []).find(c => c.id === id)?.name || '—';
  function buildSummary() {
    const targets = applyAll ? (products || []) : (products || []).filter(p => selected[p.id]);
    const labels = {
      category_id: 'Categoria', cost_price: 'Custo',
      ncm: 'NCM', cst: 'CST', cfop: 'CFOP',
    };
    const norm = (key, val) => {
      if (val == null) return '';
      if (key === 'category_id') return String(val || '');
      if (key === 'cost_price') return val === '' ? '' : String(Number(val));
      if (['ncm', 'cst', 'cfop'].includes(key)) return String(val).trim();
      return String(val);
    };
    const display = (key) => {
      if (key === 'category_id') return fields.category_id ? catName(fields.category_id) : 'Sem categoria';
      if (key === 'cost_price') return `R$ ${Number(fields[key]).toFixed(2)}`;
      if (['ncm', 'cst', 'cfop'].includes(key)) return String(fields[key]);
      return String(fields[key]);
    };
    const rows = Object.keys(fields).map(key => {
      const newN = norm(key, fields[key]);
      let same = 0, diff = 0, empty = 0;
      for (const p of targets) {
        const cur = key === 'show_in_store' ? (p.show_in_store !== false) : p[key];
        const curN = norm(key, cur);
        if (curN === newN) same++;
        else if (curN === '') empty++;
        else diff++;
      }
      return { key, label: labels[key] || key, value: display(key), same, diff, empty };
    });
    return { rows, analyzed: targets.length };
  }

  function doApply() {
    if (!canApply) return;
    setConfirmOpen(true);
  }
  function confirmApply() {
    setConfirmOpen(false);
    apply.mutate();
  }

  const summary = confirmOpen ? buildSummary() : null;

  return (
    <>
    <Modal isOpen={isOpen} onClose={handleClose} title="Edição em massa" size="lg">
      <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-1">
        <p className="text-sm text-gray-500">
          Filtre por <b>categoria</b> ou <b>modelo</b>, selecione os produtos e defina o que quer alterar.
          Só os campos preenchidos são aplicados.
        </p>
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
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-8 h-8 rounded-md object-cover border border-gray-200 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center shrink-0" title="Sem foto">
                    <ImageIcon size={13} className="text-gray-300" />
                  </div>
                )}
                <span className="flex-1 min-w-0">
                  <span className="font-medium block truncate">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.code || '—'}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Alterar o TIPO (categoria) em massa */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Categoria de produto</p>
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
                <option value=""></option>
                {(cats || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
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

        {/* Custo */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Custo</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Custo de compra (R$)</label>
              <input className="input" type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        {/* Fiscal */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fiscal (NCM / CST / CFOP)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <button onClick={handleClose} className="btn-secondary">Fechar</button>
          <button onClick={doApply}
            disabled={apply.isPending || !canApply}
            className="btn-primary disabled:opacity-50">
            {apply.isPending ? 'Aplicando...' : `Aplicar a ${targetCount} produto(s)`}
          </button>
        </div>
      </div>
    </Modal>

    {/* Confirmação com resumo do que será alterado */}
    <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmar edição em massa" size="md"
      footer={
        <>
          <button onClick={() => setConfirmOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={confirmApply} disabled={apply.isPending} className="btn-primary disabled:opacity-50">
            {apply.isPending ? 'Aplicando...' : 'Confirmar e aplicar'}
          </button>
        </>
      }>
      {summary && (
        <div className="space-y-4 text-sm">
          <p className="text-gray-700">
            Você vai alterar <b>{targetCount} produto(s)</b>
            {applyAll && summary.analyzed < targetCount ? <span className="text-gray-500"> (resumo baseado em {summary.analyzed} carregados)</span> : ''}.
          </p>
          {summary.rows.length === 0 ? (
            <p className="text-gray-500">Nenhum campo preenchido para alterar.</p>
          ) : (
            <div className="space-y-3">
              {summary.rows.map(r => (
                <div key={r.key} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">{r.label}</span>
                    <span className="text-violet-600 font-medium">→ {r.value}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                    {r.empty > 0 && <span className="text-green-600">{r.empty} serão preenchidos</span>}
                    {r.diff > 0 && <span className="text-amber-600">{r.diff} tinham outro valor (serão trocados)</span>}
                    {r.same > 0 && <span className="text-gray-500">{r.same} já têm esse valor</span>}
                  </div>
                  {r.same > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">
                      <AlertTriangle size={13} className="shrink-0" /> {r.same} já {r.same === 1 ? 'está preenchido' : 'estão preenchidos'} com essa informação.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-gray-600">Tem certeza que deseja continuar? Esta ação não pode ser desfeita.</p>
        </div>
      )}
    </Modal>
    </>
  );
}
