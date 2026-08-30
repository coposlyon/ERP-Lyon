/**
 * Pedido da loja → Venda.
 *
 * O pedido feito no site fica em PEDIDOS_LOJA até o pagamento ser
 * confirmado. Só então ele vira VENDA (Comercial → Pedidos de Venda) e
 * um recebimento no Financeiro. Esta lib concentra essa conversão para
 * que a loja e a tela de confirmação usem exatamente o mesmo caminho.
 */

const supabase = require('../config/supabase');

// Número da venda (RPC do banco). Sem a RPC, a venda entra sem número —
// é o mesmo comportamento tolerante que a loja já tinha.
async function proximoNumero(tenantId) {
  try {
    const { data } = await supabase.rpc('proximo_numero_venda', { p_tenant_id: tenantId });
    return data ?? null;
  } catch {
    return null;
  }
}

/**
 * Cria a VENDA + VENDA_ITENS a partir de um pedido da loja.
 * `pedido` = linha de PEDIDOS_LOJA (ou o mesmo formato, antes de gravar).
 */
async function criarVendaDoPedido(pedido, actor = {}) {
  const number = await proximoNumero(pedido.tenant_id);
  const itens = Array.isArray(pedido.items) ? pedido.items : [];

  const baseSale = {
    tenant_id: pedido.tenant_id,
    user_id: actor.userId || null,
    number,
    customer_id: pedido.customer_id,
    subtotal: pedido.subtotal,
    discount: 0,
    freight: pedido.freight || 0,
    total: pedido.total,
    notes: pedido.notes,
    status: 'iniciando_pedido',
    /**
     * PEDIDO DO SITE JÁ NASCE ENVIADO PARA A PRODUÇÃO.
     *
     * O pedido do ERP espera alguém apertar "Enviar para produção",
     * porque ali o comercial ainda pode estar acertando quantidade,
     * prazo ou arte com o cliente.
     *
     * No site não há esse "ainda": o cliente montou a peça no
     * configurador, fechou a arte, escolheu a quantidade e pagou.
     * Segurá-lo esperando um clique interno seria atrasar o que já
     * estava combinado — e ninguém tem o que revisar.
     */
    production_log: [{
      stage: 'status',
      action: 'enviado_producao',
      at: new Date().toISOString(),
      user_id: null,
      user: 'Pedido do site',
      origem: 'site',
    }],
  };

  // source/event_date podem não existir em bases antigas (migrations 029/…)
  const trySale = (extra) => supabase.from('VENDAS').insert({ ...baseSale, ...extra }).select('id, number').single();
  // origin='Site' porque foi o próprio cliente quem montou o pedido na
  // loja — é o único caso em que o ERP sabe a origem sem perguntar.
  let { data: sale, error } = await trySale({ source: 'site', origin: 'Site', event_date: pedido.event_date || null });
  // Base antiga sem `production_log`: o pedido tem que entrar do mesmo
  // jeito — só perde a marca de já ter ido para a produção.
  if (error && /production_log/i.test(error.message || '')) {
    delete baseSale.production_log;
    ({ data: sale, error } = await trySale({ source: 'site', origin: 'Site', event_date: pedido.event_date || null }));
  }
  if (error && /(source|origin|event_date)/i.test(error.message || '')) {
    ({ data: sale, error } = await trySale({ source: 'site', origin: 'Site' }));
    if (error && /origin/i.test(error.message || '')) ({ data: sale, error } = await trySale({ source: 'site' }));
    if (error && /source/i.test(error.message || '')) ({ data: sale, error } = await trySale({}));
  }
  if (error) throw error;

  const saleItems = itens.map(i => ({
    sale_id: sale.id,
    product_id: i.product_id,
    product_name: i.product_name,
    quantity: i.quantity,
    unit_price: i.unit_price,
    discount: 0,
    total: i.quantity * i.unit_price,
    customization: {
      ...(i.color ? { cor: i.color } : {}),
      ...(i.border ? { borda: i.border } : {}),
      ...(i.volume ? { volume: i.volume } : {}),
      ...(i.print_name ? { impressao: i.print_name } : {}),
      ...(i.design ? { design: i.design } : {}),
      ...(i.preview ? { preview: i.preview } : {}),
    },
  }));
  if (saleItems.length) {
    const { error: iErr } = await supabase.from('VENDA_ITENS').insert(saleItems);
    if (iErr) throw iErr;
  }

  return sale;
}

/**
 * Registra no Financeiro o dinheiro que já entrou (PIX confirmado).
 * Falha aqui não desfaz a venda — o pedido já está pago e liberado, e o
 * lançamento pode ser criado à mão. Por isso devolve o erro em vez de
 * estourar.
 */
async function registrarRecebimento(pedido, sale, actor = {}) {
  const hoje = new Date().toISOString().slice(0, 10);
  const desc = sale.number ? `Venda #${sale.number} — pedido do site (PIX)` : 'Pedido do site (PIX)';
  try {
    const { data, error } = await supabase.from('LANCAMENTOS').insert({
      tenant_id: pedido.tenant_id,
      user_id: actor.userId || null,
      description: desc,
      type: 'receivable',
      amount: pedido.total,
      paid_amount: pedido.total,
      due_date: hoje,
      paid_date: hoje,
      status: 'paid',
      payment_method: 'pix',
      customer_id: pedido.customer_id,
      installment: 1,
      total_installments: 1,
      reference_type: 'sale',
      reference_id: sale.id,
    }).select('id').single();
    if (error) throw error;
    return { ok: true, id: data.id };
  } catch (err) {
    console.error('[pedidoLoja] lançamento não criado:', err.message || err);
    return { ok: false, error: err.message || String(err) };
  }
}

module.exports = { criarVendaDoPedido, registrarRecebimento };
