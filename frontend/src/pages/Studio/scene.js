import * as THREE from 'three';

export const PALETTE = [
  ['Amarelo', '#FFD400'], ['Laranja', '#F26522'], ['Vermelho', '#E11D22'], ['Magenta', '#D6006E'],
  ['Pink', '#EC1C8E'], ['Rosa Bebê', '#F4B6C2'], ['Roxo', '#7E3FF2'], ['Violeta', '#8E44AD'],
  ['Azul Royal', '#1E4FD8'], ['Azul Bebê', '#9EC4E8'], ['Tiffany', '#2BB7B3'], ['Azul Ultramar', '#1B2A8C'],
  ['Verde Folha', '#2E9E32'], ['Verde Bandeira', '#0E6B4F'], ['Marsala', '#7B1E2B'], ['Rubi', '#9B111E'],
  ['Preto', '#1A1A1A'], ['Grafite', '#3A3F45'], ['Branco', '#F4F4F4'], ['Palha', '#E3DCC4'],
  // Neon
  ['Laranja Neon', '#FF6A00'], ['Verde Neon', '#39FF14'], ['Azul Neon', '#2E7BFF'], ['Roxo Neon', '#A020F0'],
  ['Rosa Neon', '#FF2D95'], ['Amarelo Neon', '#E6FF00'],
  // Metálicas (alumínio)
  ['Cobre', '#B87333'], ['Prata', '#C7CBD1'], ['Dourado', '#D4AF37'],
];

// printW/printH = área de impressão (rótulo desenrolado) em mm, usada no PDF de produção
// rim:true → a 3ª cor pinta a BORDA (em vez da tampa). defaultFinish = acabamento padrão.
export const MODELS = [
  { key: 'shaker',    label: 'Acqua Plus 500ml',    spec: 'shaker · tampa flip', printW: 230, printH: 90 },
  { key: 'twister',   label: 'Copo Twister 400ml',  spec: 'acrílico · borda colorida', noCap: true, rim: true, defaultFinish: 'translucido', printW: 215, printH: 100 },
  { key: 'longdrink', label: 'Long Drink 350ml',    spec: 'acrílico', noCap: true, rim: true, defaultFinish: 'translucido', printW: 235, printH: 100 },
  { key: 'caneca',    label: 'Caneca Alumínio 500ml', spec: 'alumínio · com alça', noCap: true, defaultFinish: 'metalico', printW: 250, printH: 100 },
  { key: 'slim',      label: 'Caneca Slim 400ml',   spec: 'acrílico · com alça', noCap: true, rim: true, defaultFinish: 'translucido', printW: 215, printH: 110 },
  { key: 'taca',      label: 'Taça 180ml',          spec: 'taça com pé', noCap: true, rim: true, defaultFinish: 'translucido', printW: 160, printH: 70 },
  { key: 'garrafa',   label: 'Garrafa 700ml',       spec: 'tampa rosca', printW: 235, printH: 115 },
];

export const FINISHES = [
  { key: 'opaco',       label: 'Opaco' },
  { key: 'brilhante',   label: 'Brilhante' },
  { key: 'metalico',    label: 'Metálico' },
  { key: 'translucido', label: 'Translúcido' },
];

export const PRESETS = [
  { label: 'Academia',  c1: '#1A1A1A', c2: '#F26522', grad: true,  finish: 'metalico'  },
  { label: 'Clean',     c1: '#F4F4F4', c2: '#1E4FD8', grad: false, finish: 'brilhante' },
  { label: 'Tropical',  c1: '#2BB7B3', c2: '#FFD400', grad: true,  finish: 'translucido' },
  { label: 'Sunset',    c1: '#F26522', c2: '#D6006E', grad: true,  finish: 'brilhante' },
  { label: 'Black',     c1: '#1A1A1A', c2: '#3A3F45', grad: true,  finish: 'metalico'  },
];

// Modelos prontos — designs completos que o usuário aplica com 1 clique.
export const TEMPLATES = [
  { name: 'Academia Power', model: 'shaker', color1: '#1A1A1A', color2: '#F26522', gradient: true, finish: 'metalico', capColor: '#F26522', bg: 'dark',
    arts: [{ kind: 'text', text: 'NO PAIN\nNO GAIN', font: 'Anton', color: '#FFFFFF', x: 0.25, y: 0.55, scale: 0.85, rot: 0 }] },
  { name: 'Verão Tropical', model: 'longdrink', color1: '#2BB7B3', color2: '#FFD400', gradient: true, finish: 'translucido', bg: 'warm',
    arts: [{ kind: 'text', text: 'SUMMER', font: 'Pacifico', color: '#FFFFFF', x: 0.25, y: 0.55, scale: 1, rot: -6 }] },
  { name: 'Twister Borda Ouro', model: 'twister', color1: '#F4F4F4', color2: '#F4F4F4', gradient: false, finish: 'translucido', capColor: '#D4AF37', bg: 'dark',
    arts: [{ kind: 'text', text: 'PARTY', font: 'Bebas Neue', color: '#1A1A1A', x: 0.25, y: 0.55, scale: 1.1, rot: 0 }] },
  { name: 'Slim Neon Bicolor', model: 'slim', color1: '#FF2D95', color2: '#2E7BFF', gradient: true, finish: 'translucido', bg: 'dark',
    arts: [{ kind: 'text', text: 'NEON', font: 'Anton', color: '#FFFFFF', x: 0.25, y: 0.55, scale: 0.9, rot: 0 }] },
  { name: 'Corporativo Clean', model: 'shaker', color1: '#F4F4F4', color2: '#1E4FD8', gradient: false, finish: 'brilhante', capColor: '#1E4FD8', bg: 'studio',
    arts: [{ kind: 'text', text: 'SUA MARCA', font: 'Montserrat', color: '#1E4FD8', x: 0.25, y: 0.55, scale: 0.7, rot: 0 }] },
  { name: 'Café Aço', model: 'caneca', color1: '#3A3F45', color2: '#1A1A1A', gradient: true, finish: 'metalico', bg: 'dark',
    arts: [{ kind: 'text', text: 'COFFEE\nFIRST', font: 'Oswald', color: '#D4AF37', x: 0.25, y: 0.55, scale: 0.8, rot: 0 }] },
  { name: 'Comemoração', model: 'taca', color1: '#7B1E2B', color2: '#D4AF37', gradient: true, finish: 'brilhante', bg: 'warm',
    arts: [{ kind: 'text', text: 'CHEERS', font: 'Lobster', color: '#FFFFFF', x: 0.25, y: 0.55, scale: 0.7, rot: 0 }] },
];

export const BACKGROUNDS = {
  studio: 'radial-gradient(circle at 50% 30%, #ffffff 0%, #e9edf3 55%, #d6dce5 100%)',
  dark:   'radial-gradient(circle at 50% 25%, #2a2f3a 0%, #15181f 70%, #0c0e13 100%)',
  warm:   'radial-gradient(circle at 50% 30%, #fff7ef 0%, #ffe6cf 60%, #f6d3b0 100%)',
};

export function disposeObject(obj) {
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(m => {
        for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); }
        m.dispose();
      });
    }
  });
}

export const FONTS = [
  { key: 'Inter',      label: 'Inter',      weight: '700' },
  { key: 'Montserrat', label: 'Montserrat', weight: '900' },
  { key: 'Bebas Neue', label: 'Bebas Neue', weight: '400' },
  { key: 'Anton',      label: 'Anton',      weight: '400' },
  { key: 'Oswald',     label: 'Oswald',     weight: '700' },
  { key: 'Poppins',    label: 'Poppins',    weight: '800' },
  { key: 'Pacifico',   label: 'Pacifico',   weight: '400' },
  { key: 'Lobster',    label: 'Lobster',    weight: '400' },
];
const FONT_WEIGHT = Object.fromEntries(FONTS.map(f => [f.key, f.weight]));

// Desenha uma arte (texto ou imagem) na superfície já transladada/rotacionada
function drawArt(ctx, art) {
  if (art.kind === 'image' && art._img) {
    const base = 700 * (art.scale || 1);
    const ratio = art._img.height / art._img.width;
    ctx.drawImage(art._img, -base / 2, -(base * ratio) / 2, base, base * ratio);
  } else if (art.kind === 'text' && art.text) {
    const size = 170 * (art.scale || 1);
    const w = FONT_WEIGHT[art.font] || '700';
    ctx.font = `${w} ${size}px "${art.font || 'Inter'}", Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = art.color || '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = size * 0.03;
    const lines = String(art.text).slice(0, 30).split('\n').slice(0, 2);
    lines.forEach((ln, i) => {
      const y = (i + 0.5) * size * 1.04 - (lines.length * size * 1.04) / 2;
      ctx.strokeText(ln, 0, y); ctx.fillText(ln, 0, y);
    });
  }
}

// Espaço lógico de pintura (todas as artes são posicionadas neste sistema).
const BASE_W = 2048, BASE_H = 1024;

// Pinta o rótulo desenrolado no contexto (já escalado para BASE_W × BASE_H).
function paintBody(ctx, { color1, color2, gradient, arts = [], pattern = null }) {
  const W = BASE_W, H = BASE_H;
  if (gradient) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, color1); g.addColorStop(1, color2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = color1;
  ctx.fillRect(0, 0, W, H);

  // textura do copo twister (estrias diagonais)
  if (pattern === 'twist') {
    ctx.lineWidth = 10;
    for (let x = -H; x < W; x += 64) {
      ctx.strokeStyle = 'rgba(0,0,0,0.06)';
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H, H); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath(); ctx.moveTo(x + 22, 0); ctx.lineTo(x + 22 + H, H); ctx.stroke();
    }
  }

  for (const art of arts) {
    ctx.save();
    ctx.translate((art.x ?? 0.25) * W, (1 - (art.y ?? 0.55)) * H);
    ctx.rotate((art.rot || 0) * Math.PI / 180);
    drawArt(ctx, art);
    ctx.restore();
  }
}

// Textura do corpo p/ o 3D: base (sólida/degradê) + textura do modelo + artes
export function composeBodyTexture(opts) {
  const c = document.createElement('canvas'); c.width = BASE_W; c.height = BASE_H;
  paintBody(c.getContext('2d'), opts);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Canvas em alta resolução (rótulo desenrolado) p/ exportar PDF de produção.
export function composeBodyCanvas(opts, scale = 2) {
  const c = document.createElement('canvas');
  c.width = BASE_W * scale; c.height = BASE_H * scale;
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  paintBody(ctx, opts);
  return c;
}

export function bodyMaterial(finish, { map = null, color = '#ffffff' } = {}) {
  // DoubleSide: canecas/copos abertos no topo mostram a parede interna em vez
  // de "vazar" o fundo (some o bug de fundo transparente nos translúcidos).
  // envMapIntensity: quanto o material reflete o ambiente HDR de estúdio.
  const common = { color: map ? '#ffffff' : color, map, side: THREE.DoubleSide };
  if (finish === 'metalico')
    return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.22, metalness: 0.95, clearcoat: 0.5, clearcoatRoughness: 0.18, envMapIntensity: 1.35 });
  if (finish === 'brilhante')
    return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.07, metalness: 0.0, clearcoat: 1.0, clearcoatRoughness: 0.04, envMapIntensity: 1.35, specularIntensity: 1.0 });
  if (finish === 'translucido')
    return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.09, metalness: 0, transmission: 0.9, thickness: 0.9, transparent: true, opacity: 0.96, ior: 1.46, clearcoat: 0.55, clearcoatRoughness: 0.05, envMapIntensity: 1.35, specularIntensity: 1.0 });
  // opaco: leve clearcoat + sheen para não ficar "chapado"
  return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.42, metalness: 0.02, clearcoat: 0.28, clearcoatRoughness: 0.32, envMapIntensity: 1.15, sheen: 0.25, sheenRoughness: 0.55 });
}

export function capMaterial(hex) {
  // DoubleSide: as bordas retas (anéis abertos) precisam aparecer por dentro e por fora.
  return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.38, metalness: 0.1, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 1.2, side: THREE.DoubleSide });
}

export function buildModel(type) {
  const group = new THREE.Group();
  const bodyMeshes = [], capMeshes = [];
  const seg = 128; // segmentos radiais: silhueta bem mais lisa
  const mk = (geo, y, list, opts = {}) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cccccc' }));
    m.position.y = y;
    if (opts.rotX) m.rotation.x = opts.rotX;
    if (opts.z) m.position.z = opts.z;
    if (opts.x) m.position.x = opts.x;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); list.push(m); return m;
  };

  if (type === 'longdrink') {
    mk(new THREE.CylinderGeometry(0.82, 0.66, 3.0, seg, 24), 0, bodyMeshes);
    // borda RETA no topo (faixa cilíndrica, não anel arredondado)
    mk(new THREE.CylinderGeometry(0.835, 0.835, 0.22, seg, 1, true), 1.39, capMeshes);
  } else if (type === 'twister') {
    // corpo cônico liso (acrílico) + BORDA reta colorida no topo (capColor)
    mk(new THREE.CylinderGeometry(0.78, 0.56, 2.9, seg, 24), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.795, 0.795, 0.2, seg, 1, true), 1.35, capMeshes);
  } else if (type === 'slim') {
    // caneca slim: tubo alto ABERTO no topo + fundo sólido + alça
    mk(new THREE.CylinderGeometry(0.6, 0.64, 3.1, seg, 24, true), 0, bodyMeshes); // openEnded
    const bottom = mk(new THREE.CircleGeometry(0.64, seg), -1.55, bodyMeshes);
    bottom.rotation.x = -Math.PI / 2;
    mk(new THREE.CylinderGeometry(0.615, 0.615, 0.2, seg, 1, true), 1.46, capMeshes); // borda reta
    // alça em "D" grande: encosta no corpo em cima e embaixo, com barriga
    // bem aberta e mais grossa (a antiga era fininha e alta demais).
    const sCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0.56, 1.15, 0),
      new THREE.Vector3(1.52, 0.80, 0),
      new THREE.Vector3(1.52, -0.60, 0),
      new THREE.Vector3(0.60, -0.55, 0),
    );
    mk(new THREE.TubeGeometry(sCurve, 90, 0.09, 20, false), 0, bodyMeshes);
  } else if (type === 'taca') {
    // taça: bojo (pintável) + haste + base
    mk(new THREE.CylinderGeometry(0.44, 0.13, 1.6, seg), 1.7, bodyMeshes);   // bojo (mainBody)
    mk(new THREE.CylinderGeometry(0.455, 0.455, 0.16, seg, 1, true), 2.42, capMeshes); // borda reta
    mk(new THREE.CylinderGeometry(0.05, 0.05, 1.3, seg), 0.75, bodyMeshes);  // haste
    mk(new THREE.CylinderGeometry(0.3, 0.06, 0.12, seg), 0.18, bodyMeshes);  // cone da base
    mk(new THREE.CylinderGeometry(0.52, 0.52, 0.05, seg), 0.07, bodyMeshes); // base
  } else if (type === 'garrafa') {
    mk(new THREE.CylinderGeometry(0.9, 0.9, 1.8, seg, 16), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.4, 0.9, 0.55, seg), 1.17, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.37, 0.4, 0.5, seg), 1.7, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.43, 0.43, 0.4, seg), 2.05, capMeshes);
  } else if (type === 'caneca') {
    // caneca de alumínio: corpo barril (LatheGeometry) + alça
    const pts = [
      new THREE.Vector2(0.00, 0.00), new THREE.Vector2(0.44, 0.00),
      new THREE.Vector2(0.62, 0.14), new THREE.Vector2(0.72, 0.55),
      new THREE.Vector2(0.69, 1.10), new THREE.Vector2(0.63, 1.62),
      new THREE.Vector2(0.61, 1.66),
    ];
    mk(new THREE.LatheGeometry(pts, seg), 0, bodyMeshes); // corpo (mainBody)
    // alça: tubo em "D" que conecta no corpo em cima e embaixo
    const hCurve = new THREE.CubicBezierCurve3(
      new THREE.Vector3(0.58, 1.25, 0),
      new THREE.Vector3(1.22, 1.05, 0),
      new THREE.Vector3(1.22, 0.25, 0),
      new THREE.Vector3(0.58, 0.35, 0),
    );
    mk(new THREE.TubeGeometry(hCurve, 64, 0.075, 16, false), 0, bodyMeshes);
  } else { // shaker
    mk(new THREE.CylinderGeometry(0.92, 0.80, 2.4, seg, 20), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.62, 0.92, 0.22, seg), 1.31, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.6, 0.6, 0.14, seg), 1.49, capMeshes);
    mk(new THREE.CylinderGeometry(0.64, 0.6, 0.5, seg), 1.81, capMeshes);
    const dome = mk(new THREE.SphereGeometry(0.62, seg, 24, 0, Math.PI * 2, 0, Math.PI / 2), 2.06, capMeshes);
    dome.scale.y = 0.45;
    mk(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 32), 2.18, capMeshes, { rotX: -0.5, z: 0.28 });
  }

  // Assenta a base do copo exatamente sobre o plano de sombra (y = -1.62),
  // seja qual for a altura do modelo. Antes o offset era fixo (-0.6): copos
  // altos atravessavam o chão (faixa escura embaixo + sombra fora do lugar)
  // e os baixos flutuavam.
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  group.position.y = -1.62 - box.min.y;
  group.userData = { bodyMeshes, capMeshes, mainBody: bodyMeshes[0] };
  return group;
}
