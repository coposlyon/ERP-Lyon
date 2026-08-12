// Recorte de foto de produto: tira o fundo branco e apara as margens vazias.
//
// Usado em dois lugares: no editor do site (ao subir a foto do copo) e na loja
// (nas fotos que aparecem sobre fundo escuro — topo e paleta). A foto do
// catálogo da Lyon costuma já vir recortada; isto é a rede de segurança pra
// quem subir uma foto batida em fundo branco.

// Só apaga o branco que "encosta" na borda (flood fill a partir das 4 laterais),
// preservando o branco interno do copo — reflexo, tampa, copo branco.
export function removeEdgeWhite(data, w, h, tol = 236) {
  const { data: px } = data;
  const near = i => px[i] >= tol && px[i + 1] >= tol && px[i + 2] >= tol && px[i + 3] > 0;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h && !seen[y * w + x]) stack.push(x, y); };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const y = stack.pop(), x = stack.pop();
    const p = y * w + x; if (seen[p]) continue; seen[p] = 1;
    const i = p * 4; if (!near(i)) continue;
    px[i + 3] = 0;                                    // transparente
    push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
  }
}

// Bounding box do que sobrou (pixels com alpha) — pra recortar as margens vazias.
export function contentBox(data, w, h) {
  const { data: px } = data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (px[(y * w + x) * 4 + 3] > 12) {
      if (x < x0) x0 = x; if (x > x1) x1 = x;
      if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return { x: 0, y: 0, w, h };            // nada sobrou → mantém tudo
  const pad = 2;
  x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad);
  x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// Quanto da moldura é branco opaco. Foto batida em fundo branco dá perto de 1;
// recorte que preenche o quadro (o caso da maioria das fotos da Lyon) dá ~0.
function bordaBranca(data, w, h, tol = 236) {
  const { data: px } = data;
  let branco = 0, total = 0;
  const olha = (x, y) => {
    const i = (y * w + x) * 4;
    total++;
    if (px[i + 3] > 200 && px[i] >= tol && px[i + 1] >= tol && px[i + 2] >= tol) branco++;
  };
  for (let x = 0; x < w; x++) { olha(x, 0); olha(x, h - 1); }
  for (let y = 1; y < h - 1; y++) { olha(0, y); olha(w - 1, y); }
  return total ? branco / total : 0;
}

function areaOpaca(data, w, h) {
  const { data: px } = data;
  let n = 0;
  for (let i = 3; i < px.length; i += 4) if (px[i] > 12) n++;
  return n / (w * h);
}

const cache = new Map();   // url → Promise<url final>

function processa(url) {
  return new Promise(resolve => {
    const img = new Image();
    img.crossOrigin = 'anonymous';     // o bucket público manda CORS: *
    img.onerror = () => resolve(url);
    img.onload = () => {
      try {
        const max = 900;
        const escala = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * escala), h = Math.round(img.height * escala);
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h);

        // Sem moldura branca não há o que tirar — devolve a foto original e
        // evita o risco de comer um copo branco que preenche o quadro.
        if (bordaBranca(data, w, h) < 0.6) return resolve(url);

        removeEdgeWhite(data, w, h);
        // Se sobrou quase nada, o "fundo" era o próprio produto: desiste.
        if (areaOpaca(data, w, h) < 0.05) return resolve(url);

        ctx.putImageData(data, 0, 0);
        const box = contentBox(data, w, h);
        const out = document.createElement('canvas'); out.width = box.w; out.height = box.h;
        out.getContext('2d').drawImage(c, box.x, box.y, box.w, box.h, 0, 0, box.w, box.h);
        resolve(out.toDataURL('image/png'));
      } catch {
        resolve(url);                  // canvas "tainted" ou sem memória
      }
    };
    img.src = url;
  });
}

// Devolve a foto sem fundo branco (ou a original, quando não há o que tirar).
// Processa cada URL uma vez por sessão.
export function cutout(url) {
  if (!url || /^data:/.test(url)) return Promise.resolve(url);
  if (!cache.has(url)) cache.set(url, processa(url));
  return cache.get(url);
}
