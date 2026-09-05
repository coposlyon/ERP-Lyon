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
  PenTool, Sparkles, AlertTriangle, PackageCheck, Check, Maximize2, X, ChevronDown,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from './api';
import {
  CatalogoShell, Painel, NEON, bordaNeon, corComAlfa,
  Rotulo, Opcao, Botao, Campo, Seletor, Bolinha, Nota, brl,
} from './ui';
import CopoPreview, { corDe } from './CopoPreview';
import { useCarrinho } from './carrinhoContexto';
import { lerRascunho, gravarRascunho, limparRascunho } from './rascunho';

const HOJE = () => new Date().toISOString().slice(0, 10);

/**
 * COMO SE CHAMA A ENÉSIMA COR — pela PARTE DO COPO que ela pinta.
 *
 * "Cor 1, Cor 2, Cor 3" não diz onde cada uma vai parar, e a cliente
 * escolhia às cegas: descobria a ordem só quando a peça chegava. Com
 * duas, a primeira é a de baixo e a segunda a de cima; com três entra o
 * meio entre elas — a mesma ordem que a prévia desenha.
 */
/**
 * UM SELETOR DE COR — a lista, a bolinha e mais nada.
 *
 * Mora fora do `Configurador` porque agora é usado em dois lugares (a
 * cor do copo, antes da impressão, e as cores de cima, depois dela).
 * Componente declarado DENTRO de outro nasce de novo a cada render, e o
 * navegador fecha a lista aberta no meio do clique.
 */
function SeletorDeCor({ opcoes, valor, aoTrocar, vazio }) {
  const atual = opcoes.find(o => o.id === valor) || null;
  return (
    <div className="relative">
      <Seletor value={valor} onChange={e => aoTrocar(e.target.value)}
        style={{ paddingLeft: atual ? 30 : 12 }}>
        <option value="">{vazio}</option>
        {opcoes.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </Seletor>
      {atual && (
        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
          <Bolinha hex={corDe(atual)} />
        </span>
      )}
    </div>
  );
}

const NOME_DA_FAIXA = (i, total) => {
  if (total < 2) return 'Cor';
  if (i === 0) return 'Cor 1 · parte de baixo';
  if (i === total - 1) return `Cor ${i + 1} · parte de cima`;
  return `Cor ${i + 1} · meio`;
};

/**
 * O QUE ESTE ACABAMENTO ABRE PARA A CLIENTE.
 *
 * "Tricolor" não diz o que vai acontecer; "escolhe 3 cores (Cor 1, Cor
 * 2, Cor da boca)" diz. A frase é montada dos campos que o acabamento
 * traz do cadastro — acabamento novo já nasce explicado, sem passar
 * por aqui.
 */
function oQueAbre(a) {
  const campos = a?.campos || [];
  if (!campos.length) return 'sem escolhas — o copo já vem assim';
  const nomes = campos.map(c => c.label).filter(Boolean);
  return `escolhe ${campos.length} ${campos.length === 1 ? 'cor' : 'cores'}`
    + (nomes.length ? ` (${nomes.join(', ')})` : '');
}

const INICIAL = {
  tipo_pedido: 'personalizado',
  acabamento_id: null,
  campos: {},
  processo_id: null,
  // Uma cor por posicao da arte: ['<id>', '<id>']. Quantas depende do
  // `max_cores` do tipo de impressao escolhido.
  cores_arte: [],
  posicao: 'frente',
  ocasiao: null,
  quantidade: '',
  cep: '',
  data_evento: '',
  retirar: false,
  pagamento: 'pix',
  projeto: null,
  // Os adicionais que a cliente marcou — ids do cadastro. Aqui não
  // mora preço nenhum: o valor é do servidor, sempre.
  adicionais: [],
};

export default function Configurador() {
  const { chave } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const carrinho = useCarrinho();

  /**
   * O RASCUNHO ENTRA POR CIMA DO INICIAL, e nunca no lugar dele.
   *
   * O rascunho é um retrato do estado de uma VERSÃO ANTERIOR da tela,
   * guardado no navegador da cliente. Quando um campo novo nasce aqui
   * — `adicionais` foi o primeiro —, quem estava com uma aba aberta
   * volta com um objeto que não tem esse campo, e a primeira linha que
   * fizer `estado.adicionais.includes(...)` derruba a tela inteira.
   * Foi exatamente o que aconteceu.
   *
   * Espalhar `|| []` por cada uso trata o sintoma e esquece um. O
   * espalhamento sobre INICIAL trata a causa: campo que o rascunho não
   * tem nasce com o padrão, e o campo que nascer amanhã já vem
   * protegido sem ninguém lembrar.
   */
  const [estado, setEstado] = useState(() => ({ ...INICIAL, ...(lerRascunho(chave) || {}) }));
  const [preco, setPreco] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  // UM GRUPO ABERTO POR VEZ. Dois abertos já são a parede de novo.
  const [grupoAberto, setGrupoAberto] = useState(null);
  // A personalização começa fechada: a maioria abre a página só para
  // ver o copo e o preço.
  const [querPersonalizar, setQuerPersonalizar] = useState(false);

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

  /**
   * A COR DO LINK É A COR DO COPO — e não depende de acabamento nenhum.
   *
   * Isto morava dentro do efeito do acabamento, que sai logo na
   * primeira linha quando o modelo não tem acabamento liberado. O LONG
   * DRINK está assim, e o clique no card da PÉROLA abria o
   * configurador com a cor em branco: a cliente respondia na vitrine e
   * a tela perguntava de novo — e pior, mostrava a lista de impressões
   * do modelo inteiro até ela responder.
   *
   * Uma vez por abertura. Depois disto quem manda é o seletor da tela,
   * e reaplicar o link desfaria a escolha dela.
   */
  const corDoLinkAplicada = useRef(false);
  useEffect(() => {
    if (corDoLinkAplicada.current) return;
    const pedida = params.get('cor');
    if (!pedida || !cfg?.cores?.produto?.length) return;
    corDoLinkAplicada.current = true;

    const chave = txt => String(txt || '').normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
    const alvo = chave(pedida);
    const achada = cfg.cores.produto.find(c => chave(c.name) === alvo);
    if (!achada) return;

    setEstado(a => ((a.cores_arte || [])[0] === achada.id
      ? a
      : { ...a, cores_arte: [achada.id, ...(a.cores_arte || []).slice(1)] }));
  }, [cfg, params]);

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

  // Serve só para escrever a linha de tinta no cabeçalho do copo. A
  // ESCOLHA do processo não passa mais por aqui: a tela lista todos os
  // que o cadastro liberou (ver "Tipo de impressão" mais abaixo).
  const processoUmaCor = useMemo(
    () => (cfg?.processos || []).find(p => p.max_cores === 1) || null, [cfg]);

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
          // O servidor confere se a quantidade de cores bate com a
          // impressao escolhida — a tela ja pede o numero certo, mas a
          // tela e do cliente e a requisicao e de quem quiser.
          cores_arte: personalizado ? estado.cores_arte : [],
          tipo_pedido: estado.tipo_pedido,
          adicionais: estado.adicionais,
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
      estado.campos, estado.tipo_pedido, estado.adicionais, personalizado]);

  /**
   * O ADICIONAL QUE DEIXOU DE EXISTIR PARA ESTE COPO.
   *
   * Trocar a cor troca o PRODUTO, e com ele as regras: uma borda que
   * valia para o azul pode não valer para o preto. O servidor já ignora
   * o que não se aplica — mas deixar o quadradinho marcado na tela
   * mostraria uma escolha que não está sendo cobrada, e a conta pareceria
   * errada sem estar.
   */
  useEffect(() => {
    const disponiveis = preco?.adicionais_disponiveis;
    if (!disponiveis || !estado.adicionais.length) return;
    const validos = new Set(disponiveis.map(a => a.item_id));
    const restam = estado.adicionais.filter(id => validos.has(id));
    if (restam.length !== estado.adicionais.length) mudar({ adicionais: restam });
  }, [preco?.adicionais_disponiveis]); // eslint-disable-line

  /**
   * OS ADICIONAIS AGRUPADOS PELO NOME.
   *
   * O cadastro guarda "Borda Metalizada" dezoito vezes, uma por cor —
   * é o certo lá, porque cada cor tem preço, foto e estoque próprios.
   * Aqui isso vira o oposto do útil: dezoito linhas repetindo a mesma
   * palavra, com a única coisa que muda (a cor) escondida no fim.
   *
   * Agrupar devolve a ordem em que a cliente pensa: primeiro se quer
   * borda, depois qual cor. E é o agrupamento que torna a escolha
   * ÚNICA dentro do grupo possível — um copo não leva duas bordas.
   */
  // A NUMERAÇÃO DOS PAINÉIS, CONTADA E NÃO ESCRITA À MÃO.
  //
  // Cada painel trazia o próprio número numa continha (`personalizado ?
  // 3 : 2`), e bastou entrar um painel novo no meio para a tela mostrar
  // dois "4" — porque um dos cinco lugares ficou para trás. Com o
  // contador, painel novo não pede que ninguém se lembre de somar um em
  // todos os outros.
  const numeroDoPainel = (() => {
    let n = 0;
    return () => ++n;
  })();

  /**
   * OU É BORDA, OU É TAMPA — nunca as duas.
   *
   * A tampa encaixa no aro; a borda metalizada É o aro pintado. Uma
   * cobre a outra: o copo sai com a borda que a cliente pagou e não
   * consegue ver, e a reclamação chega depois de entregue.
   *
   * A BORDA SE RECONHECE PELO CADASTRO (`tipo === 'borda'`), que é como
   * a prévia já a reconhece. A tampa não tem tipo próprio — é um
   * acessório entre outros —, então vai pelo nome, e é a única coisa
   * escrita aqui. No dia em que existir "tipo: tampa" no cadastro, esta
   * linha some e nada mais muda.
   */
  const ehTampa = a => /\btampa/i.test(String(a?.nome || ''));
  const brigaCom = a => (a?.tipo === 'borda' ? ehTampa : (ehTampa(a) ? (x => x?.tipo === 'borda') : null));

  const gruposAdicionais = useMemo(() => {
    const porNome = new Map();
    for (const a of preco?.adicionais_disponiveis || []) {
      if (!porNome.has(a.nome)) porNome.set(a.nome, []);
      porNome.get(a.nome).push(a);
    }
    return [...porNome.entries()].map(([nome, opcoes]) => ({
      nome,
      opcoes,
      // "A partir de" só faz sentido com o menor preço do grupo — é o
      // número que a cliente usa para decidir se abre o grupo.
      precoMin: Math.min(...opcoes.map(o => Number(o.preco) || 0)),
    }));
  }, [preco?.adicionais_disponiveis]);

  /**
   * O QUE ESTÁ MARCADO, LIDO DA TELA E NÃO DA RESPOSTA DO SERVIDOR.
   *
   * Esta lista saía de `preco.adicionais_escolhidos` — ou seja, só
   * existia depois do debounce de 350 ms MAIS a ida ao servidor. O
   * quadradinho acendia na hora e a prévia continuava mostrando a borda
   * ANTERIOR por segundos, o que lia como travamento: a cliente clica
   * de novo, e aí troca duas vezes.
   *
   * O catálogo de opções (`adicionais_disponiveis`) já está na mão e
   * NÃO muda quando se troca de borda — só quando muda o produto. Então
   * a identidade do que foi escolhido é resposta local e imediata. O
   * DINHEIRO continua vindo do servidor: aqui se decide o que mostrar,
   * lá se decide o que cobrar.
   */
  const adicionaisEscolhidos = useMemo(
    () => (preco?.adicionais_disponiveis || [])
      .filter(a => estado.adicionais.includes(a.item_id)),
    [preco?.adicionais_disponiveis, estado.adicionais]);

  /**
   * A BORDA QUE A PRÉVIA VAI PINTAR. Quem decide o que é borda é o
   * cadastro (`tipo === 'borda'`), não uma lista de nomes escrita aqui
   * que envelhece na primeira borda nova.
   */
  const bordaEscolhida = useMemo(
    () => adicionaisEscolhidos.find(a => a.tipo === 'borda') || null,
    [adicionaisEscolhidos]);

  // Tudo que NÃO é borda vai ao lado do copo: canudo, tampa, e o que a
  // Lyon cadastrar amanhã. A regra é por exclusão de propósito — item
  // novo aparece sozinho, sem ninguém lembrar de listá-lo aqui.
  const acessoriosEscolhidos = useMemo(
    () => adicionaisEscolhidos.filter(a => a.tipo !== 'borda'),
    [adicionaisEscolhidos]);

  /**
   * QUANTAS CORES A ARTE TEM — e quais.
   *
   * "Serigrafia 2 cores" imprime duas cores; a tela precisa perguntar
   * QUAIS duas. Antes ela nao perguntava nenhuma: o cliente escolhia
   * "2 cores", pagava por duas, e a producao recebia um pedido sem
   * dizer quais — e alguem ligava para perguntar.
   *
   * AS OPCOES SAO AS CORES DA CATEGORIA, e nao uma paleta a parte. O
   * servidor manda no grupo «pintura» exatamente as cores que ESTE
   * modelo tem no cadastro — as mesmas da vitrine (ver `configuracaoDoModelo`).
   * Antes eram doze nomes genericos que nao existem na fabrica, e o
   * pedido saia com uma cor que ninguem consegue produzir.
   *
   * `max_cores` vazio = arte colorida (transfer, DTF): nao se escolhe
   * cor de tinta, a arte ja vem colorida.
   */
  const processo = useMemo(
    () => (cfg?.processos || []).find(p => p.id === estado.processo_id) || null,
    [cfg, estado.processo_id]);

  const coresDaTinta = useMemo(() => {
    const grupos = cfg?.cores || {};
    return grupos.pintura?.length ? grupos.pintura : (Object.values(grupos)[0] || []);
  }, [cfg]);

  const quantasCores = Number(processo?.max_cores) || 0;

  // AS CORES ESCOLHIDAS, POR INTEIRO — e não só o hexadecimal.
  // Cada uma é um produto do cadastro, com foto: é dela que a prévia
  // tira a peça a mostrar (ver `escolhaVisual`, logo abaixo). O
  // hexadecimal continua saindo daqui para pintar as faixas.
  //
  // `corDe` E NAO `.hex`: a maioria das cores esta cadastrada sem hex, e
  // pegar o campo cru devolvia `undefined` para todas — o `filter`
  // esvaziava a lista e a previa nao pintava nada.
  const coresEscolhidas = useMemo(
    () => (estado.cores_arte || [])
      .map(id => coresDaTinta.find(c => c.id === id))
      .filter(Boolean),
    [estado.cores_arte, coresDaTinta]);

  const hexDasCoresArte = useMemo(
    () => coresEscolhidas.map(c => corDe(c)), [coresEscolhidas]);

  /**
   * O QUE ESTA COR LIBERA — e não o que o modelo inteiro libera.
   *
   * A regra de catálogo é POR COR: a Lyon liberou o Transfer só no LONG
   * DRINK TRANSPARENTE. Só que a página é do MODELO — as vinte e quatro
   * cores juntas —, e o servidor mandava a UNIÃO de tudo que alguma cor
   * aceita. Resultado: o Transfer aparecia nas vinte e quatro, e a
   * regra que ela acabou de gravar parecia não ter sido gravada.
   *
   * O servidor agora manda `por_cor`: para cada cor do modelo, o que
   * ela aceita. Escolhida a cor, esta tela mostra o dela. Sem cor
   * escolhida não há como filtrar — e aí a lista é a do modelo, com o
   * aviso de que ela ainda vai encolher.
   */
  /**
   * O CAMPO DO ACABAMENTO QUE JÁ PERGUNTA A COR DA PEÇA.
   *
   * "Tradicional" pede «Cor do produto»; "Degradê" pede «Cor». Havendo
   * um deles, o seletor solto de "Cor do copo" seria a mesma pergunta
   * feita duas vezes na mesma tela.
   */
  const campoDeCor = useMemo(
    () => (acabamento?.campos || []).find(
      c => c.grupo === 'produto' || (c.grupo === 'pintura' && !c.apenas?.length)) || null,
    [acabamento]);

  /**
   * A COR DA PEÇA — venha ela de onde vier.
   *
   * É por ela que a tela sabe o que aquele copo aceita, e ela tem duas
   * portas: o campo «Cor do produto» do acabamento e o seletor de cor
   * da impressão. Lendo só a segunda, ligar o acabamento Tradicional
   * (que pergunta pela primeira) desligava o filtro por cor inteiro —
   * e o Transfer voltava a aparecer em todas.
   */
  const corDoCopo = useMemo(() => {
    if (campoDeCor?.grupo === 'produto') {
      const id = estado.campos?.[campoDeCor.key];
      const achada = (cfg?.cores?.produto || []).find(c => c.id === id);
      if (achada) return achada;
    }
    return coresEscolhidas[0] || null;
  }, [campoDeCor, estado.campos, cfg, coresEscolhidas]);

  /**
   * A COR DO ACABAMENTO ESPELHA NA PRIMEIRA COR DA IMPRESSÃO.
   *
   * Assim tudo que vem depois — a prévia, o preço, a conferência do
   * servidor — lê a cor de UM lugar só. E é o que segura o filtro de
   * pé na troca de acabamento: saindo do Tradicional para o Degradê, o
   * Degradê não tem campo de cor de produto, e sem o espelho a tela
   * perdia a cor e voltava a mostrar a lista do modelo inteiro.
   */
  useEffect(() => {
    if (campoDeCor?.grupo !== 'produto') return;
    const id = estado.campos?.[campoDeCor.key] || '';
    if (!id || (estado.cores_arte || [])[0] === id) return;
    setEstado(a => ({ ...a, cores_arte: [id, ...(a.cores_arte || []).slice(1)] }));
  }, [campoDeCor, estado.campos, estado.cores_arte]);
  const liberado = useMemo(
    () => (corDoCopo?.produto_id ? cfg?.por_cor?.[corDoCopo.produto_id] : null) || null,
    [cfg, corDoCopo]);

  const processosDaCor = useMemo(() => {
    const todos = cfg?.processos || [];
    return liberado ? todos.filter(p => liberado.processos.includes(p.id)) : todos;
  }, [cfg, liberado]);

  const acabamentosDaCor = useMemo(() => {
    const todos = cfg?.acabamentos || [];
    return liberado ? todos.filter(a => liberado.acabamentos.includes(a.id)) : todos;
  }, [cfg, liberado]);

  /**
   * TROCOU DE COR, O QUE NÃO VALE MAIS CAI.
   *
   * Escolher Transfer no transparente e depois trocar para Amarelo
   * Canário — que não faz Transfer — deixaria a tela com o botão aceso
   * numa opção que o servidor vai recusar no fechamento. Some na hora,
   * que é quando a cliente ainda consegue entender por quê.
   */
  useEffect(() => {
    if (!liberado) return;
    const patch = {};
    if (estado.processo_id && !liberado.processos.includes(estado.processo_id)) {
      patch.processo_id = null;
    }
    if (estado.acabamento_id && !liberado.acabamentos.includes(estado.acabamento_id)) {
      patch.acabamento_id = acabamentosDaCor[0]?.id || null;
    }
    if (Object.keys(patch).length) mudar(patch);
  }, [liberado, estado.processo_id, estado.acabamento_id, acabamentosDaCor, mudar]);

  const escolhaVisual = useMemo(() => {
    const campos = {};
    for (const campo of acabamento?.campos || []) {
      const id = estado.campos?.[campo.key];
      if (id) campos[campo.key] = opcoesDoCampo(campo).find(c => c.id === id) || null;
    }

    /**
     * A COR ESCOLHIDA É A PEÇA — e a prévia mostra A FOTO DELA.
     *
     * As cores oferecidas são as da categoria: cada uma é um produto de
     * verdade no cadastro, com foto de estúdio. Escolher "Azul
     * Translucido" e continuar vendo o copo verde da foto de referência
     * é a tela dizendo que não registrou o clique — e a cliente clica de
     * novo.
     *
     * Entra como `cor_produto` porque é exatamente isso que ela é, e
     * porque `cor_produto` é a primeira da ORDEM_DA_FOTO na prévia: a
     * peça de verdade ganha de qualquer tinta. Só entra quando o
     * acabamento não trouxe cor nenhuma — havendo campo de cor da peça,
     * quem manda é ele.
     */
    if (!campos.cor_produto && !campos.cor_base && coresEscolhidas[0]) {
      campos.cor_produto = coresEscolhidas[0];
    }

    return { acabamento, campos };
  }, [acabamento, estado.campos, cfg, coresEscolhidas]);

  // O que o seletor da enésima cor recebe. A mesma cor não entra duas
  // vezes: escolhida numa ponta, sai da lista das outras.
  const slotDeCor = i => {
    const usadas = new Set((estado.cores_arte || []).filter((v, k) => k !== i && v));
    return {
      opcoes: coresDaTinta.filter(c => !usadas.has(c.id)),
      valor: estado.cores_arte?.[i] || '',
      aoTrocar: v => trocarCorArte(i, v),
      vazio: i === 0 ? 'Escolha a cor…' : `${NOME_DA_FAIXA(i, quantasCores)}…`,
    };
  };

  function trocarCorArte(i, valor) {
    const arr = [...(estado.cores_arte || [])];
    arr[i] = valor;
    mudar({ cores_arte: arr });
  }

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
      // OS IDS VAO, E OS NOMES VAO JUNTO.
      //
      // Só o nome viajava, "para a produção ler". Só que quem lê antes
      // da produção é o SERVIDOR, e é por esses ids que ele descobre
      // qual cor do modelo foi escolhida — e daí qual produto é vendido
      // e o que aquela cor aceita de impressão. Com nome só, a
      // conferência não achava a cor e passava batido.
      cores_arte: personalizado ? (estado.cores_arte || []).filter(Boolean) : [],
      cores_arte_nomes: personalizado ? coresEscolhidas.map(c => c.name) : [],
      impressao: personalizado
        ? (cfg?.processos || []).find(p => p.id === estado.processo_id)?.nome || null
        : null,
      posicao: personalizado ? estado.posicao : null,
      projeto_id: estado.projeto?.id || null,
      previa: personalizado ? facesArte.frente || null : null,
      quantidade: preco?.quantidade || 0,
      quantidade_minima: preco?.quantidade_minima || 1,
      valor_unitario: preco?.valor_unitario || 0,
      // IDS, não preços. O carrinho leva o que foi escolhido; quanto
      // custa quem diz é o servidor, no checkout.
      adicionais: estado.adicionais,
      // Só para o carrinho conseguir escrever "Borda Prata" sem
      // perguntar de novo.
      adicionais_resumo: adicionaisEscolhidos
        .map(a => (a.cor ? `${a.nome} ${a.cor}` : a.nome)),
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

          <Painel titulo={`${numeroDoPainel()}. Produto e Configuração`} cor={NEON.ciano} icone={Box}>
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

            {/* O SELETOR DE ACABAMENTO VOLTOU.
                Ele tinha sido tirado por achar-se que catorze caminhos
                era decisão demais para a cliente. Só que quem liga o
                acabamento no cadastro é a dona da fábrica, e ligar algo
                que não aparece em lugar nenhum é pior do que a lista
                longa: ela marcava "Sim" no Tricolor e no Efeito Gelo e
                nada acontecia, sem erro para explicar.

                A lista aqui é a do CADASTRO: chega já filtrada pelos
                que estão liberados para este copo. E cada um diz o que
                abre — "escolhe 2 cores (Cor, Cor da boca)" —, que é a
                informação que faltava para a escolha não ser um chute. */}
            {acabamentosDaCor.length > 1 && (
              <div className="mt-4">
                <Rotulo>Acabamento</Rotulo>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {acabamentosDaCor.map(a => (
                    <Opcao key={a.id} quebrar
                      titulo={a.nome}
                      sub={oQueAbre(a)}
                      cor={NEON.roxo}
                      ativo={estado.acabamento_id === a.id}
                      onClick={() => {
                        // Troca limpando o que não vale mais: a cor da
                        // boca continua fazendo sentido no Bicolor, a
                        // terceira cor do Tricolor não.
                        const validos = new Set((a.campos || []).map(c => c.key));
                        const restante = {};
                        for (const [k, v] of Object.entries(estado.campos || {})) {
                          if (validos.has(k)) restante[k] = v;
                        }
                        mudar({ acabamento_id: a.id, campos: restante });
                      }} />
                  ))}
                </div>
              </div>
            )}

            {/* OS CAMPOS DA PEÇA. Vêm do acabamento, um a um. Nenhum
                está escrito nesta tela — acabamento novo no cadastro
                muda a lista sem deploy. */}
            <div className="mt-4">
              <Rotulo>Cores e opções da peça</Rotulo>
              {acabamento?.campos?.length ? (
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {acabamento.campos.map(campo => {
                    /**
                      * A MESMA COR NÃO ENTRA DUAS VEZES.
                      *
                      * Tricolor com as três iguais é pagar por três
                      * verdes: o cliente escolhe, a fábrica produz, e o
                      * que chega é um copo de uma cor só — com a conta
                      * de três. Escolhida numa ponta, a cor sai da lista
                      * das outras.
                      *
                      * Sai só das OUTRAS: a do próprio campo continua
                      * ali, senão o seletor abriria sem o valor que ele
                      * mesmo está mostrando.
                      */
                    const usadas = new Set(
                      Object.entries(estado.campos || {})
                        .filter(([k, v]) => k !== campo.key && v)
                        .map(([, v]) => v),
                    );
                    const opcoes = opcoesDoCampo(campo).filter(o => !usadas.has(o.id));
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
                              <Bolinha hex={corDe(atual)} />
                            </span>
                          )}
                        </div>
                        {!opcoes.length ? (
                          <p className="text-[10.5px] mt-1" style={{ color: '#fca5a5' }}>
                            {/* Duas causas, duas saídas: ou o cadastro
                                não liberou cor nenhuma, ou as poucas
                                liberadas já foram usadas nos outros
                                campos. Dizer "fale com um atendente" no
                                segundo caso manda a pessoa ligar por
                                nada. */}
                            {usadas.size > 0
                              ? 'As cores liberadas já foram usadas nos outros campos.'
                              : 'Sem opção liberada — fale com um atendente.'}
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

            {/* A COR DO COPO VEM ANTES DE TUDO QUE DEPENDE DELA.
                Ela morava embaixo do tipo de impressão, e é o tipo de
                impressão que depende DELA: Transfer só existe no
                transparente. Perguntar na ordem inversa é oferecer uma
                opção e tirá-la um clique depois.
                Só aparece quando o acabamento não pede a cor da peça —
                havendo campo de cor no acabamento, quem manda é ele. */}
            {/* SEM AMARRAR NO NUMERO DE CORES. Quantas cores a peça tem
                é o tipo de impressão que diz — e o tipo de impressão só
                aparece DEPOIS da cor, porque depende dela. Amarrado nos
                dois, o seletor não aparecia nunca: nem cor, nem
                impressão, nem jeito de começar. */}
            {personalizado && coresDaTinta.length > 0 && !campoDeCor && (
              <div className="mt-4">
                <Rotulo>Cor do copo{quantasCores > 1 ? ' · parte de baixo' : ''}</Rotulo>
                <div className="max-w-sm">
                  <SeletorDeCor {...slotDeCor(0)} />
                </div>
                {!corDoCopo && (
                  <p className="text-[11px] mt-1" style={{ color: NEON.suave }}>
                    Escolha a cor para ver o que ela aceita de impressão.
                  </p>
                )}
              </div>
            )}

            {/* O TIPO DE IMPRESSÃO SUBIU PARA CÁ.
                Ele morava dentro de "Personalização", que agora começa
                fechada — então a cliente não via, e a dona da fábrica
                ligava o Transfer sem que ele aparecesse em lugar
                nenhum. Mas o motivo é anterior a isso: impressão MUDA O
                PREÇO. Decisão que mexe no valor pertence ao bloco do
                produto, junto do que a cliente está comprando, e não
                atrás de uma pergunta opcional. */}
            {personalizado && (
              <div className="mt-4">
                <Rotulo>Tipo de impressão</Rotulo>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {processosDaCor.map(pr => (
                    <Opcao key={pr.id} quebrar
                      titulo={pr.nome}
                      sub={pr.max_cores
                        ? `até ${pr.max_cores} cor${pr.max_cores > 1 ? 'es' : ''}${pr.linha_tinta ? ` · tinta ${pr.linha_tinta}` : ''}`
                        : 'arte colorida, do jeito que você quiser'}
                      icone={pr.max_cores === 1 ? Droplet : Palette}
                      cor={pr.max_cores === 1 ? NEON.ciano : NEON.magenta}
                      ativo={estado.processo_id === pr.id}
                      onClick={() => {
                        // TROCAR DE IMPRESSAO CORTA O QUE NAO CABE MAIS.
                        // De "3 cores" para "1 cor", as duas ultimas
                        // deixam de existir — guarda-las faria o pedido
                        // sair com cor que a impressao nao imprime.
                        const teto = Number(pr.max_cores) || 0;
                        const atuais = estado.cores_arte || [];
                        mudar({
                          processo_id: pr.id,
                          cores_arte: teto ? atuais.slice(0, teto) : atuais,
                        });
                      }} />
                  ))}
                  {!processosDaCor.length && (
                    <p className="text-[11.5px] col-span-full" style={{ color: NEON.fraco }}>
                      {corDoCopo
                        ? `Nenhum tipo de impressão liberado para ${corDoCopo.name}.`
                        : 'Nenhum tipo de impressão liberado para este copo.'}
                    </p>
                  )}
                </div>

                {/* AS OUTRAS CORES DA PEÇA. A primeira já foi
                    perguntada acima — ela é a cor do copo, e é dela que
                    sai esta lista de impressões. Aqui ficam só as que a
                    impressão escolhida acrescenta: "2 cores" pede a de
                    cima, "3 cores" pede o meio e a de cima. */}
                {quantasCores > 1 && (
                  <div className="mt-3">
                    <Rotulo>Cores de cima — mais {quantasCores - 1}</Rotulo>
                    <p className="text-[11px] mb-1.5" style={{ color: NEON.suave }}>
                      A <b>Cor 1</b> é a parte de baixo do copo
                      {quantasCores === 3 ? ', a Cor 2 é o meio' : ''} e a
                      <b> Cor {quantasCores}</b> é a parte de cima. A prévia ao
                      lado mostra na hora.
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: quantasCores - 1 }).map((_, k) => {
                        const i = k + 1;
                        return (
                          <div key={i}>
                            <Rotulo>{NOME_DA_FAIXA(i, quantasCores)}</Rotulo>
                            <SeletorDeCor {...slotDeCor(i)} />
                          </div>
                        );
                      })}
                    </div>
                    {!coresDaTinta.length && (
                      <p className="text-[10.5px] mt-1" style={{ color: '#fca5a5' }}>
                        Nenhuma cor liberada para este modelo — fale com um atendente.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

          </Painel>

          {/* ══ ADICIONAIS ═══════════════════════════════════════
              A BORDA É O QUE MAIS SE VENDE JUNTO, e até aqui ela não
              tinha onde ser escolhida: estava cadastrada, tinha preço,
              e o catálogo não a oferecia.

              AGRUPADO PELO NOME, E NÃO UMA LISTA CRUA. Dezoito
              quadradinhos "Borda Metalizada Mosaico Vermelho", "Borda
              Metalizada Prata"... repetem a mesma palavra dezoito vezes
              e escondem a única coisa que muda, que é a cor. Agora é
              "Borda Metalizada" uma vez, e as cores embaixo — que é
              como a cliente pensa: primeiro decide se quer borda,
              depois qual.

              E DENTRO DO GRUPO SÓ CABE UMA. Um copo não leva borda
              prata E borda dourada: escolher a segunda troca a
              primeira. Grupos diferentes (canudo, tampa) continuam
              independentes — esses somam.

              Só aparecem os OPCIONAIS. O que está marcado como "já
              está no preço do copo" (a tinta) já está dentro do valor
              de tabela; mostrá-lo aqui sugeriria escolha, e cobrá-lo
              seria cobrar duas vezes. */}
          {gruposAdicionais.length > 0 && (
            <Painel titulo={`${numeroDoPainel()}. Adicionais`} cor={NEON.ciano} icone={Sparkles}>
              <p className="text-[11.5px] mb-3" style={{ color: NEON.suave }}>
                Opcional. Vem <b>um para cada copo</b> do pedido, e o preço se ajusta na hora.
              </p>

              {/* Dito ANTES de acontecer. A troca automática sem aviso lê
                  como bug: a cliente marca a tampa e vê a borda apagar
                  sozinha. */}
              {(preco?.adicionais_disponiveis || []).some(a => a.tipo === 'borda')
                && (preco?.adicionais_disponiveis || []).some(ehTampa) && (
                <div className="mb-3">
                  <Nota icone={Info} cor={NEON.ciano}>
                    <b>Borda e tampa não vão juntas</b> — a tampa encaixa no aro, que é
                    onde a borda fica. Escolher uma tira a outra.
                  </Nota>
                </div>
              )}

              <div className="space-y-2">
                {gruposAdicionais.map(g => {
                  const escolhido = g.opcoes.find(o => estado.adicionais.includes(o.item_id)) || null;
                  const aberto = grupoAberto === g.nome;
                  const limpar = () => mudar({
                    adicionais: estado.adicionais.filter(id => !g.opcoes.some(o => o.item_id === id)),
                  });
                  return (
                    <div key={g.nome} className="rounded-xl overflow-hidden"
                      style={{ border: `1px solid ${escolhido ? corComAlfa(NEON.ciano, 0.5) : 'rgba(255,255,255,0.10)'}`,
                               background: escolhido ? corComAlfa(NEON.ciano, 0.07) : 'rgba(255,255,255,0.025)' }}>

                      {/* A LINHA FECHADA É A TELA INTEIRA ATÉ ELA SER
                          ABERTA. Dezoito quadradinhos coloridos escancarados
                          em cada grupo transformam a página numa parede — e
                          quem não quer borda nenhuma tem que rolar por
                          tudo isso para chegar na quantidade. Fechado, cada
                          adicional é UMA linha que diz o que é, quanto
                          custa e o que está escolhido. */}
                      <button type="button"
                        onClick={() => setGrupoAberto(aberto ? null : g.nome)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                        {escolhido
                          ? (escolhido.foto
                              ? <img src={escolhido.foto} alt="" className="w-9 h-9 rounded-lg object-cover shrink-0"
                                  style={{ border: '1px solid rgba(255,255,255,0.15)' }} />
                              : <span className="w-9 h-9 rounded-lg shrink-0"
                                  style={{ background: escolhido.cor_hex || 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />)
                          : <span className="w-9 h-9 rounded-lg shrink-0 grid place-items-center"
                              style={{ border: '1px dashed rgba(255,255,255,0.22)' }}>
                              <Sparkles size={14} style={{ color: NEON.fraco }} />
                            </span>}

                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-medium leading-tight"
                            style={{ color: NEON.texto }}>{g.nome}</span>
                          <span className="block text-[11px] leading-tight mt-0.5"
                            style={{ color: escolhido ? NEON.ciano : NEON.fraco }}>
                            {escolhido
                              ? escolhido.cor || 'escolhido'
                              : `Toque para escolher · ${g.opcoes.length} ${g.opcoes.length === 1 ? 'opção' : 'opções'}`}
                          </span>
                        </span>

                        {/* O PREÇO SEMPRE, MESMO ZERADO. "+ R$ 0,00" diz
                            que é de graça; a ausência de preço não diz
                            nada e vira dúvida na hora de fechar. */}
                        <span className="text-[12px] whitespace-nowrap shrink-0"
                          style={{ color: escolhido ? NEON.texto : NEON.suave }}>
                          + {brl(escolhido ? escolhido.preco : g.precoMin)}
                        </span>
                        <ChevronDown size={16} className="shrink-0 transition-transform"
                          style={{ color: NEON.fraco, transform: aberto ? 'rotate(180deg)' : 'none' }} />
                      </button>

                      {aberto && (
                        <div className="px-3 pb-3 pt-1 flex flex-wrap gap-2"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                          {escolhido && (
                            <button type="button" onClick={limpar}
                              className="px-3 py-2 rounded-xl text-[12px]"
                              style={{ background: 'rgba(255,255,255,0.035)',
                                       border: '1px solid rgba(255,255,255,0.10)', color: NEON.fraco }}>
                              Não quero
                            </button>
                          )}
                          {g.opcoes.map(o => {
                            const ativo = escolhido?.item_id === o.item_id;
                            return (
                              <button key={o.item_id} type="button" aria-pressed={ativo}
                                onClick={() => {
                                  // Sai o que este grupo já tinha, e sai
                                  // também o que briga com o escolhido:
                                  // marcar tampa desmarca a borda, e
                                  // vice-versa.
                                  const rival = brigaCom(o);
                                  const disponiveis = preco?.adicionais_disponiveis || [];
                                  mudar({
                                    adicionais: [
                                      ...estado.adicionais.filter(id => {
                                        if (g.opcoes.some(x => x.item_id === id)) return false;
                                        if (!rival) return true;
                                        return !rival(disponiveis.find(x => x.item_id === id));
                                      }),
                                      o.item_id,
                                    ],
                                  });
                                  // Escolheu: fecha e devolve a tela. Deixar
                                  // aberto obriga a procurar onde continuar.
                                  setGrupoAberto(null);
                                }}
                                className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl text-left transition-all active:scale-[0.985]"
                                style={{
                                  background: ativo ? corComAlfa(NEON.ciano, 0.16) : 'rgba(255,255,255,0.035)',
                                  border: `1px solid ${ativo ? corComAlfa(NEON.ciano, 0.85) : 'rgba(255,255,255,0.10)'}`,
                                }}>
                                {o.foto ? (
                                  <img src={o.foto} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0"
                                    style={{ border: '1px solid rgba(255,255,255,0.15)' }} />
                                ) : (
                                  <span className="w-8 h-8 rounded-lg shrink-0"
                                    style={{ background: o.cor_hex || 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
                                )}
                                <span className="min-w-0">
                                  <span className="block text-[12px] leading-tight"
                                    style={{ color: ativo ? NEON.texto : 'rgba(255,255,255,0.82)' }}>
                                    {o.cor || o.nome}
                                  </span>
                                  <span className="block text-[10px] leading-tight" style={{ color: NEON.fraco }}>
                                    + {brl(o.preco)}
                                  </span>
                                </span>
                                {ativo && <Check size={14} style={{ color: NEON.ciano, flexShrink: 0 }} />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {estado.adicionais.length > 0 && preco?.valor_adicionais > 0 && (
                <Nota icone={Info} cor={NEON.ciano}>
                  Você está levando {preco.quantidade} copos e{' '}
                  {adicionaisEscolhidos
                    .map(a => `${preco.quantidade} ${(a.cor ? `${a.nome} ${a.cor}` : a.nome).toLowerCase()}`)
                    .join(', ')} — <b>{brl(preco.valor_adicionais)}</b> a mais, já somados no total ao lado.
                </Nota>
              )}
            </Painel>
          )}

          {personalizado && (
            <Painel titulo={`${numeroDoPainel()}. Personalização`} cor={NEON.roxo} icone={Palette}>
              {/* UMA PERGUNTA ANTES DO PAINEL INTEIRO.
                  Tipo de impressão, posição da arte, editor e ocasião
                  do evento é muita decisão junta para quem talvez nem
                  queira arte nenhuma — e é a maior parte da altura da
                  página. Perguntar primeiro devolve a tela a quem só
                  quer o copo, e não tira nada de quem quer personalizar:
                  o card abre inteiro, do mesmo jeito. */}
              <div className="flex flex-wrap items-center justify-between gap-3 mb-1">
                <span className="text-[13.5px] font-medium" style={{ color: NEON.texto }}>
                  Quer personalizar do seu jeito?
                </span>
                <div className="flex gap-2">
                  <Opcao titulo="Sim" cor={NEON.roxo} ativo={querPersonalizar}
                    onClick={() => setQuerPersonalizar(true)} />
                  <Opcao titulo="Não" cor={NEON.azul} ativo={!querPersonalizar}
                    onClick={() => setQuerPersonalizar(false)} />
                </div>
              </div>
              {!querPersonalizar && (
                <p className="text-[11.5px]" style={{ color: NEON.fraco }}>
                  Sem problema — seguimos com o copo do jeito que está. Você pode voltar aqui a
                  qualquer momento antes de fechar o pedido.
                </p>
              )}

              {querPersonalizar && (<>
              <div className="grid gap-3 sm:grid-cols-2">

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
              </>)}
            </Painel>
          )}

          <Painel titulo={`${numeroDoPainel()}. Entrega e Evento`}
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

          <Painel titulo={`${numeroDoPainel()}. Forma de pagamento`} cor={NEON.roxo} icone={CreditCard}>
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
                <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteFrente} face="frente" coresArte={coresEscolhidas}
                  borda={bordaEscolhida}
                  acessorios={acessoriosEscolhidos}
                  gabarito={gabarito} altura={estado.posicao === 'frente_verso' ? 190 : 216} />
                {personalizado && estado.posicao === 'frente_verso' && (
                  <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteVerso} face="verso" coresArte={coresEscolhidas}
                    borda={bordaEscolhida}
                    acessorios={acessoriosEscolhidos}
                    gabarito={gabarito} altura={190} />
                )}
              </div>

              {/* O copo cinza sem cor escolhida parece defeito. Uma linha
                  explicando transforma "quebrou" em "falta escolher". */}
              {!escolhaVisual.campos?.cor_base && !escolhaVisual.campos?.cor_produto
                && !hexDasCoresArte.length && (
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
              {adicionaisEscolhidos.map(a => (
                <Linha key={a.item_id}
                  rotulo={`${preco?.quantidade || 0} ${a.cor ? `${a.nome} ${a.cor}` : a.nome}`}
                  valor={a.preco > 0 ? brl(a.preco * (preco?.quantidade || 0)) : 'incluso'} />
              ))}
            </dl>

            {/* A SOMA ABERTA. "R$ 6,80" sem dizer que R$ 0,50 era a
                borda é o número que vira pergunta na hora de pagar. */}
            <div className="mt-3 pt-3 space-y-1.5 text-[12.5px]"
              style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              {preco?.valor_adicionais > 0 && (
                <>
                  <Valor rotulo="Copos" valor={(preco.valor_base_unitario || 0) * (preco.quantidade || 0)} />
                  <Valor rotulo="Adicionais" valor={preco.valor_adicionais} />
                </>
              )}
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
              <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteFrente} face="frente" coresArte={coresEscolhidas}
                borda={bordaEscolhida}
                acessorios={acessoriosEscolhidos}
                gabarito={gabarito} altura={Math.min(520, window.innerHeight * 0.62)} />
              {personalizado && estado.posicao === 'frente_verso' && (
                <CopoPreview escolha={escolhaVisual} familia={cfg.modelo.familia} fotoModelo={cfg.modelo.imagem} fotosPorCor={cfg.cores?.produto} arte={arteVerso} face="verso" coresArte={coresEscolhidas}
                  borda={bordaEscolhida}
                  acessorios={acessoriosEscolhidos}
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
