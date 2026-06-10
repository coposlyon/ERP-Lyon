import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function Fiscal() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', page],
    queryFn: () => api.get(`/fiscal/invoices?page=${page}&limit=20`),
  });

  const statusClass = { pending: 'badge-yellow', authorized: 'badge-green', cancelled: 'badge-red', error: 'badge-red', processing: 'badge-blue' };
  const statusLabel = { pending: 'Pendente', authorized: 'Autorizada', cancelled: 'Cancelada', error: 'Erro', processing: 'Processando' };

  const columns = [
    { key: 'created_at', label: 'Data', width: 110,
      render: v => { try { return format(parseISO(v), 'dd/MM/yyyy', { locale: ptBR }); } catch { return v; } }
    },
    { key: 'number', label: 'Número', width: 100 },
    { key: 'series', label: 'Série', width: 60 },
    { key: 'sales', label: 'Pedido',
      render: v => v ? `#${String(v.number).padStart(4,'0')} — ${v.customers?.name || 'Consumidor Final'}` : '—'
    },
    { key: 'key', label: 'Chave', render: v => v ? <span className="font-mono text-xs">{v.substring(0,20)}...</span> : '—' },
    { key: 'status', label: 'Status', width: 110,
      render: v => <span className={`badge ${statusClass[v] || 'badge-gray'}`}>{statusLabel[v] || v}</span>
    },
    { key: 'pdf_url', label: 'DANFE', width: 70,
      render: v => v ? <a href={v} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-primary-600"><FileText size={14} /></a> : '—'
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fiscal / NF-e</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} notas fiscais</p>
        </div>
      </div>

      <div className="card p-4 bg-amber-50 border-amber-200 flex items-start gap-3">
        <AlertCircle size={20} className="text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-amber-900">Configuração necessária</p>
          <p className="text-sm text-amber-700">
            Para emitir NF-e, configure o certificado digital A1 nas{' '}
            <a href="/settings" className="underline font-medium">Configurações da Empresa</a>.
            A emissão é integrada com a SEFAZ via Python no servidor.
          </p>
        </div>
      </div>

      <div className="card">
        <Table columns={columns} data={data?.data} loading={isLoading} emptyMessage="Nenhuma NF-e emitida ainda" />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>
    </div>
  );
}
