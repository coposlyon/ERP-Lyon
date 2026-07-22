import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement,
  LineElement, Tooltip as ChartTooltip, Filler,
} from 'chart.js';
import {
  Loader2, History, Info, Eye, GitCompare, RefreshCw, FileSpreadsheet,
  FileDown, Filter, X, Clock, TrendingUp, TrendingDown, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
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
const dtBR = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const REASON = {
  manual: 'Salvo manualmente', recalculo: 'Recálculo',
  'auto-inicial': 'Gerado automaticamente', 'auto-alteracao': 'Atualizado por mudança',
};

export default function HistoricoRateios() {
  const qc = useQueryClient();
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [costCenter, setCostCenter] = useState('');
  const [category, setCategory] = useState('');
  const [view, setView] = useState(null);
  const [compare, setCompare] = useState(false);
  const [cmpA, setCmpA] = useState('');
  const [cmpB, setCmpB] = useState('');
  const [recalc, setRecalc] = useState(false);

  const qs = new URLSearchParams();
  if (start) qs.set('start', start);
  if (end) qs.set('end', end);
  if (costCenter) qs.set('cost_center', costCenter);
  if (category) qs.set('category', category);

  const { data, isLoading } = useQuery({
    queryKey: ['rateio-historico', start, end, costCenter, category],
    queryFn: () => api.get(`/rateio/historico?${qs.toString()}`),
  });

  const history = data?.historico || [];
  const f = data?.filtros || {};
  const chrono = [...history].sort((a, b) => a.period.localeCompare(b.period));
  const temFiltro = start || end || costCenter || category;
  const limpar = () => { setStart(''); setEnd(''); setCostCenter(''); setCategory(''); };

  async function recalcular() {
    setRecalc(true);
    try {
      const r = await api.post('/rateio/historico/recalcular');
      toast.success(`Rateio recalculado — versão ${r.version} (${fmtBRL4(r.per_unit)}/un)`);
      qc.invalidateQueries({ queryKey: ['rateio-historico'] });
    } catch (err) { toast.error(err.error || 'Erro ao recalcular'); }
    finally { setRecalc(false); }
  }

  async function exportExcel() {
    try {
      const XLSX = await import('xlsx');
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(history.map(h => ({
        'Período': longLabel(h.period), 'Versão': h.version || 1,
        'Produção Estimada': h.production, 'Total de Custos Fixos': h.total,
        'Rateio por Unidade': h.per_unit, 'Variação %': h.variacao_pct ?? '',
        'Método': h.method === 'vendas' ? 'Rateio por Vendas' : 'Rateio por Produção',
        'Criado por': h.user_name || '', 'Data': dtBR(h.created_at),
      }))), 'Histórico');
      const comp = history.flatMap(h => (h.breakdown?.items || []).map(i => ({
        'Período': longLabel(h.period), 'Despesa': i.name, 'Descrição': i.notes || '',
        'Categoria': i.category, 'Centro de Custo': i.cost_center || '',
        'Origem': i.origin, 'Periodicidade': i.periodicity, 'Valor Mensal': i.amount,
      })));
      if (comp.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(comp), 'Composição');
      XLSX.writeFile(wb, `historico-rateios-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Excel gerado!');
    } catch { toast.error('Erro ao gerar o Excel'); }
  }

  function exportPDF() {
    const linhas = history.map(h => `
      <tr>
        <td>${longLabel(h.period)} <small>v${h.version || 1}</small></td>
        <td class="r">${fmtQty(h.production)} un</td>
        <td class="r">${fmtBRL(h.total)}</td>
        <td class="r"><b>${fmtBRL4(h.per_unit)}</b></td>
        <td class="r">${h.variacao_pct == null ? '—' : (h.variacao_pct > 0 ? '+' : '') + pctBR(h.variacao_pct)}</td>
        <td>${h.user_name || '—'}</td>
        <td>${dtBR(h.created_at)}</td>
      </tr>`).join('');
    const win = window.open('', '_blank');
    if (!win) { toast.error('Permita pop-ups para gerar o PDF'); return; }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8">
      <title>Histórico de Rateios</title>
      <style>
        body{font-family:system-ui,sans-serif;padding:28px;color:#111}
        h1{font-size:18px;margin:0 0 2px} p.sub{color:#666;font-size:12px;margin:0 0 16px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        th{text-align:left;background:#f3f4f6;padding:8px;border-bottom:2px solid #e5e7eb}
        td{padding:7px 8px;border-bottom:1px solid #eee}
        .r{text-align:right} small{color:#999}
        footer{margin-top:18px;color:#888;font-size:11px}
      </style></head><body>
      <h1>Histórico de Rateios</h1>
      <p class="sub">Evolução do rateio por unidade · gerado em ${dtBR(new Date().toISOString())}${temFiltro ? ' · com filtros aplicados' : ''}</p>
      <table><thead><tr>
        <th>Período</th><th class="r">Produção</th><th class="r">Custos Fixos</th>
        <th class="r">Rateio/Un</th><th class="r">Variação</th><th>Criado por</th><th>Data</th>
      </tr></thead><tbody>${linhas}</tbody></table>
      <footer>Lyon Copos — dados apurados automaticamente das Despesas Fixas e da Produção.</footer>
      </body></html>`);
    win.document.close();
    setTimeout(() => win.print(), 350);
  }

  const a = history.find(h => h.period === cmpA);
  const b = history.find(h => h.period === cmpB);
  const diff = (x, y) => (Number(y) > 0 ? ((x - y) / y) * 100 : null);

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Histórico de Rateios</h1>
          <p className="text-sm text-gray-500 mt-1">Evolução do rateio por unidade período a período</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {data?.atualizacao?.ultimo_snapshot && (
            <span className="text-xs text-gray-400 hidden lg:flex items-center gap-1">
              <Clock size={12} /> {dtBR(data.atualizacao.ultimo_snapshot)}
            </span>
          )}
          <button className="btn-secondary" onClick={() => setCompare(true)} disabled={history.length < 2}>
            <GitCompare size={15} /> Comparar Períodos
          </button>
          <button className="btn-secondary" onClick={exportExcel} disabled={!history.length}>
            <FileSpreadsheet size={15} /> Excel
          </button>
          <button className="btn-secondary" onClick={exportPDF} disabled={!history.length}>
            <FileDown size={15} /> PDF
          </button>
          <button className="btn-primary" onClick={recalcular} disabled={recalc}>
            {recalc ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalcular Rateio
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 flex items-center gap-1"><Filter size={13} /> Filtros</span>
        <input type="month" className="input py-1.5 text-sm w-auto" value={start} onChange={e => setStart(e.target.value)} title="Período inicial" />
        <span className="text-xs text-gray-400">até</span>
        <input type="month" className="input py-1.5 text-sm w-auto" value={end} onChange={e => setEnd(e.target.value)} title="Período final" />
        <select className="input py-1.5 text-sm w-auto" value={costCenter} onChange={e => setCostCenter(e.target.value)}>
          <option value="">Todos os centros de custo</option>
          {(f.cost_centers || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto" value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">Todas as categorias</option>
          {(f.categories || []).map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {temFiltro && <button className="btn-ghost btn-sm text-gray-500" onClick={limpar}><X size={13} /> Limpar</button>}
      </div>

      {/* Alerta de variação relevante (>= 10%) */}
      {history.some(h => h.alerta) && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-800">Variação relevante no rateio por unidade</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {history.filter(h => h.alerta).map(h => `${longLabel(h.period)} (${h.variacao_pct > 0 ? '+' : ''}${pctBR(h.variacao_pct)})`).join(' · ')}
              {' '}— variações acima de 10% costumam vir de mudança nas despesas ou na produção estimada.
            </p>
          </div>
        </div>
      )}

      {history.length === 0 ? (
        <div className="card p-12 text-center text-gray-400">
          <History size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            {temFiltro ? 'Nenhum período para esses filtros.' : (
              <>Nenhum rateio registrado ainda. Cadastre despesas em{' '}
              <Link to="/rateio/despesas-fixas" className="text-primary-600 hover:underline">Despesas Fixas</Link>{' '}
              que o período é registrado aqui automaticamente.</>
            )}
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
                  <th className="px-3 py-2 text-right">Produção Estimada</th>
                  <th className="px-3 py-2 text-right">Total de Custos Fixos</th>
                  <th className="px-3 py-2 text-right">Rateio por Unidade</th>
                  <th className="px-3 py-2 text-right">Variação</th>
                  <th className="px-3 py-2">Método</th>
                  <th className="px-3 py-2">Criado por</th>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {history.map(h => (
                  <tr key={h.id || h.period} className={`border-b border-gray-50 hover:bg-gray-50/60 ${h.alerta ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-900 whitespace-nowrap">
                      {longLabel(h.period)}
                      {(h.versoes || []).length > 1 && (
                        <span className="text-[10px] text-gray-400 ml-1.5" title={`${h.versoes.length} versões`}>v{h.version || 1}</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtQty(h.production)} un</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtBRL(h.total)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">{fmtBRL4(h.per_unit)}</td>
                    <td className="px-3 py-2.5 text-right whitespace-nowrap">
                      {h.variacao_pct == null ? <span className="text-gray-300">—</span> : (
                        <span className={`inline-flex items-center gap-0.5 ${h.variacao_pct > 0 ? 'text-red-600' : h.variacao_pct < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {h.variacao_pct > 0 ? <TrendingUp size={12} /> : h.variacao_pct < 0 ? <TrendingDown size={12} /> : null}
                          {h.variacao_pct > 0 ? '+' : ''}{pctBR(h.variacao_pct)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{h.method === 'vendas' ? 'Rateio por Vendas' : 'Rateio por Produção'}</td>
                    <td className="px-3 py-2.5 text-gray-500">{h.user_name || '—'}</td>
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap">{dtBR(h.created_at)}</td>
                    <td className="px-3 py-2.5 text-center">
                      <button className="btn-ghost p-1.5 text-primary-600" title="Visualizar cálculo" onClick={() => setView(h)}>
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-gray-400 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Nada é digitado aqui: o snapshot é gerado automaticamente ao abrir a tela quando os números mudam.
          Os valores vêm das <Link to="/rateio/despesas-fixas" className="text-primary-600 hover:underline">Despesas Fixas</Link> e
          da produção de <Link to="/production" className="text-primary-600 hover:underline">Produção/Metas</Link>.
          Guardamos até 120 versões — recalcular no mesmo mês cria uma nova versão sem apagar a anterior.
        </span>
      </p>

      {/* Visualizar cálculo */}
      <Modal isOpen={!!view} onClose={() => setView(null)}
        title={view ? `Cálculo de ${longLabel(view.period)} (v${view.version || 1})` : ''} size="lg">
        {view && (
          <div className="space-y-4 text-sm">
            <div className="rounded-xl bg-primary-50 border border-primary-200 p-3 text-center">
              <p className="text-xs text-primary-700">Total de custos fixos ÷ produção estimada</p>
              <p className="font-semibold text-primary-900 mt-1">
                {fmtBRL(view.total)} ÷ {fmtQty(view.production)} un = <b className="text-lg">{fmtBRL4(view.per_unit)}</b> /un
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                ['Responsável', view.user_name || '—'],
                ['Gerado em', dtBR(view.created_at)],
                ['Motivo', REASON[view.reason] || view.reason || '—'],
                ['Produção', `${fmtQty(view.production)} un${view.production_source ? ` · ${view.production_source}` : ''}`],
                ['Método', view.method === 'vendas' ? 'Rateio por Vendas' : 'Rateio por Produção'],
                ['Imposto na época', `${String(view.tax_pct ?? 0).replace('.', ',')}%${view.tax_source ? ` · ${view.tax_source}` : ''}`],
              ].map(([k, v]) => (
                <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-[11px] text-gray-500 uppercase">{k}</p>
                  <p className="font-medium text-gray-800">{v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[['Por categoria', view.breakdown?.by_category], ['Por centro de custo', view.breakdown?.by_cost_center]].map(([titulo, lista]) => (
                <div key={titulo}>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{titulo}</p>
                  <div className="rounded-lg border border-gray-100">
                    {(lista || []).map(c => (
                      <div key={c.name} className="flex justify-between px-2.5 py-1.5 border-b border-gray-50 last:border-0 text-xs">
                        <span className="text-gray-600 truncate">{c.name}</span>
                        <span className="font-medium text-gray-900 whitespace-nowrap">{fmtBRL(c.total)}</span>
                      </div>
                    ))}
                    {!(lista || []).length && <p className="px-2.5 py-2 text-xs text-gray-400">Sem dados.</p>}
                  </div>
                </div>
              ))}
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                Despesas do período ({(view.breakdown?.items || []).length})
              </p>
              <div className="max-h-56 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr className="text-left text-gray-500">
                      <th className="px-2.5 py-1.5">Despesa</th>
                      <th className="px-2.5 py-1.5">Categoria</th>
                      <th className="px-2.5 py-1.5">Centro</th>
                      <th className="px-2.5 py-1.5">Origem</th>
                      <th className="px-2.5 py-1.5 text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(view.breakdown?.items || []).map((i, ix) => (
                      <tr key={ix} className="border-b border-gray-50 last:border-0">
                        <td className="px-2.5 py-1.5">
                          {i.name}{i.notes && <span className="text-gray-400"> · {i.notes}</span>}
                        </td>
                        <td className="px-2.5 py-1.5 text-gray-500">{i.category}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{i.cost_center || '—'}</td>
                        <td className="px-2.5 py-1.5 text-gray-500">{i.origin}</td>
                        <td className="px-2.5 py-1.5 text-right font-medium">{fmtBRL(i.amount)}</td>
                      </tr>
                    ))}
                    {!(view.breakdown?.items || []).length && (
                      <tr><td colSpan={5} className="px-2.5 py-3 text-center text-gray-400">
                        Composição não registrada neste snapshot (gerado antes da atualização).
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {(view.versoes || []).length > 1 && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5 flex items-center gap-1">
                  <History size={12} /> Versões deste período
                </p>
                <div className="rounded-lg border border-gray-100">
                  {view.versoes.map(v => (
                    <div key={v.version} className="flex items-center justify-between px-2.5 py-1.5 border-b border-gray-50 last:border-0 text-xs">
                      <span className="text-gray-600">v{v.version} · {REASON[v.reason] || v.reason} · {v.user_name || '—'}</span>
                      <span className="text-gray-500">{fmtBRL4(v.per_unit)}/un · {dtBR(v.created_at)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2 border-t">
              <button className="btn-secondary" onClick={() => setView(null)}><X size={14} /> Fechar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Comparar Períodos */}
      <Modal isOpen={compare} onClose={() => setCompare(false)} title="Comparar períodos" size="lg">
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Período A</label>
              <select className="input" value={cmpA} onChange={e => setCmpA(e.target.value)}>
                <option value="">Selecione</option>
                {history.map(h => <option key={h.period} value={h.period}>{longLabel(h.period)}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Período B</label>
              <select className="input" value={cmpB} onChange={e => setCmpB(e.target.value)}>
                <option value="">Selecione</option>
                {history.map(h => <option key={h.period} value={h.period}>{longLabel(h.period)}</option>)}
              </select>
            </div>
          </div>

          {a && b ? (
            <>
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="grid grid-cols-4 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                  <span>Indicador</span>
                  <span className="text-right">{longLabel(a.period)}</span>
                  <span className="text-right">{longLabel(b.period)}</span>
                  <span className="text-right">Variação</span>
                </div>
                {[
                  ['Produção estimada', a.production, b.production, v => `${fmtQty(v)} un`],
                  ['Total de custos fixos', a.total, b.total, fmtBRL],
                  ['Rateio por unidade', a.per_unit, b.per_unit, fmtBRL4],
                ].map(([label, va, vb, fmt]) => {
                  const d = diff(vb, va);
                  return (
                    <div key={label} className="grid grid-cols-4 px-3 py-2.5 border-t border-gray-100 items-center">
                      <span className="text-gray-600">{label}</span>
                      <span className="text-right text-gray-500">{fmt(va)}</span>
                      <span className="text-right font-medium text-gray-900">{fmt(vb)}</span>
                      <span className={`text-right font-semibold ${d == null ? 'text-gray-400' : d > 0 ? 'text-red-600' : d < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                        {d == null ? '—' : `${d > 0 ? '+' : ''}${pctBR(d)}`}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Composição por categoria</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="grid grid-cols-4 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-500 uppercase">
                    <span>Categoria</span><span className="text-right">{longLabel(a.period)}</span>
                    <span className="text-right">{longLabel(b.period)}</span><span className="text-right">Dif.</span>
                  </div>
                  {[...new Set([
                    ...(a.breakdown?.by_category || []).map(c => c.name),
                    ...(b.breakdown?.by_category || []).map(c => c.name),
                  ])].map(nome => {
                    const va = (a.breakdown?.by_category || []).find(c => c.name === nome)?.total || 0;
                    const vb = (b.breakdown?.by_category || []).find(c => c.name === nome)?.total || 0;
                    const dv = vb - va;
                    return (
                      <div key={nome} className="grid grid-cols-4 px-3 py-2 border-t border-gray-100 text-xs items-center">
                        <span className="text-gray-600 truncate">{nome}</span>
                        <span className="text-right text-gray-500">{fmtBRL(va)}</span>
                        <span className="text-right text-gray-900">{fmtBRL(vb)}</span>
                        <span className={`text-right font-medium ${dv > 0 ? 'text-red-600' : dv < 0 ? 'text-green-600' : 'text-gray-400'}`}>
                          {dv === 0 ? '—' : `${dv > 0 ? '+' : ''}${fmtBRL(dv)}`}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-gray-400 text-center py-6">Escolha dois períodos para comparar lado a lado.</p>
          )}

          <div className="flex justify-end pt-2 border-t">
            <button className="btn-secondary" onClick={() => setCompare(false)}><X size={14} /> Fechar</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
