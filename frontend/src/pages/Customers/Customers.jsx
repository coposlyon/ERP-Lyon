import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Eye, Star, MessageCircle } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import CustomerForm from './CustomerForm';
import { useNavigate } from 'react-router-dom';

const TYPE_LABELS = { PF: 'PF', PJ: 'PJ', CO: 'Colab.' };
const TYPE_BADGE  = { PF: 'badge-gray', PJ: 'badge-blue', CO: 'badge-purple' };

function StarDisplay({ value }) {
  if (!value) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {[1,2,3,4,5].map(n => (
        <Star key={n} size={12} className={n <= value ? 'text-yellow-400 fill-yellow-400' : 'text-gray-200'} />
      ))}
    </div>
  );
}

function whatsappLink(phone, name) {
  if (!phone) return null;
  const num = phone.replace(/\D/g, '');
  const full = num.startsWith('55') ? num : `55${num}`;
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name}, tudo bem?`)}`;
}

const FILTERS = [
  { value: 'cliente', label: 'Clientes' },
  { value: '',        label: 'Todos'    },
];

export default function Customers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState('cliente');
  const [ratingFilter, setRatingFilter] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['customers', page, search, typeFilter, ratingFilter],
    queryFn: () => {
      let url = `/customers?page=${page}&limit=20`;
      if (search)       url += `&search=${encodeURIComponent(search)}`;
      if (typeFilter)   url += `&type=${typeFilter}`;
      if (ratingFilter) url += `&rating=${ratingFilter}`;
      return api.get(url);
    },
  });

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function applyFilter(val) {
    setTypeFilter(val);
    setPage(1);
  }

  function applyRating(val) {
    setRatingFilter(prev => prev === val ? null : val);
    setPage(1);
  }

  function openNew() { setEditing(null); setModalOpen(true); }
  function openEdit(c) { setEditing(c); setModalOpen(true); }
  function closeModal() { setModalOpen(false); setEditing(null); }
  function onSaved() { closeModal(); qc.invalidateQueries(['customers']); }

  const columns = [
    { key: 'display_id', label: 'Código', width: 70,
      render: v => <span className="text-xs font-mono text-gray-500 font-semibold">{v || '—'}</span>
    },
    { key: 'type', label: 'Tipo', width: 65,
      render: v => <span className={`badge ${TYPE_BADGE[v] || 'badge-gray'}`}>{TYPE_LABELS[v] || v}</span>
    },
    { key: 'name', label: 'Nome',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{v}</p>
          {row.nome_fantasia && <p className="text-xs text-gray-400">{row.nome_fantasia}</p>}
        </div>
      )
    },
    { key: 'credit_limit', label: 'Limite de Crédito', width: 140,
      render: v => v > 0
        ? <span className="text-sm text-gray-700">R$ {Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</span>
        : <span className="text-gray-300 text-xs">—</span>
    },
    { key: 'cpf_cnpj', label: 'CPF/CNPJ', width: 145 },
    { key: 'phone', label: 'Telefone', width: 150,
      render: (v, row) => {
        if (!v) return '—';
        const link = whatsappLink(v, row.name);
        return link ? (
          <a href={link} target="_blank" rel="noreferrer"
            className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm font-medium">
            <MessageCircle size={13} /> {v}
          </a>
        ) : v;
      }
    },
    { key: 'rating', label: '⭐', width: 90,
      render: v => <StarDisplay value={v} />
    },
    { key: 'is_active', label: 'Status', width: 70,
      render: v => <span className={`badge ${v ? 'badge-green' : 'badge-gray'}`}>{v ? 'Ativo' : 'Inativo'}</span>
    },
    { key: 'id', label: '', width: 70,
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => navigate(`/customers/${row.id}`)} className="btn-ghost p-1.5" title="Ver detalhes">
            <Eye size={14} />
          </button>
          <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar">
            <Edit2 size={14} />
          </button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clientes</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} cadastrados</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16} /> Novo</button>
      </div>

      <div className="card">
        {/* Filtros */}
        <div className="card-header flex flex-wrap items-center gap-3">
          {/* Tipo */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => applyFilter(f.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  typeFilter === f.value
                    ? 'bg-white shadow text-primary-700'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Filtro por estrelas */}
          <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg px-2 py-1.5">
            <span className="text-xs text-gray-400 mr-1.5 select-none">Avaliação:</span>
            {[1,2,3,4,5].map(n => (
              <button
                key={n}
                type="button"
                onClick={() => applyRating(n)}
                title={`${n} estrela${n > 1 ? 's' : ''}`}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  size={17}
                  className={n === ratingFilter ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300 hover:text-yellow-300'}
                />
              </button>
            ))}
            {ratingFilter && (
              <button
                type="button"
                onClick={() => applyRating(null)}
                className="ml-1.5 text-gray-400 hover:text-gray-600 text-xs leading-none"
                title="Limpar filtro"
              >✕</button>
            )}
          </div>

          <form onSubmit={handleSearch} className="flex gap-2 flex-1 max-w-sm ml-auto">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Nome, CPF, telefone ou #ID..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="input pl-9 text-sm"
              />
            </div>
            <button type="submit" className="btn-secondary text-sm">Buscar</button>
            {search && (
              <button type="button" onClick={() => { setSearch(''); setSearchInput(''); setPage(1); }}
                className="text-xs text-gray-400 hover:text-gray-600">
                Limpar
              </button>
            )}
          </form>
        </div>

        <Table columns={columns} data={data?.data} loading={isLoading} />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>

      <Modal isOpen={modalOpen} onClose={closeModal}
        title={editing ? (editing.type === 'CO' ? 'Editar Colaborador' : 'Editar Cliente') : 'Novo Cadastro'}
        size="lg">
        <CustomerForm customer={editing} onSaved={onSaved} onCancel={closeModal} />
      </Modal>
    </div>
  );
}
