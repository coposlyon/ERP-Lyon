import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw, FileInput, Filter, Search, FileText, X, Loader2, ChevronRight, ChevronLeft, AlertTriangle, Eye, CheckCircle2, Siren, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ExcluirPedidoModal from '@/components/UI/ExcluirPedidoModal';
import { useVend, fmtBRL } from '@/components/UI/theme';
import { corStatus, NIVEL_ATENCAO, CSS_ATENCAO, codigoPedido, codigoCliente } from '@/lib/pedidoUi';
import { saleStatusLabel } from '@/lib/saleStatus';
import { format, parseISO } from 'date-fns';

const fmt = fmtBRL;
const dataHora = iso => { if (!iso) return '—'; try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return iso; } };
// Data sem hora, para as colunas de prazo. Um traço quando não há data:
// prazo em branco e prazo inexistente são a mesma coluna e respostas
// diferentes, e o traço é o que diz "ninguém definiu ainda".
const dia = iso => { if (!iso) return '—'; try { return format(parseISO(String(iso).slice(0, 10)), 'dd/MM/yyyy'); } catch { return iso; } };

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
      else if (e.key === 'Escape') {
        const a = document.activeElement;
        if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
        // Esc fecha o lateral primeiro; só sai da tela quando não há
        // nada aberto — senão fechar o painel jogaria a pessoa para fora.
        e.preventDefault();
        if (selectedId) setSelectedId(null); else navigate('/');
      }
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
        {/* SEM ROLAGEM HORIZONTAL.
            Catorze colunas não cabem em tela nenhuma: com o menu aberto
            sobram ~1250px, e catorze colunas legíveis pedem o dobro.
            Arrastar a tabela para o lado para ler o prazo de um pedido é
            justamente o que o sistema antigo não obrigava a fazer.

            Então a grade fica com o que serve para ACHAR o pedido, e o
            resto — prazos, transportadora, cotação, itens — abre no
            painel lateral ao clicar na linha. Nada saiu do sistema:
            mudou de lugar, para um lugar que cabe. */}
        <div>
            <div className="flex items-center gap-2 px-3 py-2.5"
              style={{ borderBottom: `1px solid ${v.divider}`, color: v.textMuted }}>
              <span className={`${th} w-20 shrink-0`}>Pedido</span>
              <span className={`${th} w-32 shrink-0`}>Data / Hora</span>
              <span className={`${th} w-20 shrink-0`}>Cód.</span>
              <span className={`${th} flex-1 min-w-0`}>Cliente</span>
              <span className={`${th} w-28 shrink-0 text-right`}>Vr. Total</span>
              <span className={`${th} w-20 shrink-0 text-right`}>Vr. Frete</span>
              {/* w-56: cabe "Em processo de coleta / retirada", o rótulo
                  mais longo do fluxo, sem quebrar linha. */}
              <span className={`${th} w-56 shrink-0 text-center`}>Status</span>
              <span className={`${th} w-16 shrink-0 text-center`}>Atenção</span>
              <span className={`${th} w-20 shrink-0 text-center`}>Ações</span>
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
                  <span className="w-20 shrink-0 font-semibold" style={{ color: '#60a5fa' }}>
                    {codigoPedido(row.number)}
                  </span>
                  <span className="w-32 shrink-0 text-[13px]" style={{ color: v.textMuted }}>
                    {dataHora(row.operation_date ? `${row.operation_date}T12:00:00` : row.created_at)}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-[13px]" style={{ color: v.textMuted }}>
                    {codigoCliente(row.CLIENTES?.display_id) || '—'}
                  </span>
                  <span className="flex-1 min-w-0 truncate" style={{ color: v.textPrimary }}
                    title={row.CLIENTES?.name || 'Consumidor Final'}>
                    {row.CLIENTES?.name || 'Consumidor Final'}
                  </span>
                  <span className="w-28 shrink-0 text-right font-semibold" style={{ color: '#22d3ee' }}>
                    {fmt(row.total)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-[13px]" style={{ color: v.textMuted }}>
                    {row.freight > 0 ? fmt(row.freight) : '—'}
                  </span>
                  <span className="w-56 shrink-0 flex justify-center">
                    <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] whitespace-nowrap"
                      style={{ border: `1px solid ${corStatus(info?.cor)}55`, color: corStatus(info?.cor) }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: corStatus(info?.cor) }} />
                      {info?.label || saleStatusLabel(row.status)}
                    </span>
                  </span>
                  <span className="w-16 shrink-0 flex justify-center">
                    <SinalAtencao atencao={atencao} />
                  </span>
                  {/* Comprovante e envio ao cliente moram na tela do
                      pedido, onde se vê o que está sendo mandado. Aqui
                      ficam ver e — para gestor — excluir. */}
                  <span className="w-20 shrink-0 flex justify-center gap-1.5"
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
                <span className="flex-1 min-w-0">{rows.length} pedido{rows.length !== 1 ? 's' : ''} nesta página</span>
                <span className="w-28 text-right" style={{ color: '#22d3ee' }}>{fmt(pageTotal)}</span>
                <span className="w-20 text-right">{pageFreight > 0 ? fmt(pageFreight) : ''}</span>
                <span className="w-56" /><span className="w-16" /><span className="w-20" />
              </div>
            )}
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

      {/* O PAINEL DE ABAS SAIU DAQUI e foi para a tela do pedido
          (/sales/:id). Ele ocupava meia tela abaixo da lista para
          mostrar o que já é o assunto da tela seguinte — e a lista
          existe para achar o pedido, não para trabalhá-lo.
          Nada se perdeu: transportadora, rastreio, modalidade de
          entrega, forma de pagamento, status e anexos continuam lá,
          nas mesmas abas. */}

      {/* O lateral do pedido selecionado. */}
      <PainelPedido
        row={selected}
        podeExcluir={podeExcluir}
        onClose={() => setSelectedId(null)}
        onAbrir={() => navigate(`/sales/${selected.id}/detalhe`)}
        onExcluir={() => setDelTarget(selected)}
      />

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

// ── PAINEL LATERAL ───────────────────────────────────────────
//
// O QUE NÃO CABE NA GRADE ABRE AQUI.
//
// Catorze colunas não cabem em tela nenhuma, e arrastar a tabela para o
// lado só para ler o prazo de um pedido é trabalho que o sistema antigo
// não pedia. A grade ficou com o que serve para ACHAR o pedido; prazos,
// transporte, valores e itens abrem neste painel ao clicar na linha.
//
// Ele lê o que a LISTA JÁ TROUXE — cliente, valores, prazos,
// transportadora — e busca no servidor só o que falta: os itens. Assim
// o painel abre cheio no mesmo instante do clique, e a única espera é
// pela parte que ninguém tinha ainda.
function PainelPedido({ row, onClose, onAbrir, podeExcluir, onExcluir }) {
  const v = useVend();

  const { data: detalhe, isLoading } = useQuery({
    queryKey: ['sale', row?.id],
    queryFn: () => api.get(`/sales/${row.id}`),
    enabled: !!row?.id,
  });

  if (!row) return null;

  const itens = detalhe?.items || [];
  const retirada = (detalhe?.delivery_mode || row.delivery_mode) === 'retirada'
    || /retirada no local/i.test(String(detalhe?.notes || row.notes || ''));

  return (
    <>
      {/* Fundo só no celular: no computador a lista continua clicável
          ao lado, para pular de um pedido para outro sem fechar nada. */}
      <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onClose} />

      <aside className="fixed top-0 right-0 bottom-0 z-40 w-full sm:w-[420px] flex flex-col shadow-2xl"
        style={{ background: '#080d24', borderLeft: '1px solid rgba(96,165,250,0.28)' }}>

        <div className="flex items-start justify-between gap-3 px-4 py-3 shrink-0"
          style={{ borderBottom: '1px solid rgba(96,165,250,0.22)' }}>
          <div className="min-w-0">
            <p className="text-lg font-bold" style={{ color: '#60a5fa' }}>{codigoPedido(row.number)}</p>
            <p className="text-sm truncate" style={{ color: v.textPrimary }}>
              {row.CLIENTES?.name || 'Consumidor Final'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg shrink-0"
            style={{ color: v.textMuted }} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">

          <Secao titulo="Cliente" v={v}>
            <Dado v={v} r="Código" d={codigoCliente(row.CLIENTES?.display_id) || '—'} />
            <Dado v={v} r="CPF / CNPJ" d={row.CLIENTES?.cpf_cnpj || '—'} />
            <Dado v={v} r="Vendedor" d={row.USUARIOS?.name || '—'} />
          </Secao>

          <Secao titulo="Prazos" v={v}>
            <Dado v={v} r="Data do evento" d={dia(row.event_date)} />
            <Dado v={v} r="Data de saída" d={dia(row.ship_date)} />
            <Dado v={v} r="Previsão de entrega" d={dia(row.delivery_date || row.max_delivery_date)} />
            <Dado v={v} r="Transporte" d={row.transport_days ? `${row.transport_days} dias úteis` : '—'} />
          </Secao>

          <Secao titulo={retirada ? 'Retirada no local' : 'Transporte'} v={v}>
            {retirada ? (
              <p className="text-[12px]" style={{ color: v.textMuted }}>
                O cliente vem buscar — este pedido não passa por coleta, trânsito nem entrega.
              </p>
            ) : (
              <>
                <Dado v={v} r="Transportadora" d={row.transportadora || '—'} />
                <Dado v={v} r="Cotação" d={row.freight_quote || '—'} />
                <Dado v={v} r="Rastreio" d={row.tracking_code || '—'} />
              </>
            )}
          </Secao>

          <Secao titulo="Itens" v={v}>
            {isLoading ? (
              <div className="py-3 flex justify-center"><Loader2 size={16} className="animate-spin" style={{ color: v.textMuted }} /></div>
            ) : itens.length === 0 ? (
              <p className="text-[12px]" style={{ color: v.textSubtle }}>Sem itens neste pedido.</p>
            ) : itens.map(it => (
              <div key={it.id} className="py-1.5 text-[12px]"
                style={{ borderBottom: `1px solid ${v.divider}` }}>
                <p className="truncate" style={{ color: v.textPrimary }} title={it.product_name || it.PRODUTOS?.name}>
                  {it.product_name || it.PRODUTOS?.name || '—'}
                </p>
                <p style={{ color: v.textMuted }}>
                  {Number(it.quantity) || 0} × {fmt(it.unit_price)} = <b style={{ color: v.textPrimary }}>{fmt(it.total)}</b>
                </p>
              </div>
            ))}
          </Secao>

          <Secao titulo="Valores" v={v}>
            <Dado v={v} r="Produtos" d={fmt(row.subtotal)} />
            <Dado v={v} r="Frete" d={row.freight > 0 ? fmt(row.freight) : '—'} />
            {Number(row.discount) > 0 && <Dado v={v} r="Desconto" d={`− ${fmt(row.discount)}`} />}
            <div className="flex items-baseline justify-between gap-3 pt-2 mt-1"
              style={{ borderTop: '1px solid rgba(96,165,250,0.25)' }}>
              <span className="text-sm font-semibold" style={{ color: v.textPrimary }}>Total</span>
              <span className="text-xl font-bold" style={{ color: '#22d3ee' }}>{fmt(row.total)}</span>
            </div>
          </Secao>
        </div>

        <div className="px-4 py-3 flex gap-2 shrink-0"
          style={{ borderTop: '1px solid rgba(96,165,250,0.22)' }}>
          <button onClick={onAbrir} className="btn-primary btn-sm flex-1 justify-center">
            <Eye size={14} /> Abrir o pedido
          </button>
          {podeExcluir && (
            <button onClick={onExcluir} className="btn-secondary btn-sm"
              style={{ color: '#f87171' }} title="Excluir pedido">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </aside>
    </>
  );
}

function Secao({ titulo, children, v }) {
  return (
    <section>
      <p className="text-[11px] uppercase tracking-wider mb-1.5" style={{ color: '#60a5fa' }}>{titulo}</p>
      <div className="rounded-xl px-3 py-2"
        style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${v.divider}` }}>
        {children}
      </div>
    </section>
  );
}

function Dado({ r, d, v }) {
  return (
    <div className="flex items-start justify-between gap-3 py-0.5 text-[12px]">
      <span className="shrink-0" style={{ color: v.textMuted }}>{r}</span>
      <span className="text-right truncate" style={{ color: v.textPrimary }} title={String(d)}>{d}</span>
    </div>
  );
}
