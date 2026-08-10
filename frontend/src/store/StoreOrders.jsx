import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Loader2, CalendarHeart, Truck, Camera, LogIn } from 'lucide-react';
import storeApi from './storeApi';
import { useStoreAuth } from './StoreAuthContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : null;
const fmtDateTime = d => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return ''; } };

const STATUS_STYLE = {
  analysis:  'bg-gray-100 text-gray-700',
  approved:  'bg-blue-100 text-blue-700',
  rejected:  'bg-red-100 text-red-700',
  preparing: 'bg-amber-100 text-amber-700',
  producing: 'bg-orange-100 text-orange-700',
  ready:     'bg-green-100 text-green-700',
  done:      'bg-emerald-100 text-emerald-700',
  payment:   'bg-amber-100 text-amber-700',
};

const STEPS = [
  { key: 'analysis',  label: 'Recebido' },
  { key: 'preparing', label: 'Em preparação' },
  { key: 'producing', label: 'Em produção' },
  { key: 'ready',     label: 'Pronto' },
];
function stepIndex(key) {
  if (key === 'approved') return 1;
  if (key === 'done') return 3;
  const i = STEPS.findIndex(s => s.key === key);
  return i < 0 ? 0 : i;
}

export default function StoreOrders() {
  const { customer } = useStoreAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['my-orders', customer?.id],
    queryFn: () => storeApi.get(`/my-orders?customer_id=${customer.id}`),
    enabled: !!customer?.id,
  });
  const orders = data?.orders || [];

  if (!customer) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <Package size={48} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-700">Acompanhe seus pedidos</h1>
        <p className="text-gray-500 mt-2">Entre com seu CPF para ver o status e as fotos do seu produto.</p>
        <Link to="/loja/login" className="inline-flex items-center gap-2 mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          <LogIn size={17} /> Entrar
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-black mb-1">Meus Pedidos</h1>
      <p className="text-gray-500 mb-6">Olá, {(customer.name || '').split(' ')[0]}! Acompanhe abaixo o status de cada pedido.</p>

      {isLoading ? (
        <div className="flex justify-center py-20"><Loader2 className="animate-spin text-orange-500" /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20">
          <Package size={44} className="text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Você ainda não tem pedidos.</p>
          <Link to="/loja" className="inline-block mt-4 text-orange-600 font-semibold">Ver produtos</Link>
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map(o => {
            const stStyle = STATUS_STYLE[o.status?.key] || STATUS_STYLE.analysis;
            const active = stepIndex(o.status?.key);
            return (
              <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-5 py-3 border-b border-gray-50">
                  <div>
                    <p className="font-bold text-gray-900">Pedido {o.number ? `#${String(o.number).padStart(4, '0')}` : ''}</p>
                    <p className="text-xs text-gray-400">Feito em {fmtDateTime(o.created_at)}</p>
                  </div>
                  <span className={`text-xs font-bold px-3 py-1 rounded-full ${stStyle}`}>{o.status?.label || '—'}</span>
                </div>

                {/* Ainda não pago: o pedido só entra em produção depois do PIX */}
                {o.pending_payment && (
                  <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-sm text-amber-800">
                      Falta pagar <b>{fmt(o.total)}</b> para liberar a produção.
                    </p>
                    <Link to={`/loja/pagar/${o.id}`}
                      className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-xl transition-colors">
                      Pagar com PIX
                    </Link>
                  </div>
                )}

                {/* Linha do tempo */}
                {o.status?.key !== 'rejected' && !o.pending_payment && (
                  <div className="px-5 pt-4">
                    <div className="flex items-center">
                      {STEPS.map((s, i) => (
                        <div key={s.key} className="flex-1 flex items-center last:flex-none">
                          <div className="flex flex-col items-center">
                            <div className={`w-3.5 h-3.5 rounded-full ${i <= active ? 'bg-orange-500' : 'bg-gray-200'}`} />
                            <span className={`text-[10px] mt-1 whitespace-nowrap ${i <= active ? 'text-orange-600 font-semibold' : 'text-gray-400'}`}>{s.label}</span>
                          </div>
                          {i < STEPS.length - 1 && <div className={`flex-1 h-0.5 mx-1 mb-4 ${i < active ? 'bg-orange-500' : 'bg-gray-200'}`} />}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="px-5 py-4 space-y-3">
                  {/* Datas */}
                  <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
                    {o.event_date && <span className="flex items-center gap-1.5 text-gray-600"><CalendarHeart size={14} className="text-orange-400" /> Evento: <b>{fmtDate(o.event_date)}</b></span>}
                    {o.ship_date && <span className="flex items-center gap-1.5 text-gray-600"><Truck size={14} className="text-orange-400" /> Saída: <b>{fmtDate(o.ship_date)}</b></span>}
                    <span className="text-gray-600 ml-auto font-semibold">{fmt(o.total)}</span>
                  </div>

                  {/* Itens */}
                  <div className="flex flex-wrap gap-2">
                    {o.items.map((it, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg pr-3">
                        {it.preview
                          ? <img src={it.preview} alt="" className="w-10 h-10 object-contain rounded-lg" />
                          : <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center"><Package size={16} className="text-gray-300" /></div>}
                        <span className="text-xs text-gray-600">{it.quantity}× {it.name}</span>
                      </div>
                    ))}
                  </div>

                  {/* Fotos do produto (anexadas pela produção) */}
                  {o.photos.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-gray-500 flex items-center gap-1.5 mb-2"><Camera size={13} /> Fotos do seu produto</p>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {o.photos.map((p, i) => (
                          <a key={i} href={p.url} target="_blank" rel="noreferrer">
                            <img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition-opacity" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
