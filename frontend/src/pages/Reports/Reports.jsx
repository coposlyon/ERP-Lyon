import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, Package, Users, ShoppingBag, ArrowDownCircle, ArrowUpCircle } from 'lucide-react';
import api from '@/lib/api';
import { format, subDays } from 'date-fns';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const today = format(new Date(), 'yyyy-MM-dd');
const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');

const statusLabels = {
  open: 'Aberto', sent: 'Enviado', approved: 'Aprovado', rejected: 'Rejeitado',
  expired: 'Expirado', converted: 'Convertido',
};

export default function Reports() {
  const [reportType, setReportType] = useState('sales');
  const [startDate, setStartDate] = useState(thirtyDaysAgo);
  const [endDate, setEndDate] = useState(today);

  const { data: salesReport, isLoading: salesLoading } = useQuery({
    queryKey: ['report-sales', startDate, endDate],
    queryFn: () => api.get(`/reports/sales-summary?start_date=${startDate}&end_date=${endDate}`),
    enabled: reportType === 'sales',
  });

  const { data: stockReport, isLoading: stockLoading } = useQuery({
    queryKey: ['report-stock'],
    queryFn: () => api.get('/reports/stock-position'),
    enabled: reportType === 'stock',
  });

  const { data: topCustomers } = useQuery({
    queryKey: ['report-customers', startDate, endDate],
    queryFn: () => api.get(`/reports/top-customers?start_date=${startDate}&end_date=${endDate}&limit=10`),
    enabled: reportType === 'customers',
  });

  const { data: topProducts } = useQuery({
    queryKey: ['report-products', startDate, endDate],
    queryFn: () => api.get(`/reports/top-products?start_date=${startDate}&end_date=${endDate}&limit=15`),
    enabled: reportType === 'products',
  });

  const { data: cashflowData } = useQuery({
    queryKey: ['report-cashflow', startDate, endDate],
    queryFn: () => api.get(`/reports/cashflow?start_date=${startDate}&end_date=${endDate}`),
    enabled: reportType === 'cashflow',
  });

  const { data: quotesReport } = useQuery({
    queryKey: ['report-quotes', startDate, endDate],
    queryFn: () => api.get(`/reports/quotes-summary?start_date=${startDate}&end_date=${endDate}`),
    enabled: reportType === 'quotes',
  });

  const reportTypes = [
    { key: 'sales', label: 'Vendas', icon: TrendingUp, color: 'blue' },
    { key: 'products', label: 'Top Produtos', icon: ShoppingBag, color: 'orange' },
    { key: 'customers', label: 'Top Clientes', icon: Users, color: 'purple' },
    { key: 'quotes', label: 'Orçamentos', icon: ArrowDownCircle, color: 'indigo' },
    { key: 'cashflow', label: 'Fluxo de Caixa', icon: ArrowUpCircle, color: 'teal' },
    { key: 'stock', label: 'Estoque', icon: Package, color: 'green' },
  ];

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">Relatórios</h1>
      </div>

      {/* Report selector */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {reportTypes.map(r => (
          <button
            key={r.key}
            onClick={() => setReportType(r.key)}
            className={`card p-4 flex flex-col items-center gap-2 text-center transition-all ${
              reportType === r.key ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:bg-gray-50'
            }`}
          >
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-${r.color}-100`}>
              <r.icon size={18} className={`text-${r.color}-600`} />
            </div>
            <span className={`text-xs font-medium leading-tight ${reportType === r.key ? 'text-primary-700' : 'text-gray-700'}`}>
              {r.label}
            </span>
          </button>
        ))}
      </div>

      {/* Date filter */}
      {reportType !== 'stock' && (
        <div className="card p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">De:</label>
            <input type="date" className="input w-36" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600 whitespace-nowrap">Até:</label>
            <input type="date" className="input w-36" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </div>
        </div>
      )}

      {/* ─── Relatório de Vendas ─── */}
      {reportType === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-primary-600">{fmt(salesReport?.summary?.total_amount)}</p>
              <p className="text-sm text-gray-500 mt-1">Total de Vendas</p>
            </div>
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-gray-900">{salesReport?.summary?.total_count || 0}</p>
              <p className="text-sm text-gray-500 mt-1">Número de Pedidos</p>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <div className="card-header"><h3 className="font-semibold">Detalhamento de Vendas</h3></div>
            <table className="table-auto">
              <thead>
                <tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Status</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {(salesReport?.data || []).map(sale => (
                  <tr key={sale.id}>
                    <td className="font-mono">#{String(sale.number).padStart(4,'0')}</td>
                    <td>{sale.created_at?.split('T')[0]}</td>
                    <td>{sale.customers?.name || 'Consumidor Final'}</td>
                    <td><span className="badge badge-gray text-xs">{sale.status}</span></td>
                    <td className="text-right font-semibold">{fmt(sale.total)}</td>
                  </tr>
                ))}
                {!salesReport?.data?.length && !salesLoading && (
                  <tr><td colSpan={5} className="text-center text-gray-400 py-6">Nenhuma venda no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Top Produtos ─── */}
      {reportType === 'products' && (
        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Produtos Mais Vendidos</h3></div>
          <div className="divide-y divide-gray-50">
            {(topProducts || []).map((p, i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i === 0 ? 'bg-yellow-100 text-yellow-700' :
                    i === 1 ? 'bg-gray-100 text-gray-600' :
                    i === 2 ? 'bg-orange-100 text-orange-700' : 'bg-gray-50 text-gray-500'
                  }`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{p.product?.name}</p>
                    <p className="text-xs text-gray-400">{p.product?.code} · {Number(p.total_qty).toLocaleString('pt-BR')} {p.product?.unit} vendidos</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{fmt(p.total_value)}</p>
                  <p className="text-xs text-gray-400">{p.count} pedido{p.count !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
            {!topProducts?.length && (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum dado disponível para o período</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Top Clientes ─── */}
      {reportType === 'customers' && (
        <div className="card">
          <div className="card-header"><h3 className="font-semibold">Clientes que Mais Compraram</h3></div>
          <div className="divide-y divide-gray-50">
            {(topCustomers || []).map((c, i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-sm font-bold text-primary-700">
                    {i + 1}
                  </div>
                  <div>
                    <p className="font-medium">{c.customer?.name}</p>
                    <p className="text-xs text-gray-400">{c.count} pedido{c.count !== 1 ? 's' : ''}</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900">{fmt(c.total)}</p>
              </div>
            ))}
            {!topCustomers?.length && (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum dado disponível</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Orçamentos ─── */}
      {reportType === 'quotes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(quotesReport?.summary?.by_status || {}).map(([status, count]) => (
              <div key={status} className="card p-4 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-gray-500 mt-1">{statusLabels[status] || status}</p>
              </div>
            ))}
          </div>
          <div className="card">
            <div className="card-header">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Orçamentos</h3>
                <p className="text-sm text-gray-500">{quotesReport?.summary?.total_count || 0} orçamentos · {fmt(quotesReport?.summary?.total_value)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="table-auto">
                <thead>
                  <tr><th>#</th><th>Data</th><th>Cliente</th><th>Status</th><th>Validade</th><th className="text-right">Total</th></tr>
                </thead>
                <tbody>
                  {(quotesReport?.data || []).map(q => (
                    <tr key={q.id}>
                      <td className="font-mono">#{String(q.number).padStart(4,'0')}</td>
                      <td>{q.created_at?.split('T')[0]}</td>
                      <td>{q.CLIENTES?.name || '—'}</td>
                      <td><span className="badge badge-gray text-xs">{statusLabels[q.status] || q.status}</span></td>
                      <td className="text-sm text-gray-500">{q.valid_until || '—'}</td>
                      <td className="text-right font-semibold">{fmt(q.total)}</td>
                    </tr>
                  ))}
                  {!quotesReport?.data?.length && (
                    <tr><td colSpan={6} className="text-center text-gray-400 py-6">Nenhum orçamento no período</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ─── Fluxo de Caixa ─── */}
      {reportType === 'cashflow' && (
        <div className="space-y-4">
          {cashflowData?.summary && (
            <div className="grid grid-cols-3 gap-4">
              <div className="card p-5 border-l-4 border-green-500">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total a Receber</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{fmt(cashflowData.summary.total_receivable)}</p>
              </div>
              <div className="card p-5 border-l-4 border-red-500">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Total a Pagar</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{fmt(cashflowData.summary.total_payable)}</p>
              </div>
              <div className={`card p-5 border-l-4 ${cashflowData.summary.net >= 0 ? 'border-blue-500' : 'border-orange-500'}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Saldo Líquido</p>
                <p className={`text-2xl font-bold mt-1 ${cashflowData.summary.net >= 0 ? 'text-blue-600' : 'text-orange-600'}`}>
                  {fmt(cashflowData.summary.net)}
                </p>
              </div>
            </div>
          )}
          <div className="card overflow-x-auto">
            <div className="card-header"><h3 className="font-semibold">Lançamentos por Data</h3></div>
            <table className="table-auto">
              <thead>
                <tr>
                  <th>Data</th>
                  <th className="text-right text-green-700">A Receber</th>
                  <th className="text-right text-red-600">A Pagar</th>
                  <th className="text-right">Saldo Acum.</th>
                </tr>
              </thead>
              <tbody>
                {(cashflowData?.rows || []).map((row, i) => (
                  <tr key={i} className={row.balance < 0 ? 'bg-red-50/40' : ''}>
                    <td className="font-mono text-sm">{row.date}</td>
                    <td className="text-right text-green-700 font-medium">{row.receivable > 0 ? fmt(row.receivable) : '—'}</td>
                    <td className="text-right text-red-600 font-medium">{row.payable > 0 ? fmt(row.payable) : '—'}</td>
                    <td className={`text-right font-bold ${row.balance >= 0 ? 'text-gray-900' : 'text-red-600'}`}>{fmt(row.balance)}</td>
                  </tr>
                ))}
                {!cashflowData?.rows?.length && (
                  <tr><td colSpan={4} className="text-center text-gray-400 py-6">Nenhum lançamento no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Estoque ─── */}
      {reportType === 'stock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold">{stockReport?.summary?.total_products || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Produtos ativos</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{stockReport?.summary?.below_min_stock || 0}</p>
              <p className="text-xs text-gray-500 mt-1">Abaixo do mínimo</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-lg font-bold">{fmt(stockReport?.summary?.total_cost_value)}</p>
              <p className="text-xs text-gray-500 mt-1">Valor de custo</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-lg font-bold text-green-700">{fmt(stockReport?.summary?.total_sale_value)}</p>
              <p className="text-xs text-gray-500 mt-1">Valor de venda</p>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <div className="card-header"><h3 className="font-semibold">Posição de Estoque</h3></div>
            <table className="table-auto">
              <thead>
                <tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th className="text-right">Valor Total</th></tr>
              </thead>
              <tbody>
                {(stockReport?.data || []).map(p => (
                  <tr key={p.id} className={p.current_stock <= p.min_stock ? 'bg-red-50' : ''}>
                    <td className="font-mono text-xs">{p.code}</td>
                    <td>{p.name}</td>
                    <td>{p.categories?.name || '—'}</td>
                    <td className={p.current_stock <= p.min_stock ? 'text-red-600 font-bold' : 'font-semibold'}>
                      {p.current_stock} {p.unit}
                    </td>
                    <td className="text-gray-500">{p.min_stock} {p.unit}</td>
                    <td className="text-right">{fmt(p.current_stock * p.cost_price)}</td>
                  </tr>
                ))}
                {stockLoading && <tr><td colSpan={6} className="text-center py-6 text-gray-400">Carregando...</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
