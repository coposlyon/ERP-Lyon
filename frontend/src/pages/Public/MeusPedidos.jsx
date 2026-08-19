// ============================================================
// A LISTA DE PEDIDOS DO CLIENTE.
//
// É a tela que aparece depois do login por CPF + data de nascimento, e
// que não existia antes: o acesso era por número de pedido, então quem
// entrava já estava dentro de um. Agora quem entra escolhe.
//
// Só o suficiente para escolher — número, data, status e valor. O
// detalhe fica no pedido aberto: repetir tudo aqui carregaria dez vezes
// o que a pessoa vai olhar uma vez.
//
// Nada do ERP entra aqui, e o servidor confere a dona de cada pedido
// antes de abrir: trocar o id no endereço não abre pedido de ninguém.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Package, ChevronRight, LogOut, Search, Loader2, CalendarDays } from 'lucide-react';
import api from '@/lib/api';
import PortalPublico from './PortalPublico';
import { corStatus } from '@/lib/pedidoUi';

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  .format(Number(v) || 0);

const dataBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

// "2026-08" → "Agosto de 2026", para agrupar a lista por mês.
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
               'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const mesPorExtenso = chave => {
  const [ano, mes] = String(chave || '').split('-');
  return MESES[Number(mes) - 1] ? `${MESES[Number(mes) - 1]} de ${ano}` : chave;
};

export default function MeusPedidos() {
  const navigate = useNavigate();
  const [busca, setBusca] = useState('');
  const token = sessionStorage.getItem('acompanhar_token');
  const nome = sessionStorage.getItem('acompanhar_nome');

  const { data, isLoading, error } = useQuery({
    queryKey: ['meus-pedidos'],
    queryFn: () => api.get(`/acompanhar/pedidos?t=${token}`),
    enabled: !!token,
    // O status muda no ERP enquanto a pessoa olha. Um minuto é curto o
    // bastante para a lista não mentir e longo o bastante para não virar
    // enxurrada de requisição.
    refetchInterval: 60000,
  });

  if (!token) {
    navigate('/acompanhar', { replace: true });
    return null;
  }

  const pedidos = data?.pedidos || [];

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase().replace(/[^\w/]/g, '');
    if (!t) return pedidos;
    return pedidos.filter(p =>
      p.codigo.toLowerCase().includes(t)
      || String(p.numero).includes(t)
      || dataBR(p.data).replace(/\//g, '').includes(t)
      || p.status.toLowerCase().includes(busca.trim().toLowerCase()));
  }, [pedidos, busca]);

  /**
   * Agrupado por mês, do mais novo para o mais antigo.
   *
   * É como as pessoas procuram compra: "aquele de agosto". Uma lista
   * corrida de trinta pedidos obriga a ler data por data.
   */
  const porMes = useMemo(() => {
    const mapa = new Map();
    for (const p of filtrados) {
      const chave = String(p.data || '').slice(0, 7);
      if (!mapa.has(chave)) mapa.set(chave, []);
      mapa.get(chave).push(p);
    }
    return [...mapa.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [filtrados]);

  function sair() {
    sessionStorage.removeItem('acompanhar_token');
    sessionStorage.removeItem('acompanhar_nome');
    navigate('/acompanhar', { replace: true });
  }

  return (
    <PortalPublico largura="max-w-2xl" ajudaTexto={null}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Meus Pedidos</h1>
          {nome && (
            <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Olá, {String(nome).split(' ')[0]}
            </p>
          )}
        </div>
        <button onClick={sair} className="text-xs inline-flex items-center gap-1.5 shrink-0"
          style={{ color: 'rgba(255,255,255,0.55)' }}>
          <LogOut size={13} /> Sair
        </button>
      </div>

      {pedidos.length > 4 && (
        <div className="relative mt-5">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2"
            style={{ color: 'rgba(147,197,253,0.7)' }} />
          <input value={busca} onChange={e => setBusca(e.target.value)}
            placeholder="Buscar por número, data ou status"
            className="w-full rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-white/40 outline-none text-sm"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.3)' }} />
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-14">
          <Loader2 size={26} className="animate-spin" style={{ color: '#60a5fa' }} />
        </div>
      ) : error ? (
        <p className="text-center py-12 text-sm" style={{ color: '#fca5a5' }}>
          {error.error || 'Não foi possível carregar seus pedidos agora.'}
        </p>
      ) : pedidos.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Você ainda não tem pedidos registrados.
        </p>
      ) : filtrados.length === 0 ? (
        <p className="text-center py-12 text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
          Nenhum pedido encontrado com essa busca.
        </p>
      ) : (
        <div className="mt-5 space-y-6">
          {porMes.map(([mes, lista]) => (
            <div key={mes}>
              <p className="text-[11px] uppercase tracking-widest mb-2 flex items-center gap-1.5"
                style={{ color: 'rgba(147,197,253,0.75)' }}>
                <CalendarDays size={12} /> {mesPorExtenso(mes)}
              </p>

              <div className="space-y-2">
                {lista.map(p => (
                  <button key={p.id} onClick={() => navigate(`/acompanhar/pedido/${p.id}`)}
                    className="w-full text-left rounded-xl px-4 py-3.5 flex items-center gap-3 transition-colors"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(96,165,250,0.22)' }}>
                    <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(59,130,246,0.16)' }}>
                      <Package size={17} style={{ color: '#60a5fa' }} />
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2 flex-wrap">
                        <span className="font-bold text-white">{p.codigo}</span>
                        <span className="text-[11px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
                          {dataBR(p.data)}
                        </span>
                      </span>
                      {/* O status usa a mesma cor do ERP: o cliente e a
                          fábrica falando do mesmo pedido com a mesma cor
                          evita o telefonema de "mas aqui está diferente". */}
                      <span className="flex items-center gap-1.5 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: corStatus(p.cor) }} />
                        <span className="text-[12px] truncate" style={{ color: corStatus(p.cor) }}>
                          {p.status}
                        </span>
                      </span>
                    </span>

                    <span className="text-right shrink-0">
                      <span className="block font-semibold text-white text-sm">{brl(p.total)}</span>
                      {p.previsao_entrega && (
                        <span className="block text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                          entrega {dataBR(p.previsao_entrega)}
                        </span>
                      )}
                    </span>

                    <ChevronRight size={16} className="shrink-0" style={{ color: 'rgba(255,255,255,0.35)' }} />
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </PortalPublico>
  );
}
