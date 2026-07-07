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
  const TOL2 = 26 * 26;
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

  // ── 1b. reconstrói o copo por LINHA (silhueta é convexa na horizontal).
  // Copo branco em fundo branco faz o flood vazar para dentro do corpo;
  // aqui preenchemos da borda esquerda à direita da silhueta de cada linha,
  // fechando qualquer vazamento interno.
  for (let y = 0; y < h; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bg[idx] || d[idx * 4 + 3] < 30) continue;
      // exige 2 pixels seguidos para não pegar sujeira isolada
      if (x + 1 < w && !bg[y * w + x + 1] && d[(y * w + x + 1) * 4 + 3] >= 30) { left = x; break; }
    }
    if (left === -1) continue;
    for (let x = w - 1; x > left; x--) {
      const idx = y * w + x;
      if (bg[idx] || d[idx * 4 + 3] < 30) continue;
      if (x - 1 >= 0 && !bg[y * w + x - 1] && d[(y * w + x - 1) * 4 + 3] >= 30) { right = x; break; }
    }
    if (right === -1) right = left;
    for (let x = left; x <= right; x++) {
      const idx = y * w + x;
      if (d[idx * 4 + 3] >= 30) bg[idx] = 0; // dentro da silhueta = copo
    }
  }

  // ── 2. faixa REAL de luz do copo (percentis 2%–98%) e limites ──
  // Normalizar pelo intervalo medido dá volume até em foto branca, onde o
  // sombreamento é sutil (tudo entre 0.88 e 1.0 de luminância).
  let minY = h, maxY = 0, nCup = 0;
  const histo = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;
      nCup++;
      histo[Math.min(255, Math.round(lumOf(d[i], d[i + 1], d[i + 2]) * 255))]++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!nCup || maxY <= minY) return null;
  let acc = 0, loL = 0, hiL = 1;
  for (let b = 0; b < 256; b++) {
    acc += histo[b];
    if (acc >= nCup * 0.02) { loL = b / 255; break; }
  }
  acc = 0;
  for (let b = 255; b >= 0; b--) {
    acc += histo[b];
    if (acc >= nCup * 0.02) { hiL = b / 255; break; }
  }
  const lumSpan = Math.max(0.02, hiL - loL);
  const span = maxY - minY;

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

      // luz do pixel normalizada para a faixa real do copo (0 = mais escuro,
      // 1 = mais claro) e expandida para dar volume à cor alvo
      const shadeNorm = clamp01((lum - loL) / lumSpan);
      const shade = 0.52 + shadeNorm * 0.6; // 0.52 (sombra) → 1.12 (luz)
      let r2 = t[0] * shade, g2 = t[1] * shade, b2 = t[2] * shade;

      // brilho especular: só o topo da faixa de luz volta como branco
      let spec = clamp01((shadeNorm - 0.86) / 0.14);
      spec *= spec;
      if (fx.jateado) spec *= 0.4; // fosco difunde o brilho
      const ss = spec * 0.8;
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
