import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Package, Layers, Upload, Download, Trash2, Loader2, AlertTriangle, FolderTree, Image as ImageIcon, Eye, EyeOff, ClipboardPaste } from 'lucide-react';
import api from '@/lib/api';
import { id4 } from '@/lib/ids';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import ProductForm from './ProductForm';
import BulkEditModal from './BulkEditModal';
import ImportStockModal from './ImportStockModal';
import ImportProductsModal from './ImportProductsModal';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

export default function Products() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [delTarget, setDelTarget] = useState(null); // produto a apagar (confirmação)
  const [exporting, setExporting] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [sort, setSort] = useState('name');
  const [lightbox, setLightbox] = useState(null);      // url da foto ampliada
  const [photoTarget, setPhotoTarget] = useState(null); // produto do modal "adicionar foto" (colar/arquivo)
  const uploadTargetId = useRef(null);                 // produto que vai receber a foto
  const fileInputRef = useRef(null);
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  async function exportCSV() {
    setExporting(true);
    try {
      const csv = await api.get('/products/export', { responseType: 'text' });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `produtos-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado!');
    } catch (e) {
      toast.error(e.error || 'Erro ao exportar CSV');
    } finally { setExporting(false); }
  }

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search, categoryId, sort],
    queryFn: () => {
      let url = `/products?page=${page}&limit=50`;
      if (search)     url += `&search=${encodeURIComponent(search)}`;
      if (categoryId) url += `&category_id=${categoryId}`;
      if (sort)       url += `&sort=${sort}`;
      return api.get(url);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/products/${id}`, { is_active }),
    onSuccess: () => { qc.invalidateQueries(['products']); toast.success('Produto atualizado'); },
  });

  // Visibilidade na loja: usa /bulk (altera só o campo, sem mexer em preço/dimensões).
  const storeToggleMutation = useMutation({
    mutationFn: ({ id, show_in_store }) => api.patch('/products/bulk', { ids: [id], fields: { show_in_store } }),
    onSuccess: () => { qc.invalidateQueries(['products']); toast.success('Visibilidade na loja atualizada'); },
    onError: (e) => toast.error(e.error || 'Erro ao atualizar visibilidade'),
  });

  // Foto principal via clique no card (endpoint dedicado — não mexe em outros campos).
  const imageMutation = useMutation({
    mutationFn: ({ id, image }) => api.patch(`/products/${id}/image`, { image }),
    onSuccess: () => { qc.invalidateQueries(['products']); toast.success('Foto atualizada!'); },
    onError: (e) => toast.error(e.error || 'Erro ao enviar foto'),
  });

  function applyImageFile(id, file) {
    if (!file || !id) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 8MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => imageMutation.mutate({ id, image: reader.result });
    reader.onerror = () => toast.error('Erro ao ler a imagem');
    reader.readAsDataURL(file);
  }

  function pickImageFor(id) {
    uploadTargetId.current = id;
    fileInputRef.current?.click();
  }
  function onFileChosen(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    applyImageFile(uploadTargetId.current, file);
    setPhotoTarget(null);
  }

  // Ctrl+V com o modal "Adicionar foto" aberto → cola direto no produto
  useEffect(() => {
    if (!photoTarget) return;
    function onPaste(e) {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type?.startsWith('image/')) {
          e.preventDefault();
          applyImageFile(photoTarget.id, item.getAsFile());
          setPhotoTarget(null);
          return;
        }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [photoTarget]);

  // Botão "Colar imagem copiada": lê a área de transferência direto
  async function pasteClipboardTo(id) {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await it.getType(type);
          applyImageFile(id, new File([blob], 'foto-colada.png', { type }));
          setPhotoTarget(null);
          return;
        }
      }
      toast.error('Nenhuma imagem copiada. Copie uma imagem (Ctrl+C) e tente de novo.');
    } catch {
      toast.error('Não consegui ler a área de transferência — aperte Ctrl+V com esta janela aberta.');
    }
  }

  const deleteMutation = useMutation({
    mutationFn: (id) => api.post(`/products/${id}/delete`),
    onSuccess: () => { qc.invalidateQueries(['products']); setDelTarget(null); toast.success('Produto excluído!'); },
    onError: (e) => toast.error(e.error || 'Erro ao excluir produto'),
  });

  const dedupeMutation = useMutation({
    mutationFn: () => api.post('/products/categories/dedupe'),
    onSuccess: (r) => {
      qc.invalidateQueries(['categories']); qc.invalidateQueries(['products']);
      const parts = [];
      if (r.removed > 0) parts.push(`${r.removed} duplicada(s) removida(s)`);
      if (r.backfilled > 0) parts.push(`${r.backfilled} produto(s) categorizado(s)`);
      toast.success(parts.length ? `Categorias organizadas: ${parts.join(' · ')}!` : 'Categorias já estavam organizadas');
    },
    onError: (e) => toast.error(e.error || 'Erro ao organizar categorias'),
  });

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(product) { setEditing(product); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); }
  function onSaved() { closeModal(); qc.invalidateQueries(['products']); }

  const columns = [
    { key: 'code', label: 'Código', width: 120, render: v => <span className="font-mono text-xs whitespace-nowrap">{v || '—'}</span> },
    { key: 'name', label: 'Produto',
      render: (v, row) => (
        <div className="flex items-center gap-2.5">
          {row.image_url ? (
            <img src={row.image_url} alt=""
              onClick={e => { e.stopPropagation(); setLightbox(row.image_url); }}
              className="w-9 h-9 rounded-md object-cover border border-gray-200 shrink-0 cursor-zoom-in hover:ring-2 hover:ring-violet-300 transition"
              title="Ver foto ampliada" />
          ) : (
            <button type="button"
              onClick={e => { e.stopPropagation(); setPhotoTarget(row); }}
              className="w-9 h-9 rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center shrink-0 cursor-pointer hover:border-violet-400 hover:bg-violet-50 transition"
              title="Adicionar foto (arquivo ou Ctrl+V)">
              <ImageIcon size={14} className="text-gray-300" />
            </button>
          )}
          <span className="font-medium text-gray-800">{v}</span>
        </div>
      )
    },
    { key: 'CATEGORIAS', label: 'Tipo', render: (v, row) => v?.name || row.categories?.name || '—' },
    { key: 'unit', label: 'Un.', width: 60 },
    { key: 'current_stock', label: 'Estoque', width: 100,
      render: (v, row) => (
        <span className={v <= row.min_stock ? 'text-red-600 font-semibold' : ''}>
          {Number(v).toLocaleString('pt-BR')} {row.unit}
        </span>
      )
    },
    { key: 'cost_price', label: 'Custo', width: 110, render: v => fmt(v) },
    { key: 'sale_price', label: 'Venda', width: 110, render: v => fmt(v) },
    { key: 'is_active', label: 'Status', width: 90,
      render: v => (
        <span className={v ? 'badge-green badge' : 'badge-gray badge'}>
          {v ? 'Ativo' : 'Inativo'}
        </span>
      )
    },
    { key: 'show_in_store', label: 'Loja', width: 80,
      render: v => (
        <span className={v !== false ? 'badge-green badge' : 'badge-gray badge'}>
          {v !== false ? 'Sim' : 'Não'}
        </span>
      )
    },
    { key: 'id', label: '', width: 140,
      render: (_, row) => (
        <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
          <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar">
            <Edit2 size={14} />
          </button>
          <button
            onClick={() => toggleMutation.mutate({ id: row.id, is_active: !row.is_active })}
            className="btn-ghost p-1.5"
            title={row.is_active ? 'Desativar' : 'Ativar'}
          >
            {row.is_active ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
          </button>
          <button
            onClick={() => storeToggleMutation.mutate({ id: row.id, show_in_store: row.show_in_store === false })}
            className="btn-ghost p-1.5"
            title={row.show_in_store !== false ? 'Ocultar da loja' : 'Mostrar na loja'}
          >
            {row.show_in_store !== false ? <Eye size={15} className="text-green-500" /> : <EyeOff size={15} className="text-gray-400" />}
          </button>
          <button onClick={() => setDelTarget(row)} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Apagar produto">
            <Trash2 size={14} />
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Produtos</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} produtos cadastrados</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} disabled={exporting} className="btn-secondary disabled:opacity-50" title="Exporta todos os produtos com as variações (cor/borda) já descritas, por categoria">
            {exporting ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Exportar CSV
          </button>
          <button onClick={() => setImportOpen(true)} className="btn-secondary">
            <Upload size={16} /> Importar Estoque
          </button>
          <button onClick={() => setCatalogOpen(true)} className="btn-secondary">
            <Upload size={16} /> Importar Produtos
          </button>
          <button onClick={() => setBulkOpen(true)} className="btn-secondary">
            <Layers size={16} /> Edição em massa
          </button>
          <button onClick={() => dedupeMutation.mutate()} disabled={dedupeMutation.isPending} className="btn-secondary disabled:opacity-50" title="Junta duplicadas e categoriza produtos sem categoria">
            {dedupeMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <FolderTree size={16} />} Organizar Categorias
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Novo Produto
          </button>
        </div>
      </div>

      <div className="card">
        {/* Filtros */}
        <div className="card-header flex flex-wrap items-center gap-3">
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[240px] max-w-md">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar: nome, cor, tamanho, código… (ex.: long drink amarelo 350)"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="input pl-9"
              />
            </div>
            <button type="submit" className="btn-secondary">Buscar</button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                className="btn-ghost">Limpar</button>
            )}
          </form>

          {/* Tipo */}
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }}
            className="input w-auto text-sm" title="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Ordenar */}
          <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
            className="input w-auto text-sm" title="Ordenar">
            <option value="name">A → Z</option>
            <option value="name_desc">Z → A</option>
            <option value="has_image">Com foto primeiro</option>
            <option value="recent">Últimos adicionados</option>
            <option value="code">Por código</option>
          </select>
        </div>

        <Table columns={columns} data={data?.data} loading={isLoading} onRowClick={row => openEdit(row)} />
        <Pagination page={page} total={data?.total || 0} limit={50} onPageChange={setPage} />
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Editar Produto' : 'Novo Produto'} size="lg">
        <ProductForm product={editing} onSaved={onSaved} onCancel={closeModal} />
      </Modal>

      {/* input escondido para anexar foto ao clicar no card vazio */}
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChosen} />

      {/* Adicionar foto: colar (Ctrl+V) ou escolher arquivo */}
      <Modal isOpen={!!photoTarget} onClose={() => setPhotoTarget(null)} title="Adicionar foto" size="sm">
        {photoTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600 truncate"><b>{photoTarget.name}</b></p>
            <button type="button" onClick={() => pasteClipboardTo(photoTarget.id)}
              disabled={imageMutation.isPending}
              className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-4 py-3 text-sm font-semibold transition-colors disabled:opacity-50">
              {imageMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <ClipboardPaste size={16} />}
              Colar imagem copiada (Ctrl+V)
            </button>
            <button type="button" onClick={() => pickImageFor(photoTarget.id)}
              disabled={imageMutation.isPending}
              className="w-full flex items-center justify-center gap-2 btn-secondary py-3 disabled:opacity-50">
              <Upload size={16} /> Escolher arquivo...
            </button>
            <p className="text-xs text-gray-400 text-center">
              Você também pode simplesmente apertar <b>Ctrl+V</b> agora com uma imagem copiada.
            </p>
          </div>
        )}
      </Modal>

      {/* Lightbox: foto ampliada */}
      {lightbox && (
        <div onClick={() => setLightbox(null)}
          className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6 cursor-zoom-out">
          <img src={lightbox} alt="" className="max-w-full max-h-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
        </div>
      )}

      <BulkEditModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ImportStockModal isOpen={importOpen} onClose={() => setImportOpen(false)} />
      <ImportProductsModal isOpen={catalogOpen} onClose={() => setCatalogOpen(false)} />

      {/* Confirmação de exclusão */}
      <Modal isOpen={!!delTarget} onClose={() => !deleteMutation.isPending && setDelTarget(null)} title="Apagar produto" size="sm">
        {delTarget && (
          <div className="space-y-5 text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <AlertTriangle size={30} className="text-red-500" />
            </div>
            <div>
              <p className="font-semibold text-gray-900">Tem certeza que deseja apagar este produto?</p>
              <p className="text-sm text-gray-600 mt-1">
                <b>{delTarget.code}</b> — {delTarget.name}
              </p>
              <p className="text-xs text-red-500 mt-2">Esta ação é definitiva e não pode ser desfeita.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setDelTarget(null)} disabled={deleteMutation.isPending}
                className="flex-1 btn-secondary disabled:opacity-50">Cancelar</button>
              <button onClick={() => deleteMutation.mutate(delTarget.id)} disabled={deleteMutation.isPending}
                className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50">
                {deleteMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Apagando...</> : <><Trash2 size={15} /> Apagar</>}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
