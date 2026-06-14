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

export const MODELS = [
  { key: 'shaker',    label: 'Acqua Plus 500ml',    spec: 'shaker · tampa flip' },
  { key: 'twister',   label: 'Copo Twister 400ml',  spec: 'acrílico texturizado', noCap: true, pattern: 'twist' },
  { key: 'longdrink', label: 'Long Drink 350ml',    spec: 'acrílico', noCap: true },
  { key: 'caneca',    label: 'Caneca Alumínio 500ml', spec: 'alumínio · com alça', noCap: true, defaultFinish: 'metalico' },
  { key: 'taca',      label: 'Taça 180ml',          spec: 'taça com pé', noCap: true },
  { key: 'garrafa',   label: 'Garrafa 700ml',       spec: 'tampa rosca' },
  { key: 'squeeze',   label: 'Squeeze 750ml',       spec: 'bico esporte' },
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

// Textura do corpo: base (sólida/degradê) + textura do modelo + artes
export function composeBodyTexture({ color1, color2, gradient, arts = [], pattern = null }) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');

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

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function bodyMaterial(finish, { map = null, color = '#ffffff' } = {}) {
  const common = { color: map ? '#ffffff' : color, map };
  if (finish === 'metalico')   return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.26, metalness: 0.9, clearcoat: 0.4, clearcoatRoughness: 0.25 });
  if (finish === 'brilhante')  return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.12, metalness: 0.04, clearcoat: 0.9, clearcoatRoughness: 0.08 });
  if (finish === 'translucido')return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.14, metalness: 0, transmission: 0.88, thickness: 0.6, transparent: true, opacity: 0.94, ior: 1.34, clearcoat: 0.3 });
  return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.5, metalness: 0.04, clearcoat: 0.18, clearcoatRoughness: 0.4 });
}

export function capMaterial(hex) {
  return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.45, metalness: 0.1, clearcoat: 0.3, clearcoatRoughness: 0.3 });
}

export function buildModel(type) {
  const group = new THREE.Group();
  const bodyMeshes = [], capMeshes = [];
  const seg = 72;
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
    mk(new THREE.CylinderGeometry(0.82, 0.66, 3.0, seg), 0, bodyMeshes);
    mk(new THREE.TorusGeometry(0.8, 0.05, 16, seg), 1.5, bodyMeshes, {}).rotation.x = Math.PI / 2;
  } else if (type === 'twister') {
    mk(new THREE.CylinderGeometry(0.74, 0.54, 2.8, seg), 0, bodyMeshes);
    mk(new THREE.TorusGeometry(0.74, 0.045, 14, seg), 1.4, bodyMeshes, {}).rotation.x = Math.PI / 2;
  } else if (type === 'taca') {
    // taça: bojo (pintável) + haste + base
    mk(new THREE.CylinderGeometry(0.44, 0.13, 1.6, seg), 1.7, bodyMeshes);   // bojo (mainBody)
    mk(new THREE.CylinderGeometry(0.05, 0.05, 1.3, seg), 0.75, bodyMeshes);  // haste
    mk(new THREE.CylinderGeometry(0.3, 0.06, 0.12, seg), 0.18, bodyMeshes);  // cone da base
    mk(new THREE.CylinderGeometry(0.52, 0.52, 0.05, seg), 0.07, bodyMeshes); // base
  } else if (type === 'garrafa') {
    mk(new THREE.CylinderGeometry(0.9, 0.9, 1.8, seg), 0, bodyMeshes);
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
    const handle = mk(new THREE.TorusGeometry(0.42, 0.07, 18, 46, Math.PI * 1.2), 0.85, bodyMeshes);
    handle.rotation.z = -Math.PI / 2; handle.position.x = 0.78;
  } else if (type === 'squeeze') {
    mk(new THREE.CylinderGeometry(0.72, 0.78, 2.6, seg), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.5, 0.72, 0.4, seg), 1.5, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.42, 0.5, 0.3, seg), 1.82, capMeshes);
    mk(new THREE.CylinderGeometry(0.16, 0.22, 0.5, 40), 2.12, capMeshes);
    mk(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 32), 2.42, capMeshes);
  } else { // shaker
    mk(new THREE.CylinderGeometry(0.92, 0.80, 2.4, seg), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.62, 0.92, 0.22, seg), 1.31, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.6, 0.6, 0.14, seg), 1.49, capMeshes);
    mk(new THREE.CylinderGeometry(0.64, 0.6, 0.5, seg), 1.81, capMeshes);
    const dome = mk(new THREE.SphereGeometry(0.62, seg, 24, 0, Math.PI * 2, 0, Math.PI / 2), 2.06, capMeshes);
    dome.scale.y = 0.45;
    mk(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 32), 2.18, capMeshes, { rotX: -0.5, z: 0.28 });
  }

  group.position.y = -0.6;
  group.userData = { bodyMeshes, capMeshes, mainBody: bodyMeshes[0] };
  return group;
}
