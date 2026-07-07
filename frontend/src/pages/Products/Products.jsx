import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Package, Layers, Upload, Download, Trash2, Loader2, AlertTriangle, FolderTree, Image as ImageIcon, Eye, EyeOff, ClipboardPaste, Palette } from 'lucide-react';
import api from '@/lib/api';
import { id4 } from '@/lib/ids';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import ProductForm from './ProductForm';
import BulkEditModal from './BulkEditModal';
import ImportStockModal from './ImportStockModal';
import ImportProductsModal from './ImportProductsModal';
import { loadImage, recolorCup } from './recolorCup';
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
  const [linha, setLinha] = useState('');   // '' | tradicional | degrad | bicolor | jateado
  const [cor, setCor] = useState('');       // nome da cor (ex.: AMARELO LIMÃO)
  const [borda, setBorda] = useState('');   // '' | 'borda' (com) | '-borda' (sem)
  const [volume, setVolume] = useState(''); // '' | '350' | '500'...
  const [sort, setSort] = useState('name');
  const [lightbox, setLightbox] = useState(null);      // url da foto ampliada
  const [photoTarget, setPhotoTarget] = useState(null); // produto do modal "adicionar foto" (colar/arquivo)
  const [genOpen, setGenOpen] = useState(false);        // modal do "Gerar Fotos"
  const [genBusy, setGenBusy] = useState(false);
  const [genCount, setGenCount] = useState(0);
  const [genTotal, setGenTotal] = useState(0);
  const [template, setTemplate] = useState(null);       // foto modelo (dataURL)
  const [useFilter, setUseFilter] = useState(false);    // aplicar só ao filtro atual
  const [sample, setSample] = useState(null);           // amostra { img, name }
  const [sampleBusy, setSampleBusy] = useState(false);
  const [clearConfirm, setClearConfirm] = useState(false); // confirma remover fotos geradas
  const [clearBusy, setClearBusy] = useState(false);
  const uploadTargetId = useRef(null);                 // produto que vai receber a foto
  const fileInputRef = useRef(null);
  const qc = useQueryClient();

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  // Opções dos filtros (cores e tamanhos que existem no catálogo)
  const { data: filterOpts } = useQuery({
    queryKey: ['product-filters'],
    queryFn: () => api.get('/products/filters'),
  });
  const colorOptions = filterOpts?.colors || [];
  const volumeOptions = filterOpts?.volumes || [];

  // Os filtros viram termos de busca (o backend exige TODOS os termos;
  // prefixo "-" exclui — ex.: "-borda" = sem borda)
  const effectiveSearch = [search, linha, cor, borda, volume].filter(Boolean).join(' ').trim();

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
    queryKey: ['products', page, effectiveSearch, categoryId, sort],
    queryFn: () => {
      let url = `/products?page=${page}&limit=50`;
      if (effectiveSearch) url += `&search=${encodeURIComponent(effectiveSearch)}`;
      if (categoryId)      url += `&category_id=${categoryId}`;
      if (sort)            url += `&sort=${sort}`;
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

  // lê o arquivo escolhido como foto modelo
  function pickTemplate(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    const reader = new FileReader();
    reader.onload = () => { setTemplate(reader.result); setSample(null); };
    reader.readAsDataURL(file);
  }

  // Gera UMA amostra para conferir a qualidade antes de rodar em todos
  async function previewSample() {
    if (!template) { toast.error('Envie (ou cole) a foto modelo primeiro'); return; }
    setSampleBusy(true);
    try {
      const img = await loadImage(template);
      const body = useFilter ? { search: effectiveSearch, category_id: categoryId } : {};
      const pending = await api.post('/products/images/pending', body);
      const p = pending.find(x => x.colors?.length);
      if (!p) { toast.error('Nenhum produto pendente com cor no nome'); return; }
      const out = recolorCup(img, p);
      if (out) setSample({ img: out, name: p.name });
      else toast.error('Não consegui gerar a amostra com essa foto');
    } catch (e) {
      toast.error(e.error || 'Erro ao gerar amostra');
    } finally {
      setSampleBusy(false);
    }
  }

  // Remove todas as fotos GERADAS (as anexadas manualmente ficam)
  async function clearGenerated() {
    setClearBusy(true);
    try {
      const r = await api.post('/products/images/clear-generated');
      qc.invalidateQueries(['products']);
      toast.success(`${r.cleared || 0} foto(s) gerada(s) removida(s) — as manuais ficaram`);
      setClearConfirm(false);
    } catch (e) {
      toast.error(e.error || 'Erro ao remover fotos geradas');
    } finally {
      setClearBusy(false);
    }
  }

  // Ctrl+V com o modal "Gerar Fotos" aberto → cola a foto modelo
  useEffect(() => {
    if (!genOpen) return;
    function onPaste(e) {
      const items = e.clipboardData?.items || [];
      for (const item of items) {
        if (item.type?.startsWith('image/')) { e.preventDefault(); pickTemplate(item.getAsFile()); return; }
      }
    }
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [genOpen]);

  // Recolore a FOTO MODELO na cor de cada produto (preserva brilho/sombras)
  // e sobe em lotes. Só preenche produto sem foto ou com foto gerada antes.
  async function generatePhotos() {
    if (!template) { toast.error('Envie (ou cole) a foto modelo primeiro'); return; }
    setGenBusy(true); setGenCount(0); setGenTotal(0);
    try {
      const img = await loadImage(template);
      const body = useFilter ? { search: effectiveSearch, category_id: categoryId } : {};
      const pending = await api.post('/products/images/pending', body);
      const todo = pending.filter(p => p.colors?.length);
      const semCor = pending.length - todo.length;
      setGenTotal(todo.length);

      let done = 0;
      for (let i = 0; i < todo.length; i += 12) {
        const chunk = todo.slice(i, i + 12);
        const items = [];
        for (const p of chunk) {
          const image = recolorCup(img, p);
          if (image) items.push({ id: p.id, image });
        }
        if (items.length) {
          const r = await api.post('/products/images/bulk', { items });
          done += r.updated || 0;
        }
        setGenCount(Math.min(i + 12, todo.length));
        await new Promise(r => setTimeout(r)); // respira para a tela não travar
      }

      qc.invalidateQueries(['products']);
      toast.success(
        done
          ? `${done} foto(s) gerada(s)!${semCor ? ` ${semCor} produto(s) sem cor no nome — preencha manualmente.` : ''}`
          : (semCor ? `Nenhuma foto gerada — ${semCor} produto(s) sem cor identificável no nome.` : 'Nenhum produto pendente — os que têm foto real não são alterados.')
      );
      setGenOpen(false);
    } catch (e) {
      toast.error(e.error || 'Erro ao gerar fotos');
    } finally {
      setGenBusy(false);
    }
  }

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
          <button onClick={() => { setGenOpen(true); setUseFilter(!!(effectiveSearch || categoryId)); }} disabled={genBusy}
            className="btn-secondary disabled:opacity-50" title="Recolore uma foto modelo na cor do nome de cada produto sem foto">
            {genBusy ? <Loader2 size={16} className="animate-spin" /> : <Palette size={16} />} {genBusy ? `Gerando... ${genCount}/${genTotal}` : 'Gerar Fotos'}
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Novo Produto
          </button>
        </div>
      </div>

      <div className="card">
        {/* Filtros: Tipo → Linha → Cor → Borda → Tamanho → busca → ordenação */}
        <div className="card-header flex flex-wrap items-center gap-2">
          {/* Tipo */}
          <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }}
            className="input w-auto text-sm" title="Filtrar por tipo">
            <option value="">Todos os tipos</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          {/* Linha / acabamento */}
          <select value={linha} onChange={e => { setLinha(e.target.value); setPage(1); }}
            className="input w-auto text-sm" title="Filtrar por linha/acabamento">
            <option value="">Todas as linhas</option>
            <option value="tradicional">Tradicional</option>
            <option value="degrad">Degradê</option>
            <option value="bicolor">Bicolor</option>
            <option value="jateado">Jateado</option>
            <option value="metalizado">Metalizado</option>
          </select>

          {/* Cor (vem do catálogo) */}
          <select value={cor} onChange={e => { setCor(e.target.value); setPage(1); }}
            className="input w-auto text-sm max-w-[170px]" title="Filtrar por cor">
            <option value="">Todas as cores</option>
            {colorOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          {/* Borda */}
          <select value={borda} onChange={e => { setBorda(e.target.value); setPage(1); }}
            className="input w-auto text-sm" title="Filtrar por borda">
            <option value="">Com/sem borda</option>
            <option value="borda">Com borda</option>
            <option value="-borda">Sem borda</option>
          </select>

          {/* Tamanho (vem do catálogo) */}
          {volumeOptions.length > 0 && (
            <select value={volume} onChange={e => { setVolume(e.target.value); setPage(1); }}
              className="input w-auto text-sm" title="Filtrar por tamanho">
              <option value="">Todos os tamanhos</option>
              {volumeOptions.map(v => <option key={v} value={parseInt(v)}>{v}</option>)}
            </select>
          )}

          {/* Busca livre */}
          <form onSubmit={handleSearch} className="flex gap-2 flex-1 min-w-[220px]">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar: nome, código… (ex.: long drink 350)"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="input pl-9"
              />
            </div>
            <button type="submit" className="btn-secondary">Buscar</button>
          </form>

          {(effectiveSearch || categoryId) && (
            <button type="button" className="btn-ghost text-sm"
              onClick={() => { setSearch(''); setSearchInput(''); setCategoryId(''); setLinha(''); setCor(''); setBorda(''); setVolume(''); setPage(1); }}>
              Limpar filtros
            </button>
          )}

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

      {/* Gerar fotos: recolore uma FOTO REAL na cor do nome de cada produto */}
      <Modal isOpen={genOpen} onClose={() => !genBusy && setGenOpen(false)} title="Gerar fotos a partir de uma foto modelo" size="sm">
        <div className="space-y-4">
          <div className="text-sm text-gray-700 space-y-2">
            <p>Escolha <b>uma foto real</b> de um copo liso. Eu pinto essa mesma foto na <b>cor exata do nome</b> de cada produto, mantendo brilho, sombras e reflexos.</p>
            <p className="text-gray-500">Foto modelo ideal: <b>nítida (alta resolução)</b>, copo <b>branco ou claro</b>, fundo branco <b>limpo e sem sombra forte no chão</b> (foto de catálogo do fornecedor é perfeita). Use <b>Ver amostra</b> antes de rodar em todos — fotos anexadas manualmente nunca são alteradas.</p>
          </div>

          {/* foto modelo → amostra */}
          <div className="flex items-center gap-3">
            <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
              {template ? <img src={template} alt="modelo" className="w-full h-full object-contain" /> : <ImageIcon size={24} className="text-gray-300" />}
            </div>
            <span className="text-gray-300 font-black">→</span>
            <div className="w-24 h-24 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0" title={sample?.name || 'Amostra'}>
              {sampleBusy ? <Loader2 size={20} className="animate-spin text-gray-400" />
                : sample ? <img src={sample.img} alt="amostra" className="w-full h-full object-contain" />
                : <span className="text-[10px] text-gray-400 text-center px-1">amostra aparece aqui</span>}
            </div>
          </div>
          {sample && <p className="text-xs text-gray-500 -mt-2 truncate">Amostra: {sample.name}</p>}

          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary cursor-pointer">
              <Upload size={15} /> {template ? 'Trocar foto modelo' : 'Escolher foto modelo'}
              <input type="file" accept="image/*" className="hidden" onChange={e => { pickTemplate(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            <button type="button" onClick={previewSample} disabled={!template || sampleBusy} className="btn-secondary disabled:opacity-50">
              {sampleBusy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Ver amostra
            </button>
          </div>
          <p className="text-xs text-gray-400 -mt-2">Ou copie uma imagem e aperte <b>Ctrl+V</b> aqui. <span className="text-gray-300">· motor v6</span></p>

          {(effectiveSearch || categoryId) && (
            <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700">
              <input type="checkbox" checked={useFilter} onChange={e => setUseFilter(e.target.checked)} className="w-4 h-4 text-violet-600 rounded" />
              Aplicar só aos produtos do filtro atual{effectiveSearch ? <> (<b>{effectiveSearch}</b>)</> : null}
            </label>
          )}

          <div className="flex gap-3">
            <button onClick={() => setGenOpen(false)} disabled={genBusy} className="flex-1 btn-secondary disabled:opacity-50">Cancelar</button>
            <button onClick={generatePhotos} disabled={genBusy || !template}
              className="flex-1 flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50">
              {genBusy ? <><Loader2 size={15} className="animate-spin" /> {genCount}/{genTotal}</> : <><Palette size={15} /> Gerar agora</>}
            </button>
          </div>

          {/* remover fotos geradas (as manuais ficam) */}
          <div className="border-t border-gray-100 pt-3">
            {clearConfirm ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm space-y-2">
                <p className="text-gray-800">Remover <b>todas as fotos geradas pelo sistema</b>? As fotos que você anexou manualmente <b>não</b> serão tocadas.</p>
                <div className="flex justify-end gap-2">
                  <button onClick={() => setClearConfirm(false)} disabled={clearBusy} className="btn-secondary text-xs">Cancelar</button>
                  <button onClick={clearGenerated} disabled={clearBusy}
                    className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
                    {clearBusy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Remover fotos geradas
                  </button>
                </div>
              </div>
            ) : (
              <button onClick={() => setClearConfirm(true)} disabled={genBusy}
                className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1.5 disabled:opacity-50">
                <Trash2 size={13} /> Remover todas as fotos geradas (mantém as anexadas manualmente)
              </button>
            )}
          </div>
        </div>
      </Modal>

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
