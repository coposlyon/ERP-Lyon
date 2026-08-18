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

// A derivação dos itens vive em itensPedido.js: a tela do vendedor
// mostra exatamente as mesmas características, e duas cópias da mesma
// conta é uma que vai divergir. Aqui só se escolhe O QUE sai.

function montarPedidoDoCliente(venda, extra = {}) {
  const cli = venda.CLIENTES || {};
  const info = A.infoStatus(venda.status);
  const itens = (venda.VENDA_ITENS || []).map(caracteristicasDoItem);

  return {
    pedido: {
      codigo: `PV-${String(venda.number).padStart(6, '0')}`,
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
    // Por fases, não por status: o cliente não precisa saber que
    // "aguardando arte" e "arte aprovada" são dois registros — ele
    // precisa saber em que ponto do caminho o pedido dele está.
    linha_do_tempo: A.fasesDoPedido(venda, etapasDosItens(itens)),
    historico: A.historicoPedido(venda),
    documentos: documentos(venda, extra.temNota),
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
