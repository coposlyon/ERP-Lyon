import { useState, useRef, useEffect } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Box, Rotate3d, Download, Save, RefreshCw, Sparkles, Layers,
  Image as ImageIcon, X, Wand2,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import {
  PALETTE, MODELS, FINISHES, PRESETS, BACKGROUNDS,
  buildModel, bodyMaterial, capMaterial, composeBodyTexture, disposeObject,
} from './scene';

export default function CustomizationStudio() {
  const mountRef = useRef(null);
  const three = useRef({});
  const cfg = useRef({});
  const logoImg = useRef(null);
  const fileRef = useRef(null);

  const [model, setModel]       = useState('shaker');
  const [color1, setColor1]     = useState('#1E4FD8');
  const [color2, setColor2]     = useState('#0B1B4D');
  const [gradient, setGradient] = useState(false);
  const [finish, setFinish]     = useState('brilhante');
  const [capColor, setCapColor] = useState('#1A1A1A');
  const [activePart, setActivePart] = useState('body');
  const [text, setText]         = useState('');
  const [logoName, setLogoName] = useState('');
  const [logoDataUrl, setLogoDataUrl] = useState('');
  const [logoX, setLogoX]       = useState(0.5);
  const [logoY, setLogoY]       = useState(0.55);
  const [logoScale, setLogoScale] = useState(1);
  const [logoRot, setLogoRot]   = useState(0);
  const [logoV, setLogoV]       = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [bg, setBg]             = useState('studio');
  const [saveOpen, setSaveOpen] = useState(false);
  const [title, setTitle]       = useState('');
  const [saving, setSaving]     = useState(false);

  cfg.current = { color1, color2, gradient, finish, capColor, text, logoX, logoY, logoScale, logoRot };

  const modelDef = MODELS.find(m => m.key === model);
  const hasCap = !modelDef?.noCap;

  const applyBody = () => {
    const m = three.current.model; if (!m) return;
    const C = cfg.current;
    const tex = composeBodyTexture({
      color1: C.color1, color2: C.gradient ? C.color2 : C.color1, gradient: C.gradient,
      image: logoImg.current, text: C.text,
      logoX: C.logoX, logoY: C.logoY, logoScale: C.logoScale, logoRot: C.logoRot,
    });
    m.userData.bodyMeshes.forEach((mesh, i) => {
      const old = mesh.material;
      mesh.material = i === 0
        ? bodyMaterial(C.finish, { map: tex })
        : bodyMaterial(C.finish, { color: C.color1 });
      if (old) { if (old.map) old.map.dispose(); old.dispose(); }
    });
  };
  const applyCap = () => {
    const m = three.current.model; if (!m) return;
    m.userData.capMeshes.forEach(mesh => { const old = mesh.material; mesh.material = capMaterial(cfg.current.capColor); old?.dispose(); });
  };

  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight || 480;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;

    const camera = new THREE.PerspectiveCamera(38, w / h, 0.1, 100);
    camera.position.set(0, 0.6, 6.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; controls.dampingFactor = 0.08;
    controls.minDistance = 3.2; controls.maxDistance = 12;
    controls.target.set(0, 0.1, 0);
    controls.maxPolarAngle = Math.PI * 0.88;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.3;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x404a5a, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 22;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0003; key.shadow.radius = 4;
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-3, 3, -5); scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.ShadowMaterial({ opacity: 0.24 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.62; ground.receiveShadow = true;
    scene.add(ground);

    three.current = { renderer, scene, camera, controls, mount, model: null, pmrem };

    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight || 480;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    });
    ro.observe(mount);

    const loop = () => { three.current.raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();

    return () => {
      cancelAnimationFrame(three.current.raf);
      ro.disconnect(); controls.dispose();
      if (three.current.model) { scene.remove(three.current.model); disposeObject(three.current.model); }
      ground.geometry.dispose(); ground.material.dispose();
      envTex.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  useEffect(() => {
    const t = three.current; if (!t.scene) return;
    if (t.model) { t.scene.remove(t.model); disposeObject(t.model); }
    t.model = buildModel(model);
    t.scene.add(t.model);
    applyBody(); applyCap();
    if (!t.model.userData.capMeshes.length && activePart === 'cap') setActivePart('body');
  }, [model]);

  useEffect(() => { applyBody(); }, [color1, color2, gradient, finish, text, logoX, logoY, logoScale, logoRot, logoV]);
  useEffect(() => { applyCap(); }, [capColor]);
  useEffect(() => { if (three.current.controls) three.current.controls.autoRotate = autoRotate; }, [autoRotate]);

  function pickColor(hex) {
    if (activePart === 'cap') setCapColor(hex);
    else if (activePart === 'body2') setColor2(hex);
    else setColor1(hex);
  }
  const activeColor = activePart === 'cap' ? capColor : activePart === 'body2' ? color2 : color1;

  function onLogoFile(e) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => { logoImg.current = img; setLogoDataUrl(ev.target.result); setLogoName(file.name); setLogoV(v => v + 1); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }
  function removeLogo() { logoImg.current = null; setLogoDataUrl(''); setLogoName(''); setLogoV(v => v + 1); }

  function applyPreset(p) { setColor1(p.c1); setColor2(p.c2); setGradient(p.grad); setFinish(p.finish); }

  function downloadPNG() {
    const t = three.current;
    const mount = t.mount, cw = mount.clientWidth, ch = mount.clientHeight || 480;
    t.renderer.setSize(cw * 2, ch * 2, false);
    t.renderer.render(t.scene, t.camera);
    const url = t.renderer.domElement.toDataURL('image/png');
    t.renderer.setSize(cw, ch, false);
    Object.assign(document.createElement('a'), { href: url, download: `personalizacao-${model}.png` }).click();
  }
  function thumbnail() {
    const t = three.current; t.renderer.render(t.scene, t.camera);
    const src = t.renderer.domElement;
    const W = 360, H = Math.round(W * src.height / src.width);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, W, H); ctx.drawImage(src, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.72);
  }
  function reset() {
    setModel('shaker'); setColor1('#1E4FD8'); setColor2('#0B1B4D'); setGradient(false);
    setFinish('brilhante'); setCapColor('#1A1A1A'); setText(''); removeLogo();
    setLogoX(0.5); setLogoY(0.55); setLogoScale(1); setLogoRot(0); setActivePart('body');
  }
  async function save() {
    if (!title.trim()) { toast.error('Dê um nome ao design'); return; }
    setSaving(true);
    try {
      await api.post('/customizations', {
        title: title.trim(),
        design_3d: { model, color1, color2, gradient, finish, capColor, text, logoDataUrl, logoX, logoY, logoScale, logoRot, bg },
        preview_url: thumbnail(),
      });
      toast.success('Personalização salva! Aparece no quadro de Personalização.');
      setSaveOpen(false); setTitle('');
    } catch (e) { toast.error(e.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center"><Box size={18} className="text-violet-600" /></div>
          <div>
            <h1 className="page-title">Estúdio 3D de Personalização</h1>
            <p className="text-sm text-gray-500 mt-0.5">{modelDef?.label} · {modelDef?.spec}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {PRESETS.map(p => (
            <button key={p.label} onClick={() => applyPreset(p)} title={`Tema ${p.label}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-gray-200 hover:border-violet-300 hover:bg-violet-50 transition-colors flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full" style={{ background: `linear-gradient(135deg, ${p.c1}, ${p.c2})` }} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_340px] gap-4">
        {/* Viewport */}
        <div className="relative rounded-2xl overflow-hidden border border-gray-200" style={{ background: BACKGROUNDS[bg] }}>
          <div ref={mountRef} style={{ width: '100%', height: '74vh', minHeight: 460 }} />
          <div className="absolute top-3 left-3 flex gap-2">
            <button onClick={() => setAutoRotate(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur transition-colors ${autoRotate ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-700'}`}>
              <Rotate3d size={14} /> {autoRotate ? 'Girando' : 'Girar'}
            </button>
            <div className="flex gap-1 bg-white/80 backdrop-blur rounded-lg p-1">
              {Object.keys(BACKGROUNDS).map(k => (
                <button key={k} onClick={() => setBg(k)} title={k}
                  className={`w-6 h-6 rounded ${bg === k ? 'ring-2 ring-violet-500' : ''}`}
                  style={{ background: BACKGROUNDS[k] }} />
              ))}
            </div>
          </div>
          <p className="absolute bottom-3 left-3 text-xs text-gray-500 bg-white/70 backdrop-blur px-2 py-1 rounded">Arraste para girar · scroll para zoom</p>
        </div>

        {/* Painel */}
        <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-1">
          <Section icon={Layers} title="Modelo">
            <div className="grid grid-cols-2 gap-2">
              {MODELS.map(m => (
                <button key={m.key} onClick={() => setModel(m.key)}
                  className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${model === m.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {m.label}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={Box} title="Pintar">
            <div className="flex gap-2 flex-wrap">
              <PartBtn active={activePart === 'body'} onClick={() => setActivePart('body')} color={color1} label="Corpo" />
              {gradient && <PartBtn active={activePart === 'body2'} onClick={() => setActivePart('body2')} color={color2} label="Cor 2" />}
              {hasCap && <PartBtn active={activePart === 'cap'} onClick={() => setActivePart('cap')} color={capColor} label="Tampa" />}
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={gradient} onChange={e => { setGradient(e.target.checked); if (!e.target.checked && activePart === 'body2') setActivePart('body'); }} className="w-4 h-4 accent-violet-600" />
              Degradê (2 cores no corpo)
            </label>
          </Section>

          <Section icon={Sparkles} title={`Cor — ${activePart === 'cap' ? 'Tampa' : activePart === 'body2' ? 'Cor 2' : 'Corpo'}`}>
            <div className="grid grid-cols-10 gap-1.5">
              {PALETTE.map(([name, hex]) => (
                <button key={hex} title={name} onClick={() => pickColor(hex)}
                  className={`w-full aspect-square rounded-md transition-transform hover:scale-110 ${activeColor.toLowerCase() === hex.toLowerCase() ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
                  style={{ background: hex, border: '1px solid rgba(0,0,0,.12)' }} />
              ))}
            </div>
            <label className="flex items-center gap-2 mt-3 text-sm text-gray-600">
              Personalizada
              <input type="color" value={activeColor} onChange={e => pickColor(e.target.value)} className="w-9 h-9 rounded cursor-pointer border border-gray-200" />
              <span className="font-mono text-xs text-gray-400">{activeColor}</span>
            </label>
          </Section>

          <Section icon={Wand2} title="Acabamento do corpo">
            <div className="grid grid-cols-2 gap-2">
              {FINISHES.map(f => (
                <button key={f.key} onClick={() => setFinish(f.key)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${finish === f.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                  {f.label}
                </button>
              ))}
            </div>
          </Section>

          <Section icon={ImageIcon} title="Logo / Arte">
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onLogoFile} />
            {logoDataUrl ? (
              <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-2">
                <img src={logoDataUrl} alt="" className="w-10 h-10 object-contain bg-white rounded border border-gray-200" />
                <span className="text-xs text-gray-500 flex-1 truncate">{logoName}</span>
                <button onClick={removeLogo} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="btn-secondary w-full"><ImageIcon size={14} /> Enviar logo (PNG)</button>
            )}
            <label className="label text-xs mt-3">Texto</label>
            <input className="input" placeholder="Sua marca..." maxLength={28} value={text} onChange={e => setText(e.target.value)} />

            {(logoDataUrl || text) && (
              <div className="mt-3 space-y-2">
                <Slider label="Horizontal" min={0} max={1} step={0.01} value={logoX} onChange={setLogoX} />
                <Slider label="Vertical" min={0} max={1} step={0.01} value={logoY} onChange={setLogoY} />
                <Slider label="Tamanho" min={0.3} max={2} step={0.05} value={logoScale} onChange={setLogoScale} />
                <Slider label="Rotação" min={-45} max={45} step={1} value={logoRot} onChange={setLogoRot} />
              </div>
            )}
          </Section>

          <div className="grid grid-cols-2 gap-2 pt-1 pb-4">
            <button onClick={reset} className="btn-secondary"><RefreshCw size={14} /> Resetar</button>
            <button onClick={downloadPNG} className="btn-secondary"><Download size={14} /> Baixar PNG</button>
            <button onClick={() => setSaveOpen(true)} className="btn-primary col-span-2"><Save size={15} /> Salvar personalização</button>
          </div>
        </div>
      </div>

      <Modal isOpen={saveOpen} onClose={() => setSaveOpen(false)} title="Salvar personalização" size="sm">
        <div className="space-y-4">
          <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-600">
            {modelDef?.label} · corpo {color1}{gradient ? ` → ${color2}` : ''}{hasCap ? ` · tampa ${capColor}` : ''} · {FINISHES.find(f => f.key === finish)?.label}
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
      <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5"><Icon size={13} /> {title}</p>
      {children}
    </div>
  );
}
function PartBtn({ active, onClick, color, label }) {
  return (
    <button onClick={onClick}
      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${active ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
      <span className="w-4 h-4 rounded-full" style={{ background: color, border: '1px solid rgba(0,0,0,.15)' }} /> {label}
    </button>
  );
}
function Slider({ label, value, onChange, min, max, step }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-500 w-16">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e => onChange(parseFloat(e.target.value))} className="flex-1 accent-violet-600" />
    </div>
  );
}
