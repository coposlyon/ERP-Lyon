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

const ORIGENS = [
  { key: 'Site',           icone: '🌐', grupo: 'Próprio' },
  { key: 'WhatsApp',       icone: '💬', grupo: 'Atendimento' },
  { key: 'Instagram',      icone: '📷', grupo: 'Redes' },
  { key: 'Facebook',       icone: '👥', grupo: 'Redes' },
  { key: 'TikTok',         icone: '🎵', grupo: 'Redes' },
  { key: 'Shopee',         icone: '🛍️', grupo: 'Marketplace' },
  { key: 'Mercado Livre',  icone: '🤝', grupo: 'Marketplace' },
  { key: 'Amazon',         icone: '📦', grupo: 'Marketplace' },
  { key: 'Magalu',         icone: '🏬', grupo: 'Marketplace' },
  { key: 'Presencial',     icone: '🏪', grupo: 'Atendimento' },
  { key: 'Telefone',       icone: '📞', grupo: 'Atendimento' },
  { key: 'Indicação',      icone: '⭐', grupo: 'Atendimento' },
  { key: 'Outro',          icone: '•',  grupo: 'Outros' },
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
