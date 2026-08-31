import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import {
  ArrowLeft, Phone, Mail, MapPin, Edit2, Instagram, Cake, Hash, IdCard,
  CalendarPlus, RefreshCw, History, User, ShieldCheck, Loader2, AlertTriangle,
  CheckCircle2, Star, Shield, Building2, UserCircle2, CalendarDays, Wallet,
  TrendingUp, Sparkles, Paperclip, FileText, Trash2,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useState } from 'react';
import Modal from '@/components/UI/Modal';
import CustomerForm from './CustomerForm';
import { id4 } from '@/lib/ids';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}
function fmtDateBR(iso) { try { return format(parseISO(iso), 'dd/MM/yyyy', { locale: ptBR }); } catch { return iso; } }
function fmtDateTimeBR(iso) { try { return format(parseISO(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }); } catch { return iso; } }
function idadeAnos(iso) {
  try {
    const b = parseISO(iso); const t = new Date();
    let a = t.getFullYear() - b.getFullYear();
    const m = t.getMonth() - b.getMonth();
    if (m < 0 || (m === 0 && t.getDate() < b.getDate())) a--;
    return a;
  } catch { return null; }
}

// O ROTULO DO STATUS VEM DO SERVIDOR (status_label).
//
// Aqui havia um mapa proprio com os SEIS status do fluxo antigo. O
// pedido tem quinze fases desde entao, e nenhuma delas estava neste
// mapa: o historico do cliente mostrava "aguardando_revelacao" cru,
// nome de coluna do banco na tela de quem atende.
//
// Estes dois mapas ficam so como rede para venda antiga, que ainda tem
// esses status gravados.
const LEGADO_LABEL = {
  open: 'Aberto', confirmed: 'Confirmado', in_production: 'Em Produção',
  ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};
const CLASSE_POR_COR = {
  verde: 'badge-green', vermelho: 'badge-red', amarelo: 'badge-yellow',
  azul: 'badge-blue', roxo: 'badge-purple', rosa: 'badge-purple',
  ciano: 'badge-blue', laranja: 'badge-yellow', cinza: 'badge-gray',
};
const rotuloVenda = v => v.status_label || LEGADO_LABEL[v.status] || v.status || '—';
const classeVenda = v => CLASSE_POR_COR[v.status_cor]
  || (v.status === 'cancelled' ? 'badge-red' : 'badge-gray');
const finStatusLabel = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido' };
const finStatusClass = { pending: 'badge-yellow', partial: 'badge-blue', paid: 'badge-green', overdue: 'badge-red' };

// ⭐ 0 a 5 estrelas
function Stars({ n, size = 22 }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size}
          className={i <= n ? 'text-amber-400 fill-amber-400' : 'text-gray-300'} />
      ))}
    </div>
  );
}

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tab, setTab] = useState('sales');
  const [editOpen, setEditOpen] = useState(false);
  const [creditOpen, setCreditOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['customer-history', id],
    queryFn: () => api.get(`/customers/${id}/history`),
    enabled: !!id,
  });

  // Programa Lyon Prime: estrelas, progresso, selo, benefícios e histórico
  const { data: prime } = useQuery({
    queryKey: ['customer-prime', id],
    queryFn: () => api.get(`/customers/${id}/prime`),
    enabled: !!id,
  });

  // Consultas de crédito (SPC/Serasa) — a última alimenta o Status Financeiro
  const { data: creditHist } = useQuery({
    queryKey: ['credit-checks', id],
    queryFn: () => api.get(`/customers/${id}/credit-checks`),
    enabled: !!id,
  });
  const creditMut = useMutation({
    mutationFn: () => api.post(`/customers/${id}/credit-check`),
    onSuccess: () => { qc.invalidateQueries(['credit-checks', id]); toast.success('Consulta realizada!'); },
    onError: e => toast.error(e.error || 'Não foi possível consultar'),
  });
  const lastCredit = (creditHist?.data || [])[0];

  // Documentos do cliente — os aprovados na fila de Aprovações de Cadastro
  // caem aqui, junto com os que a equipe anexa manualmente.
  const { data: docs = [] } = useQuery({
    queryKey: ['customer-attachments', id],
    queryFn: () => api.get(`/customers/${id}/attachments`),
    enabled: !!id,
  });
  const [upLoading, setUpLoading] = useState(false);

  async function subirDoc(file) {
    if (!file) return;
    setUpLoading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/customers/${id}/attachments`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      qc.invalidateQueries(['customer-attachments', id]);
      toast.success('Documento anexado!');
    } catch (e) { toast.error(e.error || 'Erro ao anexar'); }
    finally { setUpLoading(false); }
  }

  async function removerDoc(docId) {
    try {
      await api.delete(`/customers/${id}/attachments/${docId}`);
      qc.invalidateQueries(['customer-attachments', id]);
      toast.success('Documento removido');
    } catch (e) { toast.error(e.error || 'Erro ao remover'); }
  }

  if (isLoading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );

  if (!data?.customer) return (
    <div className="text-center py-16 text-gray-400">
      <p>Cliente não encontrado</p>
      <button onClick={() => navigate('/customers')} className="btn-secondary mt-4">Voltar</button>
    </div>
  );

  const { customer, sales, receivables, summary } = data;
  const ultimaCompra = (sales || []).find(s => s.status !== 'cancelled');
  const stars = prime?.stars ?? (Number(customer.rating) || 0);
  const fin = prime?.financeiro;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* ══ Cabeçalho: empresa + vendedor + contato ══ */}
      <div className="card p-5">
        <div className="flex flex-wrap items-start gap-4">
          <button onClick={() => navigate('/customers')} className="btn-ghost p-2 mt-1">
            <ArrowLeft size={18} />
          </button>
          {customer.avatar_url
            ? <img src={customer.avatar_url} alt="" className="w-14 h-14 rounded-2xl object-cover ring-2 ring-amber-200" />
            : <span className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center">
                {customer.type === 'PJ' ? <Building2 size={26} className="text-indigo-500" /> : <User size={26} className="text-indigo-500" />}
              </span>}

          <div className="min-w-[220px] flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-black text-gray-900">{customer.name}</h1>
              {customer.is_active !== false && !customer.blocked
                ? <span className="badge badge-green text-[11px]">ATIVO</span>
                : <span className="badge badge-red text-[11px]">{customer.blocked ? 'BLOQUEADO' : 'INATIVO'}</span>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">
              {customer.type === 'PJ' ? 'CNPJ' : 'CPF'}: {customer.cpf_cnpj || 'não informado'}
              {customer.nome_fantasia ? <> · {customer.nome_fantasia}</> : null}
            </p>
            {customer.address?.street && (
              <p className="text-sm text-gray-600 mt-0.5 flex items-center gap-1">
                <MapPin size={12} className="text-gray-400" /> {customer.address.street}{customer.address.number ? `, ${customer.address.number}` : ''}
              </p>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-gray-500">
              <span className="flex items-center gap-1"><Hash size={12} /> {id4(customer.display_id)}</span>
              {customer.address?.city && <span className="flex items-center gap-1"><MapPin size={12} /> {customer.address.city}{customer.address.state ? ` - ${customer.address.state}` : ''}</span>}
              {customer.created_at && <span className="flex items-center gap-1"><CalendarPlus size={12} /> Cliente desde {fmtDateBR(customer.created_at)}</span>}
            </div>
          </div>

          <div className="min-w-[180px] space-y-1.5 text-sm">
            <p className="flex items-center gap-2 text-gray-600">
              <UserCircle2 size={15} className="text-indigo-400" />
              <span className="text-gray-400 text-xs">Vendedor:</span> <b>{customer.vendedor || '—'}</b>
            </p>
            <p className="flex items-center gap-2 text-gray-600">
              <CalendarDays size={15} className="text-indigo-400" />
              <span className="text-gray-400 text-xs">Última compra:</span>
              <b>{ultimaCompra ? fmtDateBR(ultimaCompra.created_at) : '—'}</b>
            </p>
            <p className="flex items-center gap-2 text-gray-600">
              <TrendingUp size={15} className="text-emerald-500" />
              <span className="text-gray-400 text-xs">Faturamento (12m):</span>
              <b className="text-emerald-600">{fmt(prime?.total_12m ?? customer.total_12m)}</b>
            </p>
          </div>

          <div className="min-w-[170px] space-y-1.5 text-sm text-gray-600">
            {customer.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {customer.phone}</p>}
            {customer.email && <p className="flex items-center gap-2 break-all"><Mail size={14} className="text-gray-400" /> {customer.email}</p>}
            {customer.instagram && (
              <a href={`https://instagram.com/${String(customer.instagram).replace(/^@/, '')}`} target="_blank" rel="noreferrer"
                className="flex items-center gap-2 text-pink-600 hover:text-pink-700 font-medium w-fit">
                <Instagram size={14} /> @{String(customer.instagram).replace(/^@/, '')}
              </a>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button onClick={() => setEditOpen(true)} className="btn-primary">
              <Edit2 size={15} /> Editar Cadastro
            </button>
            <button onClick={() => setCreditOpen(true)} className="btn-secondary">
              <ShieldCheck size={15} /> Consultar SPC / Serasa
            </button>
          </div>
        </div>
      </div>

      {/* ══ Painéis: Lyon Prime · Resumo · Status financeiro ══ */}
      <div className="grid lg:grid-cols-3 gap-5">
        {/* ── Programa Lyon Prime ── */}
        <div className="card overflow-hidden">
          <div className="bg-[#0A1A3C] text-white px-5 py-3 flex items-center justify-between">
            <p className="font-bold tracking-wide text-sm flex items-center gap-2">
              <Sparkles size={15} className="text-amber-400" /> PROGRAMA LYON PRIME
            </p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Stars n={stars} size={26} />
                <p className="text-sm mt-1 text-gray-600">Nível atual: <b className="text-indigo-700">{stars ? `${stars} ESTRELA${stars > 1 ? 'S' : ''}` : 'SEM NÍVEL'}</b></p>
              </div>
              <div className="text-center">
                <span className={`w-11 h-11 rounded-full flex items-center justify-center mx-auto ${prime?.selo?.earned ? 'bg-amber-100' : 'bg-gray-100'}`}>
                  <Shield size={22} className={prime?.selo?.earned ? 'text-amber-500 fill-amber-200' : 'text-gray-300'} />
                </span>
                <p className="text-xs font-bold mt-1.5 text-gray-500">Selo de Confiança</p>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${prime?.selo?.earned ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                  {prime?.selo?.earned ? 'CONQUISTADO' : 'NÃO CONQUISTADO'}
                </span>
              </div>
            </div>

            {/* progresso para a próxima estrela */}
            {prime?.next ? (
              <div>
                <div className="flex justify-between text-sm text-gray-500 mb-1.5">
                  <span>Progresso para {prime.next.stars} estrela{prime.next.stars > 1 ? 's' : ''}</span>
                  <span>{Math.round((prime.progress || 0) * 100)}%</span>
                </div>
                <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-amber-400 to-amber-500 rounded-full transition-all"
                    style={{ width: `${Math.round((prime.progress || 0) * 100)}%` }} />
                </div>
                <p className="text-sm text-gray-600 mt-2 text-center">
                  Faltam <b className="text-indigo-700">{fmt(prime.next.faltam)}</b> para conquistar a próxima estrela
                </p>
              </div>
            ) : prime ? (
              <p className="text-xs text-center font-semibold text-amber-600 bg-amber-50 rounded-lg py-2">🏆 Nível máximo do programa!</p>
            ) : null}

            {/* benefícios */}
            {prime && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="border border-gray-100 rounded-xl p-3.5 space-y-2">
                  <p className="font-bold text-gray-700">Benefícios atuais</p>
                  {prime.tier ? (
                    <>
                      <p className="flex items-start gap-2 text-gray-600">
                        <Wallet size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                        <span>Limite sugerido: <b className="whitespace-nowrap">{fmt(prime.tier.credit)}</b></span>
                      </p>
                      {prime.tier.perks.map((p, i) => (
                        <p key={i} className="flex items-start gap-2 text-gray-600">
                          <CheckCircle2 size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </p>
                      ))}
                    </>
                  ) : <p className="text-gray-400">Sem nível ainda — primeira compra libera</p>}
                </div>
                <div className="border border-indigo-100 bg-indigo-50/40 rounded-xl p-3.5 space-y-2">
                  {/* O nível vinha como texto "(1⭐)": o emoji desalinha da
                      linha e, em fonte pequena, sai como um quadradinho.
                      Vira um selo com ícone vetorial, que acompanha o
                      tamanho e o peso da fonte ao redor. */}
                  <p className="font-bold text-indigo-700 flex items-center gap-2 flex-wrap">
                    Próximo nível
                    {prime.next && (
                      <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold leading-none"
                        style={{ background: 'rgba(245,158,11,0.18)', color: '#fbbf24' }}>
                        {prime.next.stars}
                        <Star size={11} className="fill-current" />
                      </span>
                    )}
                  </p>
                  {prime.next ? (
                    <>
                      {/* items-start + shrink-0: quando o texto quebra em
                          duas linhas o ícone fica na primeira, e não
                          flutuando no meio do parágrafo. */}
                      <p className="flex items-start gap-2 text-gray-600">
                        <Wallet size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                        <span>Limite sugerido: <b className="whitespace-nowrap">{fmt(prime.next.credit)}</b></span>
                      </p>
                      {prime.next.perks.map((p, i) => (
                        <p key={i} className="flex items-start gap-2 text-gray-600">
                          <Star size={14} className="text-indigo-400 shrink-0 mt-0.5" />
                          <span>{p}</span>
                        </p>
                      ))}
                    </>
                  ) : <p className="text-gray-400">Você já desbloqueou tudo 🎉</p>}
                </div>
              </div>
            )}

            {/* critérios do selo */}
            {prime?.selo && !prime.selo.earned && (
              <div className="border border-amber-100 bg-amber-50/50 rounded-xl p-3.5 space-y-1.5">
                <p className="text-sm font-bold text-amber-700">Para conquistar o Selo de Confiança:</p>
                {prime.selo.criteria.map((c, i) => (
                  <p key={i} className={`text-[13px] flex items-center gap-2 ${c.ok ? 'text-emerald-600' : 'text-gray-500'}`}>
                    {c.ok ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} className="text-amber-500" />}
                    {c.label} <span className="text-gray-400">({c.atual})</span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Resumo do cliente ── */}
        <div className="card p-5">
          <p className="font-bold text-gray-800 text-sm tracking-wide mb-4">RESUMO DO CLIENTE</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400">Compras (12 meses)</p>
              <p className="text-lg font-black text-emerald-600">{fmt(prime?.total_12m ?? customer.total_12m)}</p>
            </div>
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400">Pedidos (12 meses)</p>
              <p className="text-lg font-black text-gray-900">{prime?.pedidos_12m ?? summary.sales_count}</p>
            </div>
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400">Ticket médio</p>
              <p className="text-lg font-black text-violet-600">{fmt(prime?.ticket_medio)}</p>
            </div>
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-xs text-gray-400">Total histórico</p>
              <p className="text-lg font-black text-gray-900">{fmt(summary.total_sales)}</p>
            </div>
            <div className="border border-gray-100 rounded-xl p-3 col-span-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Limite de crédito</p>
                  <p className="text-lg font-black text-gray-900">{fmt(customer.credit_limit)}</p>
                  <p className="text-[11px] text-gray-400">Utilizado: {fmt(summary.open_receivables)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-400">Prazo de boleto</p>
                  <p className="text-lg font-black text-gray-900">{prime?.boleto_days ?? customer.boleto_days ?? 0} dias</p>
                  {prime?.next && <p className="text-[11px] text-gray-400">Próximo nível: {prime.next.boleto} dias</p>}
                </div>
              </div>
            </div>
          </div>
          <button onClick={() => setCreditOpen(true)} className="w-full mt-4 bg-[#0A1A3C] hover:bg-[#122b5e] text-white rounded-xl py-2.5 text-sm font-bold flex items-center justify-center gap-2 transition-colors">
            <ShieldCheck size={15} /> Consultar SPC / Serasa
          </button>
        </div>

        {/* ── Status financeiro ── */}
        <div className="card p-5 space-y-3">
          <p className="font-bold text-gray-800 text-sm tracking-wide">STATUS FINANCEIRO</p>
          <div className="flex items-center gap-3">
            <span className={`w-11 h-11 rounded-full flex items-center justify-center ${fin?.situacao === 'Regular' ? 'bg-emerald-100' : 'bg-red-100'}`}>
              {fin?.situacao === 'Regular'
                ? <CheckCircle2 size={22} className="text-emerald-500" />
                : <AlertTriangle size={22} className="text-red-500" />}
            </span>
            <div>
              <p className="text-xs text-gray-400">Situação atual</p>
              <p className={`font-black ${fin?.situacao === 'Regular' ? 'text-emerald-600' : 'text-red-600'}`}>{fin?.situacao || '—'}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-[11px] text-gray-400">Última consulta SPC/Serasa</p>
              <p className="font-bold text-gray-900 text-sm">{lastCredit ? fmtDateBR(lastCredit.created_at) : 'Nunca'}</p>
            </div>
            <div className="border border-gray-100 rounded-xl p-3">
              <p className="text-[11px] text-gray-400">Score de crédito</p>
              <p className={`font-black text-sm ${lastCredit?.score >= 700 ? 'text-emerald-600' : lastCredit?.score >= 400 ? 'text-amber-600' : lastCredit?.score != null ? 'text-red-600' : 'text-gray-400'}`}>
                {lastCredit?.score ?? '—'}
              </p>
            </div>
          </div>
          <div className="border border-gray-100 rounded-xl p-3">
            <p className="text-[11px] text-gray-400">Pendências financeiras</p>
            {fin?.vencido > 0
              ? <p className="font-bold text-red-600 text-sm">{fmt(fin.vencido)} vencido ({fin.vencidos_count} título{fin.vencidos_count > 1 ? 's' : ''})</p>
              : <p className="font-bold text-emerald-600 text-sm">Nenhuma pendência</p>}
            {fin?.em_aberto > 0 && <p className="text-[11px] text-gray-400 mt-0.5">Em aberto (a vencer): {fmt(Math.max(0, fin.em_aberto - fin.vencido))}</p>}
          </div>
          <div className="border border-gray-100 rounded-xl p-3">
            <p className="text-[11px] text-gray-400">Histórico de pagamentos</p>
            <p className={`font-bold text-sm ${fin?.pagamentos === 'Excelente' ? 'text-emerald-600' : fin?.pagamentos === 'Atenção' ? 'text-amber-600' : fin?.pagamentos === 'Ruim' ? 'text-red-600' : 'text-gray-500'}`}>
              {fin?.pagamentos || '—'}
            </p>
            <p className="text-[11px] text-gray-400">{fin?.pagos_count || 0} título(s) pago(s)</p>
          </div>
          {lastCredit && (lastCredit.negativado
            ? <p className="text-xs font-semibold text-red-600 flex items-center gap-1.5"><AlertTriangle size={13} /> Negativado na última consulta{lastCredit.total_restricoes ? ` — ${fmt(lastCredit.total_restricoes)}` : ''}</p>
            : <p className="text-xs font-semibold text-emerald-600 flex items-center gap-1.5"><CheckCircle2 size={13} /> Sem restrições na última consulta</p>)}
        </div>
      </div>

      {/* ══ Abas de histórico ══ */}
      <div className="card">
        <div className="card-header flex gap-5 overflow-x-auto">
          {[
            ['sales', `Histórico de Compras (${sales.length})`],
            ['fin', `Histórico Financeiro (${(receivables || []).length})`],
            ['prime', `Evolução Lyon Prime (${(prime?.historico || []).length})`],
            ['docs', `Documentos (${docs.length})`],
            ['cadastro', 'Cadastro'],
          ].map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`pb-2 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${tab === k ? 'border-primary-600 text-primary-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>

        {/* Compras */}
        {tab === 'sales' && (
          <div className="overflow-x-auto">
            <table className="table-auto">
              <thead>
                <tr><th>#</th><th>Data</th><th>Status</th><th>Entrega</th><th>Pgto.</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/sales/${s.id}`)}>
                    <td className="font-mono font-semibold">#{String(s.number).padStart(4, '0')}</td>
                    <td>{s.created_at ? fmtDateBR(s.created_at) : '—'}</td>
                    <td><span className={`badge text-xs ${classeVenda(s)}`}>{rotuloVenda(s)}</span></td>
                    <td className="text-sm text-gray-500">{s.delivery_date ? fmtDateBR(s.delivery_date) : '—'}</td>
                    <td className="text-sm text-gray-500">{s.payment_method || '—'}</td>
                    <td className="text-right font-semibold">{fmt(s.total)}</td>
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">Nenhum pedido encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Financeiro */}
        {tab === 'fin' && (
          <div className="overflow-x-auto">
            <table className="table-auto">
              <thead>
                <tr><th>Descrição</th><th>Vencimento</th><th>Pagamento</th><th>Status</th><th className="text-right">Valor</th></tr>
              </thead>
              <tbody>
                {(receivables || []).map(l => (
                  <tr key={l.id}>
                    <td className="text-sm">{l.description || '—'}</td>
                    <td className="text-sm text-gray-500">{l.due_date ? fmtDateBR(l.due_date) : '—'}</td>
                    <td className="text-sm text-gray-500">{l.paid_date ? fmtDateBR(l.paid_date) : '—'}</td>
                    <td><span className={`badge text-xs ${finStatusClass[l.status] || 'badge-gray'}`}>{finStatusLabel[l.status] || l.status}</span></td>
                    <td className="text-right font-semibold">{fmt(l.amount)}{l.paid_amount > 0 && l.status !== 'paid' && <span className="block text-[11px] text-gray-400 font-normal">pago {fmt(l.paid_amount)}</span>}</td>
                  </tr>
                ))}
                {(receivables || []).length === 0 && <tr><td colSpan={5} className="text-center py-6 text-gray-400">Nenhum lançamento financeiro</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {/* Evolução Lyon Prime (estrelas + selo) */}
        {tab === 'prime' && (
          <div className="p-5">
            {(prime?.historico || []).length === 0 ? (
              <p className="text-center text-gray-400 py-6 text-sm">
                Nenhuma evolução registrada ainda — as mudanças de estrelas e do Selo de Confiança aparecem aqui.
              </p>
            ) : (
              <ol className="space-y-3">
                {prime.historico.map(h => (
                  <li key={h.id} className="flex gap-3 text-sm">
                    <span className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${h.event === 'selo' ? 'bg-amber-100' : 'bg-indigo-50'}`}>
                      {h.event === 'selo' ? <Shield size={15} className="text-amber-500" /> : <Star size={15} className="text-indigo-500" />}
                    </span>
                    <div>
                      <p className="font-medium text-gray-800">
                        {h.event === 'stars'
                          ? <>{h.stars_from || 0} → <b>{h.stars_to || 0} estrela{(h.stars_to || 0) !== 1 ? 's' : ''}</b></>
                          : <>Selo de Confiança <b className={h.selo ? 'text-emerald-600' : 'text-red-600'}>{h.selo ? 'conquistado' : 'perdido'}</b></>}
                      </p>
                      <p className="text-xs text-gray-400">
                        {fmtDateTimeBR(h.created_at)}
                        {h.total_12m != null && <> · faturamento 12m: {fmt(h.total_12m)}</>}
                        {h.note && <> · {h.note}</>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}

        {/* Documentos — anexos do cliente (inclui os aprovados na fila) */}
        {tab === 'docs' && (
          <div className="p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500">
                Contratos, comprovantes e documentos do cliente. Os enviados pelo link público aparecem aqui depois de aprovados.
              </p>
              <label className="shrink-0 btn-secondary cursor-pointer">
                {upLoading ? <Loader2 size={15} className="animate-spin" /> : <Paperclip size={15} />} Anexar
                <input type="file" className="hidden" disabled={upLoading}
                  accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                  onChange={e => { subirDoc(e.target.files?.[0]); e.target.value = ''; }} />
              </label>
            </div>
            {docs.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">Nenhum documento anexado.</p>
            ) : (
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl">
                {docs.map(d => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText size={16} className="text-gray-400 shrink-0" />
                    <a href={d.url} target="_blank" rel="noreferrer"
                      className="text-sm text-primary-600 hover:underline truncate flex-1">{d.name}</a>
                    <span className="text-xs text-gray-400 shrink-0 hidden sm:block">
                      {d.kind ? `${d.kind} · ` : ''}{d.uploaded_at ? fmtDateBR(d.uploaded_at) : ''}
                      {d.uploaded_by?.name ? ` · ${d.uploaded_by.name}` : ''}
                    </span>
                    <button onClick={() => removerDoc(d.id)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600 shrink-0" title="Remover">
                      <Trash2 size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Cadastro (informações + histórico de alterações) */}
        {tab === 'cadastro' && (
          <div className="p-5 grid md:grid-cols-2 gap-6">
            <div className="space-y-1.5 text-sm text-gray-600">
              <p className="font-semibold text-gray-800 mb-1">Cadastro completo</p>

              {/* Identificação */}
              <p className="flex items-center gap-2">
                {customer.type === 'PJ' ? <Building2 size={14} className="text-gray-400" /> : <User size={14} className="text-gray-400" />}
                Tipo: <b>{customer.type === 'PJ' ? 'Pessoa Jurídica' : 'Pessoa Física'}</b>
              </p>
              <p className="flex items-center gap-2"><Hash size={14} className="text-gray-400" /> Código: <b>{id4(customer.display_id)}</b></p>
              <p className="flex items-center gap-2"><IdCard size={14} className="text-gray-400" /> {customer.type === 'PJ' ? 'CNPJ' : 'CPF'}: <b>{customer.cpf_cnpj || '—'}</b></p>
              {customer.rg_ie && <p className="flex items-center gap-2"><IdCard size={14} className="text-gray-400" /> {customer.type === 'PJ' ? 'IE' : 'RG'}: {customer.rg_ie}</p>}
              {customer.nome_fantasia && <p className="flex items-center gap-2"><Building2 size={14} className="text-gray-400" /> Nome fantasia: {customer.nome_fantasia}</p>}
              {customer.birth_date && (
                <p className="flex items-center gap-2"><Cake size={14} className="text-pink-400" /> Nascimento: <b>{fmtDateBR(customer.birth_date)}</b>
                  {idadeAnos(customer.birth_date) != null && <span className="text-xs text-gray-400">({idadeAnos(customer.birth_date)} anos)</span>}</p>
              )}

              {/* Contato */}
              <div className="pt-2 mt-1 border-t border-gray-100 space-y-1.5">
                {customer.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {customer.phone}</p>}
                {customer.mobile && <p className="flex items-center gap-2"><Phone size={14} className="text-gray-400" /> {customer.mobile} <span className="text-xs text-gray-400">(recado)</span></p>}
                {customer.email && <p className="flex items-center gap-2 break-all"><Mail size={14} className="text-gray-400" /> {customer.email}</p>}
                {customer.instagram && <p className="flex items-center gap-2"><Instagram size={14} className="text-gray-400" /> @{String(customer.instagram).replace(/^@/, '')}</p>}
                <p className="flex items-center gap-2"><User size={14} className="text-gray-400" /> Vendedor: <b>{customer.vendedor || '—'}</b></p>
                <p className="flex items-center gap-2"><Wallet size={14} className="text-gray-400" /> Limite de crédito: <b>{fmt(customer.credit_limit)}</b></p>
              </div>

              {/* Endereço */}
              {customer.address && (customer.address.street || customer.address.zip) && (
                <div className="flex gap-2 pt-2 mt-1 border-t border-gray-100">
                  <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="leading-relaxed">
                    {customer.address.street && <p>{customer.address.street}{customer.address.number ? `, ${customer.address.number}` : ''}</p>}
                    {/* O complemento vinha colado no fim da rua, atrás de um
                        travessão. Estava lá, mas quem procurava "Complemento"
                        não achava — é o único campo do bloco sem rótulo, e
                        "CASA" no fim de um endereço passa por parte da rua.
                        Linha própria, como o bairro. */}
                    {customer.address.complement && <p>Complemento: {customer.address.complement}</p>}
                    {customer.address.neighborhood && <p>Bairro: {customer.address.neighborhood}</p>}
                    {(customer.address.city || customer.address.state) && <p>{customer.address.city}{customer.address.state ? `/${customer.address.state}` : ''}</p>}
                    {customer.address.zip && <p className="text-gray-400 text-xs">CEP {customer.address.zip}</p>}
                  </div>
                </div>
              )}

              {customer.notes && <p className="pt-2 mt-1 border-t border-gray-100 text-gray-500 whitespace-pre-wrap"><b className="text-gray-700">Obs.:</b> {customer.notes}</p>}
              {customer.created_at && <p className="text-xs text-gray-400 flex items-center gap-1.5 pt-2"><CalendarPlus size={12} /> Cadastro criado em {fmtDateTimeBR(customer.created_at)}</p>}
              {customer.updated_at && customer.created_at && (new Date(customer.updated_at) - new Date(customer.created_at) > 60000) && (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5"><RefreshCw size={12} /> Atualizado em {fmtDateTimeBR(customer.updated_at)}</p>
              )}
            </div>

            <div>
              <p className="font-semibold text-gray-800 mb-2 flex items-center gap-2 text-sm"><History size={15} className="text-orange-500" /> Histórico de alterações</p>
              {Array.isArray(customer.profile_history) && customer.profile_history.length > 0 ? (
                <ol className="space-y-3">
                  {[...customer.profile_history].reverse().map((h, i) => (
                    <li key={i} className="flex gap-2.5 text-sm">
                      <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
                      <div>
                        <p className="text-xs text-gray-400">{fmtDateTimeBR(h.at)} · {h.source === 'site' ? 'pelo site' : 'no sistema'}</p>
                        <ul className="text-gray-700">
                          {(h.changes || []).map((ch, j) => (
                            <li key={j}><b>{ch.label}</b>{ch.from ? <> : <span className="text-gray-400 line-through">{ch.from}</span> → {ch.to}</> : ch.to ? <> {ch.to}</> : ''}</li>
                          ))}
                        </ul>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : <p className="text-sm text-gray-400">Sem alterações registradas.</p>}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar Cliente" size="lg">
        <CustomerForm
          customer={customer}
          onSaved={() => { setEditOpen(false); qc.invalidateQueries(['customer-history', id]); qc.invalidateQueries(['customer-prime', id]); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Consulta SPC / Serasa */}
      <Modal isOpen={creditOpen} onClose={() => setCreditOpen(false)} title="Consulta SPC / Serasa" size="md">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-gray-600">
              <p><b>{customer.name}</b></p>
              <p className="text-xs text-gray-400">{customer.cpf_cnpj || 'Sem CPF/CNPJ'}</p>
            </div>
            <button onClick={() => creditMut.mutate()} disabled={creditMut.isPending || !customer.cpf_cnpj} className="btn-primary disabled:opacity-50">
              {creditMut.isPending ? <><Loader2 size={15} className="animate-spin" /> Consultando...</> : <><ShieldCheck size={15} /> Consultar agora</>}
            </button>
          </div>

          {lastCredit ? (
            <div className="border border-gray-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs text-gray-400">Score</p>
                  <p className="text-2xl font-bold text-gray-900">{lastCredit.score ?? '—'}
                    {lastCredit.score_faixa && <span className="text-sm font-medium text-gray-500 ml-2">{lastCredit.score_faixa}</span>}</p>
                </div>
                {lastCredit.negativado == null ? null : lastCredit.negativado ? (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5">
                    <AlertTriangle size={15} /> Negativado{lastCredit.total_restricoes ? ` — ${fmt(lastCredit.total_restricoes)}` : ''}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-1.5">
                    <CheckCircle2 size={15} /> Sem restrições
                  </span>
                )}
              </div>
              {Array.isArray(lastCredit.restricoes) && lastCredit.restricoes.length > 0 && (
                <div className="text-xs text-gray-600 border-t border-gray-100 pt-2 space-y-1 max-h-40 overflow-y-auto">
                  {lastCredit.restricoes.slice(0, 20).map((r, i) => (
                    <p key={i}>• {typeof r === 'string' ? r : (r.descricao || r.tipo || JSON.stringify(r))}</p>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-gray-400">Consultado em {fmtDateTimeBR(lastCredit.created_at)} {lastCredit.user_name ? `por ${lastCredit.user_name}` : ''} {lastCredit.provider ? `· ${lastCredit.provider}` : ''}</p>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">Nenhuma consulta ainda. Clique em “Consultar agora”.</p>
          )}

          {(creditHist?.data || []).length > 1 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Consultas anteriores</p>
              <div className="border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-40 overflow-y-auto">
                {creditHist.data.slice(1).map(c => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-1.5 text-xs">
                    <span className="text-gray-500">{fmtDateTimeBR(c.created_at)}</span>
                    <span className="flex items-center gap-2">
                      <span>Score {c.score ?? '—'}</span>
                      {c.negativado ? <span className="text-red-600 font-medium">Negativado</span> : <span className="text-green-600">OK</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-2">
            Consulte só com finalidade legítima (ex.: venda a prazo). Cada consulta pode ter custo conforme o provedor configurado.
          </p>
        </div>
      </Modal>
    </div>
  );
}
