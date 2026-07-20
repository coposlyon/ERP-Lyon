import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip } from 'chart.js';
import {
  Plus, Loader2, Pencil, Trash2, Lightbulb, X, Save, Check,
  ChevronDown, ChevronRight, Users, User, CalendarDays,
  Wallet, PieChart as PieIcon, LayoutGrid, Factory,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';
import { iconFor } from '@/pages/Pricing/fixedCostIcons';

ChartJS.register(ArcElement, ChartTooltip);

// ─── Categorias padrão com identidade visual ───────────────
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
const DEFAULT_CATS = Object.keys(CAT_META);
const EXTRA_DOTS = ['#4338ca', '#9333ea', '#f97316', '#0ea5e9', '#ef4444', '#22c55e', '#eab308', '#14b8a6', '#ec4899', '#6b7280'];
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const catOf = exp => exp.category || (exp.employee_id ? 'RH' : 'Outros');
function metaFor(cat) {
  if (CAT_META[cat]) return CAT_META[cat];
  let h = 0;
  for (const ch of String(cat || '')) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return { text: '#374151', bg: '#f9fafb', border: '#e5e7eb', dot: EXTRA_DOTS[h % EXTRA_DOTS.length] };
}

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
const isSoon = dt => dt && (dt - new Date()) / 86400000 <= 14;
const pctBR = v => `${v.toFixed(2).replace('.', ',')}%`;

const StatusPill = ({ active }) => (
  <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
    active ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-gray-100 text-gray-500 border-gray-200'}`}>
    {active ? 'Ativa' : 'Inativa'}
  </span>
);

// ─── Modal de adicionar/editar despesa ─────────────────────
function ExpenseModal({ open, initial, cards, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const f = form || {
    name: initial?.name || '',
    notes: initial?.notes || '',
    category: initial?.category || (initial?.id ? catOf(initial) : (cards[0] || 'Administrativa')),
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Card / Categoria</label>
            <select className="input" value={f.category} onChange={e => set({ category: e.target.value })}>
              {cards.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Periodicidade</label>
            <select className="input" value={f.periodicity} onChange={e => set({ periodicity: e.target.value })}>
              <option value="mensal">Mensal</option>
              <option value="anual">Anual</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{f.periodicity === 'anual' ? 'Valor Anual (R$)' : 'Valor Mensal (R$)'}</label>
            <input className="input" inputMode="decimal" value={f.amount} placeholder="600,00"
              onChange={e => set({ amount: fmtMoney(e.target.value) })} />
          </div>
          <div>
            <label className="label">Dia de vencimento</label>
            <input type="number" min="1" max="31" className="input" value={f.due_day}
              onChange={e => set({ due_day: e.target.value })} />
          </div>
        </div>
        {f.periodicity === 'anual' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Mês de vencimento</label>
              <select className="input" value={f.due_month} onChange={e => set({ due_month: Number(e.target.value) })}>
                {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
            <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 self-end">
              Rateada em 12x{moneyToNumber(f.amount) >= 0 && <> — <b>{fmtBRL(moneyToNumber(f.amount) / 12)}/mês</b></>}
            </p>
          </div>
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

// ─── Card de uma categoria de despesas ─────────────────────
function CategoryCard({ cat, items, total, units, onEdit, onRemove, onRemoveCard }) {
  const [open, setOpen] = useState(true);
  const m = metaFor(cat);
  const active = items.filter(e => e.is_active !== false);
  const cardTotal = active.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  return (
    <div className="card overflow-hidden">
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full px-4 py-3 flex items-center gap-2.5 hover:bg-gray-50/60 transition-colors">
        {open ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
        <span className="w-2.5 h-2.5 rounded-full" style={{ background: m.dot }} />
        <span className="font-semibold text-gray-900">{cat}</span>
        <span className="text-xs text-gray-400">{items.length} despesa{items.length === 1 ? '' : 's'}</span>
        {items.length === 0 && onRemoveCard && (
          <span role="button" title="Remover card vazio"
            onClick={e => { e.stopPropagation(); onRemoveCard(cat); }}
            className="text-gray-300 hover:text-red-500 p-0.5"><X size={14} /></span>
        )}
        <span className="flex-1" />
        <span className="text-sm font-bold text-gray-900">{fmtBRL(cardTotal)}<span className="text-xs font-normal text-gray-400">/mês</span></span>
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-gray-100">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Despesa</th>
                <th className="px-3 py-2">Periodicidade</th>
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2 text-right">Valor Mensal</th>
                <th className="px-3 py-2 text-right">% Rateio</th>
                <th className="px-3 py-2 text-right">Rateio/Un</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {items.map(exp => {
                const activeRow = exp.is_active !== false;
                const monthly = Number(exp.amount) || 0;
                const original = Number(exp.original_amount ?? exp.amount) || 0;
                const due = nextDue(exp);
                const Icon = iconFor(exp.name);
                return (
                  <tr key={exp.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${!activeRow ? 'opacity-55' : ''}`}>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2.5">
                        <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: m.bg }}>
                          <Icon size={15} style={{ color: m.text }} />
                        </span>
                        <span className="min-w-0">
                          <span className="block font-medium text-gray-900 truncate">{exp.name}</span>
                          <span className="block text-xs text-gray-400 truncate">{exp.notes || '—'}</span>
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-600 whitespace-nowrap">
                      {exp.periodicity === 'anual' ? <>Anual <span className="text-xs text-gray-400">({fmtBRL(original)}/ano)</span></> : 'Mensal'}
                    </td>
                    <td className={`px-3 py-2 whitespace-nowrap ${isSoon(due) && activeRow ? 'text-red-500 font-medium' : 'text-gray-600'}`}>
                      {fmtDate(due)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{fmtBRL(monthly)}</td>
                    <td className="px-3 py-2 text-right text-gray-600">{pctBR(activeRow && total > 0 ? (monthly / total) * 100 : 0)}</td>
                    <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{fmtBRL4(activeRow && units > 0 ? monthly / units : 0)}</td>
                    <td className="px-3 py-2"><StatusPill active={activeRow} /></td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-center gap-1">
                        <button className="btn-ghost p-1.5 text-blue-600" title="Editar" onClick={() => onEdit(exp)}>
                          <Pencil size={14} />
                        </button>
                        <button className="btn-ghost p-1.5 text-red-500" title="Excluir" onClick={() => onRemove(exp)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={8} className="text-center py-6 text-xs text-gray-400">
                  Card vazio — use "Nova Despesa" e escolha este card.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────
export default function DespesasFixas() {
  const qc = useQueryClient();
  const today = new Date();
  const [refMonth, setRefMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  const [modal, setModal] = useState(null);
  const [cardModal, setCardModal] = useState(false);
  const [newCard, setNewCard] = useState('');
  const [showEmps, setShowEmps] = useState(true);
  const [showAllDue, setShowAllDue] = useState(false);

  const { data: sum, isLoading, refetch } = useQuery({
    queryKey: ['rateio-summary'],
    queryFn: () => api.get('/rateio/summary'),
  });

  const items = sum?.items || [];
  const total = sum?.total || 0;          // ativas (fixas + folha)
  const units = sum?.monthly_units || 0;
  const perUnit = sum?.overhead_unit || 0;
  const customCards = sum?.expense_cards || [];

  const salaries = useMemo(() => items.filter(e => e.employee_id), [items]);
  const expenses = useMemo(() => items.filter(e => !e.employee_id), [items]);
  const folhaTotal = salaries.filter(e => e.is_active !== false)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const fixasTotal = total - folhaTotal;

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

  async function saveCards(cards) {
    try {
      await api.put('/rateio/expense-cards', { expense_cards: cards });
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao salvar os cards'); }
  }

  function addCard() {
    const name = newCard.trim();
    if (!name) { toast.error('Dê um nome ao card'); return; }
    if (DEFAULT_CATS.includes(name) || customCards.includes(name)) { toast.error('Já existe um card com esse nome'); return; }
    saveCards([...customCards, name]);
    setNewCard('');
    setCardModal(false);
    toast.success(`Card "${name}" criado!`);
  }

  // Cards na tela: categorias com despesas + cards personalizados (mesmo vazios)
  const cards = useMemo(() => {
    const byCat = new Map();
    for (const e of expenses) {
      const c = catOf(e);
      if (!byCat.has(c)) byCat.set(c, []);
      byCat.get(c).push(e);
    }
    for (const list of byCat.values()) list.sort((a, b) => nextDue(a) - nextDue(b));
    const names = [
      ...DEFAULT_CATS.filter(c => byCat.has(c)),
      ...customCards.filter(c => !DEFAULT_CATS.includes(c)),
      ...[...byCat.keys()].filter(c => !DEFAULT_CATS.includes(c) && !customCards.includes(c)),
    ];
    return [...new Set(names)].map(c => ({ cat: c, items: byCat.get(c) || [] }));
  }, [expenses, customCards]);

  // Todos os nomes de card p/ o select do modal
  const allCardNames = useMemo(
    () => [...new Set([...DEFAULT_CATS, ...customCards])],
    [customCards]);

  // Distribuição por categoria (ativas; salários = RH)
  const dist = useMemo(() => {
    const byCat = new Map();
    for (const e of items) {
      if (e.is_active === false) continue;
      const c = catOf(e);
      byCat.set(c, (byCat.get(c) || 0) + (Number(e.amount) || 0));
    }
    return [...byCat.entries()].map(([cat, value]) => ({ cat, value }))
      .sort((a, b) => b.value - a.value);
  }, [items]);

  // Próximos vencimentos (ativas; folha como um item só)
  const upcoming = useMemo(() => {
    const list = expenses.filter(e => e.is_active !== false)
      .map(e => ({ id: e.id, name: e.name, amount: Number(e.original_amount ?? e.amount) || 0, due: nextDue(e) }));
    if (folhaTotal > 0) list.push({ id: '__folha', name: 'Colaboradores (folha)', amount: folhaTotal, due: nextDue({ due_day: 5 }) });
    return list.sort((a, b) => a.due - b.due);
  }, [expenses, folhaTotal]);

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ações */}
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">Despesas Fixas</h1>
          <p className="text-sm text-gray-500 mt-1">Gerencie todas as despesas fixas da empresa e o rateio por unidade produzida.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="month" className="input py-1.5 text-sm w-auto" value={refMonth}
            onChange={e => setRefMonth(e.target.value)} />
          <button className="btn-secondary" onClick={() => setCardModal(true)}>
            <LayoutGrid size={15} /> Novo Card
          </button>
          <button className="btn-primary" onClick={() => setModal({})}>
            <Plus size={15} /> Nova Despesa
          </button>
        </div>
      </div>

      {/* ═══ TOTAL GERAL (topo) ═══ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Wallet size={13} /> Total Geral de Tudo</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmtBRL(total)}</p>
          <p className="text-[11px] text-gray-400">despesas + folha, por mês</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><LayoutGrid size={13} /> Despesas Fixas</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmtBRL(fixasTotal)}</p>
          <p className="text-[11px] text-gray-400">soma dos cards abaixo</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Users size={13} /> Colaboradores (Folha)</p>
          <p className="text-2xl font-extrabold text-gray-900 mt-1">{fmtBRL(folhaTotal)}</p>
          <p className="text-[11px] text-gray-400">salários do RH</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Factory size={13} /> Custo Fixo por Unidade</p>
          <p className="text-2xl font-extrabold text-green-600 mt-1">{fmtBRL4(perUnit)}</p>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[11px] text-gray-400">produção:</span>
            <input type="number" min="0"
              className="input py-0 px-1 text-xs text-right w-20"
              key={`mu-${sum?.manual_units}`}
              defaultValue={sum?.manual_units ?? ''}
              placeholder={fmtQty(sum?.auto_monthly_units)}
              onBlur={e => { const v = e.target.value; if (v !== String(sum?.manual_units ?? '')) saveConfig({ monthly_units: v }); }} />
            <span className="text-[11px] text-gray-400">un</span>
          </div>
        </div>
      </div>

      {/* ═══ CARDS DE DESPESAS (um por categoria) ═══ */}
      {cards.map(({ cat, items: list }) => (
        <CategoryCard key={cat} cat={cat} items={list} total={total} units={units}
          onEdit={setModal} onRemove={removeExpense}
          onRemoveCard={customCards.includes(cat) ? (name => saveCards(customCards.filter(c => c !== name))) : null} />
      ))}
      {cards.length === 0 && (
        <div className="card p-10 text-center text-sm text-gray-400">
          Nenhuma despesa fixa cadastrada — clique em <b>Nova Despesa</b>.
        </div>
      )}

      {/* ═══ CARD DE COLABORADORES (folha) ═══ */}
      {salaries.length > 0 && (
        <div className="card overflow-hidden">
          <button type="button" onClick={() => setShowEmps(v => !v)}
            className="w-full px-4 py-3 flex items-center gap-2.5 hover:bg-gray-50/60 transition-colors">
            {showEmps ? <ChevronDown size={16} className="text-gray-400" /> : <ChevronRight size={16} className="text-gray-400" />}
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: CAT_META.RH.dot }} />
            <span className="font-semibold text-gray-900">Colaboradores</span>
            <span className="text-xs text-gray-400">
              folha de pagamento · {salaries.filter(e => e.is_active !== false).length} colaborador{salaries.filter(e => e.is_active !== false).length === 1 ? '' : 'es'}
            </span>
            <span className="flex-1" />
            <span className="text-sm font-bold text-gray-900">{fmtBRL(folhaTotal)}<span className="text-xs font-normal text-gray-400">/mês</span></span>
          </button>
          {showEmps && (
            <div className="overflow-x-auto border-t border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2">Colaborador</th>
                    <th className="px-3 py-2">Vencimento</th>
                    <th className="px-3 py-2 text-right">Salário</th>
                    <th className="px-3 py-2 text-right">% Rateio</th>
                    <th className="px-3 py-2 text-right">Rateio/Un</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2 text-center">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {salaries.map(ch => {
                    const activeRow = ch.is_active !== false;
                    const amt = Number(ch.amount) || 0;
                    return (
                      <tr key={ch.id} className={`border-b border-gray-50 hover:bg-gray-50/60 ${!activeRow ? 'opacity-55' : ''}`}>
                        <td className="px-4 py-2">
                          <span className="flex items-center gap-2.5">
                            <span className="w-8 h-8 rounded-full flex items-center justify-center shrink-0" style={{ background: CAT_META.RH.bg }}>
                              <User size={15} style={{ color: CAT_META.RH.text }} />
                            </span>
                            <span className="font-medium text-gray-900">{ch.notes || '—'}</span>
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{fmtDate(nextDue(ch))}</td>
                        <td className="px-3 py-2 text-right font-medium whitespace-nowrap">{fmtBRL(amt)}</td>
                        <td className="px-3 py-2 text-right text-gray-600">{pctBR(activeRow && total > 0 ? (amt / total) * 100 : 0)}</td>
                        <td className="px-3 py-2 text-right text-gray-600 whitespace-nowrap">{fmtBRL4(activeRow && units > 0 ? amt / units : 0)}</td>
                        <td className="px-3 py-2"><StatusPill active={activeRow} /></td>
                        <td className="px-3 py-2 text-center">
                          <span className="text-[11px] text-gray-400" title="O salário vem do cadastro do colaborador (RH) — edite lá">
                            via cadastro
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ═══ GRÁFICO + VENCIMENTOS + DICAS ═══ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <PieIcon size={15} className="text-primary-500" /> Distribuição por Categoria
          </h2>
          {dist.length === 0 ? (
            <p className="text-sm text-gray-400">Cadastre despesas para ver a distribuição.</p>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-28 h-28 shrink-0">
                <Doughnut
                  data={{
                    labels: dist.map(d => d.cat),
                    datasets: [{
                      data: dist.map(d => d.value),
                      backgroundColor: dist.map(d => metaFor(d.cat).dot),
                      borderWidth: 2, borderColor: '#fff',
                    }],
                  }}
                  options={{ plugins: { legend: { display: false } }, cutout: '58%', maintainAspectRatio: false }}
                />
              </div>
              <div className="flex-1 space-y-1 min-w-0">
                {dist.map(d => (
                  <div key={d.cat} className="flex items-center gap-1.5 text-xs">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: metaFor(d.cat).dot }} />
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

        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <CalendarDays size={15} className="text-primary-500" /> Próximos Vencimentos
          </h2>
          {upcoming.length === 0 && <p className="text-sm text-gray-400">Nenhuma despesa ativa.</p>}
          {(showAllDue ? upcoming : upcoming.slice(0, 5)).map(u => (
            <div key={u.id} className="flex items-center gap-2 text-xs">
              <span className={`font-semibold whitespace-nowrap ${isSoon(u.due) ? 'text-red-500' : 'text-gray-500'}`}>
                {fmtDate(u.due)}
              </span>
              <span className="text-gray-600 truncate flex-1">{u.name}</span>
              <span className="font-semibold text-gray-900 whitespace-nowrap">{fmtBRL(u.amount)}</span>
            </div>
          ))}
          {upcoming.length > 5 && (
            <button className="text-xs text-primary-600 hover:underline" onClick={() => setShowAllDue(v => !v)}>
              {showAllDue ? 'Mostrar menos' : `Ver todos vencimentos (${upcoming.length})`}
            </button>
          )}
        </div>

        <div className="card p-4 space-y-2">
          <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
            <Lightbulb size={15} className="text-amber-500" /> Dicas
          </h2>
          <ul className="text-xs text-gray-500 space-y-1.5">
            {['Mantenha seus custos sempre atualizados.',
              'A produção mensal impacta diretamente no rateio por unidade.',
              'Despesas anuais são rateadas automaticamente em 12x.',
              'Crie cards para organizar as contas do seu jeito.'].map(t => (
              <li key={t} className="flex items-start gap-1.5">
                <Check size={13} className="text-green-500 mt-0.5 shrink-0" /> {t}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Modal nova/editar despesa */}
      <ExpenseModal open={!!modal} initial={modal || {}} cards={allCardNames}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); invalidate(); }} />

      {/* Modal novo card */}
      <Modal isOpen={cardModal} onClose={() => setCardModal(false)} title="Novo card de despesas" size="sm">
        <div className="space-y-3">
          <div>
            <label className="label">Nome do card</label>
            <input className="input" value={newCard} placeholder="Ex.: Despesas Administrativas"
              onChange={e => setNewCard(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addCard()} autoFocus />
          </div>
          <p className="text-xs text-gray-400">
            O card agrupa despesas — ao criar ou editar uma despesa, escolha o card dela. O total de cada card aparece no topo do grupo.
          </p>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button className="btn-secondary" onClick={() => setCardModal(false)}><X size={14} /> Cancelar</button>
            <button className="btn-primary" onClick={addCard}><Save size={14} /> Criar card</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
