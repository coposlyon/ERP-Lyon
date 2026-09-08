// ============================================================
// COMUNICAÇÃO — o que aconteceu, e quem falou o quê.
//
// DUAS COLUNAS, LADO A LADO, e é de propósito.
//
// À esquerda o MURAL: tudo que o sistema registrou — cadastro alterado,
// pedido editado, etapa concluída, arte anexada — com nome e hora.
// À direita o CHAT da empresa.
//
// Em telas separadas, alguém pergunta no chat "por que o PV-12 voltou
// para o vegetal?" sem ver que a resposta está no mural, três linhas
// acima, assinada. Juntas, a conversa acontece ao lado do fato — e dá
// para citar o que aconteceu enquanto se pergunta sobre isso.
//
// NO CELULAR NÃO CABEM DUAS COLUNAS, e empilhar faria o chat começar
// depois de oitenta linhas de mural. Vira abas.
// ============================================================
import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Activity, MessageSquare, Send, Loader2, Trash2, PenLine, CornerUpLeft,
  X, Check, AtSign, RefreshCw, Filter, Users,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend } from '@/components/UI/theme';
import { useAuth } from '@/contexts/AuthContext';
import { corStatus } from '@/lib/pedidoUi';

/* ── tempo ────────────────────────────────────────────────── */

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const hora = iso => {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * "há 3 min" para o que acabou de acontecer, data para o resto.
 *
 * O relativo é o que se lê num mural — ninguém compara horários, quer
 * saber se foi agora. Passando de um dia, o relativo vira inútil ("há
 * 9 dias" não localiza nada) e a data volta.
 */
function quando(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const seg = (Date.now() - d.getTime()) / 1000;
  if (seg < 60) return 'agora';
  if (seg < 3600) return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400) return `há ${Math.floor(seg / 3600)} h`;
  return `${d.getDate()} ${MESES[d.getMonth()]} ${hora(iso)}`;
}

/** O rótulo do dia que separa os blocos da conversa. */
function diaLabel(iso) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  const igual = (a, b) => a.toDateString() === b.toDateString();
  if (igual(d, hoje)) return 'Hoje';
  if (igual(d, ontem)) return 'Ontem';
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Duas letras para o avatar — o que sobra quando não há foto. */
const iniciais = nome => String(nome || '?')
  .trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase() || '?';

/**
 * Uma cor por pessoa, sempre a mesma.
 *
 * Sai do nome, e não de um sorteio: quem lê a conversa reconhece o
 * interlocutor pela cor antes de ler o nome, e isso só funciona se a
 * cor não mudar a cada recarga da página.
 */
function corDaPessoa(nome) {
  let h = 0;
  for (const c of String(nome || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h} 62% 58%)`;
}

/* ══ A TELA ═══════════════════════════════════════════════════ */

export default function Comunicacao() {
  const v = useVend();
  const [aba, setAba] = useState('chat');   // só no celular

  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Comunicação</h1>
        <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
          Tudo que aconteceu no sistema, e a conversa da equipe — lado a lado
        </p>
      </div>

      {/* Celular: abas. Não cabem duas colunas, e empilhar faria o chat
          começar depois de oitenta linhas de mural. */}
      <div className="flex gap-2 lg:hidden">
        {[['chat', 'Chat', MessageSquare], ['mural', 'Atividades', Activity]].map(([k, rot, Icon]) => (
          <button key={k} onClick={() => setAba(k)}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-[0.6rem] text-sm font-medium"
            style={aba === k
              ? { background: '#2563eb', color: 'white', border: '1px solid #2563eb' }
              : { background: v.control.background, color: v.textPrimary, border: v.control.border }}>
            <Icon size={15} /> {rot}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className={aba === 'mural' ? '' : 'hidden lg:block'}><Mural v={v} /></div>
        <div className={aba === 'chat' ? '' : 'hidden lg:block'}><Chat v={v} /></div>
      </div>
    </div>
  );
}

/* ══ O MURAL ══════════════════════════════════════════════════ */

function Mural({ v }) {
  const [tipo, setTipo] = useState('');       // '' | 'sistema' | 'pedidos'
  const [quem, setQuem] = useState('');

  const { data: pessoas = [] } = useQuery({
    queryKey: ['comunicacao-pessoas'],
    queryFn: () => api.get('/comunicacao/pessoas'),
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['atividades', tipo, quem],
    queryFn: () => api.get(`/comunicacao/atividades?limite=120${tipo ? `&tipo=${tipo}` : ''}${quem ? `&user_id=${quem}` : ''}`),
    // O mural se atualiza sozinho: ele existe para contar o que está
    // acontecendo AGORA, e um mural que só muda com F5 conta o que
    // aconteceu quando alguém lembrou de apertar F5.
    refetchInterval: 30000,
  });

  const eventos = data?.data || [];

  // Blocos por dia. Trinta linhas seguidas sem marco de data viram uma
  // parede: não dá para saber onde ontem termina.
  const porDia = useMemo(() => {
    const grupos = [];
    for (const e of eventos) {
      const rot = diaLabel(e.at);
      if (!grupos.length || grupos[grupos.length - 1].dia !== rot) grupos.push({ dia: rot, itens: [] });
      grupos[grupos.length - 1].itens.push(e);
    }
    return grupos;
  }, [eventos]);

  return (
    <div style={v.card} className="flex flex-col" >
      <div className="flex items-center gap-2 px-4 py-3 flex-wrap"
        style={{ borderBottom: `1px solid ${v.divider}` }}>
        <Activity size={16} style={{ color: '#60a5fa' }} />
        <h2 className="text-sm font-semibold flex-1" style={{ color: v.textPrimary }}>Atividades</h2>
        <button onClick={() => refetch()} title="Atualizar agora"
          className="p-1.5 rounded-lg" style={{ color: v.textSubtle }}>
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : undefined} />
        </button>
      </div>

      <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap"
        style={{ borderBottom: `1px solid ${v.divider}` }}>
        <Filter size={13} style={{ color: v.textSubtle }} />
        <select value={tipo} onChange={e => setTipo(e.target.value)}
          style={{ ...v.control, padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}>
          <option value="">Tudo</option>
          <option value="sistema">Cadastros e ajustes</option>
          <option value="pedidos">Andamento dos pedidos</option>
        </select>
        <select value={quem} onChange={e => setQuem(e.target.value)}
          title="Só as ações registradas com autor — o andamento automático não tem um"
          style={{ ...v.control, padding: '0.35rem 0.5rem', fontSize: '0.78rem' }}>
          <option value="">Qualquer pessoa</option>
          {pessoas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="overflow-y-auto p-3 space-y-4" style={{ maxHeight: '62vh' }}>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: v.textSubtle }}>
            <Loader2 size={14} className="animate-spin" /> Carregando…
          </p>
        ) : !eventos.length ? (
          <div className="text-center py-10 px-4">
            <Activity size={28} className="mx-auto mb-2" style={{ color: v.empty }} />
            <p className="text-sm" style={{ color: v.textMuted }}>Nada registrado ainda.</p>
            <p className="text-[12px] mt-1" style={{ color: v.textSubtle }}>
              Assim que alguém mexer num cadastro ou mover um pedido, aparece aqui.
            </p>
          </div>
        ) : porDia.map(grupo => (
          <div key={grupo.dia} className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider font-semibold px-1"
              style={{ color: v.textSubtle }}>{grupo.dia}</p>
            {grupo.itens.map(e => <LinhaDoMural key={e.id} v={v} e={e} />)}
          </div>
        ))}
      </div>
    </div>
  );
}

function LinhaDoMural({ v, e }) {
  const cor = corStatus(e.cor) || '#60a5fa';
  return (
    <div className="flex items-start gap-2.5 px-2 py-1.5 rounded-lg">
      {/* O ponto colorido carrega o tipo do evento. Fundo inteiro
          colorido em trinta linhas seguidas é uma parede piscando. */}
      <span className="w-2 h-2 rounded-full shrink-0 mt-1.5" style={{ background: cor }} />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] leading-snug" style={{ color: v.textPrimary }}>
          {e.user && <b>{e.user} </b>}
          <span style={{ color: v.textMuted }}>{e.texto}</span>
        </p>
        {e.observacao && (
          <p className="text-[11.5px] mt-0.5 italic" style={{ color: v.textSubtle }}>"{e.observacao}"</p>
        )}
      </div>
      <span className="text-[11px] shrink-0 tabular-nums" style={{ color: v.textSubtle }}>
        {hora(e.at)}
      </span>
    </div>
  );
}

/* ══ O CHAT ═══════════════════════════════════════════════════ */

/**
 * AS SALAS DO CHAT.
 *
 * Era uma sala só, e uma sala só é a sala em que ninguém fala: o aviso
 * do estoque some no meio do assunto da produção, e quem precisa do
 * financeiro chama no WhatsApp pessoal — onde nada fica registrado e
 * ninguém mais da equipe lê depois.
 *
 * Agora existe a da empresa inteira e uma por SETOR, saídas do cadastro
 * de Permissões: setor novo ganha sala sozinho.
 *
 * TODAS ABERTAS A TODOS, de propósito. A sala organiza o assunto, não
 * esconde informação: numa fábrica de trinta pessoas, sala fechada é a
 * mesma conversa acontecendo duas vezes. Quem não é do setor entra para
 * perguntar, que é o que se quer que aconteça.
 */
function Salas({ v, canais, atual, onEscolher }) {
  if (canais.length < 2) return null;
  return (
    <div className="flex gap-1.5 px-3 py-2 overflow-x-auto"
      style={{ borderBottom: `1px solid ${v.divider}` }}>
      {canais.map(c => {
        const ativo = c.key === atual;
        return (
          <button key={c.key} type="button" onClick={() => onEscolher(c.key)}
            className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition"
            style={{
              background: ativo ? '#2563eb' : 'rgba(255,255,255,0.05)',
              color: ativo ? '#fff' : v.textMuted,
              border: `1px solid ${ativo ? '#2563eb' : v.divider}`,
            }}>
            {c.tipo === 'geral' ? <MessageSquare size={13} /> : <Users size={13} />}
            {c.nome}
            {c.meu && !ativo && <span className="text-[10px] opacity-70">(seu setor)</span>}
            {/* Menção pesa mais que mensagem nova: quarenta não lidas na
                sala é rotina, uma menção é alguém esperando resposta. */}
            {!ativo && c.nao_lidas > 0 && (
              <span className="ml-0.5 px-1.5 rounded-full text-[10px] font-bold"
                style={{ background: c.mencoes > 0 ? '#f43f5e' : 'rgba(255,255,255,0.15)', color: '#fff' }}>
                {c.mencoes > 0 ? `@${c.mencoes}` : c.nao_lidas}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function Chat({ v }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [canal, setCanal] = useState('geral');
  const [texto, setTexto] = useState('');
  const [respondendo, setRespondendo] = useState(null);
  const [editando, setEditando] = useState(null);
  const fim = useRef(null);
  const caixa = useRef(null);
  const entrada = useRef(null);

  const { data: pessoas = [] } = useQuery({
    queryKey: ['comunicacao-pessoas'],
    queryFn: () => api.get('/comunicacao/pessoas'),
  });

  // As salas, com o que há de novo em cada uma. O intervalo é mais
  // largo que o da conversa aberta: o crachá de outra sala pode chegar
  // com quinze segundos de atraso sem atrapalhar ninguém.
  const { data: salas } = useQuery({
    queryKey: ['chat-canais'],
    queryFn: () => api.get('/comunicacao/canais'),
    refetchInterval: 15000,
  });
  const canais = salas?.data || [];

  const { data, isLoading } = useQuery({
    queryKey: ['chat', canal],
    queryFn: () => api.get(`/comunicacao/chat?canal=${encodeURIComponent(canal)}&limite=200`),
    // Cinco segundos: é uma sala de conversa, e resposta que chega meio
    // minuto depois faz duas pessoas escreverem a mesma coisa.
    refetchInterval: 5000,
  });

  const msgs = data?.data || [];

  /**
   * ROLA PARA O FIM — MAS SÓ SE JÁ ESTAVA NO FIM.
   *
   * Quem está lendo uma conversa de ontem, no meio da lista, não pode
   * ser jogado para baixo porque alguém escreveu agora. A regra é a de
   * qualquer chat: se você está colado no rodapé, acompanha; se subiu,
   * fica onde estava.
   */
  const [colado, setColado] = useState(true);
  useEffect(() => {
    if (colado) fim.current?.scrollIntoView({ block: 'end' });
  }, [msgs.length, colado]);

  // Abriu a sala = leu a sala.
  useEffect(() => {
    api.post('/comunicacao/chat/lido', { canal }).catch(() => {});
  }, [msgs.length, canal]);

  const enviar = useMutation({
    mutationFn: corpo => (editando
      ? api.put(`/comunicacao/chat/${editando.id}`, { body: corpo })
      : api.post('/comunicacao/chat', { canal, body: corpo, reply_to: respondendo?.id || null })),
    onSuccess: () => {
      setTexto(''); setRespondendo(null); setEditando(null); setColado(true);
      qc.invalidateQueries({ queryKey: ['chat', canal] });
      qc.invalidateQueries({ queryKey: ['chat-canais'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível enviar'),
  });

  const remover = useMutation({
    mutationFn: id => api.delete(`/comunicacao/chat/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['chat', canal] }),
    onError: e => toast.error(e.error || 'Não foi possível remover'),
  });

  function submeter(ev) {
    ev?.preventDefault();
    const corpo = texto.trim();
    if (!corpo || enviar.isPending) return;
    enviar.mutate(corpo);
  }

  function comecarEdicao(m) {
    setEditando(m); setRespondendo(null); setTexto(m.body || '');
    entrada.current?.focus();
  }

  // Blocos por dia, e nome só quando o autor muda: numa conversa de
  // cinco mensagens seguidas da mesma pessoa, repetir o nome cinco
  // vezes empurra o texto para a direita sem dizer nada de novo.
  const linhas = useMemo(() => {
    let ultimoDia = null, ultimoAutor = null;
    return msgs.map(m => {
      const dia = diaLabel(m.created_at);
      const novoDia = dia !== ultimoDia;
      const mostraAutor = novoDia || m.user_id !== ultimoAutor || !!m.reply_to;
      ultimoDia = dia; ultimoAutor = m.user_id;
      return { m, dia, novoDia, mostraAutor };
    });
  }, [msgs]);

  return (
    <div style={v.card} className="flex flex-col">
      <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: `1px solid ${v.divider}` }}>
        <MessageSquare size={16} style={{ color: '#4ade80' }} />
        <h2 className="text-sm font-semibold flex-1" style={{ color: v.textPrimary }}>
          {canais.find(c => c.key === canal)?.nome || 'Chat da equipe'}
        </h2>
        <span className="text-[11px]" style={{ color: v.textSubtle }}>
          {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </div>

      <Salas v={v} canais={canais} atual={canal} onEscolher={setCanal} />

      <div ref={caixa}
        onScroll={e => {
          const el = e.currentTarget;
          setColado(el.scrollHeight - el.scrollTop - el.clientHeight < 60);
        }}
        className="overflow-y-auto px-3 py-3 space-y-1" style={{ height: '58vh' }}>
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm py-6 justify-center" style={{ color: v.textSubtle }}>
            <Loader2 size={14} className="animate-spin" /> Carregando a conversa…
          </p>
        ) : !msgs.length ? (
          <div className="text-center py-12 px-4">
            <MessageSquare size={28} className="mx-auto mb-2" style={{ color: v.empty }} />
            <p className="text-sm" style={{ color: v.textMuted }}>A sala está vazia.</p>
            <p className="text-[12px] mt-1" style={{ color: v.textSubtle }}>
              Escreva a primeira mensagem. Use <b>@</b> para chamar alguém pelo nome.
            </p>
          </div>
        ) : linhas.map(({ m, dia, novoDia, mostraAutor }) => (
          <div key={m.id}>
            {novoDia && (
              <div className="flex items-center gap-3 my-3">
                <span className="flex-1 h-px" style={{ background: v.divider }} />
                <span className="text-[10px] uppercase tracking-wider" style={{ color: v.textSubtle }}>{dia}</span>
                <span className="flex-1 h-px" style={{ background: v.divider }} />
              </div>
            )}
            <Mensagem v={v} m={m} eu={user?.id} mostraAutor={mostraAutor}
              onResponder={() => { setRespondendo(m); setEditando(null); entrada.current?.focus(); }}
              onEditar={() => comecarEdicao(m)}
              onRemover={() => remover.mutate(m.id)} />
          </div>
        ))}
        <div ref={fim} />
      </div>

      {/* Respondendo / editando: a barra diz em qual dos dois modos o
          campo está, porque o campo é o mesmo e o texto dentro dele
          significa coisas diferentes. */}
      {(respondendo || editando) && (
        <div className="flex items-center gap-2 px-4 py-2 text-[12px]"
          style={{ borderTop: `1px solid ${v.divider}`, background: v.surface }}>
          {editando ? <PenLine size={13} style={{ color: '#fbbf24' }} /> : <CornerUpLeft size={13} style={{ color: '#60a5fa' }} />}
          <span className="min-w-0 flex-1 truncate" style={{ color: v.textMuted }}>
            {editando
              ? 'Editando a sua mensagem'
              : <>Respondendo <b style={{ color: v.textPrimary }}>{respondendo.user_name}</b>: {String(respondendo.body || '').slice(0, 60)}</>}
          </span>
          <button onClick={() => { setRespondendo(null); setEditando(null); setTexto(''); }}
            className="p-1 rounded" style={{ color: v.textSubtle }} title="Cancelar">
            <X size={13} />
          </button>
        </div>
      )}

      <form onSubmit={submeter} className="flex items-end gap-2 p-3"
        style={{ borderTop: `1px solid ${v.divider}` }}>
        <textarea ref={entrada} rows={1} value={texto}
          onChange={e => setTexto(e.target.value)}
          onKeyDown={e => {
            // ENTER MANDA, SHIFT+ENTER QUEBRA A LINHA. É o que a mão já
            // espera de qualquer chat; obrigar a clicar no botão faz
            // escrever devagar.
            if (e.key === 'Enter' && !e.shiftKey) submeter(e);
            if (e.key === 'Escape') { setRespondendo(null); setEditando(null); setTexto(''); }
          }}
          placeholder={`Escreva para ${canais.find(c => c.key === canal)?.nome || 'a equipe'}…  (@ chama alguém · Enter envia · Shift+Enter quebra a linha)`}
          className="flex-1 resize-none"
          style={{ ...v.control, minHeight: 42, maxHeight: 140, lineHeight: 1.4 }} />
        <button type="submit" disabled={!texto.trim() || enviar.isPending}
          className="shrink-0 w-10 h-10 rounded-[0.6rem] flex items-center justify-center disabled:opacity-40"
          style={{ background: '#2563eb', color: 'white' }}
          title={editando ? 'Salvar a edição' : 'Enviar'}>
          {enviar.isPending
            ? <Loader2 size={16} className="animate-spin" />
            : editando ? <Check size={16} /> : <Send size={16} />}
        </button>
      </form>
    </div>
  );
}

function Mensagem({ v, m, eu, mostraAutor, onResponder, onEditar, onRemover }) {
  const meu = m.user_id === eu;
  const cor = corDaPessoa(m.user_name);
  const chamouMim = (m.mencionados || []).includes(eu);

  if (m.removida) {
    return (
      <p className="text-[12px] italic px-2 py-1" style={{ color: v.empty }}>
        mensagem removida
      </p>
    );
  }

  return (
    <div className="group flex items-start gap-2.5 px-1 py-0.5 rounded-lg"
      style={chamouMim ? { background: 'rgba(251,191,36,0.10)', boxShadow: 'inset 2px 0 0 #fbbf24' } : undefined}>
      {mostraAutor ? (
        <span className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-bold"
          style={{ background: `${cor}33`, color: cor, border: `1px solid ${cor}66` }}>
          {iniciais(m.user_name)}
        </span>
      ) : (
        // O espaço do avatar continua reservado — sem ele, a mensagem
        // seguinte do mesmo autor sairia desalinhada da anterior.
        <span className="w-7 shrink-0" />
      )}

      <div className="min-w-0 flex-1">
        {mostraAutor && (
          <p className="flex items-baseline gap-2 flex-wrap">
            <b className="text-[12.5px]" style={{ color: cor }}>{m.user_name || 'Alguém'}</b>
            <span className="text-[10.5px]" style={{ color: v.textSubtle }}>{quando(m.created_at)}</span>
            {m.edited_at && <span className="text-[10px] italic" style={{ color: v.textSubtle }}>editada</span>}
          </p>
        )}

        {m.citada && (
          <div className="mb-1 pl-2 text-[11.5px] rounded"
            style={{ borderLeft: `2px solid ${v.divider}`, color: v.textSubtle }}>
            <b>{m.citada.user_name}</b>: {m.citada.removida ? <i>mensagem removida</i> : m.citada.body}
          </div>
        )}

        <p className="text-[13.5px] whitespace-pre-wrap break-words" style={{ color: v.textPrimary }}>
          {realcarMencoes(m.body)}
        </p>
      </div>

      {/* As ações aparecem no hover. Três ícones fixos em cada linha de
          uma conversa de duzentas mensagens é mais ícone do que texto. */}
      <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button onClick={onResponder} title="Responder" className="p-1 rounded" style={{ color: v.textSubtle }}>
          <CornerUpLeft size={12} />
        </button>
        {meu && (
          <button onClick={onEditar} title="Editar" className="p-1 rounded" style={{ color: v.textSubtle }}>
            <PenLine size={12} />
          </button>
        )}
        <button onClick={onRemover} title="Remover" className="p-1 rounded" style={{ color: '#f87171' }}>
          <Trash2 size={12} />
        </button>
      </span>
    </div>
  );
}

/**
 * Pinta os "@nome" dentro do texto.
 *
 * É só destaque visual — quem foi realmente chamado o SERVIDOR já
 * resolveu na escrita, contra a lista de usuários. Aqui um "@qualquer"
 * fica azul sem virar menção de ninguém, que é o comportamento certo:
 * a tela não deve inventar destinatário.
 */
function realcarMencoes(texto) {
  const partes = String(texto || '').split(/(@[\p{L}\d._-]{2,40})/gu);
  return partes.map((p, i) => (p.startsWith('@')
    ? <b key={i} style={{ color: '#60a5fa' }}>{p}</b>
    : <span key={i}>{p}</span>));
}
