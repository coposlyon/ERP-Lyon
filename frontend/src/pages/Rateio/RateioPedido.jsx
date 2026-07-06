import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Eye, Info } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const dBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

export default function RateioPedido() {
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [viewId, setViewId] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['rateio-orders', month],
    queryFn: () => api.get(`/rateio/orders?month=${month}`),
  });

  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['rateio-order', viewId],
    queryFn: () => api.get(`/rateio/order/${viewId}`),
    enabled: !!viewId,
  });

  const t = data?.totals;
  const kpis = [
    ['Receita', fmtBRL(t?.receita), 'text-gray-900'],
    ['Custos', fmtBRL(t?.custos), 'text-gray-600'],
    ['Impostos', fmtBRL(t?.impostos), 'text-amber-700'],
    ['Lucro', fmtBRL(t?.lucro), (t?.lucro ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'],
    ['Margem', `${String(t?.margem_pct ?? 0).replace('.', ',')}%`, 'text-gray-900'],
  ];

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title uppercase">Rateio por Pedido</h1>
          <p className="text-sm text-gray-500 mt-1">Lucro real de cada venda: receita − custos − impostos, calculado automaticamente</p>
        </div>
        <input type="month" className="input max-w-[170px]" value={month} onChange={e => setMonth(e.target.value)} />
      </div>

      {isLoading ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <>
          {/* Totais do mês */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {kpis.map(([label, value, cls]) => (
              <div key={label} className={`card p-3 ${label === 'Lucro' ? 'bg-green-50 border-green-200' : ''}`}>
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
                <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
              </div>
            ))}
          </div>

          {/* Pedidos */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Pedido</th>
                  <th className="px-4 py-2">Cliente</th>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2 text-right">Qtd</th>
                  <th className="px-4 py-2 text-right">Receita</th>
                  <th className="px-4 py-2 text-right">Custos</th>
                  <th className="px-4 py-2 text-right">Impostos</th>
                  <th className="px-4 py-2 text-right">Lucro</th>
                  <th className="px-4 py-2 text-right">Margem</th>
                  <th className="px-4 py-2 text-center">Ver</th>
                </tr>
              </thead>
              <tbody>
                {(data?.orders || []).map(o => (
                  <tr key={o.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${o.lucro < 0 ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-2 font-mono font-semibold">#{String(o.number).padStart(4, '0')}</td>
                    <td className="px-4 py-2">{o.customer || <span className="text-gray-400">Sem cliente</span>}</td>
                    <td className="px-4 py-2 text-gray-500">{dBR(o.date)}</td>
                    <td className="px-4 py-2 text-right">{fmtQty(o.quantity)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtBRL(o.receita)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{fmtBRL(o.custos)}</td>
                    <td className="px-4 py-2 text-right text-amber-700">{fmtBRL(o.impostos)}</td>
                    <td className={`px-4 py-2 text-right font-bold ${o.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(o.lucro)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{String(o.margem_pct).replace('.', ',')}%</td>
                    <td className="px-4 py-2 text-center">
                      <button className="btn-ghost p-1.5 text-primary-600" onClick={() => setViewId(o.id)} title="Detalhar itens">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {(data?.orders || []).length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-sm text-gray-400">Nenhum pedido neste mês.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 flex items-center gap-1">
            <Info size={12} /> Custo por item: ficha de Formação de Preço do produto; sem ficha, usa custo do cadastro + rateio fixo + imposto padrão.
          </p>
        </>
      )}

      {/* Detalhe do pedido */}
      <Modal isOpen={!!viewId} onClose={() => setViewId(null)}
        title={detail ? `Pedido #${String(detail.order?.number).padStart(4, '0')} — ${detail.order?.customer || 'Sem cliente'}` : 'Pedido'} size="lg">
        {loadingDetail ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary-500" size={22} /></div>
        ) : detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center">
              {[
                ['Receita', fmtBRL(detail.receita), 'text-gray-900'],
                ['Custos', fmtBRL(detail.custos), 'text-gray-600'],
                ['Impostos', fmtBRL(detail.impostos), 'text-amber-700'],
                ['Lucro', fmtBRL(detail.lucro), detail.lucro >= 0 ? 'text-green-600' : 'text-red-600'],
              ].map(([label, value, cls]) => (
                <div key={label} className="rounded-xl bg-gray-50 p-2.5">
                  <p className="text-[11px] text-gray-500 uppercase">{label}</p>
                  <p className={`font-bold ${cls}`}>{value}</p>
                </div>
              ))}
            </div>
            <div className="max-h-72 overflow-y-auto rounded-lg border border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50">
                    <th className="px-3 py-2">Produto</th>
                    <th className="px-3 py-2 text-right">Qtd</th>
                    <th className="px-3 py-2 text-right">Receita</th>
                    <th className="px-3 py-2 text-right" title="Custo unitário (ficha ou cadastro)">Custo/un</th>
                    <th className="px-3 py-2 text-right">Lucro</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail.items || []).map((it, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="px-3 py-2">
                        {it.product_name}
                        {it.cost_source === 'ficha' && <span className="badge badge-blue ml-1.5">ficha</span>}
                      </td>
                      <td className="px-3 py-2 text-right">{fmtQty(it.quantity)}</td>
                      <td className="px-3 py-2 text-right">{fmtBRL(it.receita)}</td>
                      <td className="px-3 py-2 text-right text-gray-500">{fmtBRL4(it.custo_unit)}</td>
                      <td className={`px-3 py-2 text-right font-semibold ${it.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(it.lucro)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-400">
              Margem do pedido: <b>{String(detail.margem_pct).replace('.', ',')}%</b> · {fmtQty(detail.order?.quantity)} unidades
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
