// ============================================================
// TELA 3 — CONFIGURAR PRODUTO, GERAR ORÇAMENTO E PAGAMENTO.
//
// A tela inteira é desenhada pelo cadastro. Ela não sabe o que é degradê:
// recebe do servidor a lista de acabamentos, e cada acabamento traz os
// campos que ele abre e de qual grupo de cores cada campo se alimenta.
// Desenha e pronto.
//
// É O PONTO DA ESPECIFICAÇÃO QUE MAIS IMPORTA. "Não quero que o Pablo
// programe: se for Degradê, faça isso." Não existe um `if` de acabamento
// neste arquivo. Acabamento novo é linha no banco — esta tela nem fica
// sabendo.
//
// UMA INFORMAÇÃO, UM LUGAR. O prazo aparece uma vez (no resumo). Falar
// com atendente é um botão só. A quantidade mora em Entrega e é lida no
// resumo — não existe segundo campo de quantidade.
//
// E O QUE O CLIENTE NÃO VÊ: custo, margem, markup, comissão, estoque,
// fornecedor, urgência interna. A resposta do servidor nem traz esses
// campos, e é assim que continua não vazando quando alguém mexer aqui.
// ============================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import {
  Box, Palette, CalendarDays, Eye, FileText, ShoppingCart, ArrowLeft, Lock,
  Loader2, Info, Headphones, CreditCard, QrCode, Barcode, Droplet, Layers,
  PenTool, Sparkles, AlertTriangle, PackageCheck, Check, Maximize2, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from './api';
import {
  CatalogoShell, Painel, NEON, bordaNeon, corComAlfa,
  Rotulo, Opcao, Botao, Campo, Seletor, Bolinha, Nota, brl,
} from './ui';
import CopoPreview from './CopoPreview';
import { useCarrinho } from './carrinhoContexto';
import { lerRascunho, gravarRascunho, limparRascunho } from './rascunho';

const HOJE = () => new Date().toISOString().slice(0, 10);

const INICIAL = {
  tipo_pedido: 'personalizado',
  acabamento_id: null,
  campos: {},
  processo_id: null,
  posicao: 'frente',
  ocasiao: null,
  quantidade: '',
  cep: '',
  data_evento: '',
  retirar: false,
  pagamento: 'pix',
  projeto: null,
};

export default function Configurador() {
  const { chave } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const carrinho = useCarrinho();

  const [estado, setEstado] = useState(() => lerRascunho(chave) || INICIAL);
  const [preco, setPreco] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);

  const { data: cfg, isLoading, error } = useQuery({
    queryKey: ['catalogo', 'modelo', chave],
    queryFn: () => api.get(`/modelo/${chave}`),
    staleTime: 5 * 60 * 1000,
  });

  const { data: regras } = useQuery({
    queryKey: ['catalogo', 'regras'],
    queryFn: () => api.get('/regras'),
    staleTime: 30 * 60 * 1000,
  });

  const { data: ocasioesData } = useQuery({
    queryKey: ['catalogo', 'ocasioes'],
    queryFn: () => api.get('/ocasioes'),
    staleTime: 30 * 60 * 1000,
  });

  const mudar = useCallback(patch => setEstado(a => ({ ...a, ...patch })), []);

  useEffect(() => { gravarRascunho(chave, estado); }, [chave, estado]);

  // O ACABAMENTO DO CARD CLICADO VENCE O RASCUNHO.
  //
  // O rascunho é guardado por MODELO — `caneca 450 ml` — e os quatorze
  // cards da grade (Bicolor, Degradê, Jateado...) são o mesmo modelo com
  // acabamentos diferentes. A versão anterior só aplicava o acabamento do
  // link quando ainda não havia nenhum escolhido, e o rascunho já trazia
  // um: quem tinha aberto Degradê e voltava para clicar em BICOLOR abria
  // Degradê de novo. O cliente clica numa coisa e recebe outra, e não há
  // como ele entender por quê — o motivo estava guardado na sessão dele.
  //
  // Agora o link manda. Ele é a intenção mais recente, dita com um clique
  // um segundo atrás; o rascunho é memória de antes. Só na ausência do
  // link o rascunho responde, e só na ausência dos dois entra o primeiro
  // da lista — a tela nunca abre sem acabamento, que é meia tela em
  // branco esperando um clique.
  const linkAplicado = useRef(false);
  useEffect(() => {
    if (!cfg?.acabamentos?.length) return;
    const doLink = params.get('acabamento');
    const pedido = doLink ? cfg.acabamentos.find(a => a.id === doLink) : null;

    // Uma vez só por abertura: depois disto quem manda é o clique nas
    // pastilhas da tela, e reaplicar o link desfaria a escolha dele.
    if (linkAplicado.current) {
      if (!estado.acabamento_id) mudar({ acabamento_id: cfg.acabamentos[0].id });
      return;
    }
    linkAplicado.current = true;

    const alvo = pedido
      || cfg.acabamentos.find(a => a.id === estado.acabamento_id)
      || cfg.acabamentos[0];

    // Troca limpando o que não vale mais: vindo de Degradê para Bicolor,
    // a cor da boca continua sendo a mesma pergunta e é grosseria pedir
    // de novo; a cor do meio do Tricolor não existe aqui e some.
    const validos = new Set((alvo.campos || []).map(c => c.key));
    const restante = {};
    for (const [k, v] of Object.entries(estado.campos || {})) if (validos.has(k)) restante[k] = v;

    // A COR TAMBEM VEM DO LINK. Quem clicou no card da AZUL TRANSLUCIDO
    // ja escolheu a cor — abrir o configurador na cor errada e pedir a
    // mesma coisa duas vezes. O nome vem do cadastro do produto e as
    // opcoes de CONFIG_CORES, entao a comparacao ignora acento e caixa.
    let corMudou = false;
    const corDoLink = params.get('cor');
    if (corDoLink) {
      const chave = txt => String(txt || '').normalize('NFD')
        .replace(/[̀-ͯ]/g, '').toUpperCase().trim();
      const alvoCor = chave(corDoLink);
      const campoBase = (alvo.campos || []).find(c => c.key === 'cor_base' || c.key === 'cor_produto');
      if (campoBase) {
        const achada = (cfg?.cores?.[campoBase.grupo] || []).find(c => chave(c.name) === alvoCor);
        if (achada && restante[campoBase.key] !== achada.id) {
          restante[campoBase.key] = achada.id;
          corMudou = true;
        }
      }
    }

    // A SAÍDA ANTECIPADA FICAVA ANTES DA COR, e por isso o clique no
    // card amarelo abria a tela na cor Pérola: o rascunho da visita
    // anterior já tinha o acabamento Tradicional, `alvo.id` batia com
    // ele, e a função voltava sem nunca chegar na cor. Agora ela só
    // desiste quando NÃO HÁ NADA a aplicar — nem acabamento, nem cor.
    if (alvo.id === estado.acabamento_id && !corMudou) return;

    mudar({ acabamento_id: alvo.id, campos: restante });
  }, [cfg, params, estado.acabamento_id, estado.campos, mudar]);

  const acabamento = useMemo(
    () => (cfg?.acabamentos || []).find(a => a.id === estado.acabamento_id) || null,
    [cfg, estado.acabamento_id]);

  // As cores que o campo aceita. `apenas` restringe dentro do grupo —
  // a cor da boca sai do mesmo grupo «pintura» das dez tintas, mas só
  // Gelo e Transparente existem como acabamento de boca.
  const opcoesDoCampo = campo => {
    const todas = cfg?.cores?.[campo.grupo] || [];
    if (!Array.isArray(campo.apenas) || !campo.apenas.length) return todas;
    const querem = campo.apenas.map(x => String(x).toLowerCase());
    return todas.filter(c => querem.includes(String(c.name).toLowerCase()));
  };

  // §10: só "1 cor" e "Arte colorida". Quem é quem sai do cadastro (o
  // processo de uma cor e o colorido), não de nomes escritos aqui.
  const processoUmaCor = useMemo(
    () => (cfg?.processos || []).find(p => p.max_cores === 1) || null, [cfg]);
  const processoColorido = useMemo(
    () => (cfg?.processos || []).find(p => !p.max_cores || p.max_cores > 1) || null, [cfg]);

  const personalizado = estado.tipo_pedido !== 'liso';
  const gabarito = cfg?.gabarito || null;
  const temGabarito = !!(gabarito?.altura_mm && gabarito?.largura_mm);
  const embalagem = cfg?.embalagem || {};

  // ── O preço, a cada mexida ────────────────────────────────
  useEffect(() => {
    if (!cfg || !estado.acabamento_id) return;
    let vivo = true;
    setCalculando(true);
    const t = setTimeout(async () => {
      try {
        const r = await api.post('/preco', {
          modelo: chave,
          acabamento_id: estado.acabamento_id,
          processo_id: personalizado ? estado.processo_id : null,
          quantidade: estado.quantidade,
          campos: estado.campos,
          tipo_pedido: estado.tipo_pedido,
        });
        if (vivo) setPreco(r);
      } catch (err) {
        if (vivo) setPreco(p => (p ? { ...p, problemas: [err.message], ok: false } : null));
      } finally {
        if (vivo) setCalculando(false);
      }
    }, 350);
    return () => { vivo = false; clearTimeout(t); };
  }, [cfg, chave, estado.acabamento_id, estado.processo_id, estado.quantidade,
      estado.campos, estado.tipo_pedido, personalizado]);

  const escolhaVisual = useMemo(() => {
    const campos = {};
    for (const campo of acabamento?.campos || []) {
      const id = estado.campos?.[campo.key];
      if (id) campos[campo.key] = opcoesDoCampo(campo).find(c => c.id === id) || null;
    }
    return { acabamento, campos };
  }, [acabamento, estado.campos, cfg]);

  const facesArte = estado.projeto?.faces || {};
  const arteFrente = personalizado ? facesArte.frente || null : null;
  const arteVerso = personalizado && estado.posicao === 'frente_verso' ? facesArte.verso || null : null;

  const podeFechar = !!preco?.ok && !calculando;

  function montarItem() {
    return {
      modelo: chave,
      nome: preco?.nome || cfg?.modelo?.nome,
      codigo: preco?.codigo,
      // O produto que a escolha virou. Vai junto porque o carrinho
      // precisa dele para cotar frete (peso e caixa saem do produto) —
      // e não para calcular preço: preço quem refaz é o servidor.
      produto_id: preco?.produto_id || null,
      acabamento_id: estado.acabamento_id,
      acabamento: acabamento?.nome || null,
      tipo_pedido: estado.tipo_pedido,
      campos: estado.campos,
      // Os rótulos legíveis viajam junto só para o carrinho conseguir
      // mostrar "Cor base: Rosa" sem ter que perguntar ao servidor.
      resumo: Object.fromEntries((acabamento?.campos || [])
        .map(c => [c.label, escolhaVisual.campos[c.key]?.name])
        .filter(([, v]) => v)),
      processo_id: personalizado ? estado.processo_id : null,
      impressao: personalizado
        ? (cfg?.processos || []).find(p => p.id === estado.processo_id)?.nome || null
        : null,
      posicao: personalizado ? estado.posicao : null,
      projeto_id: estado.projeto?.id || null,
      previa: personalizado ? facesArte.frente || null : null,
      quantidade: preco?.quantidade || 0,
      quantidade_minima: preco?.quantidade_minima || 1,
      valor_unitario: preco?.valor_unitario || 0,
    };
  }

  function adicionar(depois) {
    if (!podeFechar) {
      toast.error(preco?.problemas?.[0] || 'Complete a configuração do produto.');
      return;
    }
    carrinho.adicionar(montarItem());
    limparRascunho(chave);
    toast.success('Item adicionado ao carrinho');
    if (depois === 'continuar') navigate('/personalizados');
    else if (depois) navigate(`/personalizados/carrinho?acao=${depois}&pagamento=${estado.pagamento}`);
    else setEstado({ ...INICIAL, acabamento_id: estado.acabamento_id });
  }

  function irParaArte() {
    if (!temGabarito) {
      toast.error('Este produto ainda não tem gabarito de arte. Fale com um atendente.');
      return;
    }
    gravarRascunho(chave, estado);
    navigate(`/personalizados/arte/${chave}`);
  }

  if (isLoading) {
    return (
      <CatalogoShell titulo="Carregando…">
        <div className="flex justify-center py-24">
          <Loader2 size={30} className="animate-spin" style={{ color: NEON.azul }} />
        </div>
      </CatalogoShell>
    );
  }
  if (error || !cfg?.modelo) {
    return (
      <CatalogoShell titulo="Modelo não encontrado">
        <p className="text-center py-10 text-sm" style={{ color: '#fca5a5' }}>
          {error?.message || 'Esse modelo saiu do catálogo.'}
        </p>
        <div className="max-w-xs mx-auto">
          <Botao icone={ArrowLeft} onClick={() => navigate('/personalizados')}>Voltar ao catálogo</Botao>
        </div>
      </CatalogoShell>
    );
  }

  const ocasioes = ocasioesData?.ocasioes || [];
  const prazo = regras?.prazo_producao;

  return (
    <CatalogoShell
      titulo="Configurar Produto, Gerar Orçamento e Pagamento"
      subtitulo="Selecione o modelo, acabamento, personalização e forma de pagamento."
      trilha={[
        { nome: 'Catálogo', para: '/personalizados' },
        { nome: cfg.modelo.base },
        { nome: preco?.nome || cfg.modelo.nome },
      ]}>

      {/* `items-start` + `sticky` nas colunas 2 e 3: a coluna 1 é MUITO mais
          alta que as outras duas, e sem isso o cliente rola até a quantidade
          com o resumo e os botões já fora da tela — decidindo às cegas. */}
      {/* UMA NUMERAÇÃO SÓ, DESCENDO.
          A tela tinha três colunas e DUAS contagens ao mesmo tempo: 1‑2‑3
          à esquerda e A‑B‑C à direita. Quem chega não sabe por onde
          começar nem quando acabou, e as três colunas terminavam em
          alturas diferentes — 1255, 706 e 865 pixels — deixando um buraco
          embaixo que parecia tela cortada.

          Agora são duas. À esquerda as ETAPAS, numeradas 1 a 4 de cima
          para baixo, na ordem em que se responde. À direita o que está
          sendo comprado: a peça, o preço e os botões, grudado no topo,
          sempre visível enquanto se rola as etapas. */}
      <div className="grid gap-4 items-start xl:grid-cols-[minmax(0,1.35fr)_minmax(330px,0.65fr)]">

        {/* ═══ ESQUERDA — as etapas, na ordem ═══
            `min-w-0` nas duas colunas: sem ele um filho largo demais
            estica a coluna, a coluna estica a grade e a página inteira
            fica mais larga que o celular. */}
        <div className="space-y-4 min-w-0">

          <Painel titulo="1. Produto e Configuração" cor={NEON.ciano} icone={Box}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Rotulo>Modelo do produto</Rotulo>
                {/* Sem `truncate`: "Long Drink Degradê com Borda…" cortado é o
                    cliente sem saber o que está comprando. Duas linhas custam
                    menos que essa dúvida. */}
                <div className="rounded-lg px-3 py-2 text-[13.5px] flex items-start gap-2 min-h-[42px]"
                  style={{ background: 'rgba(255,255,255,0.045)', border: '1px solid rgba(255,255,255,0.13)', color: NEON.texto }}>
                  <Check size={14} className="mt-1 shrink-0" style={{ color: NEON.ciano }} />
                  <span className="leading-snug">{preco?.nome || cfg.modelo.nome}</span>
                </div>
              </div>

              {/* Este é o catálogo de PERSONALIZADOS: escolher "liso"
                  aqui levava o cliente para o produto errado — liso se
                  compra na /loja, que tem preço e caixa próprios. O tipo
                  fica visível para o cliente saber o que está pedindo,
                  mas não é mais uma escolha. */}
              <div>
                <Rotulo>Tipo de pedido</Rotulo>
                <Opcao titulo="Personalizado" icone={PenTool} cor={NEON.roxo} quebrar ativo />
              </div>
            </div>

            {!personalizado && (
              <Nota icone={Info} cor={NEON.ciano}>
                No modo liso, caixa mínima de {embalagem.caixa_qtd || 100} un.
                {embalagem.max_cores_caixa ? ` e múltiplo de ${embalagem.max_cores_caixa} cores.` : '.'}
              </Nota>
            )}

            {/* O SELETOR DE ACABAMENTO SAIU DAQUI.
                Eram catorze chips — Degradê, Bicolor, Tricolor, Jateado,
                Efeito Gelo, Borda Metalizada e as versões "com Borda" —
                logo abaixo do produto que o cliente acabou de escolher.
                O pedido do catálogo é o copo cadastrado, e o acabamento
                é combinado com a Lyon; oferecer catorze caminhos ali era
                pedir uma decisão que não é do cliente e que a vitrine
                nem promete cumprir.

                O acabamento CONTINUA existindo por baixo: o efeito de
                abertura escolhe o primeiro da lista, e é dele que saem
                os campos de cor, o preço e o item que vai para o
                carrinho. O que saiu foi a pergunta, não o dado. */}

            {/* OS CAMPOS DA PEÇA. Vêm do acabamento, um a um. Nenhum
                está escrito nesta tela — acabamento novo no cadastro
                muda a lista sem deploy. */}
            <div className="mt-4">
              <Rotulo>Cores e opções da peça</Rotulo>
              {acabamento?.campos?.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {acabamento.campos.map(campo => {
                    const opcoes = opcoesDoCampo(campo);
                    const valor = estado.campos?.[campo.key] || '';
                    const atual = opcoes.find(o => o.id === valor);
                    // O ERRO MORA NO CAMPO. Antes a lista "Falta informar: Cor
                    // base" ficava três colunas à direita, embaixo dos botões:
                    // o cliente lia o problema num canto da tela e tinha que
                    // procurar o campo no outro.
                    const faltando = campo.obrigatorio && !valor && opcoes.length > 0;
                    return (
                      <div key={campo.key}>
                        <Rotulo>
                          {campo.label}
                          {campo.obrigatorio
                            ? <span style={{ color: faltando ? '#fca5a5' : NEON.fraco }}> *</span>
                            : ' (opcional)'}
                        </Rotulo>
                        <div className="relative">
                          <Seletor value={valor}
                            onChange={e => mudar({ campos: { ...estado.campos, [campo.key]: e.target.value } })}
                            style={{
                              paddingLeft: atual ? 30 : 12,
                              ...(faltando ? { borderColor: 'rgba(252,165,165,0.75)' } : {}),
                            }}>
                            <option value="">Selecione…</option>
                            {opcoes.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </Seletor>
                          {atual && (
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                              <Bolinha hex={atual.hex} />
                            </span>
                          )}
                        </div>
                        {!opcoes.length ? (
                          <p className="text-[10.5px] mt-1" style={{ color: '#fca5a5' }}>
                            Sem opção liberada — fale com um atendente.
                          </p>
                        ) : faltando ? (
                          <p className="text-[10.5px] mt-1" style={{ color: '#fca5a5' }}>
                            Escolha para continuar
                          </p>
                        ) : null}
                      </div>
                    );
                  })}

                  {personalizado && (
                    <div>
                      <Rotulo>Linha de impressão</Rotulo>
                      <div className="rounded-lg px-3 py-2.5 text-[13px] flex items-center gap-2"
                        style={{ background: 'rgba(255,255,255,0.03)', border: '1px dashed rgba(255,255,255,0.16)', color: NEON.suave }}>
                        <Droplet size={13} style={{ color: NEON.ciano }} />
                        Tinta {cfg.modelo.linha || processoUmaCor?.linha_tinta || 'compatível'}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[12px]" style={{ color: NEON.fraco }}>
                  Este acabamento não pede campos adicionais.
                </p>
              )}
            </div>
          </Painel>

          {personalizado && (
            <Painel titulo="2. Personalização" cor={NEON.roxo} icone={Palette}>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Rotulo>Tipo de impressão</Rotulo>
                  <div className="grid grid-cols-2 gap-2">
                    {processoUmaCor && (
                      <Opcao titulo="1 cor" icone={Droplet} cor={NEON.ciano}
                        ativo={estado.processo_id === processoUmaCor.id}
                        onClick={() => mudar({ processo_id: processoUmaCor.id })} />
                    )}
                    {processoColorido && (
                      <Opcao titulo="Arte colorida" icone={Palette} cor={NEON.magenta}
                        ativo={estado.processo_id === processoColorido.id}
                        onClick={() => mudar({ processo_id: processoColorido.id })} />
                    )}
                  </div>
                </div>

                <div>
                  <Rotulo>Posição da arte</Rotulo>
                  <div className="grid grid-cols-2 gap-2">
                    <Opcao titulo="Frente" icone={Box} cor={NEON.azul}
                      ativo={estado.posicao === 'frente'}
                      onClick={() => mudar({ posicao: 'frente' })} />
                    {gabarito?.permite_verso !== false && (
                      <Opcao titulo="Frente e verso" icone={Layers} cor={NEON.ciano}
                        ativo={estado.posicao === 'frente_verso'}
                        onClick={() => mudar({ posicao: 'frente_verso' })} />
                    )}
                  </div>
                </div>
              </div>

              {/* O bloco do editor de arte */}
              <div className="mt-4 p-3.5 rounded-xl" style={bordaNeon(NEON.magenta, 0.6)}>
                <div className="flex flex-wrap gap-4">
                  <div className="w-24 h-24 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: corComAlfa(NEON.roxo, 0.14), border: `1px solid ${corComAlfa(NEON.roxo, 0.5)}` }}>
                    {facesArte.frente
                      ? <div className="w-full h-full p-2" style={{ color: '#e9d5ff' }}
                          dangerouslySetInnerHTML={{ __html: facesArte.frente }} />
                      : <PenTool size={30} style={{ color: NEON.roxo }} />}
                  </div>

                  <div className="flex-1 min-w-[190px]">
                    <p className="font-semibold text-[15px]" style={{ color: NEON.texto }}>
                      {estado.projeto ? 'Sua arte está pronta' : 'Crie sua própria arte'}
                    </p>
                    <p className="text-[12px] mt-1 leading-relaxed" style={{ color: NEON.suave }}>
                      {estado.projeto
                        ? 'Você pode abrir o editor de novo para trocar nomes, data ou frase.'
                        : 'Escolha a ocasião do evento e abra o editor para montar sua arte.'}
                    </p>
                    <div className="mt-3 max-w-[240px]">
                      <Botao cheio icone={PenTool} onClick={irParaArte}>
                        {estado.projeto ? 'Editar sua arte' : 'Criar sua arte'}
                      </Botao>
                    </div>
                  </div>

                  <div className="flex-1 min-w-[210px]">
                    <Rotulo>Ocasião do evento (opcional)</Rotulo>
                    <div className="flex flex-wrap gap-1.5">
                      {ocasioes.filter(o => o.destaque).map(o => (
                        <Opcao key={o.id} titulo={o.nome} cor={NEON.rosa}
                          ativo={estado.ocasiao === o.id}
                          onClick={() => mudar({ ocasiao: estado.ocasiao === o.id ? null : o.id })} />
                      ))}
                      {ocasioes.some(o => !o.destaque) && (
                        <Opcao titulo="+ Mais opções" cor={NEON.azul} onClick={irParaArte} />
                      )}
                    </div>
                  </div>
                </div>

                <Nota icone={Info} cor={NEON.roxo}>
                  Você poderá escolher um modelo pronto, editar nomes, datas e frases antes de confirmar.
                </Nota>
              </div>

              {!temGabarito && (
                <Nota icone={AlertTriangle} cor="#fbbf24">
                  Este modelo ainda está sem o gabarito de arte cadastrado. Escolha o produto e
                  fale com um atendente para montar a personalização.
                </Nota>
              )}
            </Painel>
          )}

          <Painel titulo={personalizado ? '3. Entrega e Evento' : '2. Entrega e Evento'}
            cor={NEON.azul} icone={CalendarDays}>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Rotulo>Quantidade</Rotulo>
                <div className="relative">
                  <Campo type="number" inputMode="numeric" min={preco?.quantidade_minima || 1}
                    value={estado.quantidade}
                    placeholder={String(preco?.quantidade_minima || 1)}
                    onChange={e => mudar({ quantidade: e.target.value })}
                    style={{ paddingRight: 36 }} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] pointer-events-none"
                    style={{ color: NEON.fraco }}>un</span>
                </div>
              </div>
              <div>
                <Rotulo>CEP</Rotulo>
                <Campo inputMode="numeric" maxLength={9} placeholder="00000-000"
                  value={estado.cep}
                  onChange={e => mudar({
                    cep: e.target.value.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'),
                  })} />
              </div>
              <div>
                <Rotulo>Data do evento</Rotulo>
                <Campo type="date" min={HOJE()} value={estado.data_evento}
                  onChange={e => mudar({ data_evento: e.target.value })}
                  style={{ colorScheme: 'dark' }} />
              </div>
            </div>
            <Nota icone={Info} cor={NEON.azul}>
              A data do evento ajuda a calcular prazo e entrega.
            </Nota>
          </Painel>

          <Painel titulo={`${personalizado ? 4 : 3}. Forma de pagamento`} cor={NEON.roxo} icone={CreditCard}>
            <div className="grid grid-cols-3 gap-2">
              <Opcao titulo="PIX" icone={QrCode} cor={NEON.ciano}
                ativo={estado.pagamento === 'pix'} onClick={() => mudar({ pagamento: 'pix' })} />
              <Opcao titulo="Cartão" icone={CreditCard} cor={NEON.azul}
                ativo={estado.pagamento === 'cartao'} onClick={() => mudar({ pagamento: 'cartao' })} />
              <Opcao titulo="Boleto" icone={Barcode} cor={NEON.roxo}
                ativo={estado.pagamento === 'boleto'} onClick={() => mudar({ pagamento: 'boleto' })} />
            </div>
            <Nota icone={Info} cor={NEON.roxo}>
              Ao clicar em "Confirmar pedido", o sistema solicitará seu cadastro para prosseguir.
            </Nota>
          </Painel>
        </div>

        {/* ═══ DIREITA — a peça, o preço e os botões ═══ */}
        <div className="space-y-3 min-w-0 xl:sticky xl:top-4">
          <Painel titulo="Como vai ficar" cor={NEON.azul} icone={Box}>
            {/* O PALCO BRANCO.
                Fundo branco atrás de peça é o estúdio, e é o que o
                cliente já espera de foto de produto: sobre o azul-noite
                do catálogo a caneca preta some e a branca vira um borrão.
                O branco é UM SÓ, cobrindo a prévia inteira — frente,
                verso e as legendas. Um cartãozinho por foto emoldurava
                cada copo e os separava; o palco inteiro mostra as duas
                faces da MESMA peça. */}
            <div className="rounded-xl px-2 sm:px-3 py-4 overflow-hidden" style={{ background: '#ffffff' }}>
              <div className="flex items-end justify-center gap-2 sm:gap-4">
                <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteFrente} face="frente"
                  gabarito={gabarito} altura={estado.posicao === 'frente_verso' ? 190 : 216} />
                {personalizado && estado.posicao === 'frente_verso' && (
                  <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteVerso} face="verso"
                    gabarito={gabarito} altura={190} />
                )}
              </div>

              {/* O copo cinza sem cor escolhida parece defeito. Uma linha
                  explicando transforma "quebrou" em "falta escolher". */}
              {!escolhaVisual.campos?.cor_base && !escolhaVisual.campos?.cor_produto && (
                <p className="text-[11px] text-center mt-2" style={{ color: '#64748b' }}>
                  Escolha as cores ao lado para ver o copo como ele vai ficar.
                </p>
              )}
            </div>

            <div className="mt-3">
              <Botao icone={Maximize2} cor={NEON.ciano} onClick={() => setTelaCheia(true)}>
                Ver em tela cheia
              </Botao>
            </div>
          </Painel>

          <div className="space-y-2.5">
            <Botao icone={ShoppingCart} cor={NEON.magenta} onClick={() => adicionar(null)}
              disabled={!podeFechar}>
              Adicionar ao carrinho
            </Botao>
            <Botao icone={ArrowLeft} cor={NEON.azul} onClick={() => navigate('/personalizados')}>
              Continuar comprando
            </Botao>
            <Botao icone={FileText} cor={NEON.roxo} onClick={() => adicionar('orcamento')}
              disabled={!podeFechar}>
              Gerar orçamento
            </Botao>
            <Botao cheio icone={Lock} onClick={() => adicionar('pagamento')} disabled={!podeFechar}>
              Confirmar pedido
            </Botao>

            {/* Os campos que faltam já estão marcados em vermelho no painel 1.
                Aqui vai só o motivo de o botão estar apagado — repetir a lista
                inteira seria a mesma informação em dois lugares. */}
            {!podeFechar && preco?.problemas?.length > 0 && (
              <p className="text-[11.5px] px-1 flex items-start gap-1.5" style={{ color: '#fca5a5' }}>
                <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                <span>
                  {preco.problemas.length === 1
                    ? preco.problemas[0]
                    : `Complete os ${preco.problemas.length} campos marcados em "1. Produto e Configuração".`}
                </span>
              </p>
            )}
          </div>

          <Painel titulo="Resumo do pedido" cor={NEON.rosa} icone={FileText}>
            <p className="font-semibold text-[14px] leading-snug" style={{ color: NEON.texto }}>
              {preco?.nome || cfg.modelo.nome}
            </p>

            <dl className="mt-3 space-y-1.5 text-[12px]">
              <Linha rotulo="Categoria" valor={acabamento?.nome} />
              {(acabamento?.campos || []).map(campo => (
                <Linha key={campo.key} rotulo={campo.label}
                  valor={escolhaVisual.campos[campo.key]?.name} />
              ))}
              {personalizado && (
                <Linha rotulo="Impressão"
                  valor={(cfg.processos || []).find(p => p.id === estado.processo_id)?.nome} />
              )}
              {personalizado && estado.projeto && (
                <Linha rotulo="Arte" valor={estado.posicao === 'frente_verso' ? 'Frente e verso' : 'Frente'} />
              )}
              <Linha rotulo="Qtd" valor={preco?.quantidade ? `${preco.quantidade} un` : null} />
            </dl>

            <div className="mt-3 pt-3 space-y-1.5 text-[12.5px]"
              style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <Valor rotulo="Valor dos produtos" valor={preco?.valor_produtos} destaque />
              <Valor rotulo="Valor unitário" valor={preco?.valor_unitario} />
            </div>

            <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12.5px]" style={{ color: NEON.suave }}>Retirar no local?</span>
                <div className="flex gap-1.5">
                  <Opcao titulo="Sim" cor={NEON.ciano} ativo={estado.retirar}
                    onClick={() => mudar({ retirar: true })} />
                  <Opcao titulo="Não" cor={NEON.azul} ativo={!estado.retirar}
                    onClick={() => mudar({ retirar: false })} />
                </div>
              </div>

              <div className="mt-2 space-y-1.5 text-[12.5px]">
                {estado.retirar
                  ? <Valor rotulo="Frete estimado" valor={0} />
                  : (
                    <div className="flex items-baseline justify-between gap-2">
                      <span style={{ color: NEON.suave }}>Frete estimado</span>
                      <span className="text-right" style={{ color: NEON.fraco }}>
                        {estado.cep ? 'calculado no fechamento' : 'informe o CEP'}
                      </span>
                    </div>
                  )}
                {prazo && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ color: NEON.suave }}>Prazo estimado</span>
                    <span style={{ color: NEON.texto }}>{prazo.min} a {prazo.max} dias úteis</span>
                  </div>
                )}
                {regras?.validade_dias && (
                  <div className="flex items-baseline justify-between gap-2">
                    <span style={{ color: NEON.suave }}>Validade da cotação</span>
                    <span style={{ color: NEON.texto }}>{regras.validade_dias} dias</span>
                  </div>
                )}
              </div>
            </div>

            {calculando && (
              <p className="text-[11px] mt-3 flex items-center gap-1.5" style={{ color: NEON.fraco }}>
                <Loader2 size={11} className="animate-spin" /> atualizando valores…
              </p>
            )}

            {prazo && (
              <div className="mt-3 p-2.5 rounded-lg text-[11px] leading-relaxed flex items-start gap-2"
                style={{ background: corComAlfa(NEON.ciano, 0.07), color: NEON.suave }}>
                <Info size={13} className="shrink-0 mt-0.5" style={{ color: NEON.ciano }} />
                <span>
                  Prazo de produção: {prazo.min} a {prazo.max} dias úteis. Em caso de urgência ou
                  dúvidas, fale com um de nossos atendentes.
                </span>
              </div>
            )}
          </Painel>

          {/* UM botão de atendimento na tela inteira. */}
          <a href="https://wa.me/?text=Ol%C3%A1%2C%20estou%20montando%20um%20pedido%20no%20cat%C3%A1logo%20da%20Lyon%20Copos"
            target="_blank" rel="noreferrer"
            className="w-full rounded-xl py-3 px-4 font-semibold text-[14px] flex items-center justify-center gap-2"
            style={{ ...bordaNeon(NEON.magenta), color: NEON.magenta }}>
            <Headphones size={17} /> Falar com atendente
          </a>


          <Painel titulo="Informações importantes" cor={NEON.azul} icone={Info}>
            <p className="text-[11.5px] leading-relaxed" style={{ color: NEON.suave }}>
              Após o pagamento, o sistema gera automaticamente o número do pedido
              (<b style={{ color: NEON.texto }}>PV-000123</b>) e o acesso para acompanhamento
              com CPF + data de nascimento.
            </p>
            <Link to="/acompanhar"
              className="text-[12px] mt-2.5 inline-flex items-center gap-1.5" style={{ color: NEON.ciano }}>
              <PackageCheck size={13} /> Acompanhar um pedido
            </Link>
          </Painel>
        </div>
      </div>

      {/* O copo em tela cheia. O 3D exigia carregar a biblioteca inteira
          de WebGL para mostrar um copo que o cliente só quer ver maior —
          e no celular fraco ele travava antes de girar. */}
      {telaCheia && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(4,8,22,0.97)' }}
          onClick={() => setTelaCheia(false)}>
          <div className="flex items-center justify-between px-5 py-3">
            <span className="text-[13px]" style={{ color: NEON.suave }}>
              {cfg?.modelo?.nome || 'Seu copo'}
            </span>
            <button type="button" onClick={() => setTelaCheia(false)}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', color: NEON.texto }} aria-label="Fechar">
              <X size={18} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center pb-8 px-4 overflow-auto"
            onClick={e => e.stopPropagation()}>
            {/* O mesmo palco branco da prévia pequena: ver maior não pode
                significar ver diferente. */}
            <div className="rounded-2xl px-3 sm:px-6 py-6 max-w-full flex items-end justify-center gap-3 sm:gap-8"
              style={{ background: '#ffffff' }}>
              <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteFrente} face="frente"
                gabarito={gabarito} altura={Math.min(520, window.innerHeight * 0.62)} />
              {personalizado && estado.posicao === 'frente_verso' && (
                <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteVerso} face="verso"
                  gabarito={gabarito} altura={Math.min(520, window.innerHeight * 0.62)} />
              )}
            </div>
          </div>
        </div>
      )}
    </CatalogoShell>
  );
}

/** Uma linha do resumo. Some quando não tem valor — resumo com "—" é ruído. */
function Linha({ rotulo, valor }) {
  if (!valor) return null;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt style={{ color: NEON.suave }}>{rotulo}</dt>
      <dd className="text-right font-medium" style={{ color: NEON.texto }}>{valor}</dd>
    </div>
  );
}

function Valor({ rotulo, valor, destaque }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span style={{ color: NEON.suave }}>{rotulo}</span>
      <span className={destaque ? 'font-bold' : 'font-medium'}
        style={{ color: destaque ? NEON.texto : 'rgba(255,255,255,0.86)' }}>
        {valor == null ? '—' : brl(valor)}
      </span>
    </div>
  );
}
