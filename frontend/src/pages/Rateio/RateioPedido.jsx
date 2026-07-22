import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Eye, Info, ListTree, RefreshCw, X, ArrowUpRight, Filter,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const dBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;

export default function RateioPedido() {
  const qc = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [seller, setSeller] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [viewId, setViewId] = useState(null);
  const [calcId, setCalcId] = useState(null);   // pedido no "Detalhar Cálculo"
  const [recalcId, setRecalcId] = useState(null);

  const qs = new URLSearchParams({ month });
  if (seller) qs.set('seller', seller);
  if (customerId) qs.set('customer_id', customerId);
  if (productId) qs.set('product_id', productId);

  const { data, isLoading } = useQuery({
    queryKey: ['rateio-orders', month, seller, customerId, productId],
    queryFn: () => api.get(`/rateio/orders?${qs.toString()}`),
  });

  // Produtos para o filtro — vêm do cadastro, não são digitados
  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];

  const detailId = viewId || calcId;
  const { data: detail, isLoading: loadingDetail } = useQuery({
    queryKey: ['rateio-order', detailId],
    queryFn: () => api.get(`/rateio/order/${detailId}`),
    enabled: !!detailId,
  });

  async function recalcular(id) {
    setRecalcId(id);
    try {
      const r = await api.post(`/rateio/order/${id}/recalcular`);
      toast.success(r.fichas_atualizadas > 0
        ? `${r.fichas_atualizadas} ficha(s) atualizada(s) com o rateio atual`
        : 'Pedido reprocessado (produtos sem ficha usam o custo do cadastro)');
      qc.invalidateQueries({ queryKey: ['rateio-orders'] });
      qc.invalidateQueries({ queryKey: ['rateio-order', id] });
    } catch (err) {
      toast.error(err.error || 'Erro ao recalcular o pedido');
    } finally { setRecalcId(null); }
  }

  const t = data?.totals;
  const kpis = [
    ['Receita', fmtBRL(t?.receita), 'text-gray-900'],
    ['Custos', fmtBRL(t?.custos), 'text-gray-600'],
    ['Comissão', fmtBRL(t?.comissao), 'text-blue-700'],
    ['Impostos', fmtBRL(t?.impostos), 'text-amber-700'],
    ['Lucro', fmtBRL(t?.lucro), (t?.lucro ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'],
    ['Margem', pctBR(t?.margem_pct), 'text-gray-900'],
  ];

  const limpar = () => { setSeller(''); setCustomerId(''); setProductId(''); };
  const temFiltro = seller || customerId || productId;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Rateio por Pedido</h1>
          <p className="text-sm text-gray-500 mt-1">
            Lucro real de cada venda — receita, custos, comissão e impostos calculados automaticamente dos módulos
          </p>
        </div>
      </div>

      {/* Filtros — todas as opções vêm dos módulos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 flex items-center gap-1"><Filter size={13} /> Filtros</span>
        <input type="month" className="input py-1.5 text-sm w-auto" value={month} onChange={e => setMonth(e.target.value)} />
        <select className="input py-1.5 text-sm w-auto" value={seller} onChange={e => setSeller(e.target.value)}>
          <option value="">Todos os vendedores</option>
          {(data?.filters?.sellers || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto max-w-[200px]" value={customerId} onChange={e => setCustomerId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {(data?.filters?.customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto max-w-[200px]" value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Todos os produtos</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        {temFiltro && (
          <button className="btn-ghost btn-sm text-gray-500" onClick={limpar}><X size={13} /> Limpar</button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <>
          {/* Totais do período filtrado */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
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
                  <th className="px-3 py-2">Pedido</th>
                  <th className="px-3 py-2">Cliente</th>
                  <th className="px-3 py-2">Vendedor</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2 text-right">Qtd</th>
                  <th className="px-3 py-2 text-right">Receita</th>
                  <th className="px-3 py-2 text-right">Custos</th>
                  <th className="px-3 py-2 text-right">Variáveis</th>
                  <th className="px-3 py-2 text-right">Comissão</th>
                  <th className="px-3 py-2 text-right">Impostos</th>
                  <th className="px-3 py-2 text-right">Lucro</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {(data?.orders || []).map(o => (
                  <tr key={o.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${o.lucro < 0 ? 'bg-red-50/50' : ''}`}>
                    <td className="px-3 py-2 font-mono font-semibold">#{String(o.number).padStart(4, '0')}</td>
                    <td className="px-3 py-2">{o.customer || <span className="text-gray-400">Sem cliente</span>}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {o.seller || <span className="text-gray-300">—</span>}
                      {o.seller && o.seller_pct > 0 && <span className="text-[10px] text-gray-400 ml-1">{pctBR(o.seller_pct)}</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-500">{dBR(o.date)}</td>
                    <td className="px-3 py-2 text-right">{fmtQty(o.quantity)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtBRL(o.receita)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmtBRL(o.custos)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmtBRL(o.variavel)}</td>
                    <td className="px-3 py-2 text-right text-blue-700">{fmtBRL(o.comissao)}</td>
                    <td className="px-3 py-2 text-right text-amber-700">{fmtBRL(o.impostos)}</td>
                    <td className={`px-3 py-2 text-right font-bold ${o.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(o.lucro)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{pctBR(o.margem_pct)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button className="btn-ghost p-1.5 text-primary-600" onClick={() => setViewId(o.id)} title="Ver itens">
                          <Eye size={15} />
                        </button>
                        <button className="btn-ghost p-1.5 text-gray-600" onClick={() => setCalcId(o.id)} title="Detalhar Cálculo">
                          <ListTree size={15} />
                        </button>
                        <button className="btn-ghost p-1.5 text-blue-600" onClick={() => recalcular(o.id)}
                          disabled={recalcId === o.id} title="Recalcular Pedido">
                          {recalcId === o.id ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {(data?.orders || []).length === 0 && (
                  <tr><td colSpan={13} className="text-center py-12 text-sm text-gray-400">
                    {temFiltro ? 'Nenhum pedido para esses filtros.' : 'Nenhum pedido neste período.'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="text-xs text-gray-400 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>
              Nada é digitado nesta tela. Custo do produto vem da <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link>;
              variáveis das <Link to="/rateio/despesas-variaveis" className="text-primary-600 hover:underline">Despesas Variáveis</Link> ({fmtBRL4(data?.variable_unit)}/un);
              comissão do <Link to="/employees" className="text-primary-600 hover:underline">RH</Link> pelo vendedor do cliente;
              imposto do <Link to="/fiscal" className="text-primary-600 hover:underline">Fiscal</Link>.
            </span>
          </p>
        </>
      )}

      {/* Ver itens */}
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
                        <span className={`badge ml-1.5 ${it.cost_source === 'ficha' ? 'badge-blue' : 'badge-gray'}`}>
                          {it.cost_source === 'ficha' ? 'ficha' : 'cadastro'}
                        </span>
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
              Margem do pedido: <b>{pctBR(detail.margem_pct)}</b> · {fmtQty(detail.order?.quantity)} unidades
            </p>
          </div>
        )}
      </Modal>

      {/* Detalhar Cálculo — origem de cada custo */}
      <Modal isOpen={!!calcId} onClose={() => setCalcId(null)}
        title={detail ? `Cálculo do pedido #${String(detail.order?.number).padStart(4, '0')}` : 'Detalhar Cálculo'} size="lg">
        {loadingDetail ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary-500" size={22} /></div>
        ) : detail && (
          <div className="space-y-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="font-semibold text-gray-900">{detail.order?.customer || 'Sem cliente'}</p>
              <p className="text-xs text-gray-500">
                {dBR(detail.order?.date)} · {fmtQty(detail.order?.quantity)} un
                {detail.order?.seller && <> · vendedor: <b>{detail.order.seller}</b> ({pctBR(detail.order.seller_pct)})</>}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Origem de cada custo</p>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2 bg-gray-50 text-xs font-semibold text-gray-500 uppercase">
                  <span>Componente / origem</span><span className="text-right">Valor</span>
                </div>
                {(detail.origens || []).map(o => (
                  <div key={o.key} className="grid grid-cols-[1fr_auto] gap-2 px-3 py-2.5 border-t border-gray-100 items-start">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{o.label}</p>
                      <p className="text-xs text-gray-400">
                        <Link to={o.link} className="text-primary-600 hover:underline inline-flex items-center gap-0.5">
                          {o.origin} <ArrowUpRight size={10} />
                        </Link>
                        {' · '}{o.formula}
                      </p>
                    </div>
                    <span className="text-right font-semibold text-gray-900 whitespace-nowrap">{fmtBRL(o.value)}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Fechamento */}
            <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
              <div className="flex justify-between"><span className="text-gray-500">Receita</span><span className="font-medium">{fmtBRL(detail.receita)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">(−) Custo dos produtos</span><span className="text-red-500">{fmtBRL(detail.custos)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">(−) Custos variáveis</span><span className="text-red-500">{fmtBRL(detail.variavel)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">(−) Comissão</span><span className="text-red-500">{fmtBRL(detail.comissao)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">(−) Impostos</span><span className="text-red-500">{fmtBRL(detail.impostos)}</span></div>
              <div className="flex justify-between pt-2 border-t border-gray-100">
                <span className="font-semibold text-gray-700">Lucro do pedido</span>
                <span className={`font-bold ${detail.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(detail.lucro)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Margem</span>
                <span className={`font-semibold ${detail.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{pctBR(detail.margem_pct)}</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button className="btn-secondary" onClick={() => setCalcId(null)}><X size={14} /> Fechar</button>
              <button className="btn-primary" onClick={() => recalcular(calcId)} disabled={recalcId === calcId}>
                {recalcId === calcId ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Recalcular Pedido
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
