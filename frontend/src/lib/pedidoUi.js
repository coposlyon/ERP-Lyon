// ============================================================
// Aparência do pedido: origem, cor de status e o sinal de Atenção.
//
// Fica num lugar só porque duas telas mostram a mesma coisa — a
// carteira do vendedor e o módulo de Vendas. Se o Mercado Livre
// aparecesse com um ícone numa tela e outro na outra, o operador
// pensaria que são canais diferentes.
// ============================================================

// Ícone por origem. Emoji e não imagem: marketplace novo entra sem
// precisar subir arquivo nenhum, e acompanha a lista do backend
// (backend/src/lib/origens.js).
export const ORIGEM_ICONE = {
  'Site': '🌐', 'WhatsApp': '💬', 'Instagram': '📷', 'Facebook': '👥',
  'TikTok': '🎵', 'Shopee': '🛍️', 'Mercado Livre': '🤝', 'Amazon': '📦',
  'Magalu': '🏬', 'Presencial': '🏪', 'Telefone': '📞', 'Indicação': '⭐',
  'Outro': '•',
};

export const iconeOrigem = o => ORIGEM_ICONE[o] || '•';

// As cores que o backend nomeia em lib/atencao.js.
export const CORES_STATUS = {
  cinza:    '#94a3b8', amarelo: '#facc15', laranja: '#fb923c', azul: '#60a5fa',
  roxo:     '#c084fc', rosa:    '#f472b6', ciano:   '#22d3ee', verde: '#4ade80',
  vermelho: '#f87171',
};

export const corStatus = c => CORES_STATUS[c] || CORES_STATUS.cinza;

// Os três níveis da coluna Atenção.
export const NIVEL_ATENCAO = {
  normal:  { cor: '#22c55e', titulo: 'No prazo' },
  atencao: { cor: '#facc15', titulo: 'Atenção — 2 dias do prazo com pendência' },
  critico: { cor: '#ef4444', titulo: 'Crítico — menos de 24h com pendência em aberto' },
};

/**
 * As animações do sinal. O movimento é o ponto: numa tabela de linhas
 * iguais, o pedido que vai estourar hoje some — e o que se mexe é o que
 * o olho acha sozinho. Respeita quem pediu menos movimento no sistema.
 */
export const CSS_ATENCAO = `
  @keyframes atencaoPisca  { 0%,100% { opacity: 1 } 50% { opacity: .25 } }
  @keyframes atencaoSirene { 0%,100% { opacity: 1; transform: rotate(-8deg) }
                             50%     { opacity: .45; transform: rotate(8deg) } }
  @media (prefers-reduced-motion: reduce) {
    [style*="atencaoPisca"], [style*="atencaoSirene"] { animation: none !important }
  }
`;

/** 'PV-0001' a partir do número da venda. */
export const codigoPedido = n => `PV-${String(n ?? '').padStart(4, '0')}`;

/** Código do cliente com os zeros à esquerda, como no cadastro. */
export const codigoCliente = id =>
  id == null ? null : String(id).padStart(4, '0');
