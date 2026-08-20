// ============================================================
// O RASCUNHO DA CONFIGURAÇÃO.
//
// O configurador manda o cliente para o editor de arte e espera ele
// voltar. Enquanto isso a tela é destruída — e sem um lugar para
// guardar, o cliente volta do editor e encontra tudo em branco:
// acabamento, cores, quantidade, CEP, tudo de novo. Ninguém faz isso
// duas vezes; fecha o site.
//
// Fica no sessionStorage e não no localStorage de propósito: é rascunho
// de uma visita, não compra. O que a pessoa realmente decidiu vai para
// o carrinho, que aí sim sobrevive ao dia seguinte.
// ============================================================

const chave = modelo => `catalogo_rascunho_${modelo}`;

export function lerRascunho(modelo) {
  try { return JSON.parse(sessionStorage.getItem(chave(modelo))) || null; } catch { return null; }
}

export function gravarRascunho(modelo, dados) {
  try { sessionStorage.setItem(chave(modelo), JSON.stringify(dados)); } catch { /* sem espaço: segue sem rascunho */ }
}

export function limparRascunho(modelo) {
  try { sessionStorage.removeItem(chave(modelo)); } catch { /* nada a fazer */ }
}
