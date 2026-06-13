import * as THREE from 'three';

export const PALETTE = [
  ['Amarelo', '#FFD400'], ['Laranja', '#F26522'], ['Vermelho', '#E11D22'], ['Magenta', '#D6006E'],
  ['Pink', '#EC1C8E'], ['Rosa Bebê', '#F4B6C2'], ['Roxo', '#7E3FF2'], ['Violeta', '#8E44AD'],
  ['Azul Royal', '#1E4FD8'], ['Azul Bebê', '#9EC4E8'], ['Azul Tifanny', '#2BB7B3'], ['Azul Ultramar', '#1B2A8C'],
  ['Verde Folha', '#2E9E32'], ['Verde Bandeira', '#0E6B4F'], ['Marsala', '#7B1E2B'], ['Laranja Neon', '#FF6A00'],
  ['Preto', '#1A1A1A'], ['Branco', '#F4F4F4'], ['Palha', '#E3DCC4'], ['Cinza', '#9AA0A6'],
];

export const MODELS = [
  { key: 'shaker',    label: 'Shaker 500ml' },
  { key: 'longdrink', label: 'Long Drink' },
  { key: 'garrafa',   label: 'Garrafa' },
];

export const FINISHES = [
  { key: 'opaco',      label: 'Opaco' },
  { key: 'translucido',label: 'Translúcido' },
  { key: 'degrade',    label: 'Degradê' },
  { key: 'metalico',   label: 'Metálico' },
];

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

function luminance(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (r * 0.299 + g * 0.587 + b * 0.114) / 255;
}

function gradientTexture(hex) {
  const c = document.createElement('canvas'); c.width = 16; c.height = 256;
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, hex); g.addColorStop(0.55, hex); g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 16, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function bodyMaterial(finish, hex) {
  if (finish === 'translucido')
    return new THREE.MeshPhysicalMaterial({ color: hex, roughness: 0.12, metalness: 0, transmission: 0.9, thickness: 0.6, transparent: true, opacity: 0.92, ior: 1.35, clearcoat: 0.3 });
  if (finish === 'metalico')
    return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.28, metalness: 0.92 });
  if (finish === 'degrade') {
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4, metalness: 0.05 });
    m.map = gradientTexture(hex);
    return m;
  }
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.42, metalness: 0.05 });
}

export function capMaterial(hex) {
  return new THREE.MeshStandardMaterial({ color: hex, roughness: 0.5, metalness: 0.08 });
}

// Textura do logo/texto impresso (fundo transparente)
export function decalTexture(text) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 1024, 512);
  if (text) {
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 6;
    ctx.font = 'bold 150px Inter, Arial, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const lines = String(text).slice(0, 24).split('\n').slice(0, 2);
    lines.forEach((ln, i) => {
      const y = 256 + (i - (lines.length - 1) / 2) * 170;
      ctx.strokeText(ln, 512, y);
      ctx.fillText(ln, 512, y);
    });
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.repeat.x = -1; t.offset.x = 1; // corrige espelhamento na curva
  t.needsUpdate = true;
  return t;
}

// Constrói o modelo. Retorna meshes nomeados para pintura por parte.
export function buildModel(type) {
  const group = new THREE.Group();
  const bodyMeshes = [];
  const capMeshes = [];
  let decalR = 0.95, decalH = 1.2, decalY = 0;

  const seg = 64;
  const mk = (geo, y, list, rot) => {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: '#cccccc' }));
    m.position.y = y; if (rot) m.rotation.x = rot;
    m.castShadow = true; m.receiveShadow = true;
    group.add(m); list.push(m); return m;
  };

  if (type === 'longdrink') {
    mk(new THREE.CylinderGeometry(0.82, 0.66, 3.0, seg), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.84, 0.84, 0.07, seg), 1.5, bodyMeshes); // lábio
    decalR = 0.86; decalH = 1.8; decalY = -0.1;
  } else if (type === 'garrafa') {
    mk(new THREE.CylinderGeometry(0.9, 0.9, 1.8, seg), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.4, 0.9, 0.55, seg), 1.17, bodyMeshes);  // ombro
    mk(new THREE.CylinderGeometry(0.37, 0.4, 0.5, seg), 1.7, bodyMeshes);   // gargalo
    mk(new THREE.CylinderGeometry(0.43, 0.43, 0.4, seg), 2.05, capMeshes);  // tampa
    decalR = 0.93; decalH = 1.3; decalY = -0.05;
  } else { // shaker
    mk(new THREE.CylinderGeometry(0.92, 0.80, 2.4, seg), 0, bodyMeshes);
    mk(new THREE.CylinderGeometry(0.62, 0.92, 0.22, seg), 1.31, bodyMeshes); // ombro
    mk(new THREE.CylinderGeometry(0.6, 0.6, 0.14, seg), 1.49, capMeshes);    // rosca
    mk(new THREE.CylinderGeometry(0.64, 0.6, 0.5, seg), 1.81, capMeshes);    // tampa
    const dome = new THREE.SphereGeometry(0.62, seg, 24, 0, Math.PI * 2, 0, Math.PI / 2);
    const d = mk(dome, 2.06, capMeshes); d.scale.y = 0.45;
    const spout = mk(new THREE.CylinderGeometry(0.1, 0.14, 0.5, 32), 2.18, capMeshes, -0.5);
    spout.position.z = 0.28;
    decalR = 0.95; decalH = 1.3; decalY = -0.05;
  }

  // Banda do logo (cilindro aberto cobrindo a frente)
  const span = 1.0;
  const bandGeo = new THREE.CylinderGeometry(decalR + 0.015, decalR + 0.015, decalH, 48, 1, true,
    Math.PI / 2 - span / 2, span);
  const decal = new THREE.Mesh(bandGeo, new THREE.MeshBasicMaterial({
    transparent: true, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  }));
  decal.position.y = decalY;
  group.add(decal);

  // centraliza verticalmente
  group.position.y = -0.6;
  group.userData = { bodyMeshes, capMeshes, decal };
  return group;
}

export { luminance };
