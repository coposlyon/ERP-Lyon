// ============================================================
// AGENDA — o calendário da empresa.
//
// UM MÊS INTEIRO NA TELA, e não uma lista de compromissos ordenada por
// data. A lista responde "o que vem agora"; o calendário responde "a
// quinta-feira está livre?", que é a pergunta de quem marca reunião com
// o cliente ao telefone. As duas convivem: o mês à esquerda, o dia
// escolhido aberto à direita.
//
// A SEMANA COMEÇA NA SEGUNDA. É a semana de trabalho — domingo no meio
// da grade quebra a leitura de quem procura "terça de manhã".
//
// O QUE APARECE PARA CADA UM está decidido no servidor, e não aqui:
// gerente vê tudo; os demais veem o que é seu, o que é da empresa e
// aquilo em que foram postos como participantes. A tela desenha o que
// chega.
// ============================================================
import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays, ChevronLeft, ChevronRight, Plus, Loader2, Trash2, X,
  Check, MapPin, Users, Clock, Building2,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend } from '@/components/UI/theme';
import { useAuth } from '@/contexts/AuthContext';

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];

const TIPOS = [
  { key: 'reuniao',     rot: 'Reunião',     cor: '#a78bfa' },
  { key: 'tarefa',      rot: 'Tarefa',      cor: '#60a5fa' },
  { key: 'ligacao',     rot: 'Ligação',     cor: '#4ade80' },
  { key: 'retorno',     rot: 'Retorno',     cor: '#fbbf24' },
  { key: 'entrega',     rot: 'Entrega',     cor: '#22d3ee' },
  { key: 'compromisso', rot: 'Compromisso', cor: '#f472b6' },
  { key: 'observacao',  rot: 'Anotação',    cor: '#94a3b8' },
];
const corDoTipo = k => TIPOS.find(t => t.key === k)?.cor || '#94a3b8';
const rotuloDoTipo = k => TIPOS.find(t => t.key === k)?.rot || 'Compromisso';

/* ── datas, sem biblioteca ───────────────────────────────────── */

/** 'YYYY-MM-DD' de um Date LOCAL — toISOString() jogaria para UTC e
 *  trocaria o dia de quem marca às 22h. */
const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const hhmm = s => (s ? String(s).slice(11, 16) : '');
const mesmoDia = (a, b) => a && b && iso(new Date(a)) === iso(new Date(b));

/** As 42 casas da grade: o mês, mais as sobras das semanas das pontas. */
function gradeDoMes(ano, mes) {
  const primeiro = new Date(ano, mes, 1);
  // getDay(): 0=domingo. Convertido para 0=segunda.
  const desloca = (primeiro.getDay() + 6) % 7;
  const inicio = new Date(ano, mes, 1 - desloca);
  return Array.from({ length: 42 }, (_, i) => new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i));
}

/* ══ A TELA ═══════════════════════════════════════════════════ */

export default function Agenda() {
  const v = useVend();
  const qc = useQueryClient();
  const hoje = new Date();
  const [cursor, setCursor] = useState(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const [diaAberto, setDiaAberto] = useState(iso(hoje));
  const [form, setForm] = useState(null);   // compromisso em edição/criação

  const dias = useMemo(() => gradeDoMes(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const de = iso(dias[0]);
  const ate = iso(dias[41]);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['agenda', de, ate],
    queryFn: () => api.get(`/comunicacao/agenda?de=${de}&ate=${ate}`),
  });

  const { data: pessoas = [] } = useQuery({
    queryKey: ['comunicacao-pessoas'],
    queryFn: () => api.get('/comunicacao/pessoas'),
  });

  // Um índice por dia: sem ele, cada uma das 42 casas varreria a lista
  // inteira para descobrir o que tem nela.
  const porDia = useMemo(() => {
    const mapa = {};
    for (const it of itens) {
      if (!it.due_at) continue;
      const k = iso(new Date(it.due_at));
      (mapa[k] ||= []).push(it);
    }
    for (const k of Object.keys(mapa)) {
      mapa[k].sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)));
    }
    return mapa;
  }, [itens]);

  const salvar = useMutation({
    mutationFn: c => (c.id
      ? api.put(`/comunicacao/agenda/${c.id}`, c)
      : api.post('/comunicacao/agenda', c)),
    onSuccess: () => {
      setForm(null);
      qc.invalidateQueries({ queryKey: ['agenda'] });
      toast.success('Compromisso salvo');
    },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });

  const alternarFeito = useMutation({
    mutationFn: it => api.put(`/comunicacao/agenda/${it.id}`, { done: !it.done }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['agenda'] }),
    onError: e => toast.error(e.error || 'Não foi possível marcar'),
  });

  const excluir = useMutation({
    mutationFn: id => api.delete(`/comunicacao/agenda/${id}`),
    onSuccess: () => { setForm(null); qc.invalidateQueries({ queryKey: ['agenda'] }); },
    onError: e => toast.error(e.error || 'Não foi possível excluir'),
  });

  function novo(diaIso) {
    // Nasce às 9h do dia clicado: a hora do meio da manhã acerta mais
    // do que a hora atual, que às 18h50 propõe reunião às 18h50.
    setForm({ kind: 'reuniao', title: '', due_at: `${diaIso}T09:00`, end_at: `${diaIso}T10:00`,
              participantes: [], dia_inteiro: false, da_empresa: false });
  }

  const doDia = porDia[diaAberto] || [];

  return (
    <div className="space-y-4">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Agenda</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            Reuniões, tarefas e compromissos da equipe
          </p>
        </div>
        <button onClick={() => novo(diaAberto)} className="btn-primary">
          <Plus size={16} /> Novo compromisso
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">

        {/* ── O mês ─────────────────────────────────────────── */}
        <div style={v.card}>
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${v.divider}` }}>
            <CalendarDays size={16} style={{ color: '#60a5fa' }} />
            <h2 className="text-sm font-semibold flex-1" style={{ color: v.textPrimary }}>
              {MESES[cursor.getMonth()]} de {cursor.getFullYear()}
              {isLoading && <Loader2 size={12} className="animate-spin inline ml-2" style={{ color: v.textSubtle }} />}
            </h2>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
              className="p-1.5 rounded-lg" style={{ color: v.textMuted }} title="Mês anterior">
              <ChevronLeft size={16} />
            </button>
            <button onClick={() => { const h = new Date(); setCursor(new Date(h.getFullYear(), h.getMonth(), 1)); setDiaAberto(iso(h)); }}
              className="px-2.5 py-1 rounded-lg text-[12px]"
              style={{ background: v.control.background, color: v.textPrimary, border: v.control.border }}>
              Hoje
            </button>
            <button onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
              className="p-1.5 rounded-lg" style={{ color: v.textMuted }} title="Próximo mês">
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 px-2 pt-2">
            {DIAS.map(d => (
              <div key={d} className="text-center text-[10px] uppercase tracking-wider pb-1.5"
                style={{ color: v.textSubtle }}>{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 p-2 pt-0">
            {dias.map(d => {
              const k = iso(d);
              const doMes = d.getMonth() === cursor.getMonth();
              const eHoje = mesmoDia(d, hoje);
              const aberto = k === diaAberto;
              const lista = porDia[k] || [];
              return (
                <button key={k} onClick={() => setDiaAberto(k)} onDoubleClick={() => novo(k)}
                  className="text-left rounded-lg p-1.5 min-h-[74px] flex flex-col gap-1 transition-colors"
                  title={lista.length ? `${lista.length} compromisso(s) — duplo clique para marcar outro` : 'Duplo clique para marcar'}
                  style={{
                    background: aberto ? 'rgba(37,99,235,0.16)' : v.surface,
                    border: `1px solid ${aberto ? '#2563eb' : v.divider}`,
                    // O dia de fora do mês continua clicável, mas apagado:
                    // esconder faria a grade ganhar buracos.
                    opacity: doMes ? 1 : 0.4,
                  }}>
                  <span className="text-[12px] font-semibold flex items-center gap-1"
                    style={{ color: eHoje ? '#60a5fa' : v.textPrimary }}>
                    {d.getDate()}
                    {eHoje && <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#60a5fa' }} />}
                  </span>
                  {/* Três cabem; o resto vira "+N". Empilhar sete numa
                      casa de 74px faz o mês inteiro crescer por causa de
                      um dia. */}
                  {lista.slice(0, 3).map(it => (
                    <span key={it.id} className="text-[10px] leading-tight truncate rounded px-1"
                      style={{
                        background: `${corDoTipo(it.kind)}22`,
                        color: corDoTipo(it.kind),
                        textDecoration: it.done ? 'line-through' : undefined,
                        opacity: it.done ? 0.6 : 1,
                      }}>
                      {!it.dia_inteiro && hhmm(it.due_at) ? `${hhmm(it.due_at)} ` : ''}{it.title}
                    </span>
                  ))}
                  {lista.length > 3 && (
                    <span className="text-[10px]" style={{ color: v.textSubtle }}>+{lista.length - 3}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── O dia escolhido ───────────────────────────────── */}
        <div style={v.card} className="flex flex-col">
          <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${v.divider}` }}>
            <h2 className="text-sm font-semibold flex-1" style={{ color: v.textPrimary }}>
              {new Date(`${diaAberto}T12:00`).toLocaleDateString('pt-BR', {
                weekday: 'long', day: '2-digit', month: 'long',
              })}
            </h2>
            <button onClick={() => novo(diaAberto)} className="p-1.5 rounded-lg"
              style={{ background: 'rgba(37,99,235,0.18)', color: '#60a5fa' }} title="Marcar neste dia">
              <Plus size={14} />
            </button>
          </div>

          <div className="p-3 space-y-2 overflow-y-auto" style={{ maxHeight: '58vh' }}>
            {!doDia.length ? (
              <div className="text-center py-10 px-3">
                <CalendarDays size={26} className="mx-auto mb-2" style={{ color: v.empty }} />
                <p className="text-sm" style={{ color: v.textMuted }}>Nada marcado neste dia.</p>
                <p className="text-[12px] mt-1" style={{ color: v.textSubtle }}>
                  Duplo clique numa casa do calendário marca direto ali.
                </p>
              </div>
            ) : doDia.map(it => (
              <CartaoDoDia key={it.id} v={v} it={it} pessoas={pessoas}
                onAbrir={() => setForm({
                  ...it,
                  due_at: it.due_at ? String(it.due_at).slice(0, 16) : '',
                  end_at: it.end_at ? String(it.end_at).slice(0, 16) : '',
                  participantes: it.participantes || [],
                })}
                onFeito={() => alternarFeito.mutate(it)} />
            ))}
          </div>
        </div>
      </div>

      {form && (
        <FormCompromisso v={v} valor={form} pessoas={pessoas}
          salvando={salvar.isPending} excluindo={excluir.isPending}
          onChange={setForm}
          onSalvar={() => salvar.mutate(form)}
          onExcluir={() => excluir.mutate(form.id)}
          onFechar={() => setForm(null)} />
      )}
    </div>
  );
}

function CartaoDoDia({ v, it, pessoas, onAbrir, onFeito }) {
  const cor = corDoTipo(it.kind);
  const nomes = (it.participantes || [])
    .map(id => pessoas.find(p => p.id === id)?.name).filter(Boolean);

  return (
    <div className="rounded-xl p-2.5 flex items-start gap-2.5"
      style={{ background: v.surface, border: `1px solid ${v.divider}`, borderLeft: `3px solid ${cor}` }}>
      {/* A caixinha é a ação mais frequente do dia: marcar como feito.
          Ela fica antes do texto, do tamanho do dedo. */}
      <button onClick={onFeito} title={it.done ? 'Reabrir' : 'Marcar como concluído'}
        className="w-5 h-5 rounded-md shrink-0 mt-0.5 flex items-center justify-center"
        style={{
          background: it.done ? '#22c55e' : 'transparent',
          border: `1.5px solid ${it.done ? '#22c55e' : v.divider}`,
          color: 'white',
        }}>
        {it.done && <Check size={12} />}
      </button>

      <button onClick={onAbrir} className="min-w-0 flex-1 text-left">
        <p className="text-[13px] font-medium leading-snug"
          style={{ color: v.textPrimary, textDecoration: it.done ? 'line-through' : undefined, opacity: it.done ? 0.6 : 1 }}>
          {it.title}
        </p>
        <p className="text-[11px] mt-0.5 flex items-center gap-2 flex-wrap" style={{ color: v.textSubtle }}>
          <span style={{ color: cor }}>{rotuloDoTipo(it.kind)}</span>
          {it.dia_inteiro
            ? <span className="flex items-center gap-1"><Clock size={10} /> dia inteiro</span>
            : hhmm(it.due_at) && (
                <span className="flex items-center gap-1 tabular-nums">
                  <Clock size={10} /> {hhmm(it.due_at)}{it.end_at ? `–${hhmm(it.end_at)}` : ''}
                </span>
              )}
          {it.local && <span className="flex items-center gap-1"><MapPin size={10} /> {it.local}</span>}
          {it.da_empresa && <span className="flex items-center gap-1" style={{ color: '#22d3ee' }}><Building2 size={10} /> empresa</span>}
        </p>
        {it.CLIENTES?.name && (
          <p className="text-[11px] mt-0.5" style={{ color: v.textMuted }}>Cliente: {it.CLIENTES.name}</p>
        )}
        {nomes.length > 0 && (
          <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: v.textSubtle }}>
            <Users size={10} /> {nomes.join(', ')}
          </p>
        )}
        {it.notes && <p className="text-[11.5px] mt-1" style={{ color: v.textMuted }}>{it.notes}</p>}
      </button>
    </div>
  );
}

/* ══ O formulário ═════════════════════════════════════════════ */

function FormCompromisso({ v, valor, pessoas, salvando, excluindo, onChange, onSalvar, onExcluir, onFechar }) {
  const { isManager, isAdmin } = useAuth();
  const campo = (k, x) => onChange({ ...valor, [k]: x });
  const primeiro = useRef(null);
  useEffect(() => { primeiro.current?.focus(); }, []);

  const podeMarcarEmpresa = isManager || isAdmin;
  const invalido = !String(valor.title || '').trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,18,0.72)' }} onClick={onFechar}>
      <div onClick={e => e.stopPropagation()}
        className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl p-5"
        style={{ ...v.card, borderRadius: '1rem' }}>

        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base font-bold" style={{ color: v.textPrimary }}>
            {valor.id ? 'Editar compromisso' : 'Novo compromisso'}
          </h2>
          <button onClick={onFechar} className="p-1 rounded-lg" style={{ color: v.textSubtle }}>
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1"
              style={{ color: v.textSubtle }}>O quê</label>
            <input ref={primeiro} value={valor.title || ''} maxLength={200}
              onChange={e => campo('title', e.target.value)}
              placeholder="Ex.: reunião de produção da semana"
              style={{ ...v.control, width: '100%' }} />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1.5"
              style={{ color: v.textSubtle }}>Tipo</label>
            <div className="flex flex-wrap gap-1.5">
              {TIPOS.map(t => (
                <button key={t.key} type="button" onClick={() => campo('kind', t.key)}
                  className="px-2.5 py-1.5 rounded-lg text-[12px] font-medium"
                  style={valor.kind === t.key
                    ? { background: `${t.cor}2a`, color: t.cor, border: `1px solid ${t.cor}` }
                    : { background: v.control.background, color: v.textMuted, border: v.control.border }}>
                  {t.rot}
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-center gap-2 text-[13px] cursor-pointer" style={{ color: v.textPrimary }}>
            <input type="checkbox" checked={!!valor.dia_inteiro}
              onChange={e => campo('dia_inteiro', e.target.checked)} />
            Dia inteiro
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1"
                style={{ color: v.textSubtle }}>{valor.dia_inteiro ? 'Dia' : 'Início'}</label>
              <input type={valor.dia_inteiro ? 'date' : 'datetime-local'}
                value={valor.dia_inteiro ? String(valor.due_at || '').slice(0, 10) : (valor.due_at || '')}
                onChange={e => campo('due_at', valor.dia_inteiro ? `${e.target.value}T00:00` : e.target.value)}
                style={{ ...v.control, width: '100%', colorScheme: v.isDark ? 'dark' : 'light' }} />
            </div>
            {!valor.dia_inteiro && (
              <div>
                <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1"
                  style={{ color: v.textSubtle }}>Término</label>
                <input type="datetime-local" value={valor.end_at || ''}
                  onChange={e => campo('end_at', e.target.value)}
                  style={{ ...v.control, width: '100%', colorScheme: v.isDark ? 'dark' : 'light' }} />
              </div>
            )}
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1"
              style={{ color: v.textSubtle }}>Onde <span className="normal-case font-normal">(opcional)</span></label>
            <input value={valor.local || ''} maxLength={200}
              onChange={e => campo('local', e.target.value)}
              placeholder="Sala, fábrica, endereço do cliente…"
              style={{ ...v.control, width: '100%' }} />
          </div>

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1.5"
              style={{ color: v.textSubtle }}>Quem mais participa</label>
            <div className="flex flex-wrap gap-1.5">
              {pessoas.map(p => {
                const dentro = (valor.participantes || []).includes(p.id);
                return (
                  <button key={p.id} type="button"
                    onClick={() => campo('participantes', dentro
                      ? valor.participantes.filter(x => x !== p.id)
                      : [...(valor.participantes || []), p.id])}
                    className="px-2.5 py-1 rounded-full text-[12px]"
                    style={dentro
                      ? { background: 'rgba(37,99,235,0.22)', color: '#93c5fd', border: '1px solid #2563eb' }
                      : { background: v.control.background, color: v.textMuted, border: v.control.border }}>
                    {p.name}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] mt-1.5" style={{ color: v.textSubtle }}>
              Quem participa enxerga o compromisso e pode marcá-lo como concluído — mudar hora,
              lugar e a lista é de quem marcou.
            </p>
          </div>

          {podeMarcarEmpresa && (
            <label className="flex items-start gap-2 text-[13px] cursor-pointer rounded-xl p-2.5"
              style={{ background: v.surface, border: `1px solid ${v.divider}`, color: v.textPrimary }}>
              <input type="checkbox" checked={!!valor.da_empresa} className="mt-0.5"
                onChange={e => campo('da_empresa', e.target.checked)} />
              <span>
                Compromisso da empresa
                <span className="block text-[11px]" style={{ color: v.textSubtle }}>
                  Aparece no calendário de todo mundo — feriado, parada de máquina, inventário.
                  Sem precisar listar cada pessoa, e sem esquecer quem for contratado depois.
                </span>
              </span>
            </label>
          )}

          <div>
            <label className="text-[11px] uppercase tracking-wider font-semibold block mb-1"
              style={{ color: v.textSubtle }}>Anotações</label>
            <textarea rows={3} value={valor.notes || ''} maxLength={2000}
              onChange={e => campo('notes', e.target.value)}
              style={{ ...v.control, width: '100%', resize: 'vertical' }} />
          </div>
        </div>

        <div className="flex items-center gap-2 justify-end mt-5">
          {valor.id && (
            <button onClick={onExcluir} disabled={excluindo}
              className="flex items-center gap-1.5 px-3 py-2 rounded-[0.6rem] text-sm mr-auto disabled:opacity-50"
              style={{ background: 'rgba(239,68,68,0.14)', color: '#f87171', border: '1px solid rgba(239,68,68,0.35)' }}>
              {excluindo ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />} Excluir
            </button>
          )}
          <button onClick={onFechar} className="px-3 py-2 rounded-[0.6rem] text-sm"
            style={{ background: v.control.background, color: v.textPrimary, border: v.control.border }}>
            Cancelar
          </button>
          <button onClick={onSalvar} disabled={invalido || salvando}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[0.6rem] text-sm font-semibold disabled:opacity-45"
            style={{ background: '#2563eb', color: 'white' }}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
