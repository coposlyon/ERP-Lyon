import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  TrendingUp, Package, Users, ShoppingBag,
  ArrowDownCircle, ArrowUpCircle, BarChart2,
  Download, FileText,
} from 'lucide-react';
import api from '@/lib/api';
import { format, subDays } from 'date-fns';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const fmt = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const pct = v => `${Number(v || 0).toFixed(1)}%`;

const today        = format(new Date(), 'yyyy-MM-dd');
const thirtyAgo    = format(subDays(new Date(), 30), 'yyyy-MM-dd');

const STATUS_LABELS = {
  open:'Aberto', sent:'Enviado', approved:'Aprovado', rejected:'Rejeitado',
  expired:'Expirado', converted:'Convertido',
};

// ── Exportar CSV ──────────────────────────────────────────
function exportCSV(filename, headers, rows) {
  const bom  = '﻿';
  const head = headers.join(';');
  const body = rows.map(r => r.map(c => `"${String(c ?? '').replace(/"/g,'""')}"`).join(';')).join('\n');
  const blob = new Blob([bom + head + '\n' + body], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download: filename });
  a.click(); URL.revokeObjectURL(url);
}

// ── Exportar PDF ──────────────────────────────────────────
function exportPDF(title, headers, rows, summary = '') {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(16);
  doc.text('Lyon Copos — ' + title, 14, 16);
  doc.setFontSize(9);
  doc.setTextColor(120);
  doc.text(`Emitido em ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, 22);
  if (summary) doc.text(summary, 14, 27);
  autoTable(doc, {
    startY: summary ? 32 : 28,
    head:   [headers],
    body:   rows,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [232, 24, 122], textColor: 255 },
    alternateRowStyles: { fillColor: [250, 250, 250] },
  });
  doc.save(`${title.replace(/\s/g,'_')}_${today}.pdf`);
}

// ── Botões de export ──────────────────────────────────────
function ExportButtons({ onPDF, onCSV }) {
  return (
    <div className="flex gap-2">
      <button onClick={onCSV}
        className="btn-secondary btn-sm flex items-center gap-1.5 text-xs">
        <Download size={13}/> CSV/Excel
      </button>
      <button onClick={onPDF}
        className="btn-secondary btn-sm flex items-center gap-1.5 text-xs">
        <FileText size={13}/> PDF
      </button>
    </div>
  );
}

export default function Reports() {
  const [reportType, setReportType] = useState('sales');
  const [startDate, setStartDate]   = useState(thirtyAgo);
  const [endDate, setEndDate]       = useState(today);

  // ── Queries ───────────────────────────────────────────
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
  const { data: profitReport, isLoading: profitLoading } = useQuery({
    queryKey: ['report-profitability', startDate, endDate],
    queryFn: () => api.get(`/reports/profitability?start_date=${startDate}&end_date=${endDate}`),
    enabled: reportType === 'profitability',
  });

  const [commRate, setCommRate] = useState(5);
  const { data: abcReport } = useQuery({
    queryKey: ['report-abc', startDate, endDate],
    queryFn: () => api.get(`/reports/abc-products?start_date=${startDate}&end_date=${endDate}`),
    enabled: reportType === 'abc',
  });
  const { data: commReport } = useQuery({
    queryKey: ['report-commissions', startDate, endDate, commRate],
    queryFn: () => api.get(`/reports/commissions?start_date=${startDate}&end_date=${endDate}&rate=${commRate}`),
    enabled: reportType === 'commissions',
  });

  const reportTypes = [
    { key:'sales',         label:'Vendas',         icon:TrendingUp,      color:'blue'   },
    { key:'profitability', label:'Rentabilidade',   icon:BarChart2,       color:'pink'   },
    { key:'abc',           label:'Curva ABC',       icon:BarChart2,       color:'orange' },
    { key:'commissions',   label:'Comissões',       icon:Users,           color:'green'  },
    { key:'products',      label:'Top Produtos',    icon:ShoppingBag,     color:'orange' },
    { key:'customers',     label:'Top Clientes',    icon:Users,           color:'purple' },
    { key:'quotes',        label:'Orçamentos',      icon:ArrowDownCircle, color:'indigo' },
    { key:'cashflow',      label:'Fluxo de Caixa',  icon:ArrowUpCircle,   color:'teal'   },
    { key:'stock',         label:'Estoque',         icon:Package,         color:'green'  },
  ];

  // ── Export handlers ───────────────────────────────────
  function exportSales(type) {
    const rows = (salesReport?.data||[]).map(s => [
      `#${String(s.number).padStart(4,'0')}`, s.created_at?.split('T')[0],
      s.customers?.name||'Consumidor Final', s.status, fmt(s.total),
    ]);
    if (type==='pdf') exportPDF('Relatório de Vendas',
      ['Pedido','Data','Cliente','Status','Total'], rows,
      `Total: ${fmt(salesReport?.summary?.total_amount)} · ${salesReport?.summary?.total_count} pedidos`);
    else exportCSV('vendas.csv', ['Pedido','Data','Cliente','Status','Total'], rows);
  }

  function exportProfit(type) {
    const rows = (profitReport?.data||[]).map(s => [
      `#${String(s.number).padStart(4,'0')}`, s.created_at?.split('T')[0],
      s.CLIENTES?.name||'—', fmt(s.revenue), fmt(s.cost), fmt(s.profit), pct(s.margin),
    ]);
    if (type==='pdf') exportPDF('Rentabilidade por Pedido',
      ['Pedido','Data','Cliente','Receita','Custo','Lucro','Margem'], rows,
      `Receita: ${fmt(profitReport?.summary?.revenue)} · Lucro: ${fmt(profitReport?.summary?.profit)} · Margem: ${pct(profitReport?.summary?.margin)}`);
    else exportCSV('rentabilidade.csv', ['Pedido','Data','Cliente','Receita','Custo','Lucro','Margem'], rows);
  }

  function exportStock(type) {
    const rows = (stockReport?.data||[]).map(p => [
      p.code, p.name, p.CATEGORIAS?.name||'—',
      `${p.current_stock} ${p.unit}`, `${p.min_stock} ${p.unit}`,
      fmt(p.cost_price), fmt(p.sale_price), fmt(p.current_stock * p.cost_price),
    ]);
    if (type==='pdf') exportPDF('Posição de Estoque',
      ['Código','Produto','Categoria','Estoque','Mínimo','Custo Unit.','Venda Unit.','Valor Total'], rows,
      `${stockReport?.summary?.total_products||0} produtos · Valor custo: ${fmt(stockReport?.summary?.total_cost_value)}`);
    else exportCSV('estoque.csv', ['Código','Produto','Categoria','Estoque','Mínimo','Custo Unit.','Venda Unit.','Valor Total'], rows);
  }

  function exportCustomers(type) {
    const rows = (topCustomers||[]).map((c,i) => [i+1, c.customer?.name, c.count, fmt(c.total)]);
    if (type==='pdf') exportPDF('Top Clientes', ['#','Cliente','Pedidos','Total'], rows);
    else exportCSV('top-clientes.csv', ['#','Cliente','Pedidos','Total'], rows);
  }

  function exportProducts(type) {
    const rows = (topProducts||[]).map((p,i) => [i+1, p.product?.code, p.product?.name, p.total_qty, fmt(p.total_value)]);
    if (type==='pdf') exportPDF('Top Produtos', ['#','Código','Produto','Qtd','Total'], rows);
    else exportCSV('top-produtos.csv', ['#','Código','Produto','Qtd','Total'], rows);
  }

  function exportABC(type) {
    const headers = ['Classe','Código','Produto','Qtd','Faturamento','Part.%','Acum.%','Lucro','Margem%'];
    const rows = (abcReport?.data||[]).map(p => [p.abc, p.code, p.name, p.qty, fmt(p.revenue), p.share, p.cumulative, fmt(p.profit), p.margin]);
    if (type==='pdf') exportPDF('Curva ABC de Produtos', headers, rows);
    else exportCSV('curva-abc.csv', headers, rows);
  }

  function exportCommissions(type) {
    const headers = ['Vendedor','Vendas','Total Vendido','Taxa%','Comissão'];
    const rows = (commReport?.data||[]).map(v => [v.name, v.sales_count, fmt(v.total), commReport?.rate, fmt(v.commission)]);
    if (type==='pdf') exportPDF('Comissões de Vendedores', headers, rows,
      `Total vendido: ${fmt(commReport?.summary?.total_sold)} · Comissões (${commReport?.rate}%): ${fmt(commReport?.summary?.total_commission)}`);
    else exportCSV('comissoes.csv', headers, rows);
  }

  function exportCashflow(type) {
    const rows = (cashflowData?.rows||[]).map(r => [r.date, fmt(r.receivable), fmt(r.payable), fmt(r.balance)]);
    if (type==='pdf') exportPDF('Fluxo de Caixa', ['Data','A Receber','A Pagar','Saldo Acum.'], rows,
      `Receber: ${fmt(cashflowData?.summary?.total_receivable)} · Pagar: ${fmt(cashflowData?.summary?.total_payable)} · Saldo: ${fmt(cashflowData?.summary?.net)}`);
    else exportCSV('fluxo-caixa.csv', ['Data','A Receber','A Pagar','Saldo Acumulado'], rows);
  }

  function exportQuotes(type) {
    const rows = (quotesReport?.data||[]).map(q => [
      `#${String(q.number).padStart(4,'0')}`, q.created_at?.split('T')[0],
      q.CLIENTES?.name||'—', STATUS_LABELS[q.status]||q.status, q.valid_until||'—', fmt(q.total),
    ]);
    if (type==='pdf') exportPDF('Orçamentos', ['#','Data','Cliente','Status','Validade','Total'], rows,
      `Total: ${quotesReport?.summary?.total_count||0} orçamentos · ${fmt(quotesReport?.summary?.total_value)}`);
    else exportCSV('orcamentos.csv', ['#','Data','Cliente','Status','Validade','Total'], rows);
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <h1 className="page-title">Relatórios</h1>
      </div>

      {/* Seletor de relatório */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
        {reportTypes.map(r => (
          <button key={r.key} onClick={() => setReportType(r.key)}
            className={`card p-3 flex flex-col items-center gap-1.5 text-center transition-all ${
              reportType===r.key ? 'ring-2 ring-primary-500 bg-primary-50' : 'hover:bg-gray-50'
            }`}>
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center bg-${r.color}-100`}>
              <r.icon size={16} className={`text-${r.color}-600`} />
            </div>
            <span className={`text-xs font-medium leading-tight ${reportType===r.key?'text-primary-700':'text-gray-700'}`}>
              {r.label}
            </span>
          </button>
        ))}
      </div>

      {/* Filtro de datas */}
      {reportType !== 'stock' && (
        <div className="card p-4 flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">De:</label>
            <input type="date" className="input w-36" value={startDate} onChange={e => setStartDate(e.target.value)}/>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-gray-600">Até:</label>
            <input type="date" className="input w-36" value={endDate} onChange={e => setEndDate(e.target.value)}/>
          </div>
          <div className="flex gap-1 ml-auto">
            {[['7d','7 dias'],['30d','30 dias'],['90d','90 dias'],['365d','1 ano']].map(([k,l]) => (
              <button key={k} onClick={() => {
                const d = parseInt(k); setEndDate(today);
                setStartDate(format(subDays(new Date(), d), 'yyyy-MM-dd'));
              }} className="btn-secondary btn-sm text-xs">{l}</button>
            ))}
          </div>
        </div>
      )}

      {/* ─── VENDAS ─── */}
      {reportType === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-primary-600">{fmt(salesReport?.summary?.total_amount)}</p>
              <p className="text-sm text-gray-500 mt-1">Total de Vendas</p>
            </div>
            <div className="card p-5 text-center">
              <p className="text-3xl font-bold text-gray-900">{salesReport?.summary?.total_count||0}</p>
              <p className="text-sm text-gray-500 mt-1">Número de Pedidos</p>
            </div>
          </div>
          <div className="card overflow-x-auto">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold">Detalhamento de Vendas</h3>
              <ExportButtons onPDF={() => exportSales('pdf')} onCSV={() => exportSales('csv')}/>
            </div>
            <table className="table-auto">
              <thead>
                <tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Status</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {(salesReport?.data||[]).map(sale => (
                  <tr key={sale.id}>
                    <td className="font-mono">#{String(sale.number).padStart(4,'0')}</td>
                    <td>{sale.created_at?.split('T')[0]}</td>
                    <td>{sale.customers?.name||'Consumidor Final'}</td>
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

      {/* ─── RENTABILIDADE ─── */}
      {reportType === 'profitability' && (
        <div className="space-y-4">
          {profitReport?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card p-4 text-center border-l-4 border-blue-500">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Receita total</p>
                <p className="text-xl font-bold text-blue-700 mt-1">{fmt(profitReport.summary.revenue)}</p>
              </div>
              <div className="card p-4 text-center border-l-4 border-red-400">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Custo total</p>
                <p className="text-xl font-bold text-red-600 mt-1">{fmt(profitReport.summary.cost)}</p>
              </div>
              <div className="card p-4 text-center border-l-4 border-green-500">
                <p className="text-xs text-gray-500 uppercase tracking-wide">Lucro bruto</p>
                <p className="text-xl font-bold text-green-700 mt-1">{fmt(profitReport.summary.profit)}</p>
              </div>
              <div className={`card p-4 text-center border-l-4 ${profitReport.summary.margin >= 30?'border-emerald-500':'border-orange-400'}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide">Margem média</p>
                <p className={`text-2xl font-bold mt-1 ${profitReport.summary.margin>=30?'text-emerald-700':'text-orange-700'}`}>
                  {pct(profitReport.summary.margin)}
                </p>
              </div>
            </div>
          )}
          <div className="card overflow-x-auto">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold">Rentabilidade por Pedido</h3>
              <ExportButtons onPDF={() => exportProfit('pdf')} onCSV={() => exportProfit('csv')}/>
            </div>
            <table className="table-auto">
              <thead>
                <tr>
                  <th>Pedido</th><th>Data</th><th>Cliente</th>
                  <th className="text-right">Receita</th>
                  <th className="text-right">Custo</th>
                  <th className="text-right text-green-700">Lucro</th>
                  <th className="text-right">Margem</th>
                </tr>
              </thead>
              <tbody>
                {profitLoading && <tr><td colSpan={7} className="text-center py-6 text-gray-400">Calculando...</td></tr>}
                {(profitReport?.data||[]).map(s => (
                  <tr key={s.id}>
                    <td className="font-mono text-xs">#{String(s.number).padStart(4,'0')}</td>
                    <td className="text-sm">{s.created_at?.split('T')[0]}</td>
                    <td className="text-sm">{s.CLIENTES?.name||'—'}</td>
                    <td className="text-right font-medium">{fmt(s.revenue)}</td>
                    <td className="text-right text-red-500">{fmt(s.cost)}</td>
                    <td className="text-right font-bold text-green-700">{fmt(s.profit)}</td>
                    <td className="text-right">
                      <span className={`badge text-xs ${s.margin>=30?'bg-green-100 text-green-700':s.margin>=15?'bg-yellow-100 text-yellow-700':'bg-red-100 text-red-600'}`}>
                        {pct(s.margin)}
                      </span>
                    </td>
                  </tr>
                ))}
                {!profitReport?.data?.length && !profitLoading && (
                  <tr><td colSpan={7} className="text-center py-6 text-gray-400">Nenhum dado no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── TOP PRODUTOS ─── */}
      {reportType === 'products' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold">Produtos Mais Vendidos</h3>
            <ExportButtons onPDF={() => exportProducts('pdf')} onCSV={() => exportProducts('csv')}/>
          </div>
          <div className="divide-y divide-gray-50">
            {(topProducts||[]).map((p,i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                    i===0?'bg-yellow-100 text-yellow-700':i===1?'bg-gray-100 text-gray-600':i===2?'bg-orange-100 text-orange-700':'bg-gray-50 text-gray-400'
                  }`}>{i+1}</div>
                  <div>
                    <p className="font-medium text-sm">{p.product?.name}</p>
                    <p className="text-xs text-gray-400">{p.product?.code} · {Number(p.total_qty).toLocaleString('pt-BR')} {p.product?.unit}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-gray-900">{fmt(p.total_value)}</p>
                  <p className="text-xs text-gray-400">{p.count} pedido{p.count!==1?'s':''}</p>
                </div>
              </div>
            ))}
            {!topProducts?.length && <p className="text-sm text-gray-400 text-center py-8">Nenhum dado disponível</p>}
          </div>
        </div>
      )}

      {/* ─── CURVA ABC ─── */}
      {reportType === 'abc' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Curva ABC de Produtos</h3>
              <p className="text-xs text-gray-400">
                A = 80% do faturamento · B = 80–95% · C = 95–100%
                {abcReport?.summary?.classes && (
                  <span className="ml-2">
                    ({abcReport.summary.classes.A||0} A · {abcReport.summary.classes.B||0} B · {abcReport.summary.classes.C||0} C)
                  </span>
                )}
              </p>
            </div>
            <ExportButtons onPDF={() => exportABC('pdf')} onCSV={() => exportABC('csv')}/>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
                <tr>
                  <th className="text-left px-4 py-2 w-16">Classe</th>
                  <th className="text-left px-4 py-2">Produto</th>
                  <th className="text-right px-4 py-2">Qtd</th>
                  <th className="text-right px-4 py-2">Faturamento</th>
                  <th className="text-right px-4 py-2">Part.</th>
                  <th className="text-right px-4 py-2">Acum.</th>
                  <th className="text-right px-4 py-2">Margem</th>
                </tr>
              </thead>
              <tbody>
                {(abcReport?.data||[]).map(p => (
                  <tr key={p.product_id} className="border-t border-gray-50">
                    <td className="px-4 py-2">
                      <span className={`badge text-xs font-bold ${
                        p.abc==='A'?'bg-green-100 text-green-700':p.abc==='B'?'bg-amber-100 text-amber-700':'bg-gray-100 text-gray-500'
                      }`}>{p.abc}</span>
                    </td>
                    <td className="px-4 py-2"><span className="font-medium">{p.name}</span> <span className="text-xs text-gray-400">{p.code}</span></td>
                    <td className="px-4 py-2 text-right text-gray-600">{Number(p.qty).toLocaleString('pt-BR')}</td>
                    <td className="px-4 py-2 text-right font-semibold">{fmt(p.revenue)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{p.share}%</td>
                    <td className="px-4 py-2 text-right text-gray-500">{p.cumulative}%</td>
                    <td className={`px-4 py-2 text-right font-medium ${p.margin >= 0 ? 'text-blue-600' : 'text-red-600'}`}>{p.margin}%</td>
                  </tr>
                ))}
                {!abcReport?.data?.length && <tr><td colSpan={7} className="text-center py-8 text-gray-400 text-sm">Nenhuma venda no período</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── COMISSÕES ─── */}
      {reportType === 'commissions' && (
        <div className="card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold">Comissões de Vendedores</h3>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">Taxa</span>
                <input type="number" min="0" step="0.5" value={commRate}
                  onChange={e => setCommRate(Number(e.target.value) || 0)}
                  className="input w-20 text-sm py-1" />
                <span className="text-xs text-gray-500">%</span>
              </div>
            </div>
            <ExportButtons onPDF={() => exportCommissions('pdf')} onCSV={() => exportCommissions('csv')}/>
          </div>
          {commReport?.summary && (
            <div className="px-6 py-3 bg-gray-50 border-b border-gray-100 flex gap-6 text-sm">
              <span className="text-gray-500">Total vendido: <strong className="text-gray-800">{fmt(commReport.summary.total_sold)}</strong></span>
              <span className="text-gray-500">Total comissões: <strong className="text-green-700">{fmt(commReport.summary.total_commission)}</strong></span>
            </div>
          )}
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-6 py-2">Vendedor</th>
                <th className="text-right px-6 py-2">Vendas</th>
                <th className="text-right px-6 py-2">Total Vendido</th>
                <th className="text-right px-6 py-2">Comissão ({commReport?.rate}%)</th>
              </tr>
            </thead>
            <tbody>
              {(commReport?.data||[]).map((v,i) => (
                <tr key={v.user_id || i} className="border-t border-gray-50">
                  <td className="px-6 py-3 font-medium">{v.name}</td>
                  <td className="px-6 py-3 text-right text-gray-600">{v.sales_count}</td>
                  <td className="px-6 py-3 text-right font-semibold">{fmt(v.total)}</td>
                  <td className="px-6 py-3 text-right font-bold text-green-700">{fmt(v.commission)}</td>
                </tr>
              ))}
              {!commReport?.data?.length && <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-sm">Nenhuma venda no período</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* ─── TOP CLIENTES ─── */}
      {reportType === 'customers' && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="font-semibold">Clientes que Mais Compraram</h3>
            <ExportButtons onPDF={() => exportCustomers('pdf')} onCSV={() => exportCustomers('csv')}/>
          </div>
          <div className="divide-y divide-gray-50">
            {(topCustomers||[]).map((c,i) => (
              <div key={i} className="px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center text-sm font-bold text-primary-700">{i+1}</div>
                  <div>
                    <p className="font-medium">{c.customer?.name}</p>
                    <p className="text-xs text-gray-400">{c.count} pedido{c.count!==1?'s':''}</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900">{fmt(c.total)}</p>
              </div>
            ))}
            {!topCustomers?.length && <p className="text-sm text-gray-400 text-center py-8">Nenhum dado</p>}
          </div>
        </div>
      )}

      {/* ─── ORÇAMENTOS ─── */}
      {reportType === 'quotes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {Object.entries(quotesReport?.summary?.by_status||{}).map(([status,count]) => (
              <div key={status} className="card p-4 text-center">
                <p className="text-2xl font-bold">{count}</p>
                <p className="text-xs text-gray-500 mt-1">{STATUS_LABELS[status]||status}</p>
              </div>
            ))}
          </div>
          <div className="card overflow-x-auto">
            <div className="card-header flex items-center justify-between">
              <div>
                <h3 className="font-semibold">Orçamentos</h3>
                <p className="text-xs text-gray-400">{quotesReport?.summary?.total_count||0} · {fmt(quotesReport?.summary?.total_value)}</p>
              </div>
              <ExportButtons onPDF={() => exportQuotes('pdf')} onCSV={() => exportQuotes('csv')}/>
            </div>
            <table className="table-auto">
              <thead>
                <tr><th>#</th><th>Data</th><th>Cliente</th><th>Status</th><th>Validade</th><th className="text-right">Total</th></tr>
              </thead>
              <tbody>
                {(quotesReport?.data||[]).map(q => (
                  <tr key={q.id}>
                    <td className="font-mono">#{String(q.number).padStart(4,'0')}</td>
                    <td>{q.created_at?.split('T')[0]}</td>
                    <td>{q.CLIENTES?.name||'—'}</td>
                    <td><span className="badge badge-gray text-xs">{STATUS_LABELS[q.status]||q.status}</span></td>
                    <td className="text-sm text-gray-500">{q.valid_until||'—'}</td>
                    <td className="text-right font-semibold">{fmt(q.total)}</td>
                  </tr>
                ))}
                {!quotesReport?.data?.length && (
                  <tr><td colSpan={6} className="text-center py-6 text-gray-400">Nenhum orçamento no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── FLUXO DE CAIXA ─── */}
      {reportType === 'cashflow' && (
        <div className="space-y-4">
          {cashflowData?.summary && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="card p-5 border-l-4 border-green-500">
                <p className="text-xs text-gray-500 uppercase">A Receber</p>
                <p className="text-2xl font-bold text-green-600 mt-1">{fmt(cashflowData.summary.total_receivable)}</p>
              </div>
              <div className="card p-5 border-l-4 border-red-500">
                <p className="text-xs text-gray-500 uppercase">A Pagar</p>
                <p className="text-2xl font-bold text-red-600 mt-1">{fmt(cashflowData.summary.total_payable)}</p>
              </div>
              <div className={`card p-5 border-l-4 ${cashflowData.summary.net>=0?'border-blue-500':'border-orange-500'}`}>
                <p className="text-xs text-gray-500 uppercase">Saldo Líquido</p>
                <p className={`text-2xl font-bold mt-1 ${cashflowData.summary.net>=0?'text-blue-600':'text-orange-600'}`}>
                  {fmt(cashflowData.summary.net)}
                </p>
              </div>
            </div>
          )}
          <div className="card overflow-x-auto">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold">Lançamentos por Data</h3>
              <ExportButtons onPDF={() => exportCashflow('pdf')} onCSV={() => exportCashflow('csv')}/>
            </div>
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
                {(cashflowData?.rows||[]).map((row,i) => (
                  <tr key={i} className={row.balance<0?'bg-red-50/40':''}>
                    <td className="font-mono text-sm">{row.date}</td>
                    <td className="text-right text-green-700 font-medium">{row.receivable>0?fmt(row.receivable):'—'}</td>
                    <td className="text-right text-red-600 font-medium">{row.payable>0?fmt(row.payable):'—'}</td>
                    <td className={`text-right font-bold ${row.balance>=0?'text-gray-900':'text-red-600'}`}>{fmt(row.balance)}</td>
                  </tr>
                ))}
                {!cashflowData?.rows?.length && (
                  <tr><td colSpan={4} className="text-center py-6 text-gray-400">Nenhum lançamento no período</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── ESTOQUE ─── */}
      {reportType === 'stock' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="card p-4 text-center"><p className="text-2xl font-bold">{stockReport?.summary?.total_products||0}</p><p className="text-xs text-gray-500 mt-1">Produtos ativos</p></div>
            <div className="card p-4 text-center"><p className="text-2xl font-bold text-red-600">{stockReport?.summary?.below_min_stock||0}</p><p className="text-xs text-gray-500 mt-1">Abaixo do mínimo</p></div>
            <div className="card p-4 text-center"><p className="text-lg font-bold">{fmt(stockReport?.summary?.total_cost_value)}</p><p className="text-xs text-gray-500 mt-1">Valor de custo</p></div>
            <div className="card p-4 text-center"><p className="text-lg font-bold text-green-700">{fmt(stockReport?.summary?.total_sale_value)}</p><p className="text-xs text-gray-500 mt-1">Valor de venda</p></div>
          </div>
          <div className="card overflow-x-auto">
            <div className="card-header flex items-center justify-between">
              <h3 className="font-semibold">Posição de Estoque</h3>
              <ExportButtons onPDF={() => exportStock('pdf')} onCSV={() => exportStock('csv')}/>
            </div>
            <table className="table-auto">
              <thead>
                <tr><th>Código</th><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th className="text-right">Valor Total</th></tr>
              </thead>
              <tbody>
                {(stockReport?.data||[]).map(p => (
                  <tr key={p.id} className={p.current_stock<=p.min_stock?'bg-red-50':''}>
                    <td className="font-mono text-xs">{p.code}</td>
                    <td>{p.name}</td>
                    <td>{p.CATEGORIAS?.name||'—'}</td>
                    <td className={p.current_stock<=p.min_stock?'text-red-600 font-bold':'font-semibold'}>{p.current_stock} {p.unit}</td>
                    <td className="text-gray-500">{p.min_stock} {p.unit}</td>
                    <td className="text-right">{fmt(p.current_stock*p.cost_price)}</td>
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
