import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { ArrowLeft, Phone, Mail, MapPin, Edit2, Instagram, Cake, Hash, IdCard, CalendarPlus, RefreshCw, History, User, ShieldCheck, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
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

const saleStatusLabel = {
  open: 'Aberto', confirmed: 'Confirmado', in_production: 'Em Produção',
  ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};
const saleStatusClass = {
  open: 'badge-yellow', confirmed: 'badge-green', in_production: 'badge-blue',
  ready: 'badge-purple', delivered: 'badge-gray', cancelled: 'badge-red',
};

const quoteStatusLabel = {
  open: 'Aberto', sent: 'Enviado', approved: 'Aprovado', rejected: 'Rejeitado',
  expired: 'Expirado', converted: 'Convertido',
};

const finStatusLabel = { pending: 'Pendente', partial: 'Parcial', paid: 'Pago', overdue: 'Vencido' };
const finStatusClass = { pending: 'badge-yellow', partial: 'badge-blue', paid: 'badge-green', overdue: 'badge-red' };

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

  // Consulta de crédito (Serasa/SPC via API agregadora)
  const { data: creditHist } = useQuery({
    queryKey: ['credit-checks', id],
    queryFn: () => api.get(`/customers/${id}/credit-checks`),
    enabled: !!id && creditOpen,
  });
  const creditMut = useMutation({
    mutationFn: () => api.post(`/customers/${id}/credit-check`),
    onSuccess: () => { qc.invalidateQueries(['credit-checks', id]); toast.success('Consulta realizada!'); },
    onError: e => toast.error(e.error || 'Não foi possível consultar'),
  });
  const lastCredit = (creditHist?.data || [])[0];

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

  const { customer, sales, quotes, receivables, customizations, summary } = data;

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/customers')} className="btn-ghost p-2">
            <ArrowLeft size={18} />
          </button>
          {customer.avatar_url
            ? <img src={customer.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover ring-2 ring-orange-200" />
            : <span className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center"><User size={22} className="text-orange-400" /></span>}
          <div>
            <h1 className="page-title">{customer.name}</h1>
            <p className="text-sm text-gray-500">
              {customer.type} · {customer.cpf_cnpj || 'CPF/CNPJ não informado'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setCreditOpen(true)} className="btn-secondary" title="Consultar score/Serasa pelo CPF">
            <ShieldCheck size={15} /> Consultar crédito
          </button>
          <button onClick={() => setEditOpen(true)} className="btn-secondary">
            <Edit2 size={15} /> Editar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card p-4 text-center">
          <p className="text-2xl font-bold text-primary-600">{summary.sales_count}</p>
          <p className="text-xs text-gray-500 mt-1">Pedidos</p>
        </div>
        <div className="card p-4 text-center">
          <p className="text-lg font-bold text-gray-900">{fmt(summary.total_sales)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Comprado</p>
        </div>
      </div>

      {/* Info + Contato */}
      <div>
        <div className="card p-5 space-y-2">
          <h3 className="font-semibold text-gray-900 mb-3">Informações</h3>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Hash size={14} className="text-gray-400" /> Código: <b className="font-mono">{id4(customer.display_id)}</b>
          </div>
          {customer.birth_date && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Cake size={14} className="text-pink-400" /> Nascimento: <b>{fmtDateBR(customer.birth_date)}</b>
              {idadeAnos(customer.birth_date) != null && <span className="text-xs text-gray-400">({idadeAnos(customer.birth_date)} anos)</span>}
            </div>
          )}
          {customer.rg_ie && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <IdCard size={14} className="text-gray-400" /> {customer.type === 'PJ' ? 'IE' : 'RG'}: {customer.rg_ie}
            </div>
          )}
          {customer.phone && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone size={14} className="text-gray-400" /> {customer.phone}
            </div>
          )}
          {customer.mobile && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Phone size={14} className="text-gray-400" /> {customer.mobile} <span className="text-xs text-gray-400">(recado)</span>
            </div>
          )}
          {customer.email && (
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Mail size={14} className="text-gray-400" /> {customer.email}
            </div>
          )}
          {customer.instagram && (
            <a href={`https://instagram.com/${String(customer.instagram).replace(/^@/, '')}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 text-sm text-pink-600 hover:text-pink-700 font-medium w-fit">
              <Instagram size={14} /> @{String(customer.instagram).replace(/^@/, '')} <span className="text-xs">↗</span>
            </a>
          )}
          {customer.admission_data?.can_publish && (
            <p className="text-xs text-violet-600">💜 Autoriza publicar foto e marcar no Instagram</p>
          )}
          {customer.address && (customer.address.street || customer.address.city || customer.address.zip) && (
            <div className="flex gap-2 text-sm text-gray-600 pt-2 mt-2 border-t border-gray-100">
              <MapPin size={14} className="text-gray-400 mt-0.5 shrink-0" />
              <div className="leading-relaxed">
                <p className="font-medium text-gray-700">Endereço</p>
                {customer.address.street && (
                  <p>{customer.address.street}{customer.address.number ? `, ${customer.address.number}` : ''}{customer.address.complement ? ` — ${customer.address.complement}` : ''}</p>
                )}
                {customer.address.neighborhood && <p>Bairro: {customer.address.neighborhood}</p>}
                {(customer.address.city || customer.address.state) && (
                  <p>{customer.address.city}{customer.address.state ? `/${customer.address.state}` : ''}</p>
                )}
                {customer.address.zip && <p className="text-gray-400 text-xs">CEP {customer.address.zip}</p>}
              </div>
            </div>
          )}
          {customer.notes && (
            <p className="text-sm text-gray-500 mt-2 pt-2 border-t">{customer.notes}</p>
          )}

          {/* Histórico do cadastro: criação e última atualização */}
          {(customer.created_at || customer.updated_at) && (
            <div className="pt-2 mt-2 border-t border-gray-100 space-y-1">
              {customer.created_at && (
                <p className="text-xs text-gray-400 flex items-center gap-1.5">
                  <CalendarPlus size={12} /> Cadastro criado em {fmtDateTimeBR(customer.created_at)}
                </p>
              )}
              {customer.updated_at && customer.created_at &&
                (new Date(customer.updated_at) - new Date(customer.created_at) > 60000) && (
                <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                  <RefreshCw size={12} /> Cadastro atualizado em {fmtDateTimeBR(customer.updated_at)}
                </p>
              )}
            </div>
          )}
        </div>

      </div>

      {/* Histórico de alterações feitas pelo cliente */}
      {Array.isArray(customer.profile_history) && customer.profile_history.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <History size={16} className="text-orange-500" /> Histórico de alterações do cadastro
          </h3>
          <ol className="space-y-3">
            {[...customer.profile_history].reverse().map((h, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">{fmtDateTimeBR(h.at)} · {h.source === 'site' ? 'pelo site' : 'no sistema'}</p>
                  <ul className="text-gray-700">
                    {(h.changes || []).map((ch, j) => (
                      <li key={j}>
                        <b>{ch.label}</b>
                        {ch.from ? <> : <span className="text-gray-400 line-through">{ch.from}</span> → {ch.to}</> : ch.to ? <> {ch.to}</> : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Pedidos */}
      <div className="card">
        <div className="card-header">
          <span className="pb-2 text-sm font-medium border-b-2 border-primary-600 text-primary-600">
            Pedidos ({sales.length})
          </span>
        </div>

        {/* Sales tab */}
        {tab === 'sales' && (
          <div className="overflow-x-auto">
            <table className="table-auto">
              <thead>
                <tr><th>#</th><th>Data</th><th>Status</th><th>Entrega</th><th>Pgto.</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {sales.map(s => (
                  <tr key={s.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/sales/${s.id}`)}>
                    <td className="font-mono font-semibold">#{String(s.number).padStart(4,'0')}</td>
                    <td>{s.created_at ? format(parseISO(s.created_at), 'dd/MM/yyyy', { locale: ptBR }) : '—'}</td>
                    <td><span className={`badge text-xs ${saleStatusClass[s.status] || 'badge-gray'}`}>{saleStatusLabel[s.status] || s.status}</span></td>
                    <td className="text-sm text-gray-500">{s.delivery_date ? format(parseISO(s.delivery_date), 'dd/MM/yyyy') : '—'}</td>
                    <td className="text-sm text-gray-500">{s.payment_method || '—'}</td>
                    <td className="text-right font-semibold">{fmt(s.total)}</td>
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={6} className="text-center py-6 text-gray-400">Nenhum pedido encontrado</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Modal */}
      <Modal isOpen={editOpen} onClose={() => setEditOpen(false)} title="Editar Cliente" size="lg">
        <CustomerForm
          customer={customer}
          onSaved={() => { setEditOpen(false); qc.invalidateQueries(['customer-history', id]); }}
          onCancel={() => setEditOpen(false)}
        />
      </Modal>

      {/* Consulta de crédito */}
      <Modal isOpen={creditOpen} onClose={() => setCreditOpen(false)} title="Consulta de crédito" size="md">
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

          {/* Resultado mais recente */}
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

          {/* Histórico */}
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
