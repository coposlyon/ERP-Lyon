// ============================================================
// O CÓDIGO DO PEDIDO — um formato só, em todo lugar.
//
// Existiam DOIS. A lista de Pedidos de Venda mostrava `PV-0007`
// (frontend/src/lib/pedidoUi.js); o portal do cliente, o documento do
// pedido, o mural e os lançamentos do Financeiro mostravam
// `PV-000007` — e o Financeiro ainda tinha um terceiro jeito, `Venda #7`,
// escrito à mão na descrição da parcela.
//
// Três nomes para o mesmo pedido é o cliente perguntando por um número
// que o vendedor não acha, e o financeiro conferindo um extrato contra
// uma descrição que não bate com a tela de onde ela veio.
//
// O formato é o da LISTA (`PV-0007`), que é onde se compara um pedido
// com os outros — e é o que a Lyon já lê. Este arquivo é o espelho de
// `codigoPedido` do frontend: mudar um sem o outro traz o problema de
// volta.
// ============================================================

/** 'PV-0007' a partir do número da venda. */
const codigoPedido = n => `PV-${String(n ?? '').padStart(4, '0')}`;

module.exports = { codigoPedido };
