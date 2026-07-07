// Recolore uma FOTO REAL de copo para a cor de cada produto usando a técnica
// de mockup profissional: a LUZ de cada pixel (sombreamento) multiplica a cor
// alvo, e os brilhos especulares são devolvidos em branco por cima ("screen").
// Um único algoritmo serve para foto modelo branca OU colorida.
// O fundo é detectado a partir das bordas (flood fill) e nunca é pintado.

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não consegui ler a foto modelo'));
    img.src = src;
  });
}

function hexToRgb(hex) {
  const h6 = hex.replace('#', '');
  return [parseInt(h6.slice(0, 2), 16), parseInt(h6.slice(2, 4), 16), parseInt(h6.slice(4, 6), 16)];
}

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lumOf = (r, g, b) => (r * 0.299 + g * 0.587 + b * 0.114) / 255;
const mix = (a, b, m) => a + (b - a) * m;

// mistura duas cores RGB
function mixRgb(c1, c2, m) {
  return [mix(c1[0], c2[0], m), mix(c1[1], c2[1], m), mix(c1[2], c2[2], m)];
}

const VIDRO = [236, 241, 245];  // corpo "transparente" (copo com borda)
const CLARO = [247, 250, 252];  // ponto claro do degradê

// img: foto modelo carregada · spec: { colors: [hex...], fx: {...} }
// devolve dataURL (webp ou png) da foto recolorida — ou null se falhar
export function recolorCup(img, spec) {
  const targets = (spec.colors || []).map(hexToRgb);
  if (!targets.length) return null;
  const fx = spec.fx || {};

  const maxH = 1200;
  const scale = Math.min(1, maxH / img.height);
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  const im = ctx.getImageData(0, 0, w, h);
  const d = im.data;
  const px = w * h;

  // ── 1. fundo: flood fill a partir das bordas (cor parecida com a borda) ──
  const bg = new Uint8Array(px); // 1 = fundo (não pintar)
  let rr = 0, rg = 0, rb = 0, rn = 0;
  const borderIdx = [];
  for (let x = 0; x < w; x++) borderIdx.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) borderIdx.push(y * w, y * w + (w - 1));
  for (const idx of borderIdx) {
    const i = idx * 4;
    if (d[i + 3] < 30) continue;
    rr += d[i]; rg += d[i + 1]; rb += d[i + 2]; rn++;
  }
  const ref = rn ? [rr / rn, rg / rn, rb / rn] : [255, 255, 255];
  const TOL2 = 30 * 30;
  const queue = [];
  const tryBg = (idx) => {
    if (bg[idx]) return;
    const i = idx * 4;
    if (d[i + 3] >= 30) {
      const dr = d[i] - ref[0], dg = d[i + 1] - ref[1], db = d[i + 2] - ref[2];
      if (dr * dr + dg * dg + db * db > TOL2) return;
    }
    bg[idx] = 1; queue.push(idx);
  };
  for (const idx of borderIdx) tryBg(idx);
  while (queue.length) {
    const idx = queue.pop();
    const x = idx % w, y = (idx / w) | 0;
    if (x > 0) tryBg(idx - 1);
    if (x < w - 1) tryBg(idx + 1);
    if (y > 0) tryBg(idx - w);
    if (y < h - 1) tryBg(idx + w);
  }

  // ── 2. luz média do copo (referência do sombreamento) e limites ──
  let minY = h, maxY = 0, nCup = 0, sumLum = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;
      nCup++; sumLum += lumOf(d[i], d[i + 1], d[i + 2]);
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!nCup || maxY <= minY) return null;
  const baseLum = Math.min(0.92, Math.max(0.25, sumLum / nCup));
  const span = maxY - minY;
  const specDiv = Math.max(0.08, 1 - baseLum); // faixa acima da média = brilho

  // ── 3. religação de luz: cor alvo × sombreamento + brilho em branco ──
  for (let y = 0; y < h; y++) {
    const rel = clamp01((y - minY) / span); // 0 = topo do copo, 1 = base
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;
      const lum = lumOf(d[i], d[i + 1], d[i + 2]);

      // cor alvo válida neste pixel
      let t = targets[0];
      if (fx.bicolor && targets[1]) {
        // base (1ª cor) embaixo, 2ª cor em cima, com transição curta no meio
        if (rel < 0.48) t = targets[1];
        else if (rel < 0.52) t = mixRgb(targets[1], targets[0], (rel - 0.48) / 0.04);
      } else if (fx.borda && targets[1]) {
        if (rel <= 0.08) t = targets[1]; // borda = 2ª cor
      }
      if (fx.borda && !targets[1]) {
        // só uma cor + BORDA = copo "vidro" com a borda colorida
        t = rel <= 0.08 ? targets[0] : VIDRO;
      }
      if (fx.degrade) {
        // cor forte no topo esvaindo até quase transparente na base
        const fade = clamp01((rel - 0.12) / 0.78);
        t = mixRgb(t, CLARO, fade * 0.9);
      }

      // sombreamento do pixel original aplicado à cor alvo
      const shade = Math.min(1.18, lum / baseLum);
      let r2 = t[0] * shade, g2 = t[1] * shade, b2 = t[2] * shade;

      // brilho especular: o que passa da luz média volta como branco
      let spec = clamp01((lum - baseLum) / specDiv);
      spec *= spec;
      if (fx.jateado) spec *= 0.45; // fosco difunde o brilho
      const ss = spec * 0.85;
      r2 += (255 - r2) * ss; g2 += (255 - g2) * ss; b2 += (255 - b2) * ss;

      if (fx.jateado) { // véu fosco
        r2 += (255 - r2) * 0.08; g2 += (255 - g2) * 0.08; b2 += (255 - b2) * 0.08;
      }

      d[i] = Math.min(255, r2); d[i + 1] = Math.min(255, g2); d[i + 2] = Math.min(255, b2);
    }
  }

  ctx.putImageData(im, 0, 0);
  let out = cv.toDataURL('image/webp', 0.9);
  if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/png');
  return out;
}
