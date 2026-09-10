// ============================================================
// O MOTOR DE ETAPAS — UM SÓ, PARA TRÊS MÓDULOS.
//
// Designer, Produção e Logística são a MESMA tela: uma fila de pedidos,
// uma régua de etapas, iniciar/finalizar com dupla confirmação, e o
// histórico de quem fez o quê. O que muda é a FATIA da régua que cada
// um vê e opera — o designer imprime o vegetal (8–9), a fábrica vai da
// revelação à embalagem (10–23), a logística do que sai da porta (24–28).
//
// Por isso este arquivo não exporta um router: exporta uma FÁBRICA de
// router, `criarRouter(modulo)`. `routes/index.js` monta três —
// /production, /designer e /logistica — cada um preso ao seu módulo.
// Três cópias deste arquivo seriam três motores para divergir no dia
// em que a dupla confirmação mudasse.
//
// Quem diz de quem é cada etapa é MODULOS_DO_FLUXO, em lib/atencao.js.
// Aqui só se lê.
// ============================================================
const express  = require('express');
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { uploadDataUrl } = require('../lib/storage');

const { makeClient } = require('../config/supabase');

const A = require('../lib/atencao');
const F = require('../lib/fluxoPedido');
const { etapasDosItens, caracteristicasDoItem, contaDaProducao } = require('../lib/itensPedido');
// O prazo contado de trás para frente: do evento do cliente até a data
// em que a mercadoria precisa sair. Ver lib/prazoProducao.js.
const Prazo = require('../lib/prazoProducao');

// Etapas e suas colunas de início/fim
// Fluxo: Revelação → Pintura → Metalização (opcional) → Produção → Embalagem
/**
 * O CATÁLOGO DAS ETAPAS DA FÁBRICA — UM LUGAR SÓ.
 *
 * Isto morava em três mapas separados (que campos gravar, que fase do
 * pedido mexer, que botões desenhar) e mais uma cópia na tela. Quatro
 * lugares para descrever a mesma etapa é quatro lugares para
 * divergirem — foi assim que Borda e Controle de Qualidade acabaram
 * existindo como status do pedido sem existir no chão de fábrica: quem
 * estava na máquina não tinha onde registrar, e o pedido só andava se
 * alguém abrisse a tela do comercial.
 *
 * Agora cada etapa se descreve inteira aqui, e a tela PERGUNTA (GET
 * /production/etapas). Acrescentar uma etapa nova é acrescentar uma
 * entrada aqui — nada na tela.
 *
 * Os CAMPOS são o que a etapa registra, e são o motivo de tudo isto:
 * o número da matriz que a revelação gravou, o número da máquina que
 * produziu, a perda de cada etapa, o resultado da qualidade. Sem isso,
 * "quem fez" é a única pergunta que o histórico responde — e no dia em
 * que mil copos saem errados, a pergunta é OUTRA: em que matriz, em que
 * máquina, com quantas perdas.
 *
 *   tipo 'texto'   uma linha escrita
 *   tipo 'numero'  quantidade (perda, avaria)
 *   tipo 'sim'     caixa que precisa estar marcada para seguir
 *   tipo 'opcao'   uma entre as opções
 */
const ETAPAS = {
  /**
   * ── DESIGNER ─────────────────────────────────────────────
   * O vegetal é o filme impresso que a serigrafia vai usar para gravar
   * a tela. Quem imprime é quem desenha — por isso é do Designer, e não
   * da fábrica. A fábrica começa com o filme na mão.
   */
  vegetal: {
    modulo: 'designer',
    label: 'Impressão do vegetal',
    fase: 'vegetal', processo: 'vegetal_processo',
    campos: {
      finish: [
        { key: 'impressora', tipo: 'texto', label: 'Impressora / equipamento',
          dica: 'Em qual impressora o vegetal saiu — para achar o padrão quando a tela vela.' },
        { key: 'conferido_com_arte', tipo: 'sim', obrigatorio: true,
          label: 'O vegetal foi conferido com a arte aprovada pelo cliente?' },
        { key: 'quantidade_vegetais', tipo: 'numero', label: 'Quantos vegetais foram impressos',
          dica: 'Um por arte, normalmente.' },
      ],
    },
  },

  /** ── PRODUÇÃO ───────────────────────────────────────────── */
  revelacao: {
    modulo: 'producao',
    label: 'Revelação',
    fase: 'revelacao', processo: 'revelacao_processo',
    colunas: { start: 'revelacao_inicio', fim: 'revelacao_fim' },
    campos: {
      finish: [
        { key: 'matriz', tipo: 'texto', label: 'Número da matriz', obrigatorio: true,
          dica: 'É por ele que se acha a tela usada, se o copo sair errado.' },
        { key: 'matriz_conferida', tipo: 'sim', obrigatorio: true,
          label: 'Foi informado o número correto da matriz?' },
        /**
         * A PERDA DE MATRIZ ENTROU AQUI, e saiu de um botão à parte.
         *
         * Ela é a tela que velou, queimou ou não revelou — e isso
         * acontece EXATAMENTE nesta etapa, na mão de quem está fazendo.
         * Ficava num botão solto no rodapé da tela, que só alguém que
         * lembrasse ia clicar depois; o resultado era emulsão saindo do
         * estoque sem registro e tela recuperada sem ninguém contar.
         *
         * Marcada aqui, o sistema calcula emulsão, sensibilizante e
         * removedor pela área configurada, dá baixa nos três e soma uma
         * recuperação na vida daquela tela.
         */
        { key: 'matriz_perdida', tipo: 'sim',
          label: 'A matriz foi perdida? (velou, queimou, não revelou)',
          dica: 'Marque só se a tela precisou ser recuperada. Emulsão, sensibilizante '
              + 'e removedor saem do estoque, e conta uma recuperação nesta tela.' },
        { key: 'matriz_motivo', tipo: 'texto', label: 'O que houve com a matriz',
          dica: 'Opcional — ajuda a achar o padrão quando a mesma tela vela sempre.' },
      ],
    },
  },

  pintura: {
    modulo: 'producao',
    label: 'Pintura',
    fase: 'pintura', processo: 'pintura_processo',
    colunas: { start: 'pintura_inicio', fim: 'pintura_fim' },
    campos: { finish: [CAMPO_PERDA()] },
  },

  borda: {
    modulo: 'producao',
    // ETAPA NOVA NO CHÃO DE FÁBRICA — o status já existia desde sempre.
    // Sem esta entrada, o pedido chegava em "Aguardando aplicação de
    // borda" e a fábrica não tinha botão nenhum: quem aplicava a borda
    // trabalhava e o sistema continuava dizendo que ninguém tinha
    // começado.
    label: 'Borda',
    fase: 'borda', processo: 'borda_processo',
    campos: { finish: [CAMPO_PERDA()] },
  },

  metalizacao: {
    modulo: 'producao',
    /**
     * METALIZAÇÃO MUDA O QUE A TELA DIZ, MAS NÃO AVANÇA A RÉGUA.
     *
     * Ela é etapa do quadro da fábrica e não fase do pedido: mora DENTRO
     * da produção. `avancaAoTerminar: false` é o que impede o estrago:
     * terminar a metalização NÃO é terminar a produção.
     */
    label: 'Metalização',
    fase: 'producao', processo: 'metalizacao_processo', avancaAoTerminar: false,
    colunas: { start: 'metalizacao_inicio', fim: 'metalizacao_fim' },
    campos: { finish: [CAMPO_PERDA()] },
  },

  producao: {
    modulo: 'producao',
    label: 'Produção',
    fase: 'producao', processo: 'producao_processo',
    colunas: { start: 'producao_inicio', fim: 'producao_fim' },
    // A MATRIZ APARECE AQUI, e não se digita de novo: quem monta a
    // máquina precisa saber qual tela pegar, e o número já foi gravado
    // na revelação. Pedir duas vezes é convidar a segunda a divergir.
    mostraMatriz: true,
    campos: {
      start: [
        { key: 'maquina', tipo: 'texto', label: 'Número da máquina', obrigatorio: true,
          dica: 'Em qual máquina este pedido está rodando.' },
      ],
      finish: [CAMPO_PERDA()],
    },
  },

  qualidade: {
    modulo: 'producao',
    // A SEGUNDA ETAPA QUE FALTAVA NO CHÃO DE FÁBRICA. "Controle de
    // qualidade" existia como status e como um módulo à parte que fala
    // de lotes de matéria-prima — nada a ver com conferir o pedido.
    label: 'Controle de qualidade',
    fase: 'qualidade', processo: 'conferencia_processo',
    campos: {
      finish: [
        { key: 'resultado', tipo: 'opcao', obrigatorio: true, label: 'Resultado da conferência',
          opcoes: [
            { valor: 'aprovado',  label: 'Aprovado' },
            { valor: 'reprovado', label: 'Reprovado' },
          ],
          dica: 'Reprovado registra a conferência e mantém o pedido aqui, para refazer.' },
        { key: 'avariadas', tipo: 'numero', label: 'Unidades avariadas', perda: true,
          dica: 'Peças que saíram com defeito nesta conferência.' },
      ],
    },
  },

  foto: {
    modulo: 'producao',
    // A FOTO VEM ANTES DA EMBALAGEM, e é por isso que ela é uma etapa:
    // fotografar depois de embalar significa abrir a caixa de novo.
    label: 'Foto',
    fase: 'foto', processo: null,
    exigeFoto: true,
    campos: {
      finish: [
        { key: 'fotos_conferidas', tipo: 'sim', obrigatorio: true,
          label: 'Todas as fotos foram anexadas?' },
      ],
    },
  },

  embalagem: {
    modulo: 'producao',
    label: 'Embalagem',
    fase: 'embalagem', processo: 'embalando_pedido',
    colunas: { start: 'embalagem_inicio', fim: 'embalagem_fim' },
    campos: {
      finish: [
        { key: 'etiqueta_fragil', tipo: 'sim', obrigatorio: true,
          label: 'Colou a etiqueta de FRÁGIL?' },
        { key: 'caixa_identificada', tipo: 'sim', obrigatorio: true,
          label: 'A caixa está identificada?' },
        { key: 'conferiu_etiqueta', tipo: 'sim', obrigatorio: true,
          label: 'Conferiu se o pedido está correto com a etiqueta?' },
        CAMPO_PERDA(),
      ],
    },
  },

  /**
   * ── LOGÍSTICA ────────────────────────────────────────────
   * O que sai da porta. Coleta (ou retirada no balcão), trânsito e
   * entrega. Retirada não tem trânsito nem entrega: o motor de fluxo
   * já leva o pedido de "aguardando coleta" direto a "produto
   * retirado", e `etapasDoPedido` não desenha o que não vai acontecer.
   */
  coleta: {
    modulo: 'logistica',
    label: 'Coleta / retirada',
    fase: 'coleta', processo: 'coleta_processo',
    campos: {
      // A transportadora veio buscar.
      finish: [
        { key: 'volumes', tipo: 'numero', label: 'Volumes entregues à transportadora', obrigatorio: true },
        { key: 'conferiu_etiqueta', tipo: 'sim', obrigatorio: true,
          label: 'Conferiu a etiqueta de cada volume com o pedido?' },
        { key: 'motorista', tipo: 'texto', label: 'Nome do motorista / conferente',
          dica: 'Quem assinou o recebimento do lado da transportadora.' },
      ],
      // O cliente veio buscar. Os campos são outros porque o fato é outro.
      finish_retirada: [
        { key: 'quem_retirou', tipo: 'texto', label: 'Quem retirou', obrigatorio: true },
        { key: 'documento_conferido', tipo: 'sim', obrigatorio: true,
          label: 'Conferiu o documento com foto de quem retirou?' },
        { key: 'conferiu_na_frente', tipo: 'sim', obrigatorio: true,
          label: 'A mercadoria foi aberta e conferida na frente do cliente?' },
      ],
    },
  },

  transito: {
    modulo: 'logistica',
    label: 'Em trânsito',
    fase: 'transito', processo: null,
    campos: {
      finish: [
        { key: 'rastreio', tipo: 'texto', label: 'Código de rastreio',
          dica: 'Sem o código o cliente não consegue acompanhar — e liga para o vendedor.' },
        { key: 'previsao_entrega', tipo: 'texto', label: 'Previsão de entrega (dd/mm)' },
      ],
    },
  },

  entrega: {
    modulo: 'logistica',
    label: 'Entrega',
    fase: 'entrega', processo: null,
    campos: {
      finish: [
        { key: 'recebido_por', tipo: 'texto', label: 'Recebido por', obrigatorio: true },
        { key: 'entregue_integro', tipo: 'sim', obrigatorio: true,
          label: 'A mercadoria chegou íntegra, sem avaria?' },
        { key: 'ocorrencia', tipo: 'texto', label: 'Ocorrência na entrega',
          dica: 'Deixe em branco se correu tudo bem.' },
      ],
    },
  },
};

/**
 * A PERDA É A MESMA PERGUNTA EM CINCO ETAPAS.
 *
 * Perde-se copo na pintura, na borda, na produção e na embalagem, e o
 * campo é idêntico nas quatro. Escrever quatro vezes é aceitar que uma
 * delas vai ficar diferente na primeira alteração.
 *
 * `perda: true` é o que faz o servidor gravar a linha em
 * PRODUCAO_PERDAS e dar a baixa no estoque — o mesmo caminho do botão
 * "Registrar perda", que continua existindo para a perda avulsa.
 */
function CAMPO_PERDA() {
  return {
    key: 'perda', tipo: 'numero', label: 'Perdeu alguma unidade nesta etapa?', perda: true,
    dica: 'A FÁBRICA REPÕE — o cliente recebe o que pediu. Pediu 200 e quebraram 5? '
        + 'Saem 205 da linha. O que for informado aqui é custo nosso e sai do estoque.',
  };
}

/**
 * AS ETAPAS DESTE PEDIDO, NESTE MÓDULO, na ordem em que acontecem.
 *
 * A ordem é a do fluxo (metalização encaixada dentro da produção). O
 * filtro é duplo: só as etapas do módulo pedido, e só as que este
 * pedido contratou — pintura e borda dependem dos itens; a serigrafia
 * inteira (vegetal, revelação) só existe onde há o que gravar; trânsito
 * e entrega no endereço não existem em retirada.
 */
const ORDEM_DAS_ETAPAS = [
  'vegetal',
  'revelacao', 'pintura', 'borda', 'metalizacao', 'producao', 'qualidade', 'foto', 'embalagem',
  'coleta', 'transito', 'entrega',
];
const SO_NA_ENTREGA = new Set(['transito', 'entrega']);

function etapasDoPedido(aplicaveis, modulo, venda = null) {
  return ORDEM_DAS_ETAPAS.filter(k => {
    const e = ETAPAS[k];
    if (modulo && e.modulo !== modulo) return false;
    if (venda && SO_NA_ENTREGA.has(k) && A.ehRetirada(venda)) return false;
    const fase = A.FASES.find(f => f.key === e.fase);
    if (fase?.opcional) return !!aplicaveis[fase.opcional];
    return true;
  });
}

/**
 * OS CAMPOS DE UMA AÇÃO, para ESTE pedido.
 *
 * A coleta pergunta coisas diferentes conforme a transportadora vem
 * buscar ou o cliente vem retirar: `finish_retirada` vence `finish`
 * quando o pedido é retirada. Um formulário só para os dois casos
 * perguntaria "nome do motorista" a quem veio de carro próprio.
 */
function camposDaAcao(etapa, action, venda) {
  const c = etapa?.campos || {};
  if (action === 'finish' && venda && A.ehRetirada(venda) && c.finish_retirada) return c.finish_retirada;
  return c[action] || [];
}

/**
 * A RÉGUA DESTE PEDIDO — TODAS AS ETAPAS, E ONDE ELE ESTÁ.
 *
 * A barra da tela mostrava dez botões fixos; virou uma lista só do que
 * dá para fazer agora, e nisso perdeu o mapa: quem olha precisa ver o
 * CAMINHO INTEIRO e a bolinha acesa no lugar certo, senão não sabe se
 * o pedido está no começo ou no fim.
 *
 * `feita`  já passou — com a hora e o nome de quem fez.
 * `agora`  é onde ele está (e é a que tem botão).
 * `futura` ainda vem.
 */
function reguaDoPedido(venda, aplicaveis, modulo) {
  const status = venda?.status;
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];
  const acoes = acoesDoPedido(venda, aplicaveis, modulo);

  return etapasDoPedido(aplicaveis, modulo, venda).map(key => {
    const e = ETAPAS[key];
    const fase = A.FASES.find(f => f.key === e.fase);
    const marco = [...log].reverse().find(m => m.stage === key && m.action === 'finish');
    const agora = (fase?.entrando || []).includes(status) || status === e.processo
      || acoes.some(a => a.stage === key);

    return {
      key, label: e.label,
      estado: marco ? 'feita' : agora ? 'agora' : 'futura',
      em: marco?.at || null,
      por: marco?.user || null,
      // O que aquela etapa registrou, para a régua contar a história
      // sem obrigar a abrir o histórico.
      matriz: marco?.matriz || null,
      maquina: marco?.maquina || null,
      perda: Number(marco?.perda || marco?.avariadas || 0) || null,
      resultado: marco?.resultado || null,
    };
  });
}

/**
 * O QUE A FÁBRICA PODE FAZER COM ESTE PEDIDO AGORA.
 *
 * Quem responde é o STATUS, e não uma corrente de "a etapa anterior
 * terminou". A corrente morava na tela, era uma segunda régua paralela
 * à do pedido, e por isso não conhecia borda nem qualidade: um pedido
 * em "Aguardando aplicação de borda" não tinha botão nenhum.
 *
 * O status já diz exatamente onde o pedido está. `aguardando_borda`
 * quer dizer "dá para começar a borda"; `borda_processo` quer dizer
 * "dá para terminar". Não há terceira leitura.
 */
function acoesDoPedido(venda, aplicaveis, modulo) {
  const status = venda?.status;
  const acoes = [];
  for (const key of etapasDoPedido(aplicaveis, modulo, venda)) {
    const e = ETAPAS[key];
    const fase = A.FASES.find(f => f.key === e.fase);
    const entrando = (fase?.entrando || []).includes(status);

    if (e.avancaAoTerminar === false) {
      // Metalização acontece DENTRO da produção: vale em qualquer
      // momento dela, e não avança a régua ao terminar.
      const naProducao = entrando || status === 'producao_processo' || status === e.processo;
      if (naProducao && status !== e.processo) acoes.push({ stage: key, action: 'start' });
      if (status === e.processo) acoes.push({ stage: key, action: 'finish' });
      continue;
    }

    if (entrando) {
      // Etapa sem "em processo" própria (foto) começa e termina no
      // mesmo status — ela não tem meio-termo para mostrar.
      acoes.push({ stage: key, action: e.processo ? 'start' : 'finish' });
    }
    if (e.processo && status === e.processo) acoes.push({ stage: key, action: 'finish' });
  }
  return acoes;
}

/**
 * A FÁBRICA DE ROUTER. `modulo` é 'designer', 'producao' ou 'logistica'
 * — a chave de MODULOS_DO_FLUXO — e fica preso em cada rota abaixo.
 */
function criarRouter(modulo = 'producao') {
  if (!A.MODULOS_DO_FLUXO[modulo]) throw new Error(`criarRouter: módulo desconhecido "${modulo}"`);
  const router = express.Router();
  const ROTULO_MODULO = A.MODULOS_DO_FLUXO[modulo].label;

/**
 * A FILA DA PRODUÇÃO — quem entra e quem não entra.
 *
 * Duas peneiras, e as duas existem porque a fila estava mostrando
 * trabalho que não era trabalho:
 *
 *   1. O STATUS. O pedido chegar em "Aguardando produção" JÁ É o aviso:
 *      ele só chega ali depois de pagamento conferido, estoque e arte
 *      aprovada — três portas que o comercial e o financeiro abriram uma
 *      a uma.
 *
 *      HOUVE UMA SEGUNDA TRAVA AQUI, e ela saiu: exigia que alguém
 *      clicasse em "Enviar para produção" no pedido. O resultado foi uma
 *      fila invisível — seis pedidos em "Aguardando produção" e a tela
 *      da fábrica vazia, esperando um clique que ninguém sabia que
 *      precisava dar.
 *
 *   2. TEM O QUE GRAVAR. Copo liso não tem arte, nem vegetal, nem tela:
 *      não há uma etapa de serigrafia sequer para a fábrica registrar.
 *      Ele continua APARECENDO — some da tela seria a produção
 *      descobrir por telefone que existe um pedido —, mas aparece
 *      marcado e sem botão, porque não há o que iniciar.
 */
// ── Board de produção ─────────────────────────────────────
router.get('/', async (req, res) => {
  const { start_date, end_date, search, stage } = req.query;
  try {
    // Busca por número do pedido OU nome do cliente
    let customerIds = null;
    if (search && !/^\d+$/.test(String(search).trim())) {
      const { data: cs } = await supabase.from('CLIENTES').select('id')
        .eq('tenant_id', req.tenantId).ilike('name', `%${String(search).trim()}%`).limit(200);
      customerIds = (cs || []).map(c => c.id);
      if (!customerIds.length) return res.json({ data: [] });
    }

    let q = supabase
      .from('VENDAS')
      .select('*, CLIENTES(name, cpf_cnpj, phone, address), USUARIOS(name), VENDA_ITENS(product_name, quantity, unit_price, total, customization, PRODUTOS(code, name, unit, ink_type))')
      .eq('tenant_id', req.tenantId)
      /**
       * A JANELA DESTE MÓDULO, lida do catálogo — e não uma lista
       * digitada aqui. A produção vê da revelação à embalagem, o
       * designer vê o vegetal, a logística vê do que sai da porta ao
       * entregue. Quem decide isso é MODULOS_DO_FLUXO; uma lista
       * escrita aqui seria a segunda opinião que sempre diverge.
       */
      .in('status', A.statusDoModulo(modulo))
      .order('ship_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    if (stage) q = q.eq('production_stage', stage);
    if (customerIds) q = q.in('customer_id', customerIds);
    if (search && /^\d+$/.test(String(search).trim())) q = q.eq('number', parseInt(search));
    if (start_date) q = q.gte('ship_date', start_date);
    if (end_date)   q = q.lte('ship_date', end_date);

    const { data, error } = await q.limit(500);
    if (error) throw error;

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const dias = d => (d ? Math.round((new Date(d + 'T00:00:00') - today) / 86400000) : null);

    // O PRAZO É CALCULADO PARA A LISTA INTEIRA DE UMA VEZ. Feriados e
    // configuração vêm numa consulta só — perguntar por pedido seriam
    // oitenta idas ao banco para desenhar uma tela.
    const ctx = await Prazo.preparar(req.tenantId, data || []);

    const rows = (data || []).map(s => {
      const addr = s.CLIENTES?.address || {};
      // prazo de referência: prazo máximo → evento → saída
      const deadline = s.max_delivery_date || s.event_date || s.ship_date || null;
      const itens = (s.VENDA_ITENS || []).map(caracteristicasDoItem);
      const aplicaveis = etapasDosItens(itens);
      const envio = F.envioParaProducao(s);
      return {
        // O que a fábrica pode ou não fazer com este pedido, respondido
        // aqui e não na tela: a tela desenha, o servidor decide.
        personalizado: !!aplicaveis.personalizado,
        enviado_producao: envio.enviado,
        enviado_em: envio.em,
        enviado_por: envio.por,
        /**
         * TEM O QUE ESTE MÓDULO FAZER NELE? É a pergunta certa — e não
         * "é personalizado?", que era a de antes. O copo liso não passa
         * pela revelação, mas passa pela produção, pela qualidade, pela
         * foto e pela embalagem; a logística mexe em TODO pedido. Só o
         * designer, que vive do vegetal, não tem o que fazer num liso.
         */
        interagivel: etapasDoPedido(aplicaveis, modulo, s).length > 0,
        // O QUE DÁ PARA FAZER COM ELE AGORA — respondido aqui, e não na
        // tela. A tela desenha o botão; quem decide se ele existe é
        // quem conhece o status e as etapas que este pedido tem.
        acoes: acoesDoPedido(s, aplicaveis, modulo),
        etapas: etapasDoPedido(aplicaveis, modulo, s),
        regua: reguaDoPedido(s, aplicaveis, modulo),
        status_label: A.infoStatus(s.status).label,
        // De quem é o pedido AGORA — para a fila dizer "está com o
        // designer" quando o pedido ainda não chegou aqui.
        modulo_atual: A.moduloDoStatus(s.status),
        modulo_atual_label: A.MODULOS_DO_FLUXO[A.moduloDoStatus(s.status)]?.label || null,
        // A conta do evento para trás — ver lib/prazoProducao.js.
        prazo: Prazo.prazoDoPedido(s, ctx),
        id: s.id, number: s.number, created_at: s.created_at,
        customer: s.CLIENTES?.name || 'Consumidor Final',
        seller: s.USUARIOS?.name || null,
        city: addr.city || null, uf: addr.state || null,
        order_date: s.created_at ? String(s.created_at).slice(0, 10) : null,
        event_date: s.event_date, ship_date: s.ship_date, ship_time: s.ship_time,
        max_delivery_date: s.max_delivery_date,
        diff_event: dias(s.event_date),
        diff_ship: dias(s.ship_date),
        diff_deadline: dias(deadline),
        diff_days: dias(deadline), // coluna "Dias" = dias até o prazo
        carrier: s.carrier,
        photos: Array.isArray(s.production_photos) ? s.production_photos : [],
        stage: s.production_stage || 'aguardando_producao',
        art_file: s.art_file, total: s.total, status: s.status,
      };
    });
    // A FILA É O QUE ESTÁ NO STATUS DE FÁBRICA. Sem segunda peneira: o
    // pedido que chegou aqui é trabalho da fábrica, e some da tela só
    // quando sair do status.
    const fila = rows;

    res.json({
      data: fila,
      // Continua saindo por compatibilidade com quem já lê este campo —
      // agora é sempre zero, porque não existe mais espera por envio.
      aguardando_envio: 0,
      sem_personalizacao: fila.filter(r => !r.personalizado).length,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * O CATÁLOGO, PARA A TELA DESENHAR.
 *
 * A tela não sabe quais são as etapas nem que campos cada uma pede —
 * ela pergunta. Era o contrário: a lista de etapas estava escrita na
 * tela E no servidor, e as duas discordavam (a tela não conhecia borda
 * nem qualidade). Quem pergunta nunca discorda.
 */
router.get('/etapas', (req, res) => {
  res.json({
    modulo, modulo_label: ROTULO_MODULO,
    etapas: Object.entries(ETAPAS).filter(([, e]) => e.modulo === modulo).map(([key, e]) => ({
      key, label: e.label, fase: e.fase, modulo: e.modulo,
      exigeFoto: !!e.exigeFoto, mostraMatriz: !!e.mostraMatriz,
      campos: {
        start: e.campos?.start || [],
        finish: e.campos?.finish || [],
        finish_retirada: e.campos?.finish_retirada || null,
      },
    })),
  });
});

// ════════ Serigrafia: configuração, perda de matriz e quadros (telas) ════════
const SERI_DEFAULTS = {
  screen_w: 25, screen_h: 35,                                   // cm
  emulsao_g_m2: 200, emulsao_cost_kg: 0, emulsao_product_id: null,
  sensib_g_m2: 20,   sensib_cost_kg: 0,  sensib_product_id: null,
  removedor_ml_m2: 50, removedor_cost_l: 0, removedor_product_id: null,
  troca_limite: 20,                                             // recuperações antes de trocar a tela
};

async function getSeriConfig(tenantId) {
  let s = {};
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    s = (data?.settings && data.settings.serigrafia) || {};
  } catch { s = {}; }
  return { ...SERI_DEFAULTS, ...s };
}

// incrementa gravacoes/recuperacoes de um quadro (cria se não existir)
async function bumpQuadro(tenantId, numero, field, inc = 1) {
  numero = String(numero || '').trim();
  if (!numero) return null;
  const { data: q } = await supabase.from('QUADROS').select('id, gravacoes, recuperacoes')
    .eq('tenant_id', tenantId).eq('numero', numero).maybeSingle();
  if (q) {
    const patch = { updated_at: new Date().toISOString() };
    patch[field] = (Number(q[field]) || 0) + inc;
    await supabase.from('QUADROS').update(patch).eq('id', q.id);
    return { ...q, ...patch };
  }
  const row = { tenant_id: tenantId, numero, gravacoes: 0, recuperacoes: 0 };
  row[field] = inc;
  const { data: ins } = await supabase.from('QUADROS').insert(row).select().single();
  return ins;
}

router.get('/serigrafia/config', async (req, res) => {
  try { res.json(await getSeriConfig(req.tenantId)); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/serigrafia/config', async (req, res) => {
  if (req.userProfile?.role !== 'admin') return res.status(403).json({ error: 'Apenas administradores podem alterar a configuração.' });
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const cur = data?.settings || {};
    const merged = { ...cur, serigrafia: { ...SERI_DEFAULTS, ...(cur.serigrafia || {}), ...(req.body || {}) } };
    const { error } = await supabase.from('EMPRESAS').update({ settings: merged }).eq('id', req.tenantId);
    if (error) throw error;
    res.json(merged.serigrafia);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/serigrafia/quadros', async (req, res) => {
  try {
    const cfg = await getSeriConfig(req.tenantId);
    const { data } = await supabase.from('QUADROS').select('*').eq('tenant_id', req.tenantId)
      .order('recuperacoes', { ascending: false });
    const list = (data || []).map(q => ({ ...q, precisa_troca: (Number(q.recuperacoes) || 0) >= Number(cfg.troca_limite || 0) }));
    res.json({ data: list, troca_limite: cfg.troca_limite });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/serigrafia/perdas', async (req, res) => {
  try {
    const { data } = await supabase.from('PERDAS_MATRIZ').select('*').eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false }).limit(200);
    res.json({ data: data || [] });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A PERDA DE MATRIZ — chamada pela REVELAÇÃO, e por mais ninguém.
 *
 * Era uma rota com botão próprio no rodapé da tela: "Registrar perda".
 * Um botão solto para um fato que acontece DENTRO de uma etapa, e que
 * por isso dependia de alguém lembrar de voltar ali depois. O que
 * acontecia de verdade era emulsão saindo do estoque sem registro e
 * tela recuperada sem ninguém contar — os dois números que essa perda
 * existe para guardar.
 *
 * Agora ela é uma caixa marcada ao finalizar a revelação, e este código
 * é o mesmo de antes: calcula os insumos pela área configurada, dá
 * baixa nos três e soma uma recuperação na vida daquela tela.
 */
async function registrarPerdaMatriz(req, { sale_id, quadro, motivo, obs, area_cm2, emulsao_g, sensib_g, removedor_ml }) {
  const cfg = await getSeriConfig(req.tenantId);
  const area = Number(area_cm2) > 0 ? Number(area_cm2) : (Number(cfg.screen_w) * Number(cfg.screen_h));
  const m2 = area / 10000;
  const emu = emulsao_g != null && emulsao_g !== '' ? Number(emulsao_g) : m2 * Number(cfg.emulsao_g_m2 || 0);
  const sen = sensib_g != null && sensib_g !== '' ? Number(sensib_g) : m2 * Number(cfg.sensib_g_m2 || 0);
  const rem = removedor_ml != null && removedor_ml !== '' ? Number(removedor_ml) : m2 * Number(cfg.removedor_ml_m2 || 0);
  const custo = (emu / 1000) * Number(cfg.emulsao_cost_kg || 0)
              + (sen / 1000) * Number(cfg.sensib_cost_kg || 0)
              + (rem / 1000) * Number(cfg.removedor_cost_l || 0);

  const { data: rec, error } = await supabase.from('PERDAS_MATRIZ').insert({
    tenant_id: req.tenantId, sale_id: sale_id || null, quadro: String(quadro).trim(),
    motivo: motivo || null, obs: obs || null, area_cm2: area,
    emulsao_g: emu, sensib_g: sen, removedor_ml: rem, custo,
    user_id: req.user?.id || null, user_name: req.userProfile?.name || req.user?.name || req.user?.email || null,
  }).select().single();
  if (error) throw error;

  // Baixa no estoque dos insumos configurados.
  const baixa = async (pid, qty, label) => {
    if (!pid || !(qty > 0)) return;
    try {
      await supabase.rpc('atualizar_estoque', {
        p_tenant_id: req.tenantId, p_product_id: pid, p_quantity: -qty, p_type: 'adjustment',
        p_reference_type: 'matriz_perda', p_reference_id: rec.id, p_user_id: req.user?.id || null,
        p_notes: `Perda de matriz ${quadro} — ${label}`,
      });
    } catch { /* estoque pode não estar configurado */ }
  };
  await baixa(cfg.emulsao_product_id, emu, 'emulsão');
  await baixa(cfg.sensib_product_id, sen, 'sensibilizante');
  await baixa(cfg.removedor_product_id, rem, 'removedor');

  const q = await bumpQuadro(req.tenantId, quadro, 'recuperacoes');
  const precisa_troca = q && (Number(q.recuperacoes) || 0) >= Number(cfg.troca_limite || 0);
  audit(req, 'create', 'matriz_perda', rec.id, { quadro, motivo, custo });
  return { ...rec, quadro_recuperacoes: q?.recuperacoes, precisa_troca };
}

// ── Detalhe (itens + arte) ────────────────────────────────
router.get('/:id', async (req, res) => {
  try {
    const { data: sale, error } = await supabase
      .from('VENDAS').select('*, CLIENTES(name, cpf_cnpj, phone, address), USUARIOS(name)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (error || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const { data: items } = await supabase
      .from('VENDA_ITENS').select('*, PRODUTOS(name, code, unit, ink_type)')
      .eq('sale_id', req.params.id);

    const { data: perdas } = await supabase
      .from('PRODUCAO_PERDAS').select('*')
      .eq('tenant_id', req.tenantId).eq('sale_id', req.params.id)
      .order('created_at', { ascending: false });

    const carac = (items || []).map(i => caracteristicasDoItem(i));
    const aplicaveis = etapasDosItens(carac);

    res.json({
      ...sale,
      order_date: sale.created_at ? String(sale.created_at).slice(0, 10) : null,
      photos: Array.isArray(sale.production_photos) ? sale.production_photos : [],
      history: Array.isArray(sale.production_log) ? sale.production_log : [],
      perdas: perdas || [],
      // O mesmo que a fila diz, para a tela do pedido aberto não ter de
      // recalcular nada por conta própria.
      acoes: acoesDoPedido(sale, aplicaveis, modulo),
      etapas: etapasDoPedido(aplicaveis, modulo, sale),
      regua: reguaDoPedido(sale, aplicaveis, modulo),
      status_label: A.infoStatus(sale.status).label,
      modulo_atual: A.moduloDoStatus(sale.status),
      // A RÉGUA GLOBAL INTEIRA — os 28 status, com o dono de cada um.
      // O módulo opera a sua fatia, mas quem abre o pedido precisa ver
      // onde ele está no caminho todo: "ainda no designer", "já foi
      // para a logística". É a mesma régua que o cliente vê no portal.
      linha_do_tempo: A.linhaDoTempo(sale, aplicaveis),
      prazo: Prazo.prazoDoPedido(sale, await Prazo.preparar(req.tenantId, [sale])),
      // A matriz que a revelação gravou, para quem for montar a máquina.
      matriz: matrizDoPedido(sale.production_log),
      // Quantas fotos este pedido precisa ter: uma por arte.
      artes: artesDoPedido(items),
      // Quanto foi vendido, quanto se perdeu e quanto a linha tem de
      // fazer — ver perdasDoPedido().
      producao: contaDaProducao(sale.production_log, items,
        Object.fromEntries(Object.entries(ETAPAS).map(([k, e]) => [k, e.label]))),
      items: (items || []).map(it => ({
        product_id: it.product_id,
        product_code: it.PRODUTOS?.code, product_name: it.product_name || it.PRODUTOS?.name,
        quantity: it.quantity, unit: it.PRODUTOS?.unit,
        color: it.customization?.cor || null,
        impressao: it.customization?.impressao || null,
        // A ARTE QUE A CLIENTE ANEXOU VENCE A PRÉVIA. A prévia é o
        // rascunho montado no configurador; o arquivo que ela enviou no
        // portal é o que a fábrica vai gravar. Mostrar a prévia por
        // cima dele é o caminho para imprimir o rascunho.
        art: it.customization?.arte_cliente?.url
          || it.customization?.arte?.preview_url
          || it.customization?.preview || null,
        art_file: it.customization?.art_file || null,
        obs: it.customization?.notes || null,
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Editar dados de produção (datas, transportadora, arte, obs) ──
router.patch('/:id', async (req, res) => {
  const allowed = ['event_date', 'ship_date', 'ship_time', 'carrier', 'art_file', 'production_obs', 'production_stage', 'freight', 'max_delivery_date'];
  const patch = {};
  for (const k of allowed) if (k in req.body) patch[k] = req.body[k] || null;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'Nada para atualizar' });
  try {
    const { data, error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * CONFIRMAR QUEM É — DUAS VEZES, DE PROPÓSITO.
 *
 * A senha é pedida ao preencher e PEDIDA DE NOVO na tela de "tem
 * certeza". Não é zelo excessivo: entre uma e outra está a conferência
 * dos dados, e é ali que a pessoa lê "matriz 47" e percebe que digitou
 * 74. Uma confirmação que não custa nada não faz ninguém reler.
 *
 * As duas são validadas de verdade, contra o Supabase Auth. Comparar a
 * segunda com a primeira no navegador seria teatro — bastaria colar o
 * mesmo texto errado duas vezes.
 */
async function confirmarIdentidade(req, senhas) {
  const email = req.user?.email;
  // Não usar 401: o interceptor do front trata 401 como sessão expirada.
  if (!email) return 'Não consegui confirmar sua sessão. Recarregue a página e tente de novo.';

  const client = makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  for (const [i, senha] of senhas.entries()) {
    if (!senha) return i === 0 ? 'Digite sua senha para confirmar.' : 'Digite a senha de novo para confirmar.';
    const { error } = await client.auth.signInWithPassword({ email, password: senha });
    if (error) {
      const errada = error.status === 400 || /invalid|credential|password|senha/i.test(error.message || '');
      if (errada) return i === 0 ? 'Senha incorreta.' : 'A segunda senha não confere.';
      return `Não foi possível confirmar a senha: ${error.message}`;
    }
  }
  return null;
}

/**
 * OS CAMPOS DA ETAPA, CONFERIDOS AQUI E NÃO SÓ NA TELA.
 *
 * A tela já não deixa avançar sem preencher; isto é o servidor dizendo
 * a mesma coisa. Uma aba velha aberta desde ontem, um duplo clique
 * antes do formulário carregar, um `curl` — todos chegam por aqui.
 */
function conferirCampos(campos, dados) {
  const registro = {};
  for (const c of campos) {
    const bruto = dados?.[c.key];
    if (c.tipo === 'sim') {
      if (c.obrigatorio && !bruto) return { erro: `Marque "${c.label}" para confirmar.` };
      registro[c.key] = !!bruto;
    } else if (c.tipo === 'numero') {
      const n = Number(bruto || 0);
      if (Number.isNaN(n) || n < 0) return { erro: `${c.label}: informe um número válido.` };
      if (c.obrigatorio && !n) return { erro: `Informe ${c.label.toLowerCase()}.` };
      registro[c.key] = n;
    } else if (c.tipo === 'opcao') {
      const v = String(bruto || '').trim();
      if (!c.opcoes.some(o => o.valor === v)) return { erro: `Escolha: ${c.label.toLowerCase()}.` };
      registro[c.key] = v;
    } else {
      const v = String(bruto || '').trim();
      if (c.obrigatorio && !v) return { erro: `Informe ${c.label.toLowerCase()}.` };
      registro[c.key] = v || null;
    }
  }
  return { registro };
}

/** O número da matriz que a revelação deste pedido gravou. */
function matrizDoPedido(log) {
  const m = [...(Array.isArray(log) ? log : [])].reverse()
    .find(e => e.stage === 'revelacao' && (e.matriz || e.quadro));
  return m ? (m.matriz || m.quadro) : null;
}

/**
 * QUANTAS FOTOS ESTE PEDIDO PRECISA TER.
 *
 * "Se houver 10 artes serão tiradas 10 fotos." Cada arte é um copo
 * diferente saindo da fábrica, e uma foto só mostraria um deles — o
 * cliente aprovaria no portal um pedido que ele nem viu inteiro.
 *
 * Conta-se ARTE DISTINTA, e não item: dois itens com a mesma arte (100
 * copos e 50 canecas do mesmo logo) são uma foto.
 */
function artesDoPedido(itens) {
  const artes = new Set();
  for (const it of itens || []) {
    const c = it.customization || {};
    const url = c.arte_cliente?.url || c.arte?.preview_url || c.preview || c.art_file;
    if (url) artes.add(String(url));
  }
  return artes.size;
}

/**
 * O AVISO DE "PRONTO PARA RETIRADA", montado uma vez só.
 *
 * O texto e o registro no histórico moram em `routes/expedicao.js`,
 * porque é lá que a logística avisa o cliente pelo botão. Aqui a
 * embalagem chama a mesma coisa — o cliente não tem por que receber
 * dois textos diferentes conforme quem apertou o botão.
 */
async function avisarProntoParaRetirada(req, saleId) {
  const expedicao = require('./expedicao');
  return expedicao.avisarCliente(req, saleId);
}

// ── Iniciar / Finalizar etapa (registra quem, quando e o quê) ────
router.post('/:id/stage', async (req, res) => {
  const { stage, action, password, password_confirma, actor_user, dados } = req.body;
  const etapa = ETAPAS[stage];
  if (!etapa || !['start', 'finish'].includes(action)) {
    return res.status(400).json({ error: 'Etapa ou ação inválida' });
  }
  try {
    if (!String(actor_user || '').trim()) return res.status(400).json({ error: 'Informe o usuário.' });

    /**
     * OS DADOS DA ETAPA VÊM ANTES DA SENHA.
     *
     * Conferir o formulário primeiro é o que evita a cena de digitar a
     * senha duas vezes e só então descobrir que faltava o número da
     * matriz.
     */
    // A ETAPA PRECISA SER DESTE MÓDULO. A tela do designer nunca
    // desenha "Finalizar embalagem" — mas a requisição pode vir de uma
    // aba antiga, de outro módulo, de um curl. O servidor é quem diz.
    if (etapa.modulo !== modulo) {
      return res.status(403).json({
        error: `"${etapa.label}" não é uma etapa de ${ROTULO_MODULO}.`,
        dica: `Ela é de ${A.MODULOS_DO_FLUXO[etapa.modulo]?.label || etapa.modulo}.`,
      });
    }

    // O pedido é lido ANTES dos campos: a coleta pergunta coisas
    // diferentes conforme é entrega ou retirada, e isso vem do pedido.
    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      // Os campos que os REQUISITOS de cada fase leem tambem vem: a coleta
      // exige transportadora (carrier_id), o transito olha o rastreio, a
      // arte olha o arquivo. Sem eles o motor recusava o avanco dizendo
      // "falta transportadora" num pedido que TINHA transportadora.
      .select(`production_log, production_stage, status, delivery_mode, notes, created_at, production_photos,
               carrier_id, tracking_code, artwork_url, art_file, event_date, ship_date, transport_days,
               VENDA_ITENS ( id, product_id, product_name, quantity, customization, PRODUTOS ( id, code, name, ink_type ) )`)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const campos = camposDaAcao(etapa, action, sale);
    const { registro, erro: erroCampo } = conferirCampos(campos, dados);
    if (erroCampo) return res.status(400).json({ error: erroCampo });

    const erroSenha = await confirmarIdentidade(req, [password, password_confirma]);
    if (erroSenha) return res.status(403).json({ error: erroSenha });

    const itens = (sale.VENDA_ITENS || []).map(i => caracteristicasDoItem(i));
    const aplicaveis = etapasDosItens(itens);

    /**
     * A AÇÃO PRECISA SER UMA DAS QUE O PEDIDO PERMITE AGORA, NESTE
     * MÓDULO. É esta peneira — e não "é personalizado?" — que impede
     * registrar revelação num copo liso (a revelação não está na lista
     * dele) e que impede finalizar a embalagem de um pedido que ainda
     * está na pintura. O histórico só conta o que houve.
     */
    const permitidas = acoesDoPedido(sale, aplicaveis, modulo);
    if (!permitidas.some(a => a.stage === stage && a.action === action)) {
      return res.status(409).json({
        error: `"${etapa.label}" não é o que este pedido espera agora (${A.infoStatus(sale.status).label}).`,
        dica: 'Atualize a tela — outra pessoa pode ter movido o pedido.',
      });
    }

    // A FOTO SÓ FECHA COM AS FOTOS LÁ. Uma por arte.
    if (etapa.exigeFoto && action === 'finish') {
      const fotos = (Array.isArray(sale.production_photos) ? sale.production_photos : []).length;
      const artes = Math.max(1, artesDoPedido(sale.VENDA_ITENS));
      if (fotos < artes) {
        return res.status(400).json({
          error: `Este pedido tem ${artes} arte(s) e ${fotos} foto(s) anexada(s).`,
          dica: 'Cada arte precisa da sua foto — é o que o cliente vê no portal.',
        });
      }
      registro.fotos = fotos;
      registro.artes = artes;
    }

    const agora = new Date().toISOString();
    const actor = String(actor_user || '').trim() || req.user?.name || req.user?.email || 'Usuário';
    const log = Array.isArray(sale.production_log) ? [...sale.production_log] : [];

    // O MARCO DA ETAPA — com tudo o que foi registrado dentro dele.
    log.push({
      stage, action, at: agora,
      user_id: req.user?.id || null, user: actor,
      confirmado_duas_vezes: true,
      ...registro,
    });

    const patch = { production_log: log };
    if (etapa.colunas) {
      const col = action === 'start' ? etapa.colunas.start : etapa.colunas.fim;
      if (col) patch[col] = agora;
    }
    if (action === 'start') patch.production_stage = stage;
    if (action === 'finish' && stage === 'embalagem') patch.production_stage = 'finalizado';

    /**
     * REPROVADO NÃO ANDA.
     *
     * O controle de qualidade é a etapa que pode dizer NÃO, e um "não"
     * que empurra o pedido para a embalagem não é um controle. A
     * conferência fica registrada com a avaria, e o pedido continua
     * aqui para ser refeito e conferido de novo.
     */
    const reprovado = stage === 'qualidade' && registro.resultado === 'reprovado';

    // ── O status do pedido, pela régua do fluxo ──────────────
    let avancou = null;
    if (action === 'start' && etapa.processo) {
      // "Estou com a mão nele agora". Não é fase nova — é a mesma, dita
      // de outro jeito, e a linha do tempo continua apontando pra cá.
      patch.status = etapa.processo;
      log.push({ stage: 'status', action: etapa.processo, at: agora, user_id: req.user?.id || null, user: actor });
    } else if (action === 'finish' && etapa.avancaAoTerminar !== false && !reprovado) {
      // Terminar a etapa É concluir a fase. Quem trabalha na produção
      // não deveria ter que abrir o pedido depois para avançar de novo.
      const passo = F.avancar(
        { ...sale, production_log: log },
        aplicaveis,
        { perfil: req.userProfile, acesso: req.acesso },
        { user: { id: req.user?.id || null, name: actor } },
      );
      /**
       * FINALIZAR QUE NAO ANDA E ERRO, E PRECISA DIZER POR QUE.
       *
       * O motor recusa o avanco quando falta um requisito da fase — a
       * coleta sem transportadora definida, por exemplo. Engolir essa
       * recusa e gravar o "finalizado" mesmo assim deixava o pedido
       * marcado como feito e parado no mesmo lugar, e quem clicou saia
       * achando que tinha andado. Agora a recusa volta com o motivo,
       * ANTES de gravar qualquer coisa.
       */
      if (passo.erro) {
        return res.status(passo.http || 409).json({
          error: passo.erro,
          dica: passo.dica || 'Resolva a pendencia no pedido de venda e tente de novo.',
          code: passo.code || null,
        });
      }
      patch.status = passo.status;
      patch.production_log = passo.log;
      avancou = passo.status;
    } else if (reprovado) {
      // Volta a esperar a conferência: o pedido não saiu daqui.
      patch.status = 'aguardando_qualidade';
    }

    const { error } = await supabase.from('VENDAS').update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    // ── A PERDA INFORMADA NA ETAPA VIRA PERDA DE VERDADE ─────
    //
    // Ela sai do estoque e entra em PRODUCAO_PERDAS pelo mesmo caminho
    // do botão "Registrar perda". Digitar a perda no fecho da etapa e o
    // estoque continuar cheio seria pior que não perguntar.
    const campoPerda = campos.find(c => c.perda);
    const perdidas = campoPerda ? Number(registro[campoPerda.key] || 0) : 0;
    if (perdidas > 0) {
      const principal = (sale.VENDA_ITENS || [])[0] || {};
      try {
        await registrarPerda(req, {
          product_id: principal.product_id || null,
          product_name: principal.product_name || null,
          quantity: perdidas,
          deduct_stock: true,
          notes: `${etapa.label} — informada ao finalizar por ${actor}`,
        });
      } catch (e) {
        console.error('[production/stage] perda:', e?.message || e);
      }
    }

    // Revelação concluída = +1 gravação na vida daquela matriz.
    if (stage === 'revelacao' && action === 'finish' && registro.matriz) {
      try { await bumpQuadro(req.tenantId, registro.matriz, 'gravacoes'); } catch { /* ignora */ }
    }

    // A TELA QUE VELOU. Ver registrarPerdaMatriz: os insumos saem do
    // estoque e a recuperação entra na vida daquela tela.
    let matrizPerdida = null;
    if (stage === 'revelacao' && action === 'finish' && registro.matriz_perdida && registro.matriz) {
      try {
        matrizPerdida = await registrarPerdaMatriz(req, {
          sale_id: req.params.id,
          quadro: registro.matriz,
          motivo: registro.matriz_motivo || 'Informada ao finalizar a revelação',
        });
      } catch (e) {
        console.error('[production/stage] perda de matriz:', e?.message || e);
      }
    }

    /**
     * RETIRADA NÃO PASSA PELA LOGÍSTICA — E O CLIENTE PRECISA SABER HOJE.
     *
     * Pedido que o cliente vem buscar não tem coleta, não tem
     * transportadora e não tem etiqueta de transporte: fechada a
     * embalagem, ele está pronto na prateleira e o único passo que
     * falta é a pessoa aparecer. Mandar isso para a fila da logística
     * seria criar uma espera que não existe — e é nessa espera que o
     * cliente liga perguntando se já pode vir.
     *
     * Então a mensagem sai daqui, no mesmo instante em que a caixa
     * fecha, montada pela MESMA função da tela de expedição — duas
     * redações do mesmo aviso viram duas Lyons.
     *
     * O envio segue meio automático enquanto a API oficial do WhatsApp
     * não estiver ligada: o texto vem pronto e quem fechou a embalagem
     * aperta enviar. A tela da produção abre a conversa sozinha.
     */
    let avisoAoCliente = null;
    if (action === 'finish' && stage === 'embalagem' && A.ehRetirada(sale)) {
      try {
        avisoAoCliente = await avisarProntoParaRetirada(req, req.params.id);
      } catch (e) {
        console.error('[production/stage] aviso de retirada:', e?.message || e);
      }
    }

    audit(req, 'update', 'production', req.params.id, { stage, action, ...registro });
    res.json({
      ok: true,
      aviso_cliente: avisoAoCliente,
      stage: patch.production_stage || sale.production_stage,
      status: patch.status || sale.status,
      status_label: A.infoStatus(patch.status || sale.status).label,
      // O pedido pode ter SAÍDO deste módulo — a embalagem fechada vai
      // para a logística. A tela avisa, em vez de o pedido só sumir.
      modulo_agora: A.moduloDoStatus(patch.status || sale.status),
      modulo_agora_label: A.MODULOS_DO_FLUXO[A.moduloDoStatus(patch.status || sale.status)]?.label || null,
      saiu_do_modulo: A.moduloDoStatus(patch.status || sale.status) !== modulo,
      avancou,
      reprovado,
      registrado: registro,
      /**
       * A PERDA NÃO ENCOLHE O PEDIDO — A FÁBRICA REPÕE.
       *
       * Vendeu 200 e quebraram 5? Saem 205 da linha, e o cliente recebe
       * as 200 que pediu. A perda é custo nosso, e não uma entrega
       * menor: quem compra 200 copos para uma festa de 200 pessoas não
       * tem o que fazer com 195.
       *
       * A tela precisa dizer isso NO MOMENTO em que a perda é
       * informada, senão a conta de quanto produzir fica na cabeça de
       * quem está na máquina.
       */
      repor: perdidas > 0 ? {
        unidades: perdidas,
        recado: `Reponha ${perdidas} unidade(s) — o cliente recebe a quantidade que pediu.`,
      } : null,
      matriz_perdida: matrizPerdida
        ? { quadro: matrizPerdida.quadro, custo: matrizPerdida.custo,
            recuperacoes: matrizPerdida.quadro_recuperacoes, precisa_troca: matrizPerdida.precisa_troca }
        : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A MATRIZ DESTE PEDIDO, para a tela mostrar ao iniciar a produção.
 *
 * Quem monta a máquina precisa saber qual tela pegar. O número já foi
 * gravado na revelação — pedir de novo seria convidar as duas cópias a
 * divergirem.
 */
router.get('/:id/matriz', async (req, res) => {
  try {
    const { data } = await supabase.from('VENDAS').select('production_log')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    res.json({ matriz: matrizDoPedido(data?.production_log) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Registrar perda na produção ───────────────────────────
/**
 * REGISTRAR UMA PERDA — de dois lugares, por um caminho só.
 *
 * A perda chega por duas portas: o botão "Registrar perda" (a perda
 * avulsa, notada no meio do trabalho) e o campo "perdeu alguma
 * unidade?" no fecho de cada etapa. As duas fazem a MESMA coisa —
 * linha em PRODUCAO_PERDAS, baixa no estoque, marco no histórico — e
 * duas cópias disso seriam duas contas de estoque diferentes.
 */
async function registrarPerda(req, { product_id, product_name, quantity, deduct_stock, notes }) {
  const qty = Number(quantity);
  const saleId = req.params.id;
  const actor = req.user?.name || req.user?.email || 'Usuário';

  const { data, error } = await supabase.from('PRODUCAO_PERDAS').insert({
    tenant_id: req.tenantId, sale_id: saleId,
    product_id: product_id || null, product_name: product_name || null,
    quantity: qty, user_id: req.user?.id || null, user_name: actor, notes: notes || null,
  }).select().single();
  if (error) throw error;

  // Baixa no estoque (quantidade negativa) se solicitado e houver produto.
  if (deduct_stock && product_id) {
    try {
      await supabase.rpc('atualizar_estoque', {
        p_tenant_id: req.tenantId, p_product_id: product_id, p_quantity: -Math.abs(qty),
        p_type: 'adjustment', p_reference_type: 'production', p_reference_id: saleId,
        p_user_id: req.user?.id || null, p_notes: `Perda na produção${notes ? ' — ' + notes : ''}`,
      });
    } catch { /* ignora se a RPC não existir */ }
  }

  const { data: sale } = await supabase.from('VENDAS').select('production_log')
    .eq('id', saleId).eq('tenant_id', req.tenantId).single();
  const log = Array.isArray(sale?.production_log) ? sale.production_log : [];
  log.push({
    stage: 'perda', action: 'registro', at: new Date().toISOString(),
    user_id: req.user?.id || null, user: actor,
    detail: `${qty} un${product_name ? ' — ' + product_name : ''}`,
    quantidade: qty, motivo: notes || null,
  });
  await supabase.from('VENDAS').update({ production_log: log })
    .eq('id', saleId).eq('tenant_id', req.tenantId);

  audit(req, 'create', 'production_loss', saleId, { product_id, quantity: qty });
  return data;
}

/**
 * NÃO EXISTE MAIS "REGISTRAR PERDA" AVULSO.
 *
 * Havia aqui uma rota com botão próprio, para lançar perda a qualquer
 * momento. Ela competia com o campo de perda do fecho de cada etapa, e
 * duas portas para o mesmo fato dão dois números: a mesma quebra
 * lançada nas duas vira o dobro no estoque, e a lançada em nenhuma some.
 *
 * Perda é coisa que acontece DENTRO de uma etapa — na pintura, na
 * borda, na produção, na embalagem — e é lá que ela é perguntada, a
 * quem estava com a peça na mão. `registrarPerda` continua existindo,
 * chamada de dentro do fecho da etapa.
 */

// ── Anexar foto do copo personalizado (visível ao cliente no site) ──
router.post('/:id/photo', async (req, res) => {
  const { image, caption } = req.body;
  if (!image) return res.status(400).json({ error: 'Envie a imagem (foto do copo)' });
  try {
    const url = await uploadDataUrl(image, 'producao');
    if (!url) return res.status(400).json({ error: 'Não consegui salvar a imagem' });

    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      .select('production_photos, production_log').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });

    const actor = req.user?.name || req.user?.email || 'Usuário';
    const photos = Array.isArray(sale.production_photos) ? sale.production_photos : [];
    photos.push({ url, caption: caption || null, at: new Date().toISOString(), user: actor });

    const log = Array.isArray(sale.production_log) ? sale.production_log : [];
    log.push({ stage: 'foto', action: 'anexou', at: new Date().toISOString(), user_id: req.user?.id || null, user: actor });

    const { error } = await supabase.from('VENDAS')
      .update({ production_photos: photos, production_log: log })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'create', 'production_photo', req.params.id, {});
    res.status(201).json({ ok: true, photos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Remover foto anexada ──────────────────────────────────
router.delete('/:id/photo', async (req, res) => {
  const url = req.query.url || req.body?.url;
  if (!url) return res.status(400).json({ error: 'Informe a foto a remover' });
  try {
    const { data: sale, error: e0 } = await supabase.from('VENDAS')
      .select('production_photos').eq('id', req.params.id).eq('tenant_id', req.tenantId).single();
    if (e0 || !sale) return res.status(404).json({ error: 'Pedido não encontrado' });
    const photos = (Array.isArray(sale.production_photos) ? sale.production_photos : []).filter(p => p.url !== url);
    const { error } = await supabase.from('VENDAS').update({ production_photos: photos })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json({ ok: true, photos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

  return router;
}

module.exports = criarRouter;
// Para quem precisar do catálogo sem montar rota (testes, relatórios).
module.exports.ETAPAS = ETAPAS;
module.exports.etapasDoPedido = etapasDoPedido;
