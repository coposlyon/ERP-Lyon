import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BarChart3, Loader2, Search, FileDown, Printer, Trophy,
  TrendingUp, TrendingDown, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4 } from '@/lib/pricingCalc';
import { buildRankingReportHtml, openPrintWindow } from '@/utils/pricingReportHtml';

const SORTS = [
  { key: 'margem_pct',  label: 'Maior margem' },
  { key: 'lucro_unit',  label: 'Maior lucro/un' },
  { key: 'cost_unit',   label: 'Maior custo' },
  { key: 'name',        label: 'Nome (A→Z)' },
];

export default function PricingReports() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('margem_pct');
  const [asc, setAsc] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['pricing-report'],
    queryFn: () => api.get('/pricing/report'),
  });

  const rows = useMemo(() => {
    let list = data?.sheets || [];
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(r =>
        (r.name || '').toLowerCase().includes(s) || (r.category || '').toLowerCase().includes(s));
    }
    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      if (sort === 'name') return dir * String(a.name).localeCompare(String(b.name), 'pt-BR');
      return dir * ((Number(a[sort]) || 0) - (Number(b[sort]) || 0));
    });
  }, [data, search, sort, asc]);

  const best = rows.length ? rows.reduce((a, b) => (a.margem_pct >= b.margem_pct ? a : b)) : null;
  const worst = rows.length ? rows.reduce((a, b) => (a.margem_pct <= b.margem_pct ? a : b)) : null;

  function exportPdf() {
    if (!rows.length) { toast.error('Nada para exportar'); return; }
    if (!openPrintWindow(buildRankingReportHtml(rows, data?.fixed))) {
      toast.error('Libere as janelas pop-up para gerar o PDF');
    }
  }

  async function exportExcel() {
    if (!rows.length) { toast.error('Nada para exportar'); return; }
    try {
      const XLSX = await import('xlsx');
      const sheetRows = rows.map((r, i) => ({
        'Ranking': i + 1,
        'Produto': r.name,
        'Categoria': r.category || '',
        'Capacidade': r.capacity || '',
        'Impressão': r.print_type || '',
        'Custo direto (R$)': Number(r.cost_direct) || 0,
        'Rateio fixo/un (R$)': Number(r.overhead_unit) || 0,
        'Custo unitário (R$)': Number(r.cost_unit) || 0,
        'Preço mínimo (R$)': Number(r.price_min) || 0,
        'Preço ideal (R$)': Number(r.price_ideal) || 0,
        'Preço premium (R$)': Number(r.price_premium) || 0,
        'Preço usado (R$)': Number(r.price_used) || 0,
        'Origem do preço': r.price_source === 'cadastro' ? 'Cadastro do produto' : 'Preço ideal calculado',
        'Lucro por unidade (R$)': Number(r.lucro_unit) || 0,
        'Margem (%)': Number(r.margem_pct) || 0,
      }));
      const ws = XLSX.utils.json_to_sheet(sheetRows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Precificação');
      XLSX.writeFile(wb, `precificacao-ranking-${new Date().toISOString().slice(0, 10)}.xlsx`);
      toast.success('Planilha Excel exportada!');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao gerar o Excel');
    }
  }

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">Relatórios de Preço</h1>
          <p className="text-sm text-gray-500 mt-1">Custo, lucro e ranking de margem por produto (fichas salvas)</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-secondary" onClick={exportPdf}><Printer size={15} /> PDF</button>
          <button className="btn-secondary" onClick={exportExcel}><FileDown size={15} /> Excel</button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1"><BarChart3 size={12} /> Fichas</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{rows.length}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1"><Trophy size={12} /> Maior margem</p>
          <p className="text-sm font-bold text-green-600 mt-1 truncate" title={best?.name}>{best ? best.name : '—'}</p>
          <p className="text-xs text-gray-400">{best ? `${best.margem_pct.toFixed(1)}% · lucro ${fmtBRL(best.lucro_unit)}/un` : ''}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1"><TrendingDown size={12} /> Menor margem</p>
          <p className="text-sm font-bold text-red-600 mt-1 truncate" title={worst?.name}>{worst ? worst.name : '—'}</p>
          <p className="text-xs text-gray-400">{worst ? `${worst.margem_pct.toFixed(1)}% · lucro ${fmtBRL(worst.lucro_unit)}/un` : ''}</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1"><TrendingUp size={12} /> Rateio fixo/un</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtBRL4(data?.fixed?.overhead_unit)}</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9 w-64" placeholder="Buscar produto ou categoria..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input max-w-[180px]" value={sort} onChange={e => setSort(e.target.value)}>
          {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <button className="btn-ghost text-xs" onClick={() => setAsc(v => !v)}>
          {asc ? '↑ crescente' : '↓ decrescente'}
        </button>
      </div>

      {/* Ranking */}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2 w-10">#</th>
              <th className="px-4 py-2">Produto</th>
              <th className="px-4 py-2 text-right" title="Matéria-prima por unidade">Custo direto</th>
              <th className="px-4 py-2 text-right" title="Custo total unitário (com rateios e imposto)">Custo unit.</th>
              <th className="px-4 py-2 text-right">Preço ideal</th>
              <th className="px-4 py-2 text-right" title="Preço do cadastro do produto; sem cadastro, usa o ideal">Preço usado</th>
              <th className="px-4 py-2 text-right">Lucro/un</th>
              <th className="px-4 py-2 text-right">Margem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="px-4 py-2 text-gray-400 font-mono">{i + 1}º</td>
                <td className="px-4 py-2">
                  <p className="font-medium text-gray-900">{r.name}</p>
                  <p className="text-xs text-gray-400">
                    {[r.category, r.capacity, r.print_type].filter(Boolean).join(' · ')}
                  </p>
                </td>
                <td className="px-4 py-2 text-right whitespace-nowrap">{fmtBRL4(r.cost_direct)}</td>
                <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{fmtBRL4(r.cost_unit)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap text-primary-700 font-semibold">{fmtBRL(r.price_ideal)}</td>
                <td className="px-4 py-2 text-right whitespace-nowrap">
                  {fmtBRL(r.price_used)}
                  {r.price_source === 'cadastro'
                    ? <span className="badge badge-green ml-1.5">cadastro</span>
                    : <span className="badge badge-gray ml-1.5">ideal</span>}
                </td>
                <td className={`px-4 py-2 text-right font-semibold whitespace-nowrap ${r.lucro_unit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  {fmtBRL(r.lucro_unit)}
                </td>
                <td className={`px-4 py-2 text-right font-bold whitespace-nowrap ${
                  r.margem_pct >= 30 ? 'text-green-600' : r.margem_pct >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                  {(r.margem_pct ?? 0).toFixed(1)}%
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-sm text-gray-400">
                  Nenhuma ficha de precificação salva ainda.{' '}
                  <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Crie a primeira na Formação de Preço</Link>.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 flex items-center gap-1">
        <Info size={12} /> "Preço usado" = preço de venda do cadastro do produto vinculado; sem vínculo/preço, a margem é calculada sobre o preço ideal.
      </p>
    </div>
  );
}
