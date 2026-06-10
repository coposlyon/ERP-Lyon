import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import api from '@/lib/api';
import StatCard from '@/components/UI/StatCard';
import { ShoppingCart, DollarSign, Clock, AlertTriangle, ClipboardList, Palette, TrendingDown } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

const statusLabels = {
  open: 'Aberto', confirmed: 'Confirmado', in_production: 'Em Produção',
  ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelado',
};

const statusClass = {
  open: 'status-open', confirmed: 'status-confirmed', in_production: 'status-in_production',
  ready: 'status-ready', delivered: 'status-delivered', cancelled: 'status-cancelled',
};

const customizationSteps = [
  { key: 'briefing', label: 'Briefing', color: 'bg-gray-400' },
  { key: 'design', label: 'Design', color: 'bg-blue-400' },
  { key: 'approval', label: 'Aprovação', color: 'bg-yellow-400' },
  { key: 'printing', label: 'Impressão', color: 'bg-orange-400' },
  { key: 'finishing', label: 'Acabamento', color: 'bg-purple-400' },
  { key: 'ready', label: 'Pronto', color: 'bg-green-500' },
];

function fmt(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60000,
  });

  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart'],
    queryFn: () => api.get('/dashboard/sales-chart?days=30'),
  });

  const kpis = dashboard?.kpis || {};
  const recentSales = dashboard?.recent_sales || [];
  const customByStatus = kpis.customizations_by_status || {};
  const totalCustom = kpis.active_customizations || 0;

  const chartConfig = {
    labels: (chartData?.labels || []).map(d => {
      try { return format(parseISO(d), 'dd/MM', { locale: ptBR }); } catch { return d; }
    }),
    datasets: [{
      label: 'Vendas (R$)',
      data: chartData?.values || [],
      fill: true,
      borderColor: '#6366f1',
      backgroundColor: 'rgba(99,102,241,0.08)',
      tension: 0.4,
      pointRadius: 3,
    }],
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { callbacks: {
      label: ctx => fmt(ctx.raw),
    }}},
    scales: {
      y: { ticks: { callback: v => 'R$ ' + v.toLocaleString('pt-BR') }, grid: { color: '#f3f4f6' } },
      x: { grid: { display: false } },
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Dashboard</h1>
        <p className="text-gray-500 text-sm mt-1">
          {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* KPI Cards — Linha 1: Vendas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Vendas Hoje"
          value={fmt(kpis.sales_today)}
          icon={ShoppingCart}
          color="blue"
          subtitle="Total faturado hoje"
        />
        <StatCard
          title="Vendas no Mês"
          value={fmt(kpis.sales_month)}
          icon={DollarSign}
          color="green"
          subtitle="Acumulado do mês"
        />
        <StatCard
          title="Pedidos Abertos"
          value={kpis.pending_orders || 0}
          icon={Clock}
          color="orange"
          subtitle="Aguardando ação"
        />
        <StatCard
          title="A Receber"
          value={fmt(kpis.receivables_pending)}
          icon={AlertTriangle}
          color="purple"
          subtitle="Contas pendentes"
        />
      </div>

      {/* KPI Cards — Linha 2: Novos módulos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          onClick={() => navigate('/quotes')}
          className="card p-5 text-left hover:shadow-md transition-shadow cursor-pointer"
        >
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

        <button
          onClick={() => navigate('/customizations')}
          className="card p-5 text-left hover:shadow-md transition-shadow cursor-pointer"
        >
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

        <button
          onClick={() => navigate('/financial')}
          className="card p-5 text-left hover:shadow-md transition-shadow cursor-pointer"
        >
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

      {/* Chart + Recent Sales */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Sales Chart */}
        <div className="xl:col-span-2 card">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Vendas — Últimos 30 dias</h2>
          </div>
          <div className="card-body" style={{ height: 240 }}>
            {chartData?.labels?.length > 0 ? (
              <Line data={chartConfig} options={chartOptions} />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                Nenhuma venda nos últimos 30 dias
              </div>
            )}
          </div>
        </div>

        {/* Recent Sales */}
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
                      {sale.customers?.name || 'Consumidor Final'}
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

      {/* Personalizações por status */}
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
              const pct = totalCustom > 0 ? Math.round((count / totalCustom) * 100) : 0;
              return (
                <div key={step.key} className="text-center">
                  <div className="text-2xl font-bold text-gray-900">{count}</div>
                  <div className={`h-2 rounded-full mt-1 mb-1 ${step.color} opacity-${count > 0 ? '100' : '30'}`}
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
