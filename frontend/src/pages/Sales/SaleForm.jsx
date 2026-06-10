import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { ArrowLeft, Printer, CheckCircle2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const statusLabels = {
  open: 'Aberto', confirmed: 'Confirmado', in_production: 'Em Produção',
  ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};

const statusClass = {
  open: 'badge-yellow', confirmed: 'badge-green', in_production: 'badge-blue',
  ready: 'badge-purple', delivered: 'badge-gray', cancelled: 'badge-red',
};

const nextStatus = {
  open: 'confirmed', confirmed: 'in_production', in_production: 'ready', ready: 'delivered',
};
const nextStatusLabel = {
  open: 'Confirmar Pedido', confirmed: 'Iniciar Produção', in_production: 'Marcar Pronto', ready: 'Marcar Entregue',
};

const paymentLabels = {
  cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão Débito',
  card_credit: 'Cartão Crédito', transfer: 'Transferência', check: 'Cheque',
};

function renderCustomization(custom) {
  if (!custom) return null;
  if (typeof custom === 'string') return <p className="text-xs text-gray-500 mt-0.5">{custom}</p>;
  if (typeof custom === 'object') {
    const entries = Object.entries(custom).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {entries.map(([k, v]) => (
          <span key={k} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">
            {k}: {String(v)}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

export default function SaleForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: () => api.get(`/sales/${id}`),
    enabled: !!id && id !== 'new',
  });

  const advanceMutation = useMutation({
    mutationFn: (status) => api.patch(`/sales/${id}/status`, { status }),
    onSuccess: (data) => {
      toast.success(`Status: ${statusLabels[data.status]}`);
      qc.invalidateQueries(['sale', id]);
      qc.invalidateQueries(['sales']);
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Carregando...</div>;

  if (!sale) return (
    <div className="text-center py-16 text-gray-400">
      <p>Pedido não encontrado</p>
      <button onClick={() => navigate('/sales')} className="btn-secondary mt-4">Voltar</button>
    </div>
  );

  const canAdvance = nextStatus[sale.status];

  return (
    <>
      <style>{`
        @media print {
          aside, header, nav, .no-print { display: none !important; }
          body { background: white !important; }
          .card { box-shadow: none !important; border: 1px solid #e5e7eb !important; page-break-inside: avoid; }
          .page-title { font-size: 1.2rem; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto space-y-5">
        <div className="page-header no-print">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/sales')} className="btn-ghost p-2">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="page-title">Pedido #{String(sale.number).padStart(4, '0')}</h1>
              <p className="text-sm text-gray-500">
                {sale.created_at ? format(parseISO(sale.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canAdvance && (
              <button
                onClick={() => advanceMutation.mutate(nextStatus[sale.status])}
                disabled={advanceMutation.isPending}
                className="btn-primary btn-sm"
              >
                <CheckCircle2 size={15} /> {nextStatusLabel[sale.status]}
              </button>
            )}
            <button onClick={() => window.print()} className="btn-secondary">
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Cliente</p>
            <p className="font-semibold">{sale.customers?.name || 'Consumidor Final'}</p>
            {sale.customers?.cpf_cnpj && <p className="text-sm text-gray-400">{sale.customers.cpf_cnpj}</p>}
            {sale.customers?.phone && <p className="text-sm text-gray-400">{sale.customers.phone}</p>}
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-2">Status</p>
            <span className={`badge ${statusClass[sale.status] || 'badge-gray'}`}>
              {statusLabels[sale.status] || sale.status}
            </span>
            {sale.delivery_date && (
              <p className="text-sm text-gray-500 mt-2">
                📦 Entrega: {format(parseISO(sale.delivery_date), 'dd/MM/yyyy')}
              </p>
            )}
            {sale.payment_method && (
              <p className="text-sm text-gray-500 mt-1">
                💳 {paymentLabels[sale.payment_method] || sale.payment_method}
              </p>
            )}
          </div>
        </div>

        {/* Artwork */}
        {sale.artwork_url && (
          <div className="card p-4 bg-purple-50 border-purple-200">
            <p className="text-sm font-medium text-purple-900 mb-1">🎨 Arte / Personalização</p>
            <a href={sale.artwork_url} target="_blank" rel="noreferrer"
              className="text-purple-700 text-sm hover:underline break-all">
              {sale.artwork_url}
            </a>
            {sale.artwork_notes && <p className="text-sm text-purple-700 mt-2">{sale.artwork_notes}</p>}
          </div>
        )}

        {/* Items */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold">Itens do Pedido</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b">Produto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b w-24">Qtd</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b w-28">Preço Un.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items?.map((item, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.products?.name || item.product_name}</p>
                    {renderCustomization(item.customization)}
                  </td>
                  <td className="px-4 py-3 text-center">{item.quantity} {item.products?.unit}</td>
                  <td className="px-4 py-3 text-right">{fmt(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium">Subtotal</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(sale.subtotal)}</td>
              </tr>
              {sale.discount > 0 && (
                <tr className="bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-red-600">Desconto</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">-{fmt(sale.discount)}</td>
                </tr>
              )}
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-3 text-right font-bold text-base">Total</td>
                <td className="px-4 py-3 text-right font-bold text-lg text-primary-600">{fmt(sale.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {sale.notes && (
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Observações</p>
            <p className="text-sm">{sale.notes}</p>
          </div>
        )}
      </div>
    </>
  );
}
