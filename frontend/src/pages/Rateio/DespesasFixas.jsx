import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip } from 'chart.js';
import {
  Plus, Loader2, Pencil, Trash2, Lightbulb, X, Save, Check,
  ChevronLeft, ChevronRight, CalendarDays, CircleDollarSign,
  PieChart as PieIcon, BarChart3, ClipboardList, TrendingUp, TrendingDown,
  Factory, FlaskConical, ArrowRight, Minus,
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
  Depreciação:    { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', dot: '#6366f1' },
};
const CATEGORIES = Object.keys(CAT_META);
const LEGEND_ORDER = ['Marketing', 'Administrativa', 'Tecnologia', 'Financeiro', 'Logística', 'RH', 'Outros'];
const COST_CENTERS = ['Administrativo', 'Comercial', 'Produção', 'Tecnologia', 'Logística', 'Financeiro', 'RH'];

// Origem do lançamento — de onde a despesa veio
const ORIGINS = {
  manual:     { label: 'Manual',     cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  rh:         { label: 'RH',         cls: 'bg-green-50 text-green-700 border-green-200' },
  financeiro: { label: 'Financeiro', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
  contratos:  { label: 'Contratos',  cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  // Calculada em Engenharia de Custos › Maquinários (depreciação + manutenção).
  maquinario: { label: 'Maquinários', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};
const originOf = e => e.origin || (e.employee_id ? 'rh' : 'manual');

// Fonte da produção mensal (não se digita mais aqui — vem de Metas/Produção)
const UNITS_SOURCE = {
  meta:     { label: 'Meta de produção', hint: 'definida no Simulador de Metas' },
  producao: { label: 'Produção do mês',  hint: 'apurada no módulo de Produção' },
  vendas:   { label: 'Média de vendas',  hint: 'média dos últimos 90 dias' },
};
const MONTH_NAMES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Paleta para categorias personalizadas (cor estável derivada do nome)
const EXTRA_META = [
  { text: '#4338ca', bg: '#eef2ff', border: '#c7d2fe', dot: '#4f46e5' },
  { text: '#9333ea', bg: '#faf5ff', border: '#e9d5ff', dot: '#a855f7' },
  { text: '#0891b2', bg: '#ecfeff', border: '#a5f3fc', dot: '#06b6d4' },
  { text: '#ca8a04', bg: '#fefce8', border: '#fef08a', dot: '#eab308' },
  { text: '#be123c', bg: '#fff1f2', border: '#fecdd3', dot: '#f43f5e' },
  { text: '#15803d', bg: '#f0fdf4', border: '#bbf7d0', dot: '#16a34a' },
];

const catOf = exp => exp.category || 'Outros';
const meta = cat => {
  if (CAT_META[cat]) return CAT_META[cat];
  if (!cat) return CAT_META.Outros;
  let h = 0;
  for (const ch of String(cat)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return EXTRA_META[h % EXTRA_META.length];
};
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
function ExpenseModal({ open, initial, categories = [], onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const f = form || {
    name: initial?.name || '',
    notes: initial?.notes || '',
    category: initial?.category || 'Administrativa',
    cost_center: initial?.cost_center || 'Administrativo',
    origin: originOf(initial || {}),
    custom: '',
    periodicity: initial?.periodicity || 'mensal',
    amount: initial?.original_amount != null || initial?.amount != null
      ? Number(initial.original_amount ?? initial.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
      : '',
    due_day: initial?.due_day || 5,
    due_month: initial?.due_month || 1,
    is_active: initial?.is_active !== false,
  };
  const set = patch => setForm({ ...f, ...patch });
  // Todas as categorias disponíveis (padrão + personalizadas já em uso)
  const catOptions = [...new Set([...CATEGORIES, ...categories])];

  async function save() {
    const name = f.name.trim();
    if (!name) { toast.error('Informe o nome da despesa'); return; }
    const category = f.category === '__nova' ? f.custom.trim() : f.category;
    if (!category) { toast.error('Dê um nome à nova categoria'); return; }
    const amount = moneyToNumber(f.amount);
    if (!(amount >= 0)) { toast.error('Informe um valor válido'); return; }
    setSaving(true);
    try {
      const payload = {
        name, notes: f.notes, amount,
        category, cost_center: f.cost_center, origin: f.origin,
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={f.category} onChange={e => set({ category: e.target.value })}>
              {catOptions.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__nova">➕ Nova categoria...</option>
            </select>
          </div>
          {f.category === '__nova' && (
            <div>
              <label className="label">Nome da categoria</label>
              <input className="input" value={f.custom} placeholder="Ex.: Impostos" autoFocus
                onChange={e => set({ custom: e.target.value })} />
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Centro de Custo</label>
            <select className="input" value={f.cost_center} onChange={e => set({ cost_center: e.target.value })}>
              {COST_CENTERS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Origem do lançamento</label>
            <select className="input" value={f.origin} disabled={!!initial?.employee_id}
              onChange={e => set({ origin: e.target.value })}>
              {Object.entries(ORIGINS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            {initial?.employee_id && <p className="text-[11px] text-gray-400 mt-1">Vem do RH — não editável aqui.</p>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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

// ─── Modal: Analisar Impacto (simulação de cenários) ───────
// Nada aqui altera dados — é só projeção sobre os números atuais.
function ImpactModal({ open, total, units, onClose }) {
  const [pct, setPct] = useState(0);          // variação % nas despesas
  const [nova, setNova] = useState('');       // nova despesa mensal (R$)
  const [prod, setProd] = useState(units || 0); // produção simulada

  const novaVal = moneyToNumber(nova) || 0;
  const totalSim = total * (1 + pct / 100) + novaVal;
  const prodSim = Number(prod) || 0;
  const unitAtual = units > 0 ? total / units : 0;
  const unitSim = prodSim > 0 ? totalSim / prodSim : 0;
  const difTotal = totalSim - total;
  const difUnit = unitSim - unitAtual;

  function reset() { setPct(0); setNova(''); setProd(units || 0); }

  return (
    <Modal isOpen={open} onClose={() => { reset(); onClose(); }} title="Analisar impacto" size="md">
      <div className="space-y-4">
        <p className="text-xs text-gray-500">
          Simule cenários sobre os números atuais. <b>Nada é salvo</b> — serve para decidir antes de mexer.
        </p>

        <div>
          <label className="label">Variação nas despesas fixas: <span className={pct > 0 ? 'text-red-600' : pct < 0 ? 'text-green-600' : ''}>{pct > 0 ? '+' : ''}{pct}%</span></label>
          <input type="range" min="-50" max="50" step="1" value={pct}
            onChange={e => setPct(Number(e.target.value))} className="w-full accent-primary-600" />
          <div className="flex justify-between text-[11px] text-gray-400"><span>-50%</span><span>0</span><span>+50%</span></div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nova despesa mensal (R$)</label>
            <input className="input" inputMode="decimal" value={nova} placeholder="0,00"
              onChange={e => setNova(fmtMoney(e.target.value))} />
          </div>
          <div>
            <label className="label">Produção simulada (un/mês)</label>
            <input type="number" min="0" className="input" value={prod}
              onChange={e => setProd(e.target.value)} />
          </div>
        </div>

        {/* Resultado */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-3 text-xs font-semibold text-gray-500 uppercase bg-gray-50 px-3 py-2">
            <span>Indicador</span><span className="text-right">Atual</span><span className="text-right">Simulado</span>
          </div>
          {[
            ['Total fixo/mês', fmtBRL(total), fmtBRL(totalSim), difTotal],
            ['Produção (un)', fmtQty(units), fmtQty(prodSim), prodSim - units],
            ['Custo por unidade', fmtBRL4(unitAtual), fmtBRL4(unitSim), difUnit],
          ].map(([label, a, b, dif]) => (
            <div key={label} className="grid grid-cols-3 px-3 py-2.5 border-t border-gray-100 text-sm items-center">
              <span className="text-gray-600">{label}</span>
              <span className="text-right text-gray-500">{a}</span>
              <span className={`text-right font-semibold ${dif > 0 ? 'text-red-600' : dif < 0 ? 'text-green-600' : 'text-gray-900'}`}>
                {b}
              </span>
            </div>
          ))}
        </div>

        <div className={`rounded-xl px-3 py-2.5 text-sm border ${
          difUnit > 0 ? 'bg-red-50 border-red-200 text-red-700'
          : difUnit < 0 ? 'bg-green-50 border-green-200 text-green-700'
          : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
          {difUnit === 0 ? 'Sem mudança no custo por unidade.' : (
            <>
              O custo por unidade {difUnit > 0 ? 'sobe' : 'cai'} <b>{fmtBRL4(Math.abs(difUnit))}</b>
              {unitAtual > 0 && <> ({pctBR(Math.abs(difUnit / unitAtual) * 100)})</>}.
              {' '}Cada 1.000 peças {difUnit > 0 ? 'custam' : 'economizam'} <b>{fmtBRL(Math.abs(difUnit) * 1000)}</b> a {difUnit > 0 ? 'mais' : 'menos'}.
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button className="btn-secondary" onClick={reset}>Limpar</button>
          <button className="btn-primary" onClick={() => { reset(); onClose(); }}>Fechar</button>
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
  const [fOrigem, setFOrigem] = useState('');
  const [impactOpen, setImpactOpen] = useState(false);
  const [showAllDue, setShowAllDue] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const { data: sum, isLoading, refetch } = useQuery({
    queryKey: ['rateio-summary'],
    queryFn: () => api.get('/rateio/summary'),
  });
  const { data: comp } = useQuery({
    queryKey: ['rateio-comparativo', refMonth],
    queryFn: () => api.get(`/rateio/comparativo?month=${refMonth}`),
  });

  const items = sum?.items || [];
  const total = sum?.total || 0;             // fixas ativas (inclui folha adm.)
  const units = sum?.monthly_units || 0;
  const perUnit = sum?.overhead_unit || 0;
  const prodLabor = sum?.prod_labor_total || 0;
  const source = sum?.monthly_units_source || 'vendas';

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
    if (!next && !confirm(`Desativar a despesa "${exp.name}"?\nEla sai do rateio e não gera conta do mês (o histórico é mantido).`)) return;
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
    .filter(e => !fOrigem || originOf(e) === fOrigem)
    .sort((a, b) => nextDue(a) - nextDue(b)),
  [expenses, fCat, fStatus, fTipo, fOrigem]);

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
            <select className="input py-1.5 text-sm w-auto" value={fOrigem} onChange={e => { setFOrigem(e.target.value); setPage(1); }}>
              <option value="">Todas as Origens</option>
              {Object.entries(ORIGINS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <div className="flex-1" />
            <button className="btn-secondary" onClick={() => setImpactOpen(true)}>
              <FlaskConical size={15} /> Analisar impacto
            </button>
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
                    <th className="px-2 py-2">Centro de Custo</th>
                    <th className="px-2 py-2">Origem</th>
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
                        <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{exp.cost_center || '—'}</td>
                        <td className="px-2 py-2">
                          {(() => {
                            const o = ORIGINS[originOf(exp)] || ORIGINS.manual;
                            return (
                              <span className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${o.cls}`}>
                                {o.label}
                              </span>
                            );
                          })()}
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
                        <td className="px-2 py-2">{exp.readonly ? <StatusPill active={active} onToggle={() => {}} /> : <StatusPill active={active} onToggle={() => toggleActive(exp)} />}</td>
                        <td className="px-2 py-2">
                          {exp.readonly ? (
                            <div className="flex items-center justify-center">
                              <a className="text-[11.5px] text-primary-600 hover:underline whitespace-nowrap"
                                href={`/engenharia/${exp.category === 'Tecnologia' ? 'computadores' : 'maquinarios'}?id=${exp.maquina_id}`}
                                title="Calculada pela depreciação e manutenção — edite no cadastro do equipamento">abrir equipamento</a>
                            </div>
                          ) : (
                          <div className="flex items-center justify-center gap-1">
                            <button className="btn-ghost p-1.5 text-blue-600" title="Editar" onClick={() => setModal(exp)}>
                              <Pencil size={14} />
                            </button>
                            <button className="btn-ghost p-1.5 text-red-500" title="Excluir" onClick={() => removeExpense(exp)}>
                              <Trash2 size={14} />
                            </button>
                          </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {pageRows.length === 0 && (
                    <tr><td colSpan={13} className="text-center py-10 text-sm text-gray-400">
                      {expenses.length === 0
                        ? 'Nenhuma despesa fixa cadastrada — clique em Nova Despesa.'
                        : 'Nenhuma despesa encontrada para esse filtro.'}
                    </td></tr>
                  )}
                </tbody>
                {rows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                      <td className="px-4 py-3" colSpan={6}>
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
            {/* Produção não é mais digitada aqui — vem de Metas ou Produção */}
            <div className="flex justify-between items-start text-sm gap-2">
              <span className="text-gray-500 shrink-0">Produção Mensal Estimada</span>
              <span className="text-right">
                <span className="font-semibold">{fmtQty(units)} un</span>
                <Link to={source === 'producao' ? '/production' : '/rateio/metas'}
                  className="block text-[11px] text-primary-600 hover:underline"
                  title={UNITS_SOURCE[source]?.hint}>
                  {UNITS_SOURCE[source]?.label} ↗
                </Link>
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

          {/* COMPARATIVO */}
          <div className="card p-4 space-y-2.5">
            <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
              <BarChart3 size={15} className="text-primary-500" /> Comparativo
            </h2>
            {!comp ? (
              <p className="text-sm text-gray-400">Carregando...</p>
            ) : (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Mês atual</span>
                  <span className="font-bold text-gray-900">{fmtBRL(comp.atual)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Mês anterior</span>
                  <span className="font-medium">{comp.anterior > 0 ? fmtBRL(comp.anterior) : '—'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Média 12 meses</span>
                  <span className="font-medium">{comp.media_12m > 0 ? fmtBRL(comp.media_12m) : '—'}</span>
                </div>

                {/* Variação vs mês anterior */}
                <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-100">
                  <span className="text-gray-600 font-medium">Variação</span>
                  {comp.variacao_pct == null ? (
                    <span className="text-gray-400 text-xs">sem base anterior</span>
                  ) : (
                    <span className={`inline-flex items-center gap-1 font-bold ${
                      comp.variacao_pct > 0 ? 'text-red-600' : comp.variacao_pct < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                      {comp.variacao_pct > 0 ? <TrendingUp size={14} /> : comp.variacao_pct < 0 ? <TrendingDown size={14} /> : <Minus size={14} />}
                      {comp.variacao_pct > 0 ? '+' : ''}{pctBR(comp.variacao_pct)}
                    </span>
                  )}
                </div>
                {comp.variacao_pct != null && (
                  <p className="text-[11px] text-gray-400 text-right -mt-1">
                    {comp.variacao_valor > 0 ? '+' : ''}{fmtBRL(comp.variacao_valor)} vs mês anterior
                  </p>
                )}
                {comp.vs_media_pct != null && (
                  <p className="text-[11px] text-gray-400">
                    Contra a média de 12 meses:{' '}
                    <span className={comp.vs_media_pct > 0 ? 'text-red-500' : 'text-green-600'}>
                      {comp.vs_media_pct > 0 ? '+' : ''}{pctBR(comp.vs_media_pct)}
                    </span>
                    {comp.meses_com_dados < 12 && <span className="text-gray-300"> ({comp.meses_com_dados} meses com dados)</span>}
                  </p>
                )}
                {comp.anterior === 0 && comp.media_12m === 0 && (
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                    Sem histórico ainda. O comparativo se forma conforme as contas do mês forem geradas na Central de Contas.
                  </p>
                )}
              </>
            )}
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
        categories={[...new Set(expenses.map(catOf))]}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); invalidate(); }} />

      <ImpactModal open={impactOpen} total={total} units={units}
        onClose={() => setImpactOpen(false)} />
    </div>
  );
}
