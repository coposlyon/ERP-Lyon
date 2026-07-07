// Lê o NOME do produto e extrai as cores e efeitos (degradê, bicolor,
// jateado, borda, neon). O navegador usa isso para recolorir uma foto real
// de copo na cor certa ("Gerar Fotos" da tela de Produtos).

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

// nome → { colors: [hex...], fx: { bicolor, degrade, jateado, borda, neon } }
function parseName(name) {
  const n = normalize(name);
  const fx = {
    bicolor: /\bbicolor\b/.test(n),
    degrade: /\bdegrade\b/.test(n),
    jateado: /\bjateado\b/.test(n),
    borda: /\bborda\b/.test(n),
    neon: /\b(neon|fluor)\b/.test(n),
  };
  const base = findColors(name);
  const colors = fx.neon ? base.map(brighten) : base;
  return { colors, fx };
}

// Extrai os NOMES de cor como aparecem no texto original (com acento), para
// montar o filtro de cores da tela de Produtos. Ex.: "AMARELO LIMÃO".
function extractColorNames(name) {
  const raw = String(name || '');
  const tokens = [];
  const re = /[A-Za-zÀ-ÿ]+/g;
  let m;
  while ((m = re.exec(raw))) tokens.push({ w: m[0], norm: stripAccents(m[0].toLowerCase()) });

  const keys = Object.keys(COLOR_MAP).map(k => k.split(' ')).sort((a, b) => b.length - a.length);
  const used = new Array(tokens.length).fill(false);
  const out = [];
  for (const kw of keys) {
    for (let i = 0; i + kw.length <= tokens.length; i++) {
      if (used.slice(i, i + kw.length).some(Boolean)) continue;
      let ok = true;
      for (let j = 0; j < kw.length; j++) if (tokens[i + j].norm !== kw[j]) { ok = false; break; }
      if (!ok) continue;
      for (let j = 0; j < kw.length; j++) used[i + j] = true;
      out.push(tokens.slice(i, i + kw.length).map(t => t.w.toUpperCase()).join(' '));
    }
  }
  return out;
}

module.exports = { parseName, findColors, extractColorNames, stripAccents };
