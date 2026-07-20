import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip } from 'chart.js';
import {
  Plus, Loader2, Pencil, Trash2, Lightbulb, X, Save, Check,
  ChevronDown, ChevronRight, ChevronLeft, ChevronsLeft, ChevronsRight,
  Users, User, CalendarDays, ClipboardList, PieChart as PieIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';
import { iconFor } from '@/pages/Pricing/fixedCostIcons';

ChartJS.register(ArcElement, ChartTooltip);

// ─── Categorias (grupos) com identidade visual ─────────────
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
const COST_CENTERS = ['Administrativo', 'Comercial', 'Produção', 'Tecnologia', 'Logística', 'Financeiro', 'RH'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const catOf = exp => exp.category || (exp.employee_id ? 'RH' : 'Outros');
const meta = cat => CAT_META[cat] || CAT_META.Outros;

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

// Próximo vencimento real da despesa (mensal: próximo dia X;
// anual: próximo dia X do mês Y)
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
const isSoon = dt => dt && (dt - new Date()) / 86400000 <= 14;

// ─── Pill de categoria / status ────────────────────────────
function CatPill({ cat }) {
  const m = meta(cat);
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap"
      style={{ color: m.text, background: m.bg, borderColor: m.border }}>
      {cat}
    </span>
  );
}
const TipoPill = () => (
  <span className="inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-200">
    Fixa
  </span>
);
const StatusPill = ({ active }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
    active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
    {active ? 'Ativa' : 'Inativa'}
  </span>
);

// ─── Modal de adicionar/editar despesa ─────────────────────
function ExpenseModal({ open, initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const f = form || {
    name: initial?.name || '',
    notes: initial?.notes || '',
    category: initial?.category || catOf(initial || {}),
    cost_center: initial?.cost_center || 'Administrativo',
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
        category: f.category, cost_center: f.cost_center,
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={f.category} onChange={e => set({ category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Centro de Custo</label>
            <select className="input" value={f.cost_center} onChange={e => set({ cost_center: e.target.value })}>
              {COST_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
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
            Despesa anual: o valor é rateado automaticamente em 12x no custo mensal
            {moneyToNumber(f.amount) >= 0 && <> — <b>{fmtBRL(moneyToNumber(f.amount) / 12)}/mês</b></>}.
          </p>
        )}
        {isEdit && (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={f.is_active} onChange={e => set({ is_active: e.target.checked })} />
            Despesa ativa (entra no rateio e nas contas do mês)
          </label>
        )}
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

// ─── Página (layout do mockup) ─────────────────────────────
export default function DespesasFixas() {
  const qc = useQueryClient();
  const today = new Date();
  const period = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  const [refMonth, setRefMonth] = useState(period);
  const [modal, setModal] = useState(null);
  const [fCentro, setFCentro] = useState('');
  const [fCat, setFCat] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [showEmps, setShowEmps] = useState(false);
  const [showAllDue, setShowAllDue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: sum, isLoading, refetch } = useQuery({
    queryKey: ['rateio-summary'],
    queryFn: () => api.get('/rateio/summary'),
  });

  const items = sum?.items || [];
  const total = sum?.total || 0;          // só ativas (fonte: backend)
  const units = sum?.monthly_units || 0;
  const perUnit = sum?.overhead_unit || 0;

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

  // ── Linhas da tabela: colaboradores viram UMA linha em cascata ──
  const rows = useMemo(() => {
    const salaries = items.filter(e => e.employee_id);
    const others = items.filter(e => !e.employee_id);

    const list = [...others];
    const active = salaries.filter(e => e.is_active !== false);
    if (salaries.length) {
      list.push({
        id: '__emps', __group: true, name: 'Colaboradores',
        notes: `${active.length} colaborador${active.length === 1 ? '' : 'es'}`,
        category: 'RH', cost_center: 'RH', periodicity: 'mensal', due_day: 5,
        amount: active.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        is_active: active.length > 0,
        children: [...salaries].sort((a, b) => (a.notes || '').localeCompare(b.notes || '', 'pt-BR')),
      });
    }

    return list
      .filter(e => !fCentro || (e.cost_center || '—') === fCentro)
      .filter(e => !fCat || catOf(e) === fCat)
      .filter(e => !fStatus || (fStatus === 'ativa' ? e.is_active !== false : e.is_active === false))
      .sort((a, b) => nextDue(a) - nextDue(b));
  }, [items, fCentro, fCat, fStatus]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const curPage = Math.min(page, pageCount);
  const pageRows = rows.slice((curPage - 1) * pageSize, curPage * pageSize);

  // Totais da lista filtrada (só ativas somam)
  const totals = useMemo(() => {
    const act = rows.filter(r => r.is_active !== false);
    return {
      original: act.reduce((s, r) => s + (Number(r.__group ? r.amount : (r.original_amount ?? r.amount)) || 0), 0),
      monthly: act.reduce((s, r) => s + (Number(r.amount) || 0), 0),
    };
  }, [rows]);

  // Distribuição por categoria (só ativas)
  const dist = useMemo(() => {
    const byCat = {};
    for (const e of items) {
      if (e.is_active === false) continue;
      const c = LEGEND_ORDER.includes(catOf(e)) ? catOf(e) : 'Outros';
      byCat[c] = (byCat[c] || 0) + (Number(e.amount) || 0);
    }
    return LEGEND_ORDER.map(c => ({ cat: c, value: byCat[c] || 0 }));
  }, [items]);
  const distNonZero = dist.filter(d => d.value > 0);

  // Próximos vencimentos (ativas; colaboradores agrupados)
  const upcoming = useMemo(() => {
    const list = rows.filter(r => r.is_active !== false)
      .map(r => ({ id: r.id, name: r.name, amount: r.__group ? r.amount : (Number(r.original_amount ?? r.amount) || 0), due: nextDue(r) }))
      .sort((a, b) => a.due - b.due);
    return list;
  }, [rows]);

  const centros = useMemo(() => [...new Set(items.map(e => e.cost_center).filter(Boolean))], [items]);

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  const filterCount = rows.length + rows.filter(r => r.__group).reduce((s, r) => s + r.children.length - 1, 0);

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
        <div className="xl:col-span-3 space-y-4">
          <div className="card overflow-hidden">
            {/* Filtros + período + nova despesa */}
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2">
              <select className="input py-1.5 text-sm w-auto" value={fCentro} onChange={e => { setFCentro(e.target.value); setPage(1); }}>
                <option value="">Todos os Centros</option>
                {centros.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input py-1.5 text-sm w-auto" value={fCat} onChange={e => { setFCat(e.target.value); setPage(1); }}>
                <option value="">Todas as Categorias</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <select className="input py-1.5 text-sm w-auto" value={fStatus} onChange={e => { setFStatus(e.target.value); setPage(1); }}>
                <option value="">Todos os Status</option>
                <option value="ativa">Ativa</option>
                <option value="inativa">Inativa</option>
              </select>
              <div className="flex-1" />
              <div className="flex items-center gap-1.5 text-sm text-gray-600">
                <CalendarDays size={15} className="text-gray-400" />
                <input type="month" className="input py-1.5 text-sm w-auto" value={refMonth}
                  onChange={e => setRefMonth(e.target.value)} />
              </div>
              <button className="btn-primary" onClick={() => setModal({})}>
                <Plus size={15} /> Nova Despesa
              </button>
            </div>

            {/* Tabela */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2.5">Despesa</th>
                    <th className="px-3 py-2.5">Categoria</th>
                    <th className="px-3 py-2.5">Centro de Custo</th>
                    <th className="px-3 py-2.5">Tipo</th>
                    <th className="px-3 py-2.5">Periodicidade</th>
                    <th className="px-3 py-2.5 text-right">Valor Original</th>
                    <th className="px-3 py-2.5 text-right">Valor Mensal</th>
                    <th className="px-3 py-2.5 text-right">% Rateio</th>
                    <th className="px-3 py-2.5 text-right">Rateio por Unidade</th>
                    <th className="px-3 py-2.5">Vencimento</th>
                    <th className="px-3 py-2.5">Status</th>
                    <th className="px-3 py-2.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map(exp => {
                    const cat = catOf(exp);
                    const m = meta(cat);
                    const active = exp.is_active !== false;
                    const monthly = Number(exp.amount) || 0;
                    const original = exp.__group ? monthly : (Number(exp.original_amount ?? exp.amount) || 0);
                    const pct = active && total > 0 ? (monthly / total) * 100 : 0;
                    const rateado = active && units > 0 ? monthly / units : 0;
                    const due = nextDue(exp);
                    const Icon = exp.__group ? Users : iconFor(exp.name);

                    const mainRow = (
                      <tr key={exp.id}
                        className={`border-b border-gray-50 hover:bg-gray-50/60 ${!active ? 'opacity-55' : ''} ${exp.__group ? 'cursor-pointer' : ''}`}
                        onClick={exp.__group ? () => setShowEmps(v => !v) : undefined}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            {exp.__group && (showEmps
                              ? <ChevronDown size={15} className="text-gray-400 shrink-0" />
                              : <ChevronRight size={15} className="text-gray-400 shrink-0" />)}
                            <span className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                              style={{ background: m.bg }}>
                              <Icon size={16} style={{ color: m.text }} />
                            </span>
                            <span className="min-w-0">
                              <span className="block font-semibold text-gray-900 truncate">{exp.name}</span>
                              <span className="block text-xs text-gray-400 truncate">{exp.notes || '—'}</span>
                            </span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5"><CatPill cat={cat} /></td>
                        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{exp.cost_center || '—'}</td>
                        <td className="px-3 py-2.5"><TipoPill /></td>
                        <td className="px-3 py-2.5 text-gray-600">{exp.periodicity === 'anual' ? 'Anual' : 'Mensal'}</td>
                        <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtBRL(original)}</td>
                        <td className="px-3 py-2.5 text-right font-medium whitespace-nowrap">{fmtBRL(monthly)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-600">{pct.toFixed(2).replace('.', ',')}%</td>
                        <td className="px-3 py-2.5 text-right text-gray-600 whitespace-nowrap">{fmtBRL4(rateado)}</td>
                        <td className={`px-3 py-2.5 whitespace-nowrap ${isSoon(due) ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                          {fmtDate(due)}
                        </td>
                        <td className="px-3 py-2.5"><StatusPill active={active} /></td>
                        <td className="px-3 py-2.5">
                          {exp.__group ? (
                            <span className="block text-center text-[11px] text-gray-400">RH</span>
                          ) : (
                            <div className="flex items-center justify-center gap-1">
                              <button className="btn-ghost p-1.5 text-blue-600" title="Editar"
                                onClick={ev => { ev.stopPropagation(); setModal(exp); }}>
                                <Pencil size={14} />
                              </button>
                              <button className="btn-ghost p-1.5 text-red-500" title="Excluir"
                                onClick={ev => { ev.stopPropagation(); removeExpense(exp); }}>
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );

                    if (!exp.__group || !showEmps) return mainRow;

                    return [mainRow, ...exp.children.map(ch => {
                      const chActive = ch.is_active !== false;
                      const chAmt = Number(ch.amount) || 0;
                      const chPct = chActive && total > 0 ? (chAmt / total) * 100 : 0;
                      const chRat = chActive && units > 0 ? chAmt / units : 0;
                      return (
                        <tr key={ch.id} className={`border-b border-gray-50 bg-gray-50/40 ${!chActive ? 'opacity-55' : ''}`}>
                          <td className="px-4 py-2">
                            <span className="flex items-center gap-2 pl-12 text-gray-700">
                              <User size={13} className="text-gray-400 shrink-0" /> {ch.notes || '—'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-400">Salário</td>
                          <td className="px-3 py-2 text-gray-500">RH</td>
                          <td className="px-3 py-2"><TipoPill /></td>
                          <td className="px-3 py-2 text-gray-500">Mensal</td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{fmtBRL(chAmt)}</td>
                          <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{fmtBRL(chAmt)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{chPct.toFixed(2).replace('.', ',')}%</td>
                          <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{fmtBRL4(chRat)}</td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{fmtDate(nextDue(ch))}</td>
                          <td className="px-3 py-2"><StatusPill active={chActive} /></td>
                          <td className="px-3 py-2 text-center">
                            <span className="text-[11px] text-gray-400" title="O salário vem do cadastro do colaborador — edite lá">
                              via cadastro
                            </span>
                          </td>
                        </tr>
                      );
                    })];
                  })}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={12} className="text-center py-10 text-sm text-gray-400">
                      {items.length === 0
                        ? 'Nenhuma despesa fixa cadastrada — clique em Nova Despesa.'
                        : 'Nenhuma despesa encontrada para esse filtro.'}
                    </td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                      <td className="px-4 py-3 font-bold text-gray-900 uppercase text-xs" colSpan={5}>Total Geral</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmtBRL(totals.original)}</td>
                      <td className="px-3 py-3 text-right font-bold text-green-600 whitespace-nowrap">{fmtBRL(totals.monthly)}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">100,00%</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{fmtBRL4(perUnit)}</td>
                      <td colSpan={3} />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {/* Rodapé: contagem + paginação */}
            <div className="px-4 py-2.5 border-t border-gray-100 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="text-xs">{filterCount} registro{filterCount === 1 ? '' : 's'} encontrado{filterCount === 1 ? '' : 's'}</span>
              <div className="flex-1" />
              <select className="input py-1 text-xs w-auto" value={pageSize}
                onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>
                <option value={10}>10 por página</option>
                <option value={25}>25 por página</option>
                <option value={50}>50 por página</option>
              </select>
              <div className="flex items-center gap-0.5">
                <button className="btn-ghost p-1 disabled:opacity-30" disabled={curPage === 1} onClick={() => setPage(1)}><ChevronsLeft size={15} /></button>
                <button className="btn-ghost p-1 disabled:opacity-30" disabled={curPage === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft size={15} /></button>
                {Array.from({ length: pageCount }, (_, i) => i + 1).slice(Math.max(0, curPage - 3), curPage + 2).map(n => (
                  <button key={n} onClick={() => setPage(n)}
                    className={`w-7 h-7 rounded-md text-xs font-semibold ${n === curPage ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
                    {n}
                  </button>
                ))}
                <button className="btn-ghost p-1 disabled:opacity-30" disabled={curPage === pageCount} onClick={() => setPage(p => p + 1)}><ChevronRight size={15} /></button>
                <button className="btn-ghost p-1 disabled:opacity-30" disabled={curPage === pageCount} onClick={() => setPage(pageCount)}><ChevronsRight size={15} /></button>
              </div>
            </div>
          </div>
        </div>

        {/* ═══ COLUNA DIREITA ═══ */}
        <div className="space-y-4">
          {/* RESUMO DO RATEIO */}
          <div className="card p-4 space-y-2.5">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <ClipboardList size={15} className="text-primary-500" /> Resumo do Rateio
            </h2>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-500">Total de Custos Fixos</span>
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
            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Custo Fixo por Unidade</span>
              <span className="font-bold text-green-600">{fmtBRL4(perUnit)}</span>
            </div>
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
                        {total > 0 ? ((d.value / total) * 100).toFixed(2).replace('.', ',') : '0,00'}%
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
            {(showAllDue ? upcoming : upcoming.slice(0, 3)).map(u => (
              <div key={u.id} className="flex items-center gap-2 text-xs">
                <span className={`font-semibold whitespace-nowrap ${isSoon(u.due) ? 'text-red-500' : 'text-gray-500'}`}>
                  {fmtDate(u.due)}
                </span>
                <span className="text-gray-600 truncate flex-1">{u.name}</span>
                <span className="font-semibold text-gray-900 whitespace-nowrap">{fmtBRL(u.amount)}</span>
              </div>
            ))}
            {upcoming.length > 3 && (
              <button className="text-xs text-primary-600 hover:underline"
                onClick={() => setShowAllDue(v => !v)}>
                {showAllDue ? 'Mostrar menos' : `Ver todos vencimentos (${upcoming.length})`}
              </button>
            )}
          </div>

          {/* DICAS */}
          <div className="card p-4 space-y-2">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <Lightbulb size={15} className="text-amber-500" /> Dicas
            </h2>
            <ul className="text-xs text-gray-500 space-y-1.5">
              {['Mantenha seus custos sempre atualizados.',
                'A produção mensal impacta diretamente no rateio por unidade.',
                'Despesas anuais são rateadas automaticamente.'].map(t => (
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
