import { useState } from 'react';
import {
  Image as ImageIcon, Trash2, Plus, GripVertical, ArrowUp, ArrowDown, Eye, EyeOff,
  Layout, Star, ListChecks, Type, Share2, Upload,
} from 'lucide-react';
import { SITE_ICONS, SITE_ICON_KEYS, siteIcon } from '@/store/siteIcons';
import {
  SITE_DEFAULTS, DEFAULT_HERO_BOTTLES, DEFAULT_MARQUEE, DEFAULT_BENEFITS,
  DEFAULT_PILLARS, DEFAULT_STATS, SECTION_LABELS, resolveSections,
} from '@/store/siteDefaults';
import SocialSettings from './SocialSettings';

// Reduz a imagem (max 900px) e devolve data URL PNG (mantém transparência dos copos).
function resizeToDataUrl(file, max, cb) {
  const img = new Image();
  const rd = new FileReader();
  rd.onload = () => { img.src = rd.result; };
  img.onload = () => {
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    cb(c.toDataURL('image/png'));
  };
  rd.readAsDataURL(file);
}

const SUBS = [
  ['hero', 'Topo (Hero)', Layout],
  ['sections', 'Seções', GripVertical],
  ['lists', 'Blocos', ListChecks],
  ['texts', 'Textos', Type],
  ['social', 'Redes', Share2],
];

// Textos de seções editáveis aqui (hero/botões/benefícios são editados em outras abas)
const TEXT_FIELDS = [
  ['pillars_title', 'Pilares — título'], ['pillars_subtitle', 'Pilares — descrição'],
  ['colors_title', 'Cores — título'], ['colors_subtitle', 'Cores — descrição'],
  ['studio_title', 'Banner 3D — título'], ['studio_subtitle', 'Banner 3D — descrição'],
  ['catalog_badge', 'Catálogo — selo'], ['catalog_title', 'Catálogo — título'],
  ['cta_title', 'CTA final — título'], ['cta_subtitle', 'CTA final — descrição'], ['cta_button', 'CTA final — botão'],
];

export default function SiteEditor({ site = {}, setSite, isAdmin }) {
  const [sub, setSub] = useState('hero');
  const s = site || {};

  // valores efetivos (config OU padrão) só para exibir; só grava ao editar
  const bottles = (Array.isArray(s.hero_bottles) && s.hero_bottles.length) ? s.hero_bottles : DEFAULT_HERO_BOTTLES;
  const benefits = (Array.isArray(s.benefits) && s.benefits.length) ? s.benefits : DEFAULT_BENEFITS;
  const pillars = (Array.isArray(s.pillars) && s.pillars.length) ? s.pillars : DEFAULT_PILLARS;
  const stats = (Array.isArray(s.stats) && s.stats.length) ? s.stats : DEFAULT_STATS;
  const marquee = (Array.isArray(s.marquee) && s.marquee.length) ? s.marquee : DEFAULT_MARQUEE;
  const sections = resolveSections(s.sections);

  const setBottles = (arr) => setSite('hero_bottles', arr);
  const editBottle = (i, val) => setBottles(bottles.map((b, j) => j === i ? val : b));

  const moveSection = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= sections.length) return;
    const arr = [...sections];[arr[i], arr[j]] = [arr[j], arr[i]]; setSite('sections', arr);
  };
  const toggleSection = (i) => setSite('sections', sections.map((x, j) => j === i ? { ...x, visible: !(x.visible !== false) } : x));

  return (
    <div>
      {!isAdmin && <p className="text-sm text-amber-700 bg-amber-50 rounded-lg px-4 py-2 mb-4">Apenas admins podem editar o site.</p>}

      {/* sub-abas do editor */}
      <div className="flex flex-wrap gap-2 mb-5">
        {SUBS.map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setSub(k)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold transition-all ${sub === k ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            <Icon size={15} /> {label}
          </button>
        ))}
      </div>

      {/* ── HERO ── */}
      {sub === 'hero' && (
        <div className="space-y-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="label">Selo do topo</label><input className="input" value={s.hero_badge ?? ''} onChange={e => setSite('hero_badge', e.target.value)} placeholder={SITE_DEFAULTS.hero_badge} disabled={!isAdmin} /></div>
            <div><label className="label">Título principal</label><input className="input" value={s.hero_title ?? ''} onChange={e => setSite('hero_title', e.target.value)} placeholder={SITE_DEFAULTS.hero_title} disabled={!isAdmin} /></div>
            <div className="sm:col-span-2"><label className="label">Subtítulo</label><textarea className="input min-h-[64px] resize-y" value={s.hero_subtitle ?? ''} onChange={e => setSite('hero_subtitle', e.target.value)} placeholder={SITE_DEFAULTS.hero_subtitle} disabled={!isAdmin} /></div>
            <div><label className="label">Botão "Ver catálogo"</label><input className="input" value={s.btn_catalog ?? ''} onChange={e => setSite('btn_catalog', e.target.value)} placeholder={SITE_DEFAULTS.btn_catalog} disabled={!isAdmin} /></div>
            <div><label className="label">Botão "Personalizar 3D"</label><input className="input" value={s.btn_3d ?? ''} onChange={e => setSite('btn_3d', e.target.value)} placeholder={SITE_DEFAULTS.btn_3d} disabled={!isAdmin} /></div>
          </div>

          <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 cursor-pointer w-fit">
            <input type="checkbox" className="rounded" checked={s.show_3d !== false} onChange={e => setSite('show_3d', e.target.checked)} disabled={!isAdmin} />
            <span className="text-sm font-medium text-gray-700">Mostrar botão e banner do Estúdio 3D</span>
          </label>

          {/* 5 fotos dos copos */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-1">Fotos dos copos (topo)</h4>
            <p className="text-sm text-gray-500 mb-3">Envie até 5 fotos (PNG com fundo transparente fica melhor). Sem foto, usa a garrafinha colorida padrão.</p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              {Array.from({ length: 5 }).map((_, i) => {
                const b = bottles[i] || {};
                const src = b.image_url || b.image;
                return (
                  <div key={i} className="rounded-xl border border-gray-200 p-2 flex flex-col items-center gap-2">
                    <div className="w-full h-28 rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                      {src
                        ? <img src={src} alt="" className="max-h-full max-w-full object-contain" />
                        : <span className="w-10 h-16 rounded-full shadow-inner" style={{ background: b.color || DEFAULT_HERO_BOTTLES[i]?.color || '#F26522' }} />}
                    </div>
                    <label className={`w-full text-center text-xs font-semibold rounded-lg py-1.5 cursor-pointer flex items-center justify-center gap-1 ${isAdmin ? 'bg-orange-50 text-orange-600 hover:bg-orange-100' : 'bg-gray-100 text-gray-400'}`}>
                      <Upload size={12} /> {src ? 'Trocar' : 'Enviar'}
                      <input type="file" accept="image/*" className="hidden" disabled={!isAdmin}
                        onChange={e => { const f = e.target.files?.[0]; if (f) resizeToDataUrl(f, 900, (url) => editBottle(i, { image: url })); e.target.value = ''; }} />
                    </label>
                    {src && isAdmin && (
                      <button type="button" onClick={() => editBottle(i, { color: DEFAULT_HERO_BOTTLES[i]?.color || '#F26522', gradient: true })}
                        className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={12} /> Remover</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── SEÇÕES (ordem + visibilidade) ── */}
      {sub === 'sections' && (
        <div>
          <p className="text-sm text-gray-500 mb-3">Arraste com as setas para reordenar e use o olho para mostrar/ocultar cada seção da página inicial. O topo (hero) fica sempre no início.</p>
          <div className="space-y-2">
            {sections.map((sec, i) => (
              <div key={sec.key} className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${sec.visible !== false ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                <div className="flex flex-col">
                  <button type="button" disabled={!isAdmin || i === 0} onClick={() => moveSection(i, -1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp size={15} /></button>
                  <button type="button" disabled={!isAdmin || i === sections.length - 1} onClick={() => moveSection(i, 1)} className="text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown size={15} /></button>
                </div>
                <span className="flex-1 text-sm font-medium text-gray-800">{SECTION_LABELS[sec.key] || sec.key}</span>
                <button type="button" disabled={!isAdmin} onClick={() => toggleSection(i)}
                  className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg ${sec.visible !== false ? 'bg-green-50 text-green-600' : 'bg-gray-200 text-gray-500'}`}>
                  {sec.visible !== false ? <><Eye size={13} /> Visível</> : <><EyeOff size={13} /> Oculto</>}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── BLOCOS (benefícios / pilares / números / faixa) ── */}
      {sub === 'lists' && (
        <div className="space-y-8">
          {/* Benefícios */}
          <ListEditor
            title="Benefícios" hint="Os 3 destaques (parcelamento, PIX, envio...)." isAdmin={isAdmin}
            items={benefits} onChange={arr => setSite('benefits', arr)} newItem={{ icon: 'star', title: '', text: '' }}
            render={(it, upd) => (
              <>
                <IconPicker value={it.icon} onChange={v => upd({ ...it, icon: v })} disabled={!isAdmin} />
                <input className="input flex-1" placeholder="Título" value={it.title} onChange={e => upd({ ...it, title: e.target.value })} disabled={!isAdmin} />
                <input className="input flex-1" placeholder="Descrição" value={it.text} onChange={e => upd({ ...it, text: e.target.value })} disabled={!isAdmin} />
              </>
            )}
          />
          {/* Pilares */}
          <ListEditor
            title="Pilares" hint="Cards de 'por que comprar' (ícone, título, texto e cor)." isAdmin={isAdmin}
            items={pillars} onChange={arr => setSite('pillars', arr)} newItem={{ icon: 'star', title: '', text: '', color: '#F26522' }}
            render={(it, upd) => (
              <>
                <IconPicker value={it.icon} onChange={v => upd({ ...it, icon: v })} disabled={!isAdmin} />
                <input type="color" className="w-9 h-9 rounded-lg border border-gray-200 shrink-0" value={it.color || '#F26522'} onChange={e => upd({ ...it, color: e.target.value })} disabled={!isAdmin} />
                <input className="input flex-1" placeholder="Título" value={it.title} onChange={e => upd({ ...it, title: e.target.value })} disabled={!isAdmin} />
                <input className="input flex-[2]" placeholder="Texto" value={it.text} onChange={e => upd({ ...it, text: e.target.value })} disabled={!isAdmin} />
              </>
            )}
          />
          {/* Números */}
          <ListEditor
            title="Números (estatísticas)" hint="Ex.: 40+ cores, 500ml, 100% BPA free. O número anima sozinho." isAdmin={isAdmin}
            items={stats} onChange={arr => setSite('stats', arr)} newItem={{ value: '', label: '' }}
            render={(it, upd) => (
              <>
                <input className="input w-28" placeholder="40+" value={it.value} onChange={e => upd({ ...it, value: e.target.value })} disabled={!isAdmin} />
                <input className="input flex-1" placeholder="Rótulo" value={it.label} onChange={e => upd({ ...it, label: e.target.value })} disabled={!isAdmin} />
              </>
            )}
          />
          {/* Faixa */}
          <ListEditor
            title="Faixa de diferenciais" hint="As palavras que passam na faixa laranja." isAdmin={isAdmin}
            items={marquee.map(t => ({ t }))} onChange={arr => setSite('marquee', arr.map(x => x.t))} newItem={{ t: '' }}
            render={(it, upd) => (
              <input className="input flex-1" placeholder="PALAVRA" value={it.t} onChange={e => upd({ t: e.target.value })} disabled={!isAdmin} />
            )}
          />
        </div>
      )}

      {/* ── TEXTOS ── */}
      {sub === 'texts' && (
        <div className="grid sm:grid-cols-2 gap-4">
          {TEXT_FIELDS.map(([k, label]) => (
            <div key={k}>
              <label className="label">{label}</label>
              <input className="input" value={s[k] ?? ''} onChange={e => setSite(k, e.target.value)} placeholder={SITE_DEFAULTS[k]} disabled={!isAdmin} />
            </div>
          ))}
        </div>
      )}

      {/* ── REDES ── */}
      {sub === 'social' && <SocialSettings site={site} setSite={setSite} isAdmin={isAdmin} />}
    </div>
  );
}

// Editor genérico de lista (add/remover/editar itens)
function ListEditor({ title, hint, items, onChange, newItem, render, isAdmin }) {
  const upd = (i, val) => onChange(items.map((x, j) => j === i ? val : x));
  const del = (i) => onChange(items.filter((_, j) => j !== i));
  const add = () => onChange([...items, { ...newItem }]);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <h4 className="font-semibold text-gray-800">{title}</h4>
        {isAdmin && <button type="button" onClick={add} className="text-sm font-semibold text-orange-600 hover:text-orange-700 flex items-center gap-1"><Plus size={15} /> Adicionar</button>}
      </div>
      {hint && <p className="text-xs text-gray-400 mb-2">{hint}</p>}
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2">
            {render(it, (val) => upd(i, val))}
            {isAdmin && <button type="button" onClick={() => del(i)} className="text-gray-300 hover:text-red-500 shrink-0 p-1"><Trash2 size={16} /></button>}
          </div>
        ))}
        {items.length === 0 && <p className="text-xs text-gray-400">Nenhum item — clique em Adicionar.</p>}
      </div>
    </div>
  );
}

// Seletor de ícone (grade compacta)
function IconPicker({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const Cur = siteIcon(value, 'star');
  return (
    <div className="relative shrink-0">
      <button type="button" disabled={disabled} onClick={() => setOpen(o => !o)}
        className="w-9 h-9 rounded-lg border border-gray-200 flex items-center justify-center text-gray-600 hover:border-orange-300 disabled:opacity-50">
        <Cur size={18} />
      </button>
      {open && !disabled && (
        <div className="absolute z-20 mt-1 p-2 bg-white rounded-xl border border-gray-200 shadow-lg grid grid-cols-6 gap-1 w-56">
          {SITE_ICON_KEYS.map(k => {
            const Ic = SITE_ICONS[k];
            return (
              <button key={k} type="button" onClick={() => { onChange(k); setOpen(false); }}
                className={`w-8 h-8 rounded-lg flex items-center justify-center hover:bg-orange-50 ${value === k ? 'bg-orange-100 text-orange-600' : 'text-gray-500'}`}>
                <Ic size={16} />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
