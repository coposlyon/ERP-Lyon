import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DollarSign, TrendingUp, TrendingDown, Check, Plus, Loader2, FileBarChart2, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import { format, parseISO, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const PAYMENT_METHODS = [
  ['cash','Dinheiro'],['pix','Pix'],['card_debit','Débito'],
  ['card_credit','Crédito'],['transfer','Transferência'],['check','Cheque'],['boleto','Boleto'],
];

// ─── Modal: Novo Lançamento ───────────────────────────────────────
function NewTransactionModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState({
    description: '', amount: '', due_date: format(new Date(), 'yyyy-MM-dd'),
    installments: 1, customer_id: '', supplier_id: '',
    chart_account_id: '', cost_center_id: '', document_number: '',
  });
  const [loading, setLoading] = useState(false);

  const { data: customers } = useQuery({ queryKey: ['customers-all'], queryFn: () => api.get('/customers?limit=500') });
  const { data: suppliers } = useQuery({ queryKey: ['suppliers-all'], queryFn: () => api.get('/suppliers?limit=200') });
  const { data: chartAccounts } = useQuery({ queryKey: ['chart-accounts'], queryFn: () => api.get('/financial-config/chart-accounts') });
  const { data: costCenters } = useQuery({ queryKey: ['cost-centers'], queryFn: () => api.get('/financial-config/cost-centers') });

  const total = parseFloat(form.amount || 0);
  const perInstallment = form.installments > 1 ? (total / form.installments).toFixed(2) : total;

  async function save(e) {
    e.preventDefault();
    if (!form.description || !form.amount || !form.due_date) { toast.error('Preencha descrição, valor e data'); return; }
    setLoading(true);
    try {
      if (form.installments > 1) {
        await api.post('/financial-config/lancamento-parcelado', {
          ...form, type, amount: total, installments: parseInt(form.installments), first_due_date: form.due_date,
          customer_id: form.customer_id || null, supplier_id: form.supplier_id || null,
          chart_account_id: form.chart_account_id || null, cost_center_id: form.cost_center_id || null,
        });
        toast.success(`${form.installments} parcelas criadas!`);
      } else {
        await api.post('/financial', {
          description: form.description, type, amount: total, due_date: form.due_date,
          customer_id: form.customer_id || null, supplier_id: form.supplier_id || null,
          chart_account_id: form.chart_account_id || null, cost_center_id: form.cost_center_id || null,
          document_number: form.document_number || null,
        });
        toast.success('Lançamento criado!');
      }
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao criar lançamento'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={save} className="space-y-3">
      <div className="flex items-center gap-2 p-2 rounded-lg mb-2" style={{ background: type === 'receivable' ? '#f0fdf4' : '#fff1f2' }}>
        {type === 'receivable'
          ? <ArrowDownCircle size={18} className="text-green-600" />
          : <ArrowUpCircle size={18} className="text-red-500" />}
        <span className="font-medium text-sm">{type === 'receivable' ? 'Conta a Receber' : 'Conta a Pagar'}</span>
      </div>
      <div>
        <label className="label">Descrição *</label>
        <input className="input" value={form.description} onChange={e => setForm(p => ({...p, description: e.target.value}))} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Valor (R$) *</label>
          <input type="number" step="0.01" min="0.01" className="input" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} required />
        </div>
        <div>
          <label className="label">Vencimento *</label>
          <input type="date" className="input" value={form.due_date} onChange={e => setForm(p => ({...p, due_date: e.target.value}))} required />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Parcelas</label>
          <select className="input" value={form.installments} onChange={e => setForm(p => ({...p, installments: parseInt(e.target.value)}))}>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => <option key={n} value={n}>{n}x {n > 1 ? `— ${fmt(total/n)}/mês` : '(à vista)'}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Nº Documento</label>
          <input className="input" value={form.document_number} onChange={e => setForm(p => ({...p, document_number: e.target.value}))} placeholder="NF, boleto, etc." />
        </div>
      </div>
      {type === 'receivable' && (
        <div>
          <label className="label">Cliente</label>
          <select className="input" value={form.customer_id} onChange={e => setForm(p => ({...p, customer_id: e.target.value}))}>
            <option value="">Sem cliente</option>
            {(customers?.data || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
      {type === 'payable' && (
        <div>
          <label className="label">Fornecedor</label>
          <select className="input" value={form.supplier_id} onChange={e => setForm(p => ({...p, supplier_id: e.target.value}))}>
            <option value="">Sem fornecedor</option>
            {(suppliers?.data || []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Plano de Contas</label>
          <select className="input" value={form.chart_account_id} onChange={e => setForm(p => ({...p, chart_account_id: e.target.value}))}>
            <option value="">Sem categoria</option>
            {(chartAccounts || []).filter(a => a.parent_id).map(a => <option key={a.id} value={a.id}>{a.code} - {a.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Centro de Custo</label>
          <select className="input" value={form.cost_center_id} onChange={e => setForm(p => ({...p, cost_center_id: e.target.value}))}>
            <option value="">Nenhum</option>
            {(costCenters || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
        </button>
      </div>
    </form>
  );
}

// ─── Modal: Pagar ────────────────────────────────────────────────
function PayModal({ transaction, onClose, onPaid }) {
  const [amount, setAmount] = useState((transaction?.amount - transaction?.paid_amount) || '');
  const [method, setMethod] = useState('pix');
  const [loading, setLoading] = useState(false);

  const { data: bankAccounts } = useQuery({ queryKey: ['bank-accounts'], queryFn: () => api.get('/financial-config/bank-accounts') });
  const [accountId, setAccountId] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(`/financial/pay/${transaction.id}`, { paid_amount: parseFloat(amount), payment_method: method, account_id: accountId || null });
      toast.success('Pagamento registrado!');
      onPaid();
    } catch (err) { toast.error(err.error || 'Erro ao registrar pagamento'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <p className="text-sm text-gray-600">{transaction?.description}</p>
        <p className="text-lg font-bold text-gray-900 mt-1">Saldo: {fmt((transaction?.amount || 0) - (transaction?.paid_amount || 0))}</p>
      </div>
      <div>
        <label className="label">Valor a Pagar (R$)</label>
        <input type="number" step="0.01" min="0.01" className="input" value={amount} onChange={e => setAmount(e.target.value)} required />
      </div>
      <div>
        <label className="label">Forma de Pagamento</label>
        <select className="input" value={method} onChange={e => setMethod(e.target.value)}>
          {PAYMENT_METHODS.map(([v,l]) => <option key={v} value={v}>{l}</option>)}
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

// ─── DRE ─────────────────────────────────────────────────────────
function DREView() {
  const [start, setStart] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'));
  const [end, setEnd] = useState(format(new Date(), 'yyyy-MM-dd'));

  const { data, isLoading } = useQuery({
    queryKey: ['dre', start, end],
    queryFn: () => api.get(`/financial-config/dre?start_date=${start}&end_date=${end}`),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary-500" /></div>;

  const r = data?.realizado || {};
  const p = data?.previsto || {};
  const margem = r.receitas > 0 ? ((r.resultado / r.receitas) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-end flex-wrap">
        <div><label className="label">De</label><input type="date" className="input w-36" value={start} onChange={e => setStart(e.target.value)} /></div>
        <div><label className="label">Até</label><input type="date" className="input w-36" value={end} onChange={e => setEnd(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-5 border-l-4 border-green-500">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Receitas Realizadas</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{fmt(r.receitas)}</p>
          <p className="text-xs text-gray-400 mt-1">Previsto: {fmt(p.receitas)}</p>
        </div>
        <div className="card p-5 border-l-4 border-red-500">
          <p className="text-xs text-gray-500 uppercase tracking-wide">Despesas Realizadas</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{fmt(r.despesas)}</p>
          <p className="text-xs text-gray-400 mt-1">Previsto: {fmt(p.despesas)}</p>
        </div>
        <div className={`card p-5 border-l-4 ${r.resultado >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
          <p className="text-xs text-gray-500 uppercase tracking-wide">Resultado</p>
          <p className={`text-2xl font-bold mt-1 ${r.resultado >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>{fmt(r.resultado)}</p>
          <p className="text-xs text-gray-400 mt-1">Margem: {margem}%</p>
        </div>
      </div>
    </div>
  );
}

// ─── Fluxo de Caixa Projetado ─────────────────────────────────────
function CashflowView() {
  const [months, setMonths] = useState(6);
  const { data, isLoading } = useQuery({
    queryKey: ['cashflow-projection', months],
    queryFn: () => api.get(`/financial/cashflow-projection?months=${months}`),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary-500" /></div>;

  const periods = data?.periods || [];
  const vencidos = data?.vencidos || { entradas: 0, saidas: 0 };
  const maxAbs = Math.max(1, ...periods.map(p => Math.max(p.entradas, p.saidas)));
  const fmtMonth = m => { try { return format(parseISO(m + '-01'), "MMM/yy", { locale: ptBR }); } catch { return m; } };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="card px-4 py-2">
            <p className="text-xs text-gray-500">Saldo inicial (bancos)</p>
            <p className="font-bold text-gray-800">{fmt(data?.saldo_inicial)}</p>
          </div>
          {(vencidos.entradas > 0 || vencidos.saidas > 0) && (
            <div className="card px-4 py-2 border-l-4 border-amber-400">
              <p className="text-xs text-amber-600">Vencidos em aberto</p>
              <p className="text-sm font-medium">
                <span className="text-green-600">+{fmt(vencidos.entradas)}</span>
                {' / '}
                <span className="text-red-500">−{fmt(vencidos.saidas)}</span>
              </p>
            </div>
          )}
        </div>
        <select className="input w-40 text-sm" value={months} onChange={e => setMonths(parseInt(e.target.value))}>
          {[3, 6, 12].map(n => <option key={n} value={n}>Próximos {n} meses</option>)}
        </select>
      </div>

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-100">
            <tr>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-28">Mês</th>
              <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Entradas × Saídas</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Entradas</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Saídas</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-32">Líquido</th>
              <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase w-36">Saldo Projetado</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(p => (
              <tr key={p.month} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-3 text-sm font-medium capitalize">{fmtMonth(p.month)}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1 h-6">
                    <div className="flex-1 flex justify-end">
                      <div className="bg-green-400 h-3 rounded-l" style={{ width: `${(p.entradas / maxAbs) * 100}%` }} />
                    </div>
                    <div className="w-px h-4 bg-gray-300" />
                    <div className="flex-1">
                      <div className="bg-red-400 h-3 rounded-r" style={{ width: `${(p.saidas / maxAbs) * 100}%` }} />
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-right text-sm text-green-600 font-medium">{fmt(p.entradas)}</td>
                <td className="px-4 py-3 text-right text-sm text-red-500 font-medium">{fmt(p.saidas)}</td>
                <td className={`px-4 py-3 text-right text-sm font-semibold ${p.liquido >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  {p.liquido >= 0 ? '+' : ''}{fmt(p.liquido)}
                </td>
                <td className={`px-4 py-3 text-right font-bold ${p.saldo >= 0 ? 'text-gray-800' : 'text-red-600'}`}>
                  {fmt(p.saldo)}
                </td>
              </tr>
            ))}
            {periods.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Sem lançamentos previstos no período</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        Projeção baseada nos lançamentos em aberto. O saldo de cada mês considera o saldo dos meses anteriores.
        Configure o saldo das contas em <strong>Config. Financeira → Contas Bancárias</strong>.
      </p>
    </div>
  );
}

// ─── Principal ────────────────────────────────────────────────────
export default function Financial() {
  const [tab, setTab] = useState('receivable');
  const [page, setPage] = useState(1);
  const [payModal, setPayModal] = useState(null);
  const [newModal, setNewModal] = useState(null);
  const [status, setStatus] = useState('');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['financial', tab, page, status],
    queryFn: () => api.get(`/financial/${tab === 'receivable' ? 'receivables' : 'payables'}?page=${page}&limit=20${status ? `&status=${status}` : ''}`),
    enabled: tab === 'receivable' || tab === 'payable',
  });

  const statusClass = { pending: 'badge-yellow', partial: 'badge-blue', paid: 'badge-green', overdue: 'badge-red', cancelled: 'badge-gray' };
  const statusLabel = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado' };

  const columns = [
    { key: 'due_date', label: 'Vencimento', width: 100,
      render: v => { try { const d = parseISO(v); const overdue = d < new Date() ? 'text-red-600 font-medium' : ''; return <span className={overdue}>{format(d, 'dd/MM/yyyy', { locale: ptBR })}</span>; } catch { return v; } } },
    { key: 'description', label: 'Descrição' },
    { key: tab === 'receivable' ? 'CLIENTES' : 'FORNECEDORES', label: tab === 'receivable' ? 'Cliente' : 'Fornecedor', render: v => v?.name || '—' },
    { key: 'installment', label: 'Parcela', width: 80,
      render: (v, row) => row.total_installments > 1 ? <span className="badge badge-gray">{v}/{row.total_installments}</span> : '—' },
    { key: 'amount', label: 'Total', width: 110, render: v => fmt(v) },
    { key: 'paid_amount', label: 'Pago', width: 110, render: v => <span className="text-green-600">{fmt(v)}</span> },
    { key: 'status', label: 'Status', width: 100,
      render: v => <span className={`badge ${statusClass[v] || 'badge-gray'}`}>{statusLabel[v] || v}</span> },
    { key: 'id', label: '', width: 80,
      render: (_, row) => row.status !== 'paid' && row.status !== 'cancelled' ? (
        <button onClick={() => setPayModal(row)} className="btn-primary btn-sm">
          <Check size={12} /> Pagar
        </button>
      ) : null },
  ];

  const summary = (data?.data || []).reduce((acc, t) => {
    acc.total += t.amount || 0;
    acc.paid += t.paid_amount || 0;
    acc.pending += Math.max(0, (t.amount || 0) - (t.paid_amount || 0));
    return acc;
  }, { total: 0, paid: 0, pending: 0 });

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Financeiro</h1>
        {tab !== 'dre' && (
          <button onClick={() => setNewModal(tab)} className="btn-primary">
            <Plus size={16} /> Novo Lançamento
          </button>
        )}
      </div>

      {(tab === 'receivable' || tab === 'payable') && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center"><DollarSign size={18} className="text-gray-600" /></div>
            <div><p className="text-xs text-gray-500">Total</p><p className="font-bold">{fmt(summary.total)}</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center"><TrendingUp size={18} className="text-green-600" /></div>
            <div><p className="text-xs text-gray-500">Pago</p><p className="font-bold text-green-700">{fmt(summary.paid)}</p></div>
          </div>
          <div className="card p-4 flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-50 rounded-xl flex items-center justify-center"><TrendingDown size={18} className="text-yellow-600" /></div>
            <div><p className="text-xs text-gray-500">Pendente</p><p className="font-bold text-yellow-700">{fmt(summary.pending)}</p></div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header flex gap-6 flex-wrap">
          {[
            ['receivable','Contas a Receber'],
            ['payable','Contas a Pagar'],
            ['cashflow','Fluxo de Caixa'],
            ['dre','DRE / Resultado'],
          ].map(([k, l]) => (
            <button key={k} onClick={() => { setTab(k); setPage(1); }}
              className={`pb-2 text-sm font-medium border-b-2 transition-colors flex items-center gap-1 ${tab === k ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-900'}`}>
              {k === 'dre' && <FileBarChart2 size={14} />}{k === 'cashflow' && <TrendingUp size={14} />}{l}
            </button>
          ))}
        </div>

        {tab === 'cashflow' ? (
          <div className="card-body"><CashflowView /></div>
        ) : tab === 'dre' ? (
          <div className="card-body"><DREView /></div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-gray-100">
              <select className="input max-w-[160px] text-sm" value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}>
                <option value="">Todos os status</option>
                {Object.entries(statusLabel).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <Table columns={columns} data={data?.data} loading={isLoading} />
            <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
          </>
        )}
      </div>

      <Modal isOpen={!!payModal} onClose={() => setPayModal(null)} title="Registrar Pagamento" size="sm">
        {payModal && <PayModal transaction={payModal} onClose={() => setPayModal(null)}
          onPaid={() => { setPayModal(null); qc.invalidateQueries(['financial']); }} />}
      </Modal>

      <Modal isOpen={!!newModal} onClose={() => setNewModal(null)}
        title={newModal === 'receivable' ? 'Nova Conta a Receber' : 'Nova Conta a Pagar'} size="md">
        {newModal && <NewTransactionModal type={newModal} onClose={() => setNewModal(null)}
          onSaved={() => { setNewModal(null); qc.invalidateQueries(['financial']); }} />}
      </Modal>
    </div>
  );
}
