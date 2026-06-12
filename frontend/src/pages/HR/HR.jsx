import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Clock, Umbrella, DollarSign, FileText,
  Plus, Trash2, Check, ChevronLeft, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { format, parseISO, getDaysInMonth, startOfMonth, addMonths, subMonths } from 'date-fns';
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
    <div className="flex items-center gap-3">
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

// ══ TAB PONTO ════════════════════════════════════════════
export function TabPonto({ employee }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const qc = useQueryClient();
  const monthStr    = format(currentMonth, 'yyyy-MM');
  const daysInMonth = getDaysInMonth(currentMonth);
  const monthLabel  = format(currentMonth, 'MMMM yyyy', { locale: ptBR });

  const { data: entries = [] } = useQuery({
    queryKey: ['rh-ponto', employee?.id, monthStr],
    queryFn: () => api.get(`/hr/timesheet?employee_id=${employee.id}&month=${monthStr}`),
    enabled: !!employee,
  });

  const entryMap = Object.fromEntries((entries||[]).map(e => [e.work_date, e]));

  const saveMut = useMutation({
    mutationFn: d => api.put('/hr/timesheet', d),
    onSuccess: () => qc.invalidateQueries(['rh-ponto', employee?.id, monthStr]),
  });

  function handleChange(date, field, value) {
    const existing = entryMap[date] || {};
    saveMut.mutate({ employee_id: employee.id, work_date: date, ...existing, [field]: value || null });
  }

  function calcTotal(entry) {
    if (!entry) return '—';
    if (entry.absence) return 'Falta';
    const total = entry.total_minutes || 0;
    const h = Math.floor(total/60), m = total%60;
    const extra = entry.extra_minutes || 0;
    let s = `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
    if (extra > 0) s += ` (+${Math.floor(extra/60)}h${extra%60?String(extra%60).padStart(2,'0'):''})`;
    return s;
  }

  if (!employee) return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Clock size={40} className="mb-3 opacity-30"/>
      <p className="text-sm">Selecione um colaborador acima para ver o ponto</p>
    </div>
  );

  const totalHours = entries.reduce((s,e) => s + (e.total_minutes||0), 0);
  const extraHours = entries.reduce((s,e) => s + (e.extra_minutes||0), 0);
  const absences   = entries.filter(e => e.absence).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={() => setCurrentMonth(p => subMonths(p,1))} className="btn-secondary btn-sm p-1.5"><ChevronLeft size={16}/></button>
        <h3 className="font-semibold text-gray-700 capitalize min-w-36 text-center">{monthLabel}</h3>
        <button onClick={() => setCurrentMonth(p => addMonths(p,1))} className="btn-secondary btn-sm p-1.5"><ChevronRight size={16}/></button>
        <div className="flex gap-3 ml-4 text-sm text-gray-500">
          <span>Total: <strong className="text-gray-800">{Math.floor(totalHours/60)}h{totalHours%60?String(totalHours%60).padStart(2,'0'):''}</strong></span>
          <span>Extras: <strong className="text-green-700">{Math.floor(extraHours/60)}h{extraHours%60?String(extraHours%60).padStart(2,'0'):''}</strong></span>
          <span>Faltas: <strong className="text-red-600">{absences}</strong></span>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-auto text-xs">
          <thead>
            <tr>
              <th className="text-left">Dia</th>
              <th>Entrada 1</th><th>Saída 1</th>
              <th>Entrada 2</th><th>Saída 2</th>
              <th>Total</th><th>Falta</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: daysInMonth }, (_,i) => {
              const d   = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), i+1);
              const ds  = format(d, 'yyyy-MM-dd');
              const dow = d.getDay();
              const isWe = dow === 0 || dow === 6;
              const en  = entryMap[ds];
              const dow_l = format(d, 'EEE', { locale: ptBR });
              return (
                <tr key={ds} className={`${isWe ? 'bg-gray-50/80 text-gray-400' : ''} ${en?.absence ? 'bg-red-50/50' : ''}`}>
                  <td className="whitespace-nowrap">
                    <span className="font-semibold">{String(i+1).padStart(2,'0')}</span>
                    <span className="text-gray-400 ml-1 capitalize">{dow_l}</span>
                  </td>
                  {['entry1','exit1','entry2','exit2'].map(field => (
                    <td key={field} className="p-1">
                      <input type="time"
                        disabled={en?.absence || isWe}
                        className="border border-gray-200 rounded px-1 py-0.5 text-xs w-24 disabled:opacity-40 disabled:bg-transparent focus:outline-none focus:ring-1 focus:ring-indigo-400"
                        defaultValue={en?.[field] || ''}
                        onBlur={e => handleChange(ds, field, e.target.value)}
                      />
                    </td>
                  ))}
                  <td className={`text-center font-mono text-xs whitespace-nowrap ${en?.extra_minutes>0?'text-green-700':''}`}>
                    {calcTotal(en)}
                  </td>
                  <td className="text-center">
                    <input type="checkbox" checked={!!en?.absence}
                      className="w-3.5 h-3.5 rounded text-red-500"
                      onChange={e => handleChange(ds, 'absence', e.target.checked)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
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
  const [form, setForm]   = useState({ base_salary:'', bonus:'0', overtime_pay:'0', other_additions:'0', other_deductions:'0', payment_method:'', notes:'' });
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
                  <td className="font-mono text-sm">{p.reference_month}</td>
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

// ══ LAYOUT PRINCIPAL (com Outlet para sub-rotas) ══════════
function HRLayoutInner() {
  const { employee, setEmployee } = useHR();

  const { data: summary } = useQuery({
    queryKey: ['rh-summary'],
    queryFn: () => api.get('/hr/summary'),
  });

  return (
    <div className="space-y-5">
      {/* Header */}
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

      {/* KPIs resumo */}
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

      {/* Seletor de colaborador (compartilhado entre sub-rotas) */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Colaborador</p>
        <div className="relative">
          <EmployeeSelector selected={employee} onSelect={setEmployee}/>
        </div>
      </div>

      {/* Conteúdo da sub-rota */}
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
