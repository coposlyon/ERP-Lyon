import { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, RefreshCw, FileInput, Filter, Search, FileText, X, Loader2, ChevronRight, ChevronLeft, AlertTriangle, Eye, CheckCircle2, Siren, RotateCcw, Wrench, Maximize2, Minimize2, Wallet } from 'lucide-react';
import { useNavigate, Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import ExcluirPedidoModal from '@/components/UI/ExcluirPedidoModal';
import FichaClienteModal from '@/components/Cliente/FichaClienteModal';
import { useVend, fmtBRL } from '@/components/UI/theme';
import { corStatus, NIVEL_ATENCAO, CSS_ATENCAO, codigoPedido, codigoCliente } from '@/lib/pedidoUi';
import { saleStatusLabel } from '@/lib/saleStatus';
import { format, parseISO } from 'date-fns';
import { useTelaCheia } from '@/contexts/TelaCheiaContext';

const fmt = fmtBRL;
const dataHora = iso => { if (!iso) return '\u2014'; try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm'); } catch { return iso; } };
// Data sem hora, para as colunas de prazo. Um traco quando nao ha data:
// prazo em branco e prazo inexistente sao a mesma coluna e respostas
// diferentes, e o traco e o que diz "ninguem definiu ainda".
const dia = iso => { if (!iso) return '\u2014'; try { return format(parseISO(String(iso).slice(0, 10)), 'dd/MM/yyyy'); } catch { return iso; } };

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
  const [fichaCliente, setFichaCliente] = useState(null);  // olho ao lado do nome
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [finalizados, setFinalizados] = useState(false);
  const [porPagina, setPorPagina] = useState(10);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  // O que abre e fecha aqui é a CAIXA DE FERRAMENTAS (Incluir, Alterar,
  // Relatórios). Os filtros não: filtro escondido é filtro que ninguém
  // usa, e depois se estranha que a pessoa role trezentos pedidos à mão
  // procurando um de agosto.
  const [showTools, setShowTools] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const { isAdmin, isManager } = useAuth();
  // Gestor apaga direto por aqui, confirmando com a propria senha.
  const podeExcluir = isAdmin || isManager;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef();
  const telaCheia = useTelaCheia();

  /**
   * "CADÊ O PEDIDO QUE O CLIENTE ACABOU DE FAZER?"
   *
   * Pedido do site NÃO entra aqui na hora. Ele espera o PIX ser
   * conferido em Pagamentos da Loja, e só vira Pedido de Venda quando
   * alguém confirma — é assim de propósito: pedido não é venda enquanto
   * o dinheiro não está na conta.
   *
   * O que faltava era DIZER isso. Quem fechava a compra no catálogo e
   * abria esta tela via a lista de ontem e concluía que o pedido tinha
   * se perdido. A faixa abaixo é a resposta, com o caminho junto.
   */
  const { data: fila } = useQuery({
    queryKey: ['store-payments', 'aguardando_pagamento'],
    queryFn: () => api.get('/store-payments?status=aguardando_pagamento'),
    refetchInterval: 60000,
    retry: false,
  });
  const aguardando = fila?.total || 0;
  const comComprovante = fila?.com_comprovante || 0;

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
  // A SOMA DA PAGINA SAIU. Ela repetia, numa segunda linha, os mesmos
  // numeros que a coluna ja mostra - e com um pedido na tela dizia
  // "R$ 550,00" duas vezes, uma embaixo da outra. A contagem de pedidos
  // continua logo abaixo, na paginacao, que e onde se procura por ela.
  const totalPaginas = Math.max(1, Math.ceil((data?.total || 0) / porPagina));


  function handleSearch(e) { e?.preventDefault?.(); setSearch(searchInput); setPage(1); }
  function clearFilters() {
    setSearch(''); setSearchInput(''); setStatus(''); setStartDate(''); setEndDate('');
    setFinalizados(false); setPage(1);
  }
  const hasFilters = search || status || startDate || endDate || finalizados;


  /** Abrir o pedido. É o que o clique na linha faz, e o que F3 repete. */
  function abrirPedido(id) { navigate(`/sales/${id}/detalhe`); }

  // Atalhos estilo Delphi (F2 incluir, F5 atualizar, F6 importar, Ctrl+F pesquisar, ESC fechar).
  //
  // F3 (alterar) e F4 (excluir) SAÍRAM. Eles agiam sobre "a linha
  // selecionada", e não existe mais linha selecionada: clicar na linha
  // abre o pedido. Alterar é o próprio clique; excluir é a lixeira da
  // linha, que já pede a senha. Atalho que age sobre um alvo invisível
  // é atalho que uma hora apaga o pedido errado.
  useEffect(() => {
    const onKey = (e) => {
      if (delTarget) return; // deixa o modal tratar
      if (e.key === 'F2') { e.preventDefault(); navigate('/sales/new'); }
      else if (e.key === 'F5') { e.preventDefault(); qc.invalidateQueries(['sales']); }
      else if (e.key === 'F6') { e.preventDefault(); navigate('/quotes'); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === 'Escape') {
        const a = document.activeElement;
        if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
        // Esc devolve a moldura antes de sair da tela: quem está em tela
        // cheia apertando ESC quer o menu de volta, não ser jogado para
        // fora do módulo.
        e.preventDefault();
        if (telaCheia.ativo) telaCheia.sair();
        else navigate('/');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isAdmin, delTarget, telaCheia.ativo]); // eslint-disable-line

  // `whitespace-nowrap`: cabecalho de tabela que quebra em duas linhas
  // empurra o corpo inteiro para baixo e desalinha a leitura de cima a
  // baixo. As colunas de data ganharam a largura que o rotulo pede.
  const th = 'text-[11px] font-semibold uppercase tracking-wider whitespace-nowrap';

  return (
    <div className="space-y-4">
      <style>{CSS_ATENCAO}</style>
      {/* A linha inteira abre o pedido, e nada na tela dizia isso. O
          realce ao passar o mouse é o aviso: aqui se clica. */}
      <style>{`.linha-pedido:hover{background:rgba(37,99,235,0.14)}
               .linha-pedido:focus-visible{background:rgba(37,99,235,0.2);outline:none}`}</style>

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Pedidos de Venda</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            Gerencie e acompanhe o fluxo de todos os pedidos
            {hasFilters && ' · filtrado'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* TELA CHEIA. Catorze colunas contra um menu de 260 pontos: em
              notebook, o menu é a coluna que falta. Quem vai passar a
              tarde na fila de pedidos aperta aqui e recupera a largura;
              ESC ou o mesmo botão devolvem o menu, e trocar de módulo
              também. */}
          <button type="button" onClick={telaCheia.alternar}
            className="hidden lg:flex items-center gap-2 px-3 py-2.5 rounded-[0.6rem] text-sm"
            title={telaCheia.ativo
              ? 'Sair da tela cheia (ESC) — traz o menu e o cabeçalho de volta'
              : 'Tela cheia — esconde o menu lateral e o cabeçalho, e dá a largura toda para a lista'}
            style={{ background: v.control.background, color: v.textPrimary, border: v.control.border }}>
            {telaCheia.ativo ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
            <span className="hidden sm:inline">{telaCheia.ativo ? 'Sair da tela cheia' : 'Tela cheia'}</span>
          </button>
          <button onClick={() => navigate('/sales/new')} className="btn-primary">
            <Plus size={16} /> Novo Pedido
          </button>
        </div>
      </div>

      {/* ── Os pedidos do site esperando conferência ─────────── */}
      {aguardando > 0 && (
        <Link to="/store-payments"
          className="flex items-center gap-3 px-4 py-3 rounded-xl transition-opacity hover:opacity-85"
          style={{
            background: 'rgba(37,99,235,0.12)',
            border: '1px solid rgba(37,99,235,0.35)',
          }}>
          <Wallet size={18} className="shrink-0" style={{ color: '#60a5fa' }} />
          <span className="text-sm min-w-0" style={{ color: v.textPrimary }}>
            <b>{aguardando}</b> {aguardando === 1 ? 'pedido do site espera' : 'pedidos do site esperam'} confirmação do
            pagamento{comComprovante > 0 && <> — <b>{comComprovante}</b> com comprovante anexado</>}.
            <span className="block text-[12px]" style={{ color: v.textSubtle }}>
              Eles entram aqui como Pedido de Venda assim que forem confirmados.
            </span>
          </span>
          <ChevronRight size={16} className="ml-auto shrink-0" style={{ color: v.textSubtle }} />
        </Link>
      )}

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

        {/* PERÍODO, na barra e não na gaveta. Era o único filtro que
            exigia descobrir uma setinha para existir — e é o mais pedido
            depois do status, porque "o pedido de agosto" é como o
            cliente fala. */}
        <div className="flex items-center gap-1.5">
          <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: v.textSubtle }}>De</label>
          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }}
            title="Data inicial do pedido"
            style={{ ...v.control, padding: '0.55rem 0.6rem', colorScheme: v.isDark ? 'dark' : 'light' }} />
          <label className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: v.textSubtle }}>Até</label>
          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }}
            title="Data final do pedido"
            style={{ ...v.control, padding: '0.55rem 0.6rem', colorScheme: v.isDark ? 'dark' : 'light' }} />
        </div>

        <button onClick={clearFilters}
          className="flex items-center gap-2 px-4 py-2.5 rounded-[0.6rem] text-sm"
          style={{ background: v.control.background, color: v.textPrimary, border: v.control.border }}>
          <RotateCcw size={15} /> Limpar filtros
        </button>

        <button onClick={() => setShowTools(x => !x)}
          className="flex items-center gap-2 px-3 py-2.5 rounded-[0.6rem] text-sm"
          title="Ferramentas do pedido (F2 incluir, F5 atualizar, F6 importar)"
          style={{ background: v.control.background, color: v.textMuted, border: v.control.border }}>
          <Wrench size={15} />
          <ChevronRight size={13} style={{ transform: showTools ? 'rotate(90deg)' : 'none', transition: 'transform .15s' }} />
        </button>
      </div>

      {/* A CAIXA DE FERRAMENTAS — recolhida por padrão para não competir
          com a tabela, e com os atalhos de sempre funcionando mesmo
          fechada: quem usa F2 nunca precisou abrir isto aqui. */}
      {showTools && (
        <div style={{ ...v.card, padding: '0.75rem 1rem' }}>
          <div className="flex items-center gap-1 flex-wrap">
            <TBtn icon={Plus}      label="Incluir"   sub="F2" onClick={() => navigate('/sales/new')} />
            <TBtn icon={RefreshCw} label="Atualizar" sub="F5" onClick={() => qc.invalidateQueries(['sales'])} />
            <span className="w-px h-5 mx-1" style={{ background: v.divider }} />
            <TBtn icon={FileInput} label="Importar Orçamento" sub="F6" onClick={() => navigate('/quotes')} />
            <TBtn icon={FileText}  label="Relatórios" onClick={() => window.print()} />
            <TBtn icon={X}         label="Fechar"    sub="ESC" onClick={() => navigate('/')} />
          </div>
        </div>
      )}

      {/* ── Tabela ────────────────────────────────────────────── */}
      <div style={v.card}>
        {/* A GRADE INTEIRA, E A ROLAGEM QUE VEM COM ELA.
            Catorze colunas não cabem nos ~1250px que sobram com o menu
            aberto — e a resposta anterior a isso foi cortar a grade pela
            metade e mandar prazos, transportadora e cotação para a tela
            do pedido. Custava um clique por pedido para responder "qual
            está atrasado?", que é uma pergunta sobre a LISTA, não sobre
            um pedido.
            Então as colunas voltam e a rolagem lateral volta com elas.
            Duas coisas tiram o peso disso: o botão Tela cheia, que apaga
            o menu e devolve 260px, e o cabeçalho congelado, que mantém o
            nome da coluna à vista enquanto se rola. */}
        {/* NO CELULAR A GRADE NAO ABRE.
            Catorze colunas em 1640 pontos num aparelho de 360 e arrastar
            a lista de lado cinco vezes para ler UM pedido — e o cabecalho
            congelado, que salva a leitura no computador, nao ajuda quem
            perdeu de vista a linha inteira. Abaixo de `lg` a mesma lista
            vira um cartao por pedido, com tudo empilhado e nada para
            arrastar. Os dois leem os MESMOS `rows`: nao existe uma
            segunda consulta nem uma segunda regra de atencao. */}
        <div className="hidden lg:block overflow-x-auto">
          <div className="min-w-[1640px]">
            {/* CABECALHO CONGELADO.
                Rolando a lista, os titulos das colunas saiam da tela e a
                pessoa perdia de vista o que era cada numero — justamente
                em tabela larga, que e quando mais importa.
                O fundo precisa ser OPACO: o cartao e translucido, e com
                ele as linhas passariam por tras do cabecalho. #0a1130 e
                a mesma cor que o ERP ja usa em cabecalho de tabela. */}
            <div className="flex items-center gap-2 px-3 py-2.5 sticky top-0 z-10"
              style={{
                borderBottom: `1px solid ${v.divider}`,
                color: v.textMuted,
                background: v.isDark ? '#0a1130' : '#ffffff',
              }}>
              <span className={`${th} w-20 shrink-0`}>Pedido</span>
              <span className={`${th} w-32 shrink-0`}>Data / Hora</span>
              <span className={`${th} w-20 shrink-0`}>Cód. Cliente</span>
              <span className={`${th} flex-1 min-w-[150px]`}>Cliente</span>
              <span className={`${th} w-28 shrink-0 text-right`}>Vr. Total</span>
              <span className={`${th} w-20 shrink-0 text-right`}>Vr. Frete</span>
              <span className={`${th} w-28 shrink-0`}>Data do evento</span>
              <span className={`${th} w-28 shrink-0`}>Data de saída</span>
              <span className={`${th} w-36 shrink-0`}>Previsão de entrega</span>
              <span className={`${th} w-32 shrink-0`}>Transportadora</span>
              <span className={`${th} w-24 shrink-0 text-right`}>Cotação</span>
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
              const atencao = calcularAtencao(row, info);
              return (
                <div key={row.id}
                  onClick={() => abrirPedido(row.id)}
                  role="button" tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPedido(row.id); } }}
                  className="flex items-center gap-3 px-4 py-3 text-sm cursor-pointer linha-pedido"
                  style={{ borderBottom: `1px solid ${v.divider}` }}>
                  <span className="w-20 shrink-0 font-semibold" style={{ color: '#60a5fa' }}>
                    {codigoPedido(row.number)}
                  </span>
                  <span className="w-32 shrink-0 text-[13px]" style={{ color: v.textMuted }}>
                    {dataHora(row.operation_date ? `${row.operation_date}T12:00:00` : row.created_at)}
                  </span>
                  <span className="w-20 shrink-0 font-mono text-[13px]" style={{ color: v.textMuted }}>
                    {codigoCliente(row.CLIENTES?.display_id) || '—'}
                  </span>
                  {/* O OLHO AO LADO DO NOME.
                      Conferir o telefone de um cliente no meio da lista
                      obrigava a abrir o cadastro dele e voltar, perdendo
                      filtro e rolagem. O olho abre a ficha por cima.
                      stopPropagation porque a linha inteira abre o
                      PEDIDO - sem isso, um clique faria as duas coisas. */}
                  <span className="flex-1 min-w-[150px] flex items-center gap-1.5">
                    <span className="truncate" style={{ color: v.textPrimary }}
                      title={row.CLIENTES?.name || 'Consumidor Final'}>
                      {row.CLIENTES?.name || 'Consumidor Final'}
                    </span>
                    {row.CLIENTES?.id && (
                      <button onClick={e => { e.stopPropagation(); setFichaCliente(row.CLIENTES.id); }}
                        title={`Ver a ficha de ${row.CLIENTES.name}`}
                        className="shrink-0 opacity-50 hover:opacity-100 transition-opacity"
                        style={{ color: '#60a5fa' }}>
                        <Eye size={14} />
                      </button>
                    )}
                  </span>
                  <span className="w-28 shrink-0 text-right font-semibold" style={{ color: '#22d3ee' }}>
                    {fmt(row.total)}
                  </span>
                  <span className="w-20 shrink-0 text-right text-[13px]" style={{ color: v.textMuted }}>
                    {row.freight > 0 ? fmt(row.freight) : '\u2014'}
                  </span>
                  {/* OS PRAZOS. Data do evento é a do cliente (o casamento,
                      a formatura); data de saída e previsão de entrega são
                      as nossas. Traço quando ninguém definiu. */}
                  <span className="w-28 shrink-0 text-[13px]" style={{ color: v.textMuted }}>
                    {dia(row.event_date)}
                  </span>
                  <span className="w-28 shrink-0 text-[13px]" style={{ color: v.textMuted }}>
                    {dia(row.ship_date)}
                  </span>
                  <span className="w-36 shrink-0 text-[13px]" style={{ color: v.textMuted }}>
                    {dia(row.delivery_date || row.max_delivery_date)}
                  </span>
                  <span className="w-32 shrink-0 truncate text-[13px]" style={{ color: v.textMuted }}
                    title={row.transportadora || ''}>
                    {row.transportadora || '\u2014'}
                  </span>
                  <span className="w-24 shrink-0 text-right text-[13px] truncate" style={{ color: v.textMuted }}
                    title={row.freight_quote || ''}>
                    {row.freight_quote || '\u2014'}
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
                    {/* O mesmo destino do clique na linha. Fica porque a
                        linha inteira ser clicável não é visível, e o olho
                        é o que conta que dá para abrir. */}
                    <Acao titulo="Abrir o pedido" cor="#3b82f6" Icon={Eye}
                      onClick={() => abrirPedido(row.id)} />
                    {podeExcluir && (
                      <Acao titulo="Excluir pedido (pede sua senha)" cor="#ef4444" Icon={Trash2}
                        onClick={() => setDelTarget(row)} />
                    )}
                  </span>
                </div>
              );
            })}

          </div>
        </div>

        {/* ── A MESMA LISTA, EM CARTOES (celular) ─────────────── */}
        <div className="lg:hidden">
          {isLoading ? (
            <div className="flex items-center justify-center h-40">
              <Loader2 size={22} className="animate-spin" style={{ color: v.textMuted }} />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-center py-14 px-4 text-sm" style={{ color: v.empty }}>
              {hasFilters
                ? 'Nenhum pedido com esses filtros.'
                : 'Nenhum pedido em andamento. Ligue o filtro Finalizados para ver o histórico.'}
            </p>
          ) : rows.map(row => {
            const info = statusInfo[row.status];
            return (
              <CartaoPedido
                key={row.id} v={v} row={row} info={info}
                atencao={calcularAtencao(row, info)}
                podeExcluir={podeExcluir}
                onAbrir={() => abrirPedido(row.id)}
                onFicha={() => setFichaCliente(row.CLIENTES.id)}
                onExcluir={() => setDelTarget(row)}
              />
            );
          })}
        </div>

        {/* Paginação */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
          style={{ borderTop: `1px solid ${v.divider}`, color: v.textMuted }}>
          <span className="text-sm">
            Mostrando {rows.length ? (page - 1) * porPagina + 1 : 0} a {(page - 1) * porPagina + rows.length} de {data?.total || 0} pedidos
            {isFetching && <span className="ml-2 text-xs opacity-60">atualizando…</span>}
          </span>
          <div className="flex items-center gap-1.5">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="p-1.5 rounded-lg disabled:opacity-30" style={{ border: v.control.border }}>
              <ChevronLeft size={15} />
            </button>
            <span className="px-3 py-1 rounded-lg text-sm font-semibold" style={{ background: '#2563eb', color: 'white' }}>{page}</span>
            <button onClick={() => setPage(p => Math.min(totalPaginas, p + 1))} disabled={page >= totalPaginas}
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

      {/* O PAINEL LATERAL SAIU DAQUI.
          Ele abria ao clicar na linha e mostrava um resumo — cliente,
          prazos, transporte, itens, valores — com um botão "Abrir o
          pedido" no pé. Ou seja: cobrava um clique e meia tela para
          mostrar de longe o que a tela do pedido mostra de perto, e no
          fim mandava para a tela do pedido do mesmo jeito.
          Agora o clique na linha abre o pedido completo direto. Nada se
          perdeu: tudo o que o resumo mostrava está lá, e mais. */}

      {/* Excluir pedido (admin + senha) */}
      {/* Exclusao com senha — mesma peca usada na tela do vendedor,
          la no modo que pede o acesso do gerente. */}
      <FichaClienteModal clienteId={fichaCliente} onClose={() => setFichaCliente(null)} />

      <ExcluirPedidoModal pedido={delTarget} modo="proprio"
        onClose={() => setDelTarget(null)}
        onExcluido={() => qc.invalidateQueries(['sales'])} />
    </div>
  );
}

/**
 * UM PEDIDO, UM CARTAO — a lista no celular.
 *
 * A grade de catorze colunas responde "qual esta atrasado?" de relance
 * porque tudo esta alinhado. Num aparelho de 360 pontos nada esta
 * alinhado: sobra arrastar de lado, e arrastar de lado nao responde
 * nada.
 *
 * O cartao inverte a ordem: primeiro o que identifica (numero, cliente,
 * situacao), depois o que decide (valor e os tres prazos), e o resto —
 * transportadora, cotacao, frete — so aparece quando existe. Campo vazio
 * no computador e uma celula com traco; no celular e uma linha inteira
 * gasta para dizer "nada".
 *
 * Toca no cartao e abre o pedido, igual a linha da grade.
 */
function CartaoPedido({ v, row, info, atencao, podeExcluir, onAbrir, onFicha, onExcluir }) {
  const cor = corStatus(info?.cor);
  const cliente = row.CLIENTES?.name || 'Consumidor Final';
  const prazos = [
    ['Evento',  dia(row.event_date)],
    ['Saída',   dia(row.ship_date)],
    ['Entrega', dia(row.delivery_date || row.max_delivery_date)],
  ];

  return (
    <div role="button" tabIndex={0} onClick={onAbrir}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAbrir(); } }}
      className="px-4 py-3.5 cursor-pointer linha-pedido"
      style={{ borderBottom: `1px solid ${v.divider}` }}>

      {/* Numero, situacao e o sinal de atencao */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-bold text-[15px]" style={{ color: '#60a5fa' }}>
          {codigoPedido(row.number)}
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-lg text-[11px]"
          style={{ border: `1px solid ${cor}55`, color: cor }}>
          <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cor }} />
          {info?.label || saleStatusLabel(row.status)}
        </span>
        <span className="ml-auto flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          <SinalAtencao atencao={atencao} />
          {podeExcluir && (
            <Acao titulo="Excluir pedido (pede sua senha)" cor="#ef4444" Icon={Trash2} onClick={onExcluir} />
          )}
        </span>
      </div>

      {/* O cliente, com o olho que abre a ficha */}
      <div className="flex items-center gap-1.5 mt-1.5">
        <span className="truncate font-medium" style={{ color: v.textPrimary }}>{cliente}</span>
        {row.CLIENTES?.id && (
          <button onClick={e => { e.stopPropagation(); onFicha(); }}
            title={`Ver a ficha de ${cliente}`}
            className="shrink-0 opacity-60" style={{ color: '#60a5fa' }}>
            <Eye size={14} />
          </button>
        )}
      </div>

      <p className="text-[12px] mt-0.5" style={{ color: v.textSubtle }}>
        Cód. {codigoCliente(row.CLIENTES?.display_id) || '—'}
        {' · '}
        {dataHora(row.operation_date ? `${row.operation_date}T12:00:00` : row.created_at)}
      </p>

      {/* O VALOR EM CIMA, OS PRAZOS EMBAIXO — e não os dois na mesma
          linha: dividida com o valor, cada prazo ficava com 70 pontos e
          "31/08/2027" saía "31/08/20…". Data cortada não é data. Em
          linha própria os três cabem inteiros com folga. */}
      <div className="flex items-baseline justify-between gap-3 mt-2.5">
        <span className="text-[17px] font-bold" style={{ color: '#22d3ee' }}>{fmt(row.total)}</span>
        {row.freight > 0 && (
          <span className="text-[11px]" style={{ color: v.textSubtle }}>frete {fmt(row.freight)}</span>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 mt-2">
        {prazos.map(([rotulo, valor]) => (
          <div key={rotulo} className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: v.textSubtle }}>{rotulo}</p>
            <p className="text-[12.5px] truncate" style={{ color: v.textMuted }}>{valor}</p>
          </div>
        ))}
      </div>

      {/* So aparece quando existe: no celular, campo vazio e linha
          perdida. */}
      {(row.transportadora || row.freight_quote) && (
        <p className="text-[11px] mt-2 truncate" style={{ color: v.textSubtle }}>
          {row.transportadora || 'sem transportadora'}
          {row.freight_quote ? ` · cotação ${row.freight_quote}` : ''}
        </p>
      )}
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
