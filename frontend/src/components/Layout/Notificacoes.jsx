// ============================================================
// O SININHO — O QUE MUDOU DESDE QUE VOCÊ OLHOU.
//
// Os avisos vêm CALCULADOS do servidor (backend/src/lib/avisos.js), das
// mesmas tabelas que as telas mostram: pedido novo, PIX esperando
// conferência, compra registrada, estoque no mínimo, conta vencida,
// pedido do colaborador parado. Nada é gravado numa tabela de
// notificação — o aviso existe enquanto o fato existir e some sozinho
// quando alguém resolve.
//
// "JÁ VI ISSO" É DO USUÁRIO, NÃO DO FATO.
//
// Por isso mora no navegador dele, e não no banco: duas pessoas do
// mesmo tenant precisam poder ler o mesmo aviso, cada uma no seu tempo.
// Se a marca de lido fosse do fato, o primeiro que abrisse o sininho
// apagaria o aviso do outro — que é o jeito mais rápido de alguém
// perder um pedido.
//
// A lista de lidos é PODADA a cada leitura: id que não aparece mais nos
// avisos sai do armazenamento. Sem isso, ela cresceria para sempre,
// guardando o id de um pedido de dois anos atrás.
// ============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Bell, ShoppingCart, Wallet, ShoppingBag, Boxes, AlertTriangle,
  UserCog, ShieldCheck, Check, Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';

const ICONE = {
  pedido: ShoppingCart,
  pagamento: Wallet,
  compra: ShoppingBag,
  estoque: Boxes,
  financeiro: AlertTriangle,
  rh: UserCog,
  cadastro: ShieldCheck,
};

const COR = {
  pedido: 'bg-blue-500/15 text-blue-500',
  pagamento: 'bg-emerald-500/15 text-emerald-500',
  compra: 'bg-violet-500/15 text-violet-500',
  estoque: 'bg-amber-500/15 text-amber-500',
  financeiro: 'bg-red-500/15 text-red-500',
  rh: 'bg-sky-500/15 text-sky-500',
  cadastro: 'bg-fuchsia-500/15 text-fuchsia-500',
};

/** "agora", "há 5 min", "há 3 h", "ontem", "12/08". Situação sem data não mente uma. */
function quando(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  const min = Math.round((Date.now() - d.getTime()) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `há ${h} h`;
  if (h < 48) return 'ontem';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

const chaveLidos = userId => `avisos-lidos:${userId || 'anon'}`;

function carregarLidos(userId) {
  try {
    const cru = localStorage.getItem(chaveLidos(userId));
    const lista = cru ? JSON.parse(cru) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    // Navegador anônimo, storage bloqueado, JSON corrompido — o
    // sininho continua funcionando, só sem memória do que já foi visto.
    return [];
  }
}

function gravarLidos(userId, lista) {
  try { localStorage.setItem(chaveLidos(userId), JSON.stringify(lista)); } catch { /* sem memória, e tudo bem */ }
}

export default function Notificacoes({ className = '' }) {
  const { user } = useAuth();
  const { isDark } = useTheme();
  const navigate = useNavigate();
  const [aberto, setAberto] = useState(false);
  const [lidos, setLidos] = useState(() => carregarLidos(user?.id));

  const { data, isLoading } = useQuery({
    queryKey: ['avisos'],
    queryFn: () => api.get('/avisos'),
    // Um minuto: rápido o bastante para o PIX que acabou de chegar,
    // devagar o bastante para não pesar. Em segundo plano, não.
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    retry: false,
  });

  const avisos = useMemo(() => data?.avisos || [], [data]);

  // Poda: id que sumiu dos avisos sai da lista de lidos.
  useEffect(() => {
    if (!avisos.length) return;
    const existentes = new Set(avisos.map(a => a.id));
    const podado = lidos.filter(id => existentes.has(id));
    if (podado.length !== lidos.length) {
      setLidos(podado);
      gravarLidos(user?.id, podado);
    }
  }, [avisos]); // eslint-disable-line react-hooks/exhaustive-deps

  const naoLidos = avisos.filter(a => !lidos.includes(a.id));

  const marcar = useCallback((ids) => {
    setLidos(atual => {
      const novo = [...new Set([...atual, ...ids])];
      gravarLidos(user?.id, novo);
      return novo;
    });
  }, [user?.id]);

  function abrir(aviso) {
    marcar([aviso.id]);
    setAberto(false);
    if (aviso.link) navigate(aviso.link);
  }

  const iconCls = isDark
    ? 'p-2 rounded-lg transition-colors hover:bg-gray-700 text-gray-400 flex items-center justify-center'
    : 'p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500 flex items-center justify-center';

  const painel = {
    background: isDark ? '#080d24' : '#ffffff',
    border: `1px solid ${isDark ? '#1d2b6b' : '#e5e7eb'}`,
  };
  const divisor = isDark ? '#1d2b6b' : '#f3f4f6';
  const corTitulo = isDark ? 'text-gray-100' : 'text-gray-800';
  const corDetalhe = isDark ? 'text-gray-400' : 'text-gray-500';

  return (
    <div className={`relative ${className}`}>
      <button onClick={() => setAberto(v => !v)} className={`${iconCls} relative`} aria-label="Notificações">
        <Bell size={18} />
        {!!naoLidos.length && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {naoLidos.length > 99 ? '99+' : naoLidos.length}
          </span>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-2 w-[min(92vw,380px)] rounded-xl shadow-xl z-40 overflow-hidden"
            style={painel}>
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: `1px solid ${divisor}` }}>
              <p className={`text-sm font-semibold ${corTitulo}`}>
                Notificações
                {!!naoLidos.length && <span className="ml-1.5 text-xs font-normal text-red-500">{naoLidos.length} nova(s)</span>}
              </p>
              {!!naoLidos.length && (
                <button onClick={() => marcar(avisos.map(a => a.id))}
                  className="text-[11px] text-primary-500 hover:underline flex items-center gap-1">
                  <Check size={12} /> marcar tudo como lido
                </button>
              )}
            </div>

            <div className="max-h-[min(70vh,460px)] overflow-y-auto">
              {isLoading ? (
                <div className="py-10 flex justify-center"><Loader2 size={20} className="animate-spin text-gray-400" /></div>
              ) : !avisos.length ? (
                <div className="py-10 text-center px-6">
                  <Bell size={22} className="mx-auto text-gray-300 mb-2" />
                  <p className={`text-sm ${corDetalhe}`}>Nada esperando por você.</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Pedido novo, PIX para conferir, estoque no mínimo e conta vencida aparecem aqui.
                  </p>
                </div>
              ) : (
                avisos.map(a => {
                  const Icone = ICONE[a.tipo] || Bell;
                  const lido = lidos.includes(a.id);
                  return (
                    <button key={a.id} onClick={() => abrir(a)}
                      className={`w-full text-left px-3.5 py-2.5 flex items-start gap-3 transition-colors ${
                        isDark ? 'hover:bg-white/5' : 'hover:bg-gray-50'} ${lido ? 'opacity-55' : ''}`}
                      style={{ borderBottom: `1px solid ${divisor}` }}>
                      <span className={`w-8 h-8 rounded-lg shrink-0 flex items-center justify-center ${COR[a.tipo] || 'bg-gray-500/15 text-gray-500'}`}>
                        <Icone size={15} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-medium truncate ${corTitulo}`}>
                          {a.titulo}
                          {a.prioridade === 'alta' && !lido && (
                            <span className="ml-1.5 align-middle inline-block w-1.5 h-1.5 rounded-full bg-red-500" />
                          )}
                        </span>
                        <span className={`block text-xs truncate ${corDetalhe}`}>{a.detalhe}</span>
                        {quando(a.quando) && (
                          <span className="block text-[10px] text-gray-400 mt-0.5">{quando(a.quando)}</span>
                        )}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
