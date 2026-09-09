// ============================================================
// O que o CLIENTE vê do próprio pedido.
//
// Esta é a única porta por onde dados de pedido saem para fora do ERP,
// e ela é uma lista de permissão, não de bloqueio: monta-se um objeto
// novo campo a campo, em vez de pegar a venda e apagar o que não pode.
// A diferença importa — com lista de bloqueio, uma coluna nova nasce
// exposta e ninguém percebe.
//
// Fora daqui, sempre: custo, margem, comissão, rateio, taxa
// administrativa, desconto interno, observações internas, alertas,
// dados de outros clientes e qualquer coisa de outro pedido.
// ============================================================
const A = require('./atencao');
const { capacidade, caracteristicasDoItem, etapasDosItens } = require('./itensPedido');
// QUEM USA, IMPORTA. `paraOCliente` (o nome de quem retira, mascarado
// para os olhos do cliente) estava importado na ROTA e chamado AQUI —
// e a rota não empresta o escopo dela para a lib. Toda abertura de
// pedido no portal caía no catch com "Não foi possível carregar o
// pedido", que é a frase que esconde um ReferenceError.
const { paraOCliente } = require('./retirada');
// O código do pedido tem um formato só — ver lib/pedidoCodigo.js.
const { codigoPedido } = require('./pedidoCodigo');

const soDigitos = s => String(s || '').replace(/\D/g, '');

/**
 * CPF/CNPJ parcialmente escondido. O cliente precisa reconhecer que o
 * documento é o dele; não precisa vê-lo inteiro numa tela que pode
 * estar aberta no balcão.
 */
function mascararDoc(doc) {
  const d = soDigitos(doc);
  if (d.length === 11) return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`;
  if (d.length === 14) return `**.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-**`;
  return doc || null;
}

/**
 * Os avisos que valem para qualquer pedido, quando a empresa ainda não
 * cadastrou os dela em Configurações. São regra comercial, e por isso
 * moram no banco — aqui é só a rede de segurança.
 */
const AVISOS_PADRAO = [
  'Pagamento somente integral.',
  'Alteração de arte após aprovação: taxa de R$ 20,00.',
  'Alteração de produto poderá gerar novo prazo de produção.',
  'O andamento seguirá conforme disponibilidade e aprovação do pedido.',
];

/**
 * A nota fiscal só existe depois que a Logística emite. Antes disso o
 * botão fica desabilitado explicando por quê — botão que não funciona
 * sem dizer o motivo faz o cliente ligar para perguntar.
 */
function documentos(venda, temNota, temComprovante) {
  return [
    { key: 'pedido', label: 'Baixar Pedido em PDF', disponivel: true },
    {
      // TER FORMA DE PAGAMENTO NAO E TER COMPROVANTE.
      //
      // A condicao era `!!venda.payment_method`: bastava o pedido ser
      // Pix para o botao acender, mesmo sem arquivo nenhum anexado. O
      // cliente clicava e nao vinha nada. Agora ele so liga quando
      // existe comprovante de verdade - no pedido (campo antigo) ou em
      // alguma parcela (migracao 095).
      key: 'comprovante', label: 'Baixar Comprovante',
      disponivel: !!temComprovante,
      nota: temComprovante ? null : 'Disponível depois que o comprovante do pagamento for anexado.',
    },
    {
      key: 'nfe', label: 'Baixar Nota Fiscal',
      disponivel: !!temNota,
      nota: temNota ? null : 'Disponível após emissão pela Logística.',
    },
  ];
}

// A derivação dos itens vive em itensPedido.js: a tela do vendedor
// mostra exatamente as mesmas características, e duas cópias da mesma
// conta é uma que vai divergir. Aqui só se escolhe O QUE sai.

function montarPedidoDoCliente(venda, extra = {}) {
  const cli = venda.CLIENTES || {};
  const info = A.infoStatus(venda.status);
  // Campo a campo, mesmo vindo de uma função nossa. caracteristicasDoItem
  // devolve também tem_borda/tem_pintura, que existem para a linha do
  // tempo decidir se mostra a etapa — são processo interno e não têm o
  // que fazer na tela do cliente. Repassar o objeto inteiro seria a
  // lista de bloqueio disfarçada que este arquivo existe para evitar:
  // campo novo na lib nasceria exposto aqui e ninguém perceberia.
  const detalhados = (venda.VENDA_ITENS || []).map(caracteristicasDoItem);
  const itens = detalhados.map(i => ({
    // O id do item, e só ele: e por ele que a cliente anexa a arte que
    // montou depois de pagar. Nao expoe nada — sem o token do pedido
    // ele nao abre porta nenhuma.
    id: i.id,
    personalizar: i.personalizar,
    // ESTE ITEM LEVA ARTE?
    //
    // `personalizar` não responde isso: é uma marca que só o CATÁLOGO
    // grava, a cliente dizendo na compra pelo site "monto a arte
    // depois". Pedido digitado no balcão nunca teve o campo — e o bloco
    // "Sua personalização" não aparecia, então a cliente abria o portal
    // para mandar a arte e não achava onde. Um copo com "PRETO - PS" na
    // cor da personalização é personalizado por definição, tenha ou não
    // passado pelo site.
    precisa_arte: !!(i.personalizar || i.tem_personalizacao),
    arte_pronta: i.arte_pronta,
    // A arte que ela ANEXOU (o arquivo do designer dela), separada da
    // que ela MONTOU no editor: a tela precisa dizer qual das duas
    // chegou, e mostrar o arquivo que subiu é a prova de que subiu o
    // certo.
    arte_anexada: i.arte_anexada,
    arte_anexada_em: i.arte_anexada_em,
    // ── O QUE O CLIENTE PRECISA DECIDIR ───────────────────────
    //
    // Quando a LOJA manda a arte, ela não vale por combinada: o cliente
    // vê e diz se é aquilo. Enquanto ele não diz, o item fica em
    // `aguardando_cliente` e a tela mostra os dois botões; depois de
    // aprovada, some o botão de trocar — dali em diante o desenho vira
    // vegetal, tela e copo, e trocar em silêncio é o caminho para mil
    // peças saírem erradas sem ninguém saber quem mandou trocar.
    arte_estado: i.arte_estado,
    arte_por: i.arte_por,
    arte_aprovada_em: i.arte_aprovada_em,
    arte_reprovada_em: i.arte_reprovada_em,
    arte_reprovada_motivo: i.arte_reprovada_motivo,
    modelo_chave: i.modelo_chave,
    codigo: i.codigo,
    produto: i.produto,
    capacidade: i.capacidade,
    linha: i.linha,
    categoria: i.categoria,
    campos: i.campos,
    quantidade: i.quantidade,
    valor_unitario: i.valor_unitario,
    valor_total: i.valor_total,
    // A ETAPA É DO PRODUTO, NÃO DO PEDIDO.
    //
    // Um pedido com três copos diferentes tem UM andamento, mas cada
    // item percorre um caminho: o long drink com borda metalizada passa
    // pela aplicação de borda, o degradê passa pela pintura, a caneca
    // preto fosco não passa por nenhuma das duas. Mostrar a mesma régua
    // para os três faz o cliente esperar por uma etapa que o copo dele
    // nunca vai ter.
    //
    // Vem CALCULADA daqui, e não como `tem_borda`/`tem_pintura` soltos:
    // esses dois são processo interno, e a regra desta função é campo a
    // campo — o que sai é o que a tela do cliente precisa, nada além.
    //
    // `personalizado` faltava nesta lista, e a falta aparecia na tela:
    // o copo liso de um pedido misto mostrava arte, vegetal e revelação
    // na linha do tempo dele, porque o PEDIDO estava na etapa da arte.
    // `doItem` é o que diz à régua que aqui a pergunta é outra — o
    // caminho deste copo, não o do pedido.
    linha_do_tempo: A.linhaDoTempo(
      venda,
      { borda: i.tem_borda, pintura: i.tem_pintura, personalizado: i.tem_personalizacao },
      { doItem: true },
    ),
  }));

  return {
    pedido: {
      codigo: codigoPedido(venda.number),
      numero: venda.number,
      status: venda.status,
      status_label: info.label,
      status_cor: info.cor,
      concluido: !!info.final,
      data: venda.operation_date ? `${venda.operation_date}T12:00:00` : venda.created_at,
      data_evento: venda.event_date || null,
      origem: venda.origin || null,
      transportadora: extra.transportadora || null,
      cotacao: venda.freight_quote || null,
      rastreio: venda.tracking_code || null,
    },

    cliente: {
      nome: cli.name || null,
      codigo: cli.display_id != null ? String(cli.display_id).padStart(4, '0') : null,
      documento: mascararDoc(cli.cpf_cnpj),
      telefone: cli.mobile || cli.phone || null,
      email: cli.email || null,
      cidade: cli.address?.city || null,
      uf: cli.address?.state || null,
      // O selo do Lyon Prime. As regras de benefício ainda não foram
      // definidas — aqui só sai o número de estrelas que o cadastro já
      // tem, sem nenhuma vantagem calculada em cima disso.
      prime_estrelas: Number(cli.rating) || 0,
    },

    // Só três linhas: o que o cliente pagou. Composição de preço,
    // desconto interno e margem de frete não saem daqui.
    valores: {
      produtos: Number(venda.subtotal) || 0,
      frete: Number(venda.freight) || 0,
      total: Number(venda.total) || 0,
    },

    prazos: {
      saida: venda.ship_date || null,
      coleta: venda.collect_date || null,
      entrega: venda.delivery_date || null,
      dias_transporte: venda.transport_days || null,
    },

    itens,

    /**
     * AS FOTOS DO PEDIDO PRONTO.
     *
     * A fábrica fotografava — uma foto por arte, é etapa obrigatória —
     * e o cliente nunca via. As fotos ficavam em `production_photos`,
     * lidas só pela tela da produção; do lado de fora ninguém sabia que
     * existiam.
     *
     * É a última conferência antes de a caixa sair, e a única em que
     * quem olha é quem comprou: o pedido ainda está aqui, e um erro
     * visto agora se conserta sem frete de volta.
     *
     * Sem legenda interna e sem quem tirou — o cliente quer ver o copo
     * dele, não o nome do operador da bancada.
     */
    fotos: (Array.isArray(venda.production_photos) ? venda.production_photos : [])
      .filter(f => f?.url)
      .map(f => ({ url: f.url, em: f.at || null })),

    // A régua DETALHADA, com "aguardando" e "confirmado" separados. É o
    // contrário da tela do vendedor de propósito: quem acompanha a
    // própria compra quer ver cada movimentação acontecer, enquanto quem
    // trabalha o dia inteiro na tela quer o resumo. Pintura e borda só
    // aparecem se este pedido passar por elas.
    linha_do_tempo: A.linhaDoTempo(venda, etapasDosItens(detalhados)),

    // ── RETIRADA ─────────────────────────────────────────────
    // Só existe quando o pedido é para buscar. Em entrega o bloco não
    // vem, e a tela não tem como perguntar por engano quem retira um
    // pedido que vai de caminhão.
    retirada: A.ehRetirada(venda) ? {
      // O momento de perguntar é quando o pedido está pronto esperando
      // alguém buscar — antes disso a pergunta é ansiedade, e depois é
      // tarde.
      pedir_agora: venda.status === 'aguardando_coleta',
      autorizado: paraOCliente(venda.pickup_person),

      /**
       * A DECLARAÇÃO DE CONFERÊNCIA — só no balcão, e só uma vez.
       *
       * `confirmar_agora` é o pedido esperando alguém buscar: é o único
       * momento em que a frase "abri e conferi" pode ser verdade.
       * Oferecer antes é pedir assinatura em caixa fechada.
       *
       * `confirmada` guarda quando e quem — depois de assinada, a tela
       * mostra o registro em vez do botão.
       */
      confirmar_agora: ['aguardando_coleta', 'coleta_processo', 'embalagem_finalizada']
        .includes(venda.status),
      confirmada: (() => {
        const e = (venda.production_log || [])
          .filter(x => x.action === 'retirada_confirmada').slice(-1)[0];
        return e ? { em: e.at, por: e.user, declaracao: e.declaracao } : null;
      })(),
    } : null,
    historico: A.historicoPedido(venda),
    documentos: documentos(venda, extra.temNota, extra.temComprovante),
    avisos: (extra.avisos && extra.avisos.length) ? extra.avisos : AVISOS_PADRAO,

    entrega: {
      texto: 'A entrega será realizada no endereço informado no cadastro, em horário comercial, '
           + 'das 8h às 18h, em dias úteis.',
      observacao: 'É necessário que haja alguém disponível no local para receber a mercadoria.',
    },
  };
}

module.exports = {
  soDigitos, mascararDoc, capacidade,
  caracteristicasDoItem, montarPedidoDoCliente, AVISOS_PADRAO,
};
