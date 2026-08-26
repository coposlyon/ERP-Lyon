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
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  MessageSquare, Clock, User, FileText, DollarSign, CalendarDays, Package,
  Truck, Info, FolderOpen, Download, Sparkles, Headset, X, Loader2, Send,
  CircleCheck, Star, MapPin, Circle, Wallet, Hourglass, PenTool, FileImage,
  FileCheck, FlaskConical, Brush, CircleDashed, GlassWater, Settings,
  PackageOpen, ShieldQuestion, ShieldCheck, Camera, ImageUp, PackageSearch,
  PackageCheck, ShoppingCart, Eye, PersonStanding, IdCard, MessageCircle,
} from 'lucide-react';
import api from '@/lib/api';

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
};

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
  // O olho pisca até a primeira vez que alguém clica nele — e nunca mais.
  // Depois disso o cliente já sabe para que serve; continuar piscando
  // vira barulho.
  const [jaViu, setJaViu] = useState(() => {
    try { return localStorage.getItem('lyon-olho-etapas') === '1'; } catch { return false; }
  });

  function abrirEtapas(idx) {
    setItemAberto(idx);
    if (!jaViu) {
      setJaViu(true);
      try { localStorage.setItem('lyon-olho-etapas', '1'); } catch { /* navegador anônimo: pisca de novo amanhã */ }
    }
  }
  const token = sessionStorage.getItem('acompanhar_token');

  useEffect(() => { if (!token) navigate('/acompanhar', { replace: true }); }, [token, navigate]);

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
                      <OlhoEtapas piscando={!jaViu} onClick={() => abrirEtapas(idx)} />
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

        {/* ── Quem vai retirar ────────────────────────────────── */}
        {p.retirada && (
          <ChamadoRetirada retirada={p.retirada} onAbrir={() => setFormRetirada(true)} />
        )}

        {formRetirada && (
          <FormRetirada pedidoId={id} codigo={p.pedido.codigo} retirada={p.retirada}
            onClose={() => setFormRetirada(false)} onSalvo={() => { setFormRetirada(false); refetch(); }} />
        )}

        {/* ── Linha do tempo ──────────────────────────────────── */}
        <Card Icon={Clock} titulo="Linha do Tempo do Pedido">
          {etapaAtual && (
            <p className="text-sm mb-4" style={{ color: '#fbbf24' }}>
              Seu pedido está em: <b>{etapaAtual.label}</b>
            </p>
          )}
          <div className="flex flex-wrap gap-x-2 gap-y-5">
            {(p.linha_do_tempo || []).map(passo => <Balao key={passo.key} passo={passo} />)}
          </div>
          <p className="text-[11px] mt-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Nem todo pedido passa por todas as etapas — depende do produto e dos processos contratados.
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
                  onClick={() => alert('O download será liberado em breve.')}
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

function Balao({ passo }) {
  const Icon = ICONES[passo.icone] || Circle;
  const c = CORES[passo.estado];
  return (
    <div className="flex flex-col items-center gap-1 text-center" style={{ width: 92 }}
      title={`${passo.label}${passo.at ? ` — ${dataHora(passo.at)}` : ''}`}>
      <div className="relative">
        <div className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{ border: `2px solid ${c.anel}`, background: c.fundo,
                   boxShadow: passo.estado === 'atual' ? `0 0 14px ${c.anel}88` : 'none' }}>
          <Icon size={18} style={{ color: c.texto }} />
        </div>
        <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: c.anel, color: '#0b1020' }}>{passo.ordem ?? passo.passo}</span>
      </div>
      <span className="text-[10px] leading-tight" style={{ color: c.texto }}>{passo.label}</span>
      {passo.at && (
        <span className="text-[9px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
          {new Date(passo.at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
        </span>
      )}
    </div>
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

/**
 * O CONVITE QUE SE APAGA SOZINHO.
 *
 * Um ícone parado ao lado do produto não é descoberto: ninguém clica no
 * que não pediu para ser clicado. Então ele pisca — e a cada três
 * piscadas diz, em uma frase, para que serve.
 *
 * E para de piscar no primeiro clique, para sempre. Aviso que continua
 * piscando depois de entendido deixa de ser convite e vira barulho: o
 * cliente aprende a ignorar, e da próxima vez que algo realmente piscar
 * ele também não vai olhar.
 */
function OlhoEtapas({ piscando, onClick }) {
  const [dica, setDica] = useState(false);

  useEffect(() => {
    if (!piscando) { setDica(false); return; }
    let n = 0;
    let sumir = null;
    const t = setInterval(() => {
      n += 1;
      if (n % 3 === 0) {
        setDica(true);
        sumir = setTimeout(() => setDica(false), 2400);
      }
    }, 1000);
    return () => { clearInterval(t); clearTimeout(sumir); };
  }, [piscando]);

  return (
    <div className="relative flex items-center justify-center">
      <style>{`
        @keyframes lyonPiscaOlho {
          0%, 45%, 100% { opacity: 1; transform: scale(1); }
          55%, 70%      { opacity: .25; transform: scale(.86); }
        }
      `}</style>

      {dica && (
        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-2.5 py-1.5 rounded-lg text-[11px] font-medium z-20"
          style={{
            background: 'rgba(34,211,238,0.15)', color: '#67e8f9',
            border: '1px solid rgba(34,211,238,0.45)', boxShadow: '0 0 18px rgba(34,211,238,0.25)',
          }}>
          Clique aqui para ver o status deste produto
        </span>
      )}

      <button onClick={onClick} title="Ver as etapas deste produto"
        aria-label="Ver as etapas deste produto"
        className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
        style={{
          background: piscando ? 'rgba(34,211,238,0.15)' : 'rgba(255,255,255,0.05)',
          border: `1px solid ${piscando ? 'rgba(34,211,238,0.5)' : 'rgba(255,255,255,0.12)'}`,
          color: piscando ? '#22d3ee' : 'rgba(255,255,255,0.65)',
          animation: piscando ? 'lyonPiscaOlho 1s ease-in-out infinite' : 'none',
        }}>
        <Eye size={15} />
      </button>
    </div>
  );
}

/** As etapas de UM produto — mesmo andamento do pedido, só o caminho dele. */
function EtapasDoItem({ item, onClose }) {
  const linha = item.linha_do_tempo || [];
  const atual = linha.find(e => e.estado === 'atual');

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
              {[item.capacidade, item.categoria, `${item.quantidade} un.`].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg shrink-0"
            style={{ color: 'rgba(255,255,255,0.6)' }} aria-label="Fechar">
            <X size={18} />
          </button>
        </div>

        {atual && (
          <p className="text-sm mt-3 mb-4" style={{ color: '#fbbf24' }}>
            Este produto está em: <b>{atual.label}</b>
          </p>
        )}

        <div className="flex flex-wrap gap-x-2 gap-y-5">
          {linha.map(passo => <Balao key={passo.key} passo={passo} />)}
        </div>

        <p className="text-[11px] mt-5" style={{ color: 'rgba(255,255,255,0.4)' }}>
          As etapas mudam de produto para produto: pintura só aparece em degradê, bicolor ou jateado,
          e a aplicação de borda só em quem tem borda contratada.
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
