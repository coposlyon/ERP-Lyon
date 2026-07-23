import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, User, Calendar, AlertCircle, Loader2, ExternalLink } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

const COLUMNS = [
  { key: 'briefing',   label: 'Briefing',     color: 'bg-gray-100 border-gray-300',       badge: 'bg-gray-500' },
  { key: 'design',     label: 'Design',       color: 'bg-blue-50 border-blue-300',        badge: 'bg-blue-500' },
  { key: 'approval',   label: 'Aprovação',    color: 'bg-yellow-50 border-yellow-300',    badge: 'bg-yellow-500' },
  { key: 'printing',   label: 'Impressão',    color: 'bg-purple-50 border-purple-300',    badge: 'bg-purple-500' },
  { key: 'finishing',  label: 'Acabamento',   color: 'bg-orange-50 border-orange-300',    badge: 'bg-orange-500' },
  { key: 'ready',      label: 'Pronto',       color: 'bg-green-50 border-green-300',      badge: 'bg-green-500' },
  { key: 'delivered',  label: 'Entregue',     color: 'bg-emerald-50 border-emerald-300',  badge: 'bg-emerald-600' },
];

const PRIORITY_COLORS = { low: 'text-gray-400', normal: 'text-blue-500', high: 'text-orange-500', urgent: 'text-red-600' };
const PRIORITY_LABELS = { low: 'Baixa', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };

function NewCustomizationModal({ onSaved, onCancel }) {
  const [form, setForm] = useState({ title: '', priority: 'normal', deadline: '', customer_id: '', artwork_notes: '', customer_notes: '' });
  const [loading, setLoading] = useState(false);
  const { data: customers } = useQuery({ queryKey: ['customers-all'], queryFn: () => api.get('/customers?limit=500') });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.title) { toast.error('Título obrigatório'); return; }
    setLoading(true);
    try {
      await api.post('/customizations', { ...form, customer_id: form.customer_id || null });
      toast.success('Pedido criado!');
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="label">Título / Descrição *</label>
        <input className="input" placeholder="Ex: Copo personalizado evento Formatura..." value={form.title} onChange={e => setForm(p => ({...p, title: e.target.value}))} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Cliente</label>
          <select className="input" value={form.customer_id} onChange={e => setForm(p => ({...p, customer_id: e.target.value}))}>
            <option value="">Sem cliente</option>
            {(customers?.data || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Prioridade</label>
          <select className="input" value={form.priority} onChange={e => setForm(p => ({...p, priority: e.target.value}))}>
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
      </div>
      <div>
        <label className="label">Prazo de entrega</label>
        <input type="date" className="input" value={form.deadline} onChange={e => setForm(p => ({...p, deadline: e.target.value}))} />
      </div>
      <div>
        <label className="label">Briefing do cliente</label>
        <textarea rows={2} className="input" placeholder="O que o cliente quer..." value={form.customer_notes} onChange={e => setForm(p => ({...p, customer_notes: e.target.value}))} />
      </div>
      <div>
        <label className="label">Observações de arte</label>
        <textarea rows={2} className="input" placeholder="Cores, fontes, referências..." value={form.artwork_notes} onChange={e => setForm(p => ({...p, artwork_notes: e.target.value}))} />
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar Pedido
        </button>
      </div>
    </form>
  );
}

function KanbanCard({ item, onMove, onDetail }) {
  const isUrgent = item.priority === 'urgent';
  const isOverdue = item.deadline && new Date(item.deadline) < new Date();

  return (
    <div className={`bg-white rounded-lg border p-3 shadow-sm hover:shadow-md transition-shadow ${isUrgent ? 'border-red-300' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <button onClick={() => onDetail(item.id)} className="text-sm font-medium text-gray-900 leading-snug flex-1 text-left hover:text-primary-600">
          {item.title}
        </button>
        <span className={`text-xs font-medium whitespace-nowrap ${PRIORITY_COLORS[item.priority]}`}>
          {isUrgent && <AlertCircle size={12} className="inline mr-0.5" />}
          {PRIORITY_LABELS[item.priority]}
        </span>
      </div>
      {item.CLIENTES && (
        <div className="flex items-center gap-1 text-xs text-gray-500 mb-2">
          <User size={11} /> {item.CLIENTES.name}
        </div>
      )}
      {item.deadline && (
        <div className={`flex items-center gap-1 text-xs mb-2 ${isOverdue ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
          <Calendar size={11} />
          {format(parseISO(item.deadline), 'dd/MM/yyyy', { locale: ptBR })}
          {isOverdue && ' ⚠️ Atrasado'}
        </div>
      )}
      {/* Actions */}
      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
        <select
          className="text-xs text-gray-500 bg-transparent border-none outline-none cursor-pointer flex-1"
          value={item.status}
          onChange={e => onMove(item.id, e.target.value)}
          onClick={e => e.stopPropagation()}
        >
          {COLUMNS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <button onClick={() => onDetail(item.id)} className="p-1 text-gray-300 hover:text-primary-500 ml-1">
          <ExternalLink size={13} />
        </button>
      </div>
    </div>
  );
}

export default function Customizations() {
  const [newModal, setNewModal] = useState(false);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['customizations'],
    queryFn: () => api.get('/customizations?limit=200'),
    refetchInterval: 30000,
  });

  const all = data?.data || [];

  async function handleMove(id, newStatus) {
    try {
      await api.patch(`/customizations/${id}/status`, { status: newStatus });
      qc.invalidateQueries(['customizations']);
    } catch (err) { toast.error('Erro ao mover'); }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={30} className="animate-spin text-primary-500" />
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Personalização de Copos</h1>
          <p className="text-sm text-gray-500 mt-1">Fluxo de produção — {all.length} pedidos ativos</p>
        </div>
        <button onClick={() => setNewModal(true)} className="btn-primary">
          <Plus size={16} /> Novo Pedido
        </button>
      </div>

      {/* Kanban Board */}
      <div className="flex gap-4 overflow-x-auto pb-4" style={{ minHeight: '70vh' }}>
        {COLUMNS.map(col => {
          const cards = all.filter(i => i.status === col.key);
          return (
            <div key={col.key} className={`flex-shrink-0 w-64 rounded-xl border-2 ${col.color} flex flex-col`}>
              <div className="px-3 py-2 flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full ${col.badge}`} />
                <span className="text-sm font-semibold text-gray-700">{col.label}</span>
                <span className="ml-auto text-xs text-gray-400 bg-white rounded-full px-2 py-0.5">{cards.length}</span>
              </div>
              <div className="flex-1 p-2 space-y-2 overflow-y-auto">
                {cards.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-4">Nenhum pedido</p>
                ) : cards.map(item => (
                  <KanbanCard key={item.id} item={item} onMove={handleMove} onDetail={id => navigate(`/customizations/${id}`)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <Modal isOpen={newModal} onClose={() => setNewModal(false)} title="Novo Pedido de Personalização" size="md">
        <NewCustomizationModal
          onSaved={() => { setNewModal(false); qc.invalidateQueries(['customizations']); }}
          onCancel={() => setNewModal(false)}
        />
      </Modal>
    </div>
  );
}
