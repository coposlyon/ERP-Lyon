// ============================================================
// O LADO DO FORNECEDOR NA REPOSIÇÃO.
//
// A reposição era um monólogo: o estoque montava a lista, mandava no
// WhatsApp e esperava. Quando a mercadoria chegava, alguém dava baixa
// da lista INTEIRA — inclusive do que o fornecedor não tinha e nunca
// mandou. O estoque passava a acreditar em caixas que não existem.
//
// Aqui mora o outro lado: gerar o endereço do fornecedor, deixá-lo
// entrar, e guardar o que ele respondeu.
//
// COMO A PORTA É GUARDADA. O token é a primeira metade da credencial e
// não basta sozinho: o link vai por WhatsApp e é encaminhável. A
// segunda metade é o fornecedor confirmar o CNPJ e o telefone que já
// estão no cadastro dele — dois dados que quem encaminhou a mensagem
// não necessariamente tem, e que o próprio fornecedor tem de cor.
//
// E o link não é eterno: 30 dias. Reposição que ninguém respondeu em um
// mês não vai ser respondida, e o endereço fica vivo para sempre.
// ============================================================

const crypto = require('crypto');
const supabase = require('../config/supabase');

const DIAS_DE_VALIDADE = 30;
const MAX_TENTATIVAS = 10;

/** Só dígitos — CNPJ e telefone chegam formatados de mil jeitos. */
const digitos = v => String(v || '').replace(/\D/g, '');

/**
 * Os últimos dígitos do telefone.
 *
 * O cadastro guarda "(44) 99854-6257" e o fornecedor digita
 * "44998546257", "998546257" ou "+55 44 99854-6257". Comparar os
 * ÚLTIMOS OITO resolve os três: é o número em si, sem DDI nem DDD nem o
 * nono dígito que aparece e some.
 */
const finalDoTelefone = v => digitos(v).slice(-8);

function gerarToken() {
  return crypto.randomBytes(24).toString('base64url');
}

/**
 * Gera (ou renova) o endereço do fornecedor para um pedido.
 *
 * Renovar em vez de criar outro: dois endereços vivos para a mesma
 * reposição é o fornecedor respondendo num e o estoque olhando o outro.
 */
async function gerarLink(tenantId, pedidoId) {
  const token = gerarToken();
  const expira = new Date(Date.now() + DIAS_DE_VALIDADE * 24 * 3600 * 1000);

  const { data, error } = await supabase.from('PEDIDOS_REPOSICAO')
    .update({
      public_token: token,
      token_expira_em: expira.toISOString(),
      tentativas: 0,
    })
    .eq('id', pedidoId).eq('tenant_id', tenantId)
    .select('id, public_token, token_expira_em, supplier_name, protocol_number')
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data;
}

/** O pedido por trás do token, com o fornecedor junto. */
async function porToken(token) {
  if (!token || String(token).length < 20) return null;
  const { data } = await supabase.from('PEDIDOS_REPOSICAO')
    .select('*, FORNECEDORES ( id, name, cnpj, phone )')
    .eq('public_token', String(token)).maybeSingle();
  return data || null;
}

/**
 * Por que este link não abre — a frase que a tela mostra.
 *
 * `null` = abre. Todas as recusas dizem a mesma coisa por fora ("não
 * disponível"), e o motivo detalhado fica no retorno para o log: quem
 * está tentando adivinhar token não precisa saber se errou o token ou
 * se o prazo venceu.
 */
function porQueNaoAbre(pedido) {
  if (!pedido) return 'Link não encontrado.';
  if (pedido.status === 'completed') return 'Esta solicitação já foi concluída.';
  // Cancelada tambem nao abre. O cancelamento ja limpa o token, entao
  // isto e cinto e suspensorio — mas um pedido cancelado que responde
  // "nao encontrado" e melhor do que um que aceita resposta.
  if (pedido.status === 'cancelled') return 'Esta solicitação foi cancelada pela Lyon.';
  if (pedido.tentativas >= MAX_TENTATIVAS) return 'Link bloqueado por tentativas.';
  if (pedido.token_expira_em && new Date(pedido.token_expira_em) < new Date()) {
    return 'O prazo deste link venceu.';
  }
  return null;
}

/**
 * Confere quem diz ser o fornecedor.
 *
 * Os dois têm de bater: CNPJ e telefone. Um só seria pouco — o CNPJ de
 * uma empresa é público, e o telefone anda no mesmo WhatsApp por onde
 * o link foi encaminhado.
 */
function conferirIdentidade(pedido, cnpj, telefone) {
  const f = pedido?.FORNECEDORES;
  if (!f) return 'Fornecedor não está mais no cadastro. Fale com a Lyon.';

  const cnpjOk = digitos(f.cnpj).length > 0 && digitos(f.cnpj) === digitos(cnpj);
  const telOk  = finalDoTelefone(f.phone).length >= 8
    && finalDoTelefone(f.phone) === finalDoTelefone(telefone);

  // A mensagem não diz QUAL dos dois errou: junto, isso vira um oráculo
  // para descobrir o telefone de um CNPJ que se conhece.
  if (!cnpjOk || !telOk) return 'CNPJ ou telefone não conferem com o cadastro.';
  return null;
}

/** Uma tentativa errada a mais. Depois de MAX_TENTATIVAS o link morre. */
async function registrarTentativa(pedidoId) {
  const { data } = await supabase.from('PEDIDOS_REPOSICAO')
    .select('tentativas').eq('id', pedidoId).maybeSingle();
  await supabase.from('PEDIDOS_REPOSICAO')
    .update({ tentativas: (Number(data?.tentativas) || 0) + 1 })
    .eq('id', pedidoId);
}

/**
 * O que o fornecedor vê: só o dele, e só o necessário.
 *
 * Sem id de produto, sem custo, sem estoque atual da Lyon. O fornecedor
 * precisa saber O QUE e QUANTO foi pedido; o resto é informação interna
 * que não tem por que viajar.
 */
function fichaParaOFornecedor(pedido) {
  const itens = (pedido.products || []).map((p, i) => ({
    linha: i,
    codigo: p.code || p.codigo || null,
    nome: p.name || p.nome || 'Produto',
    pedido: Math.abs(Number(p.qty_to_replenish ?? p.qtd ?? 0)) || 0,
  }));
  return {
    ok: true,
    protocolo: pedido.protocol_number || null,
    fornecedor: pedido.supplier_name || '',
    criado_em: pedido.created_at,
    ja_respondido: !!pedido.respondido_em,
    itens,
  };
}

/**
 * Grava a resposta.
 *
 * `tem` é a quantidade que o fornecedor confirma ter. Zero é resposta
 * válida e importante: "não tenho caneca slim" é o que impede a baixa
 * de uma caixa que não vem.
 *
 * O que ele responde não pode passar do que foi pedido — pedir 10 e
 * receber "tenho 500" não é generosidade, é o estoque ganhando 490
 * unidades que ninguém comprou.
 */
async function responder(pedido, { itens, cotacao_url }) {
  const doPedido = (pedido.products || []).map((p, i) => ({
    linha: i,
    product_id: p.id,
    codigo: p.code || p.codigo || null,
    nome: p.name || p.nome || 'Produto',
    pedido: Math.abs(Number(p.qty_to_replenish ?? p.qtd ?? 0)) || 0,
  }));

  const porLinha = new Map((itens || []).map(i => [Number(i.linha), i]));
  const resposta = doPedido.map(item => {
    const bruto = Number(porLinha.get(item.linha)?.tem);
    const tem = Number.isFinite(bruto) ? Math.max(0, Math.min(item.pedido, Math.round(bruto))) : 0;
    return { ...item, tem };
  });

  const { error } = await supabase.from('PEDIDOS_REPOSICAO')
    .update({
      resposta,
      respondido_em: new Date().toISOString(),
      status: 'respondido',
      ...(cotacao_url ? { cotacao_url } : {}),
    })
    .eq('id', pedido.id);
  if (error) throw error;

  return { ok: true, itens: resposta };
}

module.exports = {
  gerarLink, porToken, porQueNaoAbre, conferirIdentidade,
  registrarTentativa, fichaParaOFornecedor, responder,
  digitos, finalDoTelefone, DIAS_DE_VALIDADE, MAX_TENTATIVAS,
};
