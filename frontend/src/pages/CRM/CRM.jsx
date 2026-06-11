import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target, Plus, ChevronRight, Phone, Mail, Users,
  MessageCircle, Calendar, CheckSquare, Clock, AlertCircle,
  TrendingUp, Award, MoreVertical, X, Check,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { format, parseISO, isAfter, isBefore } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => {
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d || '—'; }
};

const STAGES = [
  { key:'prospecting',   label:'Prospecção',   color:'#64748b', bg:'bg-gray-100',    text:'text-gray-700'  },
  { key:'qualification', label:'Qualificação',  color:'#0ea5e9', bg:'bg-sky-100',     text:'text-sky-700'   },
  { key:'proposal',      label:'Proposta',      color:'#a855f7', bg:'bg-purple-100',  text:'text-purple-700'},
  { key:'negotiation',   label:'Negociação',    color:'#f59e0b', bg:'bg-amber-100',   text:'text-amber-700' },
  { key:'won',           label:'Ganho',         color:'#10b981', bg:'bg-emerald-100', text:'text-emerald-700'},
  { key:'lost',          label:'Perdido',       color:'#ef4444', bg:'bg-red-100',     text:'text-red-700'   },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const INTERACTION_ICONS = {
  call:     { icon: Phone,          label:'Ligação',  cls:'bg-blue-100   text-blue-700'  },
  email:    { icon: Mail,           label:'E-mail',   cls:'bg-indigo-100 text-indigo-700'},
  visit:    { icon: Users,          label:'Visita',   cls:'bg-teal-100   text-teal-700'  },
  whatsapp: { icon: MessageCircle,  label:'WhatsApp', cls:'bg-green-100  text-green-700' },
  meeting:  { icon: Calendar,       label:'Reunião',  cls:'bg-orange-100 text-orange-700'},
  note:     { icon: MoreVertical,   label:'Anotação', cls:'bg-gray-100   text-gray-700'  },
};

const PRIORITY_CFG = {
  low:    { l:'Baixa',   cls:'bg-gray-100   text-gray-600'  },
  normal: { l:'Normal',  cls:'bg-blue-100   text-blue-700'  },
  high:   { l:'Alta',    cls:'bg-orange-100 text-orange-700'},
  urgent: { l:'Urgente', cls:'bg-red-100    text-red-700'   },
};

// ── Formulário nova oportunidade ──────────────────────────
function OpportunityForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({
    title:'', value:'', stage:'prospecting', probability:'20',
    expected_close_date:'', notes:'',
  });
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [custOpen, setCustOpen] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ['crm-cust-search', customerSearch],
    queryFn: () => api.get(`/customers?search=${encodeURIComponent(customerSearch)}&limit=8`).then(d => d.data||[]),
    enabled: customerSearch.length > 1,
  });

  const mut = useMutation({
    mutationFn: d => api.post('/crm/opportunities', d),
    onSuccess: () => { toast.success('Oportunidade criada!'); onSaved(); },
    onError: e => toast.error(e.error || 'Erro'),
  });

  const STAGE_PROBS = { prospecting:'20', qualification:'40', proposal:'60', negotiation:'80', won:'100', lost:'0' };

  function submit(e) {
    e.preventDefault();
    mut.mutate({ ...form, customer_id: selectedCustomer?.id||null, value: Number(form.value||0), probability: Number(form.probability||0) });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Título *</label>
        <input className="input" placeholder="Ex: Pedido de 500 copos personalizados"
          value={form.title} onChange={e => setForm(p => ({...p, title:e.target.value}))} required />
      </div>

      <div>
        <label className="label">Cliente</label>
        <div className="relative">
          <input className="input" placeholder="Buscar cliente..."
            value={selectedCustomer ? selectedCustomer.name : customerSearch}
            onChange={e => { setCustomerSearch(e.target.value); setSelectedCustomer(null); setCustOpen(true); }}
            onFocus={() => setCustOpen(true)}
          />
          {custOpen && customers.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
              {customers.map(c => (
                <button key={c.id} type="button"
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                  onClick={() => { setSelectedCustomer(c); setCustOpen(false); }}>
                  {c.name}
                  {c.cpf_cnpj && <span className="text-gray-400 ml-2 text-xs">{c.cpf_cnpj}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Valor estimado</label>
          <input type="number" className="input" min="0" step="0.01"
            value={form.value} onChange={e => setForm(p => ({...p, value:e.target.value}))} />
        </div>
        <div>
          <label className="label">Estágio</label>
          <select className="input" value={form.stage}
            onChange={e => setForm(p => ({...p, stage:e.target.value, probability: STAGE_PROBS[e.target.value]||p.probability}))}>
            {STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Probabilidade (%)</label>
          <input type="number" className="input" min="0" max="100"
            value={form.probability} onChange={e => setForm(p => ({...p, probability:e.target.value}))} />
        </div>
        <div>
          <label className="label">Previsão de fechamento</label>
          <input type="date" className="input"
            value={form.expected_close_date} onChange={e => setForm(p => ({...p, expected_close_date:e.target.value}))} />
        </div>
      </div>

      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2}
          value={form.notes} onChange={e => setForm(p => ({...p, notes:e.target.value}))} />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
          {mut.isPending ? 'Salvando...' : 'Criar Oportunidade'}
        </button>
      </div>
    </form>
  );
}

// ── Modal detalhe oportunidade ────────────────────────────
function OpportunityDetail({ opp, onClose, onRefresh }) {
  const qc = useQueryClient();
  const [interactionType, setInteractionType] = useState('note');
  const [interactionDesc, setInteractionDesc] = useState('');
  const [nextAction, setNextAction] = useState('');
  const [nextDate, setNextDate] = useState('');

  const { data: interactions = [], refetch: refetchInter } = useQuery({
    queryKey: ['crm-interactions', opp?.id],
    queryFn: () => api.get(`/crm/interactions?opportunity_id=${opp.id}`),
    enabled: !!opp?.id,
  });

  const stageMut = useMutation({
    mutationFn: ({ id, stage }) => api.patch(`/crm/opportunities/${id}`, { stage }),
    onSuccess: () => { onRefresh(); qc.invalidateQueries(['crm-pipeline']); },
    onError: e => toast.error(e.error||'Erro'),
  });
  const interMut = useMutation({
    mutationFn: d => api.post('/crm/interactions', d),
    onSuccess: () => { setInteractionDesc(''); setNextAction(''); setNextDate(''); refetchInter(); toast.success('Interação registrada'); },
    onError: e => toast.error(e.error||'Erro'),
  });

  if (!opp) return null;
  const st = STAGE_MAP[opp.stage];
  const nextStages = STAGES.filter(s => s.key !== opp.stage && !['won','lost'].includes(s.key));

  function submitInteraction(e) {
    e.preventDefault();
    if (!interactionDesc.trim()) return;
    interMut.mutate({
      opportunity_id: opp.id,
      customer_id: opp.customer_id || null,
      type: interactionType,
      description: interactionDesc,
      next_action: nextAction || null,
      next_action_date: nextDate || null,
    });
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900">{opp.title}</h3>
          <p className="text-sm text-gray-500">{opp.CLIENTES?.name || 'Sem cliente'}</p>
        </div>
        <div className="text-right">
          <p className="font-bold text-gray-900">{fmt(opp.value)}</p>
          <span className={`badge text-xs ${st?.bg} ${st?.text}`}>{st?.label}</span>
        </div>
      </div>

      {/* Mover de estágio */}
      <div>
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Mover para</p>
        <div className="flex flex-wrap gap-1.5">
          {STAGES.filter(s => s.key !== opp.stage).map(s => (
            <button key={s.key}
              onClick={() => { stageMut.mutate({ id: opp.id, stage: s.key }); opp.stage = s.key; onRefresh(); }}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${s.bg} ${s.text} border-current/20 hover:opacity-80`}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Nova interação */}
      <div className="border rounded-xl p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Registrar interação</p>
        <div className="flex gap-1.5 flex-wrap">
          {Object.entries(INTERACTION_ICONS).map(([k,v]) => {
            const Icon = v.icon;
            return (
              <button key={k} type="button"
                onClick={() => setInteractionType(k)}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  interactionType===k ? v.cls+' ring-1 ring-current/30' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}>
                <Icon size={12}/> {v.label}
              </button>
            );
          })}
        </div>
        <form onSubmit={submitInteraction} className="space-y-2">
          <textarea className="input resize-none w-full text-sm" rows={2}
            placeholder="Descreva a interação..."
            value={interactionDesc} onChange={e => setInteractionDesc(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <input className="input text-sm" placeholder="Próxima ação..."
              value={nextAction} onChange={e => setNextAction(e.target.value)} />
            <input type="date" className="input text-sm"
              value={nextDate} onChange={e => setNextDate(e.target.value)} />
          </div>
          <button type="submit" disabled={interMut.isPending || !interactionDesc.trim()}
            className="w-full py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
            {interMut.isPending ? 'Registrando...' : 'Registrar'}
          </button>
        </form>
      </div>

      {/* Histórico */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Histórico ({interactions.length})</p>
        <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
          {interactions.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma interação registrada</p>
          )}
          {interactions.map(inter => {
            const ic = INTERACTION_ICONS[inter.type];
            const Icon = ic?.icon;
            return (
              <div key={inter.id} className="flex gap-3 p-3 bg-gray-50 rounded-xl">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${ic?.cls}`}>
                  {Icon && <Icon size={13}/>}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800">{inter.description}</p>
                  {inter.next_action && (
                    <p className="text-xs text-indigo-600 mt-0.5">→ {inter.next_action} {inter.next_action_date && `(${fmtDate(inter.next_action_date)})`}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">{ic?.label} · {fmtDate(inter.interaction_date?.split('T')[0])} · {inter.USUARIOS?.name}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Card de oportunidade (Kanban) ─────────────────────────
function OppCard({ opp, onClick }) {
  const isOverdue = opp.expected_close_date && isBefore(parseISO(opp.expected_close_date), new Date()) && !['won','lost'].includes(opp.stage);
  return (
    <div onClick={() => onClick(opp)}
      className="bg-white border border-gray-200 rounded-xl p-3 shadow-sm hover:shadow-md transition-shadow cursor-pointer space-y-2">
      <p className="text-sm font-semibold text-gray-900 leading-tight line-clamp-2">{opp.title}</p>
      {opp.CLIENTES && (
        <p className="text-xs text-gray-500 flex items-center gap-1"><Users size={10}/>{opp.CLIENTES.name}</p>
      )}
      <div className="flex items-center justify-between">
        <span className="text-sm font-bold text-gray-800">{fmt(opp.value)}</span>
        <span className="text-xs text-gray-400">{opp.probability}%</span>
      </div>
      {opp.expected_close_date && (
        <p className={`text-xs flex items-center gap-1 ${isOverdue ? 'text-red-500' : 'text-gray-400'}`}>
          <Calendar size={10}/>
          {isOverdue && '⚠ '}{fmtDate(opp.expected_close_date)}
        </p>
      )}
    </div>
  );
}

// ── Formulário follow-up ──────────────────────────────────
function FollowUpForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({ description:'', due_date:'', priority:'normal' });

  const mut = useMutation({
    mutationFn: d => api.post('/crm/followups', d),
    onSuccess: () => { toast.success('Follow-up agendado'); onSaved(); },
    onError: e => toast.error(e.error||'Erro'),
  });

  return (
    <form onSubmit={e => { e.preventDefault(); mut.mutate(form); }} className="space-y-4">
      <div>
        <label className="label">Descrição *</label>
        <textarea className="input resize-none" rows={2}
          value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Data *</label>
          <input type="date" className="input" value={form.due_date}
            onChange={e => setForm(p=>({...p,due_date:e.target.value}))} required />
        </div>
        <div>
          <label className="label">Prioridade</label>
          <select className="input" value={form.priority} onChange={e => setForm(p=>({...p,priority:e.target.value}))}>
            <option value="low">Baixa</option>
            <option value="normal">Normal</option>
            <option value="high">Alta</option>
            <option value="urgent">Urgente</option>
          </select>
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
          {mut.isPending ? 'Salvando...' : 'Agendar'}
        </button>
      </div>
    </form>
  );
}

// ── Página principal CRM ──────────────────────────────────
export default function CRM() {
  const [modalOpp, setModalOpp]     = useState(false);
  const [modalFup, setModalFup]     = useState(false);
  const [detailOpp, setDetailOpp]   = useState(null);
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['crm-stats'],
    queryFn: () => api.get('/crm/stats'),
  });
  const { data: pipeline, refetch: refetchPipeline } = useQuery({
    queryKey: ['crm-pipeline'],
    queryFn: () => api.get('/crm/opportunities'),
    select: d => d.pipeline,
  });
  const { data: followups = [], refetch: refetchFups } = useQuery({
    queryKey: ['crm-followups'],
    queryFn: () => api.get('/crm/followups?completed=false'),
  });

  const completeFup = useMutation({
    mutationFn: id => api.patch(`/crm/followups/${id}/complete`),
    onSuccess: () => { refetchFups(); toast.success('Concluído!'); },
  });
  const deleteFup = useMutation({
    mutationFn: id => api.delete(`/crm/followups/${id}`),
    onSuccess: () => refetchFups(),
  });

  const today = new Date().toISOString().split('T')[0];
  const overdueFups  = followups.filter(f => f.due_date < today);
  const pendingFups  = followups.filter(f => f.due_date >= today);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-indigo-100 rounded-lg flex items-center justify-center">
            <Target size={18} className="text-indigo-600"/>
          </div>
          <div>
            <h1 className="page-title">CRM — Pipeline de Vendas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestão de oportunidades e relacionamento</p>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setModalFup(true)} className="btn-secondary"><CheckSquare size={15}/> Follow-up</button>
          <button onClick={() => setModalOpp(true)} className="btn-primary"><Plus size={16}/> Nova Oportunidade</button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label:'Total oportunidades', val: stats?.opportunities?.total||0, cls:'text-gray-900', icon: <Target size={16} className="text-indigo-400"/> },
          { label:'Valor pipeline', val: fmt(stats?.opportunities?.pipeline_value), cls:'text-indigo-700 text-lg', icon: <TrendingUp size={16} className="text-indigo-400"/> },
          { label:'Total ganhos', val: fmt(stats?.opportunities?.won_value), cls:'text-green-700 text-lg', icon: <Award size={16} className="text-green-400"/> },
          { label:'Follow-ups atrasados', val: stats?.followups?.overdue||0, cls:'text-red-700', icon: <AlertCircle size={16} className="text-red-400"/> },
        ].map((s,i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">{s.icon}</div>
            <div>
              <p className={`font-bold ${s.cls}`}>{s.val}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Kanban Pipeline */}
      <div>
        <h2 className="text-sm font-semibold text-gray-700 mb-3">Pipeline de Negócios</h2>
        <div className="flex gap-3 overflow-x-auto pb-3">
          {STAGES.map(stage => {
            const cards = pipeline?.[stage.key] || [];
            const stageValue = cards.reduce((s,o) => s+(o.value||0), 0);
            return (
              <div key={stage.key} className="flex-shrink-0 w-64">
                <div className={`${stage.bg} ${stage.text} px-3 py-2 rounded-xl mb-2 flex items-center justify-between`}>
                  <span className="text-xs font-semibold">{stage.label}</span>
                  <div className="text-right">
                    <span className="text-xs opacity-75">{cards.length}</span>
                    {cards.length > 0 && <span className="text-xs opacity-60 ml-1">· {fmt(stageValue)}</span>}
                  </div>
                </div>
                <div className="space-y-2 min-h-16">
                  {cards.map(opp => (
                    <OppCard key={opp.id} opp={opp}
                      onClick={o => setDetailOpp(o)}/>
                  ))}
                  {cards.length === 0 && (
                    <div className="border-2 border-dashed border-gray-200 rounded-xl h-16 flex items-center justify-center">
                      <span className="text-xs text-gray-300">Sem oportunidades</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Follow-ups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Atrasados */}
        {overdueFups.length > 0 && (
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <AlertCircle size={16} className="text-red-500"/>
              <h3 className="font-semibold text-red-700">Atrasados ({overdueFups.length})</h3>
            </div>
            <div className="divide-y divide-gray-50">
              {overdueFups.map(f => (
                <div key={f.id} className="px-4 py-3 flex items-start gap-3">
                  <div className="w-2 h-2 rounded-full bg-red-400 mt-1.5 flex-shrink-0"/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{f.description}</p>
                    <p className="text-xs text-red-500 mt-0.5">Venceu em {fmtDate(f.due_date)}</p>
                  </div>
                  <button onClick={() => completeFup.mutate(f.id)}
                    className="text-green-600 hover:text-green-700 p-1"><Check size={15}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Pendentes */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-indigo-500"/>
              <h3 className="font-semibold text-gray-700">Próximos Follow-ups ({pendingFups.length})</h3>
            </div>
            <button onClick={() => setModalFup(true)} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium flex items-center gap-1">
              <Plus size={11}/> Novo
            </button>
          </div>
          <div className="divide-y divide-gray-50 max-h-64 overflow-y-auto">
            {pendingFups.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum follow-up pendente 🎉</p>
            )}
            {pendingFups.map(f => {
              const P = PRIORITY_CFG[f.priority];
              const isToday = f.due_date === today;
              return (
                <div key={f.id} className={`px-4 py-3 flex items-start gap-3 ${isToday ? 'bg-amber-50/60' : ''}`}>
                  <div className={`w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0 ${
                    f.priority==='urgent'?'bg-red-500':f.priority==='high'?'bg-orange-400':'bg-blue-400'
                  }`}/>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800">{f.description}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`badge text-xs ${P?.cls}`}>{P?.l}</span>
                      <span className={`text-xs ${isToday?'text-amber-600 font-medium':'text-gray-400'}`}>
                        {isToday ? '⭐ Hoje' : fmtDate(f.due_date)}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => completeFup.mutate(f.id)}
                    className="text-green-600 hover:text-green-700 p-1" title="Concluir">
                    <Check size={15}/>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Modals */}
      <Modal isOpen={modalOpp} onClose={() => setModalOpp(false)} title="Nova Oportunidade" size="lg">
        <OpportunityForm
          onSaved={() => { setModalOpp(false); qc.invalidateQueries(['crm-pipeline']); qc.invalidateQueries(['crm-stats']); }}
          onCancel={() => setModalOpp(false)}/>
      </Modal>
      <Modal isOpen={modalFup} onClose={() => setModalFup(false)} title="Agendar Follow-up" size="md">
        <FollowUpForm onSaved={() => { setModalFup(false); refetchFups(); }} onCancel={() => setModalFup(false)}/>
      </Modal>
      <Modal isOpen={!!detailOpp} onClose={() => setDetailOpp(null)} title={detailOpp?.title} size="xl">
        <OpportunityDetail opp={detailOpp} onClose={() => setDetailOpp(null)} onRefresh={refetchPipeline}/>
      </Modal>
    </div>
  );
}
