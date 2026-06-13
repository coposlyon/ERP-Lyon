import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, Trash2 } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const TYPES = {
  nacional:    { l: 'Nacional',    cls: 'bg-blue-100   text-blue-700'   },
  estadual:    { l: 'Estadual',    cls: 'bg-violet-100 text-violet-700' },
  municipal:   { l: 'Municipal',   cls: 'bg-teal-100   text-teal-700'   },
  facultativo: { l: 'Facultativo', cls: 'bg-gray-100   text-gray-600'   },
};

export default function Feriados() {
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [form, setForm] = useState({ date: '', name: '', type: 'municipal' });

  const { data: feriados = [], isLoading } = useQuery({
    queryKey: ['feriados', year],
    queryFn: () => api.get(`/feriados?year=${year}`),
  });

  const createMut = useMutation({
    mutationFn: d => api.post('/feriados', d),
    onSuccess: () => { toast.success('Feriado salvo!'); setForm({ date: '', name: '', type: 'municipal' }); qc.invalidateQueries(['feriados']); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });
  const deleteMut = useMutation({
    mutationFn: id => api.delete(`/feriados/${id}`),
    onSuccess: () => qc.invalidateQueries(['feriados']),
  });

  function submit(e) {
    e.preventDefault();
    if (!form.date || !form.name) { toast.error('Informe data e nome'); return; }
    createMut.mutate(form);
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <CalendarDays size={18} className="text-violet-600"/>
          </div>
          <div>
            <h1 className="page-title">Feriados</h1>
            <p className="text-sm text-gray-500 mt-0.5">Dias marcados aqui não contam como falta no ponto</p>
          </div>
        </div>
      </div>

      {/* Adicionar */}
      <form onSubmit={submit} className="card p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="label text-xs">Data</label>
          <input type="date" className="input text-sm" value={form.date}
            onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
        </div>
        <div className="flex-1 min-w-48">
          <label className="label text-xs">Nome do feriado</label>
          <input className="input text-sm" value={form.name} placeholder="Ex.: Aniversário de Maringá"
            onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div>
          <label className="label text-xs">Tipo</label>
          <select className="input text-sm" value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
            {Object.entries(TYPES).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
        </div>
        <button type="submit" disabled={createMut.isPending} className="btn-primary btn-sm"><Plus size={14}/> Adicionar</button>
      </form>

      {/* Lista */}
      <div className="card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <p className="text-sm font-semibold text-gray-700">{feriados.length} feriados em {year}</p>
          <div className="flex gap-1">
            <button onClick={() => setYear(y => y - 1)} className="btn-secondary btn-sm">{year - 1}</button>
            <button onClick={() => setYear(y => y + 1)} className="btn-secondary btn-sm">{year + 1}</button>
          </div>
        </div>
        <table className="w-full">
          <tbody>
            {isLoading ? (
              <tr><td className="py-8 text-center text-gray-400 text-sm">Carregando...</td></tr>
            ) : feriados.length === 0 ? (
              <tr><td className="py-8 text-center text-gray-400 text-sm">Nenhum feriado cadastrado em {year}</td></tr>
            ) : feriados.map(f => {
              const T = TYPES[f.type] || TYPES.municipal;
              return (
                <tr key={f.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                  <td className="px-4 py-2.5 w-28 text-sm font-mono text-gray-600">
                    {format(parseISO(f.date), 'dd/MM/yyyy')}
                  </td>
                  <td className="px-4 py-2.5 w-20 text-xs text-gray-400 capitalize">
                    {format(parseISO(f.date), 'EEEE', { locale: ptBR })}
                  </td>
                  <td className="px-4 py-2.5 text-sm font-medium text-gray-800">{f.name}</td>
                  <td className="px-4 py-2.5 w-28"><span className={`badge text-xs ${T.cls}`}>{T.l}</span></td>
                  <td className="px-4 py-2.5 w-12 text-right">
                    <button onClick={() => { if (confirm('Remover feriado?')) deleteMut.mutate(f.id); }}
                      className="text-gray-400 hover:text-red-500 p-1"><Trash2 size={14}/></button>
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
