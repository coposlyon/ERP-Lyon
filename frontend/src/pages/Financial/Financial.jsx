import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, TrendingUp, TrendingDown, Check, Plus, Loader2, FileBarChart2,
  ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, MessageCircle,
  FileCheck2, ShieldCheck, AlertTriangle, ExternalLink, Copy, Undo2, History,
} from 'lucide-react';
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="label">Valor (R$) *</label>
          <input type="number" step="0.01" min="0.01" className="input" value={form.amount} onChange={e => setForm(p => ({...p, amount: e.target.value}))} required />
        </div>
        <div>
          <label className="label">Vencimento *</label>
          <input type="date" className="input" value={form.due_date} onChange={e => setForm(p => ({...p, due_date: e.target.value}))} required />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// ─── Modal: Cobrança PIX ──────────────────────────────────────────
function PixModal({ transaction, onClose }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    api.post(`/financial/${transaction.id}/pix`, {})
      .then(d => { if (alive) setData(d); })
      .catch(e => { if (alive) setErr(e.error || 'Erro ao gerar PIX'); });
    return () => { alive = false; };
  }, [transaction.id]);

  function copy() {
    navigator.clipboard?.writeText(data.copy_paste || '').then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }

  if (err) return (
    <div className="text-center py-6">
      <p className="text-sm text-red-600">{err}</p>
      <p className="text-xs text-gray-400 mt-2">Configure o Mercado Pago (variável MP_ACCESS_TOKEN) para gerar cobranças PIX.</p>
      <button onClick={onClose} className="btn-secondary mt-4">Fechar</button>
    </div>
  );
  if (!data) return <div className="py-10 text-center text-gray-400"><Loader2 className="animate-spin mx-auto mb-2" /> Gerando PIX...</div>;

  return (
    <div className="text-center space-y-3">
      <p className="text-sm text-gray-500">{transaction.description}</p>
      <p className="text-2xl font-bold text-gray-900">{fmt((transaction.amount || 0) - (transaction.paid_amount || 0))}</p>
      {data.qr_code_base64 && <img src={`data:image/png;base64,${data.qr_code_base64}`} alt="QR PIX" className="w-48 h-48 mx-auto rounded-lg border border-gray-100" />}
      {data.copy_paste && <div className="bg-gray-50 rounded-xl p-2 text-xs text-gray-600 break-all font-mono">{data.copy_paste}</div>}
      <button onClick={copy} className="btn-primary w-full">{copied ? '✓ Copiado!' : 'Copiar código PIX'}</button>
      <p className="text-xs text-gray-400">A baixa é automática quando o cliente pagar (webhook Mercado Pago).</p>
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
/* ══ O MÊS, E O QUE FICA PARA TRÁS QUANDO ELE VIRA ═══════════ */

const primeiroDia = d => new Date(d.getFullYear(), d.getMonth(), 1);
const ultimoDia = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nomeDoMes = d => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

/**
 * A BARRA DOS MESES.
 *
 * A tela mostrava tudo de uma vez, em ordem de vencimento — e "tudo" é
 * o ano inteiro depois de dois meses de uso. Quem fecha o mês precisa
 * ver O MÊS: o que venceu, o que entrou e o que ficou.
 */
function MesNavegador({ mes, onMudar, pendencias }) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-gray-100">
      <button className="btn-secondary btn-sm" onClick={() => onMudar(-1)} title="Mês anterior">
        <ChevronLeft size={15} />
      </button>
      <span className="text-sm font-semibold capitalize min-w-[170px] text-center">{nomeDoMes(mes)}</span>
      <button className="btn-secondary btn-sm" onClick={() => onMudar(1)} title="Próximo mês">
        <ChevronRight size={15} />
      </button>
      <button className="btn-secondary btn-sm" onClick={() => onMudar(0)}>Mês atual</button>

      {pendencias?.total > 0 && (
        <span className="ml-auto inline-flex items-center gap-1.5 text-[12px] px-2.5 py-1 rounded-lg
                         bg-amber-50 border border-amber-300 text-amber-800">
          <AlertTriangle size={13} />
          {pendencias.a_conferir > 0 && <>{pendencias.a_conferir} a conferir</>}
          {pendencias.a_conferir > 0 && pendencias.a_confirmar > 0 && ' · '}
          {pendencias.a_confirmar > 0 && <>{pendencias.a_confirmar} a confirmar</>}
        </span>
      )}
    </div>
  );
}

/**
 * O AVISO DE VIRAR O MÊS.
 *
 * Passar de mês com comprovante por conferir é como o dinheiro de
 * setembro aparece em outubro: ninguém volta para trás para procurar o
 * que ficou. O aviso não impede — quem fecha o caixa às vezes precisa
 * olhar o mês que vem antes de terminar este —, mas obriga a ver a
 * lista antes de seguir.
 */
function AvisoDeVirada({ mes, pendencias, onFicar, onSeguir }) {
  return (
    <Modal isOpen onClose={onFicar} title="Antes de passar o mês" size="md">
      <div className="space-y-3">
        <p className="flex gap-2 text-sm rounded-xl px-3 py-2.5 bg-amber-50 border border-amber-300 text-amber-900">
          <AlertTriangle size={17} className="shrink-0 mt-0.5" />
          <span>
            <b>AINDA FALTAM CONTAS A SEREM CONFIRMADAS, VERIFIQUE-AS ANTES DE PASSAR O MÊS.</b>
            <span className="block mt-1 font-normal capitalize">{nomeDoMes(mes)}</span>
          </span>
        </p>

        <div className="flex gap-3 text-[13px]">
          {pendencias.a_conferir > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-gray-100">
              <b>{pendencias.a_conferir}</b> comprovante(s) a conferir
            </span>
          )}
          {pendencias.a_confirmar > 0 && (
            <span className="px-2.5 py-1 rounded-lg bg-gray-100">
              <b>{pendencias.a_confirmar}</b> pagamento(s) a confirmar
            </span>
          )}
        </div>

        <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
          {(pendencias.itens || []).map(i => (
            <div key={i.id} className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
              <span className={`badge ${i.situacao === 'a_confirmar' ? 'badge-blue' : 'badge-yellow'}`}>
                {i.situacao === 'a_confirmar' ? 'confirmar' : 'conferir'}
              </span>
              <span className="min-w-0 flex-1 truncate">{i.cliente || i.descricao}</span>
              <span className="tabular-nums text-gray-500">{fmt(i.valor)}</span>
            </div>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-secondary" onClick={onFicar}>Ficar e verificar</button>
          <button className="btn-primary" onClick={onSeguir}>Passar assim mesmo</button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * A CONFERÊNCIA DO COMPROVANTE — o financeiro olhando o papel.
 *
 * Ela é separada da confirmação de propósito: conferir é dizer "este
 * documento é o que diz ser"; confirmar é dizer "o dinheiro entrou".
 * Juntar as duas em um clique é como o print de uma transferência
 * agendada vira caixa.
 */
function ConferirModal({ conta, onClose, onFeito }) {
  const [nota, setNota] = useState('');
  const [carregando, setCarregando] = useState(null);
  const leitura = conta.receipt_read || {};

  async function abrirArquivo() {
    try {
      const r = await api.get(`/financial/receipts/${conta.id}/arquivo`);
      if (r?.url) window.open(r.url, '_blank', 'noopener');
    } catch (e) { toast.error(e.error || 'Não foi possível abrir o comprovante'); }
  }

  async function decidir(status) {
    setCarregando(status);
    try {
      await api.post(`/financial/receipts/${conta.id}/conferir`, { status, nota });
      toast.success(status === 'conferido' ? 'Comprovante conferido' : `Marcado como ${status}`);
      onFeito();
    } catch (e) {
      toast.error(e.error || 'Não foi possível registrar a conferência');
    } finally { setCarregando(null); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 p-3 text-[13px] space-y-1">
        <p className="font-semibold text-gray-800">{conta.description}</p>
        <p className="text-gray-500">
          Declarado no anexo: <b className="text-gray-800">{fmt(conta.receipt_amount ?? conta.amount)}</b>
          {conta.receipt_by && <> · anexado por {conta.receipt_by}</>}
        </p>
        {leitura?.valor != null && (
          <p className="text-gray-500">
            A leitura da imagem achou <b className="text-gray-800">{fmt(leitura.valor)}</b>
            {leitura.data ? ` em ${leitura.data}` : ''}{leitura.banco ? ` · ${leitura.banco}` : ''}
            {leitura.pagador ? ` · pagador: ${leitura.pagador}` : ''}
          </p>
        )}
        {conta.receipt_status === 'divergente' && (
          <p className="text-amber-700 flex items-center gap-1.5">
            <AlertTriangle size={13} /> O valor lido é diferente do declarado — olhe com atenção.
          </p>
        )}
        <button className="btn-secondary btn-sm mt-1" onClick={abrirArquivo}>
          <ExternalLink size={13} /> Abrir o comprovante
        </button>
      </div>

      <label className="block">
        <span className="label">Observação (fica no histórico)</span>
        <input className="input" value={nota} onChange={e => setNota(e.target.value)}
          placeholder="Ex.: confere com o extrato do dia 08." />
      </label>

      <div className="flex flex-wrap justify-end gap-2">
        <button className="btn-secondary" disabled={!!carregando} onClick={() => decidir('recusado')}>
          Recusar
        </button>
        <button className="btn-secondary" disabled={!!carregando} onClick={() => decidir('divergente')}>
          Marcar divergente
        </button>
        <button className="btn-primary" disabled={!!carregando} onClick={() => decidir('conferido')}>
          {carregando === 'conferido' ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />}
          Conferido
        </button>
      </div>
    </div>
  );
}

/**
 * A CONFIRMAÇÃO DO PAGAMENTO — o dinheiro entrando.
 *
 * O valor vem preenchido com o que foi declarado, e é EDITÁVEL: quando
 * o cliente paga 350 numa parcela de 200, o que sobra escorre para as
 * parcelas seguintes do mesmo pedido. Quem faz essa conta é o servidor;
 * aqui só se diz quanto entrou.
 */
function ConfirmarModal({ conta, onClose, onFeito }) {
  const total = Number(conta.amount) || 0;
  const jaLancado = Number(conta.paid_amount) || 0;
  /**
   * O CAMPO É O TOTAL RECEBIDO, e vem preenchido com o valor do
   * comprovante — do jeito que ele está escrito lá.
   *
   * Perguntar "quanto entrou a MAIS" obrigava a fazer uma subtração de
   * cabeça olhando um comprovante que traz o valor cheio. E o erro é
   * sempre para o mesmo lado: lança-se de novo o que já estava lançado.
   */
  const sugerido = conta.receipt_amount ?? (jaLancado > 0 ? jaLancado : total);
  const [valor, setValor] = useState(String(sugerido ?? ''));
  const [enviando, setEnviando] = useState(false);
  const semComprovante = !conta.receipt_url;
  const digitado = Number(String(valor).replace(',', '.')) || 0;
  const excedente = Math.max(0, digitado - total);
  const aMenos = Math.max(0, total - digitado);
  const ratificar = jaLancado > 0 && !conta.paid_at;

  async function confirmar() {
    setEnviando(true);
    try {
      const r = await api.post(`/financial/receipts/${conta.id}/confirmar`, {
        valor: Number(String(valor).replace(',', '.')),
        sem_comprovante: semComprovante,
      });
      const extra = [];
      if ((r.aplicados || []).length > 1) extra.push(`${r.aplicados.length - 1} parcela(s) seguinte(s) abatida(s)`);
      if (r.saldo) extra.push(`saldo de ${fmt(r.saldo.amount)} em aberto`);
      if (r.sobra > 0) extra.push(`sobrou ${fmt(r.sobra)} de crédito com o cliente`);
      toast.success(
        `${fmt(r.total_recebido)} confirmados por ${r.confirmado_por}`
        + (extra.length ? ` — ${extra.join(', ')}` : ''),
        { duration: 8000 });
      // O pedido anda como consequência da confirmação, e quem confirmou
      // precisa ver isso: é o retorno do ato dela na fábrica.
      if (r.pedido_status) {
        toast('O pedido seguiu para a próxima etapa.', { icon: '📦', duration: 6000 });
      }
      onFeito();
    } catch (e) {
      toast.error([e.error, e.dica].filter(Boolean).join(' '));
    } finally { setEnviando(false); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 p-3 text-[13px] space-y-1">
        <p className="font-semibold text-gray-800">{conta.description}</p>
        <p className="text-gray-500">Valor desta conta: <b className="text-gray-800">{fmt(total)}</b></p>
        {ratificar && (
          <p className="text-gray-500">
            Já lançados sem confirmação: <b className="text-gray-800">{fmt(jaLancado)}</b>
          </p>
        )}
        {conta.receipt_by && (
          <p className="text-gray-500">Comprovante anexado por {conta.receipt_by}</p>
        )}
      </div>

      <label className="block">
        <span className="label">Valor total recebido</span>
        <input className="input w-44" type="number" step="0.01" min={0}
          value={valor} onChange={e => setValor(e.target.value)} />
        <p className="text-[11.5px] text-gray-500 mt-1">
          O valor que está no comprovante, inteiro. Não é o que falta nem o que entrou a mais.
        </p>
      </label>

      {excedente > 0 && (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800">
          <b>{fmt(excedente)}</b> a mais do que esta conta — o excedente abate as parcelas seguintes
          do mesmo pedido, na ordem. O que sobrar depois de cobrir tudo fica como crédito do cliente.
        </p>
      )}
      {aMenos > 0 && digitado > 0 && (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900">
          <b>{fmt(aMenos)}</b> a menos que o valor desta conta — o restante vira uma parcela nova de
          saldo, esperando o próximo comprovante.
        </p>
      )}
      {semComprovante && (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
          Esta conta não tem comprovante. Confirmando assim, fica registrado que o pagamento
          entrou <b>sem comprovante</b> — e com o seu nome.
        </p>
      )}

      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button className="btn-primary" onClick={confirmar} disabled={enviando || !(digitado > 0)}>
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Confirmar pagamento
        </button>
      </div>
    </div>
  );
}

/**
 * A COBRANÇA PELO WHATSAPP.
 *
 * Um clique ao lado do nome: gera o Pix da conta, monta a mensagem
 * combinada e manda. Com o WhatsApp da Meta configurado, o servidor
 * envia sozinho; sem ele, abre a conversa já escrita — que é o que o
 * vendedor faz hoje à mão, com a diferença de que o Pix vai junto e
 * certo.
 */
function CobrancaModal({ conta, onClose }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState('');
  const [abriu, setAbriu] = useState(false);

  useEffect(() => {
    let vivo = true;
    api.post(`/financial/${conta.id}/cobranca-whatsapp`, {})
      .then(r => { if (vivo) setDados(r); })
      .catch(e => { if (vivo) setErro([e.error, e.dica].filter(Boolean).join(' ')); });
    return () => { vivo = false; };
  }, [conta.id]);

  if (erro) return <p className="text-sm text-red-600">{erro}</p>;
  if (!dados) {
    return <p className="flex items-center gap-2 text-sm text-gray-500 py-6 justify-center">
      <Loader2 size={15} className="animate-spin" /> Gerando a cobrança…
    </p>;
  }

  const copiar = (texto, oque) => {
    navigator.clipboard?.writeText(texto || '');
    toast.success(`${oque} copiado`);
  };

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-600">
        Cobrança de <b>{fmt(dados.valor)}</b> para <b>{dados.cliente || 'o cliente'}</b>
        {dados.telefone
          ? <> · {dados.telefone}</>
          : <> · <span className="text-amber-700">sem telefone cadastrado</span></>}
      </p>

      {dados.qr_base64 && (
        <img src={`data:image/png;base64,${dados.qr_base64}`} alt="QR Code do Pix"
          className="mx-auto rounded-xl border border-gray-200" style={{ width: 200, height: 200 }} />
      )}

      {/* O CÓDIGO EM CAMPO PRÓPRIO, com o rótulo em cima — é assim que
          ele vai na mensagem também. Um Pix colado no meio do texto é
          um Pix que o cliente seleciona pela metade. */}
      <div>
        <span className="label">Chave Pix (copia e cola)</span>
        <div className="flex gap-2">
          <input className="input font-mono text-[11px]" readOnly value={dados.copia_e_cola || ''}
            onFocus={e => e.target.select()} />
          <button className="btn-secondary btn-sm shrink-0" title="Copiar a chave"
            onClick={() => copiar(dados.copia_e_cola, 'Pix')}>
            <Copy size={14} />
          </button>
        </div>
      </div>

      <div>
        <span className="label">Mensagem que vai para o cliente</span>
        <textarea className="input text-[12.5px]" rows={6} readOnly value={dados.mensagem} />
      </div>

      {dados.envio?.modo === 'automatico' ? (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800">
          Enviado pelo WhatsApp automaticamente.
        </p>
      ) : (
        <>
          {/* O CAMINHO NORMAL, e não um aviso de erro.
              Mandar sozinho exige a API oficial da Meta (número
              verificado e template aprovado para mensagem que a empresa
              inicia). Até lá o envio é meio automático: o WhatsApp abre
              com tudo escrito e a pessoa aperta enviar. */}
          <p className="text-[12.5px] rounded-xl px-3 py-2.5 flex gap-2
                        bg-blue-50 border border-blue-200 text-blue-900">
            <MessageCircle size={15} className="shrink-0 mt-0.5" />
            <span>
              O WhatsApp abre com a mensagem e o Pix já escritos —
              <b> é só apertar enviar</b>. {dados.envio?.motivo ? `(${dados.envio.motivo})` : ''}
            </span>
          </p>

          {abriu && (
            <p className="text-[12.5px] rounded-xl px-3 py-2 bg-gray-50 border border-gray-200 text-gray-700">
              Abriu numa aba nova. Se não abriu, o navegador pode ter bloqueado a janela —
              copie a mensagem e mande pelo WhatsApp.
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2">
            <button className="btn-secondary" onClick={() => copiar(dados.mensagem, 'Mensagem')}>
              <Copy size={14} /> Copiar mensagem
            </button>
            <button className="btn-primary" disabled={!dados.wa_link}
              title={dados.wa_link ? 'Abre a conversa com a mensagem escrita' : 'Cliente sem telefone cadastrado'}
              onClick={() => { window.open(dados.wa_link, '_blank', 'noopener'); setAbriu(true); }}>
              <MessageCircle size={14} /> Abrir o WhatsApp e enviar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * DESFAZER O PAGAMENTO — com motivo, porque alguém vai perguntar.
 *
 * Serve para o engano de hoje e para as linhas que ficaram pagas quando
 * anexar o comprovante ainda pagava: elas estão quitadas sem ninguém do
 * financeiro ter olhado, e sem isto não há como trazê-las de volta.
 */
function DesfazerModal({ conta, onClose, onFeito }) {
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const semConfirmacao = !conta.paid_at;

  async function desfazer() {
    setEnviando(true);
    try {
      const r = await api.post(`/financial/receipts/${conta.id}/desfazer`, { motivo });
      toast.success(`Pagamento de ${fmt(r.desfeito)} desfeito. A conta voltou para a fila.`);
      onFeito();
    } catch (e) {
      toast.error(e.error || 'Não foi possível desfazer');
    } finally { setEnviando(false); }
  }

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-700">
        <b>{conta.description}</b> — pago {fmt(conta.paid_amount)} de {fmt(conta.amount)}
        {conta.paid_by ? <> · confirmado por {conta.paid_by}</> : null}.
      </p>

      {semConfirmacao && (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900">
          Esta linha ficou paga <b>sem passar pelo financeiro</b> — é do tempo em que anexar o
          comprovante já dava o pagamento por feito. Desfazer devolve ela para a fila de
          conferência, com o comprovante intacto.
        </p>
      )}

      <label className="block">
        <span className="label">Motivo (fica na auditoria)</span>
        <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)}
          placeholder="Ex.: linha paga pelo fluxo antigo, vou conferir o comprovante." />
      </label>

      <div className="flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose} disabled={enviando}>Cancelar</button>
        <button className="btn-primary" onClick={desfazer} disabled={enviando}>
          {enviando ? <Loader2 size={14} className="animate-spin" /> : <Undo2 size={14} />}
          Desfazer o pagamento
        </button>
      </div>
    </div>
  );
}

/**
 * DE ONDE VEIO ESTA CONTA.
 *
 * A pergunta que traz alguém aqui é sempre a mesma, e é feita com o
 * cliente na linha: "esse valor é de quê?". A resposta estava em três
 * lugares — o pedido, a auditoria e as colunas da conta — e ninguém
 * cruza três lugares com o telefone no ombro.
 *
 * Agora é um botão. Em cima, a origem em uma frase e o pedido que a
 * gerou; embaixo, a linha do tempo inteira, com hora e com nome de quem
 * fez cada coisa.
 */
function HistoricoModal({ conta }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['financial-historico', conta.id],
    queryFn: () => api.get(`/financial/${conta.id}/historico`),
  });

  if (isLoading) {
    return <p className="text-sm text-gray-500 flex items-center gap-2 py-6 justify-center">
      <Loader2 size={14} className="animate-spin" /> Levantando o histórico…
    </p>;
  }
  if (error) {
    return <p className="text-sm text-red-600 py-4">{error.error || 'Não consegui levantar o histórico'}</p>;
  }

  const c = data?.conta || {};
  const ped = data?.pedido;
  const eventos = data?.eventos || [];

  const COR = {
    origem: 'bg-blue-500',
    criacao: 'bg-gray-300',
    pedido: 'bg-blue-400',
    comprovante: 'bg-amber-400',
    conferencia: 'bg-violet-400',
    pagamento: 'bg-green-500',
    auditoria: 'bg-gray-400',
  };

  const quando = at => {
    try { return format(parseISO(at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); }
    catch { return String(at || '').slice(0, 16).replace('T', ' '); }
  };

  return (
    <div className="space-y-4">
      {/* A FICHA: o que é esta conta, em quatro linhas. */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] space-y-1">
        <p className="font-semibold text-gray-800">{c.descricao}</p>
        <p className="text-gray-600">
          {fmt(c.valor)}
          {c.parcela && c.total_parcelas > 1 ? <> · parcela {c.parcela}/{c.total_parcelas}</> : null}
          {c.vencimento ? <> · vence {String(c.vencimento).slice(0, 10).split('-').reverse().join('/')}</> : null}
          {c.pessoa ? <> · {c.pessoa}</> : null}
        </p>
        <p className="text-gray-600">
          Origem: <b>{c.origem}</b>
          {c.documento ? <> · documento {c.documento}</> : null}
        </p>
        {!c.confirmado_por && (
          <p className="text-amber-700">Ainda sem confirmação do financeiro.</p>
        )}
      </div>

      {/* O PEDIDO, quando existe: é o que responde "de quê". */}
      {ped && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 px-3 py-2.5 text-[13px] space-y-1">
          <p className="font-semibold text-blue-900">Gerada pelo pedido {ped.codigo}</p>
          <p className="text-blue-800">
            {fmt(ped.total)}
            {ped.frete ? <> (frete {fmt(ped.frete)})</> : null}
            {ped.vendedor ? <> · vendido por {ped.vendedor}</> : null}
          </p>
          <p className="text-blue-800">
            Etapa agora: <b>{ped.status_label}</b>
            {ped.pagamento ? <> · pagamento {ped.pagamento}</> : null}
          </p>
          <a href={`/sales/${ped.id}/detalhe`} target="_blank" rel="noopener noreferrer"
            className="text-blue-700 underline inline-flex items-center gap-1 text-[12px]">
            <ExternalLink size={11} /> Abrir o pedido
          </a>
        </div>
      )}

      {/* A LINHA DO TEMPO. */}
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Histórico completo
        </p>
        {eventos.length === 0 ? (
          <p className="text-sm text-gray-400">Sem eventos registrados nesta conta.</p>
        ) : (
          <ol className="space-y-3">
            {eventos.map((e, i) => (
              <li key={i} className="flex gap-3">
                <div className="flex flex-col items-center pt-1">
                  <span className={`w-2 h-2 rounded-full ${COR[e.tipo] || 'bg-gray-300'}`} />
                  {i < eventos.length - 1 && <span className="flex-1 w-px bg-gray-200 mt-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-[13px] font-medium text-gray-800">{e.titulo}</p>
                  {e.detalhe && <p className="text-[12.5px] text-gray-600">{e.detalhe}</p>}
                  <p className="text-[11.5px] text-gray-400">
                    {quando(e.at)}{e.quem ? ` · ${e.quem}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

export default function Financial() {
  const [tab, setTab] = useState('receivable');
  const [page, setPage] = useState(1);
  const [payModal, setPayModal] = useState(null);
  const [newModal, setNewModal] = useState(null);
  const [pixModal, setPixModal] = useState(null);
  const [status, setStatus] = useState('');
  // O mês em que a tela está. As contas passaram a ser lidas mês a mês:
  // "tudo" vira o ano inteiro depois de dois meses de uso, e quem fecha
  // o caixa precisa ver O MÊS.
  const [mes, setMes] = useState(() => primeiroDia(new Date()));
  const [virada, setVirada] = useState(null);   // { destino } enquanto o aviso está aberto
  const [conferir, setConferir] = useState(null);
  const [confirmar, setConfirmar] = useState(null);
  const [cobranca, setCobranca] = useState(null);
  const [desfazer, setDesfazer] = useState(null);
  const [historico, setHistorico] = useState(null);

  /** Abre o arquivo do comprovante (o link é assinado e expira). */
  async function verComprovante(row) {
    try {
      const r = await api.get(`/financial/receipts/${row.id}/arquivo`);
      if (r?.url) window.open(r.url, '_blank', 'noopener');
      else toast.error('Não foi possível abrir o comprovante');
    } catch (e) { toast.error(e.error || 'Não foi possível abrir o comprovante'); }
  }
  const qc = useQueryClient();

  const de = iso(primeiroDia(mes));
  const ate = iso(ultimoDia(mes));

  const { data, isLoading } = useQuery({
    queryKey: ['financial', tab, page, status, de, ate],
    queryFn: () => api.get(`/financial/${tab === 'receivable' ? 'receivables' : 'payables'}`
      + `?page=${page}&limit=20&start_date=${de}&end_date=${ate}${status ? `&status=${status}` : ''}`),
    enabled: tab === 'receivable' || tab === 'payable',
  });

  // O que ainda espera o financeiro NESTE mês — é o número que segura o
  // clique de passar de mês.
  const { data: pendencias } = useQuery({
    queryKey: ['financial-pendencias', de, ate],
    queryFn: () => api.get(`/financial/pendencias?start_date=${de}&end_date=${ate}`),
    enabled: tab === 'receivable',
  });

  /**
   * TROCAR DE MÊS PASSA PELO AVISO.
   *
   * `passo` é -1, +1 ou 0 (voltar para o mês atual). Havendo comprovante
   * por conferir ou pagamento por confirmar, a janela aparece antes —
   * ela não impede, mas obriga a ver a lista.
   */
  function mudarMes(passo, forcar = false) {
    const destino = passo === 0
      ? primeiroDia(new Date())
      : new Date(mes.getFullYear(), mes.getMonth() + passo, 1);
    if (!forcar && tab === 'receivable' && pendencias?.total > 0) {
      setVirada({ destino });
      return;
    }
    setMes(destino);
    setPage(1);
  }

  const statusClass = { pending: 'badge-yellow', partial: 'badge-blue', paid: 'badge-green', overdue: 'badge-red', cancelled: 'badge-gray' };
  const statusLabel = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido', cancelled: 'Cancelado' };

  const columns = [
    { key: 'due_date', label: 'Vencimento', width: 100,
      render: v => { try { const d = parseISO(v); const overdue = d < new Date() ? 'text-red-600 font-medium' : ''; return <span className={overdue}>{format(d, 'dd/MM/yyyy', { locale: ptBR })}</span>; } catch { return v; } } },
    { key: 'description', label: 'Descrição' },
    { key: tab === 'receivable' ? 'CLIENTES' : 'FORNECEDORES',
      label: tab === 'receivable' ? 'Cliente' : 'Fornecedor',
      // O BOTÃO DE COBRAR FICA NO NOME, e não numa coluna de ações no
      // fim da linha: cobrar é uma coisa que se faz PARA UMA PESSOA, e é
      // o nome dela que a pessoa procura na tela.
      render: (v, row) => (
        <span className="inline-flex items-center gap-1.5 min-w-0">
          <span className="truncate">{v?.name || '—'}</span>
          {tab === 'receivable' && v?.name && row.status !== 'paid' && (
            <button onClick={() => setCobranca(row)} title="Cobrar pelo WhatsApp (Pix + mensagem)"
              className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center
                         bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100">
              <MessageCircle size={13} />
            </button>
          )}
        </span>
      ) },
    ...(tab === 'receivable' ? [{
      key: 'receipt_status', label: 'Comprovante', width: 180,
      /**
       * O SELO É O BOTÃO — porque "a conferir" sem como abrir o
       * comprovante não serve para nada. Quem lê essa palavra quer ver
       * o papel no clique seguinte, e não abrir outra janela para
       * chegar até ele.
       */
      render: (v, row) => {
        if (!row.receipt_url) {
          return row.paid_at
            ? <span className="badge badge-gray" title={`Confirmado por ${row.paid_by || '—'}`}>sem comprovante</span>
            : <span className="text-gray-300">—</span>;
        }
        const selo = row.paid_at
          ? { cls: 'badge-green', txt: 'confirmado', tit: `Confirmado por ${row.paid_by} em ${row.paid_at?.slice(0, 10)}` }
          : v === 'conferido' ? { cls: 'badge-blue', txt: 'conferido · a confirmar', tit: `Conferido por ${row.receipt_by || '—'}` }
          : v === 'divergente' ? { cls: 'badge-red', txt: 'divergente', tit: 'O valor lido não bate com o declarado' }
          : v === 'recusado' ? { cls: 'badge-gray', txt: 'recusado', tit: 'Comprovante recusado' }
          : { cls: 'badge-yellow', txt: 'a conferir', tit: `Anexado por ${row.receipt_by || '—'}` };
        return (
          <button onClick={() => verComprovante(row)} title={`${selo.tit} — clique para ver o comprovante`}
            className={`badge ${selo.cls} hover:opacity-80 inline-flex items-center gap-1`}>
            <ExternalLink size={11} /> {selo.txt}
          </button>
        );
      },
    }] : []),
    { key: 'installment', label: 'Parcela', width: 80,
      render: (v, row) => row.total_installments > 1 ? <span className="badge badge-gray">{v}/{row.total_installments}</span> : '—' },
    { key: 'amount', label: 'Total', width: 110, render: v => fmt(v) },
    { key: 'paid_amount', label: 'Pago', width: 110,
      // Verde é dinheiro confirmado. O que entrou sem confirmação
      // aparece em âmbar — está lançado, mas não vale como recebido.
      render: (v, row) => (
        <span className={row.confirmado === false && (Number(v) || 0) > 0 ? 'text-amber-600' : 'text-green-600'}>
          {fmt(v)}
        </span>
      ) },
    { key: 'status', label: 'Status', width: 150,
      /**
       * O SELO É A SITUAÇÃO, NÃO A COLUNA DO BANCO.
       *
       * Enquanto o financeiro não confirma, é PENDENTE — por mais que
       * exista `paid_amount` lançado. Dinheiro que ninguém do financeiro
       * conferiu não é pagamento: é uma afirmação esperando conferência,
       * e um selo verde ali é o sistema afirmando o que ninguém afirmou.
       */
      render: (v, row) => {
        const sit = row.situacao || v;
        return (
          <span className="inline-flex flex-col items-start gap-0.5">
            <span className="inline-flex items-center gap-1 flex-wrap">
              <span className={`badge ${statusClass[sit] || 'badge-gray'}`}>{statusLabel[sit] || sit}</span>
              {row.pago_sem_confirmacao > 0 && (
                <span className="badge badge-yellow"
                  title={`${fmt(row.pago_sem_confirmacao)} lançados sem confirmação do financeiro`}>
                  aguardando confirmação
                </span>
              )}
            </span>
            {/* QUEM CONFIRMOU, NA LINHA. "Pago" sozinho não diz de quem é
                a responsabilidade; e é a primeira pergunta quando o
                extrato não bate. */}
            {row.paid_at && (
              <span className="text-[10.5px] text-green-700">
                confirmado por {row.paid_by || 'financeiro'}
              </span>
            )}
          </span>
        );
      } },
    { key: 'id', label: '', width: 250,
      render: (_, row) => {
        if (row.status === 'cancelled') return null;
        const temComprovante = !!row.receipt_url;
        const conferido = row.receipt_status === 'conferido';
        /**
         * CONFIRMADO É `paid_at`, E NÃO `status === 'paid'`.
         *
         * As duas coisas pareciam a mesma e não são: existe linha PAGA
         * que ninguém do financeiro confirmou — as que ficaram assim
         * quando anexar o comprovante ainda pagava. Tratá-las como
         * confirmadas escondia todos os botões delas: não dava para
         * conferir o comprovante, não dava para desfazer, e a linha
         * ficava parada num estado que ninguém escolheu.
         */
        const confirmado = !!row.paid_at;
        const quitada = (Number(row.paid_amount) || 0) >= (Number(row.amount) || 0) - 0.005;
        const pagoSemConfirmar = quitada && !confirmado;
        return (
          <div className="flex gap-1 justify-end flex-wrap">
            {/* A ORDEM DOS BOTÕES É A ORDEM DO TRABALHO: conferir o
                papel, depois confirmar o dinheiro. */}
            {tab === 'receivable' && temComprovante && !conferido && (
              <button onClick={() => setConferir(row)} className="btn-secondary btn-sm" title="Conferir o comprovante">
                <FileCheck2 size={12} /> Conferir
              </button>
            )}
            {/* SEM `!quitada`. A linha paga pelo fluxo antigo JÁ está
                quitada e mesmo assim precisa de confirmação — era ela
                que ficava presa: conferia o comprovante e não havia
                botão nenhum para onde ir. */}
            {tab === 'receivable' && !confirmado && (conferido || !temComprovante) && (
              <button onClick={() => setConfirmar(row)} className="btn-primary btn-sm">
                <Check size={12} /> Confirmar
              </button>
            )}
            {/* A saída para a linha que está paga sem ninguém ter
                confirmado, e para o engano de hoje. */}
            {tab === 'receivable' && (Number(row.paid_amount) || 0) > 0 && (
              <button onClick={() => setDesfazer(row)} className="btn-secondary btn-sm"
                title={pagoSemConfirmar
                  ? 'Esta linha foi paga sem passar pelo financeiro — desfazer devolve para a fila'
                  : 'Desfazer o pagamento'}>
                <Undo2 size={12} /> Desfazer
              </button>
            )}
            {tab === 'payable' && row.status !== 'paid' && (
              <button onClick={() => setPayModal(row)} className="btn-primary btn-sm">
                <Check size={12} /> Pagar
              </button>
            )}
            {tab === 'receivable' && !quitada && (
              <button onClick={() => setPixModal(row)} className="btn-secondary btn-sm" title="Gerar cobrança PIX">PIX</button>
            )}
            {/* VALE PARA AS DUAS ABAS. A pergunta "de onde saiu esta
                conta?" é a mesma no que se recebe e no que se paga. */}
            <button onClick={() => setHistorico(row)} className="btn-secondary btn-sm"
              title="Ver de onde esta conta foi gerada e tudo o que aconteceu com ela">
              <History size={12} /> Histórico
            </button>
          </div>
        );
      } },
  ];

  /**
   * OS CARTÕES CONTAM O QUE FOI CONFIRMADO.
   *
   * "Pago R$ 215,00" com o comprovante ainda por conferir é o número que
   * faz alguém fechar o mês achando que o dinheiro entrou. Aqui só entra
   * em PAGO o que tem confirmação do financeiro; o resto é pendente, e o
   * que está lançado sem confirmação aparece à parte.
   */
  const summary = (data?.data || []).reduce((acc, t) => {
    const pago = Number(t.paid_amount) || 0;
    const confirmado = t.confirmado !== false;
    acc.total += Number(t.amount) || 0;
    if (confirmado) acc.paid += pago;
    else acc.semConfirmacao += pago;
    acc.pending += Math.max(0, (Number(t.amount) || 0) - (confirmado ? pago : 0));
    return acc;
  }, { total: 0, paid: 0, pending: 0, semConfirmacao: 0 });

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
            <div>
              <p className="text-xs text-gray-500">Pago (confirmado)</p>
              <p className="font-bold text-green-700">{fmt(summary.paid)}</p>
              {summary.semConfirmacao > 0 && (
                <p className="text-[11px] text-amber-600">
                  + {fmt(summary.semConfirmacao)} aguardando confirmação
                </p>
              )}
            </div>
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
            <MesNavegador mes={mes} onMudar={mudarMes} pendencias={tab === 'receivable' ? pendencias : null} />
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

      <Modal isOpen={!!pixModal} onClose={() => setPixModal(null)} title="Cobrança PIX" size="sm">
        {pixModal && <PixModal transaction={pixModal} onClose={() => setPixModal(null)} />}
      </Modal>

      <Modal isOpen={!!conferir} onClose={() => setConferir(null)} title="Conferir o comprovante" size="md">
        {conferir && <ConferirModal conta={conferir} onClose={() => setConferir(null)}
          onFeito={() => { setConferir(null); qc.invalidateQueries({ queryKey: ['financial'] }); qc.invalidateQueries({ queryKey: ['financial-pendencias'] }); }} />}
      </Modal>

      <Modal isOpen={!!confirmar} onClose={() => setConfirmar(null)} title="Confirmar o pagamento" size="sm">
        {confirmar && <ConfirmarModal conta={confirmar} onClose={() => setConfirmar(null)}
          onFeito={() => { setConfirmar(null); qc.invalidateQueries({ queryKey: ['financial'] }); qc.invalidateQueries({ queryKey: ['financial-pendencias'] }); }} />}
      </Modal>

      <Modal isOpen={!!desfazer} onClose={() => setDesfazer(null)} title="Desfazer o pagamento" size="sm">
        {desfazer && <DesfazerModal conta={desfazer} onClose={() => setDesfazer(null)}
          onFeito={() => { setDesfazer(null); qc.invalidateQueries({ queryKey: ['financial'] }); qc.invalidateQueries({ queryKey: ['financial-pendencias'] }); }} />}
      </Modal>

      <Modal isOpen={!!historico} onClose={() => setHistorico(null)} title="Histórico da conta" size="md">
        {historico && <HistoricoModal conta={historico} />}
      </Modal>

      <Modal isOpen={!!cobranca} onClose={() => setCobranca(null)} title="Cobrança pelo WhatsApp" size="sm">
        {cobranca && <CobrancaModal conta={cobranca} onClose={() => setCobranca(null)} />}
      </Modal>

      {virada && (
        <AvisoDeVirada mes={mes} pendencias={pendencias}
          onFicar={() => setVirada(null)}
          onSeguir={() => { const d = virada.destino; setVirada(null); setMes(d); setPage(1); }} />
      )}

      <Modal isOpen={!!newModal} onClose={() => setNewModal(null)}
        title={newModal === 'receivable' ? 'Nova Conta a Receber' : 'Nova Conta a Pagar'} size="md">
        {newModal && <NewTransactionModal type={newModal} onClose={() => setNewModal(null)}
          onSaved={() => { setNewModal(null); qc.invalidateQueries(['financial']); }} />}
      </Modal>
    </div>
  );
}
