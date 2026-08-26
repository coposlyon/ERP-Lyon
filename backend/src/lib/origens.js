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
const ORIGENS = [
  { key: 'Site',           grupo: 'Próprio' },
  { key: 'WhatsApp',       grupo: 'Atendimento' },
  { key: 'Instagram',      grupo: 'Redes' },
  { key: 'Facebook',       grupo: 'Redes' },
  { key: 'TikTok',         grupo: 'Redes' },
  { key: 'Shopee',         grupo: 'Marketplace' },
  { key: 'Mercado Livre',  grupo: 'Marketplace' },
  { key: 'Amazon',         grupo: 'Marketplace' },
  { key: 'Magalu',         grupo: 'Marketplace' },
  { key: 'Presencial',     grupo: 'Atendimento' },
  { key: 'Telefone',       grupo: 'Atendimento' },
  { key: 'Indicação',      grupo: 'Atendimento' },
  { key: 'Outro',          grupo: 'Outros' },
];

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
  return ORIGENS.find(o => limpo(o.key) === alvo)?.key || null;
}

module.exports = { ORIGENS, normalizarOrigem };
