import { useState, useRef, useEffect, useCallback } from 'react';
import {
  Type, Image as ImageIcon, Palette, Shapes, QrCode, LayoutTemplate,
  Trash2, ChevronUp, ChevronDown, Download, ShoppingCart, RotateCw, Maximize2,
} from 'lucide-react';
import { MODELS, PALETTE, FONTS, composeBodyCanvas } from '@/pages/Studio/scene';

const uid = () => Math.random().toString(36).slice(2, 9);

// Reduz a imagem enviada (evita dataURLs gigantes no design/carrinho)
function downscale(dataUrl, max = 640) {
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

// Carrega um dataURL numa Image (para desenhar no canvas de exportação)
const loadImg = src => new Promise(res => { const i = new Image(); i.onload = () => res(i); i.src = src; });

// Ferramentas da barra lateral (mesma espinha do meucopoeco). As marcadas
// `soon` são as próximas fases — aparecem desabilitadas para dar o mapa visual.
const TOOLS = [
  { key: 'textos',  label: 'Textos',      icon: Type },
  { key: 'uploads', label: 'Uploads',     icon: ImageIcon },
  { key: 'fundo',   label: 'Cor do fundo', icon: Palette },
  { key: 'elementos', label: 'Elementos', icon: Shapes,        soon: true },
  { key: 'qrcode',  label: 'QR Code',     icon: QrCode,        soon: true },
  { key: 'temas',   label: 'Temas',       icon: LayoutTemplate, soon: true },
];

const DEFAULT = { model: 'shaker', color1: '#1E4FD8', color2: '#0B1B4D', gradient: false, finish: 'brilhante', capColor: '#1A1A1A', arts: [] };

// Editor 2D plano (rótulo desenrolado 2:1). Fase 1 da reconstrução do estúdio:
// arrasta texto/imagem no rótulo, fundo sólido/degradê, e exporta o mesmo modelo
// de arte que o 3D usa (composeBodyCanvas), compatível com carrinho e produção.
export default function LabelEditor({ initialDesign, onAddToCart }) {
  const seed = { ...DEFAULT, ...(initialDesign || {}) };
  const [model, setModel] = useState(seed.model);
  const [color1, setColor1] = useState(seed.color1);
  const [color2, setColor2] = useState(seed.color2);
  const [gradient, setGradient] = useState(!!seed.gradient);
  const [arts, setArts] = useState(() => (seed.arts || []).map(a => ({ ...a, id: a.id || uid() })));
  const [selId, setSelId] = useState(null);
  const [tool, setTool] = useState('textos');

  const boxRef = useRef(null);
  const fileRef = useRef(null);
  const [boxW, setBoxW] = useState(640);
  const boxH = boxW / 2;                 // rótulo 2:1 (2048×1024)
  const k = boxW / 2048;                 // fator px por unidade lógica

  useEffect(() => {
    const el = boxRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el); setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const sel = arts.find(a => a.id === selId) || null;
  const patch = (id, up) => setArts(list => list.map(a => a.id === id ? { ...a, ...up } : a));
  const remove = id => { setArts(list => list.filter(a => a.id !== id)); setSelId(s => s === id ? null : s); };
  const move = (id, dir) => setArts(list => {
    const i = list.findIndex(a => a.id === id); if (i < 0) return list;
    const j = i + dir; if (j < 0 || j >= list.length) return list;
    const c = [...list]; [c[i], c[j]] = [c[j], c[i]]; return c;
  });

  function addText() {
    const it = { id: uid(), kind: 'text', text: 'SUA MARCA', font: 'Bebas Neue', color: '#ffffff', x: 0.5, y: 0.5, scale: 1, rot: 0 };
    setArts(a => [...a, it]); setSelId(it.id); setTool('textos');
  }
  async function onFile(e) {
    const file = e.target.files?.[0]; if (!file) return; e.target.value = '';
    const rd = new FileReader();
    rd.onload = async ev => {
      const small = await downscale(ev.target.result, 640);
      const it = { id: uid(), kind: 'image', image: small, x: 0.5, y: 0.5, scale: 0.7, rot: 0 };
      setArts(a => [...a, it]); setSelId(it.id);
    };
    rd.readAsDataURL(file);
  }

  // ── Arrastar: move a arte selecionada em coordenadas normalizadas ──
  const drag = useRef(null);
  const onPointerDown = (e, id) => {
    e.stopPropagation(); setSelId(id);
    const rect = boxRef.current.getBoundingClientRect();
    drag.current = { id, rect };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = e => {
    const d = drag.current; if (!d) return;
    const x = Math.min(1, Math.max(0, (e.clientX - d.rect.left) / d.rect.width));
    const y = Math.min(1, Math.max(0, 1 - (e.clientY - d.rect.top) / d.rect.height));
    patch(d.id, { x, y });
  };
  const onPointerUp = () => { drag.current = null; };

  // ── Exportar: design (sem _img) + PNG achatado ──
  const buildDesign = () => ({
    model, color1, color2: gradient ? color2 : color1, gradient,
    finish: seed.finish, capColor: seed.capColor,
    arts: arts.map(({ _img, ...a }) => a),
  });
  async function flatten() {
    const artsTex = await Promise.all(arts.map(async a =>
      a.kind === 'image' && a.image ? { ...a, _img: await loadImg(a.image) } : a));
    const def = MODELS.find(m => m.key === model);
    return composeBodyCanvas({ color1, color2: gradient ? color2 : color1, gradient, arts: artsTex, pattern: def?.pattern }, 2);
  }
  async function download() {
    const c = await flatten();
    Object.assign(document.createElement('a'), { href: c.toDataURL('image/png'), download: 'meu-copo.png' }).click();
  }
  async function addCart() {
    const c = await flatten();
    onAddToCart?.({ design: buildDesign(), preview: c.toDataURL('image/png'), model });
  }

  const modelDef = MODELS.find(m => m.key === model) || MODELS[0];

  return (
    <div className="flex flex-col lg:flex-row gap-4">
      {/* ── Barra de ferramentas ── */}
      <div className="flex lg:flex-col gap-1.5 lg:w-24 shrink-0 overflow-x-auto">
        {TOOLS.map(t => {
          const Icon = t.icon; const active = tool === t.key;
          return (
            <button key={t.key} type="button" disabled={t.soon}
              onClick={() => setTool(t.key)}
              className={`flex flex-col items-center justify-center gap-1 rounded-xl px-2 py-2.5 text-[11px] font-semibold shrink-0 transition-colors ${
                active ? 'bg-gray-900 text-white' : t.soon ? 'bg-gray-50 text-gray-300' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}
              title={t.soon ? 'Em breve' : t.label}>
              <Icon size={18} /> {t.label}
              {t.soon && <span className="text-[8px] uppercase tracking-wide text-gray-300">em breve</span>}
            </button>
          );
        })}
      </div>

      {/* ── Painel da ferramenta ── */}
      <div className="lg:w-72 shrink-0 space-y-3">
        {tool === 'textos' && (
          <div className="space-y-3">
            <button onClick={addText} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-colors">
              <Type size={16} /> Adicionar texto
            </button>
            {sel?.kind === 'text' ? (
              <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                <textarea className="input min-h-[56px] resize-y" value={sel.text} maxLength={30}
                  onChange={e => patch(sel.id, { text: e.target.value })} placeholder="Seu texto (até 2 linhas)" />
                <div>
                  <label className="text-xs font-semibold text-gray-500">Fonte</label>
                  <select className="input" value={sel.font} onChange={e => patch(sel.id, { font: e.target.value })}>
                    {FONTS.map(f => <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-gray-500">Cor</label>
                  <input type="color" className="w-9 h-9 rounded-lg border border-gray-200" value={sel.color || '#ffffff'} onChange={e => patch(sel.id, { color: e.target.value })} />
                </div>
                <ArtControls art={sel} patch={patch} />
              </div>
            ) : <p className="text-xs text-gray-400">Adicione um texto ou selecione um já existente para editar.</p>}
          </div>
        )}

        {tool === 'uploads' && (
          <div className="space-y-3">
            <button onClick={() => fileRef.current?.click()} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-colors">
              <ImageIcon size={16} /> Enviar imagem / logo
            </button>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onFile} />
            {sel?.kind === 'image'
              ? <div className="rounded-xl border border-gray-200 p-3"><ArtControls art={sel} patch={patch} /></div>
              : <p className="text-xs text-gray-400">PNG com fundo transparente fica melhor. Depois arraste no rótulo.</p>}
          </div>
        )}

        {tool === 'fundo' && (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-700">
              <input type="checkbox" checked={gradient} onChange={e => setGradient(e.target.checked)} /> Degradê
            </label>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-gray-500 w-16">{gradient ? 'Cor 1' : 'Cor'}</span>
              <input type="color" className="w-9 h-9 rounded-lg border border-gray-200" value={color1} onChange={e => setColor1(e.target.value)} />
            </div>
            {gradient && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500 w-16">Cor 2</span>
                <input type="color" className="w-9 h-9 rounded-lg border border-gray-200" value={color2} onChange={e => setColor2(e.target.value)} />
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 pt-1">
              {PALETTE.map(c => (
                <button key={c} type="button" onClick={() => setColor1(c)} title={c}
                  className="w-6 h-6 rounded-md border border-gray-200" style={{ background: c }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Canvas (rótulo) + camadas + ações ── */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-2">
          <select className="input w-auto text-sm" value={model} onChange={e => setModel(e.target.value)}>
            {MODELS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
          <span className="text-xs text-gray-400">Rótulo · {modelDef.printW}×{modelDef.printH} mm</span>
        </div>

        <div ref={boxRef} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerLeave={onPointerUp}
          onPointerDown={() => setSelId(null)}
          className="relative w-full rounded-xl overflow-hidden border border-gray-200 select-none touch-none"
          style={{ height: boxH, background: gradient ? `linear-gradient(${color1}, ${color2})` : color1 }}>
          {arts.map(a => {
            const left = a.x * boxW, top = (1 - a.y) * boxH;
            const common = {
              position: 'absolute', left, top,
              transform: `translate(-50%,-50%) rotate(${a.rot || 0}deg)`,
              cursor: 'move', outline: a.id === selId ? '2px solid #F26522' : 'none', outlineOffset: 2,
            };
            if (a.kind === 'text') {
              return (
                <div key={a.id} onPointerDown={e => onPointerDown(e, a.id)}
                  style={{ ...common, fontFamily: `"${a.font}", sans-serif`, color: a.color || '#fff',
                    fontSize: 170 * (a.scale || 1) * k, lineHeight: 1.04, textAlign: 'center', whiteSpace: 'pre',
                    textShadow: '0 1px 2px rgba(0,0,0,.25)', fontWeight: 700 }}>
                  {String(a.text || '').slice(0, 30)}
                </div>
              );
            }
            return (
              <img key={a.id} src={a.image} alt="" draggable={false} onPointerDown={e => onPointerDown(e, a.id)}
                style={{ ...common, width: 700 * (a.scale || 1) * k, height: 'auto' }} />
            );
          })}
        </div>

        {/* Camadas */}
        {arts.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {arts.map(a => (
              <div key={a.id} onClick={() => setSelId(a.id)}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-sm cursor-pointer ${a.id === selId ? 'border-orange-300 bg-orange-50' : 'border-gray-200'}`}>
                {a.kind === 'text' ? <Type size={14} className="text-gray-400" /> : <ImageIcon size={14} className="text-gray-400" />}
                <span className="flex-1 truncate text-gray-700">{a.kind === 'text' ? (a.text || 'Texto') : 'Imagem'}</span>
                <button onClick={e => { e.stopPropagation(); move(a.id, +1); }} className="text-gray-400 hover:text-gray-700" title="Trazer para frente"><ChevronUp size={15} /></button>
                <button onClick={e => { e.stopPropagation(); move(a.id, -1); }} className="text-gray-400 hover:text-gray-700" title="Enviar para trás"><ChevronDown size={15} /></button>
                <button onClick={e => { e.stopPropagation(); remove(a.id); }} className="text-gray-300 hover:text-red-500" title="Remover"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-4">
          <button onClick={download} className="btn-secondary"><Download size={14} /> Baixar imagem</button>
          <button onClick={addCart} className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-colors">
            <ShoppingCart size={16} /> Adicionar ao carrinho
          </button>
        </div>
      </div>
    </div>
  );
}

// Tamanho + rotação da arte selecionada (sliders — robusto p/ Fase 1)
function ArtControls({ art, patch }) {
  return (
    <div className="space-y-2 pt-1">
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
        <Maximize2 size={13} /> Tamanho
        <input type="range" min="0.2" max="2.5" step="0.05" value={art.scale || 1}
          onChange={e => patch(art.id, { scale: Number(e.target.value) })} className="flex-1" />
      </label>
      <label className="flex items-center gap-2 text-xs font-semibold text-gray-500">
        <RotateCw size={13} /> Rotação
        <input type="range" min="-180" max="180" step="1" value={art.rot || 0}
          onChange={e => patch(art.id, { rot: Number(e.target.value) })} className="flex-1" />
      </label>
    </div>
  );
}
