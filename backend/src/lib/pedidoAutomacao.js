// ============================================================
// O QUE O PEDIDO FAZ SOZINHO AO NASCER.
//
// Na Lyon o dinheiro entra ANTES do pedido: o cliente paga no balcão,
// manda o PIX ou combina o prazo, e só então alguém digita a venda. A
// etapa "Aguardando financeiro" existia para um mundo em que o pedido
// chega antes do pagamento — e aqui ela só fazia todo pedido nascer
// parado, esperando que alguém confirmasse o que já tinha acontecido.
//
// Então o pagamento passa a ser a PRIMEIRA ETAPA CONFIRMADA: o pedido
// nasce com ela cumprida e já entra na fila do estoque.
//
// E ISSO É UMA POLÍTICA, NÃO UMA LEI. Quem vende faturado, ou quem
// quer o financeiro conferindo cada entrada antes de a fábrica
// começar, desliga no painel de pedidos e o fluxo volta a pedir o
// comprovante. Por isso mora em `EMPRESAS.settings`, e não numa
// constante no código.
//
// O ESTOQUE NÃO ESTÁ AQUI, e é de propósito: a baixa já acontece
// dentro da função `criar_venda`, no Postgres, na mesma transação que
// grava a venda. Repetir a baixa aqui tiraria a quantidade duas vezes.
// A função permite saldo negativo — vendeu 200 sem ter, o produto fica
// em −200, que é a verdade e é o que faz o alerta de reposição
// aparecer.
// ============================================================

const supabase = require('../config/supabase');
const F = require('./fluxoPedido');

const CHAVE = 'confirmar_pagamento_automatico';

/**
 * A política da empresa. Ligada por padrão.
 *
 * O padrão é ligado porque é o que descreve a Lyon hoje. Empresa que
 * precisa do contrário desliga uma vez e nunca mais pensa nisso —
 * enquanto o inverso (padrão desligado) faria todo pedido nascer
 * parado até alguém descobrir a chave.
 */
async function confirmaPagamentoSozinho(tenantId) {
  try {
    const { data } = await supabase.from('EMPRESAS')
      .select('settings').eq('id', tenantId).maybeSingle();
    const v = data?.settings?.pedidos?.[CHAVE];
    return v === undefined || v === null ? true : !!v;
  } catch {
    // Sem conseguir ler a configuração, vale o padrão. Um pedido que
    // nasce andando é recuperável — "Voltar etapa" existe; um pedido
    // que nasce travado por causa de uma leitura falha é um chamado.
    return true;
  }
}

/**
 * Leva o pedido recém-criado até o fim da etapa de pagamento.
 *
 * São DOIS passos do mesmo motor que a tela usa, e não um UPDATE de
 * status escrito à mão: sair de "Pedido realizado" e concluir
 * "Pagamento". Assim a linha do tempo fica idêntica à de um pedido
 * confirmado no clique — com os quatro marcos no histórico, cada um
 * com hora — em vez de um pedido que aparece três fases à frente sem
 * nada explicando como chegou lá.
 *
 * Devolve `{ status, log }` para quem chama gravar, ou `null` quando
 * não há o que fazer. Falha aqui NÃO derruba a venda: ela já está
 * gravada, e o pior caso é o pedido ficar onde nasceu, esperando o
 * clique de sempre.
 */
function confirmarPagamentoAoNascer(venda, aplicaveis, req) {
  let atual = { ...venda };
  let resultado = null;

  // Duas voltas: "realizado" → "pagamento" → sai para a próxima fase.
  for (let i = 0; i < 2; i++) {
    const r = F.avancar(atual, aplicaveis, {}, req, null, { automatico: true });
    if (r.erro) break;
    atual = { ...atual, status: r.status, production_log: r.log };
    resultado = { status: r.status, log: r.log };
    // Chegou ao fim do pagamento: para aqui. O estoque, a arte e a
    // fábrica continuam sendo decisão de gente.
    if (r.fase?.key === 'pagamento') break;
  }

  return resultado;
}

module.exports = { confirmaPagamentoSozinho, confirmarPagamentoAoNascer, CHAVE };
