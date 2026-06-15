import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, ToggleLeft, ToggleRight, Package, Receipt } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import ProductForm from './ProductForm';
import BulkFiscalModal from './BulkFiscalModal';
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
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['products', page, search],
    queryFn: () => api.get(`/products?page=${page}&limit=20${search ? `&search=${search}` : ''}`),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => api.put(`/products/${id}`, { is_active }),
    onSuccess: () => { qc.invalidateQueries(['products']); toast.success('Produto atualizado'); },
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
    { key: 'code', label: 'Código', width: 80 },
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
    { key: 'id', label: '', width: 80,
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
          <button onClick={() => setBulkOpen(true)} className="btn-secondary">
            <Receipt size={16} /> Fiscal em massa
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

      <BulkFiscalModal isOpen={bulkOpen} onClose={() => setBulkOpen(false)} />
    </div>
  );
}
