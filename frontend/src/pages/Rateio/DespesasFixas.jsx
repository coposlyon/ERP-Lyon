import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip } from 'chart.js';
import {
  Plus, Loader2, Pencil, Trash2, Lightbulb, X, Save, Check,
  ChevronLeft, ChevronRight, CalendarDays, CircleDollarSign,
  PieChart as PieIcon, BarChart3, ClipboardList,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';
import { iconFor } from '@/pages/Pricing/fixedCostIcons';

ChartJS.register(ArcElement, ChartTooltip);

// ─── Categorias com identidade visual ──────────────────────
const CAT_META = {
  Marketing:      { text: '#db2777', bg: '#fdf2f8', border: '#fbcfe8', dot: '#ec4899' },
  Administrativa: { text: '#2563eb', bg: '#eff6ff', border: '#bfdbfe', dot: '#3b82f6' },
  Tecnologia:     { text: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', dot: '#8b5cf6' },
  Financeiro:     { text: '#0d9488', bg: '#f0fdfa', border: '#99f6e4', dot: '#14b8a6' },
  Logística:      { text: '#ea580c', bg: '#fff7ed', border: '#fed7aa', dot: '#f97316' },
  Comercial:      { text: '#dc2626', bg: '#fef2f2', border: '#fecaca', dot: '#ef4444' },
  RH:             { text: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', dot: '#22c55e' },
  Outros:         { text: '#4b5563', bg: '#f9fafb', border: '#e5e7eb', dot: '#9ca3af' },
};
const CATEGORIES = Object.keys(CAT_META);
const LEGEND_ORDER = ['Marketing', 'Administrativa', 'Tecnologia', 'Financeiro', 'Logística', 'RH', 'Outros'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const catOf = exp => exp.category || 'Outros';
const meta = cat => CAT_META[cat] || CAT_META.Outros;
const pctBR = v => `${v.toFixed(2).replace('.', ',')}%`;

// Máscara de dinheiro: dígitos = reais com ponto de milhar; vírgula manual
const fmtMoney = v => {
  let s = String(v ?? '').replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
  let [int, dec] = s.split(',');
  int = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec != null ? `${int},${dec.slice(0, 2)}` : int;
};
const moneyToNumber = s => {
  const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

// Próximo vencimento real (mensal: próximo dia X; anual: dia X do mês Y)
function nextDue(exp) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = Math.min(Math.max(Number(exp.due_day) || 5, 1), 31);
  const clamp = (y, m) => Math.min(day, new Date(y, m + 1, 0).getDate());
  if (exp.periodicity === 'anual') {
    const m = (Number(exp.due_month) || 1) - 1;
    let dt = new Date(today.getFullYear(), m, clamp(today.getFullYear(), m));
    if (dt < today) dt = new Date(today.getFullYear() + 1, m, clamp(today.getFullYear() + 1, m));
    return dt;
  }
  let dt = new Date(today.getFullYear(), today.getMonth(), clamp(today.getFullYear(), today.getMonth()));
  if (dt < today) {
    const y = today.getMonth() === 11 ? today.getFullYear() + 1 : today.getFullYear();
    const m = (today.getMonth() + 1) % 12;
    dt = new Date(y, m, clamp(y, m));
  }
  return dt;
}
const fmtDate = dt => dt
  ? `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`
  : '—';
const daysTo = dt => (dt - new Date().setHours(0, 0, 0, 0)) / 86400000;
const isSoon = dt => dt && daysTo(dt) <= 14;

const TipoPill = () => (
  <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
    Fixa
  </span>
);
const StatusPill = ({ active, onToggle }) => {
  const cls = `inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
    active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`;
  if (!onToggle) return <span className={cls}>{active ? 'Ativa' : 'Inativa'}</span>;
  return (
    <button type="button" onClick={onToggle}
      title={active ? 'Clique para desativar' : 'Clique para ativar'}
      className={`${cls} cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 transition`}>
      {active ? 'Ativa' : 'Inativa'}
    </button>
  );
};

// ─── Card de estatística do topo ───────────────────────────
function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        <Icon size={20} style={{ color: iconColor }} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className={`text-xl font-extrabold ${valueClass} leading-tight`}>{value}</p>
        <p className="text-[11px] text-gray-400 truncate">{sub}</p>
      </div>
    </div>
  );
}

// ─── Modal de adicionar/editar despesa ─────────────────────
function ExpenseModal({ open, initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const f = form || {
    name: initial?.name || '',
    notes: initial?.notes || '',
    category: initial?.category || 'Administrativa',
    periodicity: initial?.periodicity || 'mensal',
    amount: initial?.original_amount != null || initial?.amount != null
      ? Number(initial.original_amount ?? initial.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '',
    due_day: initial?.due_day || 5,
    due_month: initial?.due_month || 1,
    is_active: initial?.is_active !== false,
  };
  const set = patch => setForm({ ...f, ...patch });

  async function save() {
    const name = f.name.trim();
    if (!name) { toast.error('Informe o nome da despesa'); return; }
    const amount = moneyToNumber(f.amount);
    if (!(amount >= 0)) { toast.error('Informe um valor válido'); return; }
    setSaving(true);
    try {
      const payload = {
        name, notes: f.notes, amount,
        category: f.category,
        periodicity: f.periodicity, due_day: f.due_day,
        due_month: f.periodicity === 'anual' ? f.due_month : null,
        ...(isEdit ? { is_active: f.is_active } : {}),
      };
      if (isEdit) await api.put(`/contas/fixed-expenses/${initial.id}`, payload);
      else await api.post('/contas/fixed-expenses', payload);
      toast.success(isEdit ? 'Despesa atualizada!' : 'Despesa adicionada!');
      setForm(null);
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar a despesa'); }
    finally { setSaving(false); }
  }

  return (
    <Modal isOpen={open} onClose={() => { setForm(null); onClose(); }}
      title={isEdit ? 'Editar despesa fixa' : 'Nova despesa fixa'} size="sm">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Despesa *</label>
            <input className="input" value={f.name} placeholder="Ex.: Energia Elétrica"
              onChange={e => set({ name: e.target.value })} />
          </div>
          <div>
            <label className="label">Descrição</label>
            <input className="input" value={f.notes} placeholder="Ex.: Copel"
              onChange={e => set({ notes: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Categoria</label>
          <select className="input" value={f.category} onChange={e => set({ category: e.target.value })}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Periodicidade</label>
            <select className="input" value={f.periodicity} onChange={e => set({ periodicity: e.target.value })}>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </div>
          <div>
            <label className="label">{f.periodicity === 'anual' ? 'Valor Anual (R$)' : 'Valor Mensal (R$)'}</label>
            <input className="input" inputMode="decimal" value={f.amount} placeholder="600,00"
              onChange={e => set({ amount: fmtMoney(e.target.value) })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Dia de vencimento</label>
            <input type="number" min="1" max="31" className="input" value={f.due_day}
              onChange={e => set({ due_day: e.target.value })} />
          </div>
          {f.periodicity === 'anual' && (
            <div>
              <label className="label">Mês de vencimento</label>
              <select className="input" value={f.due_month} onChange={e => set({ due_month: Number(e.target.value) })}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          )}
        </div>
        {f.periodicity === 'anual' && (
          <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Despesa anual: rateada automaticamente em 12x
            {moneyToNumber(f.amount) >= 0 && <> — <b>{fmtBRL(moneyToNumber(f.amount) / 12)}/mês</b></>}.
          </p>
        )}
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={f.is_active} onChange={e => set({ is_active: e.target.checked })} />
            Despesa ativa (entra no rateio e nas contas do mês)
          </label>
        )}
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

// ─── Página ────────────────────────────────────────────────
export default function DespesasFixas() {
  const qc = useQueryClient();
  const today = new Date();
  // Período do snapshot do rateio = mês corrente (sem seletor na tela)
  const refMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [modal, setModal] = useState(null);
  const [fCat, setFCat] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [fTipo, setFTipo] = useState('');
  const [showAllDue, setShowAllDue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: sum, isLoading, refetch } = useQuery({
    queryKey: ['rateio-summary'],
    queryFn: () => api.get('/rateio/summary'),
  });

  const items = sum?.items || [];
  const total = sum?.total || 0;             // fixas ativas (inclui folha adm.)
  const units = sum?.monthly_units || 0;
  const perUnit = sum?.overhead_unit || 0;
  const prodLabor = sum?.prod_labor_total || 0;

  // Colaboradores NÃO aparecem aqui — só as despesas
  const expenses = useMemo(() => items.filter(e => !e.employee_id), [items]);
  const folhaFixa = useMemo(() => items.filter(e => e.employee_id && e.is_active !== false)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0), [items]);
  const participacao = (total + prodLabor) > 0 ? (total / (total + prodLabor)) * 100 : 100;

  function invalidate() {
    refetch();
    qc.invalidateQueries({ queryKey: ['pricing-fixed-summary'] });
    qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
  }

  async function saveConfig(patch) {
    try {
      await api.put('/rateio/config', { ...patch, period: refMonth });
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

  // Liga/desliga a despesa (inativa não entra no rateio nem nas contas do mês)
  async function toggleActive(exp) {
    const next = exp.is_active === false;
    try {
      await api.put(`/contas/fixed-expenses/${exp.id}`, { is_active: next });
      toast.success(next ? 'Despesa ativada' : 'Despesa desativada');
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao alterar status'); }
  }

  // Filtros + ordenação por próximo vencimento
  const rows = useMemo(() => expenses
    .filter(e => !fCat || catOf(e) === fCat)
    .filter(e => !fStatus || (fStatus === 'ativa' ? e.is_active !== false : e.is_active === false))
    .filter(e => !fTipo || (e.periodicity || 'mensal') === fTipo)
    .sort((a, b) => nextDue(a) - nextDue(b)),
  [expenses, fCat, fStatus, fTipo]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = rows.slice((curPage - 1) * pageSize, curPage * pageSize);

  const totals = useMemo(() => {
    const act = rows.filter(r => r.is_active !== false);
    return {
      original: act.reduce((s, r) => s + (Number(r.original_amount ?? r.amount) || 0), 0),
      monthly: act.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    };
  }, [rows]);

  // Vencimentos nos próximos 30 dias (valor da parcela real)
  const upcoming = useMemo(() => expenses
    .filter(e => e.is_active !== false)
    .map(e => ({ id: e.id, name: e.name, amount: Number(e.original_amount ?? e.amount) || 0, due: nextDue(e) }))
    .sort((a, b) => a.due - b.due), [expenses]);
  const due30 = upcoming.filter(u => daysTo(u.due) <= 30);
  const due30Total = due30.reduce((s, u) => s + u.amount, 0);

  // Distribuição por categoria (fixas ativas; folha adm. = RH)
  const dist = useMemo(() => {
    const byCat = {};
    for (const e of expenses) {
      if (e.is_active === false) continue;
      const c = LEGEND_ORDER.includes(catOf(e)) ? catOf(e) : 'Outros';
      byCat[c] = (byCat[c] || 0) + (Number(e.amount) || 0);
    }
    if (folhaFixa > 0) byCat.RH = (byCat.RH || 0) + folhaFixa;
    return LEGEND_ORDER.map(c => ({ cat: c, value: byCat[c] || 0 }));
  }, [expenses, folhaFixa]);
  const distNonZero = dist.filter(d => d.value > 0);

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Despesas Fixas</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie todas as despesas fixas da empresa e o rateio por unidade produzida.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-4 gap-4 items-start">
        {/* ═══ COLUNA PRINCIPAL ═══ */}
        {/* min-w-0: deixa a coluna encolher — sem isso a tabela larga
            empurra a sidebar para fora da tela */}
        <div className="xl:col-span-3 space-y-4 min-w-0">
          {/* Filtros + nova despesa */}
          <div className="flex flex-wrap items-center gap-2">
            <select className="input py-1.5 text-sm w-auto" value={fCat} onChange={e => { setFCat(e.target.value); setPage(1); }}>
              <option value="">Todas as Categorias</option>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="input py-1.5 text-sm w-auto" value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
              <option value="">Todos os Status</option>
              <option value="ativa">Ativa</option>
              <option value="inativa">Inativa</option>
            </select>
            <select className="input py-1.5 text-sm w-auto" value={fTipo} onChange={e => { setFTipo(e.target.value); setPage(1); }}>
              <option value="">Todos os Tipos</option>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
            <div className="flex-1" />
            <button className="btn-primary" onClick={() => setModal({})}>
              <Plus size={15} /> Nova Despesa
            </button>
          </div>

          {/* Cards de estatística */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <StatCard icon={CircleDollarSign} iconBg="#eff6ff" iconColor="#2563eb"
              label="Total de Despesas Fixas (Mês)" value={fmtBRL(total)}
              sub={folhaFixa > 0 ? `inclui folha adm. de ${fmtBRL(folhaFixa)}` : '100,00% do total'} />
            <StatCard icon={PieIcon} iconBg="#f0fdf4" iconColor="#16a34a"
              label="Custo por Unidade Produzida" value={fmtBRL4(perUnit)}
              sub={`Produção estimada: ${fmtQty(units)} un.`} />
            <StatCard icon={BarChart3} iconBg="#fdf2f8" iconColor="#db2777"
              label="Participação no Custo Total" value={pctBR(participacao)}
              sub="Dos custos totais da empresa" />
            <StatCard icon={CalendarDays} iconBg="#f5f3ff" iconColor="#7c3aed"
              label="Próximos Vencimentos" value={fmtBRL(due30Total)}
              sub="Nos próximos 30 dias" />
          </div>

          {/* Tabela */}
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2.5">Despesa</th>
                    <th className="px-2 py-2">Categoria</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Periodicidade</th>
                    <th className="px-2 py-2 text-right">Valor Original</th>
                    <th className="px-2 py-2 text-right">Valor Mensal<br /><span className="normal-case font-normal">Rateio</span></th>
                    <th className="px-2 py-2 text-right">% Rateio</th>
                    <th className="px-2 py-2 text-right">Custo por Unidade</th>
                    <th className="px-2 py-2">Próx. Vencimento</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2 text-center">Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(exp => {
                    const cat = catOf(exp);
                    const m = meta(cat);
                    const active = exp.is_active !== false;
                    const monthly = Number(exp.amount) || 0;
                    const original = Number(exp.original_amount ?? exp.amount) || 0;
                    const due = nextDue(exp);
                    const Icon = iconFor(exp.name);
                    return (
                      <tr key={exp.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${!active ? 'opacity-55' : ''}`}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: m.bg }}>
                              <Icon size={16} style={{ color: m.text }} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-gray-900 truncate">{exp.name}</span>
                              <span className="block text-xs text-gray-400 truncate">{exp.notes || '—'}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap"
                            style={{ color: m.text, background: m.bg, borderColor: m.border }}>
                            {cat}
                          </span>
                        </td>
                        <td className="px-2 py-2"><TipoPill /></td>
                        <td className="px-2 py-2 text-gray-600">{exp.periodicity === 'anual' ? 'Anual' : 'Mensal'}</td>
                        <td className="px-2 py-2 text-right whitespace-nowrap">{fmtBRL(original)}</td>
                        <td className="px-2 py-2 text-right font-medium whitespace-nowrap">{fmtBRL(monthly)}</td>
                        <td className="px-2 py-2 text-right text-gray-600">{pctBR(active && total > 0 ? (monthly / total) * 100 : 0)}</td>
                        <td className="px-2 py-2 text-right text-gray-600 whitespace-nowrap">{fmtBRL4(active && units > 0 ? monthly / units : 0)}</td>
                        <td className={`px-2 py-2 whitespace-nowrap ${isSoon(due) && active ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                          {fmtDate(due)}
                        </td>
                        <td className="px-2 py-2"><StatusPill active={active} onToggle={() => toggleActive(exp)} /></td>
                        <td className="px-2 py-2">
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
                  {pageRows.length === 0 && (
                    <tr><td colSpan={11} className="text-center py-10 text-sm text-gray-400">
                      {expenses.length === 0
                        ? 'Nenhuma despesa fixa cadastrada — clique em Nova Despesa.'
                        : 'Nenhuma despesa encontrada para esse filtro.'}
                    </td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                      <td className="px-4 py-3" colSpan={4}>
                        <span className="font-bold text-gray-900 uppercase text-xs">Total Geral</span>
                        <span className="block text-[11px] text-gray-400 normal-case">
                          {rows.length} registro{rows.length === 1 ? '' : 's'} encontrado{rows.length === 1 ? '' : 's'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap">{fmtBRL(totals.original)}</td>
                      <td className="px-2 py-2.5 text-right font-bold text-green-600 whitespace-nowrap">{fmtBRL(totals.monthly)}</td>
                      <td className="px-2 py-2.5 text-right font-bold text-gray-900">100,00%</td>
                      <td className="px-2 py-2.5 text-right font-bold text-gray-900 whitespace-nowrap">{fmtBRL4(units > 0 ? totals.monthly / units : 0)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Paginação */}
            {rows.length > pageSize && (
              <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-2 text-sm text-gray-500">
                <div className="flex-1" />
                <select className="input py-1 text-xs w-auto" value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                  <option value={10}>10 por página</option>
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
                <button className="btn-ghost p-1 disabled:opacity-30" disabled={curPage === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded-md text-xs font-semibold ${n === curPage ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {n}
                  </button>
                ))}
                <button className="btn-ghost p-1 disabled:opacity-30" disabled={curPage === pageCount} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button>
              </div>
            )}
          </div>
        </div>

        {/* ═══ COLUNA DIREITA ═══ */}
        <div className="space-y-4 min-w-0">
          {/* RESUMO DO RATEIO */}
          <div className="card p-4 space-y-2.5">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <ClipboardList size={15} className="text-primary-500" /> Resumo do Rateio
            </h2>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Total de Despesas Fixas (Mês)</span>
              <span className="font-semibold">{fmtBRL(total)}</span>
            </div>
            <div className="flex justify-between items-center text-sm gap-2">
              <span className="text-gray-500 shrink-0">Produção Mensal Estimada</span>
              <span className="flex items-center gap-1">
                <input type="number" min="0"
                  className="input py-0.5 px-1.5 text-sm text-right w-24 font-semibold"
                  key={`mu-${sum?.manual_units}`}
                  defaultValue={sum?.manual_units ?? ''}
                  placeholder={fmtQty(sum?.auto_monthly_units)}
                  onBlur={e => { const v = e.target.value; if (v !== String(sum?.manual_units ?? '')) saveConfig({ monthly_units: v }); }} />
                <span className="text-xs text-gray-400">un</span>
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Custo Fixo por Unidade</span>
              <span className="font-bold text-green-600">{fmtBRL4(perUnit)}</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Participação no Custo Total</span>
              <span className="font-semibold">{pctBR(participacao)}</span>
            </div>
            <Link to="/rateio/metas"
              className="block text-center text-sm font-semibold text-primary-600 bg-primary-50 hover:bg-primary-100 rounded-lg py-2 transition-colors">
              Ver análise completa
            </Link>
          </div>

          {/* DISTRIBUIÇÃO POR CATEGORIA */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <PieIcon size={15} className="text-primary-500" /> Distribuição por Categoria
            </h2>
            {distNonZero.length === 0 ? (
              <p className="text-sm text-gray-400">Cadastre despesas para ver a distribuição.</p>
            ) : (
              <div className="flex items-center gap-3">
                <div className="w-28 h-28 shrink-0">
                  <Doughnut
                    data={{
                      labels: distNonZero.map(d => d.cat),
                      datasets: [{
                        data: distNonZero.map(d => d.value),
                        backgroundColor: distNonZero.map(d => meta(d.cat).dot),
                        borderWidth: 2, borderColor: '#fff',
                      }],
                    }}
                    options={{ plugins: { legend: { display: false } }, cutout: '58%', maintainAspectRatio: false }}
                  />
                </div>
                <div className="flex-1 space-y-1 min-w-0">
                  {dist.map(d => (
                    <div key={d.cat} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: meta(d.cat).dot }} />
                      <span className="text-gray-600 truncate flex-1">{d.cat}</span>
                      <span className="font-semibold text-gray-900 whitespace-nowrap">
                        {total > 0 ? pctBR((d.value / total) * 100) : '0,00%'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* PRÓXIMOS VENCIMENTOS */}
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <CalendarDays size={15} className="text-primary-500" /> Próximos Vencimentos
            </h2>
            {upcoming.length === 0 && <p className="text-sm text-gray-400">Nenhuma despesa ativa.</p>}
            {(showAllDue ? upcoming : upcoming.slice(0, 4)).map(u => (
              <div key={u.id} className="flex items-center gap-2 text-xs">
                <span className={`font-semibold whitespace-nowrap ${isSoon(u.due) ? 'text-red-500' : 'text-gray-500'}`}>
                  {fmtDate(u.due)}
                </span>
                <span className="text-gray-600 truncate flex-1">{u.name}</span>
                <span className="font-semibold text-gray-900 whitespace-nowrap">{fmtBRL(u.amount)}</span>
              </div>
            ))}
            {upcoming.length > 4 && (
              <button className="text-xs text-primary-600 hover:underline" onClick={() => setShowAllDue(v => !v)}>
                {showAllDue ? 'Mostrar menos' : `+${Math.max(0, due30.length - 4)} vencimentos nos próximos 30 dias`}
              </button>
            )}
            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Total a vencer</span>
              <span className="font-bold text-red-500">{fmtBRL(due30Total)}</span>
            </div>
          </div>

          {/* DICAS */}
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <Lightbulb size={15} className="text-amber-500" /> Dicas
            </h2>
            <ul className="text-xs text-gray-500 space-y-1.5">
              {['Mantenha seus custos sempre atualizados.',
                'Despesas anuais são rateadas automaticamente.',
                'Revise seus vencimentos periodicamente.',
                'Acompanhe o impacto por unidade produzida.'].map(t => (
                <li key={t} className="flex items-start gap-1.5">
                  <Check size={13} className="text-green-500 mt-0.5 shrink-0" /> {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <ExpenseModal open={!!modal} initial={modal || {}}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); invalidate(); }} />
    </div>
  );
}
