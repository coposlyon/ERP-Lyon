import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Package, Layers, Upload, Trash2, Loader2, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { id4 } from '@/lib/ids';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import ProductForm from './ProductForm';
import BulkEditModal from './BulkEditModal';
import ImportStockModal from './ImportStockModal';
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
  const [editing, setEditing] = useState(null);
  const [delTarget, setDelTarget] = useState(null); // produto a apagar (confirmação)
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => api.get(`/products?page=${page}&limit=20${search ? `&search=${search}` : ''}`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/products/${id}`, { is_active }),
    onSuccess: () => { qc.invalidateQueries(['products']); toast.success('Produto atualizado'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => api.post(`/products/${id}/delete`),
    onSuccess: () => { qc.invalidateQueries(['products']); setDelTarget(null); toast.success('Produto excluído!'); },
    onError: (e) => toast.error(e.error || 'Erro ao excluir produto'),
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
    { key: 'code', label: 'Código', width: 80, render: v => <span className="font-mono text-xs">{id4(v)}</span> },
    { key: 'name', label: 'Produto' },
    { key: 'categories', label: 'Categoria', render: v => v?.name || '—' },
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
    { key: 'id', label: '', width: 110,
      render: (_, row) => (
        <div className="flex items-center gap-1">
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
          <button onClick={() => setImportOpen(true)} className="btn-secondary">
            <Upload size={16} /> Importar
          </button>
          <button onClick={() => setBulkOpen(true)} className="btn-secondary">
            <Layers size={16} /> Edição em massa
          </button>
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Novo Produto
          </button>
        </div>
      </div>

      <div className="card">
        {/* Search */}
        <div className="card-header">
          <form onSubmit={handleSearch} className="flex gap-3 max-w-md">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por nome, código..."
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
        </div>

        <Table columns={columns} data={data?.data} loading={isLoading} />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal} title={editing ? 'Editar Produto' : 'Novo Produto'} size="lg">
        <ProductForm product={editing} onSaved={onSaved} onCancel={closeModal} />
      </Modal>

      <BulkEditModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />
      <ImportStockModal isOpen={importOpen} onClose={() => setImportOpen(false)} />

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
                <b>{id4(delTarget.code)}</b> — {delTarget.name}
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
