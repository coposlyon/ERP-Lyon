import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { ArrowLeft, Printer, CheckCircle2, Truck, Save, Loader2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { SALE_STATUS_ORDER, saleStatusIndex, saleStatusLabel, saleStatusClass } from '@/lib/saleStatus';

// Datas curtas do cartao de transporte, no mesmo formato da lista.
const d  = iso => { if (!iso) return ''; try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso; } };
const dt = iso => { if (!iso) return ''; try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm:ss'); } catch { return iso; } };

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

// próximo status na sequência (não pula etapas)
function proximoStatus(cur) {
  const i = saleStatusIndex(cur);
  return i >= 0 && i < SALE_STATUS_ORDER.length - 1 ? SALE_STATUS_ORDER[i + 1] : null;
}

const paymentLabels = {
  cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão Débito',
  card_credit: 'Cartão Crédito', transfer: 'Transferência', check: 'Cheque',
};

function renderCustomization(custom) {
  if (!custom) return null;
  if (typeof custom === 'string') return <p className="text-xs text-gray-500 mt-0.5">{custom}</p>;
  if (typeof custom === 'object') {
    const entries = Object.entries(custom).filter(([, v]) => v != null && v !== '');
    if (entries.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 mt-1">
        {entries.map(([k, v]) => (
          <span key={k} className="text-xs bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">
            {k}: {String(v)}
          </span>
        ))}
      </div>
    );
  }
  return null;
}

export default function SaleForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', id],
    queryFn: () => api.get(`/sales/${id}`),
    enabled: !!id && id !== 'new',
  });

  const advanceMutation = useMutation({
    mutationFn: (status) => api.patch(`/sales/${id}/status`, { status }),
    onSuccess: (data) => {
      toast.success(`Status: ${saleStatusLabel(data.status)}`);
      qc.invalidateQueries(['sale', id]);
      qc.invalidateQueries(['sales']);
    },
    onError: () => toast.error('Erro ao atualizar status'),
  });

  if (isLoading) return <div className="flex items-center justify-center h-48 text-gray-400">Carregando...</div>;

  if (!sale) return (
    <div className="text-center py-16 text-gray-400">
      <p>Pedido não encontrado</p>
      <button onClick={() => navigate('/sales')} className="btn-secondary mt-4">Voltar</button>
    </div>
  );

  const canAdvance = proximoStatus(sale.status);

  return (
    <>
      <style>{`
        @media print {
          aside, header, nav, .no-print { display: none !important; }
          body { background: white !important; }
          .card { box-shadow: none !important; border: 1px solid #e5e7eb !important; page-break-inside: avoid; }
          .page-title { font-size: 1.2rem; }
        }
      `}</style>

      <div className="max-w-3xl mx-auto space-y-5">
        <div className="page-header no-print">
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/sales')} className="btn-ghost p-2">
              <ArrowLeft size={18} />
            </button>
            <div>
              <h1 className="page-title">Pedido #{String(sale.number).padStart(4, '0')}</h1>
              <p className="text-sm text-gray-500">
                {sale.created_at ? format(parseISO(sale.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : ''}
              </p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            {canAdvance && (
              <button
                onClick={() => advanceMutation.mutate(canAdvance)}
                disabled={advanceMutation.isPending}
                className="btn-primary btn-sm"
              >
                <CheckCircle2 size={15} /> Avançar: {saleStatusLabel(canAdvance)}
              </button>
            )}
            <button onClick={() => window.print()} className="btn-secondary">
              <Printer size={16} /> Imprimir
            </button>
          </div>
        </div>

        {/* Info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Cliente</p>
            <p className="font-semibold">{sale.customers?.name || 'Consumidor Final'}</p>
            {sale.customers?.cpf_cnpj && <p className="text-sm text-gray-400">{sale.customers.cpf_cnpj}</p>}
            {sale.customers?.phone && <p className="text-sm text-gray-400">{sale.customers.phone}</p>}
          </div>
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-2">Status</p>
            <span className={`badge ${saleStatusClass(sale.status)}`}>
              {saleStatusLabel(sale.status)}
            </span>
            {sale.delivery_date && (
              <p className="text-sm text-gray-500 mt-2">
                📦 Entrega: {format(parseISO(sale.delivery_date), 'dd/MM/yyyy')}
              </p>
            )}
            {sale.payment_method && (
              <p className="text-sm text-gray-500 mt-1">
                💳 {paymentLabels[sale.payment_method] || sale.payment_method}
              </p>
            )}
          </div>
        </div>

        {/* Artwork */}
        {sale.artwork_url && (
          <div className="card p-4 bg-purple-50 border-purple-200">
            <p className="text-sm font-medium text-purple-900 mb-1">🎨 Arte / Personalização</p>
            <a href={sale.artwork_url} target="_blank" rel="noreferrer"
              className="text-purple-700 text-sm hover:underline break-all">
              {sale.artwork_url}
            </a>
            {sale.artwork_notes && <p className="text-sm text-purple-700 mt-2">{sale.artwork_notes}</p>}
          </div>
        )}

        {/* Items */}
        <div className="card">
          <div className="card-header"><h2 className="font-semibold">Itens do Pedido</h2></div>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b">Produto</th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b w-24">Qtd</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b w-28">Preço Un.</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase bg-gray-50 border-b w-28">Total</th>
              </tr>
            </thead>
            <tbody>
              {sale.items?.map((item, i) => (
                <tr key={i} className="border-b border-gray-50">
                  <td className="px-4 py-3">
                    <p className="font-medium">{item.products?.name || item.product_name}</p>
                    {renderCustomization(item.customization)}
                  </td>
                  <td className="px-4 py-3 text-center">{item.quantity} {item.products?.unit}</td>
                  <td className="px-4 py-3 text-right">{fmt(item.unit_price)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium">Subtotal</td>
                <td className="px-4 py-3 text-right font-semibold">{fmt(sale.subtotal)}</td>
              </tr>
              {sale.discount > 0 && (
                <tr className="bg-gray-50">
                  <td colSpan={3} className="px-4 py-3 text-right text-sm font-medium text-red-600">Desconto</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-600">-{fmt(sale.discount)}</td>
                </tr>
              )}
              <tr className="bg-gray-50">
                <td colSpan={3} className="px-4 py-3 text-right font-bold text-base">Total</td>
                <td className="px-4 py-3 text-right font-bold text-lg text-primary-600">{fmt(sale.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {sale.notes && (
          <div className="card p-4">
            <p className="text-xs text-gray-500 mb-1">Observações</p>
            <p className="text-sm">{sale.notes}</p>
          </div>
        )}

        {/* AS CINCO ABAS SAIRAM. Produtos, forma de pagamento, status e
            anexos ja aparecem na tela de acompanhamento do pedido — o
            painel repetia tudo isso e enchia a tela de informacao lida
            duas vezes.

            Sobrou este cartao, e ele fica porque nao e leitura, e
            DEFINICAO: transportadora, codigo de rastreio e a modalidade
            de entrega. A modalidade decide a linha do tempo que o
            cliente enxerga, e a transportadora e a coluna que a lista
            de pedidos mostra — sem este cartao, as duas nao teriam onde
            ser preenchidas em lugar nenhum do sistema. */}
        <div className="card p-4 no-print">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Truck size={16} className="text-primary-600" /> Transporte e entrega
          </h2>
          <TransportTab sale={sale} onChanged={() => qc.invalidateQueries(['sale', id])} />
        </div>
      </div>
    </>
  );
}

function TransportTab({ sale, onChanged }) {
  const qc = useQueryClient();
  const [carrierId, setCarrierId] = useState(sale.carrier_id || '');
  const [tracking, setTracking] = useState(sale.tracking_code || '');
  // Entrega ou retirada. Nulo é "ninguém informou", e vale entrega —
  // que é o que praticamente todo pedido é.
  const [modo, setModo] = useState(sale.delivery_mode === 'retirada' ? 'retirada' : 'entrega');
  const [events, setEvents] = useState(null);
  const [nfBp, setNfBp] = useState('');

  const { data: carriers } = useQuery({ queryKey: ['carriers'], queryFn: () => api.get('/shipping/carriers') });

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/sales/${sale.id}/shipping`, {
      carrier_id: carrierId || null, tracking_code: tracking, delivery_mode: modo,
    }),
    onSuccess: () => { qc.invalidateQueries(['sale', sale.id]); onChanged?.(); toast.success('Transportadora salva'); },
    onError: (e) => toast.error(e.error || 'Erro ao salvar'),
  });

  // Rastreio BrasPress por Nota Fiscal — reaproveita a mesma lista de eventos
  const trackBpMut = useMutation({
    mutationFn: () => api.get(`/shipping/braspress/track/${encodeURIComponent(nfBp.trim())}`),
    onSuccess: (r) => { setEvents(r.events || []); if (!(r.events || []).length) toast('Sem movimentações ainda.'); },
    onError: (e) => { setEvents(null); toast.error(e.error || 'Não foi possível rastrear na BrasPress'); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-400 text-xs block">Vr. Frete</span><b>{fmt(sale.freight)}</b></div>
        <div><span className="text-gray-400 text-xs block">Data da Saída</span><b>{d(sale.ship_date) || '—'}</b></div>
        <div><span className="text-gray-400 text-xs block">Previsão de Entrega</span><b>{d(sale.delivery_date || sale.max_delivery_date) || '—'}</b></div>
        <div><span className="text-gray-400 text-xs block">Data do Evento</span><b>{d(sale.event_date) || '—'}</b></div>
      </div>

      {/* A MODALIDADE MUDA A LINHA DO TEMPO DO CLIENTE.
          Em retirada não há coleta, trânsito nem entrega no endereço:
          as três etapas somem do acompanhamento e o pedido vai de
          "Aguardando retirada" direto para "Pedido entregue". Deixá-las
          na tela faria o cliente esperar um caminhão que não vai sair. */}
      <div className="border-t border-gray-100 pt-3">
        <label className="label">Modalidade</label>
        <div className="flex flex-wrap gap-2">
          {[['entrega', 'Entrega pela transportadora'], ['retirada', 'Retirada no local']].map(([v, rotulo]) => (
            <button key={v} type="button" onClick={() => setModo(v)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                modo === v
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {rotulo}
            </button>
          ))}
        </div>
        {modo === 'retirada' && (
          <p className="text-[11px] text-gray-500 mt-1.5">
            O cliente vem buscar: o acompanhamento dele pula coleta, trânsito e entrega.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 items-end border-t border-gray-100 pt-3">
        <div>
          <label className="label flex items-center gap-1"><Truck size={13} /> Transportadora</label>
          <select className="input text-sm" value={carrierId} onChange={e => setCarrierId(e.target.value)}>
            <option value="">— selecione —</option>
            {(carriers?.data || []).map(c => <option key={c.id} value={c.id}>{c.trade_name || c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Código de rastreio</label>
          <div className="flex gap-2">
            <input className="input text-sm font-mono" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="c\u00f3digo da transportadora" />
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-secondary text-sm whitespace-nowrap">
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          {/* O rastreio que existe é o da BrasPress, pela nota. O
              rastreio por código saiu junto com a J&T — o campo do
              código continua acima, para guardar o que a transportadora
              informar. */}
          <input className="input text-sm font-mono w-32" value={nfBp} onChange={e => setNfBp(e.target.value)} placeholder="Nº da NF" />
          <button onClick={() => trackBpMut.mutate()} disabled={trackBpMut.isPending || !nfBp.trim()}
            className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
            {trackBpMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />} Rastrear na BrasPress
          </button>
        </div>
        {events && events.length > 0 && (
          <ul className="mt-3 space-y-2">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="text-gray-400 whitespace-nowrap w-32 shrink-0">{ev.time ? dt(ev.time) : ''}</span>
                <span>
                  <b className="text-gray-800">{ev.status || ev.desc || '—'}</b>
                  {ev.where && <span className="text-gray-500"> · {ev.where}</span>}
                  {ev.desc && ev.desc !== ev.status && <span className="text-gray-500 block">{ev.desc}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {events && events.length === 0 && <p className="text-xs text-gray-400 mt-2">Sem movimentações registradas para este código.</p>}
      </div>
    </div>
  );
}
