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
// A BAIXA DO ESTOQUE NÃO É DADA AQUI — E A ETAPA DELE É CUMPRIDA AQUI.
// São duas coisas, e confundi-las custou caro nas duas pontas.
//
// A baixa acontece dentro de `criar_venda`, no Postgres, na mesma
// transação que grava a venda: repetir a baixa aqui tiraria a
// quantidade duas vezes. A função permite saldo negativo — vendeu 200
// sem ter, o produto fica em −200, que é a verdade e é o que faz o
// alerta de reposição aparecer.
//
// Mas a ETAPA "Aguardando estoque" ficava acesa mesmo assim, esperando
// alguém confirmar uma baixa que já tinha sido dada e que aquele clique
// não desfaz. Era uma espera que não existia, escrita na tela do
// cliente. Agora ela é cumprida junto com as outras que já aconteceram
// — ver CUMPRIDA_SOZINHA, mais abaixo.
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
 * AS ETAPAS QUE O SISTEMA PODE DAR POR CUMPRIDAS SOZINHO.
 *
 * A regra é uma só, e vale para as três: só entra aqui a etapa cujo
 * trabalho JÁ ACONTECEU de fato. Isto não é adiantar o pedido — é parar
 * de pedir que alguém confirme à mão o que o sistema já fez.
 *
 *   realizado  o pedido acabou de ser gravado. Ele existe.
 *
 *   pagamento  a política da empresa (acima) diz que aqui o dinheiro
 *              entra ANTES do pedido ser digitado.
 *
 *   estoque    A BAIXA JÁ FOI DADA. `criar_venda` desconta a quantidade
 *              no Postgres, na mesma transação que grava a venda — o
 *              produto já saiu do saldo antes de este código rodar.
 *              Parar o pedido em "Aguardando estoque" era pedir que
 *              alguém confirmasse uma baixa que ninguém pode desfazer
 *              clicando ali.
 *
 *   arte       SÓ SE O ARQUIVO ESTIVER LÁ E O CLIENTE TIVER DITO SIM.
 *              É a única condicional das quatro, e por isso recebe a
 *              venda: sem arte anexada a etapa continua sendo o que
 *              sempre foi — o pedido para e espera.
 *
 *              A SEGUNDA METADE DA CONDIÇÃO É NOVA, e existe porque
 *              "existe arquivo" deixou de significar "está combinado".
 *              Quando é a LOJA que anexa a arte, ela ainda vai ao
 *              cliente para ver e confirmar; passar sozinho por cima
 *              dessa espera era mandar para a serigrafia um desenho que
 *              o cliente nunca viu — e quem descobre o erro depois do
 *              vegetal descobre em cima de mil copos impressos.
 *
 *              A arte que o PRÓPRIO cliente manda nasce aprovada, então
 *              para ela nada muda: chegou, o pedido anda.
 *
 * O QUE NUNCA ENTRA AQUI: nada da fábrica. Vegetal, revelação, pintura,
 * borda, produção, qualidade e embalagem são trabalho de mão humana, e
 * marcar como feito o que ninguém fez é escrever mentira no histórico.
 */
const CUMPRIDA_SOZINHA = {
  realizado: () => true,
  pagamento: (v, o) => !!o.pagamentoAutomatico,
  estoque:   () => true,
  arte:      v => !!(v.artwork_url || v.art_file)
                  && !(v.arte_resumo?.aguardando > 0)
                  && !(v.arte_resumo?.reprovadas > 0),
};

/**
 * Anda com o pedido enquanto a próxima etapa já estiver cumprida.
 *
 * São passos do MESMO motor que a tela usa, e não um UPDATE de status
 * escrito à mão: a linha do tempo fica idêntica à de um pedido tocado no
 * clique — cada marco no histórico, com hora e com a marca de
 * automático — em vez de um pedido que aparece cinco fases à frente sem
 * nada explicando como chegou lá.
 *
 * PARA NA PRIMEIRA ETAPA QUE É DE GENTE, e o resultado daquela volta é
 * DESCARTADO: `avancar` só devolve o que gravar, não grava nada, então
 * espiar a etapa seguinte e desistir dela não deixa rastro.
 *
 * Devolve `{ status, log }` para quem chama gravar, ou `null` quando não
 * havia o que fazer.
 */
function avancarOQueJaEstaFeito(venda, aplicaveis, req, opcoes = {}) {
  let atual = { ...venda };
  let resultado = null;

  // O teto é o tamanho do trilho: sem ele, um erro em `avancar` que
  // devolvesse sempre o mesmo status viraria laço infinito dentro da
  // criação da venda.
  for (let i = 0; i < 8; i++) {
    const r = F.avancar(atual, aplicaveis, {}, req, null, { automatico: true });
    if (r.erro) break;

    const cumprida = CUMPRIDA_SOZINHA[r.fase?.key];
    if (!cumprida || !cumprida(atual, opcoes)) break;

    atual = { ...atual, status: r.status, production_log: r.log };
    resultado = { status: r.status, log: r.log };
  }

  return resultado;
}

/**
 * O pedido recém-criado, levado até onde ele já está de fato.
 *
 * Com a política de pagamento ligada, o caminho normal é: nasce em
 * "Pedido realizado", passa pelo financeiro, passa pelo estoque (a baixa
 * já foi dada) e para em "Aguardando anexo da arte" — que é a primeira
 * coisa que realmente falta alguém fazer. Se a arte já veio junto, passa
 * por ela também e para na porta da fábrica.
 */
function confirmarPagamentoAoNascer(venda, aplicaveis, req, opcoes = {}) {
  return avancarOQueJaEstaFeito(venda, aplicaveis, req, {
    pagamentoAutomatico: opcoes.pagamentoAutomatico !== false,
  });
}

/**
 * O PEDIDO DEPOIS QUE A ARTE CHEGOU.
 *
 * Chamado por quem grava a arte — a tela do vendedor, o portal do
 * cliente. Enquanto isto não existia, o portal aceitava o arquivo e o
 * pedido continuava escrito "Aguardando anexo da arte": a arte estava
 * lá, e a tela dizia que não.
 *
 * Vale para o resto do caminho automático também. Um pedido que estava
 * parado no estoque por ter nascido antes desta regra sai dali na
 * primeira vez que passar por aqui, em vez de esperar um clique que
 * ninguém sabia que devia dar.
 *
 * `venda` precisa vir JÁ com a arte gravada — é o `artwork_url` dela que
 * responde se a etapa está cumprida.
 */
async function avancarAposArte(tenantId, venda, aplicaveis, req) {
  return avancarOQueJaEstaFeito(venda, aplicaveis, req, {
    pagamentoAutomatico: await confirmaPagamentoSozinho(tenantId),
  });
}

module.exports = {
  confirmaPagamentoSozinho, confirmarPagamentoAoNascer,
  avancarOQueJaEstaFeito, avancarAposArte, CHAVE,
};
