import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Loader2, Building2, Tag, LayoutList } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

// ─── Plano de Contas ──────────────────────────────────────────────
function ChartAccounts() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '', type: 'receita', parent_id: '' });
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data = [] } = useQuery({ queryKey: ['chart-accounts'], queryFn: () => api.get('/financial-config/chart-accounts') });

  const typeColors = { receita: 'badge-green', despesa: 'badge-red', ativo: 'badge-blue', passivo: 'badge-yellow', patrimonio: 'badge-purple' };
  const typeLabels = { receita: 'Receita', despesa: 'Despesa', ativo: 'Ativo', passivo: 'Passivo', patrimonio: 'Patrimônio' };

  function openNew() { setEditing(null); setForm({ code: '', name: '', type: 'despesa', parent_id: '' }); setModal(true); }
  function openEdit(r) { setEditing(r); setForm({ code: r.code, name: r.name, type: r.type, parent_id: r.parent_id || '' }); setModal(true); }

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) { await api.put(`/financial-config/chart-accounts/${editing.id}`, form); toast.success('Atualizado!'); }
      else { await api.post('/financial-config/chart-accounts', form); toast.success('Criado!'); }
      qc.invalidateQueries(['chart-accounts']);
      setModal(false);
    } catch (err) { toast.error(err.error || 'Erro'); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Plano de Contas</h3>
        <button onClick={openNew} className="btn-primary btn-sm"><Plus size={14} /> Adicionar</button>
      </div>
      <div className="space-y-1">
        {data.map(r => (
          <div key={r.id} className={`flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-gray-50 ${r.parent_id ? 'ml-6 border-l-2 border-gray-200' : 'font-medium'}`}>
            <span className="text-xs text-gray-400 w-12 font-mono">{r.code}</span>
            <span className={`text-sm flex-1 ${!r.parent_id ? 'font-semibold' : ''}`}>{r.name}</span>
            <span className={`badge text-xs ${typeColors[r.type]}`}>{typeLabels[r.type]}</span>
            <button onClick={() => openEdit(r)} className="btn-ghost p-1"><Edit2 size={12} /></button>
          </div>
        ))}
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar Conta' : 'Nova Conta'} size="sm">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="label">Código *</label><input className="input" value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))} required /></div>
            <div><label className="label">Tipo *</label>
              <select className="input" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}>
                {Object.entries(typeLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required /></div>
          <div><label className="label">Conta Pai</label>
            <select className="input" value={form.parent_id} onChange={e => setForm(p => ({...p, parent_id: e.target.value}))}>
              <option value="">Nenhuma (raiz)</option>
              {data.filter(d => !d.parent_id).map(d => <option key={d.id} value={d.id}>{d.code} - {d.name}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Contas Bancárias ─────────────────────────────────────────────
function BankAccounts() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: '', bank_name: '', bank_code: '', agency: '', account: '', type: 'checking', balance: 0 });
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const { data = [] } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api.get('/financial-config/bank-accounts') });

  const typeLabels = { checking: 'Conta Corrente', savings: 'Poupança', cash: 'Caixa', investment: 'Investimento' };

  function openNew() { setEditing(null); setForm({ name: '', bank_name: '', bank_code: '', agency: '', account: '', type: 'checking', balance: 0 }); setModal(true); }
  function openEdit(r) { setEditing(r); setForm({ name: r.name, bank_name: r.bank_name || '', bank_code: r.bank_code || '', agency: r.agency || '', account: r.account || '', type: r.type, balance: r.balance }); setModal(true); }

  async function save(e) {
    e.preventDefault();
    setLoading(true);
    try {
      if (editing) { await api.put(`/financial-config/bank-accounts/${editing.id}`, form); toast.success('Atualizado!'); }
      else { await api.post('/financial-config/bank-accounts', form); toast.success('Criado!'); }
      qc.invalidateQueries(['bank-accounts']);
      setModal(false);
    } catch (err) { toast.error(err.error || 'Erro'); }
    finally { setLoading(false); }
  }

  const totalBalance = data.reduce((s, a) => s + (a.balance || 0), 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-800">Contas Bancárias</h3>
          <p className="text-xs text-gray-500">Saldo total: <span className="font-bold text-green-600">{fmt(totalBalance)}</span></p>
        </div>
        <button onClick={openNew} className="btn-primary btn-sm"><Plus size={14} /> Adicionar</button>
      </div>
      <div className="space-y-2">
        {data.map(a => (
          <div key={a.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
            <Building2 size={18} className="text-gray-400" />
            <div className="flex-1">
              <p className="text-sm font-medium">{a.name}</p>
              <p className="text-xs text-gray-500">{a.bank_name || typeLabels[a.type]} {a.agency ? `— Ag ${a.agency}` : ''}</p>
            </div>
            <div className="text-right">
              <p className={`text-sm font-bold ${a.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(a.balance)}</p>
              <p className="text-xs text-gray-400">{typeLabels[a.type]}</p>
            </div>
            <button onClick={() => openEdit(a)} className="btn-ghost p-1"><Edit2 size={12} /></button>
          </div>
        ))}
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar Conta' : 'Nova Conta Bancária'} size="md">
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2"><label className="label">Nome da conta *</label><input className="input" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required /></div>
            <div><label className="label">Tipo</label>
              <select className="input" value={form.type} onChange={e => setForm(p => ({...p, type: e.target.value}))}>
                {Object.entries(typeLabels).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div><label className="label">Banco</label><input className="input" value={form.bank_name} onChange={e => setForm(p => ({...p, bank_name: e.target.value}))} /></div>
            <div><label className="label">Agência</label><input className="input" value={form.agency} onChange={e => setForm(p => ({...p, agency: e.target.value}))} /></div>
            <div><label className="label">Conta</label><input className="input" value={form.account} onChange={e => setForm(p => ({...p, account: e.target.value}))} /></div>
            <div className="col-span-2"><label className="label">Saldo inicial (R$)</label><input type="number" step="0.01" className="input" value={form.balance} onChange={e => setForm(p => ({...p, balance: parseFloat(e.target.value) || 0}))} /></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">
              {loading ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ─── Centros de Custo ─────────────────────────────────────────────
function CostCenters() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ code: '', name: '' });
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const { data = [] } = useQuery({ queryKey: ['cost-centers'], queryFn: () => api.get('/financial-config/cost-centers') });

  async function save(e) {
    e.preventDefault(); setLoading(true);
    try {
      if (editing) { await api.put(`/financial-config/cost-centers/${editing.id}`, form); toast.success('Atualizado!'); }
      else { await api.post('/financial-config/cost-centers', form); toast.success('Criado!'); }
      qc.invalidateQueries(['cost-centers']); setModal(false);
    } catch (err) { toast.error(err.error || 'Erro'); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-800">Centros de Custo</h3>
        <button onClick={() => { setEditing(null); setForm({ code: '', name: '' }); setModal(true); }} className="btn-primary btn-sm"><Plus size={14} /> Adicionar</button>
      </div>
      <div className="space-y-2">
        {data.map(r => (
          <div key={r.id} className="flex items-center gap-3 p-2 hover:bg-gray-50 rounded-lg">
            <Tag size={14} className="text-gray-400" />
            <span className="text-xs font-mono text-gray-400 w-16">{r.code}</span>
            <span className="text-sm flex-1">{r.name}</span>
            <button onClick={() => { setEditing(r); setForm({ code: r.code || '', name: r.name }); setModal(true); }} className="btn-ghost p-1"><Edit2 size={12} /></button>
          </div>
        ))}
      </div>
      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar Centro' : 'Novo Centro de Custo'} size="sm">
        <form onSubmit={save} className="space-y-3">
          <div><label className="label">Código</label><input className="input" value={form.code} onChange={e => setForm(p => ({...p, code: e.target.value}))} /></div>
          <div><label className="label">Nome *</label><input className="input" value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required /></div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button type="button" onClick={() => setModal(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary">{loading ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function FinancialConfig() {
  const [tab, setTab] = useState('chart');
  const tabs = [
    { key: 'chart', label: 'Plano de Contas', icon: LayoutList },
    { key: 'bank', label: 'Contas Bancárias', icon: Building2 },
    { key: 'cost', label: 'Centros de Custo', icon: Tag },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Configuração Financeira</h1>
      </div>
      <div className="card">
        <div className="card-header flex gap-4 border-b border-gray-100">
          {tabs.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 pb-3 text-sm font-medium border-b-2 transition-colors ${tab === t.key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
              <t.icon size={15} /> {t.label}
            </button>
          ))}
        </div>
        <div className="card-body">
          {tab === 'chart' && <ChartAccounts />}
          {tab === 'bank' && <BankAccounts />}
          {tab === 'cost' && <CostCenters />}
        </div>
      </div>
    </div>
  );
}
