import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft, ChevronRight, Wallet, ArrowUpCircle, ArrowDownCircle,
  AlertTriangle, Check, Loader2, Plus, Pencil, Ban, RefreshCw,
  CalendarClock, Repeat, Package, ShoppingCart, FileText, Zap,
} from 'lucide-react';
import { format, addMonths, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => (d ? format(parseISO(d), 'dd/MM/yyyy') : '—');

const PAYMENT_METHODS = [
  ['cash', 'Dinheiro'], ['pix', 'Pix'], ['card_debit', 'Débito'],
  ['card_credit', 'Crédito'], ['transfer', 'Transferência'], ['check', 'Cheque'], ['boleto', 'Boleto'],
];

// Origem do lançamento (badge na tabela)
function origem(l) {
  if (l.fixed_expense_id || l.reference_type === 'fixed_expense') return { label: 'Fixa', cls: 'badge-purple', Icon: Repeat };
  if (l.reference_type === 'replenishment') return { label: 'Reposição', cls: 'badge-blue', Icon: Package };
  if (l.reference_type === 'sale') return { label: 'Venda', cls: 'badge-green', Icon: ShoppingCart };
  if (l.reference_type === 'purchase') return { label: 'Compra', cls: 'badge-blue', Icon: ShoppingCart };
  return { label: 'Manual', cls: 'badge-gray', Icon: FileText };
}

function statusBadge(l) {
  if (l.status === 'cancelled') return <span className="badge badge-gray">Cancelado</span>;
  if (l.status === 'paid') return <span className="badge badge-green">{l.type === 'payable' ? 'Pago' : 'Recebido'}</span>;
  if (l.overdue) return <span className="badge badge-red">Vencido</span>;
  if (l.status === 'partial') return <span className="badge badge-yellow">Parcial</span>;
  return <span className="badge badge-blue">Pendente</span>;
}

// ─── Modal: Pagar / Receber ───────────────────────────────
function PayModal({ transaction, onClose, onSaved }) {
  const [amount, setAmount] = useState(transaction.remaining ?? (transaction.amount - (transaction.paid_amount || 0)));
  const [method, setMethod] = useState('pix');
  const [accountId, setAccountId] = useState('');
  const [loading, setLoading] = useState(false);
  const { data: bankAccounts } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api.get('/financial-config/bank-accounts') });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/financial/pay/${transaction.id}`, {
        paid_amount: parseFloat(amount), payment_method: method, account_id: accountId || null,
      });
      toast.success(transaction.type === 'payable' ? 'Pagamento registrado!' : 'Recebimento registrado!');
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao registrar'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <p className="text-sm text-gray-600">{transaction.description}</p>
        <p className="text-lg font-bold text-gray-900 mt-1">
          Saldo: {fmt((transaction.amount || 0) - (transaction.paid_amount || 0))}
        </p>
      </div>
      <div>
        <label className="label">Valor (R$)</label>
        <input type="number" step="0.01" min="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className="label">Forma de Pagamento</label>
        <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      {(bankAccounts || []).length > 0 && (
        <div>
          <label className="label">Conta Bancária</label>
          <select className="input" value={accountId} onChange={e => setAccountId(e.target.value)}>
            <option value="">Não informar</option>
            {bankAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
      )}
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Confirmar
        </button>
      </div>
    </form>
  );
}

// ─── Modal: Editar lançamento ─────────────────────────────
function EditModal({ transaction, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: transaction.description || '',
    amount: transaction.amount,
    due_date: transaction.due_date,
  });
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.patch(`/contas/${transaction.id}`, {
        description: form.description, amount: parseFloat(form.amount), due_date: form.due_date,
      });
      toast.success('Lançamento atualizado!');
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao atualizar'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Descrição</label>
        <input className="input" value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Valor (R$)</label>
          <input type="number" step="0.01" min="0.01" className="input" value={form.amount} onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Vencimento</label>
          <input type="date" className="input" value={form.due_date} onChange={e => setForm(p => ({ ...p, due_date: e.target.value }))} required />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
        </button>
      </div>
    </form>
  );
}

// ─── Modal: Despesa fixa (criar/editar) ───────────────────
function FixedExpenseModal({ expense, onClose, onSaved }) {
  const isEdit = !!expense?.id;
  const [form, setForm] = useState({
    name: expense?.name || '',
    amount: expense?.amount ?? '',
    due_day: expense?.due_day ?? 5,
    supplier_id: expense?.supplier_id || '',
    chart_account_id: expense?.chart_account_id || '',
    cost_center_id: expense?.cost_center_id || '',
    notes: expense?.notes || '',
    end_month: expense?.end_month ? String(expense.end_month).slice(0, 7) : '',
  });
  const [loading, setLoading] = useState(false);
  const { data: suppliers } = useQuery({ queryKey: ['suppliers-all'], queryFn: () => api.get('/suppliers?limit=200') });
  const { data: chartAccounts } = useQuery({ queryKey: ['chart-accounts'], queryFn: () => api.get('/financial-config/chart-accounts') });
  const { data: costCenters } = useQuery({ queryKey: ['cost-centers'], queryFn: () => api.get('/financial-config/cost-centers') });

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      const payload = {
        name: form.name, amount: parseFloat(form.amount), due_day: parseInt(form.due_day),
        supplier_id: form.supplier_id || null,
        chart_account_id: form.chart_account_id || null,
        cost_center_id: form.cost_center_id || null,
        notes: form.notes, end_month: form.end_month || null,
      };
      if (isEdit) await api.put(`/contas/fixed-expenses/${expense.id}`, payload);
      else await api.post('/contas/fixed-expenses', payload);
      toast.success(isEdit ? 'Despesa atualizada!' : 'Despesa fixa criada!');
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar despesa'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">Nome da despesa *</label>
        <input className="input" placeholder="Aluguel, Energia, Internet..." value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))} required />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Valor mensal (R$) *</label>
          <input type="number" step="0.01" min="0" className="input" value={form.amount}
            onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} required />
        </div>
        <div>
          <label className="label">Dia do vencimento *</label>
          <input type="number" min="1" max="31" className="input" value={form.due_day}
            onChange={e => setForm(p => ({ ...p, due_day: e.target.value }))} required />
        </div>
      </div>
      <div>
        <label className="label">Fornecedor</label>
        <select className="input" value={form.supplier_id} onChange={e => setForm(p => ({ ...p, supplier_id: e.target.value }))}>
          <option value="">Sem fornecedor</option>
          {(suppliers?.data || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Plano de Contas</label>
          <select className="input" value={form.chart_account_id} onChange={e => setForm(p => ({ ...p, chart_account_id: e.target.value }))}>
            <option value="">Sem categoria</option>
            {(chartAccounts || []).filter(a => a.parent_id).map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Centro de Custo</label>
          <select className="input" value={form.cost_center_id} onChange={e => setForm(p => ({ ...p, cost_center_id: e.target.value }))}>
            <option value="">Sem centro</option>
            {(costCenters || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Termina em (opcional)</label>
          <input type="month" className="input" value={form.end_month} onChange={e => setForm(p => ({ ...p, end_month: e.target.value }))} />
        </div>
        <div>
          <label className="label">Observações</label>
          <input className="input" value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} {isEdit ? 'Salvar' : 'Criar'}
        </button>
      </div>
    </form>
  );
}

// ─── Aba: Despesas fixas ──────────────────────────────────
function FixedExpensesTab() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null); // null | {} (novo) | despesa (edição)
  const { data: expenses, isLoading, error } = useQuery({
    queryKey: ['fixed-expenses'],
    queryFn: () => api.get('/contas/fixed-expenses'),
  });

  async function remove(exp) {
    if (!window.confirm(`Desativar a despesa fixa "${exp.name}"? As contas já geradas são mantidas.`)) return;
    try {
      await api.delete(`/contas/fixed-expenses/${exp.id}`);
      toast.success('Despesa desativada');
      qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
      qc.invalidateQueries({ queryKey: ['contas-month'] });
    } catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  async function reactivate(exp) {
    try {
      await api.put(`/contas/fixed-expenses/${exp.id}`, { is_active: true });
      toast.success('Despesa reativada');
      qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
    } catch (err) { toast.error(err.error || 'Erro ao reativar'); }
  }

  if (error) return (
    <div className="card p-6 text-center text-sm text-amber-700 bg-amber-50">
      <AlertTriangle className="mx-auto mb-2" size={20} />
      {error.error || 'Rode a migração 040_contas_precificacao.sql no Supabase para habilitar as despesas fixas.'}
    </div>
  );

  const total = (expenses || []).filter(e => e.is_active).reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-gray-600">
          Total mensal das despesas ativas: <span className="font-bold text-gray-900">{fmt(total)}</span>
        </p>
        <button className="btn-primary btn-sm" onClick={() => setModal({})}>
          <Plus size={15} /> Nova despesa fixa
        </button>
      </div>

      <div className="card overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary-500" /></div>
        ) : (
          <table className="table-auto w-full">
            <thead>
              <tr>
                <th>Despesa</th><th>Fornecedor</th><th className="text-center">Vence dia</th>
                <th className="text-right">Valor/mês</th><th className="text-center">Status</th><th className="text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {(expenses || []).map(e => (
                <tr key={e.id} className={!e.is_active ? 'opacity-50' : ''}>
                  <td>
                    <p className="font-medium text-gray-900">{e.name}</p>
                    {e.notes && <p className="text-xs text-gray-400">{e.notes}</p>}
                  </td>
                  <td className="text-sm text-gray-600">{e.FORNECEDORES?.name || '—'}</td>
                  <td className="text-center text-sm">{e.due_day}</td>
                  <td className="text-right font-semibold">{fmt(e.amount)}</td>
                  <td className="text-center">
                    {e.is_active
                      ? <span className="badge badge-green">Ativa</span>
                      : <span className="badge badge-gray">Inativa</span>}
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-1">
                      <button className="btn-ghost btn-sm p-1.5" title="Editar" onClick={() => setModal(e)}><Pencil size={15} /></button>
                      {e.is_active
                        ? <button className="btn-ghost btn-sm p-1.5 text-red-500" title="Desativar" onClick={() => remove(e)}><Ban size={15} /></button>
                        : <button className="btn-ghost btn-sm p-1.5 text-green-600" title="Reativar" onClick={() => reactivate(e)}><RefreshCw size={15} /></button>}
                    </div>
                  </td>
                </tr>
              ))}
              {(expenses || []).length === 0 && (
                <tr><td colSpan={6} className="text-center py-10 text-gray-400 text-sm">
                  Nenhuma despesa fixa cadastrada. Cadastre aluguel, energia, internet, salários fixos etc.
                </td></tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      <Modal isOpen={!!modal} onClose={() => setModal(null)} title={modal?.id ? 'Editar despesa fixa' : 'Nova despesa fixa'}>
        {modal && <FixedExpenseModal expense={modal.id ? modal : null}
          onClose={() => setModal(null)}
          onSaved={() => { setModal(null); qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); qc.invalidateQueries({ queryKey: ['contas-month'] }); }} />}
      </Modal>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────
export default function Contas() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [tab, setTab] = useState('mes'); // mes | fixas
  const [typeFilter, setTypeFilter] = useState('all');     // all | payable | receivable
  const [statusFilter, setStatusFilter] = useState('open'); // all | open | overdue | paid
  const [payModal, setPayModal] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [generating, setGenerating] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['contas-month', month],
    queryFn: () => api.get(`/contas/month?month=${month}`),
  });

  const monthLabel = useMemo(() => {
    const d = parseISO(`${month}-01`);
    const label = format(d, 'MMMM yyyy', { locale: ptBR });
    return label.charAt(0).toUpperCase() + label.slice(1);
  }, [month]);

  function shiftMonth(n) {
    setMonth(format(addMonths(parseISO(`${month}-01`), n), 'yyyy-MM'));
  }

  async function generateMonth() {
    setGenerating(true);
    try {
      const r = await api.post('/contas/fixed-expenses/generate', { month });
      if (r.created > 0) toast.success(`${r.created} conta(s) do mês gerada(s)!`);
      else toast(`Nada a gerar — ${r.skipped || 0} já existiam.`, { icon: 'ℹ️' });
      refetch();
    } catch (err) { toast.error(err.detail ? `${err.error}: ${err.detail}` : (err.error || 'Erro ao gerar contas')); }
    finally { setGenerating(false); }
  }

  async function cancel(l) {
    if (!window.confirm(`Cancelar o lançamento "${l.description}"?`)) return;
    try {
      await api.post(`/contas/${l.id}/cancel`);
      toast.success('Lançamento cancelado');
      refetch();
    } catch (err) { toast.error(err.error || 'Erro ao cancelar'); }
  }

  const s = data?.summary;
  const rows = useMemo(() => {
    let list = data?.transactions || [];
    if (typeFilter !== 'all') list = list.filter(l => l.type === typeFilter);
    if (statusFilter === 'open') list = list.filter(l => ['pending', 'partial', 'overdue'].includes(l.status));
    if (statusFilter === 'overdue') list = list.filter(l => l.overdue);
    if (statusFilter === 'paid') list = list.filter(l => l.status === 'paid');
    return list;
  }, [data, typeFilter, statusFilter]);

  const lateRows = data?.previous_overdue || [];

  function onSaved() { setPayModal(null); setEditModal(null); refetch(); qc.invalidateQueries({ queryKey: ['fixed-expenses'] }); }

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Wallet className="text-primary-600" size={24} /> Central de Contas
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">Todas as contas da empresa organizadas por mês</p>
        </div>
        <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 px-1 py-1">
          <button className="btn-ghost btn-sm p-1.5" onClick={() => shiftMonth(-1)}><ChevronLeft size={17} /></button>
          <span className="font-semibold text-gray-800 min-w-[150px] text-center text-sm">{monthLabel}</span>
          <button className="btn-ghost btn-sm p-1.5" onClick={() => shiftMonth(1)}><ChevronRight size={17} /></button>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-2 border-b border-gray-200">
        {[['mes', 'Contas do Mês', CalendarClock], ['fixas', 'Despesas Fixas', Repeat]].map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === key ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {tab === 'fixas' ? <FixedExpensesTab /> : (
        <>
          {/* Aviso: fixas ainda não geradas */}
          {(data?.fixed_pending || []).length > 0 && (
            <div className="card p-4 bg-indigo-50 border border-indigo-200 flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2 text-sm text-indigo-800">
                <Zap size={17} />
                <span>
                  <b>{data.fixed_pending.length}</b> despesa(s) fixa(s) ainda não viraram conta em {monthLabel}
                  {' '}({fmt(data.fixed_pending.reduce((t, f) => t + (Number(f.amount) || 0), 0))}).
                </span>
              </div>
              <button className="btn-primary btn-sm" disabled={generating} onClick={generateMonth}>
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />} Gerar contas do mês
              </button>
            </div>
          )}

          {/* Cards resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-4 border-l-4 border-red-500">
              <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1"><ArrowUpCircle size={13} /> A pagar no mês</p>
              <p className="text-xl font-bold text-red-600 mt-1">{fmt(s?.pagar.total)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Aberto: {fmt(s?.pagar.aberto)} · Pago: {fmt(s?.pagar.pago)}</p>
            </div>
            <div className="card p-4 border-l-4 border-green-500">
              <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1"><ArrowDownCircle size={13} /> A receber no mês</p>
              <p className="text-xl font-bold text-green-600 mt-1">{fmt(s?.receber.total)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Aberto: {fmt(s?.receber.aberto)} · Recebido: {fmt(s?.receber.recebido)}</p>
            </div>
            <div className={`card p-4 border-l-4 ${(s?.saldo_previsto ?? 0) >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo previsto do mês</p>
              <p className={`text-xl font-bold mt-1 ${(s?.saldo_previsto ?? 0) >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(s?.saldo_previsto)}</p>
              <p className="text-xs text-gray-400 mt-0.5">Realizado: {fmt(s?.saldo_realizado)}</p>
            </div>
            <div className="card p-4 border-l-4 border-amber-500">
              <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1"><AlertTriangle size={13} /> Vencidas</p>
              <p className="text-xl font-bold text-amber-600 mt-1">{fmt((s?.pagar.vencido || 0) + (s?.receber.vencido || 0))}</p>
              <p className="text-xs text-gray-400 mt-0.5">Meses anteriores: {fmt((s?.atrasado_anterior?.pagar || 0) + (s?.atrasado_anterior?.receber || 0))}</p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['all', 'Todas'], ['payable', 'A pagar'], ['receivable', 'A receber']].map(([v, l]) => (
                <button key={v} onClick={() => setTypeFilter(v)}
                  className={`px-3 py-1.5 text-sm ${typeFilter === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden">
              {[['open', 'Em aberto'], ['overdue', 'Vencidas'], ['paid', 'Pagas'], ['all', 'Todas']].map(([v, l]) => (
                <button key={v} onClick={() => setStatusFilter(v)}
                  className={`px-3 py-1.5 text-sm ${statusFilter === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Vencidas de meses anteriores */}
          {lateRows.length > 0 && statusFilter !== 'paid' && (
            <div className="card overflow-hidden border-amber-200">
              <div className="px-4 py-2.5 bg-amber-50 text-amber-800 text-sm font-semibold flex items-center gap-2">
                <AlertTriangle size={15} /> Em atraso de meses anteriores ({lateRows.length})
              </div>
              <TransactionsTable rows={lateRows} onPay={setPayModal} onEdit={setEditModal} onCancel={cancel} />
            </div>
          )}

          {/* Tabela do mês */}
          <div className="card overflow-hidden">
            {isLoading ? (
              <div className="flex justify-center p-12"><Loader2 className="animate-spin text-primary-500" /></div>
            ) : (
              <TransactionsTable rows={rows} onPay={setPayModal} onEdit={setEditModal} onCancel={cancel} />
            )}
          </div>
        </>
      )}

      <Modal isOpen={!!payModal} onClose={() => setPayModal(null)} title={payModal?.type === 'payable' ? 'Registrar pagamento' : 'Registrar recebimento'}>
        {payModal && <PayModal transaction={payModal} onClose={() => setPayModal(null)} onSaved={onSaved} />}
      </Modal>
      <Modal isOpen={!!editModal} onClose={() => setEditModal(null)} title="Editar lançamento">
        {editModal && <EditModal transaction={editModal} onClose={() => setEditModal(null)} onSaved={onSaved} />}
      </Modal>
    </div>
  );
}

function TransactionsTable({ rows, onPay, onEdit, onCancel }) {
  if (!rows.length) return (
    <div className="text-center py-12 text-gray-400 text-sm">Nenhum lançamento neste filtro.</div>
  );
  return (
    <div className="overflow-x-auto">
      <table className="table-auto w-full">
        <thead>
          <tr>
            <th>Vencimento</th><th>Descrição</th><th>Origem</th><th>Quem</th>
            <th className="text-right">Valor</th><th className="text-right">Pago</th>
            <th className="text-center">Status</th><th className="text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(l => {
            const o = origem(l);
            const canAct = !['paid', 'cancelled'].includes(l.status);
            return (
              <tr key={l.id} className={l.overdue ? 'bg-red-50/50' : ''}>
                <td className={`text-sm whitespace-nowrap ${l.overdue ? 'text-red-600 font-semibold' : ''}`}>{fmtDate(l.due_date)}</td>
                <td>
                  <p className="text-sm font-medium text-gray-900 flex items-center gap-1.5">
                    {l.type === 'payable'
                      ? <ArrowUpCircle size={14} className="text-red-400 flex-shrink-0" />
                      : <ArrowDownCircle size={14} className="text-green-500 flex-shrink-0" />}
                    {l.description}
                  </p>
                </td>
                <td><span className={`badge ${o.cls} inline-flex items-center gap-1`}><o.Icon size={11} /> {o.label}</span></td>
                <td className="text-sm text-gray-600">{l.FORNECEDORES?.name || l.CLIENTES?.name || '—'}</td>
                <td className="text-right font-semibold whitespace-nowrap">{fmt(l.amount)}</td>
                <td className="text-right text-sm text-gray-500 whitespace-nowrap">{fmt(l.paid_amount)}</td>
                <td className="text-center">{statusBadge(l)}</td>
                <td className="text-right">
                  {canAct && (
                    <div className="flex justify-end gap-1">
                      <button className="btn-primary btn-sm py-1 px-2 text-xs" onClick={() => onPay(l)}>
                        {l.type === 'payable' ? 'Pagar' : 'Receber'}
                      </button>
                      <button className="btn-ghost btn-sm p-1.5" title="Editar" onClick={() => onEdit(l)}><Pencil size={14} /></button>
                      <button className="btn-ghost btn-sm p-1.5 text-red-500" title="Cancelar" onClick={() => onCancel(l)}><Ban size={14} /></button>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
