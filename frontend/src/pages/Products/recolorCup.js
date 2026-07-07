// Recolore uma FOTO REAL de copo para a cor de cada produto — técnica de
// mockup profissional com SEPARAÇÃO DE FREQUÊNCIAS:
//   luz "grande" (volume/sombreamento) = imagem borrada → multiplica a cor;
//   luz "fina" (reflexos/textura)      = original - borrada → volta por cima.
// O fundo é detectado pelas bordas e o copo é reconstruído linha a linha
// (resolve copo branco em fundo branco). Validado em laboratório (motor v6).

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
const mixRgb = (c1, c2, m) => [mix(c1[0], c2[0], m), mix(c1[1], c2[1], m), mix(c1[2], c2[2], m)];
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

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

  // ── luz "grande" (volume): reduz 8x, amplia de volta e borra ──
  const sw = Math.max(1, Math.round(w / 8)), sh = Math.max(1, Math.round(h / 8));
  const smallC = document.createElement('canvas');
  smallC.width = sw; smallC.height = sh;
  smallC.getContext('2d').drawImage(cv, 0, 0, sw, sh);
  const blurC = document.createElement('canvas');
  blurC.width = w; blurC.height = h;
  const bctx = blurC.getContext('2d', { willReadFrequently: true });
  bctx.filter = 'blur(6px)';
  const filterOk = bctx.filter !== 'none';
  if (filterOk) {
    bctx.drawImage(smallC, 0, 0, w, h);
  } else {
    // sem suporte a ctx.filter: aproxima o blur com upscale em 2 etapas
    const midC = document.createElement('canvas');
    midC.width = Math.max(1, w >> 1); midC.height = Math.max(1, h >> 1);
    midC.getContext('2d').drawImage(smallC, 0, 0, midC.width, midC.height);
    bctx.drawImage(midC, 0, 0, w, h);
  }
  const bd = bctx.getImageData(0, 0, w, h).data;

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

  // ── 1b. reconstrói o copo por LINHA (silhueta é convexa na horizontal) —
  // fecha o vazamento do flood em copo branco sobre fundo branco.
  for (let y = 0; y < h; y++) {
    let left = -1, right = -1;
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (bg[idx] || d[idx * 4 + 3] < 30) continue;
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
      if (d[idx * 4 + 3] >= 30) bg[idx] = 0;
    }
  }

  // ── 2. faixa de luz do copo (percentis 5%–95% da luz borrada) ──
  let minY = h, maxY = 0, nCup = 0;
  const histo = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;
      nCup++;
      histo[Math.min(255, Math.round(lumOf(bd[i], bd[i + 1], bd[i + 2]) * 255))]++;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!nCup || maxY <= minY) return null;
  let acc = 0, loL = 0, hiL = 1;
  for (let b = 0; b < 256; b++) { acc += histo[b]; if (acc >= nCup * 0.05) { loL = b / 255; break; } }
  acc = 0;
  for (let b = 255; b >= 0; b--) { acc += histo[b]; if (acc >= nCup * 0.05) { hiL = b / 255; break; } }
  const lumSpan = Math.max(0.02, hiL - loL);
  const span = maxY - minY;

  // ── 3. pinta: cor alvo × luz grande + detalhe fino + brilho suave ──
  for (let y = 0; y < h; y++) {
    const rel = clamp01((y - minY) / span); // 0 = topo do copo, 1 = base
    for (let x = 0; x < w; x++) {
      const idx = y * w + x, i = idx * 4;
      if (bg[idx] || d[i + 3] < 30) continue;

      const lum = lumOf(d[i], d[i + 1], d[i + 2]);
      const lumS = lumOf(bd[i], bd[i + 1], bd[i + 2]);
      const detail = (lum - lumS) * 255 * 0.85; // reflexos finos de volta

      // cor alvo válida neste pixel
      let t = targets[0];
      if (fx.bicolor && targets[1]) {
        // base (1ª cor) embaixo, 2ª cor em cima, com transição suave no meio
        const m = smoothstep(0.48, 0.52, rel);
        t = m <= 0 ? targets[1] : m >= 1 ? targets[0] : mixRgb(targets[1], targets[0], m);
      } else if (fx.borda && targets[1]) {
        if (rel <= 0.08) t = targets[1]; // borda = 2ª cor
      }
      if (fx.borda && !targets[1]) {
        t = rel <= 0.08 ? targets[0] : VIDRO; // vidro com borda colorida
      }
      if (fx.degrade) {
        const fade = clamp01((rel - 0.12) / 0.78);
        t = mixRgb(t, CLARO, fade * 0.9);
      }

      // sombreamento normalizado + dither leve (quebra bandas sem virar grão)
      const sn = clamp01((lumS - loL) / lumSpan);
      const snD = clamp01(sn + (Math.random() - 0.5) * 0.006);
      const shade = 0.62 + snD * 0.5; // 0.62 sombra → 1.12 luz

      let r2 = t[0] * shade + detail;
      let g2 = t[1] * shade + detail;
      let b2 = t[2] * shade + detail;

      // beijo de brilho branco só no topo da faixa de luz (mapa limpo)
      let sp = clamp01((sn - 0.9) / 0.1);
      sp = sp * sp * (fx.jateado ? 0.2 : 0.45);
      r2 += (255 - r2) * sp; g2 += (255 - g2) * sp; b2 += (255 - b2) * sp;

      if (fx.jateado) { // véu fosco
        r2 += (255 - r2) * 0.08; g2 += (255 - g2) * 0.08; b2 += (255 - b2) * 0.08;
      }

      d[i] = Math.max(0, Math.min(255, r2));
      d[i + 1] = Math.max(0, Math.min(255, g2));
      d[i + 2] = Math.max(0, Math.min(255, b2));
    }
  }

  ctx.putImageData(im, 0, 0);
  let out = cv.toDataURL('image/webp', 0.9);
  if (!out.startsWith('data:image/webp')) out = cv.toDataURL('image/png');
  return out;
}
