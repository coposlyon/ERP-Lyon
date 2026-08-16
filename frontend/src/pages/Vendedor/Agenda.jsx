// ============================================================
// Agenda do vendedor.
//
// Reunião, ligação, retorno, compromisso, observação. De propósito não
// virou CRM: sem funil, sem estágio, sem automação — é o caderninho que
// ele já tinha, agora dentro do sistema e amarrado ao cliente quando
// fizer sentido.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, Plus, Check, Trash2, Users, Phone, RotateCcw, StickyNote,
  Loader2, X,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import CustomerPicker from '@/components/CustomerPicker';
import { useVend } from './ui';

const TIPOS = [
  { key: 'reuniao',      label: 'Reunião',      Icon: Users,      cor: '#60a5fa' },
  { key: 'ligacao',      label: 'Ligação',      Icon: Phone,      cor: '#4ade80' },
  { key: 'retorno',      label: 'Retorno',      Icon: RotateCcw,  cor: '#fbbf24' },
  { key: 'compromisso',  label: 'Compromisso',  Icon: CalendarDays, cor: '#c084fc' },
  { key: 'observacao',   label: 'Observação',   Icon: StickyNote, cor: '#94a3b8' },
];
const tipoDe = k => TIPOS.find(t => t.key === k) || TIPOS[3];

const quando = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : 'sem data';

// 'YYYY-MM-DDTHH:mm' para o input datetime-local, no fuso local.
const paraInput = d => {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const vazio = () => {
  const d = new Date(); d.setHours(d.getHours() + 1, 0, 0, 0);
  return { kind: 'compromisso', title: '', notes: '', customer_id: null, due_at: paraInput(d) };
};

export default function Agenda() {
  const v = useVend();
  const qc = useQueryClient();
  const [form, setForm] = useState(null);
  const [verFeitos, setVerFeitos] = useState(false);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['agenda'],
    queryFn: () => api.get('/area-vendedor/agenda'),
  });

  const invalidar = () => qc.invalidateQueries(['agenda']);

  const salvar = useMutation({
    mutationFn: () => api.post('/area-vendedor/agenda', {
      ...form,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
    }),
    onSuccess: () => { toast.success('Anotado'); setForm(null); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const concluir = useMutation({
    mutationFn: ({ id, done }) => api.put(`/area-vendedor/agenda/${id}`, { done }),
    onSuccess: invalidar,
    onError: e => toast.error(e.error || 'Erro ao atualizar'),
  });

  const remover = useMutation({
    mutationFn: id => api.delete(`/area-vendedor/agenda/${id}`),
    onSuccess: () => { toast.success('Removido'); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  // Atrasado primeiro, depois hoje, depois o resto. O que passou da hora
  // é o que precisa de decisão agora.
  const { atrasados, hoje, proximos, feitos } = useMemo(() => {
    const agora = new Date();
    const fimHoje = new Date(); fimHoje.setHours(23, 59, 59, 999);
    const abertos = itens.filter(i => !i.done);
    return {
      atrasados: abertos.filter(i => i.due_at && new Date(i.due_at) < agora),
      hoje:      abertos.filter(i => i.due_at && new Date(i.due_at) >= agora && new Date(i.due_at) <= fimHoje),
      proximos:  abertos.filter(i => !i.due_at || new Date(i.due_at) > fimHoje),
      feitos:    itens.filter(i => i.done),
    };
  }, [itens]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Agenda</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            Reuniões, ligações, retornos e o que não pode ser esquecido
          </p>
        </div>
        <button onClick={() => setForm(vazio())} className="btn-primary">
          <Plus size={16} /> Nova anotação
        </button>
      </div>

      {form && (
        <div style={{ ...v.card, padding: '1.25rem' }} className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="font-semibold" style={{ color: v.textPrimary }}>Nova anotação</p>
            <button onClick={() => setForm(null)} className="p-1" style={{ color: v.textMuted }}><X size={16} /></button>
          </div>

          <div className="flex flex-wrap gap-1.5">
            {TIPOS.map(t => (
              <button key={t.key} onClick={() => setForm(f => ({ ...f, kind: t.key }))}
                className="px-3 py-1.5 rounded-lg text-[12px] font-medium flex items-center gap-1.5"
                style={form.kind === t.key
                  ? { background: t.cor, color: '#0b1020' }
                  : { background: v.surface, color: v.textMuted, border: `1px solid ${v.divider}` }}>
                <t.Icon size={13} /> {t.label}
              </button>
            ))}
          </div>

          <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
            placeholder="Ex.: Ligar para a Casas do Tur sobre a recompra"
            style={{ ...v.control, width: '100%' }} autoFocus />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1"
                style={{ color: v.textSubtle }}>Quando</label>
              <input type="datetime-local" value={form.due_at || ''}
                onChange={e => setForm(f => ({ ...f, due_at: e.target.value }))}
                style={{ ...v.control, width: '100%' }} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1"
                style={{ color: v.textSubtle }}>Cliente (opcional)</label>
              <CustomerPicker customerId={form.customer_id}
                onSelect={c => setForm(f => ({ ...f, customer_id: c?.id || null }))} />
            </div>
          </div>

          <textarea rows={2} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Observações" style={{ ...v.control, width: '100%', resize: 'vertical' }} />

          <div className="flex gap-2">
            <button onClick={() => setForm(null)} className="btn-secondary">Cancelar</button>
            <button onClick={() => salvar.mutate()} disabled={!form.title.trim() || salvar.isPending}
              className="btn-primary">
              {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />} Salvar
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center h-40">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          <Grupo v={v} titulo="Atrasados"  cor="#f87171" itens={atrasados} concluir={concluir} remover={remover} />
          <Grupo v={v} titulo="Hoje"       cor="#facc15" itens={hoje}      concluir={concluir} remover={remover} />
          <Grupo v={v} titulo="Próximos"   cor="#60a5fa" itens={proximos}  concluir={concluir} remover={remover} />

          {feitos.length > 0 && (
            <div>
              <button onClick={() => setVerFeitos(x => !x)} className="btn-secondary btn-sm">
                {verFeitos ? 'Ocultar' : 'Ver'} concluídos ({feitos.length})
              </button>
              {verFeitos && (
                <div className="mt-3">
                  <Grupo v={v} titulo="Concluídos" cor="#4ade80" itens={feitos} concluir={concluir} remover={remover} />
                </div>
              )}
            </div>
          )}

          {!itens.length && (
            <p className="text-center py-14 text-sm" style={{ color: v.empty }}>
              Nada anotado ainda. O que você não quer esquecer amanhã?
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Grupo({ v, titulo, cor, itens, concluir, remover }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: cor }}>
        {titulo} ({itens.length})
      </p>
      <div className="space-y-2">
        {itens.map(i => {
          const t = tipoDe(i.kind);
          return (
            <div key={i.id} style={{ ...v.card, padding: '0.85rem 1rem' }}
              className="flex items-start gap-3">
              <button onClick={() => concluir.mutate({ id: i.id, done: !i.done })}
                title={i.done ? 'Reabrir' : 'Marcar como feito'}
                className="w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                style={{ border: `1px solid ${i.done ? '#4ade80' : v.divider}`,
                         background: i.done ? 'rgba(74,222,128,0.2)' : 'transparent',
                         color: '#4ade80' }}>
                {i.done && <Check size={13} />}
              </button>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium flex items-center gap-2 flex-wrap"
                  style={{ color: v.textPrimary, textDecoration: i.done ? 'line-through' : 'none',
                           opacity: i.done ? 0.55 : 1 }}>
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                    style={{ background: `${t.cor}25`, color: t.cor }}>
                    <t.Icon size={10} /> {t.label}
                  </span>
                  {i.title}
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: v.textSubtle }}>
                  {quando(i.due_at)}
                  {i.CLIENTES?.name && ` · ${i.CLIENTES.name}`}
                </p>
                {i.notes && <p className="text-[12px] mt-1" style={{ color: v.textMuted }}>{i.notes}</p>}
              </div>

              <button onClick={() => remover.mutate(i.id)} title="Remover"
                className="p-1 shrink-0 text-red-400 hover:text-red-500"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
