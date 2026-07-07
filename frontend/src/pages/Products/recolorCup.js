// Recolore uma FOTO REAL de copo para a cor de cada produto, preservando
// brilho, sombras e reflexos do plástico. É o motor do "Gerar Fotos":
// uma única foto modelo vira a foto de centenas de produtos.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não consegui ler a foto modelo'));
    img.src = src;
  });
}

function hexToHsl(hex) {
  const h6 = hex.replace('#', '');
  const r = parseInt(h6.slice(0, 2), 16) / 255, g = parseInt(h6.slice(2, 4), 16) / 255, b = parseInt(h6.slice(4, 6), 16) / 255;
  return rgbToHsl(r * 255, g * 255, b * 255);
}

function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
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

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return [f(0), f(8), f(4)];
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));

// pixel faz parte do COPO? (ignora fundo branco, reflexos estourados e alpha 0)
function isCup(s, l, a) {
  if (a < 30) return false;
  if (s < 0.10 && l > 0.85) return false; // fundo branco / brilho estourado
  if (l < 0.03) return false;             // preto absoluto (contorno/fundo)
  return true;
}

// img: foto modelo carregada · spec: { colors: [hex...], fx: {...} }
// devolve dataURL (webp ou png) da foto recolorida
export function recolorCup(img, spec) {
  const colors = (spec.colors || []).map(hexToHsl);
  if (!colors.length) return null;
  const fx = spec.fx || {};

  const maxH = 900;
  const scale = Math.min(1, maxH / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;

  // passo 1: limites do copo + cor média do modelo
  let minY = h, maxY = 0, sumS = 0, sumL = 0, n = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      if (!isCup(s, l, d[i + 3])) continue;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sumS += s; sumL += l; n++;
    }
  }
  if (!n || maxY <= minY) return null;
  const baseS = Math.max(0.15, sumS / n);
  const baseL = Math.min(0.85, Math.max(0.15, sumL / n));
  const span = maxY - minY;

  // passo 2: recolore preservando a luz de cada pixel
  for (let y = 0; y < h; y++) {
    const rel = clamp01((y - minY) / span); // 0 = topo do copo, 1 = base
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      if (!isCup(s, l, d[i + 3])) continue;

      // qual cor-alvo vale neste pixel
      let t = colors[0];
      if (fx.bicolor && colors[1]) {
        // base (1ª cor) embaixo, 2ª cor em cima, com transição curta no meio
        if (rel < 0.48) t = colors[1];
        else if (rel < 0.52) {
          const m = (rel - 0.48) / 0.04;
          t = [colors[1][0] + (colors[0][0] - colors[1][0]) * m,
               colors[1][1] + (colors[0][1] - colors[1][1]) * m,
               colors[1][2] + (colors[0][2] - colors[1][2]) * m];
        }
      } else if (fx.borda && colors[1]) {
        if (rel <= 0.08) t = colors[1]; // borda = 2ª cor
      }

      let H = t[0];
      let S = t[1] < 0.05 ? s * 0.08 : clamp01(t[1] * (s / baseS)); // branco/preto/cinza quase sem saturação
      let L = clamp01(l + (t[2] - baseL) * 0.65);

      if (fx.borda && !colors[1]) {
        // só uma cor + BORDA = copo "vidro" com borda colorida
        if (rel > 0.08) { S = s * 0.12; L = clamp01(l * 0.35 + 0.62); }
      }
      if (fx.degrade) {
        // cor forte no topo esvaindo até quase transparente na base
        const fade = clamp01((rel - 0.12) / 0.78);
        S *= 1 - fade * 0.9;
        L = L + fade * (0.92 - L) * 0.8;
      }
      if (fx.jateado) { // fosco
        S *= 0.8;
        L = clamp01(L * 0.9 + 0.09);
      }

      const [r2, g2, b2] = hslToRgb(H, S, L);
      d[i] = r2; d[i + 1] = g2; d[i + 2] = b2;
    }
  }

  ctx.putImageData(im, 0, 0);
  let out = cv.toDataURL('image/webp', 0.85);
  if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/png');
  return out;
}
