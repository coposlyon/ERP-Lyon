// ============================================================
// Origem da venda — de onde o cliente veio.
//
// Não confundir com `source`, que já existia e responde outra pergunta:
// COMO o pedido entrou (manual x site). Um pedido pode nascer no
// WhatsApp e ser digitado à mão pelo vendedor — são dois fatos, e cada
// um mora na sua coluna.
//
// A lista é o vocabulário fechado do ERP. Quando a integração com o
// Mercado Livre (ou outro marketplace) entrar, ela grava
// `origin: 'Mercado Livre'` na venda e a coluna da tela já sabe pintar
// o ícone — nada mais precisa mudar. Marketplace novo entra AQUI.
// ============================================================

// O `icone` que existia aqui era um emoji, e emoji não identifica
// marca: 🛍️ e 🏬 são a mesma bolsinha cinza, e cada sistema operacional
// desenha o seu. O desenho de cada canal mora no frontend, em
// components/UI/LogoOrigem.jsx, com a cor da marca. O servidor manda o
// vocabulário; quem pinta é a tela.
// DUAS ORIGENS, A PEDIDO DA LYON.
//
// Eram treze: Site, WhatsApp, Instagram, Facebook, TikTok, quatro
// marketplaces, Presencial, Telefone, Indicação e Outro. A empresa
// separa a venda em duas e so duas — quem veio a loja e quem comprou de
// longe —, e treze caixas para uma pergunta de duas respostas viram
// treze relatorios que ninguem soma.
const ORIGENS = [
  { key: 'Venda Presencial', grupo: 'Venda' },
  { key: 'Venda Online',     grupo: 'Venda' },
];

/**
 * O VOCABULARIO ANTIGO NAO VIRA LIXO.
 *
 * Vendas gravadas antes desta mudanca (e a loja, que grava a origem
 * sozinha) trazem as chaves de antes. Sem este mapa elas virariam null
 * na primeira releitura e o relatorio perderia a origem de tudo o que
 * ja aconteceu.
 *
 * Telefone e Indicacao caem em Online por eliminacao: nao sao venda no
 * balcao. Se a Lyon entender que telefone e presencial, e uma linha
 * aqui.
 */
const DE_PARA = {
  'presencial':     'Venda Presencial',
  'site':           'Venda Online',
  'whatsapp':       'Venda Online',
  'instagram':      'Venda Online',
  'facebook':       'Venda Online',
  'tiktok':         'Venda Online',
  'shopee':         'Venda Online',
  'mercado livre':  'Venda Online',
  'amazon':         'Venda Online',
  'magalu':         'Venda Online',
  'telefone':       'Venda Online',
  'indicacao':      'Venda Online',
};

const CHAVES = new Set(ORIGENS.map(o => o.key));

/**
 * Aceita só o que está no vocabulário. Origem inventada vira null em vez
 * de entrar torta no banco: uma coluna com "mercado livre", "Mercado
 * Livre " e "ML" não agrupa em relatório nenhum.
 *
 * Compara sem acento e sem caixa para o operador não precisar acertar a
 * grafia exata.
 */
function normalizarOrigem(valor) {
  if (!valor) return null;
  const bruto = String(valor).trim();
  if (CHAVES.has(bruto)) return bruto;

  const limpo = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const alvo = limpo(bruto);
  return ORIGENS.find(o => limpo(o.key) === alvo)?.key || DE_PARA[alvo] || null;
}

module.exports = { ORIGENS, normalizarOrigem };
