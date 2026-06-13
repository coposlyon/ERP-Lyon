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

// branco/palha precisam de borda para aparecer no fundo claro
export function needsBorder(hex) {
  if (!hex) return false;
  const h = hex.replace('#', '');
  if (h.length !== 6) return false;
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 225; // muito claro
}
