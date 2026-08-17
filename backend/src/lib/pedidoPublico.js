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

/** Capacidade lida do nome do produto ("TAÇA GIN 600 ML" → "600 ml"). */
function capacidade(nome) {
  const m = String(nome || '').match(/(\d{2,4})\s*ML\b/i);
  return m ? `${m[1]} ml` : null;
}

/**
 * As características que o cliente realmente comprou.
 *
 * Os campos mudam com a categoria: um copo tradicional tem uma cor,
 * um degradê tem cor de base e de boca, um jateado tem a cor do
 * jateado. Mostrar "Cor da boca: —" num produto tradicional é ruído
 * que faz o cliente achar que faltou combinar alguma coisa — por isso
 * o que não se aplica simplesmente não aparece.
 *
 * A fonte é o JSON de personalização gravado no lançamento do item.
 */
function caracteristicasDoItem(item) {
  const c = item.customization || {};
  const nome = item.PRODUTOS?.name || item.product_name || 'Produto';

  // "Cor degradê: AZUL/ROSA" → { tipo: 'Cor degradê', valor: 'AZUL/ROSA' }
  const acabamentos = String(c['Acabamentos'] || '')
    .split(',').map(s => s.trim()).filter(Boolean)
    .map(a => {
      const [tipo, ...resto] = a.split(':');
      return { tipo: tipo.trim(), valor: resto.join(':').trim() || null };
    });

  const achar = re => acabamentos.find(a => re.test(a.tipo));
  const degrade = achar(/degrad/i);
  const bicolor = achar(/bicolor/i);
  const jateado = achar(/jatead/i);

  // "Com borda: PRATA" → cor da borda; "Sem borda" → não mostra nada
  const bordaBruta = String(c['Borda'] || '');
  const temBorda = /com borda/i.test(bordaBruta);
  const corBorda = temBorda ? (bordaBruta.split(':')[1] || '').trim() || null : null;

  // A categoria é o acabamento contratado; sem nenhum, é o tradicional.
  const categoria = degrade ? 'Degradê'
                  : bicolor ? 'Bicolor'
                  : jateado ? 'Jateado'
                  : acabamentos[0]?.tipo || 'Tradicional';

  // Cada categoria monta a própria lista. Campo sem valor fica de fora.
  const campos = [];
  const push = (rotulo, valor) => { if (valor) campos.push({ rotulo, valor }); };

  if (degrade || bicolor) {
    const par = (degrade || bicolor).valor || '';
    const [base, boca] = par.split('/').map(s => s.trim());
    push('Cor base', base || c['Variação']);
    push('Cor da boca', boca);
  } else if (jateado) {
    push('Cor do jateado', jateado.valor || c['Variação']);
  } else {
    push('Cor do produto', c['Variação']);
  }

  if (corBorda) push('Cor da borda', corBorda);
  push('Cor da personalização', c['Cor da personalização']);

  // Acabamentos extras que não viraram categoria nem borda
  acabamentos
    .filter(a => a !== degrade && a !== bicolor && a !== jateado)
    .forEach(a => push(a.tipo, a.valor || 'sim'));

  return {
    codigo: c['Código'] || item.PRODUTOS?.code || null,
    produto: nome,
    capacidade: capacidade(nome),
    linha: c['Tinta'] || item.PRODUTOS?.ink_type || null,
    categoria,
    campos,
    quantidade: Number(item.quantity) || 0,
    valor_unitario: Number(item.unit_price) || 0,
    valor_total: Number(item.total) || 0,
  };
}

/**
 * A nota fiscal só existe depois que a Logística emite. Antes disso o
 * botão fica desabilitado explicando por quê — botão que não funciona
 * sem dizer o motivo faz o cliente ligar para perguntar.
 */
function documentos(venda, temNota) {
  return [
    { key: 'pedido', label: 'Baixar Pedido em PDF', disponivel: true },
    {
      key: 'comprovante', label: 'Baixar Comprovante',
      disponivel: !!venda.payment_method,
      nota: venda.payment_method ? null : 'Disponível após a confirmação do pagamento.',
    },
    {
      key: 'nfe', label: 'Baixar Nota Fiscal',
      disponivel: !!temNota,
      nota: temNota ? null : 'Disponível após emissão pela Logística.',
    },
  ];
}

// Os avisos padrão. Ficam em EMPRESAS.settings.pedido_avisos; esta é a
// lista que vale enquanto ninguém configurou nada.
const AVISOS_PADRAO = [
  'Pagamento somente integral.',
  'Alteração de arte após aprovação: taxa de R$ 20,00.',
  'Alteração de produto poderá gerar novo prazo de produção.',
  'O andamento seguirá conforme disponibilidade e aprovação do pedido.',
];

/**
 * Monta o pedido como o cliente vê.
 *
 * @param venda    linha de VENDAS com CLIENTES, VENDA_ITENS e USUARIOS
 * @param extra    { transportadora, temNota, avisos }
 */
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
    linha_do_tempo: A.linhaDoTempo(venda),
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
