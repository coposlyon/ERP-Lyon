// ============================================================
// TELA 2 — Detalhes do Pedido
//
// A tela que responde "em que pé está este pedido" sem ninguém precisar
// ligar para a produção. Três blocos de leitura no topo (cliente, dados,
// valores), os itens com o que foi contratado em cada um, e a linha do
// tempo com o caminho inteiro — o que já passou, onde está agora e o
// que falta.
//
// UMA INFORMAÇÃO, UM LUGAR. As informações da entrega aparecem só no
// card de baixo; compartilhar com o cliente é só o botão do topo; os
// documentos só na lateral. Atalho repetido não é conveniência — é a
// garantia de que um dia os dois vão discordar.
//
// O que NÃO aparece: custo, margem, rateio e taxa administrativa. Não é
// só a tela que esconde — a rota /area-vendedor/pedidos/:id nem
// consulta esses campos.
// ============================================================
import { useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ArrowLeft, Share2, User, FileText, DollarSign, CalendarDays, Package, Clock,
  Truck, Info, Plus, Eye, Download, UploadCloud, PenLine, CircleCheck, Star,
  Circle, Wallet, PenTool, FileImage, FlaskConical, Brush, CircleDashed,
  Settings, PackageOpen, ShieldCheck, Camera, PackageCheck, History, ExternalLink,
  Loader2,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useVend, fmtBRL, fmtUn, fmtDate } from './ui';
import { corStatus } from '@/lib/pedidoUi';
import LogoOrigem from '@/components/UI/LogoOrigem';
import SubstituirArteModal from '@/components/UI/SubstituirArteModal';

/**
 * Os ícones da linha do tempo, um a um.
 *
 * Nomeados de propósito, e não com `import * as Icons`: aquilo derruba o
 * tree-shaking e arrasta a biblioteca inteira do lucide para dentro do
 * chunk desta tela (715 kB contra 40). Ícone novo no fluxo entra aqui e
 * no catálogo do backend (lib/atencao.js).
 */
const ICONES = {
  CircleCheck, Wallet, Package, PenTool, FileImage, FlaskConical, Brush,
  CircleDashed, Settings, PackageOpen, ShieldCheck, Camera, Truck, PackageCheck,
};

// Os mesmos rótulos do módulo de Vendas: 'pix' na tela é código vazando.
const PAGAMENTO = {
  cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão de débito',
  card_credit: 'Cartão de crédito', transfer: 'Transferência',
  check: 'Cheque', a_prazo: 'A prazo', boleto: 'Boleto',
};

const dataHora = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—';
const horaCurta = iso => iso
  ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
  : '';

export default function PedidoDetalhe() {
  const v = useVend();
  const { id } = useParams();
  const navigate = useNavigate();
  const { isManager } = useAuth();
  const { pathname } = useLocation();

  /**
   * A MESMA TELA ATENDE DOIS CAMINHOS: /sales/:id/detalhe, do
   * Administrativo, e /vendedor/pedidos/:id, da carteira do vendedor.
   * Duas telas para "onde está este pedido" seriam duas para discordar
   * no dia em que a produção mudar de etapa.
   *
   * O que muda é só para onde os botões levam de volta — e o histórico
   * do cliente, que no ERP é a ficha completa e na área do vendedor é a
   * lista de pedidos dele, porque a ficha é de outro módulo e o vendedor
   * não tem permissão: o botão bateria numa porta fechada.
   */
  const noErp = pathname.startsWith('/sales');
  const voltarPara = noErp ? '/sales' : '/vendedor/pedidos';
  // Montado a partir do id, e NÃO colando '/documento' no fim do
  // endereço atual: no ERP a tela mora em /sales/:id/detalhe, e colar no
  // fim gerava /sales/:id/detalhe/documento — rota que não existe, e o
  // curinga mandava quem clicou para o Dashboard.
  const documentoEm = noErp ? `/sales/${id}/documento` : `/vendedor/pedidos/${id}/documento`;
  const [verHistorico, setVerHistorico] = useState(false);
  const [enviando, setEnviando] = useState(null);   // 'arte' | 'comprovante'
  const [trocarArte, setTrocarArte] = useState(null); // pedido cuja arte se quer substituir
  const qc = useQueryClient();
  const inputArte = useRef(null);
  const inputComprovante = useRef(null);

  // Quem cadastra aviso é o Administrativo. O vendedor consulta — esses
  // avisos são regra comercial da empresa, não recado de pedido.
  const podeEditarAvisos = isManager;

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['pedido-vendedor', id],
    queryFn: () => api.get(`/area-vendedor/pedidos/${id}`),
  });

  /**
   * Sobe um anexo do pedido — arte ou comprovante.
   *
   * Anexar NÃO aprova: o pedido continua onde estava até que quem
   * aprova aprove. Um arquivo subir não quer dizer que a arte está
   * certa, e mover o status sozinho faria a produção começar em cima de
   * um PDF que ninguém conferiu.
   */
  /** Pede o link assinado e abre. */
  async function abrirComprovante() {
    try {
      const r = await api.get(`/area-vendedor/pedidos/${id}/comprovante`);
      window.open(r.url, '_blank', 'noopener');
    } catch (err) {
      toast.error(err.error || 'Não foi possível abrir o comprovante');
    }
  }

  async function anexar(tipo, arquivo, autorizacao = null) {
    if (!arquivo) return;
    // 8 MB é o limite do que faz sentido trafegar em base64. Acima disso
    // o navegador trava montando a string, e o erro sairia como "falhou"
    // sem dizer por quê.
    if (arquivo.size > 8 * 1024 * 1024) {
      return toast.error('Arquivo muito grande. O limite é 8 MB.');
    }
    setEnviando(tipo);
    try {
      const dados = await new Promise((ok, erro) => {
        const r = new FileReader();
        r.onload = () => ok(r.result);
        r.onerror = () => erro(new Error('Não consegui ler o arquivo'));
        r.readAsDataURL(arquivo);
      });
      const r = await api.post(`/area-vendedor/pedidos/${id}/anexar`, {
        tipo, arquivo: dados,
        // Só viajam quando é substituição; o servidor é que decide se
        // vai exigi-las — a tela não é a dona da regra.
        ...(autorizacao ? { autorizador_email: autorizacao.email, autorizador_senha: autorizacao.senha } : {}),
      });
      toast.success(r.substituiu
        ? 'Arte substituída — a troca ficou no histórico com quem autorizou'
        : r.avancou
          ? 'Arte anexada — o pedido seguiu para Aguardando impressão de vegetal'
          : `${tipo === 'arte' ? 'Arte anexada' : 'Comprovante anexado'}`);
      setTrocarArte(null);
      qc.invalidateQueries({ queryKey: ['pedido-vendedor', id] });
    } catch (err) {
      toast.error(err.error || 'Não foi possível anexar');
    } finally {
      setEnviando(null);
    }
  }

  /**
   * Manda o link de acompanhamento para o cliente.
   *
   * O link não carrega o pedido dentro dele: o cliente entra com o CPF
   * dele mais o número do pedido. Assim, link encaminhado para o grupo
   * da família não abre a compra de ninguém — quem não tem o CPF do
   * titular não passa da porta.
   */
  async function compartilhar(pedido, cliente) {
    const link = `${window.location.origin}/acompanhar`;
    const texto = [
      `Olá${cliente?.name ? `, ${cliente.name}` : ''}! Aqui é da Lyon Copos.`,
      '',
      `Acompanhe seu pedido ${pedido.codigo} em tempo real:`,
      link,
      '',
      `Entre com o seu CPF e o número do pedido (${pedido.codigo}).`,
    ].join('\n');

    const fone = String(cliente?.mobile || cliente?.phone || '').replace(/\D/g, '');
    if (fone) {
      const num = fone.length <= 11 ? `55${fone}` : fone;
      window.open(`https://wa.me/${num}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener');
      return;
    }
    // Cliente sem telefone: pelo menos o texto vai para a área de transferência
    try {
      await navigator.clipboard.writeText(texto);
      toast.success('Cliente sem telefone cadastrado — mensagem copiada para você enviar');
    } catch {
      toast.error('Cliente sem telefone cadastrado. Cadastre o número para enviar pelo WhatsApp.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...v.card, padding: '2rem' }} className="text-center">
        <p style={{ color: v.textPrimary }}>{error.error || 'Não foi possível abrir este pedido'}</p>
        <button onClick={() => navigate(-1)} className="btn-secondary mt-4 mx-auto">
          <ArrowLeft size={14} /> Voltar
        </button>
      </div>
    );
  }

  const cli = p.CLIENTES || {};
  const itens = p.itens || [];
  const aguardandoArte = p.status === 'aguardando_arte';

  /**
   * AS COLUNAS DO MEIO SÃO DO PEDIDO, NÃO DA TELA.
   *
   * Um copo tradicional tem uma cor; um degradê tem cor de base e cor de
   * boca; um jateado tem a cor do jateado. Colunas fixas obrigavam a
   * mostrar "Cor da boca: —" num tradicional — ruído que faz quem lê
   * achar que faltou combinar alguma coisa. Aqui a tabela abre só as
   * colunas que ALGUM item deste pedido usa, na ordem em que aparecem.
   *
   * "Cor da borda" fica de fora porque já é a coluna Acessório: duas
   * colunas com o mesmo dado é duas colunas para discordarem um dia.
   */
  const colunasItem = (() => {
    const achadas = [];
    for (const item of itens) {
      for (const campo of item.campos || []) {
        if (campo.rotulo === 'Cor da borda') continue;
        if (!achadas.includes(campo.rotulo)) achadas.push(campo.rotulo);
      }
    }
    // A ordem é a do copo, não a de quem chegou primeiro: cor do produto
    // antes da cor da personalização. Num pedido com um tradicional e um
    // degradê, ordenar por ordem de aparição jogava "Cor do produto"
    // para depois de "Cor da personalização" — lia-se de trás para a
    // frente. Campo desconhecido entra no meio, na ordem em que apareceu.
    const ORDEM = ['Cor do produto', 'Cor base', 'Cor da boca', 'Cor do jateado'];
    const peso = r => {
      const i = ORDEM.indexOf(r);
      if (i >= 0) return i;
      return r === 'Cor da personalização' ? 999 : 100 + achadas.indexOf(r);
    };
    return [...achadas].sort((a, b) => peso(a) - peso(b));
  })();
  const valorDoCampo = (item, rotulo) =>
    (item.campos || []).find(c => c.rotulo === rotulo)?.valor || '—';

  // Pedido atrasado pinta de vermelho a fase em que ele está parado.
  const atrasado = p.atencao?.level === 'critico';

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 text-sm" style={{ color: v.textSubtle }}>
        <button onClick={() => navigate(voltarPara)} className="hover:underline">Pedido de Venda</button>
        <span>›</span>
        <span style={{ color: v.textPrimary }}>Detalhes do Pedido</span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Pedido de Venda</h1>
          <span className="text-2xl font-bold" style={{ color: '#22d3ee' }}>{p.codigo}</span>
          <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ border: `1px solid ${corStatus(p.status_cor)}66`, color: corStatus(p.status_cor) }}>
            <CircleCheck size={15} /> {p.status_label}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => navigate(voltarPara)} className="btn-secondary">
            <ArrowLeft size={15} /> Voltar
          </button>
          <button onClick={() => compartilhar(p, cli)}
            className="btn" style={{ background: '#16a34a', color: 'white' }}>
            <Share2 size={15} /> Compartilhar com o Cliente
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,1fr)] gap-4 items-start">

        {/* ── Coluna principal ────────────────────────────────── */}
        <div className="space-y-4">

          {/* Cliente / Dados / Valores */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Bloco v={v} Icon={User} titulo="Cliente">
              <Campo v={v} rotulo="Nome" valor={
                <span className="flex items-center gap-1.5 flex-wrap justify-end">
                  {cli.name || 'Consumidor final'}
                  {cli.rating >= 4 && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(59,130,246,0.2)', color: '#93c5fd' }}>
                      <Star size={9} /> Cliente Verificado
                    </span>
                  )}
                </span>
              } />
              <Campo v={v} rotulo="Código"   valor={p.codigo_cliente || '—'} mono />
              <Campo v={v} rotulo="CNPJ"     valor={cli.cpf_cnpj || '—'} />
              <Campo v={v} rotulo="Telefone" valor={cli.mobile || cli.phone || '—'} />
              <Campo v={v} rotulo="E-mail"   valor={cli.email || '—'} />
              <Campo v={v} rotulo="Cidade"   valor={cli.address?.city ? `${cli.address.city}/${cli.address.state || ''}` : '—'} />
            </Bloco>

            <Bloco v={v} Icon={FileText} titulo="Dados do Pedido">
              <Campo v={v} rotulo="Número"         valor={p.codigo} />
              <Campo v={v} rotulo="Data do Pedido" valor={dataHora(p.operation_date ? `${p.operation_date}T12:00:00` : p.created_at)} />
              <Campo v={v} rotulo="Data do Evento" valor={p.event_date ? fmtDate(p.event_date) : '—'} />
              <Campo v={v} rotulo="Vendedor"       valor={p.vendedor || '—'} />
              <Campo v={v} rotulo="Origem" valor={
                p.origin
                  ? <LogoOrigem origem={p.origin} size={18} nome />
                  : <span style={{ color: v.textSubtle }}>não informada</span>
              } />
              {/* Estava na aba "Forma de Pagamento" do acordeão antigo e
                  não existia aqui. Trocar de tela não pode custar um dado. */}
              <Campo v={v} rotulo="Pagamento" valor={PAGAMENTO[p.payment_method] || p.payment_method || '—'} />
              <Campo v={v} rotulo="Transportadora" valor={p.transportadora || '—'} />
              <Campo v={v} rotulo="Cotação"        valor={p.freight_quote || '—'} mono />
            </Bloco>

            <Bloco v={v} Icon={DollarSign} titulo="Valores">
              <Campo v={v} rotulo="Valor dos Produtos" valor={fmtBRL(p.subtotal)} />
              <Campo v={v} rotulo="Frete"              valor={fmtBRL(p.freight)} />
              {Number(p.discount) > 0 && <Campo v={v} rotulo="Desconto" valor={`− ${fmtBRL(p.discount)}`} />}
              <div className="mt-3 pt-3 text-center" style={{ borderTop: `1px solid ${v.divider}` }}>
                <p className="text-xs" style={{ color: '#22d3ee' }}>Valor Total</p>
                <p className="text-3xl font-bold" style={{ color: '#22d3ee' }}>{fmtBRL(p.total)}</p>
              </div>
            </Bloco>
          </div>

          {/* Itens */}
          <div style={v.card}>
            <div className="flex items-center justify-between gap-2 px-4 py-3"
              style={{ borderBottom: `1px solid ${v.divider}` }}>
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: v.textPrimary }}>
                <Package size={16} style={{ color: '#60a5fa' }} /> Itens do Pedido
              </h2>
              <span className="text-xs" style={{ color: v.textMuted }}>Total de Itens: {itens.length}</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm" style={{ minWidth: 760 + colunasItem.length * 120 }}>
                <thead>
                  <tr style={{ color: v.textMuted }}>
                    {['Cód. Produto', 'Produto', 'Linha', 'Categoria', ...colunasItem, 'Acessório', 'Qtd', 'Valor Unit.', 'Valor Total']
                      .map((h, i, todas) => (
                        <th key={h} className={`px-3 py-2.5 text-[11px] font-semibold whitespace-nowrap ${i >= todas.length - 3 ? 'text-right' : 'text-left'}`}
                          style={{ borderBottom: `1px solid ${v.divider}` }}>{h}</th>
                      ))}
                  </tr>
                </thead>
                <tbody>
                  {itens.length === 0 ? (
                    <tr>
                      <td colSpan={7 + colunasItem.length} className="text-center py-8" style={{ color: v.empty }}>
                        Sem itens
                      </td>
                    </tr>
                  ) : itens.map(i => (
                    <tr key={i.id} style={{ borderBottom: `1px solid ${v.divider}` }}>
                      <td className="px-3 py-2.5 font-mono" style={{ color: v.textPrimary }}>{i.codigo || '—'}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textPrimary }}>{i.produto}</td>
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>{i.linha || '—'}</td>
                      <td className="px-3 py-2.5">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                          style={{ background: 'rgba(96,165,250,0.16)', color: '#93c5fd' }}>
                          {i.categoria}
                        </span>
                      </td>
                      {colunasItem.map(rotulo => (
                        <td key={rotulo} className="px-3 py-2.5" style={{ color: v.textMuted }}>
                          {valorDoCampo(i, rotulo)}
                        </td>
                      ))}
                      <td className="px-3 py-2.5" style={{ color: v.textMuted }}>{i.acessorio || '—'}</td>
                      <td className="px-3 py-2.5 text-right" style={{ color: v.textPrimary }}>{fmtUn(i.quantidade)}</td>
                      <td className="px-3 py-2.5 text-right" style={{ color: v.textMuted }}>{fmtBRL(i.valor_unitario)}</td>
                      <td className="px-3 py-2.5 text-right font-semibold" style={{ color: v.textPrimary }}>{fmtBRL(i.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Linha do tempo */}
          <div style={v.card}>
            <h2 className="text-sm font-semibold flex items-center gap-2 px-4 py-3"
              style={{ color: v.textPrimary, borderBottom: `1px solid ${v.divider}` }}>
              <Clock size={16} style={{ color: '#60a5fa' }} /> Linha do Tempo do Pedido
            </h2>
            <div className="p-4 flex flex-wrap gap-x-2 gap-y-5">
              {(p.linha_do_tempo || []).map(fase => (
                <Balao key={fase.key} v={v} fase={fase} atrasado={atrasado} />
              ))}
            </div>
            <p className="text-[11px] px-4 pb-3" style={{ color: v.textSubtle }}>
              Verde já aconteceu, amarelo está acontecendo agora, roxo ainda vem. Pintura e borda
              só aparecem quando o pedido passa por elas. Etapa sem data ainda não aconteceu.
            </p>
          </div>

          {/* Entrega + histórico */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Bloco v={v} Icon={Truck} titulo="Informações da Entrega">
              {/* Este texto existe UMA vez na tela. Repetir a mesma frase
                  no topo e aqui era o que fazia parecer que havia dois
                  endereços de entrega. */}
              <p className="text-sm leading-relaxed" style={{ color: v.textMuted }}>
                A entrega será realizada no endereço informado no cadastro, em horário
                comercial, das 8h às 18h, em dias úteis.
              </p>
              {cli.address?.street && (
                <p className="text-[12px] mt-2" style={{ color: v.textSubtle }}>
                  {cli.address.street}, {cli.address.number || 's/n'}
                  {cli.address.city ? ` — ${cli.address.city}/${cli.address.state || ''}` : ''}
                </p>
              )}
              {p.tracking_code && (
                <p className="text-sm mt-2 font-mono" style={{ color: '#60a5fa' }}>
                  Rastreio: {p.tracking_code}
                </p>
              )}
            </Bloco>

            <div style={v.card}>
              <h2 className="text-sm font-semibold flex items-center gap-2 px-4 py-3"
                style={{ color: v.textPrimary, borderBottom: `1px solid ${v.divider}` }}>
                <Clock size={16} style={{ color: '#60a5fa' }} /> Histórico da Linha do Tempo
              </h2>
              <div className="p-4 space-y-1.5">
                {(p.historico || []).length === 0 ? (
                  <p className="text-sm" style={{ color: v.empty }}>
                    Ainda sem movimentações registradas.
                  </p>
                ) : (verHistorico ? p.historico : p.historico.slice(-5)).map((h, i) => (
                  <div key={i} className="flex items-center gap-2 text-[13px]">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: corStatus(h.cor) }} />
                    <span className="shrink-0" style={{ color: v.textSubtle }}>{dataHora(h.at)}</span>
                    <span className="truncate" style={{ color: v.textPrimary }}>{h.label}</span>
                    {h.user && <span className="text-[11px] shrink-0" style={{ color: v.textSubtle }}>· {h.user}</span>}
                  </div>
                ))}
              </div>
              {(p.historico || []).length > 5 && (
                <div className="px-4 pb-3">
                  <button onClick={() => setVerHistorico(x => !x)} className="btn-secondary btn-sm">
                    <Eye size={13} /> {verHistorico ? 'Mostrar menos' : 'Visualizar por completo'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Coluna lateral ──────────────────────────────────── */}
        <div className="space-y-4">

          <Bloco v={v} Icon={CalendarDays} titulo="Prazos e Entrega">
            <div className="grid grid-cols-2 gap-2">
              <Prazo v={v} rotulo="Previsão de Saída"   valor={p.ship_date ? fmtDate(p.ship_date) : '—'} />
              <Prazo v={v} rotulo="Data de Coleta"      valor={p.collect_date ? fmtDate(p.collect_date) : '—'} />
              <Prazo v={v} rotulo="Previsão de Entrega" valor={p.delivery_date ? fmtDate(p.delivery_date) : '—'} />
              <Prazo v={v} rotulo="Dias Úteis de Transporte" Icon={Truck}
                valor={p.transport_days ? `${p.transport_days} dias` : '—'} />
            </div>
          </Bloco>

          {/* Arte */}
          {/* O QUE MANDA AQUI É O ARQUIVO, NÃO O STATUS.
              Este card perguntava ao status se havia arte — e um pedido
              com a arte anexada continuava escrito "Aguardando Anexo da
              Arte" enquanto ninguém lembrasse de avançar a etapa à mão.
              O arquivo existir é fato; o status é onde o pedido está. */}
          <Bloco v={v} Icon={PenLine} titulo="Arte">
            <div className="text-center py-1 px-2 rounded-lg text-sm font-medium mb-2"
              style={p.artwork_url
                ? { border: '1px solid rgba(74,222,128,0.5)', color: '#4ade80' }
                : aguardandoArte
                  ? { border: '1px solid rgba(250,204,21,0.5)', color: '#facc15' }
                  : { border: `1px solid ${v.divider}`, color: v.textMuted }}>
              {p.artwork_url ? 'Arte anexada' : aguardandoArte ? 'Aguardando Anexo da Arte' : 'Sem arte neste pedido'}
            </div>
            {aguardandoArte && !p.artwork_url && (
              <p className="text-[11px] text-center mb-3" style={{ color: v.textSubtle }}>
                Anexe o arquivo da arte para darmos continuidade.
              </p>
            )}
            <input ref={inputArte} type="file" className="hidden"
              accept="image/*,application/pdf,.ai,.cdr,.eps,.psd"
              onChange={e => { anexar('arte', e.target.files?.[0]); e.target.value = ''; }} />
            <button
              onClick={() => (p.artwork_url ? setTrocarArte(p) : inputArte.current?.click())}
              disabled={enviando === 'arte'}
              className="btn-secondary w-full mb-2 disabled:opacity-50">
              {enviando === 'arte'
                ? <><Loader2 size={15} className="animate-spin" /> Enviando…</>
                : <><UploadCloud size={15} /> {p.artwork_url ? 'Substituir Arte' : 'Anexar Arte'}</>}
            </button>
            {p.artwork_url ? (
              <a href={p.artwork_url} target="_blank" rel="noreferrer" className="btn-secondary w-full">
                <Eye size={15} /> Visualizar Arte
              </a>
            ) : (
              <button disabled className="btn-secondary w-full opacity-40 cursor-not-allowed">
                <Eye size={15} /> Visualizar Arte
              </button>
            )}
            {p.artwork_notes && (
              <p className="text-[11px] mt-2" style={{ color: v.textMuted }}>{p.artwork_notes}</p>
            )}
          </Bloco>

          {/* Resumo do Cliente — quem é este cliente, em seis números.
              O vendedor consulta; não edita. Tudo sai do histórico daquele
              código de cliente, calculado na hora: número copiado é número
              que envelhece. */}
          {p.resumo_cliente && (
            <Bloco v={v} Icon={History} titulo="Resumo do Cliente">
              <Campo v={v} rotulo="Total de compras"    valor={fmtUn(p.resumo_cliente.total_compras)} />
              <Campo v={v} rotulo="Pedidos entregues"   valor={fmtUn(p.resumo_cliente.entregues)} />
              <Campo v={v} rotulo="Pedidos em andamento" valor={fmtUn(p.resumo_cliente.em_andamento)} />
              <Campo v={v} rotulo="Última compra"       valor={p.resumo_cliente.ultima_compra ? fmtDate(p.resumo_cliente.ultima_compra) : '—'} />
              <Campo v={v} rotulo="Ticket médio"        valor={fmtBRL(p.resumo_cliente.ticket_medio)} />
              <Campo v={v} rotulo="Cliente desde"       valor={p.resumo_cliente.cliente_desde ? new Date(p.resumo_cliente.cliente_desde).getFullYear() : '—'} />

              {/* Vai para a própria lista de pedidos do vendedor, filtrada
                  por este cliente e com os finalizados ligados. NÃO vai
                  para a ficha do cliente do ERP: aquela tela é de outro
                  módulo e o vendedor não tem permissão — o botão só
                  bateria numa porta fechada. */}
              {(noErp ? cli.id : p.codigo_cliente) && (
                <button onClick={() => navigate(noErp
                  ? `/customers/${cli.id}`
                  : `/vendedor/pedidos?codigo=${p.codigo_cliente}&finalizados=1`)}
                  className="btn-secondary btn-sm w-full mt-3 justify-center">
                  <Eye size={13} /> Ver histórico completo <ExternalLink size={11} />
                </button>
              )}
            </Bloco>
          )}

          {/* Documentos */}
          <Bloco v={v} Icon={FileText} titulo="Documentos">
            <div className="space-y-2">
              <input ref={inputComprovante} type="file" className="hidden"
                accept="image/*,application/pdf"
                onChange={e => { anexar('comprovante', e.target.files?.[0]); e.target.value = ''; }} />

              {(p.documentos || []).map(doc => (
                <button key={doc.key}
                  disabled={doc.key === 'nfe' && !doc.disponivel}
                  onClick={() => {
                    // O pedido em PDF é uma TELA, e não um download cego: o
                    // vendedor confere o que vai sair antes de mandar.
                    if (doc.key === 'pedido') return navigate(documentoEm);
                    // O comprovante não vem na resposta: é pedido na hora e
                    // volta um link que expira em dez minutos, para o
                    // endereço do arquivo não ficar guardado na aba.
                    if (doc.key === 'comprovante' && doc.via_rota) return abrirComprovante();
                    if (doc.url) return window.open(doc.url, '_blank', 'noopener');
                    // Comprovante que ainda não existe: o botão vira o
                    // caminho de anexar, em vez de acender prometendo um
                    // arquivo que ninguém subiu.
                    if (doc.key === 'comprovante') return inputComprovante.current?.click();
                    toast(doc.nota || 'Ainda não disponível', { icon: '⏳' });
                  }}
                  className="w-full flex items-center gap-2 text-left text-sm disabled:opacity-45 disabled:cursor-not-allowed">
                  <span className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                    style={{ background: 'rgba(59,130,246,0.2)' }}>
                    <FileText size={11} style={{ color: '#60a5fa' }} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate" style={{ color: v.textPrimary }}>{doc.label}</span>
                    {doc.nota && <span className="block text-[10px]" style={{ color: v.textSubtle }}>{doc.nota}</span>}
                    {doc.key === 'pedido' && (
                      <span className="block text-[10px]" style={{ color: v.textSubtle }}>Abre a folha para conferir e imprimir</span>
                    )}
                  </span>
                  {doc.key === 'comprovante' && !doc.via_rota
                    ? (enviando === 'comprovante'
                        ? <Loader2 size={14} className="animate-spin shrink-0" style={{ color: v.textMuted }} />
                        : <UploadCloud size={14} style={{ color: v.textMuted }} className="shrink-0" />)
                    : <Download size={14} style={{ color: v.textMuted }} className="shrink-0" />}
                </button>
              ))}
            </div>
          </Bloco>

          {/* Informações importantes */}
          <Bloco v={v} Icon={Info} titulo="Informações Importantes"
            direita={podeEditarAvisos && (
              <button onClick={() => emBreve('A edição dos avisos')} title="Acrescentar aviso"
                className="w-6 h-6 rounded-lg flex items-center justify-center"
                style={{ background: 'rgba(59,130,246,0.2)', color: '#60a5fa' }}>
                <Plus size={13} />
              </button>
            )}>
            {(p.avisos || []).length === 0 ? (
              <p className="text-[12px]" style={{ color: v.textSubtle }}>
                Nenhum aviso cadastrado. O Administrativo define os avisos padrão em
                Configurações, e eles passam a aparecer em todos os pedidos.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {p.avisos.map((a, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[12px]" style={{ color: v.textMuted }}>
                    <Info size={12} className="shrink-0 mt-0.5" style={{ color: '#facc15' }} />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <p className="text-[11px] px-1" style={{ color: v.textSubtle }}>
            Alterar produto, quantidade, preço ou frete depende de autorização administrativa —
            toda mudança fica registrada com usuário, data, motivo e valor anterior.
          </p>
        </div>
      </div>

      {/* Trocar arte já anexada: passa pelo gerente. */}
      <SubstituirArteModal
        pedido={trocarArte}
        enviando={enviando === 'arte'}
        onClose={() => setTrocarArte(null)}
        onConfirmar={({ arquivo, email, senha }) => anexar('arte', arquivo, { email, senha })}
      />
    </div>
  );
}

/**
 * Uma FASE da linha do tempo.
 *
 * A cor conta a história antes do texto:
 *
 *   verde     já aconteceu
 *   amarelo   está acontecendo agora
 *   roxo      ainda vem
 *   vermelho  está acontecendo agora E o prazo estourou
 *
 * Fase futura NUNCA fica verde. Verde é registro do que aconteceu, e um
 * verde adiantado faz o vendedor prometer ao cliente uma etapa que a
 * fábrica ainda nem começou.
 */
function Balao({ v, fase, atrasado }) {
  const Icon = ICONES[fase.icone] || Circle;
  const cor = {
    concluido: '#4ade80',
    atual:     atrasado ? '#f87171' : '#fbbf24',
    pendente:  '#8b5cf6',
  }[fase.estado] || '#8b5cf6';

  const apagado = fase.estado === 'pendente';

  return (
    <div className="flex flex-col items-center gap-1 text-center" style={{ width: 96 }}
      title={`${fase.ordem}. ${fase.label}${fase.detalhe ? ` — ${fase.detalhe}` : ''}${fase.at ? ` — ${dataHora(fase.at)}` : ''}`}>
      <div className="relative">
        <div className="w-11 h-11 rounded-full flex items-center justify-center"
          style={{
            border: `2px solid ${apagado ? `${cor}66` : cor}`,
            background: apagado ? 'transparent' : `${cor}22`,
            boxShadow: fase.estado === 'atual' ? `0 0 14px ${cor}77` : 'none',
          }}>
          <Icon size={18} style={{ color: apagado ? `${cor}aa` : cor }} />
        </div>
        <span className="absolute -top-1 -left-1 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
          style={{ background: apagado ? `${cor}66` : cor, color: '#0b1020' }}>
          {fase.ordem}
        </span>
      </div>
      <span className="text-[10px] leading-tight font-semibold"
        style={{ color: apagado ? v.textSubtle : cor }}>{fase.label}</span>
      {fase.at && <span className="text-[9px]" style={{ color: v.textSubtle }}>{horaCurta(fase.at)}</span>}
      {fase.estado === 'atual' && <span className="w-6 h-0.5 rounded-full" style={{ background: cor }} />}
    </div>
  );
}

// ── Peças pequenas ───────────────────────────────────────────
function Bloco({ v, Icon, titulo, direita, children }) {
  return (
    <div style={v.card}>
      <div className="flex items-center justify-between gap-2 px-4 py-3"
        style={{ borderBottom: `1px solid ${v.divider}` }}>
        <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: v.textPrimary }}>
          <Icon size={16} style={{ color: '#60a5fa' }} /> {titulo}
        </h2>
        {direita}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Campo({ v, rotulo, valor, mono }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1 text-sm">
      <span className="shrink-0" style={{ color: v.textMuted }}>{rotulo}:</span>
      <span className={`text-right min-w-0 truncate ${mono ? 'font-mono' : ''}`} style={{ color: v.textPrimary }}>
        {valor}
      </span>
    </div>
  );
}

function Prazo({ v, rotulo, valor, Icon = CalendarDays }) {
  return (
    <div className="rounded-lg px-2.5 py-2" style={{ background: v.surface }}>
      <p className="text-[10px] flex items-center gap-1" style={{ color: v.textSubtle }}>
        <Icon size={10} /> {rotulo}
      </p>
      <p className="text-sm font-semibold mt-0.5" style={{ color: v.textPrimary }}>{valor}</p>
    </div>
  );
}
