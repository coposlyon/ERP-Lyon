// ============================================================
// O PREÇO DE VENDA MORA AQUI. UM LUGAR SÓ.
//
// O sintoma era este: o cadastro do produto dizia R$ 2,11 e o pedido
// puxava outro valor. Não havia bug — havia QUATRO telas gravando o
// mesmo campo e três funções lendo-o de jeitos parecidos:
//
//   escreviam   Precificação · cadastro do Produto · Edição em massa ·
//               Ajuste de vitrine
//   liam        calc.precoFaixa (servidor) · tierPrice (PDV, cópia
//               literal da outra) · a função criar_venda no banco
//
// Quatro portas para o mesmo número é o mesmo que não ter cadastro: o
// último que salvou ganha, e ninguém sabe quem foi.
//
// A REGRA AGORA:
//
//   QUEM DEFINE   Precificação, e só ela. É a tela que parte do custo,
//                 aplica margem e chega no preço — decidir preço é o
//                 trabalho dela. As outras telas MOSTRAM o preço e
//                 apontam para cá; nenhuma grava.
//
//   QUEM LÊ       `precoUnitario()` deste arquivo. PDV, orçamento,
//                 catálogo e loja passam por ela. A faixa por
//                 quantidade continua em calc.precoFaixa, que é a
//                 conta em si — este módulo é a porta.
//
// O QUE AINDA NÃO PASSA POR AQUI, e é o que falta fechar: a função
// `criar_venda` no Postgres recalcula o preço oficial do item no
// momento de gravar a venda (é ela que impede um vendedor de mandar
// preço menor pela requisição). Ela repete a lógica da faixa em SQL.
// Enquanto viver no banco, é a única segunda cópia — e é proposital:
// validação de preço não pode depender do cliente que enviou.
// ============================================================

const supabase = require('../config/supabase');
const { precoFaixa } = require('./calc');
const { audit } = require('./audit');

/**
 * Quanto custa a unidade deste produto nesta quantidade.
 *
 * `produto` é a linha de PRODUTOS (precisa de sale_price e
 * price_tiers). `quantidade` decide qual faixa vale.
 */
function precoUnitario(produto, quantidade = 1) {
  const qtd = Math.max(1, Number(quantidade) || 1);
  return precoFaixa(produto?.price_tiers, produto?.sale_price, qtd);
}

/**
 * O ADICIONAL DE UM ACABAMENTO OU DE UM TIPO DE IMPRESSÃO, POR FAIXA.
 *
 * Montar a tela da serigrafia custa o mesmo para 50 ou 500 copos.
 * Cobrar por unidade o mesmo valor nos dois casos erra para os dois
 * lados: caro no pedido grande, barato no pequeno. Daí a faixa.
 *
 * `preco_adicional` é o piso — o que vale quando nenhuma faixa alcança
 * a quantidade. Sem ele, todo acabamento já cadastrado passaria a
 * custar zero no dia em que a migração 099 rodasse.
 *
 * A conta é a MESMA de `calc.precoFaixa`, e não uma parecida: faixa de
 * quantidade é uma regra só no sistema, e duas implementações dela
 * discordariam num caso de borda que ninguém ia procurar.
 */
function adicionalPorFaixa(config, quantidade = 1) {
  if (!config) return 0;
  const qtd = Math.max(1, Number(quantidade) || 1);
  const base = Number(config.preco_adicional) || 0;
  const faixas = Array.isArray(config.faixas) ? config.faixas : [];
  if (!faixas.length) return base;
  return precoFaixa(faixas, base, qtd);
}

/** O mesmo, multiplicado. Arredonda uma vez só, no fim. */
function precoTotal(produto, quantidade = 1) {
  const qtd = Math.max(1, Number(quantidade) || 1);
  return Math.round(precoUnitario(produto, qtd) * qtd * 100) / 100;
}

/**
 * A ÚNICA função que grava preço de venda.
 *
 * Passa pela auditoria sempre: preço é dinheiro, e "de quanto para
 * quanto, por quem" é a primeira pergunta quando o número muda sem
 * ninguém saber por quê.
 */
async function definirPreco(req, produtoId, valor) {
  const preco = Number(valor);
  if (!Number.isFinite(preco) || preco < 0) {
    return { erro: 'Preço inválido' };
  }

  const { data: antes } = await supabase.from('PRODUTOS')
    .select('id, name, sale_price')
    .eq('id', produtoId).eq('tenant_id', req.tenantId).maybeSingle();
  if (!antes) return { erro: 'Produto não encontrado', http: 404 };

  const { data, error } = await supabase.from('PRODUTOS')
    .update({ sale_price: preco })
    .eq('id', produtoId).eq('tenant_id', req.tenantId)
    .select('id, name, sale_price').single();
  if (error) return { erro: error.message };

  audit(req, 'price', 'product', data.id, {
    name: antes.name, de: antes.sale_price, para: preco,
  });
  return { produto: data };
}

/**
 * A porta fechada, para quem tentar entrar por outro lugar.
 *
 * Devolve a mensagem quando o corpo da requisição traz preço de venda.
 * As rotas de produto chamam isto e recusam — em vez de gravar em
 * silêncio e recriar o problema que este arquivo existe para resolver.
 */
const MSG_PRECO_FORA_DE_LUGAR =
  'O preço de venda é definido em Precificação, e só lá. '
  + 'Esta tela mostra o preço, mas não grava.';

function precoNoCorpo(body) {
  return body && body.sale_price !== undefined && body.sale_price !== null;
}

module.exports = {
  precoUnitario, precoTotal, definirPreco, adicionalPorFaixa,
  precoNoCorpo, MSG_PRECO_FORA_DE_LUGAR,
};
