// ============================================================
// TELA 3B — Acompanhamento do Pedido pelo cliente
//
// Tela externa: nenhum módulo do ERP aparece aqui, e nenhum dado
// interno chega até ela — o recorte é feito no servidor
// (lib/pedidoPublico.js), campo a campo.
//
// Ela consulta o MESMO pedido do ERP, não uma cópia: quando a Produção
// muda a etapa lá dentro, o cliente vê a mudança aqui na atualização
// seguinte, sem ninguém precisar avisar.
// ============================================================
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MessageSquare, Clock, User, FileText, DollarSign, CalendarDays, Package,
  Truck, Info, FolderOpen, Download, Sparkles, Headset, X, Loader2, Send,
  CircleCheck, Star, MapPin, Circle, Wallet, Hourglass, PenTool, FileImage,
  FileCheck, FlaskConical, Brush, CircleDashed, GlassWater, Settings,
  PackageOpen, ShieldQuestion, ShieldCheck, Camera, ImageUp, PackageSearch,
  PackageCheck, ShoppingCart, Eye, PersonStanding, IdCard, MessageCircle,
  ThumbsUp, ThumbsDown, AlertTriangle, Lock,
} from 'lucide-react';
import api from '@/lib/api';
// O MESMO VISUALIZADOR DO ERP. A arte abre DENTRO da tela, encaixada,
// com um toque para o tamanho real — e não como o arquivo cru do
// Storage, que vinha com `Content-Disposition: attachment` e por isso
// era BAIXADO em vez de mostrado. Quem quer o arquivo continua tendo o
// botão de baixar lá dentro; quem só quer olhar, olha.
import VisualizarArteModal from '@/components/UI/VisualizarArteModal';

// Nomeados um a um: `import * as Icons` derruba o tree-shaking e arrasta
// a biblioteca inteira do lucide para dentro desta página.
const ICONES = {
  CircleCheck, Wallet, Hourglass, Package, PenTool, FileImage, FileCheck,
  FlaskConical, Brush, CircleDashed, GlassWater, Settings, PackageOpen,
  ShieldQuestion, ShieldCheck, Camera, ImageUp, Truck, PackageSearch,
  PackageCheck, ShoppingCart,
};

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const dia = iso => iso ? new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR') : '—';
const dataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// A paleta do acompanhamento. Concluído verde, etapa atual âmbar,
// futuro azul/roxo apagado — etapa que ainda não aconteceu nunca fica
// verde, senão o cliente lê como pronto o que não está.
const CORES = {
  concluido: { anel: '#22c55e', fundo: 'rgba(34,197,94,0.14)',  texto: '#4ade80' },
  atual:     { anel: '#f59e0b', fundo: 'rgba(245,158,11,0.18)', texto: '#fbbf24' },
  pendente:  { anel: 'rgba(129,140,248,0.35)', fundo: 'rgba(99,102,241,0.06)', texto: 'rgba(165,180,252,0.65)' },
  /**
   * NÃO SE APLICA A ESTE PEDIDO — presente, no lugar dela, apagada.
   *
   * A régua é global: todo pedido tem os mesmos 28 status nos mesmos
   * números, para "estou na etapa 10" querer dizer a mesma coisa no
   * portal, na fábrica e no telefone. As etapas que ESTE pedido não tem
   * (pintura num copo sem pintura, serigrafia num copo liso) continuam
   * desenhadas, cinza e sem número aceso, para o número das outras não
   * pular — e para ninguém esperar por elas.
   */
  nao_se_aplica: { anel: 'rgba(148,163,184,0.18)', fundo: 'transparent', texto: 'rgba(148,163,184,0.35)' },
};

/**
 * A RÉGUA EM BLOCOS, UM POR MÓDULO.
 *
 * Os 28 balões numa fila só eram uma parede. Separados por quem cuida
 * de cada trecho — Financeiro, Pedido de Venda, Designer, Produção,
 * Logística —, a régua conta em que MESA o pedido está, e não só em
 * que número. O cliente que liga perguntando "com quem está?" tem a
 * resposta escrita.
 */
const COR_DO_MODULO = {
  financeiro: '#fbbf24', vendas: '#fb923c', designer: '#a78bfa', producao: '#60a5fa', logistica: '#4ade80',
};

/** Os módulos presentes na régua, na ordem, com a faixa de números. */
function legendaDosModulos(passos) {
  const vistos = [];
  for (const p of passos || []) {
    const u = vistos[vistos.length - 1];
    if (u && u.modulo === p.modulo) { u.ate = p.passo; continue; }
    vistos.push({ modulo: p.modulo, label: p.modulo_label || '', de: p.passo, ate: p.passo, cor: COR_DO_MODULO[p.modulo] || '#94a3b8' });
  }
  return vistos.map(m => ({ ...m, faixa: `${m.de}–${m.ate}` }));
}

/** Os blocos por módulo — a régua por ITEM ainda usa (o espaço lá é curto). */
function blocosPorModulo(passos) {
  const blocos = [];
  for (const p of passos || []) {
    const ultimo = blocos[blocos.length - 1];
    if (ultimo && ultimo.modulo === p.modulo) ultimo.passos.push(p);
    else blocos.push({ modulo: p.modulo, label: p.modulo_label || '', passos: [p] });
  }
  return blocos;
}

const CARD = {
  background: 'rgba(12,20,52,0.66)',
  border: '1px solid rgba(96,165,250,0.28)',
  borderRadius: '0.9rem',
  backdropFilter: 'blur(8px)',
};

export default function PedidoCliente() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [contato, setContato] = useState(false);
  const [verTudo, setVerTudo] = useState(false);
  // Qual item está com a linha do tempo aberta (índice na lista).
  const [itemAberto, setItemAberto] = useState(null);
  const [formRetirada, setFormRetirada] = useState(false);
  // A foto do pedido pronto aberta em tamanho grande.
  const [fotoAberta, setFotoAberta] = useState(null);
  // O QUE O OLHO ANUNCIA É NOVIDADE, NÃO A PRÓPRIA EXISTÊNCIA.
  //
  // Antes ele piscava até o primeiro clique e nunca mais: era uma aula
  // sobre onde clicar, dada uma vez. Só que o cliente não volta nesta
  // tela para aprender a usá-la — ele volta para saber se o copo dele
  // andou. Então o que pisca agora é ITEM QUE MUDOU DE ETAPA desde a
  // última vez que ele abriu aquele item. Andou de novo, pisca de novo.
  //
  // O que fica guardado é o MARCO de cada item — a etapa em que ele
  // estava quando o cliente olhou. Comparar marco guardado com marco
  // atual é toda a lógica: diferente = novidade.
  const [vistos, setVistos] = useState({});
  useEffect(() => {
    try { setVistos(JSON.parse(localStorage.getItem(CHAVE_VISTOS(id)) || '{}')); } catch { setVistos({}); }
  }, [id]);

  function abrirEtapas(idx) {
    setItemAberto(idx);
    const item = p?.itens?.[idx];
    if (!item) return;
    const proximos = { ...vistos, [chaveDoItem(item, idx)]: marcoDoItem(item) };
    setVistos(proximos);
    // Navegador anônimo ou storage cheio: pisca de novo na próxima
    // visita. Chato, e melhor que a tela deixar de abrir.
    try { localStorage.setItem(CHAVE_VISTOS(id), JSON.stringify(proximos)); } catch { /* segue */ }
  }

  /** Este item andou desde a última vez que o cliente o abriu? */
  function temNovidade(item, idx) {
    const marco = marcoDoItem(item);
    return !!marco && vistos[chaveDoItem(item, idx)] !== marco;
  }
  const token = sessionStorage.getItem('acompanhar_token');

  useEffect(() => { if (!token) navigate('/acompanhar', { replace: true }); }, [token, navigate]);

  /**
   * BAIXAR UM DOCUMENTO.
   *
   * Os três botões chamavam `alert('O download será liberado em breve')`
   * — os três, inclusive os que apareciam habilitados. O cliente
   * clicava e recebia o aviso de que nada ia acontecer.
   *
   * O pedido em PDF é a impressão desta tela: o navegador oferece
   * "salvar como PDF" e o cliente fica com a folha do que está vendo.
   * Comprovante e nota fiscal vêm do servidor — o comprovante como link
   * assinado, que expira, porque o arquivo é privado.
   */
  async function baixar(doc) {
    if (doc.key === 'pedido') { window.print(); return; }
    try {
      const r = await api.get(`/acompanhar/pedido/${id}/documento/${doc.key}`,
        { headers: { Authorization: `Bearer ${token}` } });
      if (r?.url) window.open(r.url, '_blank', 'noopener');
      else alert('Não foi possível abrir o documento agora.');
    } catch (err) {
      alert(err?.error || 'Não foi possível abrir o documento agora.');
    }
  }

  const { data: p, isLoading, error, refetch } = useQuery({
    queryKey: ['acompanhar-pedido', id],
    queryFn: () => api.get(`/acompanhar/pedido/${id}`, { headers: { Authorization: `Bearer ${token}` } }),
    enabled: !!token,
    // O pedido anda enquanto o cliente olha: a Produção muda a etapa no
    // ERP e a tela pega a mudança sozinha.
    refetchInterval: 60000,
    refetchOnWindowFocus: true,
    retry: false,
  });

  useEffect(() => {
    if (error?.error && /sess/i.test(error.error)) {
      sessionStorage.removeItem('acompanhar_token');
      navigate('/acompanhar', { replace: true });
    }
  }, [error, navigate]);

  if (!token) return null;

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#060a1f' }}>
        <Loader2 size={30} className="animate-spin" style={{ color: '#60a5fa' }} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4" style={{ background: '#060a1f' }}>
        <p className="text-white text-center">{error.error || 'Não foi possível carregar seu pedido.'}</p>
        <button onClick={() => navigate('/acompanhar')} className="rounded-xl px-5 py-2.5 text-white"
          style={{ background: '#2563eb' }}>Entrar de novo</button>
      </div>
    );
  }

  const etapaAtual = (p.linha_do_tempo || []).find(e => e.estado === 'atual');

  /**
   * AS COLUNAS DO MEIO SÃO DA COMPRA, NÃO DA TELA.
   *
   * Um copo tradicional tem uma cor; um degradê tem cor de base e de
   * boca; um jateado tem a cor do jateado. A tabela abre só as colunas
   * que algum item DESTE pedido usa — "Cor da boca: —" num tradicional
   * faz o cliente achar que faltou combinar alguma coisa e ligar para
   * perguntar sobre o que não existe.
   *
   * A ordem é a do copo: cor do produto antes da cor da personalização,
   * e não a ordem em que os itens chegaram.
   */
  const colunasItem = (() => {
    const achadas = [];
    for (const item of p.itens || []) {
      for (const campo of item.campos || []) {
        if (!achadas.includes(campo.rotulo)) achadas.push(campo.rotulo);
      }
    }
    const ORDEM = ['Cor do produto', 'Cor base', 'Cor da boca', 'Cor do jateado', 'Cor da borda'];
    const PERSONALIZACAO = 'Cor da personalização';
    const peso = r => {
      const i = ORDEM.indexOf(r);
      if (i >= 0) return i;
      return r === PERSONALIZACAO ? 999 : 100 + achadas.indexOf(r);
    };
    return [...achadas].sort((a, b) => peso(a) - peso(b));
  })();

  return (
    <div className="min-h-screen pb-10"
      style={{ background: 'radial-gradient(1200px 600px at 50% -20%, #16205c 0%, #0a0f2c 45%, #060a1f 100%)' }}>

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 sm:px-6 py-4"
        style={{ borderBottom: '1px solid rgba(96,165,250,0.2)' }}>
        <img src="/lyon-logo.png" alt="Lyon Copos" className="h-10 w-auto" draggable={false} />
        <h1 className="text-lg sm:text-xl font-bold text-white order-3 sm:order-2 w-full sm:w-auto text-center">
          Acompanhamento do Pedido
        </h1>
        {/* Um botão de atendimento na tela inteira — sem duplicar. */}
        <button onClick={() => setContato(true)}
          className="order-2 sm:order-3 rounded-xl px-4 py-2.5 text-sm text-white flex items-center gap-2"
          style={{ border: '1px solid rgba(96,165,250,0.5)', background: 'rgba(37,99,235,0.18)' }}>
          <MessageSquare size={16} /> Falar com o vendedor
        </button>
      </header>

      <main className="px-4 sm:px-6 py-5 space-y-4 max-w-[1600px] mx-auto">

        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-2xl font-bold text-white">Pedido de Venda</h2>
          <span className="text-2xl font-bold" style={{ color: '#60a5fa' }}>{p.pedido.codigo}</span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ border: `1px solid ${p.pedido.concluido ? '#22c55e' : '#f59e0b'}66`,
                     color: p.pedido.concluido ? '#4ade80' : '#fbbf24' }}>
            <Clock size={15} /> {p.pedido.concluido ? 'Pedido entregue' : 'Pedido em andamento'}
          </span>
        </div>

        {/* ── Cliente / Pedido / Valores / Prazos ─────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          <Card Icon={User} titulo="Cliente">
            <p className="text-lg font-bold text-white flex items-center gap-2 flex-wrap">
              {p.cliente.nome}
              {p.cliente.prime_estrelas >= 4 && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(59,130,246,0.22)', color: '#93c5fd' }}>
                  <Star size={9} /> Cliente Verificado
                </span>
              )}
            </p>
            <Linha rotulo="Código"   valor={p.cliente.codigo} />
            <Linha rotulo="CPF/CNPJ" valor={p.cliente.documento} />
            <Linha rotulo="Telefone" valor={p.cliente.telefone} />
            <Linha rotulo="E-mail"   valor={p.cliente.email} />
            <Linha rotulo="Cidade"   valor={p.cliente.cidade ? `${p.cliente.cidade}/${p.cliente.uf || ''}` : null} />
            {p.cliente.prime_estrelas > 0 && (
              <div className="mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs"
                style={{ background: 'rgba(245,158,11,0.15)', color: '#fbbf24' }}>
                <Star size={11} /> Lyon Prime • {p.cliente.prime_estrelas} estrela{p.cliente.prime_estrelas > 1 ? 's' : ''}
              </div>
            )}
          </Card>

          <Card Icon={FileText} titulo="Dados do Pedido">
            <Linha rotulo="Número"          valor={p.pedido.codigo} />
            <Linha rotulo="Data do Pedido"  valor={dataHora(p.pedido.data)} />
            <Linha rotulo="Data do Evento"  valor={p.pedido.data_evento ? dia(p.pedido.data_evento) : null} />
            <Linha rotulo="Origem"          valor={p.pedido.origem} />
            <Linha rotulo="Transportadora"  valor={p.pedido.transportadora} />
            <Linha rotulo="Cotação"         valor={p.pedido.cotacao} />
            <Linha rotulo="Rastreio"        valor={p.pedido.rastreio} />
          </Card>

          <Card Icon={DollarSign} titulo="Valores">
            <Linha rotulo="Valor dos Produtos" valor={brl(p.valores.produtos)} />
            <Linha rotulo="Frete"              valor={brl(p.valores.frete)} />
            <div className="mt-3 pt-3 text-center" style={{ borderTop: '1px solid rgba(96,165,250,0.25)' }}>
              <p className="text-xs" style={{ color: '#60a5fa' }}>Valor Total</p>
              <p className="text-3xl font-bold" style={{ color: '#22d3ee' }}>{brl(p.valores.total)}</p>
            </div>
          </Card>

          <Card Icon={CalendarDays} titulo="Prazos e Entrega">
            <Linha rotulo="Previsão de Saída"    valor={p.prazos.saida ? dia(p.prazos.saida) : null} />
            <Linha rotulo="Data de Coleta"       valor={p.prazos.coleta ? dia(p.prazos.coleta) : null} />
            <Linha rotulo="Previsão de Entrega"  valor={p.prazos.entrega ? dia(p.prazos.entrega) : null} />
            <Linha rotulo="Dias Úteis de Transporte"
              valor={p.prazos.dias_transporte ? `${p.prazos.dias_transporte} dias` : null} />
          </Card>
        </div>

        {/* ── Itens ───────────────────────────────────────────── */}
        <Card Icon={Package} titulo="Itens do Pedido" semPadding>
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ minWidth: 700 + colunasItem.length * 130 }}>
              <thead>
                <tr style={{ color: 'rgba(147,197,253,0.8)' }}>
                  <th className="px-2 py-2.5" style={{ borderBottom: '1px solid rgba(96,165,250,0.22)' }} />
                  {['Cód. Produto', 'Produto', 'Capacidade', 'Categoria', ...colunasItem, 'Linha', 'Qtd', 'Valor Unit.', 'Valor Total']
                    .map((h, i, todas) => (
                      <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap ${i >= todas.length - 3 ? 'text-right' : 'text-left'}`}
                        style={{ borderBottom: '1px solid rgba(96,165,250,0.22)' }}>{h}</th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {p.itens.map((i, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid rgba(96,165,250,0.12)' }}>
                    <td className="px-2 py-2.5">
                      <OlhoEtapas novidade={temNovidade(i, idx)} onClick={() => abrirEtapas(idx)} />
                    </td>
                    <td className="px-3 py-2.5 font-mono text-white">{i.codigo || '—'}</td>
                    <td className="px-3 py-2.5 text-white">{i.produto}</td>
                    <td className="px-3 py-2.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{i.capacidade || '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                        style={{ background: 'rgba(99,102,241,0.18)', color: '#c7d2fe' }}>{i.categoria}</span>
                    </td>
                    {colunasItem.map(rotulo => (
                      <td key={rotulo} className="px-3 py-2.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                        {(i.campos || []).find(c => c.rotulo === rotulo)?.valor || '—'}
                      </td>
                    ))}
                    {/* A linha (tipo de tinta) fica ao lado da cor da
                        personalização, que é o que ela explica. */}
                    <td className="px-3 py-2.5" style={{ color: 'rgba(255,255,255,0.7)' }}>{i.linha || '—'}</td>
                    <td className="px-3 py-2.5 text-right text-white">{i.quantidade}</td>
                    <td className="px-3 py-2.5 text-right" style={{ color: 'rgba(255,255,255,0.7)' }}>{brl(i.valor_unitario)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-white">{brl(i.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ══ A ARTE, QUE SE MONTA AGORA ══════════════════════
            A personalização saiu do caminho da compra. No catálogo a
            cliente só marca que QUER arte — montar nomes, datas e
            frases antes de saber se vai comprar é a maior parte da
            tela e a maior parte da desistência. Ela monta aqui, com o
            pedido já pago e sem pressa.

            É o passo que FALTA, então fica em cima da lista de itens e
            não escondido numa coluna: quem abre este pedido tem uma
            coisa a fazer, e ela precisa ser a primeira que se vê. */}
        {(p.itens || []).some(i => i.precisa_arte) && (
          <ArteDosItens pedidoId={id} token={token}
            itens={(p.itens || []).filter(i => i.precisa_arte)}
            onMontar={i => navigate(`/personalizados/arte/${i.modelo_chave}?pedido=${id}&item=${i.id}`)}
            onEnviou={refetch} />
        )}

        {/* ── Quem vai retirar ────────────────────────────────── */}
        {p.retirada && (
          <ChamadoRetirada retirada={p.retirada} onAbrir={() => setFormRetirada(true)} />
        )}

        {formRetirada && (
          <FormRetirada pedidoId={id} codigo={p.pedido.codigo} retirada={p.retirada}
            onClose={() => setFormRetirada(false)} onSalvo={() => { setFormRetirada(false); refetch(); }} />
        )}

        {/* ── A conferência no ato da retirada ─────────────────── */}
        {p.retirada && (
          <ConfirmarRetirada pedidoId={id} retirada={p.retirada} onFeito={refetch} />
        )}

        {/* ── As fotos do pedido pronto ───────────────────────── */}
        <FotosDoPedido fotos={p.fotos} onVer={setFotoAberta} />
        <VisualizarArteModal
          url={fotoAberta?.url || null}
          titulo={fotoAberta?.nome || ''}
          nomeArquivo={fotoAberta ? 'foto-do-pedido' : ''}
          onClose={() => setFotoAberta(null)} />

        {/* ── Linha do tempo ──────────────────────────────────── */}
        <Card Icon={Clock} titulo="Linha do Tempo do Pedido">
          {etapaAtual && (
            <p className="text-sm mb-4" style={{ color: '#fbbf24' }}>
              Seu pedido está em: <b>{etapaAtual.label}</b>
            </p>
          )}
          {/* Uma régua só, alinhada; o módulo é a cor da faixa embaixo do
              balão, com a legenda em cima. Blocos separados por módulo
              esticavam cada grupo pela largura inteira e ficava feio. */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3">
            {legendaDosModulos(p.linha_do_tempo).map(m => (
              <span key={m.modulo} className="text-[10.5px] font-semibold uppercase tracking-wide inline-flex items-center gap-1.5"
                style={{ color: m.cor }}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.cor }} />
                {m.label}
                <span className="font-normal normal-case tracking-normal" style={{ color: 'rgba(255,255,255,0.4)' }}>{m.faixa}</span>
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-2 gap-y-5">
            {(p.linha_do_tempo || []).map(passo => <Balao key={passo.key} passo={passo} corModulo={COR_DO_MODULO[passo.modulo]} />)}
          </div>
          <p className="text-[11px] mt-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Os números são os mesmos em todo pedido. Etapa riscada não se aplica a este pedido
            (depende do produto e dos processos contratados) — o pedido passa direto por ela.
            {p.itens.length > 1 && ' Clique no olho ao lado de cada produto para ver as etapas dele.'}
          </p>
        </Card>

        {/* A linha do tempo DESTE produto. */}
        {itemAberto != null && p.itens[itemAberto] && (
          <EtapasDoItem item={p.itens[itemAberto]} onClose={() => setItemAberto(null)} />
        )}

        {/* ── Histórico / Documentos / Entrega / Avisos ────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">

          <Card Icon={Clock} titulo="Histórico da Linha do Tempo">
            <div className="space-y-1.5">
              {(p.historico || []).length === 0 ? (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Ainda sem movimentações.</p>
              ) : (verTudo ? p.historico : p.historico.slice(-6)).map((h, i) => (
                <div key={i} className="flex items-start gap-2 text-[13px]">
                  <CircleCheck size={13} className="shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
                  <span style={{ color: 'rgba(255,255,255,0.55)' }}>{dataHora(h.at)}</span>
                  <span className="text-white">{h.label}</span>
                </div>
              ))}
            </div>
            {(p.historico || []).length > 6 && (
              <button onClick={() => setVerTudo(x => !x)} className="text-xs mt-3" style={{ color: '#60a5fa' }}>
                {verTudo ? 'Mostrar menos' : 'Ver histórico completo'}
              </button>
            )}
          </Card>

          <Card Icon={FolderOpen} titulo="Documentos">
            <div className="space-y-2">
              {(p.documentos || []).map(doc => (
                <button key={doc.key} disabled={!doc.disponivel}
                  onClick={() => baixar(doc)}
                  className="w-full flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm disabled:opacity-45 disabled:cursor-not-allowed"
                  style={{ border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(37,99,235,0.10)' }}>
                  <FileText size={14} style={{ color: '#60a5fa' }} className="shrink-0" />
                  <span className="flex-1 min-w-0 truncate text-white">{doc.label}</span>
                  <Download size={14} style={{ color: 'rgba(255,255,255,0.5)' }} className="shrink-0" />
                </button>
              ))}
            </div>
            {(p.documentos || []).filter(d => d.nota).map(d => (
              <p key={d.key} className="text-[11px] mt-2" style={{ color: 'rgba(255,255,255,0.45)' }}>{d.nota}</p>
            ))}
          </Card>

          <Card Icon={Truck} titulo="Informações da Entrega">
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.75)' }}>
              {p.entrega.texto}
            </p>
            <p className="text-sm leading-relaxed mt-2 flex items-start gap-1.5" style={{ color: '#93c5fd' }}>
              <MapPin size={13} className="shrink-0 mt-0.5" /> {p.entrega.observacao}
            </p>
          </Card>

          <Card Icon={Info} titulo="Informações Importantes">
            <ul className="space-y-2">
              {(p.avisos || []).map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-1.5" style={{ background: '#fbbf24' }} />
                  {a}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </main>

      {contato && <CentralContato token={token} saleId={id} pedido={p.pedido.codigo} onClose={() => setContato(false)} />}
    </div>
  );
}

/**
 * Central de atendimento. Duas portas: a IA responde na hora sobre este
 * pedido, e o humanizado leva ao WhatsApp do vendedor responsável — o
 * cliente não escolhe atendente nem vê telefone de outro vendedor.
 */
function CentralContato({ token, saleId, pedido, onClose }) {
  const [modo, setModo] = useState(null);       // null | 'ia' | 'humano'
  const [pergunta, setPergunta] = useState('');
  const [conversa, setConversa] = useState([]);
  const cabecalho = { headers: { Authorization: `Bearer ${token}` } };

  const { data: info } = useQuery({
    queryKey: ['acompanhar-contato', saleId],
    queryFn: () => api.get(`/acompanhar/pedido/${saleId}/contato`, cabecalho),
  });

  const perguntarIA = useMutation({
    mutationFn: () => api.post(`/acompanhar/pedido/${saleId}/ia`, { pergunta }, cabecalho),
    onSuccess: r => {
      setConversa(c => [...c, { de: 'cliente', texto: pergunta }, { de: 'ia', texto: r.resposta }]);
      setPergunta('');
    },
    onError: e => setConversa(c => [...c, { de: 'erro', texto: e.error || 'Não consegui responder agora.' }]),
  });

  const abrirHumano = useMutation({
    mutationFn: () => api.post(`/acompanhar/pedido/${saleId}/humano`, { mensagem: pergunta }, cabecalho),
    onSuccess: r => window.open(r.link, '_blank', 'noopener'),
    onError: e => alert(e.error || 'Não foi possível abrir o atendimento agora.'),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col"
        style={{ ...CARD, background: 'rgba(10,16,45,0.96)' }}>

        <div className="flex items-center justify-between gap-3 px-5 py-4"
          style={{ borderBottom: '1px solid rgba(96,165,250,0.25)' }}>
          <div>
            <h3 className="text-lg font-bold text-white">Contato / Dúvidas</h3>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Sobre o pedido {pedido}
              {info?.vendedor && ` · vendedor ${info.vendedor}`}
            </p>
          </div>
          <button onClick={onClose} className="p-1 text-white/60 hover:text-white"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!modo && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Se precisar tirar dúvidas sobre seu pedido, fale diretamente com o vendedor.
              </p>
              <Opcao Icon={Sparkles} titulo="Atendimento por IA" cor="#60a5fa"
                texto="Responde na hora dúvidas sobre pedido, prazo, entrega e andamento."
                onClick={() => setModo('ia')} />
              <Opcao Icon={Headset} titulo="Atendimento Humanizado" cor="#c084fc"
                texto={`Sua mensagem vai para o vendedor do seu pedido. Retorno em ${info?.prazo_humano || 'até 20 minutos'}.`}
                onClick={() => setModo('humano')} />
            </div>
          )}

          {modo === 'ia' && (
            <div className="space-y-3">
              {conversa.map((m, i) => (
                <div key={i} className={`flex ${m.de === 'cliente' ? 'justify-end' : 'justify-start'}`}>
                  <p className="max-w-[85%] rounded-xl px-3 py-2 text-[13px] whitespace-pre-wrap"
                    style={m.de === 'cliente'
                      ? { background: '#2563eb', color: 'white' }
                      : m.de === 'erro'
                        ? { background: 'rgba(248,113,113,0.15)', color: '#fca5a5' }
                        : { background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.9)' }}>
                    {m.texto}
                  </p>
                </div>
              ))}
              {conversa.length === 0 && (
                <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                  Pergunte sobre prazo, etapa atual, entrega ou o que foi pedido.
                  Para trocas, cancelamento ou qualquer acerto, o vendedor é quem resolve.
                </p>
              )}
            </div>
          )}

          {modo === 'humano' && (
            <div className="space-y-3">
              <p className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Sua mensagem vai direto para {info?.vendedor ? <b>{info.vendedor}</b> : 'o vendedor do seu pedido'},
                pelo WhatsApp. Retorno em {info?.prazo_humano || 'até 20 minutos'}.
              </p>
              {!info?.tem_whatsapp && (
                <p className="text-sm rounded-lg px-3 py-2"
                  style={{ background: 'rgba(251,191,36,0.14)', color: '#fbbf24' }}>
                  O vendedor deste pedido ainda não tem WhatsApp cadastrado. Use o atendimento por IA
                  ou fale com a loja pelo canal de sempre.
                </p>
              )}
            </div>
          )}
        </div>

        {modo && (
          <div className="p-4 space-y-2" style={{ borderTop: '1px solid rgba(96,165,250,0.25)' }}>
            <textarea rows={2} value={pergunta} onChange={e => setPergunta(e.target.value)}
              placeholder={modo === 'ia' ? 'Escreva sua dúvida...' : 'Escreva sua mensagem (opcional)...'}
              className="w-full rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-white/40 outline-none resize-none"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(96,165,250,0.3)' }} />
            <div className="flex gap-2">
              <button onClick={() => { setModo(null); setPergunta(''); }}
                className="rounded-xl px-4 py-2.5 text-sm text-white/70"
                style={{ border: '1px solid rgba(255,255,255,0.15)' }}>Voltar</button>
              <button
                onClick={() => (modo === 'ia' ? perguntarIA : abrirHumano).mutate()}
                disabled={(modo === 'ia' && !pergunta.trim()) || perguntarIA.isPending || abrirHumano.isPending
                          || (modo === 'humano' && !info?.tem_whatsapp)}
                className="flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: modo === 'ia' ? '#2563eb' : '#16a34a' }}>
                {(perguntarIA.isPending || abrirHumano.isPending)
                  ? <Loader2 size={15} className="animate-spin" />
                  : modo === 'ia' ? <Sparkles size={15} /> : <Send size={15} />}
                {modo === 'ia' ? 'Perguntar' : 'Abrir WhatsApp'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Balao({ passo, corModulo }) {
  const Icon = ICONES[passo.icone] || Circle;
  const c = CORES[passo.estado] || CORES.pendente;
  const foraDoPedido = passo.estado === 'nao_se_aplica';
  return (
    <div className="flex flex-col items-center gap-1 text-center" style={{ width: 92, opacity: foraDoPedido ? 0.55 : 1 }}
      title={`${passo.passo}. ${passo.label}${foraDoPedido ? ' — não se aplica a este pedido' : ''}${passo.at ? ` — ${dataHora(passo.at)}` : ''}`}>
      <div className="relative">
        <div className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ border: `2px solid ${c.anel}`, background: c.fundo,
                   boxShadow: passo.estado === 'atual' ? `0 0 14px ${c.anel}88` : 'none' }}>
          <Icon size={18} style={{ color: c.texto }} />
        </div>
        <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: c.anel, color: foraDoPedido ? 'rgba(255,255,255,0.35)' : '#0b1020' }}>{passo.passo}</span>
      </div>
      <span className="text-[10px] leading-tight" style={{ color: c.texto, textDecoration: foraDoPedido ? 'line-through' : 'none' }}>
        {passo.label}
      </span>
      {passo.at && (
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {new Date(passo.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </span>
      )}
      {corModulo && (
        <span className="w-8 h-[3px] rounded-full mt-0.5" style={{ background: corModulo, opacity: foraDoPedido ? 0.3 : 0.85 }} />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// A PERSONALIZAÇÃO, ITEM POR ITEM.
//
// A personalização saiu do caminho da compra: no catálogo a cliente só
// marca que QUER arte — montar nomes, datas e frases antes de saber se
// vai comprar é a maior parte da tela e a maior parte da desistência.
// Ela resolve aqui, com o pedido já pago e sem pressa.
//
// UM PEDIDO PODE TER DUAS ARTES. Cem copos de um jeito e cem de outro
// são dois itens, cada um com o seu desenho — por isso cada item é uma
// LINHA com os seus próprios botões. É a cliente quem escolhe em qual
// deles a arte entra, porque só ela sabe.
//
// DUAS PORTAS, PORQUE SÃO DUAS CLIENTES. Uma monta a arte no editor;
// a outra chega com o arquivo do designer dela na mão e só quer anexar.
// Oferecer só o editor mandava a segunda para o WhatsApp do vendedor —
// e de lá o arquivo entrava no pedido à mão, quando entrava.
//
// E EXISTE UMA TERCEIRA PORTA, que é a da LOJA. Quando o desenho vem de
// cá — o designer da Lyon montou, o vendedor anexou —, ele não vale por
// combinado: a cliente vê e diz se é aquilo. Antes disso não existia:
// a arte entrava, o pedido seguia para a serigrafia e a cliente
// descobria o desenho na foto do produto pronto. A hora de descobrir
// que o nome está escrito errado não é depois de mil copos impressos.
//
// O ENVIO PASSOU A PERGUNTAR DE NOVO — e é uma mudança de ideia
// deliberada. Aqui dizia "escolher já é a confirmação; uma janela a
// mais entre o toque e o envio é onde o celular perde gente", e isso
// valia enquanto enviar a arte fosse reversível. Deixou de ser: o envio
// (e a confirmação) DISPARA a personalização, e dali em diante a troca
// só existe falando com um atendente. Uma janela a mais custa um toque;
// mil copos com a arte errada custam o pedido inteiro.
// ════════════════════════════════════════════════════════════
const TAMANHO_MAX_ARTE = 6 * 1024 * 1024;

// A frase que precede todo caminho sem volta desta tela. Ela diz O QUE
// COMEÇA e O QUE DEIXA DE SER POSSÍVEL — "tem certeza?" sozinho não
// informa nada a quem já clicou por engano uma vez.
const AVISO_SEM_VOLTA =
  'Ao confirmar, a personalização deste item COMEÇA: a arte vira vegetal, tela e copo impresso. '
  + 'Desse ponto em diante o processo não pode ser interrompido, e trocar a arte só falando com um atendente.';

/**
 * A SEGUNDA PERGUNTA.
 *
 * Toda ação irreversível desta tela passa por aqui: enviar a arte,
 * confirmar a que a loja mandou, reprovar. O botão faz o pedido; esta
 * janela é onde a pessoa lê o que vai acontecer e decide de novo.
 *
 * O botão de confirmar nasce à DIREITA e o de cancelar à esquerda, e o
 * de fechar no canto — quem tocar em qualquer lugar por engano cancela,
 * que é o resultado seguro.
 */
function ConfirmacaoDupla({ titulo, pergunta, aviso, rotulo, Icone, cor, carregando, onConfirmar, onCancelar, children }) {
  // Portal pelo mesmo motivo do visualizador da arte: o cartão de vidro
  // tem `backdrop-filter`, e isso faz o `fixed` de dentro dele ficar
  // preso ao cartão — a janela nasceria dentro do bloco, com metade da
  // página viva por fora.
  return createPortal((
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,18,0.85)' }} onClick={carregando ? undefined : onCancelar}>
      <div className="w-full max-w-lg rounded-2xl p-5" onClick={e => e.stopPropagation()}
        style={{ background: 'linear-gradient(180deg,#0b1024 0%,#080d1e 100%)',
                 border: `1px solid ${cor}66`, boxShadow: `0 0 30px ${cor}26` }}>

        <div className="flex items-start justify-between gap-3">
          <h3 className="text-white font-bold text-[17px] flex items-center gap-2">
            <Icone size={18} style={{ color: cor }} /> {titulo}
          </h3>
          <button onClick={onCancelar} disabled={carregando} className="p-1 rounded-lg shrink-0"
            style={{ color: 'rgba(255,255,255,0.55)' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        <p className="text-[14px] mt-3 text-white">{pergunta}</p>

        {aviso && (
          <p className="text-[12.5px] mt-3 rounded-xl px-3.5 py-2.5 flex gap-2"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d',
                     border: '1px solid rgba(245,158,11,0.35)' }}>
            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{aviso}</span>
          </p>
        )}

        {children}

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onCancelar} disabled={carregando}
            className="rounded-xl px-4 py-2.5 text-[13.5px] font-semibold"
            style={{ background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.85)' }}>
            Voltar
          </button>
          <button onClick={onConfirmar} disabled={carregando}
            className="inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[13.5px] font-bold"
            style={{ background: cor, color: '#0b1024', opacity: carregando ? 0.7 : 1 }}>
            {carregando ? <Loader2 size={15} className="animate-spin" /> : <Icone size={15} />}
            {carregando ? 'Registrando…' : rotulo}
          </button>
        </div>
      </div>
    </div>
  ), document.body);
}

/** A cara de cada estado da arte — cor, título e o que dizer embaixo. */
const ESTADO_ARTE = {
  sem_arte: {
    cor: '#a855f7', fundo: 'rgba(168,85,247,0.12)', borda: 'rgba(168,85,247,0.42)',
    Icone: PenTool, titulo: 'Falta a arte deste item',
  },
  aguardando_cliente: {
    cor: '#fbbf24', fundo: 'rgba(245,158,11,0.14)', borda: 'rgba(245,158,11,0.5)',
    Icone: Eye, titulo: 'Veja e confirme a arte',
  },
  aprovada: {
    cor: '#4ade80', fundo: 'rgba(34,197,94,0.10)', borda: 'rgba(34,197,94,0.35)',
    Icone: CircleCheck, titulo: 'Arte confirmada',
  },
  reprovada: {
    cor: '#f87171', fundo: 'rgba(248,113,113,0.12)', borda: 'rgba(248,113,113,0.45)',
    Icone: ThumbsDown, titulo: 'Arte reprovada por você',
  },
};

function ArteDosItens({ pedidoId, token, itens, onMontar, onEnviou }) {
  const [enviando, setEnviando] = useState(null);   // id do item em voo
  const [erro, setErro] = useState('');
  // A pergunta em aberto: { tipo: 'enviar'|'aprovar'|'reprovar', item, arquivo }
  const [pergunta, setPergunta] = useState(null);
  const [motivo, setMotivo] = useState('');
  // Qual arte está aberta no visualizador (o item, para dar nome ao arquivo).
  const [vendo, setVendo] = useState(null);

  function abrir(tipo, item, arquivo) {
    setErro('');
    if (tipo === 'enviar' && arquivo.size > TAMANHO_MAX_ARTE) {
      setErro('A arte passa de 6 MB. Mande um arquivo menor ou envie pelo WhatsApp do vendedor.');
      return;
    }
    setMotivo('');
    setPergunta({ tipo, item, arquivo });
  }

  async function anexar(item, arquivo) {
    const dataUrl = await new Promise((ok, falha) => {
      const leitor = new FileReader();
      leitor.onload = () => ok(leitor.result);
      leitor.onerror = () => falha(new Error('Não consegui ler o arquivo escolhido.'));
      leitor.readAsDataURL(arquivo);
    });
    await api.post(`/acompanhar/pedido/${pedidoId}/item/${item.id}/arte-anexada`,
      { arquivo: dataUrl, nome: arquivo.name },
      { headers: { Authorization: `Bearer ${token}` } });
  }

  async function decidir(item, decisao) {
    await api.post(`/acompanhar/pedido/${pedidoId}/item/${item.id}/arte-decisao`,
      { decisao, motivo: decisao === 'reprovar' ? motivo : undefined },
      { headers: { Authorization: `Bearer ${token}` } });
  }

  async function confirmar() {
    const { tipo, item, arquivo } = pergunta;
    setEnviando(item.id);
    setErro('');
    try {
      if (tipo === 'enviar') await anexar(item, arquivo);
      else await decidir(item, tipo);
      setPergunta(null);
      onEnviou?.();
    } catch (err) {
      setPergunta(null);
      // A dica do servidor é a metade útil da recusa: ela diz o que
      // fazer ("fale com um atendente"), e não só que não deu.
      setErro([err?.error || err?.message || 'Não foi possível registrar isso agora.', err?.dica]
        .filter(Boolean).join(' '));
    } finally {
      setEnviando(null);
    }
  }

  const aConfirmar = itens.filter(i => i.arte_estado === 'aguardando_cliente').length;
  const faltando = itens.filter(i => i.arte_estado === 'sem_arte').length;

  return (
    <Card Icon={PenTool} titulo="Sua personalização">
      <p className="text-[12.5px] mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>
        {itens.length > 1
          ? <>Este pedido tem <b>{itens.length} itens personalizados</b> — cada um leva a sua arte.</>
          : <>Este item leva arte personalizada.</>}
        {aConfirmar > 0 && (
          <b style={{ color: '#fbbf24' }}>
            {' '}{aConfirmar === 1 ? 'Uma arte está esperando você ver e confirmar.'
                                   : `${aConfirmar} artes estão esperando você ver e confirmar.`}
          </b>
        )}
        {faltando > 0 && <> Ainda {faltando === 1 ? 'falta 1 arte' : `faltam ${faltando} artes`}.</>}
      </p>

      {erro && (
        <p className="text-[12.5px] mb-3 rounded-lg px-3 py-2"
          style={{ background: 'rgba(248,113,113,0.12)', color: '#fca5a5' }} role="alert">{erro}</p>
      )}

      <div className="space-y-2.5">
        {itens.map((i, idx) => {
          const estado = ESTADO_ARTE[i.arte_estado] || ESTADO_ARTE.sem_arte;
          const travado = i.arte_estado === 'aprovada';
          const emVoo = enviando === i.id;
          const daLoja = i.arte_estado === 'aguardando_cliente';

          return (
            <div key={i.id} className="rounded-xl px-3.5 py-3"
              style={{ background: estado.fundo, border: `1px solid ${estado.borda}` }}>

              <div className="flex flex-wrap items-start gap-3 justify-between">
                <div className="min-w-0">
                  <p className="text-white text-[14px] font-semibold leading-tight">
                    {itens.length > 1 && <span style={{ color: '#c4b5fd' }}>{idx + 1}. </span>}
                    {i.produto}
                  </p>
                  <p className="text-[12px] mt-0.5 flex items-center gap-1.5" style={{ color: estado.cor }}>
                    <estado.Icone size={13} /> {estado.titulo}
                  </p>
                  <p className="text-[12px] mt-1" style={{ color: 'rgba(255,255,255,0.65)' }}>
                    {i.arte_estado === 'sem_arte' && (
                      <>{i.quantidade} un. · monte a sua arte aqui ou envie o arquivo pronto.</>
                    )}
                    {daLoja && (
                      <>Preparamos esta arte para os {i.quantidade} itens. Confira o desenho, os nomes e as
                        datas: depois da sua confirmação a personalização começa.</>
                    )}
                    {travado && (
                      <>Confirmada{i.arte_aprovada_em ? ` em ${dataHora(i.arte_aprovada_em)}` : ''} — a
                        personalização já começou. Para mudar alguma coisa, fale com um atendente.</>
                    )}
                    {i.arte_estado === 'reprovada' && (
                      <>Reprovada{i.arte_reprovada_em ? ` em ${dataHora(i.arte_reprovada_em)}` : ''}. A loja
                        vai preparar outra — ou você pode enviar a sua agora.
                        {i.arte_reprovada_motivo && <> Você escreveu: “{i.arte_reprovada_motivo}”.</>}</>
                    )}
                  </p>
                  {i.arte_anexada && (
                    <button type="button" onClick={() => setVendo(i)}
                      className="text-[12px] inline-flex items-center gap-1.5 mt-1" style={{ color: estado.cor }}>
                      <FileImage size={12} /> ver a arte ampliada
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {/* ── ARTE DA LOJA: ver, confirmar ou reprovar ──── */}
                  {daLoja && (
                    <>
                      <button type="button" onClick={() => abrir('aprovar', i)} disabled={emVoo}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-bold text-[13.5px]"
                        style={{ background: '#22c55e', color: '#062012' }}>
                        <ThumbsUp size={15} /> Confirmar a arte
                      </button>
                      <button type="button" onClick={() => abrir('reprovar', i)} disabled={emVoo}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-[13.5px]"
                        style={{ background: 'rgba(248,113,113,0.14)', color: '#fca5a5',
                                 border: '1px solid rgba(248,113,113,0.5)' }}>
                        <ThumbsDown size={15} /> Reprovar
                      </button>
                    </>
                  )}

                  {/* ── SEM ARTE OU REPROVADA: as duas portas dela ─── */}
                  {!travado && !daLoja && (
                    <>
                      <button type="button" onClick={() => onMontar(i)} disabled={emVoo || !i.modelo_chave}
                        title={i.modelo_chave ? undefined
                          : 'Este produto ainda não tem gabarito de arte cadastrado — um atendente monta com você.'}
                        className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-[13.5px]"
                        style={{ background: i.modelo_chave ? 'linear-gradient(90deg,#a855f7,#6366f1)' : 'rgba(255,255,255,0.06)',
                                 color: i.modelo_chave ? '#fff' : 'rgba(255,255,255,0.45)',
                                 cursor: i.modelo_chave ? 'pointer' : 'not-allowed' }}>
                        <PenTool size={15} /> Criar minha arte aqui
                      </button>

                      {/* O input fica escondido dentro do próprio rótulo:
                          no celular, um <input type=file> desenhado à mão
                          é o campo que ninguém reconhece como botão. */}
                      <label className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-[13.5px] ${
                        emVoo ? 'opacity-60' : 'cursor-pointer'}`}
                        style={{ background: 'rgba(255,255,255,0.08)', color: '#fff',
                                 border: '1px solid rgba(96,165,250,0.45)' }}>
                        {emVoo
                          ? <><Loader2 size={15} className="animate-spin" /> Enviando…</>
                          : <><ImageUp size={15} /> {i.arte_anexada ? 'Trocar o arquivo' : 'Já tenho a arte'}</>}
                        <input type="file" className="hidden" disabled={emVoo}
                          accept="image/*,application/pdf,.svg,.ai,.cdr,.eps,.psd"
                          onChange={e => {
                            const arquivo = e.target.files?.[0];
                            e.target.value = '';
                            if (arquivo) abrir('enviar', i, arquivo);
                          }} />
                      </label>
                    </>
                  )}

                  {/* ── CONFIRMADA: acabou o que ela decide aqui ───── */}
                  {travado && (
                    <span className="inline-flex items-center gap-2 text-[12.5px] px-3 py-2 rounded-xl"
                      style={{ background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.6)' }}>
                      <Lock size={14} /> em produção — troca só com atendente
                    </span>
                  )}
                </div>
              </div>

              {/* A ARTE, GRANDE, ONDE A DECISÃO É TOMADA.
                  Um link "ver o arquivo" obriga a sair da tela para
                  decidir e voltar — e quem sai não volta. Ela olha o
                  desenho e os dois botões na mesma linha de visão. */}
              {daLoja && i.arte_anexada && /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(i.arte_anexada) && (
                <button type="button" onClick={() => setVendo(i)}
                  title="Clique para ver a arte ampliada"
                  className="block w-full mt-3 rounded-xl overflow-hidden"
                  style={{ border: '1px solid rgba(245,158,11,0.35)', background: 'rgba(255,255,255,0.04)',
                           cursor: 'zoom-in' }}>
                  <img src={i.arte_anexada} alt={`Arte de ${i.produto}`}
                    className="w-full max-h-72 object-contain" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[11px] mt-3" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Já tem a arte pronta? Envie o arquivo — PNG, JPG, PDF, SVG ou o aberto do seu designer, até 6 MB.
        Enviar ou confirmar uma arte dá início à personalização: a partir daí o processo não pode ser
        interrompido, e a troca passa a ser com um atendente.
      </p>

      {/* A arte aberta na tela — expandir é o padrão, baixar é um botão
          dentro do visualizador. */}
      <VisualizarArteModal
        url={vendo?.arte_anexada || null}
        titulo={vendo ? `Arte de ${vendo.produto}` : ''}
        nomeArquivo={vendo ? `arte-${vendo.codigo || vendo.produto}` : ''}
        notas={vendo?.arte_estado === 'aguardando_cliente'
          ? 'Confira o desenho, os nomes e as datas. Feche esta janela para confirmar ou reprovar.'
          : null}
        onClose={() => setVendo(null)} />

      {/* ── A segunda pergunta, uma por vez ──────────────────── */}
      {pergunta?.tipo === 'enviar' && (
        <ConfirmacaoDupla
          titulo="Enviar esta arte?" Icone={ImageUp} cor="#60a5fa" rotulo="Sim, enviar e começar"
          carregando={!!enviando} onCancelar={() => setPergunta(null)} onConfirmar={confirmar}
          pergunta={<>Você tem certeza que deseja enviar <b>{pergunta.arquivo?.name}</b> como a arte
            de <b>{pergunta.item.produto}</b> ({pergunta.item.quantidade} un.)?</>}
          aviso={AVISO_SEM_VOLTA} />
      )}

      {pergunta?.tipo === 'aprovar' && (
        <ConfirmacaoDupla
          titulo="Confirmar a arte?" Icone={ThumbsUp} cor="#22c55e" rotulo="Sim, confirmar a arte"
          carregando={!!enviando} onCancelar={() => setPergunta(null)} onConfirmar={confirmar}
          pergunta={<>Você tem certeza que deseja CONFIRMAR a arte de <b>{pergunta.item.produto}</b> ({pergunta.item.quantidade} un.)?
            Confira o desenho, os nomes e as datas antes de seguir.</>}
          aviso={AVISO_SEM_VOLTA} />
      )}

      {pergunta?.tipo === 'reprovar' && (
        <ConfirmacaoDupla
          titulo="Reprovar a arte?" Icone={ThumbsDown} cor="#f87171" rotulo="Sim, reprovar a arte"
          carregando={!!enviando} onCancelar={() => setPergunta(null)} onConfirmar={confirmar}
          pergunta={<>Você tem certeza que deseja REPROVAR a arte de <b>{pergunta.item.produto}</b>?
            Nada será produzido com ela, e a loja vai preparar outra.</>}>
          {/* O motivo é opcional de propósito: obrigar a escrever faz
              gente digitar "não gostei" para conseguir clicar. Uma linha
              dita aqui poupa o telefonema que o vendedor daria. */}
          <label className="block mt-4">
            <span className="text-[12px]" style={{ color: 'rgba(255,255,255,0.6)' }}>
              O que precisa mudar? (opcional, mas ajuda muito)
            </span>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} maxLength={500}
              placeholder="Ex.: o nome está escrito Marina, o certo é Mariana."
              className="w-full mt-1.5 rounded-xl px-3 py-2 text-[13.5px] text-white outline-none"
              style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(96,165,250,0.35)' }} />
          </label>
        </ConfirmacaoDupla>
      )}
    </Card>
  );
}

/**
 * AS FOTOS DO SEU PEDIDO PRONTO.
 *
 * A fábrica fotografa uma peça de cada arte antes de embalar — é etapa
 * obrigatória, com senha e conferência. Só que a foto morria lá dentro:
 * ficava guardada no pedido e nenhuma tela do lado do cliente a lia.
 *
 * Ela existe para ser vista AQUI, e agora. O pedido ainda está na
 * fábrica quando a foto é tirada, e é a última hora em que um engano —
 * a cor errada, o logo trocado, o nome escrito diferente — se conserta
 * sem frete de volta e sem refazer mil copos.
 *
 * Clicar abre em tamanho grande, no mesmo visualizador da arte.
 */
function FotosDoPedido({ fotos, onVer }) {
  if (!fotos?.length) return null;
  return (
    <Card Icon={Camera} titulo="Fotos do seu pedido pronto">
      <p className="text-[13px] mb-3" style={{ color: 'rgba(255,255,255,0.65)' }}>
        Fotografamos uma peça de cada arte antes de embalar. Confira com calma —
        se algo não estiver como você combinou, fale com a gente <b>antes de o pedido sair</b>.
      </p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {fotos.map((f, i) => (
          <button key={i} onClick={() => onVer({ url: f.url, nome: `Foto ${i + 1} do pedido` })}
            className="group relative rounded-xl overflow-hidden text-left"
            style={{ border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.04)' }}>
            <img src={f.url} alt={`Foto ${i + 1} do pedido pronto`} loading="lazy"
              className="w-full h-32 object-cover transition-transform group-hover:scale-105" />
            <span className="absolute bottom-0 left-0 right-0 px-2 py-1 text-[11px] flex items-center gap-1"
              style={{ background: 'rgba(0,0,0,0.55)', color: 'rgba(255,255,255,0.85)' }}>
              <Eye size={11} /> Ampliar
            </span>
          </button>
        ))}
      </div>
    </Card>
  );
}

/**
 * "ABRI E CONFERI" — dito por escrito, no balcão.
 *
 * A frase que fecha a retirada era dita de boca: o cliente pegava a
 * caixa, ia embora, e três dias depois a conversa sobre o que veio
 * errado não tinha nada escrito de nenhum dos dois lados.
 *
 * QUEM ASSINA PROVA QUEM É. O portal não tem senha de cliente — a
 * entrada é CPF e data de nascimento, e é esse mesmo par que se pede
 * aqui de novo, no momento de assumir a conferência. Está escrito na
 * tela com todas as letras: pedir "sua senha" onde não existe senha
 * seria a tela mentindo sobre o que faz.
 *
 * O botão só aparece com o pedido esperando ser buscado. Antes disso,
 * assinar seria assinar por uma caixa que ainda não foi aberta.
 */
const TEXTO_DECLARACAO = 'Eu declaro que abri e conferi a mercadoria no ato da retirada '
  + 'e que estão de acordo com o pedido realizado.';

function ConfirmarRetirada({ pedidoId, retirada, onFeito }) {
  const [aberto, setAberto] = useState(false);
  const [declaro, setDeclaro] = useState(false);
  const [cpf, setCpf] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [erro, setErro] = useState(null);

  const enviar = useMutation({
    mutationFn: () => api.post(`/acompanhar/pedido/${pedidoId}/retirada-confirmada`,
      { declaro, cpf, nascimento }),
    onSuccess: () => { setAberto(false); onFeito?.(); },
    onError: e => setErro(e.dica ? `${e.error} ${e.dica}` : (e.error || 'Não foi possível confirmar.')),
  });

  // Já assinada: fica o registro, e não o botão.
  if (retirada.confirmada) {
    return (
      <div className="rounded-2xl px-4 py-3.5"
        style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.3)' }}>
        <p className="text-sm font-semibold flex items-center gap-2" style={{ color: '#4ade80' }}>
          <CircleCheck size={15} /> Retirada confirmada
        </p>
        <p className="text-[13px] mt-1" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {retirada.confirmada.por} declarou a conferência em{' '}
          {new Date(retirada.confirmada.em).toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}.
        </p>
        <p className="text-[12px] mt-1.5 italic" style={{ color: 'rgba(255,255,255,0.45)' }}>
          “{retirada.confirmada.declaracao || TEXTO_DECLARACAO}”
        </p>
      </div>
    );
  }

  if (!retirada.confirmar_agora) return null;

  return (
    <>
      <button onClick={() => { setAberto(true); setErro(null); }}
        className="w-full rounded-2xl px-4 py-3.5 text-left transition-colors"
        style={{ background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.35)' }}>
        <span className="text-sm font-semibold flex items-center gap-2 text-white">
          <PackageCheck size={16} style={{ color: '#60a5fa' }} /> Retirei o meu pedido
        </span>
        <span className="text-[13px] block mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
          Confirme aqui no ato da retirada, depois de abrir e conferir a mercadoria.
        </span>
      </button>

      {aberto && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)' }} onClick={() => !enviar.isPending && setAberto(false)}>
          <div className="w-full max-w-md rounded-2xl p-5 space-y-3.5"
            style={{ background: '#111827', border: '1px solid rgba(255,255,255,0.12)' }}
            onClick={e => e.stopPropagation()}>

            <p className="text-base font-semibold text-white flex items-center gap-2">
              <PackageCheck size={17} style={{ color: '#60a5fa' }} /> Confirmar a retirada
            </p>

            <label className="flex items-start gap-2.5 cursor-pointer rounded-xl p-3"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.10)' }}>
              <input type="checkbox" checked={declaro} onChange={e => setDeclaro(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0 accent-blue-500" />
              <span className="text-[13px] leading-relaxed" style={{ color: 'rgba(255,255,255,0.85)' }}>
                {TEXTO_DECLARACAO}
              </span>
            </label>

            <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.5)' }}>
              Para assinar, confirme os mesmos dados com que você entrou aqui.
            </p>

            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <span className="text-[11px] block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Seu CPF</span>
                <input value={cpf} onChange={e => setCpf(e.target.value)} inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }} />
              </div>
              <div>
                <span className="text-[11px] block mb-1" style={{ color: 'rgba(255,255,255,0.5)' }}>Nascimento</span>
                <input value={nascimento} onChange={e => setNascimento(e.target.value)} type="date"
                  className="w-full rounded-lg px-3 py-2 text-sm text-white"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.14)' }} />
              </div>
            </div>

            {erro && (
              <p className="text-[12.5px] rounded-lg px-3 py-2 flex items-start gap-2"
                style={{ background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.3)', color: '#fca5a5' }}>
                <AlertTriangle size={13} className="shrink-0 mt-0.5" /> {erro}
              </p>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <button onClick={() => setAberto(false)} disabled={enviar.isPending}
                className="px-3.5 py-2 rounded-lg text-sm"
                style={{ color: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.15)' }}>
                Cancelar
              </button>
              <button onClick={() => { setErro(null); enviar.mutate(); }}
                disabled={!declaro || !cpf || !nascimento || enviar.isPending}
                className="px-3.5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5"
                style={{ background: '#2563eb' }}>
                {enviar.isPending ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
                Confirmar a retirada
              </button>
            </div>
          </div>
        </div>, document.body)}
    </>
  );
}

function Card({ Icon, titulo, children, semPadding }) {
  return (
    <div style={CARD}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-white px-4 py-3"
        style={{ borderBottom: '1px solid rgba(96,165,250,0.2)' }}>
        <Icon size={16} style={{ color: '#60a5fa' }} /> {titulo}
      </h3>
      <div className={semPadding ? '' : 'p-4'}>{children}</div>
    </div>
  );
}

// Campo sem valor não vira linha vazia — some.
function Linha({ rotulo, valor }) {
  if (!valor) return null;
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span style={{ color: 'rgba(147,197,253,0.75)' }}>{rotulo}:</span>
      <span className="text-right min-w-0 truncate text-white">{valor}</span>
    </div>
  );
}

function Opcao({ Icon, titulo, texto, cor, onClick }) {
  return (
    <button onClick={onClick} className="w-full rounded-xl p-4 text-left flex items-start gap-3"
      style={{ border: `1px solid ${cor}55`, background: `${cor}14` }}>
      <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${cor}25` }}>
        <Icon size={17} style={{ color: cor }} />
      </span>
      <span className="min-w-0">
        <span className="block font-semibold text-white">{titulo}</span>
        <span className="block text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.6)' }}>{texto}</span>
      </span>
    </button>
  );
}

// ── O OLHO ───────────────────────────────────────────────────

// ── O AVISO DE NOVIDADE, POR PRODUTO ─────────────────────────
//
// Cada item guarda o MARCO em que o cliente o viu pela última vez. Marco
// é a etapa onde aquele copo está — e "onde ele está" não é o status do
// pedido: um pedido em "aguardando borda" não move a caneca preto fosco,
// que não tem borda. Por isso o marco do item sem borda continua sendo a
// última etapa que ELE concluiu, e o olho dele não pisca à toa.
//
// Sem etapa marcada como atual (o pedido está numa fase que este produto
// não percorre), vale a última concluída. Sem nenhuma concluída, vale a
// primeira da régua — pedido recém-criado também é novidade.
const CHAVE_VISTOS = pedidoId => `lyon-etapas-vistas:${pedidoId}`;

/** Identidade do item dentro do pedido. O código é estável; o índice é o socorro. */
const chaveDoItem = (item, idx) => `${item?.codigo || 'item'}#${idx}`;

function marcoDoItem(item) {
  const linha = item?.linha_do_tempo || [];
  const atual = linha.find(e => e.estado === 'atual');
  if (atual) return atual.key;
  const feitos = linha.filter(e => e.estado === 'concluido');
  if (feitos.length) return feitos[feitos.length - 1].key;
  return linha[0]?.key || null;
}

/**
 * O OLHO QUE AVISA QUE ALGO ANDOU.
 *
 * Ele fica quieto enquanto não há nada novo — ícone parado é o estado
 * normal de quem não tem recado. Quando o produto muda de etapa, ele
 * pulsa, ganha um ponto de "nova atualização" e, a cada três pulsos,
 * diz em uma frase o que fazer.
 *
 * Para no clique porque o recado foi dado. E volta na próxima mudança:
 * é isso que o separa de um enfeite que pisca para sempre até o cliente
 * aprender a não olhar.
 */
function OlhoEtapas({ novidade, onClick }) {
  // Sem estado próprio: o `dica`/`setDica` e o intervalo que moravam
  // aqui existiam só para o balão flutuante, que foi removido. O piscar
  // vem de `novidade`, calculado pela tela.

  return (
    <div className="relative flex items-center justify-center">
      <style>{`
        @keyframes lyonPiscaOlho {
          0%, 45%, 100% { opacity: 1; transform: scale(1); }
          55%, 70%      { opacity: .25; transform: scale(.86); }
        }
      `}</style>

      {/* O BALÃO FLUTUANTE SAIU.
          Ele era `absolute` com `whitespace-nowrap` e nascia na PRIMEIRA
          coluna da tabela: a frase inteira ("Clique aqui para acompanhar
          o status deste produto") vazava para fora do card e passava por
          cima do cabeçalho, cortada na borda. E aparecia em TODAS as
          linhas ao mesmo tempo, piscando de três em três segundos.

          A informação não se perdeu: o botão tem `title`, e a legenda
          embaixo da linha do tempo já diz "clique no olho ao lado de
          cada produto para ver as etapas dele" — dita uma vez, no lugar
          certo, em vez de repetida sobre a tabela. O olho continua
          piscando quando há novidade, que é o que chama a atenção. */}
      <button onClick={onClick}
        title={novidade ? 'Nova atualização — clique para acompanhar este produto' : 'Ver as etapas deste produto'}
        aria-label={novidade ? 'Nova atualização neste produto' : 'Ver as etapas deste produto'}
        className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{
          background: novidade ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${novidade ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.12)'}`,
          color: novidade ? '#22d3ee' : 'rgba(255,255,255,0.65)',
          animation: novidade ? 'lyonPiscaOlho 1s ease-in-out infinite' : 'none',
        }}>
        <Eye size={15} />
        {/* O ponto é o recado que sobrevive ao pulso: quem chega na tela
            no intervalo entre duas pulsações ainda vê que há algo novo. */}
        {novidade && (
          <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
            style={{ background: '#22d3ee', boxShadow: '0 0 8px rgba(34,211,238,0.9)' }} />
        )}
      </button>
    </div>
  );
}

/** As etapas de UM produto — mesmo andamento do pedido, só o caminho dele. */
function EtapasDoItem({ item, onClose }) {
  const linha = item.linha_do_tempo || [];
  const atual = linha.find(e => e.estado === 'atual');
  const [vendoArte, setVendoArte] = useState(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,18,0.8)' }} onClick={onClose}>
      <div className="w-full max-w-4xl max-h-[86vh] overflow-y-auto rounded-2xl p-5 sm:p-6"
        onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0b1024 0%, #080d1e 100%)',
          border: '1px solid rgba(34,211,238,0.35)',
          boxShadow: '0 0 30px rgba(34,211,238,0.15)',
        }}>

        <div className="flex items-start justify-between gap-3 mb-1">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider" style={{ color: '#60a5fa' }}>
              Etapas deste produto
            </p>
            <h2 className="text-lg font-bold text-white leading-tight">{item.produto}</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.55)' }}>
              {[item.codigo, item.capacidade, item.categoria].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg shrink-0"
            style={{ color: 'rgba(255,255,255,0.6)' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {/* QUAL PRODUTO, QUANTOS E QUANTO.
            A janela dizia só o nome e a capacidade. Num pedido de cinco
            linhas, o cliente que abre o olho da terceira precisa saber
            QUE compra é essa antes de ler etapa nenhuma — e "100 un." e
            "R$ 690,00" são o que fazem ele reconhecer o item. As
            características contratadas (cor do copo, cor da gravação)
            vêm junto pelo mesmo motivo: é o que diferencia duas linhas
            do mesmo copo em cores diferentes. */}
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { r: 'Quantidade', v: `${item.quantidade} un.` },
            { r: 'Valor unitário', v: brl(item.valor_unitario) },
            { r: 'Valor total', v: brl(item.valor_total), destaque: true },
            ...(item.linha ? [{ r: 'Linha da tinta', v: item.linha }] : []),
          ].map(c => (
            <div key={c.r} className="rounded-xl px-3 py-2"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(96,165,250,0.22)' }}>
              <p className="text-[10.5px] uppercase tracking-wide" style={{ color: 'rgba(147,197,253,0.75)' }}>{c.r}</p>
              <p className="font-bold" style={{ color: c.destaque ? '#22d3ee' : '#fff' }}>{c.v}</p>
            </div>
          ))}
        </div>

        {(item.campos || []).length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-[12.5px]">
            {item.campos.map(c => (
              <span key={c.rotulo} style={{ color: 'rgba(255,255,255,0.6)' }}>
                {c.rotulo}: <b className="text-white">{c.valor}</b>
              </span>
            ))}
          </div>
        )}

        {atual ? (
          <p className="text-sm mt-3 mb-4" style={{ color: '#fbbf24' }}>
            Este produto está em: <b>{atual.label}</b>
          </p>
        ) : (
          /* SEM ETAPA ATUAL NÃO É ERRO — é o pedido misto funcionando.
             O copo liso não passa por vegetal nem revelação: enquanto o
             pedido está numa dessas, ele não está em etapa nenhuma. Sem
             esta frase a janela abria sem dizer nada, e "nada" se lê
             como parado ou esquecido. */
          <p className="text-sm mt-3 mb-4" style={{ color: 'rgba(147,197,253,0.85)' }}>
            Este produto já cumpriu as etapas dele até aqui e está aguardando os demais itens do
            pedido, que passam por etapas que ele não tem.
          </p>
        )}

        {/* O QUE ESTE PRODUTO ESPERA DE VOCÊ. A janela mostrava a arte
            anexada, mas não dizia se ela ainda precisava do sim do
            cliente — e é justamente aqui, com o desenho na frente, que
            essa resposta é fácil de dar. */}
        {item.arte_estado === 'aguardando_cliente' && (
          <p className="text-[12.5px] mb-3 rounded-xl px-3.5 py-2.5 flex gap-2"
            style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d',
                     border: '1px solid rgba(245,158,11,0.35)' }}>
            <Eye size={15} className="shrink-0 mt-0.5" />
            <span>Esta arte foi preparada pela loja e está esperando você confirmar. Feche esta janela e
              use os botões <b>Confirmar a arte</b> / <b>Reprovar</b> no bloco “Sua personalização”.</span>
          </p>
        )}
        {item.arte_estado === 'aprovada' && item.arte_anexada && (
          <p className="text-[12.5px] mb-3 flex items-center gap-2" style={{ color: '#4ade80' }}>
            <Lock size={14} /> Arte confirmada{item.arte_aprovada_em ? ` em ${dataHora(item.arte_aprovada_em)}` : ''} —
            a personalização começou e a troca passa a ser com um atendente.
          </p>
        )}

        {/* A ARTE DESTE PRODUTO, E DE MAIS NENHUM.
            Num pedido de dois itens com dois desenhos, "sua arte foi
            recebida" não diz QUAL foi recebida. Aqui a cliente vê a
            imagem do item que ela abriu — e é assim que ela descobre
            que subiu o arquivo trocado enquanto ainda dá para trocar. */}
        {item.arte_anexada && (
          <div className="mb-4 rounded-xl overflow-hidden"
            style={{ border: '1px solid rgba(74,222,128,0.35)', background: 'rgba(34,197,94,0.07)' }}>
            <div className="flex items-center justify-between gap-3 px-3.5 py-2.5">
              <p className="text-[12.5px] flex items-center gap-1.5" style={{ color: '#4ade80' }}>
                <FileImage size={13} />
                Arte deste produto{item.arte_anexada_em ? ` · enviada em ${dataHora(item.arte_anexada_em)}` : ''}
              </p>
              <button type="button" onClick={() => setVendoArte(true)}
                className="text-[12px] shrink-0" style={{ color: '#93c5fd' }}>ver ampliada</button>
            </div>
            {/* PDF, .ai e .cdr não viram <img>. Só a imagem é
                pré-visualizada; o resto abre no visualizador, que sabe
                oferecer o download em vez de mostrar um quadrado
                quebrado. */}
            {/\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(item.arte_anexada) && (
              <button type="button" onClick={() => setVendoArte(true)} className="block w-full"
                title="Clique para ver a arte ampliada" style={{ cursor: 'zoom-in' }}>
                <img src={item.arte_anexada} alt={`Arte de ${item.produto}`}
                  className="w-full max-h-64 object-contain"
                  style={{ background: 'rgba(255,255,255,0.04)' }} />
              </button>
            )}
          </div>
        )}

        <VisualizarArteModal
          url={vendoArte ? item.arte_anexada : null}
          titulo={`Arte de ${item.produto}`}
          nomeArquivo={`arte-${item.codigo || item.produto}`}
          onClose={() => setVendoArte(false)} />

        <div className="space-y-4">
          {blocosPorModulo(linha).map(b => (
            <div key={b.modulo || 'x'}>
              <p className="text-[10px] uppercase tracking-wider font-semibold mb-2" style={{ color: 'rgba(255,255,255,0.45)' }}>
                {b.label}
              </p>
              <div className="flex flex-wrap gap-x-2 gap-y-5">
                {b.passos.map(passo => <Balao key={passo.key} passo={passo} />)}
              </div>
            </div>
          ))}
        </div>

        <p className="text-[11px] mt-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          Os números são os mesmos em todo pedido. Etapa riscada não se aplica a este produto: arte,
          vegetal e revelação só existem em produto personalizado — o copo liso vai do estoque para a
          produção sem passar por elas; a pintura só em degradê, bicolor ou jateado; a borda só em quem
          tem borda contratada.
        </p>
      </div>
    </div>
  );
}

// ── RETIRADA ─────────────────────────────────────────────────

/**
 * O BONECO QUE CHAMA.
 *
 * A pergunta "quem vai retirar?" só faz sentido no instante em que o
 * pedido fica pronto esperando alguém buscar — antes é ansiedade, e
 * depois é tarde. Como esse instante chega sozinho, sem ninguém avisar,
 * ele precisa se anunciar: o boneco acena até alguém responder.
 *
 * Depois de informado, ele para de acenar e vira só o registro do que
 * ficou combinado. Convite atendido que continua chamando vira barulho.
 */
function ChamadoRetirada({ retirada, onAbrir }) {
  const jaTem = !!retirada.autorizado;
  if (!retirada.pedir_agora && !jaTem) return null;

  return (
    <div className="rounded-2xl p-4 sm:p-5"
      style={{
        background: jaTem ? 'rgba(34,197,94,0.07)' : 'rgba(251,191,36,0.08)',
        border: `1px solid ${jaTem ? 'rgba(74,222,128,0.35)' : 'rgba(251,191,36,0.45)'}`,
      }}>
      <style>{`
        @keyframes lyonAcena {
          0%, 60%, 100% { transform: rotate(0deg); }
          70%           { transform: rotate(-22deg); }
          80%           { transform: rotate(14deg); }
          90%           { transform: rotate(-14deg); }
        }
        @keyframes lyonPula {
          0%, 100% { transform: translateY(0); }
          50%      { transform: translateY(-4px); }
        }
      `}</style>

      <div className="flex flex-wrap items-center gap-4">
        <div className="relative shrink-0"
          style={{ animation: jaTem ? 'none' : 'lyonPula 1.6s ease-in-out infinite' }}>
          <PersonStanding size={44} style={{ color: jaTem ? '#4ade80' : '#fbbf24' }} />
          {!jaTem && (
            <span className="absolute -top-1 -right-2 text-2xl"
              style={{ animation: 'lyonAcena 1.8s ease-in-out infinite', transformOrigin: '50% 90%' }}>
              👋
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {jaTem ? (
            <>
              <p className="text-sm font-semibold" style={{ color: '#4ade80' }}>
                Retirada combinada com {retirada.autorizado.nome}
              </p>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.65)' }}>
                CPF {retirada.autorizado.cpf} · <b>é preciso apresentar documento com foto no ato da retirada.</b>
              </p>
              <p className="text-[11px] mt-1.5 flex items-start gap-1.5" style={{ color: 'rgba(255,255,255,0.5)' }}>
                <MessageCircle size={12} className="shrink-0 mt-0.5" />
                Se outra pessoa for buscar, mande a ela o código do pedido pelo WhatsApp: com o código
                ela assume a retirada no lugar de {String(retirada.autorizado.nome).split(' ')[0]}.
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-white">Seu pedido está pronto para retirada</p>
              <p className="text-[12px] mt-0.5" style={{ color: 'rgba(255,255,255,0.7)' }}>
                Precisamos saber quem vem buscar.
              </p>
            </>
          )}
        </div>

        <button onClick={onAbrir}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold shrink-0 transition-transform hover:-translate-y-0.5"
          style={jaTem
            ? { border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.8)', background: 'rgba(255,255,255,0.05)' }
            : { background: '#fbbf24', color: '#3b2900', boxShadow: '0 0 20px rgba(251,191,36,0.35)' }}>
          {jaTem ? 'Trocar quem vai retirar' : 'Clique aqui'}
        </button>
      </div>
    </div>
  );
}

/**
 * O formulário: nome, CPF e — quando é troca — o código do pedido.
 *
 * O código só é exigido para SUBSTITUIR quem já estava autorizado. Ele
 * é o segredo que só quem comprou tem: o titular manda pelo WhatsApp a
 * quem for buscar no lugar. Sem essa porta, o irmão que veio no lugar
 * de quem ficou doente voltaria de mãos vazias.
 */
function FormRetirada({ pedidoId, codigo, retirada, onClose, onSalvo }) {
  const jaTem = !!retirada.autorizado;
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [codigoPedido, setCodigoPedido] = useState('');

  const salvar = useMutation({
    mutationFn: () => api.post(`/acompanhar/pedido/${pedidoId}/retirada`, {
      nome, cpf, ...(jaTem ? { codigo: codigoPedido } : {}),
    }),
    onSuccess: onSalvo,
  });

  const mascara = v => String(v).replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');

  const pode = nome.trim().length >= 5
    && String(cpf).replace(/\D/g, '').length === 11
    && (!jaTem || codigoPedido.trim().length >= 3);

  const campo = {
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.15)',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,18,0.8)' }} onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl p-5 sm:p-6" onClick={e => e.stopPropagation()}
        style={{
          background: 'linear-gradient(180deg, #0b1024 0%, #080d1e 100%)',
          border: '1px solid rgba(251,191,36,0.4)',
          boxShadow: '0 0 30px rgba(251,191,36,0.18)',
        }}>

        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Quem vai retirar o pedido?</h2>
            <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
              Por gentileza, informe o nome e o CPF de quem irá retirar.
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg shrink-0"
            style={{ color: 'rgba(255,255,255,0.6)' }} aria-label="Fechar"><X size={18} /></button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>Nome completo</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm text-white" value={nome}
              placeholder="Nome e sobrenome" onChange={e => setNome(e.target.value)} style={campo} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>CPF</label>
            <input className="w-full rounded-xl px-3 py-2.5 text-sm text-white" value={cpf}
              inputMode="numeric" placeholder="000.000.000-00"
              onChange={e => setCpf(mascara(e.target.value))} style={campo} />
          </div>

          {jaTem && (
            <div>
              <label className="block text-xs mb-1" style={{ color: 'rgba(255,255,255,0.6)' }}>
                Código do pedido — peça ao titular da compra pelo WhatsApp
              </label>
              <input className="w-full rounded-xl px-3 py-2.5 text-sm text-white font-mono" value={codigoPedido}
                placeholder={codigo} onChange={e => setCodigoPedido(e.target.value)}
                style={{ ...campo, border: '1px solid rgba(251,191,36,0.35)' }} />
              <p className="text-[11px] mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>
                Isto substitui {retirada.autorizado.nome} como quem vai retirar.
              </p>
            </div>
          )}
        </div>

        <div className="flex gap-2.5 rounded-xl p-3 mt-4"
          style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.3)' }}>
          <IdCard size={18} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
          <p className="text-[12px]" style={{ color: 'rgba(255,255,255,0.8)' }}>
            No ato da retirada é preciso <b>apresentar documento com foto</b>. Se outra pessoa for
            buscar, ela retira apresentando o <b>código do pedido</b>, que você manda por WhatsApp.
          </p>
        </div>

        {salvar.isError && (
          <p className="text-[12px] mt-3" style={{ color: '#f87171' }}>
            {salvar.error?.error || 'Não foi possível registrar.'}
            {salvar.error?.dica ? <><br />{salvar.error.dica}</> : null}
          </p>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-sm"
            style={{ border: '1px solid rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.75)' }}>
            Cancelar
          </button>
          <button onClick={() => salvar.mutate()} disabled={!pode || salvar.isPending}
            className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40"
            style={{ background: '#fbbf24', color: '#3b2900' }}>
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}
