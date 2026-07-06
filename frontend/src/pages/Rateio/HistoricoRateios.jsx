import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip as ChartTooltip, Filler,
} from 'chart.js';
import { Loader2, History, Info } from 'lucide-react';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, ChartTooltip, Filler);

const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const MONTHS_LONG = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const shortLabel = p => {
  const m = String(p || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[2]) - 1]}/${m[1].slice(2)}` : p;
};
const longLabel = p => {
  const m = String(p || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${MONTHS_LONG[Number(m[2]) - 1]} / ${m[1]}` : p;
};
const dBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

export default function HistoricoRateios() {
  const { data: sum, isLoading } = useQuery({
    queryKey: ['rateio-summary'],
    queryFn: () => api.get('/rateio/summary'),
  });

  const history = sum?.history || [];
  const chrono = [...history].sort((a, b) => a.period.localeCompare(b.period));

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Histórico de Rateios</h1>
          <p className="text-sm text-gray-500 mt-1">Evolução do rateio por unidade período a período</p>
        </div>
      </div>

      {history.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <History size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            Nenhum rateio registrado ainda. Ao salvar a produção ou o método em{' '}
            <Link to="/rateio/despesas-fixas" className="text-primary-600 hover:underline">Despesas Fixas</Link>,
            o período é registrado aqui automaticamente.
          </p>
        </div>
      ) : (
        <>
          {/* Evolução do rateio por unidade */}
          {chrono.length >= 2 && (
            <div className="card p-4">
              <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide mb-3">Evolução do Rateio por Unidade</h2>
              <div className="h-56">
                <Line
                  data={{
                    labels: chrono.map(h => shortLabel(h.period)),
                    datasets: [{
                      label: 'Rateio por unidade (R$)',
                      data: chrono.map(h => h.per_unit),
                      borderColor: '#4f46e5',
                      backgroundColor: 'rgba(79,70,229,0.08)',
                      fill: true, tension: 0.3, pointRadius: 4,
                    }],
                  }}
                  options={{
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { y: { ticks: { callback: v => `R$ ${Number(v).toFixed(4).replace('.', ',')}` } } },
                  }}
                />
              </div>
            </div>
          )}

          {/* Tabela completa */}
          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Período</th>
                  <th className="px-4 py-2 text-right">Produção Estimada</th>
                  <th className="px-4 py-2 text-right">Total de Custos Fixos</th>
                  <th className="px-4 py-2 text-right">Rateio por Unidade</th>
                  <th className="px-4 py-2">Método</th>
                  <th className="px-4 py-2">Criado por</th>
                  <th className="px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.period} className="border-b border-gray-50 hover:bg-gray-50/60">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{longLabel(h.period)}</td>
                    <td className="px-4 py-2.5 text-right">{fmtQty(h.production)} un</td>
                    <td className="px-4 py-2.5 text-right">{fmtBRL(h.total)}</td>
                    <td className="px-4 py-2.5 text-right font-semibold">{fmtBRL4(h.per_unit)}</td>
                    <td className="px-4 py-2.5 text-gray-500">{h.method === 'vendas' ? 'Rateio por Vendas' : 'Rateio por Produção'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{h.user_name || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-500">{dBR(h.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Info size={12} /> Guardamos um registro por período (até 36 meses); salvar de novo no mesmo mês atualiza o registro.
      </p>
    </div>
  );
}
