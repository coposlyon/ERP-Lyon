import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Target, Save, TrendingUp, Wallet, Factory, PieChart,
  Coins, Trophy, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const num = x => parseFloat(String(x).replace(/\./g, '').replace(',', '.')) || 0;

export default function SimuladorMetas() {
  const [goal, setGoal] = useState(null);    // null = usa o salvo
  const [margin, setMargin] = useState(null); // null = usa o automático/salvo
  const [saving, setSaving] = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rateio-goals'],
    queryFn: () => api.get('/rateio/goals'),
  });

  const goalValue = goal !== null ? num(goal) : (data?.profit_goal ?? 0);
  const marginValue = margin !== null ? num(margin) : (data?.avg_margin_unit ?? 0);

  // Necessário vender = meta de lucro ÷ margem média por unidade
  const neededMonthly = marginValue > 0 ? Math.ceil(goalValue / marginValue) : 0;
  const neededWeekly = Math.ceil(neededMonthly / 4.345);
  const neededDaily = Math.ceil(neededMonthly / 30);
  const progress = goalValue > 0 ? Math.min(100, Math.max(0, (data?.month_profit / goalValue) * 100)) : 0;

  async function save() {
    setSaving(true);
    try {
      await api.put('/rateio/goals', {
        profit_goal: goal !== null ? num(goal) : data?.profit_goal,
        avg_margin_unit: margin !== null ? (margin === '' ? null : num(margin)) : undefined,
      });
      toast.success('Meta salva!');
      setGoal(null); setMargin(null);
      refetch();
    } catch (err) { toast.error(err.error || 'Erro ao salvar a meta'); }
    finally { setSaving(false); }
  }

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  // DASHBOARD DO RATEIO (topo — tempo real)
  const kpis = [
    ['Despesas Fixas do Mês', fmtBRL(data?.fixed_total), Wallet, 'text-gray-900'],
    ['Produção do Mês', `${fmtQty(data?.monthly_units)} un`, Factory, 'text-gray-900'],
    ['Rateio Unitário', fmtBRL4(data?.overhead_unit), PieChart, 'text-indigo-700'],
    ['Lucro Médio por Produto', fmtBRL(data?.avg_margin_unit), Coins, 'text-gray-900'],
    ['Meta de Lucro', data?.profit_goal != null ? fmtBRL(data.profit_goal) : '—', Target, 'text-gray-900'],
    ['Lucro Atual', fmtBRL(data?.month_profit), TrendingUp, (data?.month_profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'],
  ];

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Simulador de Metas</h1>
          <p className="text-sm text-gray-500 mt-1">Informe quanto quer ganhar por mês e veja quanto precisa vender</p>
        </div>
      </div>

      {/* DASHBOARD DO RATEIO */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(([label, value, Icon, cls]) => (
          <div key={label} className="card p-3">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Icon size={11} /> {label}
            </p>
            <p className={`text-base font-bold mt-0.5 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Entradas */}
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
            <Target size={15} className="text-primary-600" /> Sua meta
          </h2>
          <div>
            <label className="label">Meta de Lucro Mensal (R$)</label>
            <input className="input text-lg font-semibold" inputMode="decimal"
              value={goal !== null ? goal : (data?.profit_goal != null ? String(data.profit_goal).replace('.', ',') : '')}
              placeholder="20.000,00"
              onChange={e => setGoal(e.target.value)} />
          </div>
          <div>
            <label className="label">Margem média por unidade (R$)</label>
            <input className="input" inputMode="decimal"
              value={margin !== null ? margin : (data?.avg_margin_unit != null ? String(data.avg_margin_unit).replace('.', ',') : '')}
              placeholder="1,50"
              onChange={e => setMargin(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1">
              {data?.avg_margin_source === 'auto'
                ? <>Média automática das {data?.sheet_count || 0} ficha(s) de <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> (preço − custo). Digite para fixar outro valor.</>
                : 'Valor fixado manualmente. Apague e salve para voltar à média automática das fichas.'}
            </p>
          </div>
          <button className="btn-primary w-full" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar meta
          </button>
        </div>

        {/* Resultado */}
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center gap-2">
              <Trophy size={15} /> <span className="font-semibold text-sm">NECESSÁRIO VENDER</span>
            </div>
            <div className="p-5 text-center">
              {marginValue > 0 && goalValue > 0 ? (
                <>
                  <p className="text-4xl font-extrabold text-primary-700">{fmtQty(neededMonthly)}</p>
                  <p className="text-sm text-gray-500 mt-1">unidades por mês</p>
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                      ['Meta diária', neededDaily],
                      ['Meta semanal', neededWeekly],
                      ['Meta mensal', neededMonthly],
                    ].map(([label, v]) => (
                      <div key={label} className="rounded-xl bg-gray-50 p-2.5">
                        <p className="text-[11px] text-gray-500 uppercase">{label}</p>
                        <p className="font-bold text-gray-900">{fmtQty(v)} un</p>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="text-sm text-gray-400 py-4">
                  Informe a meta de lucro e a margem média por unidade para calcular.
                </p>
              )}
            </div>
          </div>

          {/* Progresso do mês */}
          <div className="card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-gray-900">Progresso do mês</span>
              <span className="text-gray-500">
                {fmtBRL(data?.month_profit)} de {goalValue > 0 ? fmtBRL(goalValue) : '—'}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100">
              <div className={`h-2.5 rounded-full transition-all ${progress >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400">
              {goalValue > 0
                ? `${progress.toFixed(1).replace('.', ',')}% da meta · ${fmtQty(data?.month_units)} unidade(s) vendida(s) em ${data?.month_orders} pedido(s) · faturamento ${fmtBRL(data?.month_revenue)}`
                : 'Defina uma meta para acompanhar o progresso.'}
            </p>
          </div>

          <p className="text-xs text-gray-400 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>O lucro atual vem do Rateio por Pedido (receita − custos − impostos das vendas do mês), atualizado em tempo real.</span>
          </p>
        </div>
      </div>
    </div>
  );
}
