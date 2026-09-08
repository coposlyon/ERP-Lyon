import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
} from 'chart.js';
import api from '@/lib/api';
import {
  ShoppingCart, DollarSign, Clock, AlertTriangle,
  ClipboardList, Palette, TrendingDown, ChevronLeft, ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import toast from 'react-hot-toast';
import { Target, Pencil, TrendingUp, Gauge } from 'lucide-react';
import { Link } from 'react-router-dom';

ChartJS.register(
  CategoryScale, LinearScale, PointElement,
  LineElement, BarElement, Title, Tooltip, Legend, Filler,
);

const MONTHS_LONG  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                      'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];

const YEAR_PALETTE = [
  { bar: 'rgba(99,102,241,0.75)',  border: '#6366f1' },
  { bar: 'rgba(34,197,94,0.75)',   border: '#16a34a' },
  { bar: 'rgba(249,115,22,0.75)',  border: '#ea580c' },
  { bar: 'rgba(236,72,153,0.75)',  border: '#db2777' },
  { bar: 'rgba(6,182,212,0.75)',   border: '#0891b2' },
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
const statusDark = {
  open:          'bg-yellow-400/15 text-yellow-300',
  confirmed:     'bg-green-400/15 text-green-300',
  in_production: 'bg-blue-400/15 text-blue-300',
  ready:         'bg-purple-400/15 text-purple-300',
  delivered:     'bg-gray-400/15 text-gray-300',
  cancelled:     'bg-red-400/15 text-red-300',
};
const statusLight = {
  open:          'bg-yellow-100 text-yellow-800',
  confirmed:     'bg-green-100 text-green-800',
  in_production: 'bg-blue-100 text-blue-800',
  ready:         'bg-purple-100 text-purple-800',
  delivered:     'bg-gray-100 text-gray-700',
  cancelled:     'bg-red-100 text-red-800',
};

const customizationSteps = [
  { key: 'briefing',  label: 'Briefing',   color: '#9ca3af' },
  { key: 'design',    label: 'Design',     color: '#60a5fa' },
  { key: 'approval',  label: 'Aprovação',  color: '#fbbf24' },
  { key: 'printing',  label: 'Impressão',  color: '#fb923c' },
  { key: 'finishing', label: 'Acabamento', color: '#c084fc' },
  { key: 'ready',     label: 'Pronto',     color: '#4ade80' },
];

// ─── KPI Card (theme-aware) ───────────────────────────────────────────────────
function KPI({ title, value, subtitle, Icon, iconBg, iconColor, onClick, red }) {
  const { isDark } = useTheme();
  const Tag = onClick ? 'button' : 'div';

  const cardStyle = isDark ? {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '0.75rem',
    padding: '1.25rem 1.5rem',
    display: 'block',
    width: '100%',
    textAlign: 'left',
  } : {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
    padding: '1.25rem 1.5rem',
    display: 'block',
    width: '100%',
    textAlign: 'left',
  };

  return (
    <Tag
      onClick={onClick}
      style={cardStyle}
      className={onClick ? 'cursor-pointer hover:brightness-95 transition-all' : ''}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-widest truncate"
            style={{ color: isDark ? 'rgba(255,255,255,0.4)' : '#9ca3af' }}>
            {title}
          </p>
          <p className={`text-2xl font-bold mt-1 ${
            red
              ? 'text-red-500'
              : isDark ? 'text-white' : 'text-gray-900'
          }`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs mt-0.5 truncate"
              style={{ color: isDark ? 'rgba(255,255,255,0.35)' : '#6b7280' }}>
              {subtitle}
            </p>
          )}
        </div>
        {Icon && (
          <div className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ml-3"
            style={{ background: iconBg }}>
            <Icon size={20} style={{ color: iconColor }} />
          </div>
        )}
      </div>
    </Tag>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
function MetaCard({ kpis }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const canEdit = ['admin', 'manager'].includes(user?.role);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState('');
  const goal = kpis.monthly_goal || 0;
  const progress = kpis.goal_progress;
  const mom = kpis.sales_mom_pct;
  const fmtBRL = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

  const saveMut = useMutation({
    mutationFn: monthly_sales => api.put('/dashboard/goal', { monthly_sales }),
    onSuccess: () => { toast.success('Meta atualizada'); setEditing(false); qc.invalidateQueries(['dashboard']); },
    onError: e => toast.error(e.error || 'Erro ao salvar meta'),
  });

  const pct = Math.min(progress || 0, 100);
  const barColor = pct >= 100 ? 'bg-green-500' : pct >= 70 ? 'bg-blue-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-400';

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-violet-500" />
          <span className="font-semibold text-gray-700 dark:text-gray-200">Meta do mês</span>
          {mom != null && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${mom >= 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <TrendingUp size={11} className="inline -mt-0.5" /> {mom >= 0 ? '+' : ''}{mom}% vs mês anterior
            </span>
          )}
        </div>
        {canEdit && !editing && (
          <button onClick={() => { setVal(goal || ''); setEditing(true); }} className="text-gray-400 hover:text-violet-600 flex items-center gap-1 text-xs font-medium">
            <Pencil size={13} /> {goal > 0 ? 'Editar' : 'Definir'} meta
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex items-center gap-2">
          <span className="text-gray-400">R$</span>
          <input type="number" min="0" className="input flex-1" value={val} onChange={e => setVal(e.target.value)} placeholder="Meta de vendas do mês" autoFocus />
          <button onClick={() => saveMut.mutate(Number(val) || 0)} disabled={saveMut.isPending} className="btn-primary btn-sm">Salvar</button>
          <button onClick={() => setEditing(false)} className="btn-secondary btn-sm">Cancelar</button>
        </div>
      ) : goal > 0 ? (
        <>
          <div className="flex items-end justify-between mb-1.5">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">{fmtBRL(kpis.sales_month)}</span>
            <span className="text-sm text-gray-400">de {fmtBRL(goal)}</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div className={`h-full ${barColor} transition-all duration-500`} style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {progress >= 100 ? '🎉 Meta batida!' : `${progress}% da meta · faltam ${fmtBRL(Math.max(0, goal - (kpis.sales_month || 0)))}`}
          </p>
        </>
      ) : (
        <p className="text-sm text-gray-400">Defina uma meta de vendas para acompanhar o progresso do mês em tempo real.</p>
      )}
    </div>
  );
}

export default function Dashboard() {
  const navigate    = useNavigate();
  const { isDark }  = useTheme();
  const now         = new Date();
  const currentYear = now.getFullYear();

  const [selMonth, setSelMonth] = useState(now.getMonth() + 1);
  const [selYear,  setSelYear]  = useState(currentYear);
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

  const [activeYears, setActiveYears] = useState([currentYear - 1, currentYear]);
  function toggleYear(y) {
    setActiveYears(prev =>
      prev.includes(y)
        ? prev.length > 1 ? prev.filter(x => x !== y) : prev
        : [...prev, y].sort()
    );
  }

  const { data: dashboard, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => api.get('/dashboard'),
    refetchInterval: 60000,
  });
  const { data: chartData } = useQuery({
    queryKey: ['dashboard-chart', selMonth, selYear],
    queryFn: () => api.get(`/dashboard/sales-chart?month=${selMonth}&year=${selYear}`),
  });
  const { data: yearCompData } = useQuery({
    queryKey: ['dashboard-year-comparison'],
    queryFn: () => api.get('/dashboard/year-comparison'),
  });

  const kpis           = dashboard?.kpis || {};
  const recentSales    = dashboard?.recent_sales || [];
  const customByStatus = kpis.customizations_by_status || {};
  const totalCustom    = kpis.active_customizations || 0;

  const totalDaysInMonth = new Date(selYear, selMonth, 0).getDate();
  const allDates = useMemo(() =>
    Array.from({ length: totalDaysInMonth }, (_, i) => {
      const d = i + 1;
      return `${selYear}-${String(selMonth).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    }),
    [selMonth, selYear, totalDaysInMonth]
  );
  const chartLabels = allDates.map(d => d.slice(8));
  const chartValues = useMemo(() =>
    allDates.map(d => {
      const idx = (chartData?.labels || []).indexOf(d);
      return idx >= 0 ? (chartData.values[idx] || 0) : 0;
    }),
    [allDates, chartData]
  );
  const monthTotal = chartData?.total || 0;
  const hasData    = chartValues.some(v => v > 0);

  // ── Estilos dependentes do tema ────────────────────────────────────────────
  const cardStyle = isDark ? {
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: '0.75rem',
  } : {
    background: '#ffffff',
    border: '1px solid #e5e7eb',
    borderRadius: '0.75rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  };

  const dividerColor    = isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6';
  const textPrimary     = isDark ? 'text-white'    : 'text-gray-900';
  const textSecondary   = isDark ? 'rgba(255,255,255,0.4)'  : '#6b7280';
  const textSubtle      = isDark ? 'rgba(255,255,255,0.35)' : '#9ca3af';
  const emptyColor      = isDark ? 'rgba(255,255,255,0.25)' : '#d1d5db';
  const statusMap       = isDark ? statusDark : statusLight;

  const ctrlBtn = {
    padding: '0.375rem',
    borderRadius: '0.5rem',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.12)' : '#e5e7eb'}`,
    color: isDark ? 'rgba(255,255,255,0.5)' : '#6b7280',
    background: 'transparent',
    cursor: 'pointer',
    transition: 'all 0.15s',
  };

  const selectStyle = {
    background: isDark ? 'rgba(255,255,255,0.07)' : '#f9fafb',
    border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
    color: isDark ? 'white' : '#111827',
    borderRadius: '0.5rem',
    padding: '0.375rem 0.5rem',
    fontSize: '0.875rem',
    outline: 'none',
    cursor: 'pointer',
  };

  const tickColor  = isDark ? 'rgba(255,255,255,0.4)' : '#9ca3af';
  const gridColor  = isDark ? 'rgba(255,255,255,0.06)' : '#f3f4f6';
  const legendColor = isDark ? 'rgba(255,255,255,0.6)' : '#6b7280';

  const tooltipPlugin = (labelCb) => ({
    backgroundColor: isDark ? 'rgba(10,10,10,0.92)' : '#ffffff',
    titleColor: isDark ? 'rgba(255,255,255,0.9)' : '#111827',
    bodyColor:  isDark ? 'rgba(255,255,255,0.65)' : '#6b7280',
    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb',
    borderWidth: 1,
    padding: 10,
    ...(labelCb ? { callbacks: { label: labelCb } } : {}),
  });

  const scales = (yCallback) => ({
    y: {
      beginAtZero: true,
      ticks: { callback: yCallback || (v => v), font: { size: 10 }, color: tickColor },
      grid: { color: gridColor },
      border: { color: 'transparent' },
    },
    x: {
      grid: { display: false },
      ticks: { font: { size: 10 }, color: tickColor },
      border: { color: 'transparent' },
    },
  });

  // ── Chart configs ──────────────────────────────────────────────────────────
  const mainChartConfig = {
    labels: chartLabels,
    datasets: [{
      label: 'Vendas (R$)',
      data: chartValues,
      fill: true,
      borderColor: '#E8187A',
      backgroundColor: 'rgba(232,24,122,0.07)',
      tension: 0.4,
      pointRadius: hasData ? 2 : 0,
      pointHoverRadius: 5,
    }],
  };
  const mainChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: tooltipPlugin(ctx => fmt(ctx.raw)) },
    scales: scales(v => fmtK(v)),
  };

  const yearRows     = yearCompData?.data || [];
  const allYearNums  = yearRows.map(r => r.year);
  const filteredRows = yearRows.filter(r => activeYears.includes(r.year));

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
      legend: {
        position: 'top',
        labels: { boxWidth: 12, padding: 16, font: { size: 11 }, color: legendColor },
      },
      tooltip: tooltipPlugin(ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}`),
    },
    scales: scales(v => fmtK(v)),
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">

      {/* ── Cabeçalho ──────────────────────────────────────────────────────── */}
      <div>
        <h1 className={`text-2xl font-bold ${textPrimary}`}>Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: textSubtle }}>
          {format(new Date(), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}
        </p>
      </div>

      {/* ── KPIs linha 1 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPI title="Vendas Hoje"     value={fmt(kpis.sales_today)}         subtitle="Total faturado hoje"
          Icon={ShoppingCart} iconBg="rgba(232,24,122,0.15)"  iconColor="#E8187A" />
        <KPI title="Vendas no Mês"   value={fmt(kpis.sales_month)}         subtitle="Acumulado do mês"
          Icon={DollarSign}   iconBg="rgba(0,180,216,0.15)"   iconColor="#00B4D8" />
        <KPI title="Pedidos Abertos" value={kpis.pending_orders || 0}      subtitle="Aguardando ação"
          Icon={Clock}        iconBg="rgba(245,196,0,0.15)"   iconColor="#F5C400" />
        <KPI title="A Receber"       value={fmt(kpis.receivables_pending)} subtitle="Contas pendentes"
          Icon={AlertTriangle} iconBg="rgba(123,47,190,0.15)" iconColor="#7B2FBE" />
      </div>

      {/* ── Meta do mês ────────────────────────────────────────────────────── */}
      <MetaCard kpis={kpis} />

      {/* ── Teto de faturamento ────────────────────────────────────────────
          Ao lado da meta de propósito: uma diz quanto falta para bater o
          mês, a outra quanto falta para o CNPJ estourar o ano. São as
          duas metades da mesma pergunta, e olhar só a primeira é como se
          vender mais não tivesse teto. */}
      <TetoCard />

      {/* ── KPIs linha 2 ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KPI title="Orçamentos Abertos"     value={kpis.open_quotes_count || 0}
          subtitle={fmt(kpis.open_quotes_value)}
          Icon={ClipboardList} iconBg="rgba(99,102,241,0.15)" iconColor="#818cf8"
          onClick={() => navigate('/quotes')} />
        <KPI title="Personalizações Ativas" value={totalCustom} subtitle="em produção/andamento"
          Icon={Palette} iconBg="rgba(123,47,190,0.15)" iconColor="#c084fc"
          onClick={() => navigate('/customizations')} />
        <KPI title="Contas Vencidas"        value={fmt(kpis.overdue_payables)} subtitle="a pagar em atraso"
          Icon={TrendingDown} iconBg="rgba(239,68,68,0.15)" iconColor="#f87171"
          onClick={() => navigate('/financial')} red />
      </div>

      {/* ── Gráfico principal + Últimos pedidos ────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">

        {/* Gráfico diário */}
        <div className="xl:col-span-2" style={cardStyle}>
          <div className="flex items-center justify-between flex-wrap gap-3"
            style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${dividerColor}` }}>
            <div>
              <h2 className={`font-semibold text-sm ${textPrimary}`}>
                Vendas — {MONTHS_LONG[selMonth - 1]} {selYear}
              </h2>
              {monthTotal > 0 && (
                <p className="text-sm font-semibold mt-0.5" style={{ color: '#4ade80' }}>
                  Total: {fmt(monthTotal)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={prevMonth} style={ctrlBtn}><ChevronLeft size={15} /></button>
              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} style={selectStyle}>
                {MONTHS_LONG.map((m, i) => (
                  <option key={i} value={i + 1}>{m}</option>
                ))}
              </select>
              <select value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={selectStyle}>
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={nextMonth} style={ctrlBtn}><ChevronRight size={15} /></button>
              {!isCurrentPeriod && (
                <button onClick={() => { setSelMonth(now.getMonth() + 1); setSelYear(currentYear); }}
                  className="text-xs font-medium px-1 hover:underline"
                  style={{ color: '#E8187A', background: 'none', border: 'none', cursor: 'pointer' }}>
                  Hoje
                </button>
              )}
            </div>
          </div>
          <div style={{ padding: '1rem 1.5rem', height: 240 }}>
            {hasData ? (
              <Line data={mainChartConfig} options={mainChartOptions} />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-2"
                style={{ color: emptyColor }}>
                <ShoppingCart size={32} style={{ opacity: 0.4 }} />
                <p className="text-sm">Nenhuma venda em {MONTHS_LONG[selMonth - 1]} {selYear}</p>
              </div>
            )}
          </div>
        </div>

        {/* Últimos Pedidos */}
        <div style={cardStyle}>
          <div style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${dividerColor}` }}>
            <h2 className={`font-semibold text-sm ${textPrimary}`}>Últimos Pedidos</h2>
          </div>
          {recentSales.length === 0 ? (
            <p className="text-sm px-6 py-8 text-center" style={{ color: emptyColor }}>
              Nenhum pedido ainda
            </p>
          ) : recentSales.map(sale => (
            <div key={sale.id} className="px-5 py-3 transition-colors"
              style={{ borderBottom: `1px solid ${dividerColor}` }}>
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className={`text-sm font-medium ${textPrimary}`}>
                    #{String(sale.number).padStart(4, '0')}
                  </p>
                  <p className="text-xs truncate max-w-[130px]" style={{ color: textSecondary }}>
                    {sale.CLIENTES?.name || sale.customers?.name || 'Consumidor Final'}
                  </p>
                </div>
                <div className="text-right ml-2">
                  <p className={`text-sm font-semibold ${textPrimary}`}>{fmt(sale.total)}</p>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ${statusMap[sale.status] || (isDark ? 'bg-gray-400/15 text-gray-300' : 'bg-gray-100 text-gray-700')}`}>
                    {statusLabels[sale.status] || sale.status}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Comparativo Anual ───────────────────────────────────────────────── */}
      <div style={cardStyle}>
        <div className="flex items-center justify-between flex-wrap gap-3"
          style={{ padding: '1rem 1.5rem', borderBottom: `1px solid ${dividerColor}` }}>
          <div>
            <h2 className={`font-semibold text-sm ${textPrimary}`}>Comparativo Anual</h2>
            <p className="text-xs mt-0.5" style={{ color: textSubtle }}>
              Total de vendas por mês — compare os anos
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(allYearNums.length > 0 ? allYearNums : [currentYear - 1, currentYear]).map((y, i) => {
              const p       = YEAR_PALETTE[i % YEAR_PALETTE.length];
              const row     = yearRows.find(r => r.year === y);
              const total   = row?.total || 0;
              const isActive = activeYears.includes(y);
              return (
                <button key={y} onClick={() => toggleYear(y)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all"
                  style={isActive
                    ? { background: p.border, color: 'white' }
                    : { background: isDark ? 'rgba(255,255,255,0.06)' : '#f9fafb',
                        border: `1px solid ${isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'}`,
                        color: isDark ? 'rgba(255,255,255,0.5)' : '#6b7280' }
                  }>
                  <span>{y}</span>
                  {total > 0 && (
                    <span style={{ opacity: isActive ? 0.8 : 0.6 }} className="font-normal">
                      {fmtK(total)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: '1rem 1.5rem', height: 280 }}>
          {filteredRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-2"
              style={{ color: emptyColor }}>
              <ShoppingCart size={32} style={{ opacity: 0.4 }} />
              <p className="text-sm">Nenhum dado de vendas disponível</p>
            </div>
          ) : (
            <Bar data={compareConfig} options={compareOptions} />
          )}
        </div>
      </div>

      {/* ── Pipeline de Personalização ──────────────────────────────────────── */}
      {totalCustom > 0 && (
        <div style={{ ...cardStyle, padding: '1.25rem 1.5rem' }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className={`font-semibold text-sm ${textPrimary}`}>Pipeline de Personalização</h2>
            <button onClick={() => navigate('/customizations')}
              className="text-xs hover:underline"
              style={{ color: '#E8187A', background: 'none', border: 'none', cursor: 'pointer' }}>
              Ver Kanban →
            </button>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
            {customizationSteps.map(step => {
              const count = customByStatus[step.key] || 0;
              const pct   = totalCustom > 0 ? Math.round((count / totalCustom) * 100) : 0;
              return (
                <div key={step.key} className="text-center">
                  <div className={`text-2xl font-bold ${textPrimary}`}>{count}</div>
                  <div className="h-1.5 rounded-full mt-1 mb-1"
                    style={{ background: step.color, opacity: count > 0 ? 1 : 0.2 }} />
                  <div className="text-xs" style={{ color: textSecondary }}>{step.label}</div>
                  {count > 0 && (
                    <div className="text-xs" style={{ color: textSubtle }}>{pct}%</div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

    </div>
  );
}

/* ══════════════════════════════════════════════════════════════
   O TETO DE FATURAMENTO

   O Simples Nacional tem limite anual. Passar dele não dá multa na
   hora — dá desenquadramento no ano seguinte, com o imposto
   recalculado por cima de tudo que já foi faturado. Quando alguém
   percebe, já vendeu, já entregou e já gastou o dinheiro.

   ESTE CARTÃO É UM ALARME, NÃO UM RELATÓRIO. Ele mostra quanto falta
   para o teto de cada CNPJ e deixa ligar o bloqueio — e o bloqueio é
   explicado com todas as letras, porque ligar isto significa combinar
   que um dia o sistema vai parar de vender de propósito.
   ══════════════════════════════════════════════════════════════ */

function TetoCard() {
  const qc = useQueryClient();
  const [abrir, setAbrir] = useState(false);

  const { data: teto } = useQuery({
    queryKey: ['contabil-teto'],
    queryFn: () => api.get('/contabil/teto').catch(() => null),
    retry: false,
  });

  const salvar = useMutation({
    mutationFn: v => api.put('/contabil/teto', { bloquear_venda_no_teto: v }),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: ['contabil-teto'] });
      toast.success(r.bloquear_venda_no_teto
        ? 'Bloqueio ligado — o sistema vai recusar venda que passe do teto'
        : 'Bloqueio desligado — o sistema volta a só avisar');
    },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });

  // Módulo Contábil indisponível ou sem empresa: o cartão não aparece
  // em vez de mostrar uma barra vazia que não quer dizer nada.
  if (!teto?.empresas?.length) return null;

  const comLimite = teto.empresas.filter(e => e.tem_limite);
  // O CNPJ MAIS APERTADO é o que manda no cartão. Mostrar a média de
  // três CNPJs esconderia justamente o que está para estourar.
  const critico = comLimite.slice().sort((a, b) => (b.pct || 0) - (a.pct || 0))[0] || null;
  const pct = critico?.pct ?? 0;
  const cor = pct >= 100 ? '#ef4444' : pct >= 85 ? '#f59e0b' : pct >= 70 ? '#eab308' : '#22c55e';

  return (
    <>
      <div className="card p-4">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <Gauge size={16} style={{ color: cor }} />
            <span className="font-semibold text-gray-700 dark:text-gray-200">
              Teto de faturamento {teto.ano}
            </span>
            {teto.bloqueando ? (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                BLOQUEIO LIGADO
              </span>
            ) : (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">
                só avisa
              </span>
            )}
          </div>
          <button onClick={() => setAbrir(true)}
            className="text-sm text-primary-600 hover:underline flex items-center gap-1">
            <Pencil size={13} /> Configurar
          </button>
        </div>

        {/* O AVISO DE QUE VAI PARAR vem antes dos números: quando não há
            para onde mandar a próxima venda, o resto é detalhe. */}
        {teto.sem_saida && (
          <div className="flex gap-2.5 rounded-xl bg-red-50 border border-red-200 p-3 mb-3">
            <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-800">
              <b>O sistema vai parar de vender.</b> Todos os CNPJs chegaram ao limite e o
              bloqueio está ligado. Cadastre outro CNPJ em Contábil, ou desligue o bloqueio
              para continuar faturando por cima do teto.
            </p>
          </div>
        )}

        {comLimite.length === 0 ? (
          <p className="text-sm text-gray-500">
            Nenhum CNPJ tem limite anual cadastrado. Informe o limite em
            {' '}<Link to="/contabil" className="text-primary-600 hover:underline">Contábil</Link>
            {' '}para o sistema saber quando avisar.
          </p>
        ) : (
          <div className="space-y-2.5">
            {comLimite.map(e => (
              <div key={e.id}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="text-gray-700 dark:text-gray-200 truncate">
                    {e.nome_fantasia || e.razao_social}
                    {e.cnpj && <span className="text-[11px] text-gray-400 ml-1.5 font-mono">{fmtCnpjBr(e.cnpj)}</span>}
                  </span>
                  <span className="tabular-nums shrink-0"
                    style={{ color: e.pct >= 85 ? '#ef4444' : undefined }}>
                    {fmt(e.faturado)} <span className="text-gray-400">de {fmt(e.limite)}</span>
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 dark:bg-gray-700 mt-1 overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, e.pct || 0)}%`,
                      background: e.pct >= 100 ? '#ef4444' : e.pct >= 85 ? '#f59e0b' : '#22c55e',
                    }} />
                </div>
                <p className="text-[11.5px] text-gray-500 mt-0.5">
                  {e.estourado
                    ? <b className="text-red-600">limite estourado</b>
                    : <>faltam <b>{fmt(e.restante)}</b> — {String(e.pct).replace('.', ',')}% usado</>}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      {abrir && (
        <TetoConfig teto={teto} salvando={salvar.isPending}
          onSalvar={v => { salvar.mutate(v); setAbrir(false); }}
          onFechar={() => setAbrir(false)} />
      )}
    </>
  );
}

/**
 * A CONVERSA ANTES DE LIGAR O BLOQUEIO.
 *
 * Uma chave que faz o sistema parar de vender não pode ser um
 * interruptor mudo. O texto aqui não é aviso legal para ninguém ler —
 * é a descrição do que vai acontecer no dia em que o teto chegar, e
 * quem liga precisa ter lido isso antes, não depois.
 */
function TetoConfig({ teto, salvando, onSalvar, onFechar }) {
  const [ligado, setLigado] = useState(!!teto.bloqueando);
  const comEspaco = teto.empresas.filter(e => !e.tem_limite || !e.estourado);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60"
      onClick={onFechar}>
      <div onClick={e => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5">
        <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">
          Teto de faturamento
        </h2>
        <p className="text-[12.5px] text-gray-500 mb-4">
          O que o sistema faz quando uma venda passa do limite anual do CNPJ.
        </p>

        <div className="space-y-2">
          <Opcao ligado={!ligado} onClick={() => setLigado(false)}
            titulo="Só avisar (padrão)"
            texto="A venda aparece com um aviso e sai do mesmo jeito se quem está vendendo confirmar. Nada trava — e nada impede de passar do teto sem perceber." />

          <Opcao ligado={ligado} onClick={() => setLigado(true)} perigo
            titulo="Bloquear a venda"
            texto="O servidor RECUSA a venda que passar do limite. Não há senha de gerente que passe por cima." />
        </div>

        {ligado && (
          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3.5 space-y-2.5">
            <p className="text-sm font-bold text-amber-900 flex items-center gap-1.5">
              <AlertTriangle size={15} /> Leia antes de ligar
            </p>
            <ul className="text-[12.5px] text-amber-900 space-y-1.5 list-disc pl-4">
              <li>
                Chegando ao teto, <b>o sistema para de aceitar vendas nesse CNPJ</b>. Não é
                aviso: é recusa.
              </li>
              <li>
                Para continuar vendendo é preciso <b>escolher outro CNPJ</b> na tela de
                pagamento do pedido. A recusa mostra quais ainda têm espaço.
              </li>
              <li>
                <b>Se não houver outro CNPJ com espaço, o sistema PARA.</b> Nenhuma venda
                nova entra até alguém cadastrar um segundo CNPJ em Contábil ou desligar esta
                chave aqui.
              </li>
              <li>
                Pedidos que já existem continuam funcionando — produção, entrega e
                recebimento não são afetados. O que para é a <b>criação</b> de venda nova.
              </li>
            </ul>

            <div className="rounded-lg bg-white/70 border border-amber-200 p-2.5">
              <p className="text-[12px] text-amber-900">
                Hoje você tem <b>{comEspaco.length}</b> CNPJ{comEspaco.length !== 1 ? 's' : ''}
                {' '}com espaço.
                {comEspaco.length === 0 && (
                  <b> Ligando agora, o sistema para na próxima venda.</b>
                )}
                {comEspaco.length === 1 && (
                  <> Quando ele encher, não há para onde mandar a venda seguinte.</>
                )}
              </p>
            </div>
          </div>
        )}

        <div className="flex gap-2 justify-end mt-5">
          <button onClick={onFechar} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={() => onSalvar(ligado)} disabled={salvando}
            className={`text-sm px-4 py-2 rounded-lg font-semibold text-white disabled:opacity-50 ${
              ligado ? 'bg-red-600 hover:bg-red-700' : 'bg-primary-600 hover:bg-primary-700'}`}>
            {ligado ? 'Ligar o bloqueio' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const Opcao = ({ ligado, onClick, titulo, texto, perigo }) => (
  <button onClick={onClick}
    className={`w-full text-left rounded-xl border p-3 transition-colors ${
      ligado
        ? (perigo ? 'border-red-400 bg-red-50' : 'border-primary-400 bg-primary-50')
        : 'border-gray-200 hover:bg-gray-50'}`}>
    <p className={`text-sm font-semibold ${ligado && perigo ? 'text-red-800' : 'text-gray-800'}`}>
      {titulo}
    </p>
    <p className="text-[12px] text-gray-600 mt-0.5">{texto}</p>
  </button>
);

/** 12345678000190 → 12.345.678/0001-90; menos de 14 dígitos não vira nada. */
function fmtCnpjBr(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length !== 14) return null;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}
