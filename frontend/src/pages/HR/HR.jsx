import { useState, useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Clock, Umbrella, DollarSign, FileText,
  Plus, Trash2, Check, ChevronLeft, ChevronRight,
  AlertCircle, CheckCircle, PenLine, MoreVertical,
  ArrowLeft, Search, X,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { format, parseISO, getDaysInMonth, addMonths, subMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { HRProvider, useHR } from './HRContext';

export const fmt     = v => new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' }).format(v||0);
export const fmtDate = d => { try { return format(parseISO(d), 'dd/MM/yyyy', { locale:ptBR }); } catch { return d||'—'; } };

export const DOC_TYPES = {
  ctps:        { l:'CTPS',         cls:'bg-blue-100   text-blue-700'  },
  aso:         { l:'ASO',          cls:'bg-teal-100   text-teal-700'  },
  contrato:    { l:'Contrato',     cls:'bg-indigo-100 text-indigo-700'},
  advertencia: { l:'Advertência',  cls:'bg-red-100    text-red-700'   },
  elogio:      { l:'Elogio',       cls:'bg-green-100  text-green-700' },
  atestado:    { l:'Atestado',     cls:'bg-yellow-100 text-yellow-700'},
  outros:      { l:'Outros',       cls:'bg-gray-100   text-gray-600'  },
};

export const VACATION_STATUS = {
  scheduled: { l:'Agendado', cls:'bg-blue-100   text-blue-700' },
  active:    { l:'Em curso', cls:'bg-green-100  text-green-700'},
  completed: { l:'Concluído',cls:'bg-gray-100   text-gray-500' },
  cancelled: { l:'Cancelado',cls:'bg-red-100    text-red-700'  },
};

export const PAYROLL_STATUS = {
  draft:    { l:'Rascunho', cls:'bg-gray-100   text-gray-600'  },
  approved: { l:'Aprovado', cls:'bg-blue-100   text-blue-700'  },
  paid:     { l:'Pago',     cls:'bg-green-100  text-green-700' },
};

// ── Selector de colaborador ───────────────────────────────
export function EmployeeSelector({ selected, onSelect }) {
  const [search, setSearch] = useState('');
  const { data } = useQuery({
    queryKey: ['employees-hr', search],
    queryFn: () => api.get(`/customers?type=CO&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`).then(d => d.data||[]),
  });

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <div className="flex-1 max-w-xs relative">
        <input className="input text-sm" placeholder="Buscar colaborador..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {data?.length > 0 && search && (
          <div className="absolute z-20 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto" style={{ top: 44 }}>
            {data.map(e => (
              <button key={e.id} type="button"
                className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                onClick={() => { onSelect(e); setSearch(''); }}>
                <span className="font-medium">{e.name}</span>
                <span className="text-gray-400 text-xs ml-2">{e.admission_data?.sector}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {selected && (
        <div className="flex items-center gap-2 px-3 py-2 bg-indigo-50 rounded-lg border border-indigo-100">
          <div className="w-7 h-7 bg-indigo-600 rounded-full flex items-center justify-center text-white text-xs font-bold">
            {selected.name?.charAt(0)}
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-900">{selected.name}</p>
            <p className="text-xs text-indigo-500">{selected.admission_data?.sector || 'Colaborador'}</p>
          </div>
          <button type="button" onClick={() => onSelect(null)}
            className="ml-1 text-indigo-300 hover:text-indigo-600 text-xs">✕</button>
        </div>
      )}
    </div>
  );
}

// ── helpers de ponto ──────────────────────────────────────
function hm(mins) {
  const x = Math.max(0, Math.round(mins || 0));
  const h = Math.floor(x / 60), m = x % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

const COLOR_CLS = {
  green:  'bg-green-100  text-green-700',
  red:    'bg-red-100    text-red-700',
  orange: 'bg-orange-100 text-orange-700',
  blue:   'bg-blue-100   text-blue-700',
  teal:   'bg-teal-100   text-teal-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  amber:  'bg-amber-100  text-amber-700',
  purple: 'bg-purple-100 text-purple-700',
  gray:   'bg-gray-100   text-gray-600',
};
const DOT_CLS = {
  green:'bg-green-500', red:'bg-red-500', orange:'bg-orange-400', blue:'bg-blue-500',
  teal:'bg-teal-500', indigo:'bg-indigo-500', amber:'bg-amber-500', purple:'bg-purple-500', gray:'bg-gray-300',
};

// Apura um dia: calcula situação, atraso (com tolerância) e chips a exibir.
function buildDay(date, entry, escala, admDate, todayStart, situMap, holidays) {
  const dateStr   = format(date, 'yyyy-MM-dd');
  const dow       = date.getDay();
  const isPast    = date < todayStart;
  const isToday   = date.getTime() === todayStart.getTime();
  const isFuture  = date > todayStart;
  const weekdays  = (escala.weekdays && escala.weekdays.length) ? escala.weekdays : [1,2,3,4,5];
  const isWeekend = !weekdays.includes(dow);
  const isBeforeAdm = admDate ? date < admDate : false;
  const holidayName = holidays?.[dateStr] || null;
  const expected  = escala.daily_minutes ?? 480;
  const tolerance = escala.tolerance_minutes ?? 10;

  const markTimes = (entry?.marks?.length
    ? entry.marks.map(m => m.time)
    : [entry?.entry1, entry?.exit1, entry?.entry2, entry?.exit2].filter(Boolean));
  const workedMin = entry?.total_minutes || 0;
  const extraMin  = entry?.extra_minutes || 0;
  const hasMarks  = markTimes.length > 0;
  const overrideCode = entry?.override_situation || null;
  const override  = overrideCode ? (situMap[overrideCode] || { code:overrideCode, name:overrideCode, color:'blue' }) : null;

  let type = 'future', lateMin = 0;
  if (isBeforeAdm)       type = 'before';
  else if (override)     type = 'override';
  else if (hasMarks) {
    const shortfall = expected - workedMin;
    if (shortfall > tolerance) { lateMin = shortfall; type = 'late'; }
    else                       { type = 'worked'; }
  }
  else if (entry?.absence) type = 'absence';
  else if (isWeekend)      type = 'weekend';
  else if (holidayName)    type = 'holiday';
  else if (isPast || isToday) type = 'missing';
  else                     type = 'future';

  const chips = [];
  if (type === 'before') { /* nada */ }
  else if (type === 'override') {
    chips.push({ label: override.name, color: override.color || 'blue' });
    if (hasMarks) chips.push({ label: `Trabalhado ${hm(workedMin)}`, color: 'green' });
  }
  else if (type === 'holiday') chips.push({ label: 'Feriado', color: 'purple' });
  else if (type === 'weekend') chips.push({ label: 'Folga', color: 'gray' });
  else if (type === 'worked')  chips.push({ label: `Trabalhando ${hm(workedMin)}`, color: 'green' });
  else if (type === 'late') {
    chips.push({ label: `Trabalhando ${hm(workedMin)}`, color: 'green' });
    chips.push({ label: `Atraso ${hm(lateMin)}`, color: 'red' });
  }
  else if (type === 'absence') chips.push({ label: 'Falta Justificada', color: 'orange' });
  else if (type === 'missing') chips.push({ label: 'Falta', color: 'red' });
  else if (type === 'future')  chips.push({ label: 'Aguardando', color: 'gray' });

  const isNegative = (type === 'missing' || type === 'late');
  const canAct     = !isBeforeAdm && !isFuture;
  const dotColor   = type === 'before' ? null : (chips[0]?.color || 'gray');

  return {
    date, dateStr, dow, isPast, isToday, isFuture, isWeekend, isBeforeAdm, holidayName,
    entry, expected, tolerance, workedMin, extraMin, lateMin, hasMarks, markTimes,
    override, type, chips, isNegative, canAct, dotColor,
  };
}

// ══ LISTA PAGINADA DE COLABORADORES (entrada do ponto) ════
function PontoEmployeeList({ onSelect }) {
  const [page, setPage]     = useState(1);
  const [search, setSearch] = useState('');
  const [sort, setSort]     = useState('name');
  const limit = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['ponto-emp-list', page, search, sort],
    queryFn: () => api.get(`/customers?type=CO&sort=${sort}&page=${page}&limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  const list  = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  function onSearch(v)     { setSearch(v); setPage(1); }
  function onSortChange(v) { setSort(v);   setPage(1); }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-gray-800">Colaboradores</h3>
          <p className="text-xs text-gray-400">Selecione um colaborador para gerir o ponto · {total} no total</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[
              { key:'name',   label:'A–Z' },
              { key:'recent', label:'Últimos admitidos' },
            ].map(o => (
              <button key={o.key} onClick={() => onSortChange(o.key)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  sort === o.key ? 'bg-white shadow text-violet-700' : 'text-gray-500 hover:text-gray-700'
                }`}>{o.label}</button>
            ))}
          </div>
          <div className="relative w-56">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9 text-sm" placeholder="Buscar..."
              value={search} onChange={e => onSearch(e.target.value)} />
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Colaborador</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Setor</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Escala</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Admissão</th>
                <th className="px-4 py-3 w-12"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">Carregando...</td></tr>
              ) : list.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">Nenhum colaborador encontrado</td></tr>
              ) : list.map(emp => (
                <tr key={emp.id}
                  onClick={() => onSelect(emp)}
                  className="border-b border-gray-50 last:border-0 hover:bg-indigo-50/40 cursor-pointer transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
                        {emp.name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 text-sm">{emp.name}</p>
                        <p className="text-xs text-gray-400">#{emp.display_id ?? '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.admission_data?.sector || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{emp.admission_data?.scale || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-500">
                    {emp.admission_data?.start_date
                      ? format(new Date(emp.admission_data.start_date + 'T00:00:00'), 'dd/MM/yyyy')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <ChevronRight size={16} className="text-gray-300 inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Página {page} de {pages}</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="btn-secondary p-1.5 disabled:opacity-40"><ChevronLeft size={15} /></button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="btn-secondary p-1.5 disabled:opacity-40"><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══ MODAL DE AJUSTE DE SITUAÇÃO ═══════════════════════════
function SituationModal({ day, employee, escala, situacoes, onClose }) {
  const qc = useQueryClient();
  const [code, setCode]       = useState(day.override?.code || '');
  const [note, setNote]       = useState(day.entry?.override_note || '');
  const [minutes, setMinutes] = useState(day.entry?.override_minutes || '');

  const mut = useMutation({
    mutationFn: d => api.put('/hr/timesheet/situation', d),
    onSuccess: () => { qc.invalidateQueries(['rh-ponto', employee.id]); toast.success('Situação ajustada'); onClose(); },
    onError:   () => toast.error('Erro ao ajustar situação'),
  });

  function apply(clear) {
    mut.mutate({
      employee_id: employee.id,
      work_date:   day.dateStr,
      escala_id:   escala.id || null,
      override_situation: clear ? null : (code || null),
      override_note:      clear ? null : (note || null),
      override_minutes:   clear ? null : (minutes ? Number(minutes) : null),
    });
  }

  return (
    <Modal isOpen={!!day} onClose={onClose}
      title={`Ajustar situação — ${format(day.date, "dd/MM/yyyy", { locale: ptBR })}`} size="md">
      <div className="space-y-4">
        <div className="bg-gray-50 rounded-xl p-3">
          <p className="text-sm font-semibold text-gray-800">{employee.name}</p>
          <p className="text-xs text-gray-500 capitalize">{format(day.date, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
          {day.type === 'late' && (
            <p className="text-xs text-red-600 mt-1">Atualmente: Atraso de {hm(day.lateMin)} (trabalhou {hm(day.workedMin)} de {hm(day.expected)})</p>
          )}
          {day.type === 'missing' && <p className="text-xs text-red-600 mt-1">Atualmente: Falta</p>}
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Selecione a situação</p>
          <div className="grid grid-cols-2 gap-2">
            {situacoes.map(s => (
              <button key={s.code} type="button" onClick={() => setCode(s.code)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-colors text-left ${
                  code === s.code
                    ? `border-transparent ${COLOR_CLS[s.color] || COLOR_CLS.gray}`
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLS[s.color] || DOT_CLS.gray}`} />
                {s.name}
              </button>
            ))}
            {situacoes.length === 0 && (
              <p className="col-span-2 text-xs text-amber-600">Nenhuma situação cadastrada. Rode a migração SITUACOES.</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label text-xs">Minutos (opcional)</label>
            <input type="number" min="0" className="input" placeholder="Ex: 11"
              value={minutes} onChange={e => setMinutes(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Observação</label>
            <input className="input" placeholder="Motivo do ajuste"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex gap-2 pt-2 border-t border-gray-100">
          {day.override && (
            <button type="button" onClick={() => apply(true)} disabled={mut.isPending}
              className="btn-secondary text-red-600">Remover ajuste</button>
          )}
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancelar</button>
          <button onClick={() => apply(false)} disabled={mut.isPending || !code} className="btn-primary flex-1">
            {mut.isPending ? 'Aplicando...' : 'Aplicar'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ══ GESTÃO DO PONTO DE UM COLABORADOR ═════════════════════
function PontoManager({ employee, onBack }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filter, setFilter]   = useState('todos');
  const [editDay, setEditDay] = useState(null);
  const [editForm, setEditForm] = useState({ times:['',''], absence:false });
  const [situationDay, setSituationDay] = useState(null);
  const [openMenu, setOpenMenu] = useState(null);
  const qc = useQueryClient();

  const monthStr    = format(currentMonth, 'yyyy-MM');
  const daysInMonth = getDaysInMonth(currentMonth);
  const monthLabel  = format(currentMonth, 'MMMM yyyy', { locale: ptBR });
  const todayStart  = useMemo(() => { const t = new Date(); t.setHours(0,0,0,0); return t; }, []);

  const year = currentMonth.getFullYear();
  const { data: escalas = [] }   = useQuery({ queryKey:['escalas'], queryFn:() => api.get('/escalas') });
  const { data: situacoes = [] } = useQuery({ queryKey:['situacoes-insert'], queryFn:() => api.get('/situacoes?insertable=true') });
  const { data: holidaysList = [] } = useQuery({ queryKey:['feriados', year], queryFn:() => api.get(`/feriados?year=${year}`) });
  const { data: hourBank }       = useQuery({ queryKey:['hour-bank', employee.id], queryFn:() => api.get(`/hr/hour-bank?employee_id=${employee.id}`) });
  const { data: entries = [] }   = useQuery({
    queryKey: ['rh-ponto', employee.id, monthStr],
    queryFn:  () => api.get(`/hr/timesheet?employee_id=${employee.id}&month=${monthStr}`),
  });

  const holidays = useMemo(
    () => Object.fromEntries((holidaysList || []).map(h => [h.date, h.name])),
    [holidaysList]
  );

  const escala = useMemo(() => {
    const adm = employee.admission_data || {};
    return escalas.find(e => e.id === adm.scale_id)
        || escalas.find(e => e.name === adm.scale)
        || { id:null, name: adm.scale || 'Padrão', daily_minutes:480, tolerance_minutes:10, weekdays:[1,2,3,4,5] };
  }, [escalas, employee]);

  const situMap = useMemo(() => {
    const map = {};
    [...situacoes].forEach(s => { map[s.code] = s; });
    // garante rótulos das situações automáticas mesmo sem cadastro
    map.atraso ??= { code:'atraso', name:'Atraso', color:'red' };
    map.falta  ??= { code:'falta',  name:'Falta',  color:'red' };
    return map;
  }, [situacoes]);

  const saveMut = useMutation({
    mutationFn: d => api.put('/hr/marcacoes/day', d),
    onSuccess: () => { qc.invalidateQueries(['rh-ponto', employee.id]); setEditDay(null); toast.success('Marcações salvas!'); },
    onError:   () => toast.error('Erro ao salvar marcações'),
  });

  const situMut = useMutation({
    mutationFn: d => api.put('/hr/timesheet/situation', d),
    onSuccess: () => { qc.invalidateQueries(['rh-ponto', employee.id]); setOpenMenu(null); toast.success('Situação ajustada'); },
    onError:   () => toast.error('Erro ao ajustar situação'),
  });

  const entryMap = useMemo(() => Object.fromEntries((entries||[]).map(e => [e.work_date, e])), [entries]);

  const days = useMemo(() => {
    const admStr  = employee.admission_data?.start_date;
    const admDate = admStr ? new Date(admStr + 'T00:00:00') : null;
    return Array.from({ length: daysInMonth }, (_, i) => {
      const date = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i + 1);
      return buildDay(date, entryMap[format(date,'yyyy-MM-dd')], escala, admDate, todayStart, situMap, holidays);
    });
  }, [daysInMonth, currentMonth, entryMap, escala, employee, todayStart, situMap, holidays]);

  const stats = useMemo(() => {
    const worked    = days.filter(d => d.hasMarks).length;
    const faltas    = days.filter(d => d.type === 'missing').length;
    const justified = days.filter(d => d.type === 'absence' || (d.override && !d.hasMarks)).length;
    const atrasos   = days.filter(d => d.type === 'late').length;
    const atrasoMin = days.reduce((s,d) => s + (d.type === 'late' ? d.lateMin : 0), 0);
    const totalMin  = days.reduce((s,d) => s + d.workedMin, 0);
    const extraMin  = days.reduce((s,d) => s + d.extraMin, 0);
    return { worked, faltas, justified, atrasos, atrasoMin, totalMin, extraMin };
  }, [days]);

  const filteredDays = useMemo(() => {
    if (filter === 'pendencias') return days.filter(d => d.type === 'missing' || d.type === 'late');
    if (filter === 'trabalhados') return days.filter(d => d.hasMarks);
    return days;
  }, [days, filter]);

  const missingDays = useMemo(() => days.filter(d => d.type === 'missing'), [days]);

  function openEdit(day) {
    setOpenMenu(null);
    setEditDay(day);
    setEditForm({
      times: day.markTimes.length ? [...day.markTimes] : ['', ''],
      absence: !!day.entry?.absence,
    });
  }
  function addMark()       { setEditForm(p => ({ ...p, times: [...p.times, ''] })); }
  function removeMark(i)   { setEditForm(p => ({ ...p, times: p.times.filter((_, idx) => idx !== i) })); }
  function setMarkAt(i, v) { setEditForm(p => ({ ...p, times: p.times.map((t, idx) => idx === i ? v : t) })); }

  function saveEdit() {
    if (!editDay) return;
    saveMut.mutate({
      employee_id: employee.id,
      work_date:   editDay.dateStr,
      escala_id:   escala.id || null,
      absence:     editForm.absence,
      times:       editForm.absence ? [] : editForm.times.filter(Boolean),
    });
  }

  function quickSituation(day, code) {
    situMut.mutate({
      employee_id: employee.id, work_date: day.dateStr,
      escala_id: escala.id || null, override_situation: code,
    });
  }

  const escalaHoras = `${hm(escala.daily_minutes)} /dia`;

  return (
    <div className="space-y-4">
      {/* ── Voltar + Ficha do colaborador ── */}
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium">
        <ArrowLeft size={15} /> Voltar à lista
      </button>

      <div className="card p-4">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
            {employee.name?.charAt(0)}
          </div>
          <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
            <div className="col-span-2 sm:col-span-4">
              <p className="font-semibold text-gray-900 text-base">{employee.name}</p>
              <p className="text-xs text-indigo-600 font-medium">{employee.admission_data?.sector || '—'}</p>
            </div>
            {[
              ['Cadastro', `#${employee.display_id ?? '—'}`],
              ['Escala',   escala.name],
              ['Jornada',  escalaHoras],
              ['Admissão', employee.admission_data?.start_date ? format(new Date(employee.admission_data.start_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'],
            ].map(([label, val]) => (
              <div key={label}>
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">{label}</p>
                <p className="text-sm text-gray-700 font-medium">{val}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Navegação de mês ── */}
      <div className="flex items-center gap-3">
        <button onClick={() => setCurrentMonth(p => subMonths(p,1))} className="btn-secondary p-1.5"><ChevronLeft size={16}/></button>
        <h3 className="font-semibold text-gray-700 capitalize min-w-44 text-center">{monthLabel}</h3>
        <button onClick={() => setCurrentMonth(p => addMonths(p,1))} className="btn-secondary p-1.5"><ChevronRight size={16}/></button>
      </div>

      {/* ── KPIs ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3 text-center border-t-2 border-green-400">
          <p className="text-2xl font-bold text-green-700">{stats.worked}</p>
          <p className="text-xs text-gray-500 mt-0.5">Dias trabalhados</p>
        </div>
        <div className="card p-3 text-center border-t-2 border-red-400">
          <p className="text-2xl font-bold text-red-600">{stats.faltas}</p>
          <p className="text-xs text-gray-500 mt-0.5">Faltas{stats.justified ? ` · ${stats.justified} just.` : ''}</p>
        </div>
        <div className="card p-3 text-center border-t-2 border-amber-400">
          <p className="text-2xl font-bold text-amber-600">{stats.atrasos}</p>
          <p className="text-xs text-gray-500 mt-0.5">Atrasos{stats.atrasoMin ? ` · ${hm(stats.atrasoMin)}` : ''}</p>
        </div>
        <div className="card p-3 text-center border-t-2 border-indigo-400">
          <p className="text-2xl font-bold text-indigo-700">{hm(stats.totalMin)}</p>
          <p className="text-xs text-gray-500 mt-0.5">Horas{stats.extraMin ? ` · +${hm(stats.extraMin)} extra` : ''}</p>
        </div>
      </div>

      {/* ── Banco de Horas ── */}
      {hourBank && (
        <div className="card p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-violet-500" />
            <span className="text-sm font-medium text-gray-600">Banco de horas (saldo acumulado)</span>
          </div>
          <div className="flex items-center gap-3">
            {(hourBank.months || []).slice(-3).map(m => (
              <span key={m.month} className="text-xs text-gray-400">
                {format(new Date(m.month + '-01T00:00:00'), 'MMM', { locale: ptBR })}:{' '}
                <span className={m.liquido >= 0 ? 'text-green-600' : 'text-red-500'}>
                  {m.liquido >= 0 ? '+' : '−'}{hm(Math.abs(m.liquido))}
                </span>
              </span>
            ))}
            <span className={`text-lg font-bold ${hourBank.saldo_atual >= 0 ? 'text-green-700' : 'text-red-600'}`}>
              {hourBank.saldo_atual >= 0 ? '+' : '−'}{hm(Math.abs(hourBank.saldo_atual))}
            </span>
          </div>
        </div>
      )}

      {/* ── Alerta de faltas ── */}
      {missingDays.length > 0 && (
        <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertCircle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">
              {missingDays.length} {missingDays.length === 1 ? 'dia com falta (sem marcação)' : 'dias com falta (sem marcação)'}
            </p>
            <p className="text-xs text-amber-600 mt-0.5">
              {missingDays.map(d => format(d.date, 'dd/MM')).slice(0,15).join(' · ')}
              {missingDays.length > 15 ? ` e mais ${missingDays.length - 15}...` : ''}
            </p>
          </div>
        </div>
      )}
      {missingDays.length === 0 && stats.worked > 0 && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
          <CheckCircle size={16} className="text-green-500" />
          <p className="text-sm font-medium text-green-700">Sem faltas pendentes neste mês</p>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[
          { key:'todos',       label:`Todos · ${days.length}` },
          { key:'pendencias',  label:`Pendências · ${stats.faltas + stats.atrasos}` },
          { key:'trabalhados', label:`Trabalhados · ${stats.worked}` },
        ].map(t => (
          <button key={t.key} onClick={() => setFilter(t.key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === t.key ? 'bg-white shadow text-violet-700' : 'text-gray-500 hover:text-gray-700'
            }`}>{t.label}</button>
        ))}
      </div>

      {/* ── Tabela de dias ── */}
      <div className="card overflow-visible">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Data</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Situação</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Marcações</th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">Total</th>
                <th className="px-4 py-3 w-20 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredDays.map(day => {
                const times = day.markTimes;
                return (
                  <tr key={day.dateStr}
                    className={`border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50/50 ${
                      day.isNegative ? 'bg-red-50/20' : ''
                    } ${day.isToday ? 'bg-blue-50/30' : ''}`}>

                    {/* Data */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {day.dotColor
                          ? <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLS[day.dotColor]}`} />
                          : <div className="w-2 h-2 flex-shrink-0" />}
                        <div>
                          <span className={`font-bold text-sm ${day.isWeekend || day.isBeforeAdm ? 'text-gray-400' : 'text-gray-800'}`}>
                            {format(day.date, 'dd/MM')}
                          </span>
                          <span className="text-xs text-gray-400 ml-1.5 capitalize">{format(day.date, 'EEE', { locale: ptBR })}</span>
                          {day.isToday && <span className="ml-1.5 text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">hoje</span>}
                        </div>
                      </div>
                    </td>

                    {/* Situação (chips clicáveis) */}
                    <td className="px-4 py-3">
                      {day.type === 'before' ? (
                        <span className="text-gray-300 text-xs">—</span>
                      ) : (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {day.chips.map((c, i) => (
                            <button key={i} type="button"
                              onClick={() => day.canAct && setSituationDay(day)}
                              disabled={!day.canAct}
                              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${COLOR_CLS[c.color] || COLOR_CLS.gray} ${
                                day.canAct ? 'hover:ring-2 hover:ring-offset-1 hover:ring-gray-200 cursor-pointer' : ''
                              }`}>
                              {c.label}
                            </button>
                          ))}
                          {day.override?.note && <span className="text-xs text-gray-400 italic">· {day.override.note}</span>}
                        </div>
                      )}
                    </td>

                    {/* Marcações */}
                    <td className="px-4 py-3">
                      {times.length > 0 ? (
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {times.map((t, i) => (
                            <span key={i} className={`font-mono text-xs px-2 py-0.5 rounded-md ${
                              i === 0 || i === times.length - 1 ? 'bg-green-100 text-green-800 font-semibold' : 'bg-gray-100 text-gray-600'
                            }`}>{t}</span>
                          ))}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Total */}
                    <td className="px-4 py-3 text-right">
                      {day.workedMin > 0 ? (
                        <div>
                          <span className="font-mono text-xs font-semibold text-gray-700">{hm(day.workedMin)}</span>
                          {day.extraMin > 0 && <span className="block font-mono text-xs text-amber-600">+{hm(day.extraMin)} extra</span>}
                          {day.lateMin > 0 && <span className="block font-mono text-xs text-red-500">-{hm(day.lateMin)} atraso</span>}
                        </div>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>

                    {/* Ações */}
                    <td className="px-4 py-3 text-right relative">
                      {day.canAct && (
                        <button onClick={() => setOpenMenu(openMenu === day.dateStr ? null : day.dateStr)}
                          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
                          <MoreVertical size={16} />
                        </button>
                      )}
                      {openMenu === day.dateStr && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setOpenMenu(null)} />
                          <div className="absolute right-2 top-10 z-40 w-52 bg-white border border-gray-200 rounded-xl shadow-xl py-1 text-left">
                            <button onClick={() => openEdit(day)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <PenLine size={13} /> Editar marcações
                            </button>
                            <button onClick={() => { setOpenMenu(null); setSituationDay(day); }}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50">
                              <Plus size={13} /> Inserir situação…
                            </button>
                            {situacoes.length > 0 && <div className="border-t border-gray-100 my-1" />}
                            <div className="max-h-48 overflow-y-auto">
                              {situacoes.map(s => (
                                <button key={s.code} onClick={() => quickSituation(day, s.code)}
                                  className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50">
                                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_CLS[s.color] || DOT_CLS.gray}`} />
                                  {s.name}
                                </button>
                              ))}
                            </div>
                            {day.override && (
                              <>
                                <div className="border-t border-gray-100 my-1" />
                                <button onClick={() => quickSituation(day, null)}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50">
                                  <X size={13} /> Remover ajuste
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {filteredDays.length === 0 && (
          <div className="py-12 text-center text-gray-400 text-sm">Nenhum dia neste filtro</div>
        )}
      </div>

      {/* ── Modal de marcações ── */}
      <Modal isOpen={!!editDay} onClose={() => setEditDay(null)}
        title={editDay ? `Ponto — ${format(editDay.date, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}` : ''} size="md">
        {editDay && (
          <div className="space-y-4">
            <div className="bg-gray-50 rounded-xl p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold flex-shrink-0">
                {employee.name?.charAt(0)}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-800">{employee.name}</p>
                <p className="text-xs text-gray-500 capitalize">{format(editDay.date, "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
              </div>
            </div>

            <label className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
              editForm.absence ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
            }`}>
              <input type="checkbox" checked={editForm.absence}
                onChange={e => setEditForm(p => ({...p, absence: e.target.checked}))}
                className="w-4 h-4 rounded accent-orange-500" />
              <div>
                <p className="text-sm font-medium text-gray-800">Falta justificada</p>
                <p className="text-xs text-gray-500">Marque se o colaborador faltou com justificativa</p>
              </div>
            </label>

            {!editForm.absence && (
              <>
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Marcações do dia</p>
                  <button type="button" onClick={addMark}
                    className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    <Plus size={13} /> Adicionar batida
                  </button>
                </div>
                <div className="space-y-2">
                  {editForm.times.length === 0 && (
                    <p className="text-xs text-gray-400">Nenhuma marcação. Clique em “Adicionar batida”.</p>
                  )}
                  {editForm.times.map((t, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className={`text-xs w-24 flex-shrink-0 ${i % 2 === 0 ? 'text-green-700 font-medium' : 'text-gray-500'}`}>
                        {i % 2 === 0 ? `Entrada ${Math.floor(i/2)+1}` : `Saída ${Math.floor(i/2)+1}`}
                      </span>
                      <input type="time" className="input flex-1" value={t}
                        onChange={e => setMarkAt(i, e.target.value)} />
                      <button type="button" onClick={() => removeMark(i)}
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400">
                  As batidas são pareadas (entrada → saída) para somar o total. Jornada: {escalaHoras} · tolerância {escala.tolerance_minutes ?? 10} min.
                </p>
              </>
            )}

            <div className="flex gap-2 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setEditDay(null)} className="btn-secondary flex-1">Cancelar</button>
              <button onClick={saveEdit} disabled={saveMut.isPending} className="btn-primary flex-1">
                {saveMut.isPending ? 'Salvando...' : 'Salvar Marcações'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal de ajuste de situação ── */}
      {situationDay && (
        <SituationModal day={situationDay} employee={employee} escala={escala}
          situacoes={situacoes} onClose={() => setSituationDay(null)} />
      )}
    </div>
  );
}

// ══ TAB PONTO (lista ↔ gestão) ════════════════════════════
export function TabPonto({ employee }) {
  const { setEmployee } = useHR();
  if (!employee) return <PontoEmployeeList onSelect={setEmployee} />;
  return <PontoManager employee={employee} onBack={() => setEmployee(null)} />;
}

// ══ TAB FÉRIAS ════════════════════════════════════════════
export function TabFerias({ employee }) {
  const [modalNew, setModalNew] = useState(false);
  const [form, setForm] = useState({ start_date:'', end_date:'', notes:'' });
  const qc = useQueryClient();

  const { data: vacations = [] } = useQuery({
    queryKey: ['rh-ferias', employee?.id],
    queryFn: () => api.get(`/hr/vacation${employee ? `?employee_id=${employee.id}` : ''}`),
    enabled: !!employee,
  });

  const createMut = useMutation({
    mutationFn: d => api.post('/hr/vacation', d),
    onSuccess: () => { toast.success('Férias agendadas'); setModalNew(false); qc.invalidateQueries(['rh-ferias']); },
    onError: e => toast.error(e.error||'Erro'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/hr/vacation/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries(['rh-ferias']),
  });

  const days = form.start_date && form.end_date
    ? Math.round((new Date(form.end_date) - new Date(form.start_date)) / 86400000) + 1 : 0;

  if (!employee) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Umbrella size={40} className="mb-3 opacity-30"/>
      <p className="text-sm">Selecione um colaborador acima</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModalNew(true)} className="btn-primary btn-sm"><Plus size={14}/> Agendar Férias</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-auto">
          <thead>
            <tr><th>Início</th><th>Fim</th><th className="text-right">Dias</th><th>Status</th><th></th></tr>
          </thead>
          <tbody>
            {vacations.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum período de férias registrado</td></tr>
            ) : vacations.map(v => {
              const st = VACATION_STATUS[v.status];
              return (
                <tr key={v.id}>
                  <td className="font-medium">{fmtDate(v.start_date)}</td>
                  <td>{fmtDate(v.end_date)}</td>
                  <td className="text-right font-bold">{v.days}</td>
                  <td><span className={`badge text-xs ${st?.cls}`}>{st?.l}</span></td>
                  <td>
                    {v.status === 'scheduled' && (
                      <div className="flex gap-1">
                        <button onClick={() => updateMut.mutate({ id:v.id, status:'active' })}
                          className="text-xs text-green-600 hover:text-green-700 font-medium">Iniciar</button>
                        <span className="text-gray-300">|</span>
                        <button onClick={() => updateMut.mutate({ id:v.id, status:'cancelled' })}
                          className="text-xs text-red-500 hover:text-red-600 font-medium">Cancelar</button>
                      </div>
                    )}
                    {v.status === 'active' && (
                      <button onClick={() => updateMut.mutate({ id:v.id, status:'completed' })}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium">Concluir</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalNew} onClose={() => setModalNew(false)} title="Agendar Férias" size="md">
        <form onSubmit={e => { e.preventDefault(); createMut.mutate({ employee_id: employee.id, ...form }); }} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início *</label>
              <input type="date" className="input" value={form.start_date}
                onChange={e => setForm(p => ({...p, start_date: e.target.value}))} required />
            </div>
            <div>
              <label className="label">Fim *</label>
              <input type="date" className="input" value={form.end_date}
                onChange={e => setForm(p => ({...p, end_date: e.target.value}))} required />
            </div>
          </div>
          {days > 0 && (
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-blue-700 font-semibold">{days} dias de férias</p>
            </div>
          )}
          <div>
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={2}
              value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setModalNew(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1">
              {createMut.isPending ? 'Salvando...' : 'Agendar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ══ TAB FOLHA ═════════════════════════════════════════════
export function TabFolha({ employee }) {
  const [month, setMonth] = useState(format(new Date(), 'yyyy-MM'));
  const [form, setForm]   = useState({ base_salary:'', bonus:'0', overtime_pay:'0', other_additions:'0', other_deductions:'0', payment_method:'', notes:'', kind:'mensal' });
  const [preview, setPreview]   = useState(null);
  const [modalNew, setModalNew] = useState(false);
  const qc = useQueryClient();

  const { data: payrolls = [] } = useQuery({
    queryKey: ['rh-folha', employee?.id],
    queryFn: () => api.get(`/hr/payroll${employee ? `?employee_id=${employee.id}` : ''}`),
    enabled: !!employee,
  });

  async function simulate() {
    if (!form.base_salary) return;
    try {
      const res = await api.post('/hr/payroll/simulate', {
        kind: form.kind,
        base_salary: Number(form.base_salary),
        bonus: Number(form.bonus||0),
        overtime_pay: Number(form.overtime_pay||0),
        other_additions: Number(form.other_additions||0),
        other_deductions: Number(form.other_deductions||0),
      });
      setPreview(res);
    } catch { toast.error('Erro ao simular'); }
  }

  const createMut = useMutation({
    mutationFn: d => api.post('/hr/payroll', d),
    onSuccess: () => { toast.success('Folha gerada'); setModalNew(false); setPreview(null); qc.invalidateQueries(['rh-folha']); },
    onError: e => toast.error(e.error||'Erro'),
  });
  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/hr/payroll/${id}/status`, { status, payment_date: new Date().toISOString().split('T')[0] }),
    onSuccess: () => { toast.success('Status atualizado'); qc.invalidateQueries(['rh-folha']); },
  });

  if (!employee) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <DollarSign size={40} className="mb-3 opacity-30"/>
      <p className="text-sm">Selecione um colaborador acima</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <input type="month" className="input w-40 text-sm" value={month}
          onChange={e => setMonth(e.target.value)} />
        <button onClick={() => setModalNew(true)} className="btn-primary btn-sm"><Plus size={14}/> Gerar Folha</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-auto">
          <thead>
            <tr>
              <th>Mês</th><th>Colaborador</th>
              <th className="text-right">Bruto</th>
              <th className="text-right">INSS</th>
              <th className="text-right">IRRF</th>
              <th className="text-right">FGTS</th>
              <th className="text-right text-green-700">Líquido</th>
              <th>Status</th><th></th>
            </tr>
          </thead>
          <tbody>
            {payrolls.length === 0 ? (
              <tr><td colSpan={9} className="text-center py-8 text-gray-400">Nenhuma folha gerada</td></tr>
            ) : payrolls.map(p => {
              const st = PAYROLL_STATUS[p.status];
              return (
                <tr key={p.id}>
                  <td className="font-mono text-sm">
                    {p.reference_month}
                    {p.kind && p.kind !== 'mensal' && (
                      <span className={`ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${p.kind === '13' ? 'bg-amber-100 text-amber-700' : 'bg-teal-100 text-teal-700'}`}>
                        {p.kind === '13' ? '13º' : 'FÉRIAS'}
                      </span>
                    )}
                  </td>
                  <td className="font-medium text-sm">{p.CLIENTES?.name}</td>
                  <td className="text-right">{fmt(p.gross_salary)}</td>
                  <td className="text-right text-red-600">-{fmt(p.inss_deduction)}</td>
                  <td className="text-right text-red-600">-{fmt(p.irrf_deduction)}</td>
                  <td className="text-right text-blue-600">{fmt(p.fgts_value)}</td>
                  <td className="text-right font-bold text-green-700">{fmt(p.net_salary)}</td>
                  <td><span className={`badge text-xs ${st?.cls}`}>{st?.l}</span></td>
                  <td>
                    {p.status === 'draft' && (
                      <button onClick={() => statusMut.mutate({ id:p.id, status:'approved' })}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium">Aprovar</button>
                    )}
                    {p.status === 'approved' && (
                      <button onClick={() => statusMut.mutate({ id:p.id, status:'paid' })}
                        className="text-xs text-green-600 hover:text-green-700 font-medium flex items-center gap-1">
                        <Check size={12}/> Marcar pago
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalNew} onClose={() => { setModalNew(false); setPreview(null); }} title="Gerar Folha de Pagamento" size="lg">
        <div className="space-y-4">
          <div className="bg-indigo-50 rounded-xl p-3">
            <p className="text-sm font-semibold text-indigo-800">{employee.name}</p>
            <p className="text-xs text-indigo-500">Mês de referência: <strong>{month}</strong></p>
          </div>
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
            {[['mensal','Mensal'],['13','13º Salário'],['ferias','Férias']].map(([k,l]) => (
              <button key={k} type="button" onClick={() => { setForm(p=>({...p,kind:k})); setPreview(null); }}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${form.kind===k ? 'bg-white shadow text-violet-700' : 'text-gray-500'}`}>{l}</button>
            ))}
          </div>
          {form.kind === 'ferias' && <p className="text-xs text-teal-600">Inclui 1/3 constitucional automaticamente sobre o salário base.</p>}
          {form.kind === '13' && <p className="text-xs text-amber-600">13º integral (ajuste o salário base se for proporcional).</p>}
          <div className="grid grid-cols-2 gap-3">
            {[
              ['base_salary', 'Salário base *', true],
              ['bonus', 'Bônus / Comissão', false],
              ['overtime_pay', 'Horas extras', false],
              ['other_additions', 'Outros acréscimos', false],
              ['other_deductions', 'Outros descontos', false],
            ].map(([k,l,req]) => (
              <div key={k}>
                <label className="label">{l}</label>
                <input type="number" className="input" min="0" step="0.01"
                  value={form[k]} onChange={e => setForm(p=>({...p,[k]:e.target.value}))} required={req}/>
              </div>
            ))}
            <div>
              <label className="label">Forma de pagamento</label>
              <select className="input" value={form.payment_method} onChange={e => setForm(p=>({...p,payment_method:e.target.value}))}>
                <option value="">Selecione</option>
                <option value="pix">PIX</option>
                <option value="deposito">Depósito bancário</option>
                <option value="dinheiro">Dinheiro</option>
              </select>
            </div>
          </div>
          <button type="button" onClick={simulate}
            className="w-full py-2 border-2 border-dashed border-indigo-300 text-indigo-700 rounded-xl text-sm font-medium hover:bg-indigo-50 transition-colors">
            Simular cálculo
          </button>
          {preview && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Resultado da simulação</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Salário bruto:</span><span className="font-medium">{fmt(preview.gross_salary)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">INSS (desc.):</span><span className="text-red-600 font-medium">-{fmt(preview.inss_deduction)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">IRRF (desc.):</span><span className="text-red-600 font-medium">-{fmt(preview.irrf_deduction)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">FGTS (emp.):</span><span className="text-blue-600 font-medium">{fmt(preview.fgts_value)}</span></div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t">
                <span className="font-semibold text-gray-700">Salário líquido:</span>
                <span className="text-xl font-bold text-green-700">{fmt(preview.net_salary)}</span>
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => { setModalNew(false); setPreview(null); }} className="btn-secondary flex-1">Cancelar</button>
            <button
              onClick={() => createMut.mutate({ employee_id: employee.id, reference_month: month, ...form })}
              disabled={createMut.isPending || !form.base_salary}
              className="btn-primary flex-1">
              {createMut.isPending ? 'Gerando...' : 'Gerar Folha'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ══ TAB DOCUMENTOS ════════════════════════════════════════
export function TabDocumentos({ employee }) {
  const [modalNew, setModalNew] = useState(false);
  const [form, setForm] = useState({ type:'ctps', description:'', document_date:'', file_url:'', notes:'' });
  const qc = useQueryClient();

  const { data: docs = [] } = useQuery({
    queryKey: ['rh-docs', employee?.id],
    queryFn: () => api.get(`/hr/documents${employee ? `?employee_id=${employee.id}` : ''}`),
    enabled: !!employee,
  });

  const createMut = useMutation({
    mutationFn: d => api.post('/hr/documents', d),
    onSuccess: () => { toast.success('Documento registrado'); setModalNew(false); qc.invalidateQueries(['rh-docs']); },
    onError: e => toast.error(e.error||'Erro'),
  });
  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/hr/documents/${id}`),
    onSuccess: () => qc.invalidateQueries(['rh-docs']),
  });

  if (!employee) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <FileText size={40} className="mb-3 opacity-30"/>
      <p className="text-sm">Selecione um colaborador acima</p>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setModalNew(true)} className="btn-primary btn-sm"><Plus size={14}/> Novo Documento</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-auto">
          <thead>
            <tr><th>Tipo</th><th>Descrição</th><th>Data</th><th>Link</th><th></th></tr>
          </thead>
          <tbody>
            {docs.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-8 text-gray-400">Nenhum documento registrado</td></tr>
            ) : docs.map(doc => {
              const D = DOC_TYPES[doc.type];
              return (
                <tr key={doc.id}>
                  <td><span className={`badge text-xs ${D?.cls}`}>{D?.l}</span></td>
                  <td>
                    <div>
                      <p className="font-medium text-sm">{doc.description}</p>
                      {doc.notes && <p className="text-xs text-gray-400">{doc.notes}</p>}
                    </div>
                  </td>
                  <td className="text-sm text-gray-500">{fmtDate(doc.document_date)}</td>
                  <td>
                    {doc.file_url ? (
                      <a href={doc.file_url} target="_blank" rel="noreferrer"
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">Ver arquivo</a>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td>
                    <button onClick={() => { if (confirm('Excluir documento?')) deleteMut.mutate(doc.id); }}
                      className="text-gray-400 hover:text-red-500 p-1 transition-colors">
                      <Trash2 size={14}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Modal isOpen={modalNew} onClose={() => setModalNew(false)} title="Novo Documento" size="md">
        <form onSubmit={e => { e.preventDefault(); createMut.mutate({ employee_id: employee.id, ...form }); }} className="space-y-4">
          <div>
            <label className="label">Tipo *</label>
            <select className="input" value={form.type} onChange={e => setForm(p=>({...p,type:e.target.value}))}>
              {Object.entries(DOC_TYPES).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Descrição *</label>
            <input className="input" value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Data do documento</label>
              <input type="date" className="input" value={form.document_date} onChange={e => setForm(p=>({...p,document_date:e.target.value}))} />
            </div>
            <div>
              <label className="label">URL do arquivo (opcional)</label>
              <input className="input" placeholder="https://..." value={form.file_url} onChange={e => setForm(p=>({...p,file_url:e.target.value}))} />
            </div>
          </div>
          <div>
            <label className="label">Observações</label>
            <textarea className="input resize-none" rows={2} value={form.notes} onChange={e => setForm(p=>({...p,notes:e.target.value}))} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setModalNew(false)} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary flex-1">
              {createMut.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// ══ LAYOUT PRINCIPAL ══════════════════════════════════════
function HRLayoutInner() {
  const { employee, setEmployee } = useHR();

  const { data: summary } = useQuery({
    queryKey: ['rh-summary'],
    queryFn: () => api.get('/hr/summary'),
  });

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <Users size={18} className="text-violet-600"/>
          </div>
          <div>
            <h1 className="page-title">Recursos Humanos</h1>
            <p className="text-sm text-gray-500 mt-0.5">Ponto · Férias · Folha · Documentos</p>
          </div>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label:'Folha líquida (mês)', val: fmt(summary.payroll?.total_net),   cls:'text-green-700 text-lg' },
            { label:'Folha bruta (mês)',   val: fmt(summary.payroll?.total_gross), cls:'text-gray-800 text-lg'  },
            { label:'Férias agendadas',    val: summary.vacation || 0,             cls:'text-blue-700'           },
            { label:'Horas extras (mês)',  val: `${summary.extra_hours||0}h`,      cls:'text-orange-700'         },
          ].map((s,i) => (
            <div key={i} className="card p-4 text-center">
              <p className={`font-bold ${s.cls}`}>{s.val}</p>
              <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Colaborador selecionado</p>
        <div className="relative">
          <EmployeeSelector selected={employee} onSelect={setEmployee}/>
        </div>
      </div>

      <Outlet />
    </div>
  );
}

export default function HR() {
  return (
    <HRProvider>
      <HRLayoutInner />
    </HRProvider>
  );
}
