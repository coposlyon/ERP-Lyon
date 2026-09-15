// ============================================================
// O PEDIDO DE VENDA EM PDF — OS DADOS DA FOLHA.
//
// UMA FOLHA SÓ, DOS DOIS LADOS DO BALCÃO. O cliente baixava no portal a
// impressão da própria tela de acompanhamento, e o ERP imprimia o
// "Pedido de Venda — Documento": dois papéis diferentes para o mesmo
// pedido, e o cliente com um na mão discutindo com o vendedor com o
// outro. Agora o portal desenha a mesma folha do ERP, e quem entrega os
// dados para ela é este arquivo, no mesmo formato da rota
// /area-vendedor/pedidos/:id.
//
// O que NÃO entra continua não entrando: custo, margem e rateio não são
// do cliente e nem são consultados aqui.
// ============================================================
const supabase = require('../config/supabase');
const { codigoPedido } = require('./pedidoCodigo');
const A = require('./atencao');
const { caracteristicasDoItem } = require('./itensPedido');

/**
 * Os avisos do pedido: o padrão da empresa (Configurações) mais o que
 * for específico deste pedido. Ficam no banco e não no código porque
 * mudam com a política comercial — o custo de alterar arte não é
 * decisão de programador.
 */
async function avisosDoPedido(tenantId, venda) {
  let padrao = [];
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', tenantId).maybeSingle();
    const cfg = data?.settings?.pedido_avisos;
    if (Array.isArray(cfg)) padrao = cfg;
  } catch { /* sem configuração: só os do pedido */ }
  const doPedido = Array.isArray(venda.avisos) ? venda.avisos : [];
  return [...padrao, ...doPedido].map(String).filter(Boolean);
}

// Sem comentário dentro da lista: o PostgREST lê a string inteira como
// select, e um comentário ali já derrubou o portal duas vezes.
const CAMPOS = `
  id, tenant_id, number, status, origin, subtotal, discount, freight, total,
  created_at, operation_date, event_date, ship_date, delivery_date,
  collect_date, transport_days, freight_quote, avisos,
  payment_method, artwork_url, artwork_notes, carrier_id,
  CLIENTES ( id, display_id, name, cpf_cnpj, phone, mobile, email, address ),
  USUARIOS ( id, name ),
  VENDA_ITENS ( id, product_name, quantity, unit_price, discount, total, customization,
                PRODUTOS ( id, code, name, unit, ink_type ) )
`;

// A mesma lista sem as colunas de migrações recentes: numa base que
// ainda não migrou, o PDF tem que sair do mesmo jeito.
const CAMPOS_BASICOS = CAMPOS
  .replace('collect_date, transport_days,', '')
  .replace('freight_quote, avisos,', '')
  .replace(', event_date', '');

async function buscarVenda(saleId, tenantId, campos) {
  let q = supabase.from('VENDAS').select(campos).eq('id', saleId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  return q.maybeSingle();
}

async function nomeTransportadora(carrierId) {
  if (!carrierId) return null;
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('name, trade_name').eq('id', carrierId).maybeSingle();
    return data ? (data.trade_name || data.name) : null;
  } catch { return null; }
}

/**
 * A folha do pedido, pronta para o DocumentoPedidoView.
 *
 * `tenantId` é opcional porque o portal não tem empresa no login: quem
 * garante que o pedido é do cliente é a rota, antes de chamar aqui.
 */
async function carregarDocumento(saleId, tenantId = null) {
  let { data, error } = await buscarVenda(saleId, tenantId, CAMPOS);
  if (error && /column|does not exist|schema cache/i.test(error.message || '')) {
    ({ data, error } = await buscarVenda(saleId, tenantId, CAMPOS_BASICOS));
  }
  // Erro calado aqui vira "Pedido não encontrado" sem rastro no log.
  if (error) console.error('[documentoPedido]', error.message);
  if (error || !data) return null;

  const [transportadora, empresaRes, avisos] = await Promise.all([
    nomeTransportadora(data.carrier_id),
    supabase.from('EMPRESAS').select('name, cnpj, address, phone, email').eq('id', data.tenant_id).maybeSingle(),
    avisosDoPedido(data.tenant_id, data),
  ]);

  return {
    id: data.id,
    codigo: codigoPedido(data.number),
    status_label: A.infoStatus(data.status).label,
    origin: data.origin,
    payment_method: data.payment_method,
    subtotal: data.subtotal,
    discount: data.discount,
    freight: data.freight,
    total: data.total,
    created_at: data.created_at,
    operation_date: data.operation_date,
    event_date: data.event_date || null,
    ship_date: data.ship_date,
    delivery_date: data.delivery_date,
    collect_date: data.collect_date || null,
    transport_days: data.transport_days || null,
    freight_quote: data.freight_quote || null,
    artwork_url: data.artwork_url,
    artwork_notes: data.artwork_notes,
    CLIENTES: data.CLIENTES || null,
    codigo_cliente: data.CLIENTES?.display_id != null ? String(data.CLIENTES.display_id).padStart(4, '0') : null,
    vendedor: data.USUARIOS?.name || null,
    transportadora,
    empresa: empresaRes?.data || null,
    avisos,
    itens: (data.VENDA_ITENS || []).map(item => ({ id: item.id, ...caracteristicasDoItem(item) })),
  };
}

module.exports = { carregarDocumento, avisosDoPedido };
