import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw, FileInput, Filter, Search, FileText, X, Loader2, ChevronRight, ChevronLeft, Truck, Save, MapPin, Package, Printer, Ban, AlertTriangle, Eye, Send, CheckCircle2, Siren, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ExcluirPedidoModal from '@/components/UI/ExcluirPedidoModal';
import { useVend, fmtBRL } from '@/components/UI/theme';
import { corStatus, NIVEL_ATENCAO, CSS_ATENCAO, codigoPedido, codigoCliente } from '@/lib/pedidoUi';
import LogoOrigem from '@/components/UI/LogoOrigem';
import { SALE_STATUS_ORDER, saleStatusIndex, saleStatusLabel, saleStatusClass } from '@/lib/saleStatus';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const fmt = fmtBRL;
const d  = iso => { if (!iso) return ''; try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso; } };
const dt = iso => { if (!iso) return ''; try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm:ss'); } catch { return iso; } };
const dataHora = iso => { if (!iso) return '—'; try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return iso; } };

const POR_PAGINA = [10, 25, 50, 100];

// Botão da barra de ferramentas (mantém os atalhos F2..F6 de sempre)
function TBtn({ icon: Icon, label, sub, onClick, disabled, danger }) {
  const v = useVend();
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-80"
      style={{ color: danger ? '#f87171' : v.textPrimary }}>
      <Icon size={15} style={{ color: danger ? '#f87171' : '#60a5fa' }} /> {label}
      {sub && <span className="text-[10px] font-normal" style={{ color: v.textSubtle }}>{sub}</span>}
    </button>
  );
}

export default function Sales() {
  const v = useVend();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [finalizados, setFinalizados] = useState(false);
  const [porPagina, setPorPagina] = useState(10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const { isAdmin, isManager } = useAuth();
  // Gestor apaga direto por aqui, confirmando com a propria senha.
  const podeExcluir = isAdmin || isManager;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef();

  // O fluxo (label, cor e quem responde por cada etapa) vem do servidor —
  // a mesma fonte que a carteira do vendedor lê, para as duas telas nunca
  // discordarem sobre o que é "Aguardando estoque".
  const { data: statusList = [] } = useQuery({
    queryKey: ['fluxo-status'],
    queryFn: () => api.get('/area-vendedor/status'),
    staleTime: Infinity,
  });
  const statusInfo = useMemo(
    () => Object.fromEntries(statusList.map(s => [s.key, s])),
    [statusList],
  );

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['sales', page, status, search, startDate, endDate, porPagina],
    queryFn: () => {
      let url = `/sales?page=${page}&limit=${porPagina}`;
      if (status) url += `&status=${status}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      return api.get(url);
    },
  });

  const todas = data?.data || [];
  // Pedido concluído sai da lista por padrão: quem abre a tela quer ver o
  // que está acontecendo. O botão Finalizados traz o histórico de volta,
  // que é o caminho da recompra.
  const rows = finalizados ? todas : todas.filter(r => !ehFinal(r.status));
  const selected = rows.find(r => r.id === selectedId) || null;
  const pageTotal  = rows.reduce((s, r) => s + (r.total || 0), 0);
  const pageFreight = rows.reduce((s, r) => s + (r.freight || 0), 0);
  const totalPaginas = Math.max(1, Math.ceil((data?.total || 0) / porPagina));


  function handleSearch(e) { e?.preventDefault?.(); setSearch(searchInput); setPage(1); }
  function clearFilters() {
    setSearch(''); setSearchInput(''); setStatus(''); setStartDate(''); setEndDate('');
    setFinalizados(false); setPage(1);
  }
  const hasFilters = search || status || startDate || endDate || finalizados;

  function openDelete() { if (selected && podeExcluir) setDelTarget(selected); }
  function alterar() { if (selectedId) navigate(`/sales/${selectedId}`); }

  // Atalhos estilo Delphi (F2 incluir, F3 alterar, F4 excluir, F5 atualizar, F6 importar, Ctrl+F pesquisar, ESC fechar)
  useEffect(() => {
    const onKey = (e) => {
      if (delTarget) return; // deixa o modal tratar
      if (e.key === 'F2') { e.preventDefault(); navigate('/sales/new'); }
      else if (e.key === 'F3') { if (selectedId) { e.preventDefault(); alterar(); } }
      else if (e.key === 'F4') { if (selectedId && podeExcluir) { e.preventDefault(); openDelete(); } }
      else if (e.key === 'F5') { e.preventDefault(); qc.invalidateQueries(['sales']); }
      else if (e.key === 'F6') { e.preventDefault(); navigate('/quotes'); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'Escape') { const a = document.activeElement; if (!a || !/INPUT|SELECT|TEXTAREA/.test(a.tagName)) navigate('/'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, isAdmin, delTarget]); // eslint-disable-line

  const th = 'text-[11px] font-semibold uppercase tracking-wider';

  return (
    <div className="space-y-4">
      <style>{CSS_ATENCAO}</style>

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Pedidos de Venda</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            Gerencie e acompanhe o fluxo de todos os pedidos
            {hasFilters && ' · filtrado'}
          </p>
        </div>
        <button onClick={() => navigate('/sales/new')} className="btn-primary">
          <Plus size={16} /> Novo Pedido
        </button>
      </div>

      {/* ── Filtros ───────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <form onSubmit={handleSearch} className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: v.textSubtle }} />
          <input ref={searchRef} value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="Buscar por código do cliente..."
            title="Digite o código do cliente (ex.: 0234) ou parte do nome"
            style={{ ...v.control, width: '100%', padding: '0.7rem 0.75rem 0.7rem 2.4rem' }} />
        </form>

        <button onClick={() => { setFinalizados(f => !f); setPage(1); }}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[0.6rem] text-sm"
          title="Inclui os pedidos já concluídos/entregues — é por aqui que se consulta a compra anterior para a recompra"
          style={finalizados
            ? { background: '#2563eb', color: 'white', border: '1px solid #2563eb' }
            : { background: v.control.background, color: v.textPrimary, border: v.control.border }}>
          <Filter size={15} /> {finalizados ? 'Mostrando finalizados' : 'Finalizados'}
        </button>

        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          style={{ ...v.control, padding: '0.7rem 0.75rem', minWidth: 190 }}>
          <option value="">Status: Todos</option>
          {statusList.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>

        <button onClick={clearFilters}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[0.6rem] text-sm"
          style={{ background: v.control.background, color: v.textPrimary, border: v.control.border }}>
          <RotateCcw size={15} /> Limpar filtros
        </button>

        <button onClick={() => setShowFilters(x => !x)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-[0.6rem] text-sm"
          title="Filtro por período e ferramentas do pedido"
          style={{ background: v.control.background, color: v.textMuted, border: v.control.border }}>
          <ChevronRight size={15} style={{ transform: showFilters ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>

      {/* Ferramentas e período — recolhido por padrão para não competir
          com a tabela, mas com os atalhos de sempre funcionando */}
      {showFilters && (
        <div style={{ ...v.card, padding: '0.75rem 1rem' }} className="space-y-3">
          <div className="flex items-center gap-1 flex-wrap">
            <TBtn icon={Plus}      label="Incluir"   sub="F2" onClick={() => navigate('/sales/new')} />
            <TBtn icon={Pencil}    label="Alterar"   sub="F3" onClick={alterar} disabled={!selectedId} />
            <TBtn icon={Trash2}    label="Excluir"   sub="F4" onClick={openDelete} disabled={!selectedId || !isAdmin} danger />
            <TBtn icon={RefreshCw} label="Atualizar" sub="F5" onClick={() => qc.invalidateQueries(['sales'])} />
            <span className="w-px h-5 mx-1" style={{ background: v.divider }} />
            <TBtn icon={FileInput} label="Importar Orçamento" sub="F6" onClick={() => navigate('/quotes')} />
            <TBtn icon={FileText}  label="Relatórios" onClick={() => window.print()} />
            <TBtn icon={X}         label="Fechar"    sub="ESC" onClick={() => navigate('/')} />
          </div>
          <div className="flex gap-3 flex-wrap items-end">
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: v.textSubtle }}>De</label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} style={v.control} />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: v.textSubtle }}>Até</label>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} style={v.control} />
            </div>
            <button onClick={handleSearch} className="btn-secondary btn-sm">Aplicar busca</button>
          </div>
        </div>
      )}

      {/* ── Tabela ────────────────────────────────────────────── */}
      <div style={v.card}>
        <div className="overflow-x-auto">
          <div style={{ minWidth: 1120 }}>
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ borderBottom: `1px solid ${v.divider}`, color: v.textMuted }}>
              <span className={`${th} w-24 shrink-0`}>Pedido</span>
              <span className={`${th} w-36 shrink-0`}>Data / Hora</span>
              <span className={`${th} w-36 shrink-0`}>Origem</span>
              <span className={`${th} w-28 shrink-0`}>Cód. Cliente</span>
              <span className={`${th} flex-1 min-w-0`}>Cliente</span>
              <span className={`${th} w-28 shrink-0 text-right`}>Valor Total</span>
              <span className={`${th} w-24 shrink-0 text-right`}>Frete</span>
              {/* w-64: cabe "Em processo de coleta / retirada", que é o
                  rótulo mais longo do fluxo. Com w-52 o status quebrava
                  em duas linhas e a linha do pedido crescia junto. */}
              <span className={`${th} w-64 shrink-0 text-center`}>Status</span>
              <span className={`${th} w-20 shrink-0 text-center`}>Atenção</span>
              <span className={`${th} w-28 shrink-0 text-center`}>Ações</span>
            </div>

            {isLoading ? (
              <div className="flex items-center justify-center h-40">
                <Loader2 size={22} className="animate-spin" style={{ color: v.textMuted }} />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-center py-14 text-sm" style={{ color: v.empty }}>
                {hasFilters
                  ? 'Nenhum pedido com esses filtros.'
                  : 'Nenhum pedido em andamento. Ligue o filtro Finalizados para ver o histórico.'}
              </p>
            ) : rows.map(row => {
              const info = statusInfo[row.status];
              const sel = row.id === selectedId;
              const atencao = calcularAtencao(row, info);
              return (
                <div key={row.id}
                  onClick={() => setSelectedId(row.id)}
                  onDoubleClick={() => navigate(`/sales/${row.id}`)}
                  className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer"
                  style={{ borderBottom: `1px solid ${v.divider}`,
                           background: sel ? 'rgba(37,99,235,0.14)' : 'transparent' }}>
                  <span className="w-24 shrink-0 font-semibold" style={{ color: '#60a5fa' }}>
                    {codigoPedido(row.number)}
                  </span>
                  <span className="w-36 shrink-0" style={{ color: v.textMuted }}>
                    {dataHora(row.operation_date ? `${row.operation_date}T12:00:00` : row.created_at)}
                  </span>
                  <span className="w-36 shrink-0 flex items-center gap-1.5 truncate"
                    style={{ color: row.origin ? v.textPrimary : v.textSubtle }}
                    title={row.origin
                      ? `${row.origin}${row.source === 'site' ? ' — pedido feito pelo próprio cliente' : ' — lançado no ERP'}`
                      : 'Origem não informada neste pedido'}>
                    <LogoOrigem origem={row.origin} size={20} />
                    <span className="truncate">{row.origin || 'não informado'}</span>
                  </span>
                  <span className="w-28 shrink-0 font-mono" style={{ color: v.textMuted }}>
                    {codigoCliente(row.CLIENTES?.display_id) || '—'}
                  </span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: v.textPrimary }}>
                    {row.CLIENTES?.name || 'Consumidor Final'}
                  </span>
                  <span className="w-28 shrink-0 text-right font-semibold" style={{ color: '#22d3ee' }}>
                    {fmt(row.total)}
                  </span>
                  <span className="w-24 shrink-0 text-right" style={{ color: v.textMuted }}>
                    {row.freight > 0 ? fmt(row.freight) : '—'}
                  </span>
                  <span className="w-64 shrink-0 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] whitespace-nowrap"
                      style={{ border: `1px solid ${corStatus(info?.cor)}55`, color: corStatus(info?.cor) }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: corStatus(info?.cor) }} />
                      {info?.label || saleStatusLabel(row.status)}
                    </span>
                  </span>
                  <span className="w-20 shrink-0 flex justify-center">
                    <SinalAtencao atencao={atencao} />
                  </span>
                  {/* Comprovante e envio ao cliente moram na tela do
                      pedido, onde se vê o que está sendo mandado. Aqui
                      ficam ver e — para gestor — excluir. */}
                  <span className="w-28 shrink-0 flex justify-center gap-1.5"
                    onClick={e => e.stopPropagation()}>
                    {/* Abre a tela do pedido — a mesma que o vendedor vê.
                        Selecionar a linha também, para F3/F4 continuarem
                        valendo em quem volta. */}
                    <Acao titulo="Abrir o pedido" cor="#3b82f6" Icon={Eye}
                      onClick={() => { setSelectedId(row.id); navigate(`/sales/${row.id}/detalhe`); }} />
                    {podeExcluir && (
                      <Acao titulo="Excluir pedido (pede sua senha)" cor="#ef4444" Icon={Trash2}
                        onClick={() => setDelTarget(row)} />
                    )}
                  </span>
                </div>
              );
            })}

            {/* Soma da página — o rodapé de sempre, só que sem a cara Delphi */}
            {rows.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2.5 text-sm font-semibold"
                style={{ borderTop: `1px solid ${v.divider}`, color: v.textMuted }}>
                <span className="flex-1">{rows.length} pedido{rows.length !== 1 ? 's' : ''} nesta página</span>
                <span className="w-28 text-right" style={{ color: '#22d3ee' }}>{fmt(pageTotal)}</span>
                <span className="w-24 text-right">{pageFreight > 0 ? fmt(pageFreight) : ''}</span>
                <span className="w-64" /><span className="w-20" /><span className="w-28" />
              </div>
            )}
          </div>
        </div>

        {/* Paginação */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: `1px solid ${v.divider}`, color: v.textMuted }}>
          <span className="text-sm">
            Mostrando {rows.length ? (page - 1) * porPagina + 1 : 0} a {(page - 1) * porPagina + rows.length} de {data?.total || 0} pedidos
            {isFetching && <span className="ml-2 text-xs opacity-60">atualizando…</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => { setPage(p => Math.max(1, p - 1)); setSelectedId(null); }} disabled={page === 1}
              className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: v.control.border }}>
              <ChevronLeft size={15} />
            </button>
            <span className="px-3 py-1 rounded-lg text-sm font-semibold" style={{ background: '#2563eb', color: 'white' }}>{page}</span>
            <button onClick={() => { setPage(p => Math.min(totalPaginas, p + 1)); setSelectedId(null); }} disabled={page >= totalPaginas}
              className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: v.control.border }}>
              <ChevronRight size={15} />
            </button>
          </div>
          <label className="text-sm flex items-center gap-2">
            Itens por página:
            <select value={porPagina} onChange={e => { setPorPagina(Number(e.target.value)); setPage(1); }}
              style={{ ...v.control, padding: '0.3rem 0.5rem' }}>
              {POR_PAGINA.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* Legenda */}
      <div style={{ ...v.card, padding: '0.85rem 1rem' }}
        className="flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-sm">
        <span style={{ color: v.textMuted }}>Legenda de ações:</span>
        <Legenda Icon={Eye} cor="#3b82f6" texto="Abrir o pedido" />
      </div>

      {/* Painel master-detail (abas) */}
      <SaleDetail saleId={selectedId} onChanged={() => qc.invalidateQueries(['sales'])} />

      {/* Excluir pedido (admin + senha) */}
      {/* Exclusao com senha — mesma peca usada na tela do vendedor,
          la no modo que pede o acesso do gerente. */}
      <ExcluirPedidoModal pedido={delTarget} modo="proprio"
        onClose={() => setDelTarget(null)}
        onExcluido={() => { setSelectedId(null); qc.invalidateQueries(['sales']); }} />
    </div>
  );
}

// ── Coluna Atenção ───────────────────────────────────────────────────
// Os status que encerram o pedido — some da lista até ligar Finalizados.
const STATUS_FINAIS = new Set(['entregue', 'pedido_finalizado', 'delivered', 'completed', 'cancelled']);
const ehFinal = s => STATUS_FINAIS.has(s);

/**
 * O nível de atenção do pedido, pela mesma régua do painel do vendedor:
 * verde sem pendência, amarelo a 2 dias da saída, sirene a 1 dia ou já
 * atrasado. Conta em dias de calendário e não em horas — quem diz
 * "faltam 2 dias" na segunda está falando de quarta.
 *
 * O que é "pendência" vem do servidor, no campo `aguardando` de cada
 * status: assim as duas telas não divergem sobre o que conta como
 * pedido parado esperando alguém.
 */
function calcularAtencao(row, info) {
  if (ehFinal(row.status)) return { level: 'normal', motivo: 'Pedido concluído' };

  const prazo = row.ship_date || row.delivery_date || row.max_delivery_date;
  const pendencia = !!info?.aguardando;
  if (!pendencia) return { level: 'normal', motivo: 'Sem pendências', prazo };

  if (!prazo) {
    return { level: 'atencao', prazo: null,
             motivo: `Parado em ${info?.area || 'processo'} · sem prazo de saída cadastrado` };
  }

  const hoje = new Date();
  const [y, m, dd] = String(prazo).slice(0, 10).split('-').map(Number);
  const dias = Math.round(
    (Date.UTC(y, m - 1, dd) - Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate())) / 864e5
  );
  const motivo = `Parado em ${info?.area || 'processo'} · ${dias < 0 ? `atrasado ${Math.abs(dias)} dia(s)` : `${dias} dia(s) para a saída`}`;

  if (dias <= 1) return { level: 'critico', dias, prazo, motivo };
  if (dias <= 2) return { level: 'atencao', dias, prazo, motivo };
  return { level: 'normal', dias, prazo, motivo };
}

function SinalAtencao({ atencao }) {
  const nivel = atencao?.level || 'normal';
  const cfg = NIVEL_ATENCAO[nivel];
  const titulo = `${cfg.titulo}${atencao?.motivo ? ` — ${atencao.motivo}` : ''}`;
  return (
    <span title={titulo} className="p-1 inline-flex">
      {nivel === 'normal' && <CheckCircle2 size={22} style={{ color: cfg.cor }} />}
      {nivel === 'atencao' && (
        <AlertTriangle size={22} style={{ color: cfg.cor, animation: 'atencaoPisca 1s ease-in-out infinite' }} />
      )}
      {nivel === 'critico' && (
        <Siren size={22} style={{ color: cfg.cor, animation: 'atencaoSirene 1.1s linear infinite' }} />
      )}
    </span>
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

// ─────────────────────────────────────────────────────────────────────
// Painel de detalhes do pedido selecionado (abas Produtos / Pagamento / Transportadores / Status / Anexos)
const PAY_LABELS = { cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão Débito', card_credit: 'Cartão Crédito', transfer: 'Transferência', check: 'Cheque', a_prazo: 'A Prazo' };
const DETAIL_TABS = [
  ['produtos', '1 - Produtos'], ['pagamento', '2 - Forma de Pagamento'],
  ['transportadores', '3 - Transportadores'], ['status', '4 - Status'], ['anexos', '5 - Anexos'],
];

function SaleDetail({ saleId, onChanged }) {
  const [tab, setTab] = useState('produtos');
  const qc = useQueryClient();
  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => api.get(`/sales/${saleId}`),
    enabled: !!saleId,
  });

  const changeStatus = useMutation({
    mutationFn: (dir) => {
      const idx = saleStatusIndex(sale.status);
      if (dir === 'next') {
        if (sale.status === 'iniciando_pedido') return api.post(`/sales/${saleId}/start`);
        return api.patch(`/sales/${saleId}/status`, { status: SALE_STATUS_ORDER[idx + 1] });
      }
      return api.patch(`/sales/${saleId}/status`, { status: SALE_STATUS_ORDER[idx - 1] });
    },
    onSuccess: () => { qc.invalidateQueries(['sale', saleId]); onChanged?.(); toast.success('Status atualizado'); },
    onError: (e) => toast.error(e.error || 'Não foi possível mudar o status'),
  });

  if (!saleId) {
    return (
      <div className="card p-6 text-center text-sm text-gray-400">
        Selecione um pedido acima para ver Produtos, Forma de Pagamento, Transportadores, Status e Anexos.
      </div>
    );
  }

  const idx = sale ? saleStatusIndex(sale.status) : -1;
  // Histórico de status (criação + mudanças registradas no production_log)
  const history = [];
  if (sale) {
    history.push({ action: 'iniciando_pedido', at: sale.created_at, user: sale.USUARIOS?.name || 'Sistema' });
    for (const e of (sale.production_log || [])) if (e.stage === 'status') history.push({ action: e.action, at: e.at, user: e.user });
  }

  return (
    <div className="card overflow-hidden">
      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200 bg-gray-50 px-2 pt-2 overflow-x-auto">
        {DETAIL_TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors ${tab === k ? 'bg-white border border-gray-200 border-b-white -mb-px text-primary-700' : 'text-gray-500 hover:text-gray-800'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-3 min-h-[180px]">
        {isLoading || !sale ? (
          <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <>
            {/* cabeçalho do pedido */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-3 pb-2 border-b border-gray-100">
              <span>Pedido <b className="text-gray-800 font-mono">{sale.number}</b></span>
              <span>Cliente <b className="text-gray-800">{sale.CLIENTES?.name || 'Consumidor Final'}</b></span>
              <span>Total <b className="text-gray-800">{fmt(sale.total)}</b></span>
              {sale.freight > 0 && <span>Frete <b className="text-gray-800">{fmt(sale.freight)}</b></span>}
              <span className={`badge ${saleStatusClass(sale.status)} text-[10px]`}>{saleStatusLabel(sale.status)}</span>
            </div>

            {tab === 'produtos' && (
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-1.5">Produto</th><th className="text-right">Qtd</th>
                  <th className="text-right">Vr. Unit.</th><th className="text-right">Desc.</th><th className="text-right">Total</th>
                </tr></thead>
                <tbody>
                  {(sale.items || []).map(it => (
                    <tr key={it.id} className="border-b border-gray-50">
                      <td className="py-1.5">
                        {it.PRODUTOS?.name || 'Produto'}
                        {it.customization?.['Variação'] && <span className="text-gray-400"> · {it.customization['Variação']}</span>}
                      </td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{fmt(it.unit_price)}</td>
                      <td className="text-right">{it.discount > 0 ? fmt(it.discount) : '—'}</td>
                      <td className="text-right font-semibold">{fmt(it.total)}</td>
                    </tr>
                  ))}
                  {(sale.items || []).length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Sem itens</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'pagamento' && (
              <div className="space-y-3">
                <div className="flex gap-6 text-sm">
                  <div><span className="text-gray-400 text-xs block">Forma</span><b>{PAY_LABELS[sale.payment_method] || sale.payment_method || '—'}</b></div>
                  <div><span className="text-gray-400 text-xs block">Desconto</span><b>{fmt(sale.discount)}</b></div>
                  <div><span className="text-gray-400 text-xs block">Total</span><b>{fmt(sale.total)}</b></div>
                </div>
                {(sale.payments || []).length > 0 && (
                  <table className="w-full text-xs mt-2">
                    <thead><tr className="text-gray-500 border-b border-gray-100">
                      <th className="text-left py-1.5">Parcela</th><th className="text-left">Vencimento</th><th className="text-right">Valor</th><th className="text-left pl-3">Situação</th>
                    </tr></thead>
                    <tbody>
                      {sale.payments.map(p => (
                        <tr key={p.id} className="border-b border-gray-50">
                          <td className="py-1.5">{p.installment || 1}{p.total_installments ? `/${p.total_installments}` : ''}</td>
                          <td>{d(p.due_date)}</td>
                          <td className="text-right">{fmt(p.amount)}</td>
                          <td className="pl-3"><span className={`badge text-[10px] ${p.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{p.status === 'paid' ? 'Pago' : 'Pendente'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'transportadores' && <TransportTab key={sale.id} sale={sale} onChanged={onChanged} />}

            {tab === 'status' && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => changeStatus.mutate('next')} disabled={changeStatus.isPending || idx >= SALE_STATUS_ORDER.length - 1}
                    className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
                    <ChevronRight size={14} /> Incluir Status {sale.status !== 'iniciando_pedido' && idx >= 0 && idx < SALE_STATUS_ORDER.length - 1 ? `→ ${saleStatusLabel(SALE_STATUS_ORDER[idx + 1])}` : ''}
                  </button>
                  <button onClick={() => changeStatus.mutate('prev')} disabled={changeStatus.isPending || idx <= 0}
                    className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
                    <ChevronLeft size={14} /> Excluir Status
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500 border-b border-gray-100">
                    <th className="text-left py-1.5">Status</th><th className="text-left">Data/Hora</th><th className="text-left">Usuário</th>
                  </tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 font-semibold">{saleStatusLabel(h.action)}</td>
                        <td>{dt(h.at)}</td>
                        <td>{h.user || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'anexos' && (
              <div className="text-sm">
                {sale.artwork_url ? (
                  <a href={sale.artwork_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline font-medium">Ver arte anexada ↗</a>
                ) : <p className="text-gray-400">Nenhum anexo neste pedido.</p>}
                {sale.artwork_notes && <p className="text-gray-500 mt-2">{sale.artwork_notes}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Aba Transportadores: transportadora, código de rastreio e o rastreio
// da carga pela nota na BrasPress.
function TransportTab({ sale, onChanged }) {
  const qc = useQueryClient();
  const [carrierId, setCarrierId] = useState(sale.carrier_id || '');
  const [tracking, setTracking] = useState(sale.tracking_code || '');
  // Entrega ou retirada. Nulo é "ninguém informou", e vale entrega —
  // que é o que praticamente todo pedido é.
  const [modo, setModo] = useState(sale.delivery_mode === 'retirada' ? 'retirada' : 'entrega');
  const [events, setEvents] = useState(null);
  const [nfBp, setNfBp] = useState('');

  const { data: carriers } = useQuery({ queryKey: ['carriers'], queryFn: () => api.get('/shipping/carriers') });

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/sales/${sale.id}/shipping`, {
      carrier_id: carrierId || null, tracking_code: tracking, delivery_mode: modo,
    }),
    onSuccess: () => { qc.invalidateQueries(['sale', sale.id]); onChanged?.(); toast.success('Transportadora salva'); },
    onError: (e) => toast.error(e.error || 'Erro ao salvar'),
  });

  // Rastreio BrasPress por Nota Fiscal — reaproveita a mesma lista de eventos
  const trackBpMut = useMutation({
    mutationFn: () => api.get(`/shipping/braspress/track/${encodeURIComponent(nfBp.trim())}`),
    onSuccess: (r) => { setEvents(r.events || []); if (!(r.events || []).length) toast('Sem movimentações ainda.'); },
    onError: (e) => { setEvents(null); toast.error(e.error || 'Não foi possível rastrear na BrasPress'); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-400 text-xs block">Vr. Frete</span><b>{fmt(sale.freight)}</b></div>
        <div><span className="text-gray-400 text-xs block">Data da Saída</span><b>{d(sale.ship_date) || '—'}</b></div>
        <div><span className="text-gray-400 text-xs block">Previsão de Entrega</span><b>{d(sale.delivery_date || sale.max_delivery_date) || '—'}</b></div>
        <div><span className="text-gray-400 text-xs block">Data do Evento</span><b>{d(sale.event_date) || '—'}</b></div>
      </div>

      {/* A MODALIDADE MUDA A LINHA DO TEMPO DO CLIENTE.
          Em retirada não há coleta, trânsito nem entrega no endereço:
          as três etapas somem do acompanhamento e o pedido vai de
          "Aguardando retirada" direto para "Pedido entregue". Deixá-las
          na tela faria o cliente esperar um caminhão que não vai sair. */}
      <div className="border-t border-gray-100 pt-3">
        <label className="label">Modalidade</label>
        <div className="flex flex-wrap gap-2">
          {[['entrega', 'Entrega pela transportadora'], ['retirada', 'Retirada no local']].map(([v, rotulo]) => (
            <button key={v} type="button" onClick={() => setModo(v)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                modo === v
                  ? 'bg-primary-600 text-white border-primary-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
              {rotulo}
            </button>
          ))}
        </div>
        {modo === 'retirada' && (
          <p className="text-[11px] text-gray-500 mt-1.5">
            O cliente vem buscar: o acompanhamento dele pula coleta, trânsito e entrega.
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-3 items-end border-t border-gray-100 pt-3">
        <div>
          <label className="label flex items-center gap-1"><Truck size={13} /> Transportadora</label>
          <select className="input text-sm" value={carrierId} onChange={e => setCarrierId(e.target.value)}>
            <option value="">— selecione —</option>
            {(carriers?.data || []).map(c => <option key={c.id} value={c.id}>{c.trade_name || c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Código de rastreio</label>
          <div className="flex gap-2">
            <input className="input text-sm font-mono" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="c\u00f3digo da transportadora" />
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-secondary text-sm whitespace-nowrap">
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          </div>
        </div>
      </div>

      <div>
        <div className="flex flex-wrap items-center gap-2">
          {/* O rastreio que existe é o da BrasPress, pela nota. O
              rastreio por código saiu junto com a J&T — o campo do
              código continua acima, para guardar o que a transportadora
              informar. */}
          <input className="input text-sm font-mono w-32" value={nfBp} onChange={e => setNfBp(e.target.value)} placeholder="Nº da NF" />
          <button onClick={() => trackBpMut.mutate()} disabled={trackBpMut.isPending || !nfBp.trim()}
            className="flex items-center gap-1.5 text-sm font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
            {trackBpMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />} Rastrear na BrasPress
          </button>
        </div>
        {events && events.length > 0 && (
          <ul className="mt-3 space-y-2">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="text-gray-400 whitespace-nowrap w-32 shrink-0">{ev.time ? dt(ev.time) : ''}</span>
                <span>
                  <b className="text-gray-800">{ev.status || ev.desc || '—'}</b>
                  {ev.where && <span className="text-gray-500"> · {ev.where}</span>}
                  {ev.desc && ev.desc !== ev.status && <span className="text-gray-500 block">{ev.desc}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {events && events.length === 0 && <p className="text-xs text-gray-400 mt-2">Sem movimentações registradas para este código.</p>}
      </div>
    </div>
  );
}
