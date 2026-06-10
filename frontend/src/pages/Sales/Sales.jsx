import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const statusOptions = [
  { value: '', label: 'Todos os Status' },
  { value: 'open', label: 'Aberto' },
  { value: 'confirmed', label: 'Confirmado' },
  { value: 'in_production', label: 'Em Produção' },
  { value: 'ready', label: 'Pronto' },
  { value: 'delivered', label: 'Entregue' },
  { value: 'cancelled', label: 'Cancelado' },
];

const statusClass = {
  open: 'badge-yellow', confirmed: 'badge-green',
  in_production: 'badge-blue', ready: 'badge-purple',
  delivered: 'badge-gray', cancelled: 'badge-red',
};

const today = format(new Date(), 'yyyy-MM-dd');
const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

export default function Sales() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, status, search, startDate, endDate],
    queryFn: () => {
      let url = `/sales?page=${page}&limit=20`;
      if (status) url += `&status=${status}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      return api.get(url);
    },
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/sales/${id}/status`, { status }),
    onSuccess: () => { qc.invalidateQueries(['sales']); toast.success('Status atualizado'); },
  });

  function handleSearch(e) {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  }

  function clearFilters() {
    setSearch(''); setSearchInput(''); setStatus('');
    setStartDate(''); setEndDate(''); setPage(1);
  }

  const hasFilters = search || status || startDate || endDate;

  const columns = [
    { key: 'number', label: '#', width: 70,
      render: v => <span className="font-mono font-semibold">#{String(v).padStart(4, '0')}</span>
    },
    { key: 'created_at', label: 'Data', width: 100,
      render: v => { try { return format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; } }
    },
    { key: 'customers', label: 'Cliente',
      render: v => v?.name || <span className="text-gray-400">Consumidor Final</span>
    },
    { key: 'status', label: 'Status', width: 140,
      render: (v, row) => (
        <select
          value={v}
          onClick={e => e.stopPropagation()}
          onChange={e => updateStatus.mutate({ id: row.id, status: e.target.value })}
          className={`badge cursor-pointer border-0 bg-transparent font-medium text-xs ${statusClass[v] || 'badge-gray'}`}
        >
          {statusOptions.slice(1).map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      )
    },
    { key: 'delivery_date', label: 'Entrega', width: 100,
      render: v => { if (!v) return '—'; try { return format(parseISO(v), 'dd/MM/yyyy'); } catch { return v; } }
    },
    { key: 'payment_method', label: 'Pgto.', width: 90,
      render: v => {
        const map = { cash: 'Dinheiro', pix: 'Pix', card_debit: 'Débito', card_credit: 'Crédito', transfer: 'Transf.', check: 'Cheque' };
        return <span className="text-xs text-gray-500">{map[v] || v || '—'}</span>;
      }
    },
    { key: 'total', label: 'Total', width: 120,
      render: v => <span className="font-semibold">{fmt(v)}</span>
    },
    { key: 'artwork_url', label: 'Arte', width: 55,
      render: v => v ? (
        <a href={v} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline text-xs">Ver</a>
      ) : '—'
    },
    { key: 'id', label: '', width: 50,
      render: (_, row) => (
        <button onClick={() => navigate(`/sales/${row.id}`)} className="btn-ghost p-1.5" title="Ver detalhes">
          <Eye size={14} />
        </button>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Pedidos de Venda</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} pedidos{hasFilters ? ' (filtrado)' : ''}</p>
        </div>
        <button onClick={() => navigate('/pdv')} className="btn-primary">
          <Plus size={16} /> Nova Venda (PDV)
        </button>
      </div>

      {/* Filtros */}
      <div className="card p-4 space-y-3">
        <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
          {/* Busca por cliente */}
          <div className="flex-1 min-w-[200px]">
            <label className="label">Buscar cliente</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Nome do cliente..."
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                className="input pl-8 text-sm"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="label">Status</label>
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input w-40 text-sm">
              {statusOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>

          {/* Data de */}
          <div>
            <label className="label">De</label>
            <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className="input w-36 text-sm" />
          </div>

          {/* Data até */}
          <div>
            <label className="label">Até</label>
            <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className="input w-36 text-sm" />
          </div>

          <div className="flex gap-2">
            <button type="submit" className="btn-secondary text-sm">Buscar</button>
            {hasFilters && (
              <button type="button" onClick={clearFilters} className="btn-ghost text-sm text-red-500">Limpar</button>
            )}
          </div>
        </form>
      </div>

      <div className="card">
        <Table columns={columns} data={data?.data} loading={isLoading} emptyMessage="Nenhum pedido encontrado" />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>
    </div>
  );
}
