// Recolore uma FOTO REAL de copo para a cor de cada produto, preservando
// brilho, sombras e reflexos. Funciona com modelo BRANCO (multiplica a luz
// pela cor — técnica de mockup) e com modelo COLORIDO (troca o matiz).
// O fundo da foto é detectado a partir das bordas e nunca é pintado.

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
  return rgbToHsl(parseInt(h6.slice(0, 2), 16), parseInt(h6.slice(2, 4), 16), parseInt(h6.slice(4, 6), 16));
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

// img: foto modelo carregada · spec: { colors: [hex...], fx: {...} }
// devolve dataURL (webp ou png) da foto recolorida — ou null se falhar
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
  const px = w * h;

  // ── 1. fundo: flood fill a partir das bordas (cor parecida com a borda) ──
  const bg = new Uint8Array(px); // 1 = fundo (não pintar)
  let rr = 0, rg = 0, rb = 0, rn = 0;
  const borderIdx = [];
  for (let x = 0; x < w; x++) { borderIdx.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { borderIdx.push(y * w, y * w + (w - 1)); }
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

  // ── 2. estatísticas do copo (o que não é fundo) ──
  let minY = h, maxY = 0, nCup = 0, nCor = 0, sumL = 0, sumLc = 0, sumSc = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;
      const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);
      nCup++; sumL += l;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (s >= 0.15) { nCor++; sumLc += l; sumSc += s; }
    }
  }
  if (!nCup || maxY <= minY) return null;
  const modeloColorido = nCor / nCup > 0.35;
  const baseS = modeloColorido ? Math.max(0.2, sumSc / nCor) : 0.2;
  const baseL = modeloColorido
    ? Math.min(0.85, Math.max(0.15, sumLc / nCor))
    : Math.min(0.95, Math.max(0.4, sumL / nCup));
  const span = maxY - minY;

  // ── 3. recolore preservando a luz de cada pixel ──
  for (let y = 0; y < h; y++) {
    const rel = clamp01((y - minY) / span); // 0 = topo do copo, 1 = base
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;
      const [, s, l] = rgbToHsl(d[i], d[i + 1], d[i + 2]);

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

      let H = t[0], S, L;
      if (modeloColorido) {
        if (s < 0.12 && l > 0.85) continue; // brilho branco: mantém
        if (s < 0.08 && l < 0.25) continue; // contorno escuro: mantém
        S = t[1] < 0.05 ? s * 0.08 : clamp01(t[1] * (s / baseS));
        L = clamp01(l + (t[2] - baseL) * 0.7);
      } else {
        // modelo branco/claro: multiplica a luz do pixel pela cor alvo
        const gloss = clamp01((l - 0.94) / 0.05); // brilho estourado continua branco
        S = (t[1] < 0.05 ? 0.04 : t[1]) * (1 - gloss);
        L = clamp01(t[2] * Math.min(1.35, l / baseL));
        L = L + gloss * (0.97 - L);
      }

      if (fx.borda && !colors[1] && rel > 0.08) {
        // só uma cor + BORDA = copo "vidro" com borda colorida
        S = s * 0.12;
        L = clamp01(l * 0.35 + 0.62);
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
