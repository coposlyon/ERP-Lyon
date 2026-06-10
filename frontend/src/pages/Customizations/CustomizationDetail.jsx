import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { ArrowLeft, Clock, ExternalLink } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

const statusLabels = {
  briefing: 'Briefing', design: 'Design', approval: 'Aprovação',
  printing: 'Impressão', finishing: 'Acabamento', ready: 'Pronto',
  delivered: 'Entregue', cancelled: 'Cancelado',
};

const statusColors = {
  briefing: 'bg-gray-100 text-gray-700',
  design: 'bg-blue-100 text-blue-700',
  approval: 'bg-yellow-100 text-yellow-700',
  printing: 'bg-orange-100 text-orange-700',
  finishing: 'bg-purple-100 text-purple-700',
  ready: 'bg-green-100 text-green-700',
  delivered: 'bg-gray-100 text-gray-500',
  cancelled: 'bg-red-100 text-red-700',
};

const priorityLabels = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const priorityColors = {
  low: 'text-gray-500', normal: 'text-blue-600', high: 'text-orange-600', urgent: 'text-red-600',
};

const statusOrder = ['briefing', 'design', 'approval', 'printing', 'finishing', 'ready', 'delivered'];

export default function CustomizationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['customization', id],
    queryFn: () => api.get(`/customizations/${id}`),
    enabled: !!id,
  });

  const { data: history } = useQuery({
    queryKey: ['customization-history', id],
    queryFn: () => api.get(`/customizations/${id}/history`),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status) => api.patch(`/customizations/${id}/status`, { status }),
    onSuccess: () => {
      toast.success('Status atualizado!');
      qc.invalidateQueries(['customization', id]);
      qc.invalidateQueries(['customization-history', id]);
      qc.invalidateQueries(['customizations']);
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  if (!data) return (
    <div className="text-center py-16 text-gray-400">
      <p>Personalização não encontrada</p>
      <button onClick={() => navigate('/customizations')} className="btn-secondary mt-4">Voltar</button>
    </div>
  );

  const c = data;
  const currentIdx = statusOrder.indexOf(c.status);
  const isDeliveredOrCancelled = c.status === 'delivered' || c.status === 'cancelled';
  const nextSt = !isDeliveredOrCancelled ? statusOrder[currentIdx + 1] : null;

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/customizations')} className="btn-ghost p-2">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="page-title">{c.title}</h1>
            <p className="text-sm text-gray-500">
              {c.created_at ? format(parseISO(c.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          {nextSt && (
            <button
              onClick={() => statusMutation.mutate(nextSt)}
              disabled={statusMutation.isPending}
              className="btn-primary"
            >
              Avançar para {statusLabels[nextSt]}
            </button>
          )}
          {!isDeliveredOrCancelled && (
            <button
              onClick={() => { if (window.confirm('Cancelar esta personalização?')) statusMutation.mutate('cancelled'); }}
              className="btn-ghost text-red-500 hover:text-red-700"
            >
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* Pipeline de status */}
      <div className="card p-5">
        <div className="flex items-center gap-1 overflow-x-auto">
          {statusOrder.filter(s => s !== 'cancelled').map((s, idx) => {
            const done = statusOrder.indexOf(c.status) > idx;
            const active = c.status === s;
            return (
              <div key={s} className="flex items-center gap-1 min-w-fit">
                <div className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  active ? statusColors[s] + ' ring-2 ring-current ring-offset-1' :
                  done ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                }`}>
                  {done && !active && '✓ '}{statusLabels[s]}
                </div>
                {idx < statusOrder.filter(s => s !== 'cancelled').length - 1 && (
                  <div className={`h-px w-4 ${done ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
          {c.status === 'cancelled' && (
            <div className="ml-2 px-3 py-1.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
              Cancelado
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Info */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Detalhes</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Status</span>
              <span className={`font-medium px-2 py-0.5 rounded text-xs ${statusColors[c.status]}`}>
                {statusLabels[c.status]}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Prioridade</span>
              <span className={`font-medium ${priorityColors[c.priority]}`}>
                {priorityLabels[c.priority] || c.priority}
              </span>
            </div>
            {c.deadline && (
              <div className="flex justify-between">
                <span className="text-gray-500">Prazo</span>
                <span className={`font-medium ${new Date(c.deadline) < new Date() && !isDeliveredOrCancelled ? 'text-red-600' : 'text-gray-900'}`}>
                  <Clock size={12} className="inline mr-1" />
                  {format(parseISO(c.deadline), 'dd/MM/yyyy')}
                  {new Date(c.deadline) < new Date() && !isDeliveredOrCancelled && ' ⚠️'}
                </span>
              </div>
            )}
            {c.CLIENTES && (
              <div className="flex justify-between">
                <span className="text-gray-500">Cliente</span>
                <span className="font-medium">{c.CLIENTES.name}</span>
              </div>
            )}
            {c.assigned_to && (
              <div className="flex justify-between">
                <span className="text-gray-500">Responsável</span>
                <span className="font-medium">{c.USUARIOS?.name || '—'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Arte */}
        <div className="card p-5 space-y-3">
          <h3 className="font-semibold text-gray-900">Arte & Notas</h3>
          {c.artwork_url ? (
            <div className="p-3 bg-purple-50 rounded-lg">
              <a href={c.artwork_url} target="_blank" rel="noreferrer"
                className="text-purple-700 text-sm flex items-center gap-1 hover:underline break-all">
                <ExternalLink size={13} /> Ver arte
              </a>
            </div>
          ) : (
            <p className="text-sm text-gray-400">Sem arte anexada</p>
          )}
          {c.customer_notes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Observações do cliente</p>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{c.customer_notes}</p>
            </div>
          )}
          {c.artwork_notes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Notas da arte</p>
              <p className="text-sm text-gray-700 bg-gray-50 p-3 rounded-lg">{c.artwork_notes}</p>
            </div>
          )}
          {c.internal_notes && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Notas internas</p>
              <p className="text-sm text-gray-700 bg-yellow-50 p-3 rounded-lg border border-yellow-200">{c.internal_notes}</p>
            </div>
          )}
        </div>
      </div>

      {/* Histórico */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Histórico de Movimentações</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {(history || []).length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhuma movimentação registrada</p>
          ) : (
            (history || []).map((h, i) => (
              <div key={h.id || i} className="px-6 py-4 flex items-start gap-3">
                <div className="w-2 h-2 rounded-full bg-primary-400 mt-2 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[h.from_status] || 'bg-gray-100 text-gray-600'}`}>
                      {statusLabels[h.from_status] || h.from_status || 'Criado'}
                    </span>
                    {h.to_status && (
                      <>
                        <span className="text-gray-300">→</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${statusColors[h.to_status] || 'bg-gray-100 text-gray-600'}`}>
                          {statusLabels[h.to_status] || h.to_status}
                        </span>
                      </>
                    )}
                    <span className="text-xs text-gray-400 ml-auto">
                      {h.created_at ? format(parseISO(h.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}
                    </span>
                  </div>
                  {h.notes && <p className="text-sm text-gray-600 mt-1">{h.notes}</p>}
                  {h.USUARIOS?.name && <p className="text-xs text-gray-400 mt-0.5">por {h.USUARIOS.name}</p>}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
