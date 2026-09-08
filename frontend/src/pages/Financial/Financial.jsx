import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, TrendingUp, TrendingDown, Check, Plus, Loader2, FileBarChart2,
  ArrowDownCircle, ArrowUpCircle, ChevronLeft, ChevronRight, MessageCircle,
  FileCheck2, ShieldCheck, AlertTriangle, ExternalLink, Copy,
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
  const falta = Math.max(0, (Number(conta.amount) || 0) - (Number(conta.paid_amount) || 0));
  const [valor, setValor] = useState(String(conta.receipt_amount ?? falta ?? ''));
  const [enviando, setEnviando] = useState(false);
  const semComprovante = !conta.receipt_url;
  const excedente = Math.max(0, (Number(String(valor).replace(',', '.')) || 0) - falta);

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
      toast.success(`Pagamento confirmado por ${r.confirmado_por}${extra.length ? ` — ${extra.join(', ')}` : ''}`,
        { duration: 8000 });
      onFeito();
    } catch (e) {
      toast.error([e.error, e.dica].filter(Boolean).join(' '));
    } finally { setEnviando(false); }
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-gray-200 p-3 text-[13px] space-y-1">
        <p className="font-semibold text-gray-800">{conta.description}</p>
        <p className="text-gray-500">Em aberto nesta conta: <b className="text-gray-800">{fmt(falta)}</b></p>
        {conta.receipt_by && (
          <p className="text-gray-500">Comprovante anexado por {conta.receipt_by} · conferido por {conta.receipt_by}</p>
        )}
      </div>

      <label className="block">
        <span className="label">Quanto entrou</span>
        <input className="input w-44" type="number" step="0.01" min={0}
          value={valor} onChange={e => setValor(e.target.value)} />
      </label>

      {excedente > 0 && (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800">
          <b>{fmt(excedente)}</b> a mais do que esta conta — o excedente abate as parcelas seguintes
          do mesmo pedido, na ordem. O que sobrar depois de cobrir tudo fica como crédito do cliente.
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
        <button className="btn-primary" onClick={confirmar} disabled={enviando || !(Number(String(valor).replace(',', '.')) > 0)}>
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

  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-600">
        Cobrança de <b>{fmt(dados.valor)}</b> para <b>{dados.cliente || 'o cliente'}</b>
        {dados.telefone ? <> · {dados.telefone}</> : <> · <span className="text-amber-700">sem telefone cadastrado</span></>}
      </p>

      {dados.qr_base64 && (
        <img src={`data:image/png;base64,${dados.qr_base64}`} alt="QR Code do Pix"
          className="mx-auto rounded-xl border border-gray-200" style={{ width: 220, height: 220 }} />
      )}

      <div>
        <span className="label">Pix copia e cola</span>
        <div className="flex gap-2">
          <input className="input font-mono text-[11px]" readOnly value={dados.copia_e_cola || ''} />
          <button className="btn-secondary btn-sm shrink-0" title="Copiar"
            onClick={() => { navigator.clipboard?.writeText(dados.copia_e_cola || ''); toast.success('Copiado'); }}>
            <Copy size={14} />
          </button>
        </div>
      </div>

      <div>
        <span className="label">Mensagem</span>
        <textarea className="input text-[12.5px]" rows={5} readOnly value={dados.mensagem} />
      </div>

      {dados.envio?.enviado ? (
        <p className="text-[12.5px] rounded-xl px-3 py-2 bg-emerald-50 border border-emerald-200 text-emerald-800">
          Enviado pelo WhatsApp automaticamente.
        </p>
      ) : (
        <>
          <p className="text-[12.5px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">
            Envio automático indisponível ({dados.envio?.motivo}). Abra a conversa — a mensagem já vai escrita.
          </p>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary" onClick={onClose}>Fechar</button>
            <button className="btn-primary" disabled={!dados.wa_link}
              onClick={() => window.open(dados.wa_link, '_blank', 'noopener')}>
              <MessageCircle size={14} /> Abrir no WhatsApp
            </button>
          </div>
        </>
      )}
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
      key: 'receipt_status', label: 'Comprovante', width: 150,
      // O ESTADO DO PAPEL, EM UMA COLUNA. Antes não havia nenhuma: o
      // financeiro não tinha como saber, olhando a lista, o que já tinha
      // comprovante esperando por ele.
      render: (v, row) => {
        if (!row.receipt_url) {
          return row.paid_at
            ? <span className="badge badge-gray" title={`Confirmado por ${row.paid_by || '—'}`}>sem comprovante</span>
            : <span className="text-gray-300">—</span>;
        }
        if (row.paid_at) {
          return <span className="badge badge-green" title={`Confirmado por ${row.paid_by} em ${row.paid_at?.slice(0, 10)}`}>
            confirmado
          </span>;
        }
        if (v === 'conferido') return <span className="badge badge-blue">conferido · a confirmar</span>;
        if (v === 'divergente') return <span className="badge badge-red">divergente</span>;
        if (v === 'recusado') return <span className="badge badge-gray">recusado</span>;
        return <span className="badge badge-yellow">a conferir</span>;
      },
    }] : []),
    { key: 'installment', label: 'Parcela', width: 80,
      render: (v, row) => row.total_installments > 1 ? <span className="badge badge-gray">{v}/{row.total_installments}</span> : '—' },
    { key: 'amount', label: 'Total', width: 110, render: v => fmt(v) },
    { key: 'paid_amount', label: 'Pago', width: 110, render: v => <span className="text-green-600">{fmt(v)}</span> },
    { key: 'status', label: 'Status', width: 100,
      render: v => <span className={`badge ${statusClass[v] || 'badge-gray'}`}>{statusLabel[v] || v}</span> },
    { key: 'id', label: '', width: 210,
      render: (_, row) => {
        if (row.status === 'cancelled') return null;
        const temComprovante = !!row.receipt_url;
        const conferido = row.receipt_status === 'conferido';
        const confirmado = !!row.paid_at || row.status === 'paid';
        return (
          <div className="flex gap-1 justify-end flex-wrap">
            {/* A ORDEM DOS BOTÕES É A ORDEM DO TRABALHO: conferir o
                papel, depois confirmar o dinheiro. */}
            {tab === 'receivable' && temComprovante && !confirmado && !conferido && (
              <button onClick={() => setConferir(row)} className="btn-secondary btn-sm" title="Conferir o comprovante">
                <FileCheck2 size={12} /> Conferir
              </button>
            )}
            {tab === 'receivable' && !confirmado && (conferido || !temComprovante) && (
              <button onClick={() => setConfirmar(row)} className="btn-primary btn-sm">
                <Check size={12} /> Confirmar
              </button>
            )}
            {tab === 'payable' && row.status !== 'paid' && (
              <button onClick={() => setPayModal(row)} className="btn-primary btn-sm">
                <Check size={12} /> Pagar
              </button>
            )}
            {tab === 'receivable' && !confirmado && (
              <button onClick={() => setPixModal(row)} className="btn-secondary btn-sm" title="Gerar cobrança PIX">PIX</button>
            )}
          </div>
        );
      } },
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
