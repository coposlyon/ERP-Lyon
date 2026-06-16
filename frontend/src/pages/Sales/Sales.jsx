import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Eye, Search, Globe, Trash2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import PDV from './PDV';
import { SALE_STATUSES, SALE_STATUS_ORDER, saleStatusIndex, saleStatusLabel, saleStatusClass } from '@/lib/saleStatus';
import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const statusFilterOptions = [{ value: '', label: 'Todos os Status' }, ...SALE_STATUSES.map(s => ({ value: s.key, label: s.label }))];

const today = format(new Date(), 'yyyy-MM-dd');
const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

export default function Sales() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [delPassword, setDelPassword] = useState('');
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const deleteSale = useMutation({
    mutationFn: () => api.post(`/sales/${delTarget.id}/delete`, { password: delPassword }),
    onSuccess: () => { qc.invalidateQueries(['sales']); setDelTarget(null); setDelPassword(''); toast.success('Pedido excluído!'); },
    onError: (e) => toast.error(e.error || 'Não foi possível excluir'),
  });

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
    onError: (e) => toast.error(e.error || 'Não foi possível atualizar o status'),
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
    { key: 'number', label: '#', width: 90,
      render: (v, row) => (
        <div className="flex items-center gap-1.5">
          <span className="font-mono font-semibold">#{String(v).padStart(4, '0')}</span>
          {row.source === 'site' && (
            <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-violet-700 bg-violet-100 rounded px-1 py-0.5" title="Pedido feito pelo site">
              <Globe size={9} /> SITE
            </span>
          )}
        </div>
      )
    },
    { key: 'created_at', label: 'Data', width: 100,
      render: (v, row) => { const d = row.operation_date || v; try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d; } }
    },
    { key: 'CLIENTES', label: 'Cliente',
      render: (v, row) => (v || row.customers)?.name || <span className="text-gray-400">Consumidor Final</span>
    },
    { key: 'status', label: 'Status', width: 230,
      render: (v, row) => {
        const curIdx = saleStatusIndex(v); // -1 se for status antigo
        return (
          <select
            value={SALE_STATUS_ORDER.includes(v) ? v : ''}
            onClick={e => e.stopPropagation()}
            onChange={e => e.target.value && updateStatus.mutate({ id: row.id, status: e.target.value })}
            className={`badge cursor-pointer border-0 bg-transparent font-medium text-[11px] ${saleStatusClass(v)}`}
          >
            {!SALE_STATUS_ORDER.includes(v) && <option value="">{saleStatusLabel(v)}</option>}
            {SALE_STATUSES.map((s, i) => (
              // não deixa pular etapas: só habilita até o próximo passo (curIdx+1)
              <option key={s.key} value={s.key} disabled={curIdx >= 0 && i > curIdx + 1}>{s.label}</option>
            ))}
          </select>
        );
      }
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
    { key: 'id', label: '', width: 80,
      render: (_, row) => (
        <div className="flex items-center gap-0.5">
          <button onClick={() => navigate(`/sales/${row.id}`)} className="btn-ghost p-1.5" title="Ver detalhes">
            <Eye size={14} />
          </button>
          {isAdmin && (
            <button onClick={() => { setDelTarget(row); setDelPassword(''); }} className="btn-ghost p-1.5 text-red-500 hover:text-red-600" title="Excluir pedido">
              <Trash2 size={14} />
            </button>
          )}
        </div>
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
        <button onClick={() => setNewSaleOpen(true)} className="btn-primary">
          <Plus size={16} /> Nova Venda
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
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input w-56 text-sm">
              {statusFilterOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
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

      {/* Card de novo pedido de venda (PDV embutido) */}
      <Modal isOpen={newSaleOpen} onClose={() => setNewSaleOpen(false)} title="Novo Pedido de Venda" size="full">
        <PDV onDone={() => { setNewSaleOpen(false); qc.invalidateQueries(['sales']); }} />
      </Modal>

      {/* Excluir pedido (admin + senha) */}
      <Modal isOpen={!!delTarget} onClose={() => !deleteSale.isPending && setDelTarget(null)} title="Excluir pedido de venda" size="sm">
        <div className="space-y-4">
          <div className="flex gap-2.5 bg-red-50 border border-red-100 rounded-xl p-3">
            <Trash2 size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              Você vai <b>excluir permanentemente</b> o pedido <b>#{String(delTarget?.number || '').padStart(4, '0')}</b>
              {delTarget?.CLIENTES?.name ? <> de <b>{delTarget.CLIENTES.name}</b></> : ''}. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div>
            <label className="label">Confirme com a sua senha de admin</label>
            <input type="password" className="input" autoFocus value={delPassword}
              onChange={e => setDelPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && delPassword && deleteSale.mutate()}
              placeholder="Sua senha" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setDelTarget(null)} disabled={deleteSale.isPending} className="btn-secondary">Cancelar</button>
            <button onClick={() => deleteSale.mutate()} disabled={deleteSale.isPending || !delPassword}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50">
              {deleteSale.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
