import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  Box, Rotate3d, Layers, Sparkles, Wand2, Image as ImageIcon, Type, X, ArrowLeftRight,
} from 'lucide-react';
import {
  PALETTE, MODELS, FINISHES, PRESETS, BACKGROUNDS, FONTS,
  buildModel, bodyMaterial, capMaterial, composeBodyTexture, disposeObject,
} from '../pages/Studio/scene';

const uid = () => Math.random().toString(36).slice(2, 9);

function downscaleImage(dataUrl, max = 512) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.width, img.height));
      if (s >= 1) return resolve(dataUrl);
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
    };
    img.src = dataUrl;
  });
}

const DEFAULT = {
  model: 'shaker', color1: '#1E4FD8', color2: '#0B1B4D', gradient: false,
  finish: 'brilhante', capColor: '#1A1A1A', bg: 'studio', arts: [],
};

export default function Studio3D({ initialDesign, saved, onPickSaved, actions, aiSuggest }) {
  const mountRef = useRef(null);
  const three = useRef({});
  const cfg = useRef({});
  const artImages = useRef({});
  const fileRef = useRef(null);
  const designRef = useRef({});

  const seed = { ...DEFAULT, ...(normalizeDesign(initialDesign) || {}) };
  const [model, setModel]       = useState(seed.model);
  const [color1, setColor1]     = useState(seed.color1);
  const [color2, setColor2]     = useState(seed.color2);
  const [gradient, setGradient] = useState(seed.gradient);
  const [finish, setFinish]     = useState(seed.finish);
  const [capColor, setCapColor] = useState(seed.capColor);
  const [bg, setBg]             = useState(seed.bg);
  const [arts, setArts]         = useState(seed.arts);
  const [selId, setSelId]       = useState(seed.arts[0]?.id || null);
  const [activePart, setActive] = useState('body');
  const [autoRotate, setAuto]   = useState(true);
  const [imgV, setImgV]         = useState(0);
  const [fontV, setFontV]       = useState(0);

  // assistente de IA (sugestão de cores/acabamento)
  const [aiBrief, setAiBrief]   = useState('');
  const [aiBusy, setAiBusy]     = useState(false);
  const [aiErr, setAiErr]       = useState('');
  const [aiOut, setAiOut]       = useState(null);

  cfg.current = { color1, color2, gradient, finish, capColor };
  designRef.current = { model, color1, color2, gradient, finish, capColor, bg,
    arts: arts.map(({ _img, ...a }) => a) };

  const modelDef = MODELS.find(m => m.key === model);
  const hasCap = !modelDef?.noCap;
  const selArt = arts.find(a => a.id === selId) || null;

  // carrega imagens das artes que ainda não têm Image
  useEffect(() => {
    let bump = false;
    arts.forEach(a => {
      if (a.kind === 'image' && a.image && !artImages.current[a.id]) {
        const im = new Image();
        im.onload = () => { artImages.current[a.id] = im; setImgV(v => v + 1); };
        im.src = a.image;
        bump = true;
      }
    });
    if (bump) {/* aguarda onload */}
  }, [arts]);

  // garante fontes carregadas
  useEffect(() => {
    const fonts = [...new Set(arts.filter(a => a.kind === 'text').map(a => a.font || 'Inter'))];
    if (!fonts.length || !document.fonts) return;
    Promise.all(fonts.map(f => document.fonts.load(`700 150px "${f}"`).catch(() => {})))
      .then(() => setFontV(v => v + 1));
  }, [arts]);

  const applyBody = useCallback(() => {
    const m = three.current.model; if (!m) return;
    const C = cfg.current;
    const def = MODELS.find(x => x.key === designRef.current.model);
    const artsTex = designRef.current.arts.map(a => a.kind === 'image' ? { ...a, _img: artImages.current[a.id] } : a);
    const tex = composeBodyTexture({ color1: C.color1, color2: C.gradient ? C.color2 : C.color1, gradient: C.gradient, arts: artsTex, pattern: def?.pattern });
    m.userData.bodyMeshes.forEach((mesh, i) => {
      const old = mesh.material;
      mesh.material = i === 0 ? bodyMaterial(C.finish, { map: tex }) : bodyMaterial(C.finish, { color: C.color1 });
      if (old) { if (old.map) old.map.dispose(); old.dispose(); }
    });
  }, []);
  const applyCap = useCallback(() => {
    const m = three.current.model; if (!m) return;
    m.userData.capMeshes.forEach(mesh => { const old = mesh.material; mesh.material = capMaterial(cfg.current.capColor); old?.dispose(); });
  }, []);

  // init three
  useEffect(() => {
    const mount = mountRef.current;
    const w = mount.clientWidth, h = mount.clientHeight || 460;
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
    controls.target.set(0, 0.1, 0); controls.maxPolarAngle = Math.PI * 0.88;
    controls.autoRotate = true; controls.autoRotateSpeed = 1.3;

    scene.add(new THREE.HemisphereLight(0xffffff, 0x404a5a, 0.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.near = 1; key.shadow.camera.far = 22;
    key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
    key.shadow.bias = -0.0003; key.shadow.radius = 4; scene.add(key);
    const rim = new THREE.DirectionalLight(0xffffff, 0.6); rim.position.set(-3, 3, -5); scene.add(rim);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(8, 64), new THREE.ShadowMaterial({ opacity: 0.24 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -1.62; ground.receiveShadow = true; scene.add(ground);

    three.current = { renderer, scene, camera, controls, mount, model: null, pmrem };
    const ro = new ResizeObserver(() => {
      const W = mount.clientWidth, H = mount.clientHeight || 460;
      camera.aspect = W / H; camera.updateProjectionMatrix(); renderer.setSize(W, H);
    });
    ro.observe(mount);
    const loop = () => { three.current.raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); };
    loop();
    if (document.fonts?.ready) document.fonts.ready.then(() => setFontV(v => v + 1));

    return () => {
      cancelAnimationFrame(three.current.raf); ro.disconnect(); controls.dispose();
      if (three.current.model) { scene.remove(three.current.model); disposeObject(three.current.model); }
      ground.geometry.dispose(); ground.material.dispose();
      envTex.dispose(); pmrem.dispose(); renderer.dispose();
      if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement);
    };
  }, []);

  // rebuild ao trocar modelo
  useEffect(() => {
    const t = three.current; if (!t.scene) return;
    if (t.model) { t.scene.remove(t.model); disposeObject(t.model); }
    t.model = buildModel(model); t.scene.add(t.model);
    applyBody(); applyCap();
    if (!t.model.userData.capMeshes.length && activePart === 'cap') setActive('body');
  }, [model, applyBody, applyCap]);

  // acabamento padrão por modelo (ex.: caneca de alumínio = metálico)
  useEffect(() => {
    const d = MODELS.find(m => m.key === model);
    if (d?.defaultFinish) setFinish(d.defaultFinish);
  }, [model]);

  useEffect(() => { applyBody(); }, [color1, color2, gradient, finish, arts, imgV, fontV, applyBody]);
  useEffect(() => { applyCap(); }, [capColor, applyCap]);
  useEffect(() => { if (three.current.controls) three.current.controls.autoRotate = autoRotate; }, [autoRotate]);

  // carregar design externo (reabrir salvo)
  useEffect(() => {
    const d = normalizeDesign(initialDesign);
    if (!d) return;
    artImages.current = {};
    setModel(d.model); setColor1(d.color1); setColor2(d.color2); setGradient(d.gradient);
    setFinish(d.finish); setCapColor(d.capColor); setBg(d.bg); setArts(d.arts);
    setSelId(d.arts[0]?.id || null);
    setImgV(v => v + 1);
  }, [initialDesign]);

  // ── helpers expostos para os botões de ação ──
  const getDesign = useCallback(() => designRef.current, []);
  const getThumb = useCallback(() => {
    const t = three.current; t.renderer.render(t.scene, t.camera);
    const src = t.renderer.domElement, W = 360, H = Math.round(W * src.height / src.width);
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d'); ctx.fillStyle = '#eef1f5'; ctx.fillRect(0, 0, W, H); ctx.drawImage(src, 0, 0, W, H);
    return c.toDataURL('image/jpeg', 0.72);
  }, []);
  const getPNG = useCallback(() => {
    const t = three.current, mount = t.mount, cw = mount.clientWidth, ch = mount.clientHeight || 460;
    t.renderer.setSize(cw * 2, ch * 2, false); t.renderer.render(t.scene, t.camera);
    const url = t.renderer.domElement.toDataURL('image/png'); t.renderer.setSize(cw, ch, false);
    return url;
  }, []);

  // ── ações de UI ──
  function pickColor(hex) {
    if (activePart === 'cap') setCapColor(hex);
    else if (activePart === 'body2') setColor2(hex);
    else setColor1(hex);
  }
  const activeColor = activePart === 'cap' ? capColor : activePart === 'body2' ? color2 : color1;

  function patchArt(id, p) { setArts(a => a.map(x => x.id === id ? { ...x, ...p } : x)); }
  function addText() {
    const it = { id: uid(), kind: 'text', text: 'SUA MARCA', font: 'Bebas Neue', color: '#ffffff', x: 0.25, y: 0.55, scale: 1, rot: 0 };
    setArts(a => [...a, it]); setSelId(it.id);
  }
  async function addImageFile(e) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    const reader = new FileReader();
    reader.onload = async ev => {
      const small = await downscaleImage(ev.target.result, 512);
      const it = { id: uid(), kind: 'image', image: small, x: 0.25, y: 0.55, scale: 0.7, rot: 0 };
      setArts(a => [...a, it]); setSelId(it.id);
    };
    reader.readAsDataURL(file);
  }
  function removeArt(id) { delete artImages.current[id]; setArts(a => a.filter(x => x.id !== id)); if (selId === id) setSelId(null); }
  function applyPreset(p) { setColor1(p.c1); setColor2(p.c2); setGradient(p.grad); setFinish(p.finish); }

  const FINISH_KEYS = ['opaco', 'brilhante', 'metalico', 'translucido'];
  function applyPalette(p, fin) {
    if (p?.color1) setColor1(p.color1);
    if (p?.color2) setColor2(p.color2);
    setGradient(!!p?.gradient && !!p?.color2);
    if (fin && FINISH_KEYS.includes(fin)) setFinish(fin);
  }
  async function runAi() {
    const brief = aiBrief.trim();
    if (!brief || aiBusy || !aiSuggest) return;
    setAiBusy(true); setAiErr(''); setAiOut(null);
    try {
      const out = await aiSuggest(brief);
      const palettes = Array.isArray(out?.palettes) ? out.palettes.filter(p => p && p.color1) : [];
      setAiOut({ palettes, finish: out?.finish, idea: out?.idea });
      if (palettes[0]) applyPalette(palettes[0], out?.finish);
    } catch (e) {
      setAiErr(e?.error || e?.response?.data?.error || 'IA não configurada. Defina ANTHROPIC_API_KEY no servidor.');
    } finally { setAiBusy(false); }
  }

  return (
    <div className="grid lg:grid-cols-[1fr_340px] gap-4">
      {/* Viewport */}
      <div className="relative rounded-2xl overflow-hidden border border-gray-200" style={{ background: BACKGROUNDS[bg] }}>
        <div ref={mountRef} style={{ width: '100%', height: '72vh', minHeight: 440 }} />
        <div className="absolute top-3 left-3 flex gap-2">
          <button onClick={() => setAuto(v => !v)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg backdrop-blur transition-colors ${autoRotate ? 'bg-violet-600 text-white' : 'bg-white/80 text-gray-700'}`}>
            <Rotate3d size={14} /> {autoRotate ? 'Girando' : 'Girar'}
          </button>
          <div className="flex gap-1 bg-white/80 backdrop-blur rounded-lg p-1">
            {Object.keys(BACKGROUNDS).map(k => (
              <button key={k} onClick={() => setBg(k)} className={`w-6 h-6 rounded ${bg === k ? 'ring-2 ring-violet-500' : ''}`} style={{ background: BACKGROUNDS[k] }} />
            ))}
          </div>
        </div>
        <p className="absolute bottom-3 left-3 text-xs text-gray-500 bg-white/70 backdrop-blur px-2 py-1 rounded">Arraste para girar · scroll p/ zoom</p>
      </div>

      {/* Painel */}
      <div className="space-y-3 max-h-[80vh] overflow-y-auto pr-1">
        {saved?.length > 0 && (
          <Sec icon={Layers} title="Designs salvos">
            <div className="grid grid-cols-3 gap-2">
              {saved.slice(0, 9).map(s => (
                <button key={s.id} onClick={() => onPickSaved?.(s)} title={s.title}
                  className="rounded-lg border border-gray-200 overflow-hidden hover:border-violet-400 transition-colors">
                  {s.preview_url ? <img src={s.preview_url} alt="" className="w-full aspect-square object-cover" /> : <div className="w-full aspect-square bg-gray-100" />}
                </button>
              ))}
            </div>
          </Sec>
        )}

        {aiSuggest && (
          <Sec icon={Sparkles} title="Sugerir com IA">
            <p className="text-xs text-gray-400 mb-2">Descreva a marca ou o evento e a IA sugere cores e acabamento.</p>
            <textarea className="input text-sm" rows={2} value={aiBrief} maxLength={200}
              onChange={e => setAiBrief(e.target.value)}
              placeholder="Ex.: academia jovem, energia, preto e laranja" />
            <button onClick={runAi} disabled={aiBusy || !aiBrief.trim()}
              className="btn-primary w-full mt-2 text-sm disabled:opacity-50">
              <Wand2 size={14} /> {aiBusy ? 'Pensando...' : 'Gerar sugestão'}
            </button>
            {aiErr && <p className="text-xs text-red-500 mt-2">{aiErr}</p>}
            {aiOut?.palettes?.length > 0 && (
              <div className="mt-3 space-y-2">
                {aiOut.idea && <p className="text-xs text-gray-600 italic">💡 {aiOut.idea}</p>}
                <div className="space-y-1.5">
                  {aiOut.palettes.map((p, i) => (
                    <button key={i} onClick={() => applyPalette(p, aiOut.finish)}
                      className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-200 hover:border-violet-400 transition-colors text-left">
                      <span className="w-7 h-7 rounded-md shrink-0" style={{ background: p.gradient && p.color2 ? `linear-gradient(135deg,${p.color1},${p.color2})` : p.color1, border: '1px solid rgba(0,0,0,.12)' }} />
                      <span className="text-xs font-medium flex-1 truncate">{p.name || `Paleta ${i + 1}`}</span>
                      <span className="text-[10px] text-gray-400">aplicar</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </Sec>
        )}

        <Sec icon={Layers} title="Modelo">
          <div className="grid grid-cols-2 gap-2">
            {MODELS.map(m => (
              <button key={m.key} onClick={() => setModel(m.key)}
                className={`px-2 py-2 rounded-xl text-xs font-semibold border-2 transition-colors ${model === m.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>{m.label}</button>
            ))}
          </div>
        </Sec>

        <Sec icon={Box} title="Pintar">
          <div className="flex gap-2 flex-wrap">
            <PartBtn active={activePart === 'body'} onClick={() => setActive('body')} color={color1} label="Corpo" />
            {gradient && <PartBtn active={activePart === 'body2'} onClick={() => setActive('body2')} color={color2} label="Cor 2" />}
            {hasCap && <PartBtn active={activePart === 'cap'} onClick={() => setActive('cap')} color={capColor} label="Tampa" />}
          </div>
          <label className="flex items-center gap-2 mt-3 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={gradient} onChange={e => { setGradient(e.target.checked); if (!e.target.checked && activePart === 'body2') setActive('body'); }} className="w-4 h-4 accent-violet-600" />
            Degradê (2 cores)
          </label>
        </Sec>

        <Sec icon={Sparkles} title={`Cor — ${activePart === 'cap' ? 'Tampa' : activePart === 'body2' ? 'Cor 2' : 'Corpo'}`}>
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
        </Sec>

        <Sec icon={Wand2} title="Acabamento">
          <div className="grid grid-cols-2 gap-2">
            {FINISHES.map(f => (
              <button key={f.key} onClick={() => setFinish(f.key)}
                className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${finish === f.key ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>{f.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5 flex-wrap mt-3">
            {PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} className="text-xs font-medium px-2.5 py-1 rounded-lg border border-gray-200 hover:bg-violet-50 hover:border-violet-300 flex items-center gap-1">
                <span className="w-3 h-3 rounded-full" style={{ background: `linear-gradient(135deg,${p.c1},${p.c2})` }} />{p.label}
              </button>
            ))}
          </div>
        </Sec>

        {/* Artes */}
        <Sec icon={ImageIcon} title="Artes (frente / verso)">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={addImageFile} />
          <div className="flex gap-2 mb-2">
            <button onClick={addText} className="btn-secondary flex-1 text-xs"><Type size={13} /> Texto</button>
            <button onClick={() => fileRef.current?.click()} className="btn-secondary flex-1 text-xs"><ImageIcon size={13} /> Logo</button>
          </div>
          {arts.length === 0 && <p className="text-xs text-gray-400">Adicione textos e logos. Cada arte pode ir na frente ou no verso.</p>}
          <div className="space-y-1.5">
            {arts.map(a => (
              <div key={a.id} onClick={() => setSelId(a.id)}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border cursor-pointer ${selId === a.id ? 'border-violet-400 bg-violet-50' : 'border-gray-200'}`}>
                {a.kind === 'image' ? <img src={a.image} alt="" className="w-6 h-6 object-contain bg-white rounded" /> : <Type size={14} className="text-gray-500" />}
                <span className="text-xs flex-1 truncate">{a.kind === 'image' ? 'Logo' : (a.text || 'Texto')}</span>
                <span className="text-[10px] text-gray-400">{a.x < 0.5 ? 'frente' : 'verso'}</span>
                <button onClick={e => { e.stopPropagation(); removeArt(a.id); }} className="text-gray-300 hover:text-red-500"><X size={13} /></button>
              </div>
            ))}
          </div>

          {selArt && (
            <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
              {selArt.kind === 'text' && (
                <>
                  <input className="input" value={selArt.text} maxLength={30} onChange={e => patchArt(selArt.id, { text: e.target.value })} placeholder="Texto" />
                  <div className="flex gap-2">
                    <select className="input flex-1" value={selArt.font} onChange={e => patchArt(selArt.id, { font: e.target.value })} style={{ fontFamily: selArt.font }}>
                      {FONTS.map(f => <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label}</option>)}
                    </select>
                    <input type="color" value={selArt.color} onChange={e => patchArt(selArt.id, { color: e.target.value })} className="w-10 h-9 rounded border border-gray-200" />
                  </div>
                </>
              )}
              <button onClick={() => patchArt(selArt.id, { x: selArt.x < 0.5 ? 0.75 : 0.25 })}
                className="btn-secondary w-full text-xs"><ArrowLeftRight size={12} /> Mover p/ {selArt.x < 0.5 ? 'verso' : 'frente'}</button>
              <Slider label="◀ ▶" min={0} max={1} step={0.01} value={selArt.x} onChange={v => patchArt(selArt.id, { x: v })} />
              <Slider label="▲ ▼" min={0} max={1} step={0.01} value={selArt.y} onChange={v => patchArt(selArt.id, { y: v })} />
              <Slider label="Tam." min={0.2} max={2} step={0.05} value={selArt.scale} onChange={v => patchArt(selArt.id, { scale: v })} />
              <Slider label="Giro" min={-45} max={45} step={1} value={selArt.rot} onChange={v => patchArt(selArt.id, { rot: v })} />
            </div>
          )}
        </Sec>

        <div className="pb-4">{actions?.({ getDesign, getThumb, getPNG })}</div>
      </div>
    </div>
  );
}

// converte design salvo (novo ou legado) para o formato com `arts`
function normalizeDesign(d) {
  if (!d) return null;
  const base = { model: d.model || 'shaker', color1: d.color1 || '#1E4FD8', color2: d.color2 || '#0B1B4D',
    gradient: !!d.gradient, finish: d.finish || 'brilhante', capColor: d.capColor || '#1A1A1A', bg: d.bg || 'studio' };
  let arts = Array.isArray(d.arts) ? d.arts.map(a => ({ id: a.id || uid(), ...a })) : [];
  if (!arts.length && (d.logoDataUrl || d.text)) {
    if (d.logoDataUrl) arts.push({ id: uid(), kind: 'image', image: d.logoDataUrl, x: d.logoX ?? 0.5, y: d.logoY ?? 0.55, scale: d.logoScale ?? 0.7, rot: d.logoRot ?? 0 });
    if (d.text) arts.push({ id: uid(), kind: 'text', text: d.text, font: 'Bebas Neue', color: '#ffffff', x: d.logoX ?? 0.5, y: (d.logoY ?? 0.55) - (d.logoDataUrl ? 0.18 : 0), scale: d.logoScale ?? 1, rot: d.logoRot ?? 0 });
  }
  return { ...base, arts };
}

function Sec({ icon: Icon, title, children }) {
  return <div className="card p-4"><p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2.5 flex items-center gap-1.5"><Icon size={13} /> {title}</p>{children}</div>;
}
function PartBtn({ active, onClick, color, label }) {
  return <button onClick={onClick} className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${active ? 'border-violet-500 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}><span className="w-4 h-4 rounded-full" style={{ background: color, border: '1px solid rgba(0,0,0,.15)' }} /> {label}</button>;
}
function Slider({ label, value, onChange, min, max, step }) {
  return <div className="flex items-center gap-2"><span className="text-xs text-gray-500 w-12">{label}</span><input type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(parseFloat(e.target.value))} className="flex-1 accent-violet-600" /></div>;
}
