import * as THREE from 'three';

export const PALETTE = [
  ['Amarelo', '#FFD400'], ['Laranja', '#F26522'], ['Laranja Neon', '#FF6A00'], ['Vermelho', '#E11D22'],
  ['Magenta', '#D6006E'], ['Pink', '#EC1C8E'], ['Rosa Bebê', '#F4B6C2'], ['Roxo', '#7E3FF2'],
  ['Violeta', '#8E44AD'], ['Azul Royal', '#1E4FD8'], ['Azul Bebê', '#9EC4E8'], ['Azul Tifanny', '#2BB7B3'],
  ['Azul Ultramar', '#1B2A8C'], ['Verde Folha', '#2E9E32'], ['Verde Bandeira', '#0E6B4F'], ['Marsala', '#7B1E2B'],
  ['Preto', '#1A1A1A'], ['Grafite', '#3A3F45'], ['Branco', '#F4F4F4'], ['Palha', '#E3DCC4'],
];

export const MODELS = [
  { key: 'shaker',    label: 'Shaker 500ml', spec: '500 ml · tampa flip' },
  { key: 'longdrink', label: 'Long Drink',   spec: '350 ml · sem tampa', noCap: true },
  { key: 'garrafa',   label: 'Garrafa',      spec: '700 ml · tampa rosca' },
  { key: 'caneca',    label: 'Caneca',       spec: '400 ml · com alça', noCap: true },
  { key: 'squeeze',   label: 'Squeeze',      spec: '750 ml · bico esporte' },
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

// Textura da superfície do corpo: base (sólida ou degradê) + logo (imagem/texto)
export function composeBodyTexture({ color1, color2, gradient, image, text, logoX = 0.5, logoY = 0.55, logoScale = 1, logoRot = 0 }) {
  const W = 2048, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');

  if (gradient) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, color1); g.addColorStop(1, color2);
    ctx.fillStyle = g;
  } else ctx.fillStyle = color1;
  ctx.fillRect(0, 0, W, H);

  const cx = logoX * W;
  const cy = (1 - logoY) * H;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((logoRot || 0) * Math.PI / 180);

  let cursorY = 0;
  if (image) {
    const maxW = W * 0.34 * logoScale;
    const ratio = image.height / image.width;
    const dw = maxW, dh = maxW * ratio;
    ctx.drawImage(image, -dw / 2, -dh / 2 - (text ? dh * 0.15 : 0), dw, dh);
    cursorY = dh / 2 + 30;
  }
  if (text) {
    const size = 150 * logoScale;
    ctx.font = `bold ${size}px Inter, Arial, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.28)'; ctx.lineWidth = size * 0.05;
    const lines = String(text).slice(0, 28).split('\n').slice(0, 2);
    lines.forEach((ln, i) => {
      const y = cursorY + (i + 0.5) * size * 1.05 - (lines.length * size * 1.05) / 2 + (image ? size * 0.6 : 0);
      ctx.strokeText(ln, 0, y); ctx.fillText(ln, 0, y);
    });
  }
  ctx.restore();

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
  } else if (type === 'garrafa') {
    mk(new THREE.CylinderGeometry(0.9, 0.9, 1.8, seg), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.4, 0.9, 0.55, seg), 1.17, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.37, 0.4, 0.5, seg), 1.7, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.43, 0.43, 0.4, seg), 2.05, capMeshes);
  } else if (type === 'caneca') {
    mk(new THREE.CylinderGeometry(0.9, 0.86, 2.0, seg), 0, bodyMeshes);
    const handle = mk(new THREE.TorusGeometry(0.55, 0.11, 18, 40, Math.PI * 1.1), 0, bodyMeshes);
    handle.rotation.z = -Math.PI / 2; handle.position.x = 1.0;
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
