// Gera uma ilustração SVG do produto (copo/taça/caneca/garrafa) na cor que o
// próprio NOME indica. Usada pelo "Gerar Fotos" para preencher em massa os
// produtos sem foto. Entende: TRADICIONAL, DEGRADÊ, BICOLOR (duas cores),
// JATEADO, BORDA e NEON/FLUOR.

// nomes de cor (sem acento, minúsculo) → hex
const COLOR_MAP = {
  // amarelos
  'amarelo limao': '#F2D600', 'amarelo ouro': '#F5A623', 'amarelo canario': '#F4D03F',
  'amarelo neon': '#E8F215', 'amarelo fluor': '#E8F215', 'amarelo bebe': '#FBEFAF',
  'amarelo': '#FFD400', 'ouro': '#D4AF37', 'dourado': '#D4AF37', 'mostarda': '#D4A017',
  // azuis
  'azul bebe': '#9EC4E8', 'azul medio': '#2D6FCB', 'azul royal': '#1E4FD8',
  'azul tifanny': '#2BB7B3', 'azul tiffany': '#2BB7B3', 'azul ultramar': '#1B2A8C',
  'azul bik': '#1746A2', 'azul bic': '#1746A2', 'azul marinho': '#12224E', 'marinho': '#12224E',
  'azul petroleo': '#0F4C5C', 'petroleo': '#0F4C5C', 'azul ceu': '#87CEEB', 'celeste': '#87CEEB',
  'azul neon': '#00C3FF', 'azul claro': '#7FB3E8', 'azul escuro': '#122B6B',
  'turquesa': '#30D5C8', 'azul': '#1E5FD8',
  // rosas / pinks
  'pink maravilha neon': '#FF2D95', 'pink maravilha': '#E4007C', 'pink neon': '#FF3EA5',
  'rosa neon': '#FF3EA5', 'rosa bebe': '#F4B6C2', 'rosa chiclete': '#F757A8', 'chiclete': '#F757A8',
  'rosa pink': '#EC1C8E', 'rosa claro': '#F8C8D8', 'rosa': '#F4A6BC', 'pink': '#EC1C8E',
  'magenta': '#D6006E', 'fucsia': '#E11584', 'salmao': '#FA8072', 'coral': '#FF6F61',
  'pessego': '#FFCBA4', 'nude': '#E3BC9A',
  // vermelhos / vinhos
  'vermelho ferrari': '#E11D22', 'vermelho vivo': '#ED1C24', 'vermelho cereja': '#C21807',
  'cereja': '#C21807', 'vermelho neon': '#FF3131', 'vermelho': '#E11D22',
  'marsala': '#7B1E2B', 'vinho': '#722F37', 'bordo': '#800020', 'goiaba': '#F87060',
  // verdes
  'verde bandeira': '#0E6B4F', 'verde folha': '#2E9E32', 'verde militar': '#1F5C36',
  'verde limao': '#9CCC00', 'verde neon': '#39E639', 'verde fluor': '#39E639',
  'verde agua': '#9FE2BF', 'verde esmeralda': '#0F9D58', 'verde escuro': '#14532D',
  'verde abacate': '#7BA05B', 'verde bebe': '#BFE8C8', 'verde menta': '#98E2C6', 'menta': '#98E2C6',
  'musgo': '#556B2F', 'oliva': '#708238', 'verde': '#2E9E32',
  // roxos
  'roxo dark': '#4B2E83', 'roxo neon': '#B026FF', 'roxo': '#7E3FF2',
  'violeta': '#8E44AD', 'lilas': '#B57EDC', 'uva': '#5E2B97', 'lavanda': '#C8A2C8',
  // laranjas
  'laranja neon': '#FF6E00', 'laranja fluor': '#FF6E00', 'laranja': '#F26522',
  'tangerina': '#F28500', 'caramelo': '#AF6E2E',
  // neutros / metálicos
  'branco': '#F4F4F4', 'off white': '#F5F1E6', 'perola': '#F0EAD6', 'gelo': '#EEF3F7',
  'preto': '#1A1A1A', 'cinza': '#9AA0A6', 'grafite': '#474A51', 'chumbo': '#54585A',
  'fume': '#8A8D91', 'prata': '#C0C0C0', 'cobre': '#B87333', 'rose gold': '#B76E79', 'rose': '#B76E79',
  'marrom': '#6B4423', 'cafe': '#4B3621', 'bege': '#D9C7A7', 'palha': '#E3DCC4',
  'marmorizado': '#E8E2D0', 'transparente': '#E9F1F5', 'cristal': '#E9F1F5',
  'incolor': '#E9F1F5', 'natural': '#E9F1F5',
};

function stripAccents(s) {
  return String(s || '')
    .replace(/[áàâãä]/gi, 'a').replace(/[éèêë]/gi, 'e').replace(/[íìîï]/gi, 'i')
    .replace(/[óòôõö]/gi, 'o').replace(/[úùûü]/gi, 'u').replace(/ç/gi, 'c');
}

function normalize(name) {
  return stripAccents(String(name || '').toLowerCase())
    .replace(/\d+/g, ' ')             // tira 350, 500...
    .replace(/[^a-z]+/g, ' ')         // tudo que não é letra vira espaço
    .replace(/\s+/g, ' ')
    .trim();
}

// hex → hsl → hex (para o efeito NEON: mais vivo)
function hexToHsl(hex) {
  const h6 = hex.replace('#', '');
  const r = parseInt(h6.slice(0, 2), 16) / 255, g = parseInt(h6.slice(2, 4), 16) / 255, b = parseInt(h6.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h, s, l];
}
function hslToHex(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
function brighten(hex) { // efeito neon/fluor
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(1, s * 1.35 + 0.1), Math.min(0.62, Math.max(0.5, l)));
}

// luminância alta → precisa de contorno para aparecer em fundo claro
function needsBorder(hex) {
  const h6 = hex.replace('#', '');
  const r = parseInt(h6.slice(0, 2), 16), g = parseInt(h6.slice(2, 4), 16), b = parseInt(h6.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) > 222;
}

// acha as cores citadas no nome, na ordem em que aparecem
function findColors(name) {
  const n = ` ${normalize(name)} `;
  const keys = Object.keys(COLOR_MAP).sort((a, b) => b.length - a.length);
  const found = [], used = [];
  for (const k of keys) {
    let idx = n.indexOf(` ${k} `);
    while (idx !== -1) {
      // faixa "útil" sem os espaços das pontas (senão o espaço entre duas
      // cores vizinhas conta como sobreposição e a 2ª cor é descartada)
      const s0 = idx + 1, e0 = idx + 1 + k.length;
      if (!used.some(([s, e]) => !(e0 <= s || s0 >= e))) {
        found.push({ pos: s0, hex: COLOR_MAP[k] });
        used.push([s0, e0]);
      }
      idx = n.indexOf(` ${k} `, idx + 1);
    }
  }
  found.sort((a, b) => a.pos - b.pos);
  return found.map(f => f.hex);
}

function shapeOf(n) {
  if (/\btaca\b/.test(n)) return 'taca';
  if (/\b(caneca|caneka|xicara)\b/.test(n)) return 'caneca';
  if (/\b(garrafa|squeeze|growler)\b/.test(n)) return 'garrafa';
  if (/\bshot\b/.test(n)) return 'shot';
  return 'copo'; // long drink e afins
}

// corpo (path) + área da borda superior de cada formato, num viewBox 0 0 200 300
const SHAPES = {
  copo:    { body: 'M48 34 L152 34 L136 260 Q134 276 116 276 L84 276 Q66 276 64 260 Z', rimY: 34, rimH: 20 },
  shot:    { body: 'M58 96 L142 96 L128 252 Q126 264 112 264 L88 264 Q74 264 72 252 Z', rimY: 96, rimH: 18 },
  taca:    { body: 'M42 32 H158 Q154 120 104 128 L104 210 H128 Q136 210 136 218 L136 224 H64 L64 218 Q64 210 72 210 H96 L96 128 Q46 120 42 32 Z', rimY: 32, rimH: 18 },
  caneca:  { body: 'M50 56 H140 Q148 56 148 66 L148 236 Q148 248 136 248 H62 Q50 248 50 236 Z', rimY: 56, rimH: 18, extra: '<path d="M148 100 q42 0 42 42 q0 42 -42 42" fill="none" stroke="__COLOR__" stroke-width="14" stroke-linecap="round"/>' },
  garrafa: { body: 'M62 84 Q60 70 74 68 L126 68 Q140 70 138 84 L138 250 Q138 268 118 268 L82 268 Q62 268 62 250 Z', rimY: 68, rimH: 0, extra: '<rect x="80" y="42" width="40" height="24" rx="5" fill="__COLOR__"/><rect x="88" y="22" width="24" height="18" rx="4" fill="__COLOR__"/>' },
};

// monta o SVG de acordo com as cores e efeitos do nome
function buildSvg(name) {
  const n = normalize(name);
  const colors = findColors(name);
  if (!colors.length) return null;

  const fx = {
    bicolor: /\bbicolor\b/.test(n),
    degrade: /\bdegrade\b/.test(n),
    jateado: /\bjateado\b/.test(n),
    borda: /\bborda\b/.test(n),
    neon: /\b(neon|fluor)\b/.test(n),
  };
  const cores = fx.neon ? colors.map(brighten) : colors;
  const shape = SHAPES[shapeOf(n)];

  // corpo: cor sólida, degradê ou bicolor (base = 1ª cor embaixo, 2ª em cima)
  let mainColor = cores[0];
  let rimColor = null;
  if (fx.borda) {
    if (cores.length >= 2) { mainColor = cores[0]; rimColor = cores[1]; }
    else { rimColor = cores[0]; mainColor = fx.jateado ? '#E5EAEE' : '#DCE4EA'; } // copo "vidro" com borda colorida
  }

  let defs = '', bodyFill = mainColor;
  if (fx.bicolor && cores.length >= 2) {
    const [base, topo] = [cores[0], cores[1]];
    defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${topo}"/><stop offset="52%" stop-color="${topo}"/>
      <stop offset="52%" stop-color="${base}"/><stop offset="100%" stop-color="${base}"/>
    </linearGradient>`;
    bodyFill = 'url(#g)';
  } else if (fx.degrade) {
    defs = `<linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${mainColor}"/>
      <stop offset="55%" stop-color="${mainColor}" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="${mainColor}" stop-opacity="0.12"/>
    </linearGradient>`;
    bodyFill = 'url(#g)';
  }

  const translucido = fx.jateado || (fx.borda && cores.length < 2) || /transparente|cristal|incolor|natural/.test(n);
  const bodyOpacity = translucido ? '0.85' : '1';
  const border = needsBorder(mainColor) || translucido ? '#C9D2DA' : 'none';
  const extra = (shape.extra || '').replace(/__COLOR__/g, mainColor.startsWith('url') ? cores[0] : mainColor);

  const rim = rimColor && shape.rimH
    ? `<g clip-path="url(#c)"><rect x="0" y="${shape.rimY}" width="200" height="${shape.rimH}" fill="${rimColor}"/></g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300">
  <defs>${defs}<clipPath id="c"><path d="${shape.body}"/></clipPath></defs>
  <ellipse cx="100" cy="285" rx="58" ry="8" fill="#000" opacity="0.07"/>
  ${extra}
  <path d="${shape.body}" fill="${bodyFill}" opacity="${bodyOpacity}"${border !== 'none' ? ` stroke="${border}" stroke-width="2"` : ''}/>
  ${rim}
  <g clip-path="url(#c)"><path d="M64 46 L78 46 L72 250 L60 246 Z" fill="#fff" opacity="${translucido ? '0.3' : '0.18'}"/></g>
</svg>`;
}

// SVG → data URL (para subir pelo uploadDataUrl). null se não achou cor no nome.
function cupDataUrl(name) {
  const svg = buildSvg(name);
  if (!svg) return null;
  return `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
}

module.exports = { cupDataUrl, findColors };
