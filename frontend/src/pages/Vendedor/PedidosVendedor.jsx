// ============================================================
// TELA 1 (área do vendedor) — Pedidos de Venda
//
// A carteira daquele vendedor: em que etapa cada pedido está, o que
// está atrasando e o que precisa de ação hoje. Ele acompanha e avisa —
// não altera pedido nem entra no módulo de quem está segurando.
//
// O padrão da tela é o que está ACONTECENDO: pedido concluído só
// aparece com o filtro "Finalizados" ligado, que é o caminho da
// recompra ("comprou pela Shopee em outubro, quer repetir agora").
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Search, Filter, RotateCcw, Plus, Eye, FileText, Send, CheckCircle2,
  AlertTriangle, Siren, ChevronLeft, ChevronRight,
} from 'lucide-react';
import api from '@/lib/api';
import { useVend, fmtBRL } from './ui';
import AtencaoModal from './AtencaoModal';
import NovoPedidoModal from './NovoPedidoModal';

// Ícone das plataformas de origem. Emoji e não imagem: origem nova
// entra sem precisar subir arquivo nenhum.
const ORIGEM_ICONE = {
  'Site': '🌐', 'WhatsApp': '💬', 'Instagram': '📷', 'Facebook': '👥',
  'TikTok': '🎵', 'Shopee': '🛍️', 'Mercado Livre': '🤝', 'Amazon': '📦',
  'Magalu': '🏬', 'Presencial': '🤝', 'Telefone': '📞', 'Indicação': '⭐',
};

const CORES_STATUS = {
  cinza:    '#94a3b8', amarelo: '#facc15', laranja: '#fb923c', azul: '#60a5fa',
  roxo:     '#c084fc', rosa:    '#f472b6', ciano:   '#22d3ee', verde: '#4ade80',
  vermelho: '#f87171',
};

const dataHora = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';

const POR_PAGINA = [10, 25, 50, 100];

export default function PedidosVendedor() {
  const v = useVend();
  const navigate = useNavigate();

  const [codigo, setCodigo]           = useState('');
  const [status, setStatus]           = useState('');
  const [finalizados, setFinalizados] = useState(false);
  const [pagina, setPagina]           = useState(1);
  const [porPagina, setPorPagina]     = useState(10);
  const [atencaoDe, setAtencaoDe]     = useState(null);   // pedido da janelinha
  const [novoPedido, setNovoPedido]   = useState(false);

  const { data: statusList = [] } = useQuery({
    queryKey: ['fluxo-status'],
    queryFn: () => api.get('/area-vendedor/status'),
    staleTime: Infinity,
  });

  const params = new URLSearchParams();
  if (codigo.trim()) params.set('codigo', codigo.trim());
  if (status) params.set('status', status);
  if (finalizados) params.set('finalizados', '1');

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pedidos-vendedor', codigo, status, finalizados],
    queryFn: () => api.get(`/area-vendedor/pedidos?${params.toString()}`),
    refetchInterval: 60000,
  });

  const pedidos = data?.pedidos || [];
  const totalPaginas = Math.max(1, Math.ceil(pedidos.length / porPagina));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const visiveis = useMemo(
    () => pedidos.slice((paginaAtual - 1) * porPagina, paginaAtual * porPagina),
    [pedidos, paginaAtual, porPagina],
  );

  function limpar() {
    setCodigo(''); setStatus(''); setFinalizados(false); setPagina(1);
  }

  const th = 'text-[11px] font-semibold uppercase tracking-wider';

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Pedidos de Venda</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            Gerencie e acompanhe o fluxo de todos os pedidos
          </p>
        </div>
        <button onClick={() => setNovoPedido(true)} className="btn-primary">
          <Plus size={16} /> Novo Pedido
        </button>
      </div>

      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: v.textSubtle }} />
          <input value={codigo} onChange={e => { setCodigo(e.target.value); setPagina(1); }}
            placeholder="Buscar por código do cliente..."
            title="O código permanente que o cliente recebeu no primeiro cadastro (ex.: 0234)"
            style={{ ...v.control, paddingLeft: '2.4rem', width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.4rem' }} />
        </div>

        {/* No lugar do filtro genérico: mostrar ou não os concluídos */}
        <button onClick={() => { setFinalizados(f => !f); setPagina(1); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[0.6rem] text-sm"
          title="Inclui os pedidos já concluídos/entregues — é por aqui que se consulta a compra anterior para a recompra"
          style={finalizados
            ? { background: '#2563eb', color: 'white', border: '1px solid #2563eb' }
            : { background: v.control.background, color: v.textPrimary, border: v.control.border }}>
          <Filter size={15} />
          {finalizados ? 'Mostrando finalizados' : 'Finalizados'}
        </button>

        <select value={status} onChange={e => { setStatus(e.target.value); setPagina(1); }}
          style={{ ...v.control, padding: '0.7rem 0.75rem', minWidth: 190 }}>
          <option value="">Status: Todos</option>
          {statusList.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <button onClick={limpar}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[0.6rem] text-sm"
          style={{ background: v.control.background, color: v.textPrimary, border: v.control.border }}>
          <RotateCcw size={15} /> Limpar filtros
        </button>
      </div>

      {/* ── Tabela ────────────────────────────────────────────── */}
      <div style={v.card}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 1080 }}>
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: `1px solid ${v.divider}`, color: v.textMuted }}>
              <span className={`${th} w-24 shrink-0`}>Pedido</span>
              <span className={`${th} w-36 shrink-0`}>Data / Hora</span>
              <span className={`${th} w-36 shrink-0`}>Origem</span>
              <span className={`${th} w-28 shrink-0`}>Cód. Cliente</span>
              <span className={`${th} flex-1 min-w-0`}>Cliente</span>
              <span className={`${th} w-28 shrink-0 text-right`}>Valor Total</span>
              <span className={`${th} w-24 shrink-0 text-right`}>Frete</span>
              <span className={`${th} w-52 shrink-0 text-center`}>Status</span>
              <span className={`${th} w-20 shrink-0 text-center`}>Atenção</span>
              <span className={`${th} w-28 shrink-0 text-center`}>Ações</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
              </div>
            ) : visiveis.length === 0 ? (
              <p className="text-center py-14 text-sm" style={{ color: v.empty }}>
                {codigo || status
                  ? 'Nenhum pedido com esses filtros.'
                  : 'Nenhum pedido em andamento na sua carteira. Ligue o filtro Finalizados para ver o histórico.'}
              </p>
            ) : visiveis.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-4 py-3 text-sm"
                style={{ borderBottom: `1px solid ${v.divider}` }}>
                <span className="w-24 shrink-0 font-semibold" style={{ color: '#60a5fa' }}>
                  PV-{String(p.number).padStart(4, '0')}
                </span>
                <span className="w-36 shrink-0" style={{ color: v.textMuted }}>
                  {dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)}
                </span>
                <span className="w-36 shrink-0 flex items-center gap-1.5 truncate" style={{ color: v.textPrimary }}
                  title={p.source === 'manual' ? 'Lançado manualmente pelo vendedor' : 'Lançado pelo próprio cliente'}>
                  <span>{ORIGEM_ICONE[p.origin] || '•'}</span>
                  <span className="truncate">{p.origin || '—'}</span>
                </span>
                <span className="w-28 shrink-0 font-mono" style={{ color: v.textMuted }}>
                  {p.codigo_cliente || '—'}
                </span>
                <span className="flex-1 min-w-0 truncate" style={{ color: v.textPrimary }}>
                  {p.CLIENTES?.name || 'Consumidor final'}
                </span>
                <span className="w-28 shrink-0 text-right font-semibold" style={{ color: '#22d3ee' }}>
                  {fmtBRL(p.total)}
                </span>
                <span className="w-24 shrink-0 text-right" style={{ color: v.textMuted }}>
                  {fmtBRL(p.freight)}
                </span>
                <span className="w-52 shrink-0 flex justify-center">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] text-center leading-tight"
                    style={{ border: `1px solid ${CORES_STATUS[p.status_cor] || '#94a3b8'}55`,
                             color: CORES_STATUS[p.status_cor] || '#94a3b8' }}>
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: CORES_STATUS[p.status_cor] || '#94a3b8' }} />
                    {p.status_label}
                  </span>
                </span>
                <span className="w-20 shrink-0 flex justify-center">
                  <SinalAtencao atencao={p.atencao} onClick={() => setAtencaoDe(p)} />
                </span>
                <span className="w-28 shrink-0 flex justify-center gap-1.5">
                  <Acao titulo="Visualizar detalhes" cor="#3b82f6" Icon={Eye}
                    onClick={() => navigate(`/vendedor/pedidos/${p.id}`)} />
                  <Acao titulo="Gerar comprovante do pedido (não é nota fiscal)" cor="#3b82f6" Icon={FileText}
                    onClick={() => navigate(`/vendedor/pedidos/${p.id}?comprovante=1`)} />
                  <Acao titulo="Enviar ao cliente" cor="#16a34a" Icon={Send}
                    onClick={() => navigate(`/vendedor/pedidos/${p.id}?enviar=1`)} />
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Paginação */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: `1px solid ${v.divider}`, color: v.textMuted }}>
          <span className="text-sm">
            Mostrando {visiveis.length ? (paginaAtual - 1) * porPagina + 1 : 0} a{' '}
            {(paginaAtual - 1) * porPagina + visiveis.length} de {pedidos.length} pedidos
            {isFetching && <span className="ml-2 text-xs opacity-60">atualizando…</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPagina(p => Math.max(1, p - 1))} disabled={paginaAtual === 1}
              className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: v.control.border }}>
              <ChevronLeft size={15} />
            </button>
            <span className="px-3 py-1 rounded-lg text-sm font-semibold"
              style={{ background: '#2563eb', color: 'white' }}>{paginaAtual}</span>
            <button onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual >= totalPaginas}
              className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: v.control.border }}>
              <ChevronRight size={15} />
            </button>
          </div>
          <label className="text-sm flex items-center gap-2">
            Itens por página:
            <select value={porPagina} onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}
              style={{ ...v.control, padding: '0.3rem 0.5rem' }}>
              {POR_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* ── Legenda ───────────────────────────────────────────── */}
      <div style={{ ...v.card, padding: '0.85rem 1rem' }}
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
        <span style={{ color: v.textMuted }}>Legenda de ações:</span>
        <Legenda Icon={Eye}      cor="#3b82f6" texto="Visualizar detalhes" />
        <Legenda Icon={FileText} cor="#3b82f6" texto="Gerar comprovante" />
        <Legenda Icon={Send}     cor="#16a34a" texto="Enviar ao cliente" />
      </div>

      <AtencaoModal pedido={atencaoDe} onClose={() => setAtencaoDe(null)} onComunicado={refetch} />
      <NovoPedidoModal open={novoPedido} onClose={() => setNovoPedido(false)} />
    </div>
  );
}

/**
 * O sinal da coluna Atenção.
 *
 * Verde parado, amarelo piscando e sirene vermelha girando — a animação
 * é o ponto: uma tabela cheia de linhas iguais esconde o pedido que vai
 * estourar hoje, e o que se move é o que o olho acha sozinho.
 */
function SinalAtencao({ atencao, onClick }) {
  const nivel = atencao?.level || 'normal';
  const titulo = {
    normal:  'No prazo',
    atencao: 'Atenção — 2 dias do prazo com pendência',
    critico: 'Crítico — menos de 24h com pendência em aberto',
  }[nivel];

  return (
    <button onClick={onClick} title={`${titulo}. Clique para ver o detalhe.`}
      className="p-1 rounded-lg hover:opacity-80">
      {nivel === 'normal' && <CheckCircle2 size={22} style={{ color: '#22c55e' }} />}
      {nivel === 'atencao' && (
        <AlertTriangle size={22} style={{ color: '#facc15', animation: 'atencaoPisca 1s ease-in-out infinite' }} />
      )}
      {nivel === 'critico' && (
        <Siren size={22} style={{ color: '#ef4444', animation: 'atencaoSirene 1.1s linear infinite' }} />
      )}
      <style>{`
        @keyframes atencaoPisca  { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
        @keyframes atencaoSirene { 0%,100% { opacity: 1; transform: rotate(-8deg) }
                                   50%     { opacity: .45; transform: rotate(8deg) } }
        @media (prefers-reduced-motion: reduce) {
          [style*="atencaoPisca"], [style*="atencaoSirene"] { animation: none !important }
        }
      `}</style>
    </button>
  );
}

function Acao({ titulo, cor, Icon, onClick }) {
  return (
    <button onClick={onClick} title={titulo}
      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
      style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}>
      <Icon size={15} />
    </button>
  );
}

function Legenda({ Icon, cor, texto }) {
  const v = useVend();
  return (
    <span className="flex items-center gap-2">
      <span className="w-7 h-7 rounded-lg flex items-center justify-center"
        style={{ background: `${cor}22`, color: cor, border: `1px solid ${cor}55` }}>
        <Icon size={14} />
      </span>
      <span style={{ color: v.textPrimary }}>{texto}</span>
    </span>
  );
}
