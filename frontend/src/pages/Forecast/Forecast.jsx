import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus, LineChart, Sparkles, ShoppingBag, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const PERIODS = [3, 6, 12];

function Spark({ series }) {
  const max = Math.max(1, ...series);
  return (
    <div className="flex items-end gap-0.5 h-7">
      {series.map((v, i) => (
        <div key={i} className="w-1.5 rounded-sm bg-violet-400" style={{ height: `${Math.max(8, (v / max) * 100)}%` }} title={String(v)} />
      ))}
    </div>
  );
}

function TrendBadge({ trend }) {
  if (trend === 'up') return <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium"><TrendingUp size={14} /> alta</span>;
  if (trend === 'down') return <span className="inline-flex items-center gap-1 text-red-500 text-xs font-medium"><TrendingDown size={14} /> queda</span>;
  return <span className="inline-flex items-center gap-1 text-gray-400 text-xs font-medium"><Minus size={14} /> estável</span>;
}

export default function Forecast() {
  const [months, setMonths] = useState(6);
  const [insight, setInsight] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['forecast', months],
    queryFn: () => api.get(`/reports/forecast?months=${months}`),
  });
  const rows = data?.data || [];

  async function analyze() {
    if (!rows.length || aiBusy) return;
    setAiBusy(true); setInsight('');
    try {
      const res = await api.post('/ai/forecast-insight', { items: rows.slice(0, 20) });
      setInsight(res.insight);
    } catch (e) {
      toast.error(e.error || 'IA não configurada (ANTHROPIC_API_KEY).');
    } finally { setAiBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center"><LineChart size={18} className="text-violet-600" /></div>
          <div>
            <h1 className="page-title">Previsão de Demanda</h1>
            <p className="text-sm text-gray-500 mt-0.5">Projeção do próximo mês por produto e sugestão de compra</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex bg-gray-100 rounded-lg p-1">
            {PERIODS.map(p => (
              <button key={p} onClick={() => setMonths(p)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${months === p ? 'bg-white shadow text-violet-700' : 'text-gray-500'}`}>{p}m</button>
            ))}
          </div>
          <button onClick={analyze} disabled={aiBusy || !rows.length} className="btn-primary disabled:opacity-50">
            {aiBusy ? <Loader2 size={15} className="animate-spin" /> : <Sparkles size={15} />} Analisar com IA
          </button>
        </div>
      </div>

      {insight && (
        <div className="card p-4 border-l-4 border-violet-500 bg-violet-50/40">
          <p className="text-xs font-bold text-violet-600 uppercase tracking-wide mb-1.5 flex items-center gap-1.5"><Sparkles size={13} /> Análise da IA</p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap">{insight}</p>
        </div>
      )}

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-10 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-gray-400">Sem histórico de vendas suficiente no período.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100">
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-3 py-3">Histórico ({months}m)</th>
                  <th className="px-3 py-3 text-right">Média/mês</th>
                  <th className="px-3 py-3 text-center">Tendência</th>
                  <th className="px-3 py-3 text-right">Previsão próx. mês</th>
                  <th className="px-3 py-3 text-right">Estoque</th>
                  <th className="px-4 py-3 text-right">Sugestão de compra</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const risk = p.current_stock < p.forecast;
                  return (
                    <tr key={p.product_id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-800">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.code || ''} {p.unit ? `· ${p.unit}` : ''}</p>
                      </td>
                      <td className="px-3 py-3"><Spark series={p.series} /></td>
                      <td className="px-3 py-3 text-right text-gray-600">{p.avg_month}</td>
                      <td className="px-3 py-3 text-center"><TrendBadge trend={p.trend} /></td>
                      <td className="px-3 py-3 text-right font-bold text-violet-700">{p.forecast}</td>
                      <td className={`px-3 py-3 text-right ${risk ? 'text-red-500 font-semibold' : 'text-gray-600'}`}>{p.current_stock}</td>
                      <td className="px-4 py-3 text-right">
                        {p.suggested_purchase > 0
                          ? <span className="inline-flex items-center gap-1 font-semibold text-emerald-700"><ShoppingBag size={13} /> {p.suggested_purchase}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 px-1">
        Previsão por regressão linear sobre as vendas mensais (piso na média dos últimos 3 meses). Sugestão de compra = previsão + estoque mínimo − estoque atual.
      </p>
    </div>
  );
}
