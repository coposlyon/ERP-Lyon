import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import api from '@/lib/api';
import StatCard from '@/components/UI/StatCard';
import {
  ShoppingCart, DollarSign, Clock, AlertTriangle,
  ClipboardList, Palette, TrendingDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
);

// ─── Constantes de calendário ────────────────────────────────────────────────
const MONTHS_LONG  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

// ─── Paleta de cores por ano ─────────────────────────────────────────────────
const YEAR_PALETTE = [
  { bar: 'rgba(99,102,241,0.75)',  border: '#6366f1' },  // indigo
  { bar: 'rgba(34,197,94,0.75)',   border: '#16a34a' },  // green
  { bar: 'rgba(249,115,22,0.75)',  border: '#ea580c' },  // orange
  { bar: 'rgba(236,72,153,0.75)',  border: '#db2777' },  // pink
  { bar: 'rgba(6,182,212,0.75)',   border: '#0891b2' },  // cyan
];

function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function fmtK(v) {
  if (v >= 1000000) return 'R$' + (v / 1000000).toFixed(1) + 'M';
  if (v >= 1000)    return 'R$' + (v / 1000).toFixed(0) + 'k';
  return 'R$' + Math.round(v);
}

const statusLabels = {
  open: 'Aberto', confirmed: 'Confirmado', in_production: 'Em Produção',
  ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};
const statusClass = {
  open: 'status-open', confirmed: 'status-confirmed', in_production: 'status-in_production',
  ready: 'status-ready', delivered: 'status-delivered', cancelled: 'status-cancelled',
};
const customizationSteps = [
  { key: 'briefing',  label: 'Briefing',    color: 'bg-gray-400'   },
  { key: 'design',    label: 'Design',      color: 'bg-blue-400'   },
  { key: 'approval',  label: 'Aprovação',   color: 'bg-yellow-400' },
  { key: 'printing',  label: 'Impressão',   color: 'bg-orange-400' },
  { key: 'finishing', label: 'Acabamento',  color: 'bg-purple-400' },
  { key: 'ready',     label: 'Pronto',      color: 'bg-green-500'  },
];

// ─────────────────────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate   = useNavigate();
  const now        = new Date();
  const currentYear = now.getFullYear();

  // ── Seletor mês/ano do gráfico principal ──────────────────────
  const [selMonth, setSelMonth] = useState(now.getMonth() + 1); // 1-12
  const [selYear,  setSelYear]  = useState(currentYear);

  // Opções de ano: 3 atrás até próximo
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 3 + i);

  const isCurrentPeriod = selMonth === now.getMonth() + 1 && selYear === currentYear;

  function prevMonth() {
    if (selMonth === 1) { setSelMonth(12); setSelYear(y => y - 1); }
    else setSelMonth(m => m - 1);
  }
  function nextMonth() {
    if (selMonth === 12) { setSelMonth(1); setSelYear(y => y + 1); }
    else setSelMonth(m => m + 1);
  }

  // ── Seleção de anos no comparativo ────────────────────────────
  const [activeYears, setActiveYears] = useState([currentYear - 1, currentYear]);

  function toggleYear(y) {
    setActiveYears(prev =>
      prev.includes(y)
        ? prev.length > 1 ? prev.filter(x => x !== y) : prev
        : [...prev, y].sort()
    );
  }

  // ── Queries ───────────────────────────────────────────────────
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60000,
  });

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart', selMonth, selYear],
    queryFn:  () => api.get(`/dashboard/sales-chart?month=${selMonth}&year=${selYear}`),
  });

  const { data: yearCompData } = useQuery({
    queryKey: ['dashboard-year-comparison'],
    queryFn:  () => api.get('/dashboard/year-comparison'),
  });

  // ── KPIs ──────────────────────────────────────────────────────
  const kpis         = dashboard?.kpis || {};
  const recentSales  = dashboard?.recent_sales || [];
  const customByStatus = kpis.customizations_by_status || {};
  const totalCustom  = kpis.active_customizations || 0;

  // ── Gráfico principal: preenche todos os dias do mês (com 0) ──
  const totalDaysInMonth = new Date(selYear, selMonth, 0).getDate();
  const allDates = useMemo(() =>
    Array.from({ length: totalDaysInMonth }, (_, i) => {
      const d = i + 1;
      return `${selYear}-${String(selMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }),
    [selMonth, selYear, totalDaysInMonth]
  );

  const chartLabels = allDates.map(d => d.slice(8)); // "01", "02", ...
  const chartValues = useMemo(() =>
    allDates.map(d => {
      const idx = (chartData?.labels || []).indexOf(d);
      return idx >= 0 ? (chartData.values[idx] || 0) : 0;
    }),
    [allDates, chartData]
  );
  const monthTotal = chartData?.total || 0;
  const hasData    = chartValues.some(v => v > 0);

  const mainChartConfig = {
    labels: chartLabels,
    datasets: [{
      label: 'Vendas (R$)',
      data: chartValues,
      fill: true,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.07)',
      tension: 0.4,
      pointRadius: hasData ? 2 : 0,
      pointHoverRadius: 5,
    }],
  };
  const mainChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: v => fmtK(v), font: { size: 10 } },
        grid: { color: '#f3f4f6' },
      },
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  // ── Gráfico comparativo ───────────────────────────────────────
  const yearRows      = yearCompData?.data || [];
  const allYearNums   = yearRows.map(r => r.year);
  const filteredRows  = yearRows.filter(r => activeYears.includes(r.year));

  const compareConfig = {
    labels: MONTHS_SHORT,
    datasets: filteredRows.map((row, i) => {
      const p = YEAR_PALETTE[i % YEAR_PALETTE.length];
      return {
        label: String(row.year),
        data: row.months,
        backgroundColor: p.bar,
        borderColor: p.border,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      };
    }),
  };
  const compareOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top', labels: { boxWidth: 12, padding: 16, font: { size: 11 } } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: v => fmtK(v), font: { size: 10 } },
        grid: { color: '#f3f4f6' },
      },
      x: { grid: { display: false } },
    },
  };

  // ── Loading ───────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* ── KPIs linha 1 ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard title="Vendas Hoje"     value={fmt(kpis.sales_today)}       icon={ShoppingCart} color="blue"   subtitle="Total faturado hoje"    />
        <StatCard title="Vendas no Mês"   value={fmt(kpis.sales_month)}        icon={DollarSign}   color="green"  subtitle="Acumulado do mês"       />
        <StatCard title="Pedidos Abertos" value={kpis.pending_orders || 0}     icon={Clock}        color="orange" subtitle="Aguardando ação"        />
        <StatCard title="A Receber"       value={fmt(kpis.receivables_pending)} icon={AlertTriangle} color="purple" subtitle="Contas pendentes"       />
      </div>

      {/* ── KPIs linha 2 ──────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button onClick={() => navigate('/quotes')}
          className="card p-5 text-left hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Orçamentos Abertos</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{kpis.open_quotes_count || 0}</p>
              <p className="text-sm text-gray-500 mt-0.5">{fmt(kpis.open_quotes_value)}</p>
            </div>
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center">
              <ClipboardList size={22} className="text-indigo-600" />
            </div>
          </div>
        </button>

        <button onClick={() => navigate('/customizations')}
          className="card p-5 text-left hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Personalizações Ativas</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{totalCustom}</p>
              <p className="text-sm text-gray-500 mt-0.5">em produção/andamento</p>
            </div>
            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
              <Palette size={22} className="text-purple-600" />
            </div>
          </div>
        </button>

        <button onClick={() => navigate('/financial')}
          className="card p-5 text-left hover:shadow-md transition-shadow cursor-pointer">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contas Vencidas</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{fmt(kpis.overdue_payables)}</p>
              <p className="text-sm text-gray-500 mt-0.5">a pagar em atraso</p>
            </div>
            <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center">
              <TrendingDown size={22} className="text-red-500" />
            </div>
          </div>
        </button>
      </div>

      {/* ── Gráfico principal + Últimos pedidos ───────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Gráfico diário com seletor mês/ano */}
        <div className="xl:col-span-2 card">
          <div className="card-header flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2 className="font-semibold text-gray-900">
                Vendas — {MONTHS_LONG[selMonth - 1]} {selYear}
              </h2>
              {monthTotal > 0 && (
                <p className="text-sm text-green-600 font-semibold mt-0.5">
                  Total: {fmt(monthTotal)}
                </p>
              )}
            </div>

            {/* Controles de navegação */}
            <div className="flex items-center gap-2">
              <button onClick={prevMonth}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                <ChevronLeft size={15} />
              </button>

              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))}
                className="input py-1.5 text-sm w-auto">
                {MONTHS_LONG.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>

              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))}
                className="input py-1.5 text-sm w-auto">
                {yearOptions.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>

              <button onClick={nextMonth}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-500 transition-colors">
                <ChevronRight size={15} />
              </button>

              {!isCurrentPeriod && (
                <button
                  onClick={() => { setSelMonth(now.getMonth() + 1); setSelYear(currentYear); }}
                  className="text-xs text-primary-600 hover:underline font-medium whitespace-nowrap px-1">
                  Hoje
                </button>
              )}
            </div>
          </div>

          <div className="card-body" style={{ height: 240 }}>
            {hasData ? (
              <Line data={mainChartConfig} options={mainChartOptions} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-1">
                <ShoppingCart size={32} className="opacity-20" />
                <p>Nenhuma venda em {MONTHS_LONG[selMonth - 1]} {selYear}</p>
              </div>
            )}
          </div>
        </div>

        {/* Últimos Pedidos */}
        <div className="card">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900">Últimos Pedidos</h2>
          </div>
          <div className="divide-y divide-gray-50">
            {recentSales.length === 0 ? (
              <p className="text-sm text-gray-400 px-6 py-8 text-center">Nenhum pedido ainda</p>
            ) : recentSales.map(sale => (
              <div key={sale.id} className="px-6 py-3 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      #{String(sale.number).padStart(4, '0')}
                    </p>
                    <p className="text-xs text-gray-500 truncate max-w-[140px]">
                      {sale.CLIENTES?.name || sale.customers?.name || 'Consumidor Final'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">{fmt(sale.total)}</p>
                    <span className={`badge text-xs ${statusClass[sale.status] || 'badge-gray'}`}>
                      {statusLabels[sale.status] || sale.status}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Comparativo Anual ─────────────────────────────────── */}
      <div className="card">
        <div className="card-header flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-semibold text-gray-900">Comparativo Anual</h2>
            <p className="text-xs text-gray-400 mt-0.5">Total de vendas por mês — compare os anos</p>
          </div>

          {/* Totais + toggle de anos */}
          <div className="flex items-center gap-2 flex-wrap">
            {(allYearNums.length > 0 ? allYearNums : [currentYear - 1, currentYear]).map((y, i) => {
              const p       = YEAR_PALETTE[i % YEAR_PALETTE.length];
              const row     = yearRows.find(r => r.year === y);
              const total   = row?.total || 0;
              const isActive = activeYears.includes(y);
              return (
                <button key={y} onClick={() => toggleYear(y)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all ${
                    isActive
                      ? 'text-white border-transparent shadow-sm'
                      : 'text-gray-500 border-gray-200 bg-white hover:bg-gray-50'
                  }`}
                  style={isActive ? { background: p.border } : {}}>
                  <span>{y}</span>
                  {total > 0 && (
                    <span className={`${isActive ? 'opacity-80' : 'text-gray-400'} font-normal`}>
                      {fmt(total)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card-body" style={{ height: 280 }}>
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-400 text-sm gap-1">
              <ShoppingCart size={32} className="opacity-20" />
              <p>Nenhum dado de vendas disponível</p>
            </div>
          ) : (
            <Bar data={compareConfig} options={compareOptions} />
          )}
        </div>
      </div>

      {/* ── Pipeline de Personalização ────────────────────────── */}
      {totalCustom > 0 && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900">Pipeline de Personalização</h2>
            <button onClick={() => navigate('/customizations')} className="text-xs text-primary-600 hover:underline">
              Ver Kanban →
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {customizationSteps.map(step => {
              const count = customByStatus[step.key] || 0;
              const pct   = totalCustom > 0 ? Math.round((count / totalCustom) * 100) : 0;
              return (
                <div key={step.key} className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                  <div className={`h-2 rounded-full mt-1 mb-1 ${step.color}`}
                    style={{ opacity: count > 0 ? 1 : 0.25 }} />
                  <div className="text-xs text-gray-500">{step.label}</div>
                  {count > 0 && <div className="text-xs text-gray-400">{pct}%</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}
