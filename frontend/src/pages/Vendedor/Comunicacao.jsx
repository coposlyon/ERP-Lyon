// ============================================================
// Comunicação — vendedor ↔ gerente, e mais ninguém.
//
// O vendedor não fala direto com produção, financeiro, estoque ou
// designer: ele relata ao gerente, e o gerente encaminha internamente.
// Sem essa regra, o operador da revelação recebe cobrança de quatro
// vendedores ao mesmo tempo e ninguém sabe mais quem decidiu o quê.
//
// Sem áudio, de propósito: o que é combinado aqui precisa ficar
// pesquisável e citável depois.
// ============================================================
import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MessageSquare, Send, Loader2, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useVend } from './ui';

const quando = iso => new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

export default function Comunicacao() {
  const v = useVend();
  const { user, isManager } = useAuth();
  const qc = useQueryClient();
  const fimRef = useRef(null);

  const [destino, setDestino] = useState('');
  const [texto, setTexto]     = useState('');

  const { data: contatos = [] } = useQuery({
    queryKey: ['comunicacao-contatos'],
    queryFn: () => api.get('/area-vendedor/comunicacao/contatos'),
  });

  const { data: mensagens = [], isLoading } = useQuery({
    queryKey: ['comunicacao'],
    queryFn: () => api.get('/area-vendedor/comunicacao'),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!destino && contatos.length) setDestino(contatos[0].id);
  }, [contatos, destino]);

  // A conversa com o contato escolhido, do mais antigo para o mais novo.
  const conversa = useMemo(() => {
    if (!destino) return [];
    return mensagens
      .filter(m => (m.from_user_id === destino && m.to_user_id === user?.id)
                || (m.to_user_id === destino && m.from_user_id === user?.id))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  }, [mensagens, destino, user]);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: 'end' });
  }, [conversa.length]);

  const naoLidas = useMemo(() => {
    const c = {};
    mensagens.filter(m => m.to_user_id === user?.id && !m.read_at)
      .forEach(m => { c[m.from_user_id] = (c[m.from_user_id] || 0) + 1; });
    return c;
  }, [mensagens, user]);

  const marcarLidas = useMutation({
    mutationFn: ids => Promise.all(ids.map(id => api.put(`/area-vendedor/comunicacao/${id}/lida`))),
    onSuccess: () => qc.invalidateQueries(['comunicacao']),
  });

  // Abrir a conversa é o mesmo que ler: marca o que chegou daquele contato.
  useEffect(() => {
    const pendentes = conversa.filter(m => m.to_user_id === user?.id && !m.read_at).map(m => m.id);
    if (pendentes.length) marcarLidas.mutate(pendentes);
  }, [destino, conversa.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const enviar = useMutation({
    mutationFn: () => api.post('/area-vendedor/comunicacao', { to: [destino], body: texto }),
    onSuccess: () => { setTexto(''); qc.invalidateQueries(['comunicacao']); },
    onError: e => toast.error(e.error || 'Erro ao enviar'),
  });

  const contatoAtual = contatos.find(c => c.id === destino);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Comunicação</h1>
        <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
          {isManager
            ? 'Converse com a equipe e encaminhe o que chegar dos vendedores'
            : 'Fale com o gerente — ele encaminha para o setor responsável'}
        </p>
      </div>

      {contatos.length === 0 ? (
        <div style={{ ...v.card, padding: '2rem' }} className="text-center">
          <p className="text-sm" style={{ color: v.textMuted }}>
            Nenhum gerente cadastrado para receber suas mensagens. Peça ao Administrativo para definir
            um usuário com papel de Gerente.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">

          {/* Contatos */}
          <div style={v.card} className="lg:col-span-1 overflow-hidden">
            <p className="text-[11px] font-semibold uppercase tracking-wider px-4 py-3"
              style={{ color: v.textSubtle, borderBottom: `1px solid ${v.divider}` }}>
              {isManager ? 'Equipe' : 'Gerência'}
            </p>
            {contatos.map(c => (
              <button key={c.id} onClick={() => setDestino(c.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left"
                style={{ borderBottom: `1px solid ${v.divider}`,
                         background: destino === c.id ? 'rgba(37,99,235,0.12)' : 'transparent' }}>
                <span className="w-9 h-9 rounded-full flex items-center justify-center font-bold shrink-0"
                  style={{ background: '#2563eb', color: 'white' }}>
                  {(c.name || '?').charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm truncate" style={{ color: v.textPrimary }}>{c.name}</span>
                  <span className="block text-[11px] truncate" style={{ color: v.textSubtle }}>
                    {c.role === 'admin' ? 'Administrador' : c.role === 'manager' ? 'Gerente' : (c.sector_key || 'Equipe')}
                  </span>
                </span>
                {naoLidas[c.id] > 0 && (
                  <span className="text-[10px] font-bold rounded-full px-1.5 py-0.5 shrink-0"
                    style={{ background: '#facc15', color: '#0b1020' }}>{naoLidas[c.id]}</span>
                )}
              </button>
            ))}

            {!isManager && (
              <p className="text-[11px] px-4 py-3 flex items-start gap-1.5" style={{ color: v.textSubtle }}>
                <ShieldCheck size={12} className="shrink-0 mt-0.5" />
                Produção, financeiro e estoque não recebem mensagem direta — o gerente encaminha.
              </p>
            )}
          </div>

          {/* Conversa */}
          <div style={v.card} className="lg:col-span-3 flex flex-col" >
            <p className="text-sm font-semibold px-4 py-3"
              style={{ color: v.textPrimary, borderBottom: `1px solid ${v.divider}` }}>
              {contatoAtual?.name || 'Selecione um contato'}
            </p>

            <div className="flex-1 overflow-y-auto p-4 space-y-2" style={{ minHeight: 340, maxHeight: '55vh' }}>
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-primary-600" />
                </div>
              ) : conversa.length === 0 ? (
                <p className="text-center py-12 text-sm" style={{ color: v.empty }}>
                  Nenhuma mensagem ainda. Descreva o problema com o número do pedido — assim o gerente
                  já sabe para onde encaminhar.
                </p>
              ) : conversa.map(m => {
                const minha = m.from_user_id === user?.id;
                return (
                  <div key={m.id} className={`flex ${minha ? 'justify-end' : 'justify-start'}`}>
                    <div className="max-w-[78%] rounded-xl px-3 py-2"
                      style={{ background: minha ? '#2563eb' : v.surface,
                               color: minha ? 'white' : v.textPrimary }}>
                      {m.subject && (
                        <p className="text-[11px] font-bold mb-1" style={{ opacity: 0.85 }}>{m.subject}</p>
                      )}
                      <p className="text-[13px] whitespace-pre-wrap break-words">{m.body}</p>
                      <p className="text-[10px] text-right mt-1" style={{ opacity: 0.65 }}>
                        {quando(m.created_at)}{minha && m.read_at ? ' · lida' : ''}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={fimRef} />
            </div>

            <div className="flex items-end gap-2 p-3" style={{ borderTop: `1px solid ${v.divider}` }}>
              <textarea rows={2} value={texto} onChange={e => setTexto(e.target.value)}
                onKeyDown={e => {
                  // Enter envia; Shift+Enter quebra linha, como todo chat.
                  if (e.key === 'Enter' && !e.shiftKey && texto.trim()) { e.preventDefault(); enviar.mutate(); }
                }}
                placeholder="Escreva a mensagem... (Enter envia, Shift+Enter quebra linha)"
                style={{ ...v.control, flex: 1, resize: 'none' }} />
              <button onClick={() => enviar.mutate()} disabled={!texto.trim() || !destino || enviar.isPending}
                className="btn-primary shrink-0">
                {enviar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
