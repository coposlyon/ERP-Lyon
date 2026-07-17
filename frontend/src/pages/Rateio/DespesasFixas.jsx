import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip } from 'chart.js';
import {
  Plus, Loader2, Pencil, Trash2, Eye, Lightbulb, X, Save, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';
import { iconFor } from '@/pages/Pricing/fixedCostIcons';

ChartJS.register(ArcElement, ChartTooltip);

// Categorias padrão (especificação) — o nome vira a "Categoria" da despesa
const CATEGORIES = [
  'Aluguel', 'Energia Elétrica', 'Água', 'Internet', 'Telefone', 'Contador',
  'Sistema ERP', 'Marketing', 'Pró-labore', 'Funcionários', 'Combustível',
  'Manutenção', 'Outros Custos',
];

const DONUT_COLORS = ['#4338ca', '#9333ea', '#f97316', '#3b82f6', '#ef4444', '#22c55e', '#9ca3af'];

// Paleta sugerida para colorir categorias (usuário pode escolher qualquer cor)
const CATEGORY_COLORS = [
  '#4338ca', '#9333ea', '#f97316', '#3b82f6', '#ef4444',
  '#22c55e', '#eab308', '#14b8a6', '#ec4899', '#6b7280',
];

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const periodLabel = p => {
  const m = String(p || '').match(/^(\d{4})-(\d{2})$/);
  return m ? `${MONTHS[Number(m[2]) - 1]} / ${m[1]}` : p;
};
const dBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
// Vencimento no período selecionado: combina o dia de vencimento (1-31)
// com o mês/ano de referência, limitando ao último dia do mês.
const dueDate = (day, period) => {
  const m = String(period || '').match(/^(\d{4})-(\d{2})$/);
  const d = Number(day);
  if (!m || !(d >= 1)) return '—';
  const lastDay = new Date(Number(m[1]), Number(m[2]), 0).getDate();
  return `${String(Math.min(d, lastDay)).padStart(2, '0')}/${m[2]}/${m[1]}`;
};

// ─── Modal de adicionar/editar despesa ─────────────────────
function ExpenseModal({ open, initial, colors = {}, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const f = form || {
    category: initial?.name && CATEGORIES.includes(initial.name) ? initial.name : (initial?.name ? '__outra' : 'Aluguel'),
    custom: initial?.name && !CATEGORIES.includes(initial.name) ? initial.name : '',
    notes: initial?.notes || '',
    amount: initial?.amount != null ? String(initial.amount).replace('.', ',') : '',
    due_day: initial?.due_day || 5,
    color: (initial?.name && colors[initial.name]) || '',
  };
  const set = patch => setForm({ ...f, ...patch });

  // Ao trocar de categoria, adota a cor já salva daquela categoria (se houver)
  function pickCategory(v) {
    const nm = v === '__outra' ? f.custom.trim() : v;
    set({ category: v, ...(colors[nm] ? { color: colors[nm] } : {}) });
  }

  async function save() {
    const name = f.category === '__outra' ? f.custom.trim() : f.category;
    if (!name) { toast.error('Informe a categoria da despesa'); return; }
    const amount = parseFloat(String(f.amount).replace(/\./g, '').replace(',', '.'));
    if (!(amount >= 0)) { toast.error('Informe um valor mensal válido'); return; }
    setSaving(true);
    try {
      const payload = { name, notes: f.notes, amount, due_day: f.due_day };
      if (isEdit) await api.put(`/contas/fixed-expenses/${initial.id}`, payload);
      else await api.post('/contas/fixed-expenses', payload);
      // Cor é por categoria: só grava se mudou em relação ao que já está salvo
      if ((f.color || '') !== (colors[name] || '')) {
        await api.put('/rateio/category-colors', { category_colors: { [name]: f.color || null } });
      }
      toast.success(isEdit ? 'Despesa atualizada!' : 'Despesa adicionada!');
      setForm(null);
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar a despesa'); }
    finally { setSaving(false); }
  }

  return (
    <Modal isOpen={open} onClose={() => { setForm(null); onClose(); }}
      title={isEdit ? 'Editar despesa fixa' : 'Adicionar despesa fixa'} size="sm">
      <div className="space-y-3">
        <div>
          <label className="label">Categoria</label>
          <select className="input" value={f.category} onChange={e => pickCategory(e.target.value)}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            <option value="__outra">Outra (digitar)...</option>
          </select>
        </div>
        {f.category === '__outra' && (
          <div>
            <label className="label">Nome da categoria</label>
            <input className="input" value={f.custom} placeholder="Ex.: Segurança"
              onChange={e => set({ custom: e.target.value })} />
          </div>
        )}
        <div>
          <label className="label">Cor da categoria</label>
          <div className="flex items-center gap-1.5 flex-wrap">
            {CATEGORY_COLORS.map(c => (
              <button key={c} type="button" onClick={() => set({ color: c })}
                className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110"
                style={{ background: c, borderColor: f.color === c ? '#111827' : 'transparent' }}
                title={c} />
            ))}
            <input type="color" value={f.color || '#6b7280'} onChange={e => set({ color: e.target.value })}
              className="w-8 h-8 rounded cursor-pointer border border-gray-200 bg-transparent p-0"
              title="Cor personalizada" />
            {f.color && (
              <button type="button" onClick={() => set({ color: '' })}
                className="text-xs text-gray-400 hover:text-gray-600 ml-1">limpar</button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 mt-1">A cor vale para todas as despesas desta categoria.</p>
        </div>
        <div>
          <label className="label">Descrição</label>
          <input className="input" value={f.notes} placeholder="Ex.: Aluguel do Galpão"
            onChange={e => set({ notes: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Valor Mensal (R$)</label>
            <input className="input" inputMode="decimal" value={f.amount} placeholder="600,00"
              onChange={e => set({ amount: e.target.value })} />
          </div>
          <div>
            <label className="label">Dia de vencimento</label>
            <input type="number" min="1" max="31" className="input" value={f.due_day}
              onChange={e => set({ due_day: e.target.value })} />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          A despesa também alimenta a Central de Contas (contas a pagar do mês) — nada é digitado duas vezes.
        </p>
        <div className="flex justify-end gap-2 pt-2 border-t">
          <button className="btn-secondary" onClick={() => { setForm(null); onClose(); }}><X size={14} /> Cancelar</button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Página (layout EXATO do mockup) ───────────────────────
export default function DespesasFixas() {
  const qc = useQueryClient();
  const today = new Date();
  const [period, setPeriod] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [modal, setModal] = useState(null);       // null | {} (novo) | despesa (editar)
  const [histView, setHistView] = useState(null); // snapshot em visualização
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('due');     // due (padrão) | name | amount | amount_asc

  const { data: sum, isLoading, refetch } = useQuery({
    queryKey: ['rateio-summary'],
    queryFn: () => api.get('/rateio/summary'),
  });

  const items = sum?.items || [];
  const total = sum?.total || 0;
  const units = sum?.monthly_units || 0;
  const perUnit = sum?.overhead_unit || 0;
  const catColors = sum?.category_colors || {};

  // Lista exibida: filtro por texto + ordenação (padrão por vencimento).
  // Os cálculos de % e rateado seguem sobre o total/produção reais (sum),
  // então o filtro é só uma visão — não altera os números do rateio.
  const displayItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q
      ? items.filter(e => (e.name || '').toLowerCase().includes(q) || (e.notes || '').toLowerCase().includes(q))
      : items.slice();
    if (sortBy === 'name')       list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    else if (sortBy === 'amount')     list.sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0));
    else if (sortBy === 'amount_asc') list.sort((a, b) => (Number(a.amount) || 0) - (Number(b.amount) || 0));
    else list.sort((a, b) => ((Number(a.due_day) || 99) - (Number(b.due_day) || 99)) || (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    return list;
  }, [items, search, sortBy]);

  function invalidate() {
    refetch();
    qc.invalidateQueries({ queryKey: ['pricing-fixed-summary'] });
    qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
  }

  // Salva produção/método e registra o rateio do período no histórico
  async function saveConfig(patch) {
    try {
      await api.put('/rateio/config', { ...patch, period });
      toast.success('Rateio recalculado e registrado no histórico');
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao salvar o rateio'); }
  }

  async function removeExpense(exp) {
    if (!confirm(`Remover a despesa "${exp.name}"?\n(Ela é desativada — o histórico é mantido.)`)) return;
    try {
      await api.delete(`/contas/fixed-expenses/${exp.id}`);
      toast.success('Despesa removida');
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  // Distribuição por categoria (top 6 + Demais)
  const donut = useMemo(() => {
    const sorted = [...items].sort((a, b) => (b.amount || 0) - (a.amount || 0));
    const top = sorted.slice(0, 6);
    const rest = sorted.slice(6).reduce((s, f) => s + (Number(f.amount) || 0), 0);
    const labels = [...top.map(f => f.name), ...(rest > 0 ? ['Demais'] : [])];
    const values = [...top.map(f => Number(f.amount) || 0), ...(rest > 0 ? [rest] : [])];
    return { labels, values };
  }, [items]);

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Rateio de Custos Fixos</h1>
          <p className="text-sm text-gray-500 mt-1">Cadastre e gerencie seus custos fixos e defina o rateio por unidade</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
        {/* ═══ COLUNA PRINCIPAL ═══ */}
        <div className="xl:col-span-3 space-y-4">
          {/* CONFIGURAÇÕES DO RATEIO */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide">Configurações do Rateio</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Período de Referência</label>
                <input type="month" className="input" value={period}
                  onChange={e => setPeriod(e.target.value)} />
                <p className="text-[11px] text-gray-400 mt-1">{periodLabel(period)}</p>
              </div>
              <div>
                <label className="label">Produção Mensal Estimada</label>
                <div className="relative">
                  <input type="number" min="0" className="input pr-20"
                    key={`mu-${sum?.manual_units}`}
                    defaultValue={sum?.manual_units ?? ''}
                    placeholder={`Auto: ${fmtQty(sum?.auto_monthly_units)}`}
                    onBlur={e => { const v = e.target.value; if (v !== String(sum?.manual_units ?? '')) saveConfig({ monthly_units: v }); }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">unidades</span>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">Quantidade total de unidades produzidas no mês</p>
              </div>
              <div>
                <label className="label">Método de Rateio</label>
                <select className="input" value={sum?.rateio_method || 'producao'}
                  onChange={e => saveConfig({ rateio_method: e.target.value })}>
                  <option value="producao">Rateio por Produção</option>
                  <option value="vendas">Rateio por Vendas (média 90 dias)</option>
                </select>
                <p className="text-[11px] text-gray-400 mt-1">
                  {sum?.rateio_method === 'vendas'
                    ? 'Os custos serão rateados pela média de vendas dos últimos 90 dias'
                    : 'Os custos serão rateados conforme a produção mensal'}
                </p>
              </div>
            </div>
          </div>

          {/* DESPESAS FIXAS MENSAIS */}
          <div className="card overflow-hidden">
            <div className="card-header flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide">Despesas Fixas Mensais</h2>
              <button onClick={() => setModal({})}
                className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1.5 bg-gray-900 hover:bg-gray-800 text-white transition-colors">
                <Plus size={15} /> ADICIONAR DESPESA
              </button>
            </div>
            {/* Barra de filtro/ordenação */}
            <div className="px-4 py-2.5 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input pl-8 py-1.5 text-sm" placeholder="Filtrar por nome ou descrição..."
                  value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <select className="input py-1.5 text-sm w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                <option value="due">Ordenar por: Vencimento</option>
                <option value="name">Ordenar por: Nome (A→Z)</option>
                <option value="amount">Ordenar por: Valor (maior)</option>
                <option value="amount_asc">Ordenar por: Valor (menor)</option>
              </select>
              {search && (
                <span className="text-xs text-gray-400">{displayItems.length} de {items.length}</span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2">Categoria</th>
                    <th className="px-4 py-2">Descrição</th>
                    <th className="px-4 py-2">Vencimento</th>
                    <th className="px-4 py-2 text-right">Valor Mensal (R$)</th>
                    <th className="px-4 py-2 text-right">% Rateio</th>
                    <th className="px-4 py-2 text-right" title="Custo desta despesa em cada unidade produzida">Valor Rateado (R$)</th>
                    <th className="px-4 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {displayItems.map(exp => {
                    const Icon = iconFor(exp.name);
                    const pct = total > 0 ? (Number(exp.amount) / total) * 100 : 0;
                    const rateado = units > 0 ? Number(exp.amount) / units : 0;
                    return (
                      <tr key={exp.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                        <td className="px-4 py-2.5">
                          <span className="flex items-center gap-2 font-medium text-gray-900">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: catColors[exp.name] || '#d1d5db' }} />
                            <Icon size={15} className="text-gray-400" /> {exp.name}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{exp.notes || '—'}</td>
                        <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{dueDate(exp.due_day, period)}</td>
                        <td className="px-4 py-2.5 text-right font-medium whitespace-nowrap">
                          {Number(exp.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-600">{pct.toFixed(2).replace('.', ',')}%</td>
                        <td className="px-4 py-2.5 text-right text-gray-600 whitespace-nowrap">
                          {rateado.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button className="btn-ghost p-1.5 text-blue-600" title="Editar" onClick={() => setModal(exp)}>
                              <Pencil size={14} />
                            </button>
                            <button className="btn-ghost p-1.5 text-red-500" title="Excluir" onClick={() => removeExpense(exp)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {displayItems.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-400">
                      {items.length === 0
                        ? 'Nenhuma despesa fixa cadastrada — clique em ADICIONAR DESPESA.'
                        : 'Nenhuma despesa encontrada para esse filtro.'}
                    </td></tr>
                  )}
                </tbody>
                {displayItems.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                      <td className="px-4 py-3 font-bold text-gray-900 uppercase" colSpan={3}>Total Geral</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">100,00%</td>
                      <td className="px-4 py-3 text-right font-bold text-green-600">
                        {perUnit.toLocaleString('pt-BR', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </div>

          {/* HISTÓRICO DE RATEIOS */}
          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide">Histórico de Rateios</h2>
            </div>
            <div className="overflow-x-auto">
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
                    <th className="px-4 py-2 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {(sum?.history || []).map(h => (
                    <tr key={h.period} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-2.5 font-medium text-gray-900">{periodLabel(h.period)}</td>
                      <td className="px-4 py-2.5 text-right">{fmtQty(h.production)} un</td>
                      <td className="px-4 py-2.5 text-right">{fmtBRL(h.total)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{fmtBRL4(h.per_unit)}</td>
                      <td className="px-4 py-2.5 text-gray-500">
                        {h.method === 'vendas' ? 'Rateio por Vendas' : 'Rateio por Produção'}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{h.user_name || '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500">{dBR(h.created_at)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <button className="btn-ghost p-1.5 text-primary-600" title="Ver detalhes" onClick={() => setHistView(h)}>
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {(sum?.history || []).length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-sm text-gray-400">
                      Nenhum rateio registrado ainda — ao salvar a produção ou o método, o período é registrado aqui.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* ═══ COLUNA DIREITA ═══ */}
        <div className="space-y-4">
          {/* RATEIO POR UNIDADE (card amarelo) */}
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
            <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">Rateio por Unidade</p>
            <p className="text-4xl font-extrabold text-gray-900 mt-1">{fmtBRL4(perUnit)}</p>
            <p className="text-sm text-gray-600 mt-2">Total de Custos Fixos<br /><b>{fmtBRL(total)}</b></p>
          </div>

          {/* RESUMO DO RATEIO */}
          <div className="card p-4 space-y-2.5">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide">Resumo do Rateio</h2>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Total de Custos Fixos</span>
              <span className="font-semibold">{fmtBRL(total)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Produção Mensal Estimada</span>
              <span className="font-semibold">{fmtQty(units)} un</span>
            </div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Rateio por Unidade</span>
              <span className="font-bold text-green-600">{fmtBRL4(perUnit)}</span>
            </div>
          </div>

          {/* DISTRIBUIÇÃO POR CATEGORIA */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide">Distribuição por Categoria</h2>
            {donut.values.length === 0 ? (
              <p className="text-sm text-gray-400">Cadastre despesas para ver a distribuição.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-32 h-32 shrink-0">
                  <Doughnut
                    data={{
                      labels: donut.labels,
                      datasets: [{
                        data: donut.values,
                        backgroundColor: donut.labels.map((l, i) => catColors[l] || DONUT_COLORS[i % DONUT_COLORS.length]),
                        borderWidth: 2, borderColor: '#fff',
                      }],
                    }}
                    options={{ plugins: { legend: { display: false } }, cutout: '55%', maintainAspectRatio: false }}
                  />
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  {donut.labels.map((label, i) => (
                    <div key={label} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: catColors[label] || DONUT_COLORS[i % DONUT_COLORS.length] }} />
                      <span className="text-gray-600 truncate flex-1" title={label}>{label}</span>
                      <span className="font-semibold text-gray-900 whitespace-nowrap">
                        {total > 0 ? ((donut.values[i] / total) * 100).toFixed(2).replace('.', ',') : 0}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* DICAS */}
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-1.5">
              <Lightbulb size={15} className="text-amber-500" /> Dicas
            </h2>
            <ul className="text-xs text-gray-500 space-y-1.5 list-disc pl-4">
              <li>Mantenha seus custos fixos sempre atualizados.</li>
              <li>A produção mensal impacta diretamente no rateio por unidade.</li>
              <li>Quanto maior a produção, menor será o custo rateado por unidade.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Modal adicionar/editar despesa */}
      <ExpenseModal open={!!modal} initial={modal || {}} colors={catColors}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); invalidate(); }} />

      {/* Modal detalhe do histórico */}
      <Modal isOpen={!!histView} onClose={() => setHistView(null)}
        title={`Rateio de ${periodLabel(histView?.period)}`} size="sm">
        {histView && (
          <div className="space-y-2 text-sm">
            {[
              ['Período', periodLabel(histView.period)],
              ['Produção Estimada', `${fmtQty(histView.production)} unidades`],
              ['Total de Custos Fixos', fmtBRL(histView.total)],
              ['Rateio por Unidade', fmtBRL4(histView.per_unit)],
              ['Método', histView.method === 'vendas' ? 'Rateio por Vendas (média 90 dias)' : 'Rateio por Produção'],
              ['Criado por', histView.user_name || '—'],
              ['Registrado em', dBR(histView.created_at)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-gray-50 pb-1.5">
                <span className="text-gray-500">{k}</span>
                <span className="font-semibold text-gray-900">{v}</span>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  );
}
