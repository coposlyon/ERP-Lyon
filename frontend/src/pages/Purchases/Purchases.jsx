import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Eye } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

export default function Purchases() {
  const [page, setPage] = useState(1);
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['purchases', page],
    queryFn: () => api.get(`/purchases?page=${page}&limit=20`),
  });

  const columns = [
    { key: 'number', label: '#', width: 70,
      render: v => <span className="font-mono font-semibold">#{String(v).padStart(4, '0')}</span>
    },
    { key: 'created_at', label: 'Data', width: 110,
      render: v => { try { return format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; } }
    },
    { key: 'suppliers', label: 'Fornecedor', render: v => v?.name || '—' },
    { key: 'status', label: 'Status', width: 120,
      render: v => {
        const cls = { received: 'badge-green', pending: 'badge-yellow', cancelled: 'badge-red', partial: 'badge-blue' };
        const lbl = { received: 'Recebido', pending: 'Pendente', cancelled: 'Cancelado', partial: 'Parcial' };
        return <span className={`badge ${cls[v] || 'badge-gray'}`}>{lbl[v] || v}</span>;
      }
    },
    { key: 'total', label: 'Total', width: 130, render: v => <span className="font-semibold">{fmt(v)}</span> },
    { key: 'id', label: '', width: 50,
      render: (_, row) => (
        <button onClick={() => navigate(`/purchases/${row.id}`)} className="btn-ghost p-1.5"><Eye size={14} /></button>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Compras</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} pedidos de compra</p>
        </div>
        <button onClick={() => navigate('/purchases/new')} className="btn-primary">
          <Plus size={16} /> Nova Compra
        </button>
      </div>
      <div className="card">
        <Table columns={columns} data={data?.data} loading={isLoading} />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>
    </div>
  );
}
