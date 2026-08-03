// Mapeia nomes de cor (PT) → hex, para renderizar as garrafas.
// Se a variante já tiver um hex em `value`, ele é usado direto.

const MAP = {
  'amarelo limao': '#F2D600', 'amarelo': '#FFD400', 'amarelo ouro': '#F5A623',
  'amarelo canario': '#F4D03F',
  'azul bebe': '#9EC4E8', 'azul medio': '#2D6FCB', 'azul royal': '#1E4FD8',
  'azul tifanny': '#2BB7B3', 'azul tiffany': '#2BB7B3', 'azul ultramar': '#1B2A8C',
  'azul bik': '#1746A2', 'azul bic': '#1746A2', 'azul': '#1E5FD8',
  'branco': '#F4F4F4', 'laranja': '#F26522', 'magenta': '#D6006E',
  'marsala': '#7B1E2B', 'preto': '#1A1A1A', 'rosa bebe': '#F4B6C2', 'rosa': '#F4B6C2',
  'pink': '#EC1C8E', 'roxo dark': '#4B2E83', 'roxo': '#7E3FF2',
  'verde bandeira': '#0E6B4F', 'verde folha': '#2E9E32', 'verde militar': '#1F5C36',
  'verde': '#2E9E32', 'vermelho ferrari': '#E11D22', 'vermelho vivo': '#ED1C24',
  'vermelho': '#E11D22', 'violeta': '#8E44AD', 'palha': '#E3DCC4', 'marmorizado': '#E8E2D0',
};

function stripAccents(s) {
  return s
    .replace(/[áàâãä]/g, 'a')
    .replace(/[éèêë]/g, 'e')
    .replace(/[íìîï]/g, 'i')
    .replace(/[óòôõö]/g, 'o')
    .replace(/[úùûü]/g, 'u')
    .replace(/ç/g, 'c');
}

function normalize(s) {
  return stripAccents(String(s || '').toLowerCase())
    .replace(/\b(normal|fechado|opaco|degrade|500ml|500|ml|rml|-)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function resolveColor(variant) {
  const value = variant?.value || '';
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value)) return value;

  const candidates = [variant?.value, variant?.name];
  const keys = Object.keys(MAP).sort((a, b) => b.length - a.length);
  for (const c of candidates) {
    const n = normalize(c);
    if (!n) continue;
    if (MAP[n]) return MAP[n];
    for (const k of keys) {
      if (n.includes(k)) return MAP[k];
    }
  }
  return '#C9CDD3'; // cinza neutro
}

// Paleta oficial do sistema (mesmos hex do MAP acima, que o resolveColor usa
// para pintar as bolinhas de cor na loja). É o que o 3D deve mostrar, para as
// cores baterem exatamente com o que o cliente vê no site.
export const STORE_PALETTE = [
  ['Amarelo', '#FFD400'], ['Amarelo Limão', '#F2D600'], ['Amarelo Canário', '#F4D03F'], ['Amarelo Ouro', '#F5A623'],
  ['Laranja', '#F26522'], ['Vermelho Ferrari', '#E11D22'], ['Vermelho Vivo', '#ED1C24'], ['Marsala', '#7B1E2B'],
  ['Magenta', '#D6006E'], ['Pink', '#EC1C8E'], ['Rosa Bebê', '#F4B6C2'],
  ['Roxo', '#7E3FF2'], ['Roxo Dark', '#4B2E83'], ['Violeta', '#8E44AD'],
  ['Azul Bic', '#1746A2'], ['Azul Royal', '#1E4FD8'], ['Azul Médio', '#2D6FCB'], ['Azul Ultramar', '#1B2A8C'],
  ['Azul Tiffany', '#2BB7B3'], ['Azul Bebê', '#9EC4E8'],
  ['Verde Bandeira', '#0E6B4F'], ['Verde Folha', '#2E9E32'], ['Verde Militar', '#1F5C36'],
  ['Preto', '#1A1A1A'], ['Branco', '#F4F4F4'], ['Palha', '#E3DCC4'], ['Marmorizado', '#E8E2D0'],
];

// branco/palha precisam de borda para aparecer no fundo claro
export function needsBorder(hex) {
  if (!hex) return false;
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 225; // muito claro
}
