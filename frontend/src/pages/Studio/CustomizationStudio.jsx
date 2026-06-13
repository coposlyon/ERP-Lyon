import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Box, Rotate3d, Download, Save, RefreshCw, Type, Sparkles, Layers } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { PALETTE, MODELS, FINISHES, buildModel, bodyMaterial, capMaterial, decalTexture, disposeObject } from './scene';

export default function CustomizationStudio() {
  const mountRef = useRef(null);
  const three = useRef({});
  const cfg = useRef({});

  const [model, setModel]         = useState('shaker');
  const [bodyColor, setBodyColor] = useState('#1E4FD8');
  const [capColor, setCapColor]   = useState('#1A1A1A');
  const [finish, setFinish]       = useState('opaco');
  const [activePart, setActivePart] = useState('body');
  const [logo, setLogo]           = useState('');
  const [autoRotate, setAutoRotate] = useState(true);
  const [saveOpen, setSaveOpen]   = useState(false);
  const [title, setTitle]         = useState('');
  const [saving, setSaving]       = useState(false);

  cfg.current = { bodyColor, capColor, finish, logo };

  const applyBody = () => {
    const m = three.current.model; if (!m) return;
    m.userData.bodyMeshes.forEach(mesh => {
      const old = mesh.material;
      mesh.material = bodyMaterial(cfg.current.finish, cfg.current.bodyColor);
      if (old) { if (old.map) old.map.dispose(); old.dispose(); }
    });
  };
  const applyCap = () => {
    const m = three.current.model; if (!m) return;
    m.userData.capMeshes.forEach(mesh => { const old = mesh.material; mesh.material = capMaterial(cfg.current.capColor); old?.dispose(); });
  };
  const applyDecal = () => {
    const m = three.current.model; if (!m) return;
    const decal = m.userData.decal;
    const old = decal.material.map;
    decal.material.map = cfg.current.logo ? decalTexture(cfg.current.logo) : null;
    decal.material.needsUpdate = true;
    decal.visible = !!cfg.current.logo;
    if (old) old.dispose();
  };

  // ── Init cena (uma vez) ──
  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight || 480;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    camera.position.set(0, 0.6, 6.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 3.5; controls.maxDistance = 11;
    controls.target.set(0, 0.1, 0);
    controls.maxPolarAngle = Math.PI * 0.86;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.4;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x404a5a, 0.7));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(3, 5, 4); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 20;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0004;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd2ff, 0.5); fill.position.set(-4, 2, -2); scene.add(fill);
    const rim = new THREE.DirectionalLight(0xffffff, 0.7); rim.position.set(0, 3, -5); scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(7, 64), new THREE.ShadowMaterial({ opacity: 0.22 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.62; ground.receiveShadow = true;
    scene.add(ground);

    three.current = { renderer, scene, camera, controls, mount, model: null };

    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight || 480;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    });
    ro.observe(mount);

    const loop = () => {
      three.current.raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(three.current.raf);
      ro.disconnect();
      controls.dispose();
      if (three.current.model) { scene.remove(three.current.model); disposeObject(three.current.model); }
      ground.geometry.dispose(); ground.material.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  // ── Reconstroi geometria quando muda o modelo ──
  useEffect(() => {
    const t = three.current; if (!t.scene) return;
    if (t.model) { t.scene.remove(t.model); disposeObject(t.model); }
    t.model = buildModel(model);
    t.scene.add(t.model);
    applyBody(); applyCap(); applyDecal();
    if (!t.model.userData.capMeshes.length && activePart === 'cap') setActivePart('body');
  }, [model]);

  useEffect(() => { applyBody(); }, [bodyColor, finish]);
  useEffect(() => { applyCap(); }, [capColor]);
  useEffect(() => { applyDecal(); }, [logo]);
  useEffect(() => { if (three.current.controls) three.current.controls.autoRotate = autoRotate; }, [autoRotate]);

  const hasCap = MODELS && model !== 'longdrink';

  function pickColor(hex) {
    if (activePart === 'cap') setCapColor(hex); else setBodyColor(hex);
  }
  const activeColor = activePart === 'cap' ? capColor : bodyColor;

  function snapshotPNG() {
    const t = three.current; t.renderer.render(t.scene, t.camera);
    return t.renderer.domElement.toDataURL('image/png');
  }
  function thumbnail() {
    const t = three.current; t.renderer.render(t.scene, t.camera);
    const src = t.renderer.domElement;
    const W = 320, H = Math.round(W * src.height / src.width);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, W, H);
    ctx.drawImage(src, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.7);
  }
  function download() {
    const a = Object.assign(document.createElement('a'), { href: snapshotPNG(), download: `personalizacao-${model}.png` });
    a.click();
  }
  function reset() {
    setModel('shaker'); setBodyColor('#1E4FD8'); setCapColor('#1A1A1A'); setFinish('opaco'); setLogo(''); setActivePart('body');
  }
  async function save() {
    if (!title.trim()) { toast.error('Dê um nome ao design'); return; }
    setSaving(true);
    try {
      await api.post('/customizations', {
        title: title.trim(),
        design_3d: { model, bodyColor, capColor, finish, logo },
        preview_url: thumbnail(),
      });
      toast.success('Personalização salva! Aparece no quadro de Personalização.');
      setSaveOpen(false); setTitle('');
    } catch (e) { toast.error(e.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <Box size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="page-title">Estúdio 3D de Personalização</h1>
            <p className="text-sm text-gray-500 mt-0.5">Escolha o modelo, pinte cada parte e gire em 3D</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-4">
        {/* Viewport */}
        <div className="relative rounded-2xl overflow-hidden border border-gray-200"
          style={{ background: 'radial-gradient(circle at 50% 35%, #ffffff 0%, #e9edf3 55%, #d7dde6 100%)' }}>
          <div ref={mountRef} style={{ width: '100%', height: '72vh', minHeight: 440 }} />
          <div className="absolute top-3 left-3 flex gap-2">
            <button onClick={() => setAutoRotate(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur transition-colors ${autoRotate ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-700'}`}>
              <Rotate3d size={14} /> {autoRotate ? 'Girando' : 'Girar'}
            </button>
          </div>
          <p className="absolute bottom-3 left-3 text-xs text-gray-400 bg-white/70 backdrop-blur px-2 py-1 rounded">
            Arraste para girar · scroll para zoom
          </p>
        </div>

        {/* Painel */}
        <div className="space-y-4 max-h-[78vh] overflow-y-auto pr-1">
          {/* Modelo */}
          <Section icon={Layers} title="Modelo">
            <div className="grid grid-cols-3 gap-2">
              {MODELS.map(m => (
                <button key={m.key} onClick={() => setModel(m.key)}
                  className={`px-2 py-2.5 rounded-xl text-xs font-semibold border-2 transition-colors ${model === m.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Parte */}
          <Section icon={Box} title="Pintar parte">
            <div className="flex gap-2">
              <PartBtn active={activePart === 'body'} onClick={() => setActivePart('body')} color={bodyColor} label="Corpo" />
              {hasCap && <PartBtn active={activePart === 'cap'} onClick={() => setActivePart('cap')} color={capColor} label="Tampa" />}
            </div>
          </Section>

          {/* Cores */}
          <Section icon={Sparkles} title={`Cor — ${activePart === 'cap' ? 'Tampa' : 'Corpo'}`}>
            <div className="grid grid-cols-8 gap-1.5">
              {PALETTE.map(([name, hex]) => (
                <button key={hex} title={name} onClick={() => pickColor(hex)}
                  className={`w-full aspect-square rounded-lg transition-transform hover:scale-110 ${activeColor.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
                  style={{ background: hex, border: '1px solid rgba(0,0,0,.1)' }} />
              ))}
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
              Personalizada
              <input type="color" value={activeColor} onChange={e => pickColor(e.target.value)}
                className="w-9 h-9 rounded cursor-pointer border border-gray-200" />
              <span className="font-mono text-xs text-gray-400">{activeColor}</span>
            </label>
          </Section>

          {/* Acabamento (corpo) */}
          <Section icon={Sparkles} title="Acabamento do corpo">
            <div className="grid grid-cols-2 gap-2">
              {FINISHES.map(f => (
                <button key={f.key} onClick={() => setFinish(f.key)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${finish === f.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          {/* Logo/Texto */}
          <Section icon={Type} title="Logo / Texto (frente)">
            <input className="input" placeholder="Sua marca..." maxLength={24}
              value={logo} onChange={e => setLogo(e.target.value)} />
            <p className="text-xs text-gray-400 mt-1">Aparece estampado na frente do produto.</p>
          </Section>

          {/* Ações */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button onClick={reset} className="btn-secondary"><RefreshCw size={14} /> Resetar</button>
            <button onClick={download} className="btn-secondary"><Download size={14} /> Baixar PNG</button>
            <button onClick={() => setSaveOpen(true)} className="btn-primary col-span-2"><Save size={15} /> Salvar personalização</button>
          </div>
        </div>
      </div>

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title="Salvar personalização" size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
            Modelo <strong>{MODELS.find(m => m.key === model)?.label}</strong> · corpo {bodyColor}
            {hasCap ? ` · tampa ${capColor}` : ''} · {FINISHES.find(f => f.key === finish)?.label}
          </div>
          <div>
            <label className="label">Nome do design *</label>
            <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex.: Shaker Academia X" autoFocus />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setSaveOpen(false)} className="btn-secondary flex-1">Cancelar</button>
            <button onClick={save} disabled={saving} className="btn-primary flex-1">{saving ? 'Salvando...' : 'Salvar'}</button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5">
        <Icon size={13} /> {title}
      </p>
      {children}
    </div>
  );
}

function PartBtn({ active, onClick, color, label }) {
  return (
    <button onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${active ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
      <span className="w-4 h-4 rounded-full" style={{ background: color, border: '1px solid rgba(0,0,0,.15)' }} />
      {label}
    </button>
  );
}
