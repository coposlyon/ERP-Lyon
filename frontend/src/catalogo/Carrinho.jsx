// ============================================================
// TELA 5 — O CARRINHO, O ORÇAMENTO E O PAGAMENTO.
//
// Aqui o que estava no navegador vira compromisso. Três saídas, e elas
// NÃO são a mesma coisa (§29 a §32):
//
//   Continuar comprando → volta para a vitrine, carrinho intacto.
//   Gerar orçamento     → grava um orçamento aberto. NÃO vira pedido.
//   Confirmar pedido    → exige cadastro, gera a cobrança, e o pedido só
//                         entra no fluxo de venda quando o dinheiro
//                         estiver conferido.
//
// O CARRINHO NÃO CARREGA PREÇO PARA O SERVIDOR. Ele carrega a
// CONFIGURAÇÃO — modelo, acabamento, campos, projeto de arte. O valor
// que aparece na tela é para a pessoa somar sem esperar a rede; o valor
// que vale é o que o servidor refaz do cadastro na hora de fechar. Um
// carrinho de uma semana atrás não pode congelar a tabela de preço.
//
// O CADASTRO É O MESMO DA LOJA. Quem já comprou pelo /loja é o mesmo
// cliente aqui — mesma chave, mesmo CPF, mesmo histórico. Dois cadastros
// do mesmo comprador é o começo de dois históricos que ninguém junta
// depois.
// ============================================================
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  ShoppingCart, Trash2, ArrowLeft, FileText, Lock, Loader2, Truck,
  MapPin, CalendarDays, Info, Headphones, AlertTriangle, Check,
  QrCode, CreditCard, Barcode, UserRound, PackageCheck,
  FileDown, Image as ImageIcon,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { generateQuotePng, downloadPng } from '@/lib/quotePng';
import api, { lojaApi } from './api';
import {
  CatalogoShell, Painel, NEON, bordaNeon, corComAlfa,
  Rotulo, Opcao, Botao, Campo, Nota, brl,
} from './ui';
import { useCarrinho } from './carrinhoContexto';

const HOJE = () => new Date().toISOString().slice(0, 10);

// A identidade do cliente da loja. Ler a mesma chave é o que faz quem
// entrou em /loja não precisar se identificar de novo aqui.
const CHAVE_CLIENTE = 'lyon_store_customer';

function clienteSalvo() {
  try { return JSON.parse(localStorage.getItem(CHAVE_CLIENTE) || 'null'); } catch { return null; }
}
function salvarCliente(c) {
  try { localStorage.setItem(CHAVE_CLIENTE, JSON.stringify(c)); } catch { /* sem espaço: segue na memória */ }
}

const soDigitos = s => String(s || '').replace(/\D/g, '');

export default function Carrinho() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const carrinho = useCarrinho();

  const [cliente, setCliente] = useState(clienteSalvo);
  const [entrega, setEntrega] = useState(() => ({
    retirar: false,
    cep: '',
    data_evento: '',
    observacao: '',
  }));
  const [contato, setContato] = useState(() => ({
    nome: cliente?.name || '',
    telefone: cliente?.phone || cliente?.mobile || '',
    email: cliente?.email || '',
  }));

  const [frete, setFrete] = useState(null);        // opção escolhida
  const [opcoesFrete, setOpcoesFrete] = useState([]);
  const [cotando, setCotando] = useState(false);
  const [enviando, setEnviando] = useState(null);  // 'orcamento' | 'pagamento'
  const [orcamento, setOrcamento] = useState(null);
  const [pedindoCadastro, setPedindoCadastro] = useState(false);
  const [pagamento, setPagamento] = useState(params.get('pagamento') || 'pix');

  // Prazo de produção e validade da cotação: os MESMOS números que o
  // configurador mostrou, vindos da mesma rota. Prometer 7 dias numa
  // tela e 10 na outra é como nasce discussão de prazo.
  const [prazo, setPrazo] = useState(null);
  useEffect(() => {
    api.get('/regras').then(r => setPrazo(r)).catch(() => {});
  }, []);

  const itens = carrinho.itens;
  const subtotal = carrinho.total;
  const valorFrete = entrega.retirar ? 0 : (Number(frete?.price) || 0);
  const total = subtotal + valorFrete;

  // ── O frete (§26) ─────────────────────────────────────────
  //
  // Cotado pela MESMA rota da loja: um cálculo de frete só, para o site
  // e o catálogo não darem dois valores para o mesmo CEP.
  const cotarFrete = useCallback(async () => {
    const cep = soDigitos(entrega.cep);
    if (cep.length !== 8 || entrega.retirar || !itens.length) return;
    setCotando(true);
    try {
      const r = await lojaApi.post('/frete', {
        cep,
        items: itens
          .filter(i => i.produto_id)
          .map(i => ({ product_id: i.produto_id, quantity: i.quantidade })),
      });
      const opcoes = r?.options || [];
      setOpcoesFrete(opcoes);
      setFrete(opcoes[0] || null);
      // Estado sem valor na tabela: o servidor diz o que houve — repetir
      // "não consegui cotar" mandaria o cliente achar que é erro dele.
      if (!opcoes.length) toast(r?.aviso || 'Não consegui cotar o frete para esse CEP. Fale com um atendente.');
    } catch (err) {
      setOpcoesFrete([]);
      setFrete(null);
      toast.error(err.message);
    } finally {
      setCotando(false);
    }
  }, [entrega.cep, entrega.retirar, itens]);

  // CEP completo dispara a cotação sozinho — obrigar a apertar um botão
  // depois de digitar oito números é um passo que ninguém entende.
  useEffect(() => {
    if (entrega.retirar) { setOpcoesFrete([]); setFrete(null); return; }
    if (soDigitos(entrega.cep).length !== 8) { setOpcoesFrete([]); setFrete(null); return; }
    const t = setTimeout(cotarFrete, 400);
    return () => clearTimeout(t);
  }, [entrega.cep, entrega.retirar, cotarFrete]);

  /** O que o servidor precisa para refazer cada item do zero. */
  const itensParaServidor = () => itens.map(i => ({
    modelo: i.modelo,
    acabamento_id: i.acabamento_id,
    processo_id: i.processo_id,
    campos: i.campos,
    tipo_pedido: i.tipo_pedido,
    quantidade: i.quantidade,
    posicao: i.posicao,
    projeto_id: i.projeto_id,
    // OS IDS DO QUE ELA MARCOU, e só. O preço de cada adicional o
    // servidor relê do cadastro no fechamento — mandar valor daqui
    // seria deixar o navegador dizer quanto custa.
    adicionais: i.adicionais || [],
  }));

  /**
   * Baixa o orçamento como arquivo.
   *
   * O cliente pediu o orçamento: ele já deve sair com o arquivo na mão,
   * sem ter que descobrir onde clicar. O PNG é gerado no navegador (o
   * mesmo desenho do PDV) e o PDF é esse PNG numa página — assim os dois
   * mostram exatamente a mesma coisa, que é o que evita a discussão de
   * "mas no meu apareceu diferente".
   */
  async function baixarOrcamento(formato = 'png') {
    const q = orcamento?.paraArquivo;
    if (!q) return;
    const nomeArq = `orcamento-${String(q.number).padStart(4, '0')}`;
    try {
      const dataUrl = generateQuotePng(q);
      if (formato === 'png') { downloadPng(dataUrl, `${nomeArq}.png`); return; }

      const { jsPDF } = await import('jspdf');
      const img = new Image();
      await new Promise((ok, falhou) => { img.onload = ok; img.onerror = falhou; img.src = dataUrl; });
      // Retrato ou paisagem conforme o desenho, para o orçamento nunca
      // sair cortado numa folha que não cabe.
      const pdf = new jsPDF({
        orientation: img.width > img.height ? 'landscape' : 'portrait',
        unit: 'px', format: [img.width, img.height],
      });
      pdf.addImage(dataUrl, 'PNG', 0, 0, img.width, img.height);
      pdf.save(`${nomeArq}.pdf`);
    } catch (err) {
      toast.error('Não consegui gerar o arquivo. Tente o outro formato.');
    }
  }

  // Assim que o orçamento existe, o arquivo cai sozinho.
  useEffect(() => {
    if (orcamento?.paraArquivo) baixarOrcamento('png');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orcamento?.numero]);

  // ── Gerar orçamento (§29) ─────────────────────────────────
  async function gerarOrcamento() {
    if (!itens.length) return;
    const nome = contato.nome.trim();
    const fone = soDigitos(contato.telefone);
    if (!nome || fone.length < 10) {
      toast.error('Informe seu nome e um telefone com DDD para receber o orçamento.');
      return;
    }
    setEnviando('orcamento');
    try {
      const r = await api.post('/orcamento', {
        contato: { nome, telefone: contato.telefone, email: contato.email },
        itens: itensParaServidor(),
        observacao: entrega.observacao,
        data_evento: entrega.data_evento || null,
        cep: entrega.cep || null,
        retirar: entrega.retirar,
      });
      // O retrato do orçamento tem de ser tirado ANTES de limpar o
      // carrinho — depois de `limpar()` não há mais item para desenhar,
      // e o arquivo baixado sairia em branco.
      setOrcamento({
        ...r,
        paraArquivo: {
          number: r.numero,
          created_at: new Date().toISOString(),
          customer: { name: nome, phone: contato.telefone, email: contato.email },
          items: itens.map(i => ({
            product_name: i.nome,
            quantity: i.quantidade,
            unit_price: i.valor_unitario,
            notes: Object.entries(i.resumo || {}).map(([k, v]) => `${k}: ${v}`).join(' · '),
          })),
          discount: 0,
          freight: valorFrete,
          validade: r.validade,
        },
      });
      carrinho.limpar();
      toast.success(`Orçamento ${r.numero} gerado`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setEnviando(null);
    }
  }

  // ── Confirmar pedido → cobrança (§30 a §32) ───────────────
  async function gerarPagamento(clienteAtual = cliente) {
    if (!itens.length) return;
    setEnviando('pagamento');
    try {
      const r = await api.postComCodigo('/pagamento', {
        customer_id: clienteAtual?.id || null,
        itens: itensParaServidor(),
        observacao: entrega.observacao,
        data_evento: entrega.data_evento || null,
        cep: entrega.cep || null,
        retirar: entrega.retirar,
        frete: valorFrete,
        forma: pagamento,
      });

      if (r.modo === 'venda') {
        // Sem cobrança configurada o pedido entra direto no Comercial —
        // e é honesto dizer isso, em vez de mostrar um PIX que não existe.
        carrinho.limpar();
        toast.success(`Pedido registrado — nº ${r.numero}`);
        navigate('/acompanhar');
        return;
      }

      carrinho.limpar();
      navigate(`/personalizados/pagamento/${r.pedido_id}`);
    } catch (err) {
      if (err.codigo === 'LOGIN_REQUIRED') {
        // Não é erro: é a hora do cadastro. O carrinho fica onde está.
        setPedindoCadastro(true);
      } else {
        toast.error(err.message);
      }
    } finally {
      setEnviando(null);
    }
  }

  function entrou(c) {
    salvarCliente(c);
    setCliente(c);
    setContato(a => ({
      nome: a.nome || c.name || '',
      telefone: a.telefone || c.phone || c.mobile || '',
      email: a.email || c.email || '',
    }));
    setPedindoCadastro(false);
    gerarPagamento(c);
  }

  // ── O orçamento saiu ──────────────────────────────────────
  if (orcamento) {
    return (
      <CatalogoShell largura="max-w-xl" titulo="Orçamento gerado"
        trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Orçamento' }]}>
        <Painel cor={NEON.ciano}>
          <div className="text-center py-4">
            <Check size={40} className="mx-auto mb-3" style={{ color: NEON.ciano }} />
            <p className="text-[20px] font-bold" style={{ color: NEON.texto }}>
              Orçamento nº {orcamento.numero}
            </p>
            <p className="text-[13px] mt-1.5" style={{ color: NEON.suave }}>
              {orcamento.itens} {orcamento.itens === 1 ? 'item' : 'itens'} · {brl(orcamento.total)}
            </p>
            <p className="text-[12px] mt-3 leading-relaxed" style={{ color: NEON.suave }}>
              Guardamos sua configuração e sua arte. Um de nossos atendentes vai falar com você
              para fechar o pedido — o orçamento vale até {String(orcamento.validade).split('-').reverse().join('/')}.
            </p>
          </div>
          <div className="space-y-2.5 mt-2">
            <Botao icone={ImageIcon} cor={NEON.ciano} onClick={() => baixarOrcamento('png')}>
              Baixar em imagem (PNG)
            </Botao>
            <Botao icone={FileDown} cor={NEON.roxo} onClick={() => baixarOrcamento('pdf')}>
              Baixar em PDF
            </Botao>
            <Botao cheio icone={ArrowLeft} onClick={() => navigate('/personalizados')}>
              Voltar ao catálogo
            </Botao>
            <AtendenteBotao />
          </div>
        </Painel>
      </CatalogoShell>
    );
  }

  // ── Carrinho vazio ────────────────────────────────────────
  if (!itens.length) {
    return (
      <CatalogoShell largura="max-w-xl" titulo="Seu carrinho está vazio"
        trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Carrinho' }]}>
        <Painel cor={NEON.azul}>
          <div className="text-center py-6">
            <ShoppingCart size={34} className="mx-auto mb-3" style={{ color: NEON.fraco }} />
            <p className="text-[13px]" style={{ color: NEON.suave }}>
              Escolha uma categoria, monte seu copo e ele aparece aqui.
            </p>
          </div>
          <Botao cheio icone={ArrowLeft} onClick={() => navigate('/personalizados')}>
            Ver o catálogo
          </Botao>
        </Painel>
      </CatalogoShell>
    );
  }

  return (
    <CatalogoShell
      titulo="Seu carrinho"
      subtitulo="Confira os itens, informe a entrega e escolha entre orçamento ou pagamento."
      trilha={[{ nome: 'Catálogo', para: '/personalizados' }, { nome: 'Carrinho' }]}
      largura="max-w-6xl">

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.62fr)]">

        {/* ═══ ESQUERDA — itens e entrega ═══ */}
        <div className="space-y-4">
          <Painel titulo={`Itens (${itens.length})`} cor={NEON.ciano} icone={ShoppingCart}>
            <ul className="space-y-3">
              {itens.map(item => (
                <ItemDoCarrinho key={item.chave} item={item}
                  onQtd={q => carrinho.mudarQtd(item.chave, q)}
                  onRemover={() => carrinho.remover(item.chave)} />
              ))}
            </ul>

            <div className="mt-4">
              <Botao cor={NEON.azul} icone={ArrowLeft} onClick={() => navigate('/personalizados')}>
                Continuar comprando
              </Botao>
            </div>
          </Painel>

          <Painel titulo="Entrega e evento" cor={NEON.azul} icone={Truck}>
            <div className="flex items-center justify-between gap-3 mb-3">
              <span className="text-[13px]" style={{ color: NEON.suave }}>Retirar no local?</span>
              <div className="flex gap-1.5">
                <Opcao titulo="Sim" cor={NEON.ciano} ativo={entrega.retirar}
                  onClick={() => setEntrega(a => ({ ...a, retirar: true }))} />
                <Opcao titulo="Não" cor={NEON.azul} ativo={!entrega.retirar}
                  onClick={() => setEntrega(a => ({ ...a, retirar: false }))} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {!entrega.retirar && (
                <div>
                  <Rotulo>CEP de entrega</Rotulo>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: NEON.ciano }} />
                    <Campo inputMode="numeric" maxLength={9} placeholder="00000-000"
                      value={entrega.cep} style={{ paddingLeft: 32 }}
                      onChange={e => setEntrega(a => ({
                        ...a,
                        cep: soDigitos(e.target.value).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
                      }))} />
                  </div>
                </div>
              )}
              <div>
                <Rotulo>Data do evento</Rotulo>
                <div className="relative">
                  <CalendarDays size={14} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                    style={{ color: NEON.azul }} />
                  <Campo type="date" min={HOJE()} value={entrega.data_evento}
                    style={{ paddingLeft: 32, colorScheme: 'dark' }}
                    onChange={e => setEntrega(a => ({ ...a, data_evento: e.target.value }))} />
                </div>
              </div>
            </div>

            {!entrega.retirar && (
              <div className="mt-3">
                {cotando ? (
                  <p className="text-[11.5px] flex items-center gap-1.5" style={{ color: NEON.fraco }}>
                    <Loader2 size={12} className="animate-spin" /> cotando o frete…
                  </p>
                ) : opcoesFrete.length > 0 ? (
                  <>
                    <Rotulo>Forma de envio</Rotulo>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {opcoesFrete.map(o => (
                        <Opcao key={o.id} cor={NEON.ciano}
                          titulo={`${o.company} — ${brl(o.price)}`}
                          sub={o.days ? `${o.service} · ${o.days} dia(s) de transporte` : o.service}
                          ativo={frete?.id === o.id} onClick={() => setFrete(o)} />
                      ))}
                    </div>
                  </>
                ) : soDigitos(entrega.cep).length === 8 ? (
                  <Nota icone={AlertTriangle} cor="#fbbf24">
                    Não consegui cotar esse CEP agora. Você pode gerar o orçamento e um atendente
                    fecha o frete com você.
                  </Nota>
                ) : (
                  <Nota icone={Info} cor={NEON.azul}>
                    Informe o CEP para calcular o frete e o prazo de entrega.
                  </Nota>
                )}
              </div>
            )}

            <div className="mt-3">
              <Rotulo>Observação (opcional)</Rotulo>
              <Campo value={entrega.observacao} maxLength={300}
                placeholder="Algo que a gente precise saber sobre o pedido"
                onChange={e => setEntrega(a => ({ ...a, observacao: e.target.value }))} />
            </div>
          </Painel>

          <Painel titulo="Seus dados de contato" cor={NEON.roxo} icone={UserRound}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Rotulo>Nome</Rotulo>
                <Campo value={contato.nome} maxLength={80}
                  onChange={e => setContato(a => ({ ...a, nome: e.target.value }))} />
              </div>
              <div>
                <Rotulo>Telefone com DDD</Rotulo>
                <Campo inputMode="tel" maxLength={15} placeholder="(00) 00000-0000"
                  value={contato.telefone}
                  onChange={e => setContato(a => ({ ...a, telefone: mascaraTelefone(e.target.value) }))} />
              </div>
              <div>
                <Rotulo>E-mail (opcional)</Rotulo>
                <Campo type="email" value={contato.email} maxLength={120}
                  onChange={e => setContato(a => ({ ...a, email: e.target.value }))} />
              </div>
            </div>
            <Nota icone={Info} cor={NEON.roxo}>
              Usamos para enviar o orçamento e falar com você sobre o pedido.
            </Nota>
          </Painel>
        </div>

        {/* ═══ DIREITA — resumo e saídas ═══ */}
        <div className="space-y-4">
          <Painel titulo="Resumo" cor={NEON.rosa} icone={FileText}>
            <dl className="space-y-1.5 text-[12.5px]">
              <Valor rotulo={`Produtos (${carrinho.pecas} un)`} valor={subtotal} />
              <Valor rotulo="Frete" valor={entrega.retirar ? 0 : (frete ? valorFrete : null)}
                vazio={entrega.retirar ? null : 'informe o CEP'} />
            </dl>
            <div className="mt-3 pt-3 flex items-baseline justify-between gap-3"
              style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <span className="text-[13px]" style={{ color: NEON.suave }}>Total</span>
              <span className="text-[19px] font-bold" style={{ color: NEON.texto }}>{brl(total)}</span>
            </div>

            {prazo?.prazo_producao && (
              <div className="mt-3 p-2.5 rounded-lg text-[11px] leading-relaxed flex items-start gap-2"
                style={{ background: corComAlfa(NEON.ciano, 0.07), color: NEON.suave }}>
                <Info size={13} className="shrink-0 mt-0.5" style={{ color: NEON.ciano }} />
                <span>
                  Produção: {prazo.prazo_producao.min} a {prazo.prazo_producao.max} dias úteis
                  {!entrega.retirar && frete?.days ? `, mais ${frete.days} dia(s) de transporte` : ''}.
                  Em caso de urgência ou dúvidas, fale com um de nossos atendentes.
                </span>
              </div>
            )}
          </Painel>

          <Painel titulo="Forma de pagamento" cor={NEON.roxo} icone={CreditCard}>
            <div className="grid grid-cols-3 gap-2">
              <Opcao titulo="PIX" icone={QrCode} cor={NEON.ciano}
                ativo={pagamento === 'pix'} onClick={() => setPagamento('pix')} />
              <Opcao titulo="Cartão" icone={CreditCard} cor={NEON.azul}
                ativo={pagamento === 'cartao'} onClick={() => setPagamento('cartao')} />
              <Opcao titulo="Boleto" icone={Barcode} cor={NEON.roxo}
                ativo={pagamento === 'boleto'} onClick={() => setPagamento('boleto')} />
            </div>
            {pagamento !== 'pix' && (
              <Nota icone={Info} cor={NEON.roxo}>
                Cartão e boleto são liberados conforme seu cadastro financeiro. Geramos o pedido e
                um atendente envia a cobrança na forma escolhida.
              </Nota>
            )}
          </Painel>

          {cliente && (
            <p className="text-[11.5px] px-1 flex items-center gap-1.5" style={{ color: NEON.suave }}>
              <Check size={13} style={{ color: NEON.ciano }} />
              Identificado como <b style={{ color: NEON.texto }}>{String(cliente.name || '').split(/\s+/)[0]}</b>
            </p>
          )}

          <div className="space-y-2.5">
            <Botao icone={FileText} cor={NEON.roxo} onClick={gerarOrcamento}
              disabled={!!enviando}>
              {enviando === 'orcamento'
                ? <><Loader2 size={16} className="animate-spin" /> Gerando…</>
                : 'Gerar orçamento'}
            </Botao>
            {/* "CONFIRMAR PEDIDO", e não "Gerar pagamento": o cliente
                não está gerando nada, está fechando a compra. O que
                acontece depois — o PIX aparecer — é consequência, e a
                tela seguinte explica. */}
            <Botao cheio icone={Lock} onClick={() => gerarPagamento()} disabled={!!enviando}>
              {enviando === 'pagamento'
                ? <><Loader2 size={16} className="animate-spin" /> Confirmando…</>
                : 'Confirmar pedido'}
            </Botao>
            <AtendenteBotao />
          </div>

          <Painel titulo="Depois do pagamento" cor={NEON.azul} icone={PackageCheck}>
            <p className="text-[11.5px] leading-relaxed" style={{ color: NEON.suave }}>
              Confirmado o pagamento, o sistema gera o número do pedido
              (<b style={{ color: NEON.texto }}>PV-000123</b>) ligado ao seu CPF. Você acompanha
              cada etapa pela tela de acompanhamento.
            </p>
            <Link to="/acompanhar" className="text-[12px] mt-2.5 inline-flex items-center gap-1.5"
              style={{ color: NEON.ciano }}>
              <PackageCheck size={13} /> Acompanhar um pedido
            </Link>
          </Painel>
        </div>
      </div>

      {pedindoCadastro && (
        <Identificacao
          onEntrou={entrou}
          onFechar={() => setPedindoCadastro(false)} />
      )}
    </CatalogoShell>
  );
}

// ── Um item do carrinho ─────────────────────────────────────

function ItemDoCarrinho({ item, onQtd, onRemover }) {
  const resumo = Object.entries(item.resumo || {});
  return (
    <li className="p-3 rounded-xl flex flex-wrap gap-3"
      style={{ background: 'rgba(255,255,255,0.035)', border: '1px solid rgba(255,255,255,0.09)' }}>

      {/* A prévia da arte, exatamente o vetor que o cliente confirmou. */}
      <span className="w-16 h-16 rounded-lg shrink-0 flex items-center justify-center overflow-hidden"
        style={{ background: item.previa ? '#fff' : 'rgba(255,255,255,0.05)', color: '#111318' }}>
        {item.previa
          ? <span className="w-full h-full p-1 block" dangerouslySetInnerHTML={{ __html: item.previa }} />
          : <ShoppingCart size={18} style={{ color: NEON.fraco }} />}
      </span>

      <div className="flex-1 min-w-[180px]">
        <p className="font-semibold text-[13.5px] leading-snug" style={{ color: NEON.texto }}>
          {item.nome}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: NEON.fraco }}>
          {[
            item.tipo_pedido === 'liso' ? 'Liso' : 'Personalizado',
            item.impressao,
            item.posicao === 'frente_verso' ? 'Frente e verso' : (item.posicao ? 'Frente' : null),
          ].filter(Boolean).join(' · ')}
        </p>
        {resumo.length > 0 && (
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: NEON.suave }}>
            {resumo.map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </p>
        )}
        {/* O QUE ELA MARCOU A MAIS, escrito. Um item que sobe o preço
            e não aparece no carrinho vira "por que deu esse valor?" na
            hora de pagar — que é a hora em que a compra é abandonada. */}
        {(item.adicionais_resumo || []).length > 0 && (
          <p className="text-[11px] mt-1 leading-relaxed" style={{ color: NEON.ciano }}>
            + {item.adicionais_resumo.map(t => `${item.quantidade} ${t.toLowerCase()}`).join(' · ')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-3 ml-auto">
        <div className="w-[92px]">
          <Rotulo>Qtd</Rotulo>
          <Campo type="number" inputMode="numeric" min={item.quantidade_minima || 1}
            value={item.quantidade} onChange={e => onQtd(e.target.value)} />
        </div>
        <div className="text-right">
          <p className="text-[10.5px]" style={{ color: NEON.fraco }}>{brl(item.valor_unitario)} / un</p>
          <p className="font-bold text-[14px]" style={{ color: NEON.texto }}>
            {brl((Number(item.quantidade) || 0) * (Number(item.valor_unitario) || 0))}
          </p>
        </div>
        <button type="button" onClick={onRemover} aria-label={`Remover ${item.nome}`}
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(248,113,113,0.10)', border: '1px solid rgba(248,113,113,0.3)' }}>
          <Trash2 size={15} style={{ color: '#fca5a5' }} />
        </button>
      </div>
    </li>
  );
}

// ── A identificação antes de pagar (§30) ────────────────────

/**
 * CPF, e o que vem depois depende do que o cadastro responde.
 *
 * Já é cliente → confere pela data de nascimento e segue direto para o
 * pagamento, sem repetir endereço nem telefone. Ainda não é → vai para
 * a tela de cadastro que já existe, e volta para o carrinho intacto.
 *
 * A DATA DE NASCIMENTO É A SENHA. Não é ideal e a gente sabe: é o mesmo
 * critério da loja, e ter dois critérios de identidade seria pior que
 * ter um fraco.
 */
function Identificacao({ onEntrou, onFechar }) {
  const [cpf, setCpf] = useState('');
  const [achado, setAchado] = useState(null);   // { first_name } | 'novo'
  const [nascimento, setNascimento] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');

  async function conferirCpf(e) {
    e.preventDefault();
    const doc = soDigitos(cpf);
    if (doc.length !== 11 && doc.length !== 14) {
      setErro('Informe um CPF ou CNPJ completo.');
      return;
    }
    setOcupado(true); setErro('');
    try {
      const r = await lojaApi.post('/check-doc', { cpf: doc });
      setAchado(r.exists ? r : 'novo');
    } catch (err) { setErro(err.message); }
    finally { setOcupado(false); }
  }

  async function entrar(e) {
    e.preventDefault();
    setOcupado(true); setErro('');
    try {
      const r = await lojaApi.post('/verify-birth', { cpf: soDigitos(cpf), birth_date: nascimento });
      if (r.success && r.customer) onEntrou(r.customer);
      else setErro('Não consegui confirmar seus dados.');
    } catch (err) { setErro(err.message); }
    finally { setOcupado(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(3,6,20,0.86)' }} role="dialog" aria-modal="true">
      <div className="w-full max-w-md p-5" style={bordaNeon(NEON.roxo, 0.7)}>
        <h2 className="text-[17px] font-bold" style={{ color: NEON.texto }}>Falta só o cadastro</h2>
        <p className="text-[12px] mt-1 leading-relaxed" style={{ color: NEON.suave }}>
          Seu carrinho está guardado. Informe seu CPF ou CNPJ para continuar — se você já comprou
          com a gente, é só confirmar sua data de nascimento.
        </p>

        {achado === null && (
          <form onSubmit={conferirCpf} className="mt-4 space-y-3">
            <div>
              <Rotulo>CPF ou CNPJ</Rotulo>
              <Campo inputMode="numeric" autoFocus value={cpf} maxLength={18}
                placeholder="000.000.000-00"
                onChange={e => setCpf(mascaraDoc(e.target.value))} />
            </div>
            <Botao cheio type="submit" disabled={ocupado}>
              {ocupado ? <><Loader2 size={16} className="animate-spin" /> Conferindo…</> : 'Continuar'}
            </Botao>
          </form>
        )}

        {achado && achado !== 'novo' && (
          <form onSubmit={entrar} className="mt-4 space-y-3">
            <p className="text-[13px]" style={{ color: NEON.texto }}>
              Olá, {achado.first_name}! Confirme sua data de nascimento.
            </p>
            <div>
              <Rotulo>Data de nascimento</Rotulo>
              <Campo type="date" autoFocus value={nascimento} max={HOJE()}
                style={{ colorScheme: 'dark' }}
                onChange={e => setNascimento(e.target.value)} />
            </div>
            <Botao cheio type="submit" disabled={ocupado || !nascimento}>
              {ocupado ? <><Loader2 size={16} className="animate-spin" /> Entrando…</> : 'Entrar e pagar'}
            </Botao>
          </form>
        )}

        {achado === 'novo' && (
          <div className="mt-4 space-y-3">
            <p className="text-[12.5px] leading-relaxed" style={{ color: NEON.suave }}>
              Ainda não temos seu cadastro. Leva um minuto — e quando terminar você volta
              para cá com o carrinho do jeito que está.
            </p>
            <Botao cheio icone={UserRound}
              onClick={() => { window.location.href = '/cadastro?voltar=/catalogo/carrinho'; }}>
              Fazer meu cadastro
            </Botao>
          </div>
        )}

        {erro && (
          <p className="text-[11.5px] mt-3 flex items-start gap-1.5" style={{ color: '#fca5a5' }}>
            <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {erro}
          </p>
        )}

        <button type="button" onClick={onFechar}
          className="text-[12px] mt-4 w-full text-center" style={{ color: NEON.fraco }}>
          Voltar ao carrinho
        </button>
      </div>
    </div>
  );
}

// ── Peças pequenas ──────────────────────────────────────────

function Valor({ rotulo, valor, vazio }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt style={{ color: NEON.suave }}>{rotulo}</dt>
      <dd className="font-medium" style={{ color: valor == null ? NEON.fraco : 'rgba(255,255,255,0.9)' }}>
        {valor == null ? (vazio || '—') : brl(valor)}
      </dd>
    </div>
  );
}

/** UM botão de atendimento em toda a tela (§27). */
function AtendenteBotao() {
  return (
    <a href="https://wa.me/?text=Ol%C3%A1%2C%20estou%20montando%20um%20pedido%20no%20cat%C3%A1logo%20da%20Lyon%20Copos"
      target="_blank" rel="noreferrer"
      className="w-full rounded-xl py-3 px-4 font-semibold text-[14px] flex items-center justify-center gap-2"
      style={{ ...bordaNeon(NEON.magenta), color: NEON.magenta }}>
      <Headphones size={17} /> Falar com atendente
    </a>
  );
}

const mascaraTelefone = v => soDigitos(v).slice(0, 11)
  .replace(/^(\d{2})(\d)/, '($1) $2')
  .replace(/(\d{5}|\d{4})(\d{4})$/, '$1-$2');

const mascaraDoc = v => {
  const d = soDigitos(v).slice(0, 14);
  if (d.length <= 11) {
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};
