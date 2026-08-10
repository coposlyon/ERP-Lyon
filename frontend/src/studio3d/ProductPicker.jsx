import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Box, ArrowLeft } from 'lucide-react';
import storeApi from '@/store/storeApi';
import { resolveColor, needsBorder } from '@/store/colors';
import { modelKeyFor, shortColor } from '@/store/productMeta';

const qs = o => new URLSearchParams(Object.entries(o).filter(([, v]) => v)).toString();

// Cards de borda vêm agrupados por (tipo + cor da borda) e têm id "borda:...",
// que não existe em /products/:id — as cores deles vêm de /products/border.
const isBorderCard = c => c?.kind === 'border' || String(c?.id || '').startsWith('borda:');

const anyImg = p => p?.image_url
  || (p?.variation_images && Object.values(p.variation_images).find(Boolean))
  || (p?.variations?.images && Object.values(p.variations.images).find(Boolean))
  || null;

// A maior parte do catálogo tem 1 produto por cor, com o nome no formato
// "TIPO - COR - 400 ML". Lê essas partes para juntar as cores no mesmo card.
function parseName(name) {
  const raw = String(name || '').trim();
  const vm = raw.match(/(\d{2,4})\s*ML\s*$/i);
  const volume = vm ? `${vm[1]} ML` : '';
  const rest = (vm ? raw.slice(0, vm.index) : raw).replace(/[\s\-–—]+$/, '');
  const parts = rest.split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
  return { type: parts[0] || rest, color: parts.slice(1).join(' - '), volume };
}
const groupKey = i => `${i.type}|${i.volume}`;
const byLabel = (a, b) => a.label.localeCompare(b.label, 'pt-BR');

// Agrupa os produtos do catálogo por modelo (tipo + volume): 1 card por modelo,
// com as cores dentro. Produtos sem cor no nome ficam como card próprio.
function buildCards(products) {
  const groups = new Map();
  for (const p of products) {
    if (isBorderCard(p)) { groups.set(p.id, { card: p, colors: [] }); continue; }
    const info = parseName(p.name);
    if (!info.color) { groups.set(p.id, { card: p, colors: [] }); continue; }
    const k = groupKey(info);
    if (!groups.has(k)) {
      groups.set(k, {
        card: { ...p, id: k, name: [info.type, info.volume].filter(Boolean).join(' · '), group_of: info.type },
        colors: [],
      });
    }
    const g = groups.get(k);
    g.colors.push({ id: p.id, label: info.color, image: p.image_url, name: p.name, hex: resolveColor({ name: info.color, value: info.color }) });
    if (!g.card.image_url && p.image_url) g.card.image_url = p.image_url;
  }
  return [...groups.values()].map(g => ({
    ...g.card,
    colors: g.colors.sort(byLabel),
    // nº de cores mostrado no card: as juntadas aqui ou as que a loja já contou
    count: g.colors.length || (typeof g.card.colors === 'number' ? g.card.colors : 0),
  }));
}

/**
 * Catálogo do site dentro do estúdio: categorias na lateral, produtos com a
 * foto real e as cores do modelo. Trocar a cor troca o produto (foto + 3D).
 * onPick recebe { productId, name, category, image, colorLabel, hex, model }.
 */
export default function ProductPicker({ onPick }) {
  const [cat, setCat]         = useState('');
  const [search, setSearch]   = useState('');
  const [card, setCard]       = useState(null);   // card do catálogo aberto
  const [colorId, setColorId] = useState(null);   // produto (cor) escolhido dentro do card

  const { data: categories = [] } = useQuery({
    queryKey: ['studio-cats'],
    queryFn: () => storeApi.get('/categories'),
  });
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['studio-products', cat, search],
    queryFn: () => storeApi.get(`/products?${qs({ category: cat, search })}`),
  });
  const cards = useMemo(() => buildCards(products), [products]);

  const border = isBorderCard(card);
  // Produtos que já vêm agrupados no site (store_group) trazem as cores no
  // detalhe; os demais já têm as cores montadas pelo nome (card.colors).
  const needDetail = !!card && !border && !card.colors?.length;
  const { data: detail, isFetching: loadingDetail } = useQuery({
    queryKey: ['studio-product', colorId || card?.id],
    queryFn: () => storeApi.get(`/products/${colorId || card.id}`),
    enabled: needDetail,
    placeholderData: prev => prev,   // mantém a foto anterior enquanto troca a cor
  });
  const { data: group, isFetching: loadingGroup } = useQuery({
    queryKey: ['studio-border', card?.type, card?.border],
    queryFn: () => storeApi.get(`/products/border?${qs({ type: card.type, border: card.border })}`),
    enabled: !!card && border,
  });

  // Cores disponíveis do card aberto
  const colors = useMemo(() => {
    if (!card) return [];
    if (border) {
      return (group?.items || []).map(i => ({
        id: i.id, label: i.cup, image: i.image_url, name: i.name,
        hex: resolveColor({ name: i.cup, value: i.cup }),
      })).sort(byLabel);
    }
    if (card.colors?.length) return card.colors;
    return (detail?.color_options || []).map(c => {
      const label = shortColor(c.label, detail?.group);
      return { id: c.id, label, image: null, name: c.label, hex: resolveColor({ name: label, value: label }) };
    }).sort(byLabel);
  }, [card, border, group, detail]);

  const activeId = colorId || (card && !border && !card.colors?.length ? (detail?.id || card.id) : colors[0]?.id);
  const activeColor = colors.find(c => c.id === activeId) || null;

  const sel = useMemo(() => {
    if (!card) return null;
    if (border) {
      const it = (group?.items || []).find(i => i.id === activeId) || null;
      return {
        productId: it?.id || null,
        name: it?.name || card.name,
        category: card.category || null,
        image: it?.image_url || card.image_url || null,
        colorLabel: it?.cup || null,
        hex: activeColor?.hex || resolveColor({ name: card.name }),
        model: modelKeyFor({ name: it?.name || card.type || card.name, category: card.category }),
      };
    }
    const label = activeColor?.label
      || shortColor(detail?.color_label || detail?.name || card.name, detail?.group);
    const name = activeColor?.name || detail?.name || card.name;
    return {
      productId: activeId || detail?.id || card.id,
      name,
      category: detail?.category || card.category || null,
      image: activeColor?.image || anyImg(detail) || card.image_url || null,
      colorLabel: label || null,
      hex: activeColor?.hex || resolveColor({ name: label, value: label }),
      model: modelKeyFor({ name, category: card.category, group: card.group_of }),
    };
  }, [card, border, group, detail, activeId, activeColor]);

  // avisa o estúdio (sem depender da identidade do onPick a cada render)
  const pickRef = useRef(onPick); pickRef.current = onPick;
  const selKey = sel ? `${sel.productId}|${sel.hex}|${sel.model}|${sel.image}` : '';
  useEffect(() => { if (sel) pickRef.current?.(sel); }, [selKey]); // eslint-disable-line

  // ── card aberto: foto + cores ──
  if (card) {
    const loading = border ? loadingGroup : (needDetail && loadingDetail);
    return (
      <div>
        <button onClick={() => { setCard(null); setColorId(null); }}
          className="flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-violet-600 mb-2">
          <ArrowLeft size={13} /> Catálogo
        </button>

        <div className={`rounded-xl border border-gray-200 bg-gray-50 p-2 flex gap-2.5 items-center transition-opacity ${loading ? 'opacity-60' : ''}`}>
          <div className="w-16 h-16 shrink-0 rounded-lg bg-white border border-gray-200 flex items-center justify-center overflow-hidden">
            {sel?.image
              ? <img key={sel.image} src={sel.image} alt="" className="max-w-full max-h-full object-contain" />
              : <Box size={20} className="text-gray-300" />}
          </div>
          <div className="min-w-0">
            {sel?.category && <p className="text-[10px] font-bold uppercase tracking-wide text-violet-500 truncate">{sel.category}</p>}
            <p className="text-xs font-semibold text-gray-700 leading-tight line-clamp-2">{sel?.name}</p>
            {sel?.colorLabel && <p className="text-[11px] text-gray-400 truncate">{sel.colorLabel}</p>}
          </div>
        </div>

        {colors.length > 0 ? (
          <>
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mt-3 mb-1.5">
              Cores do site ({colors.length})
            </p>
            <div className="grid grid-cols-8 gap-1.5 max-h-40 overflow-y-auto pr-1">
              {colors.map(c => (
                <button key={c.id} title={c.label} onClick={() => setColorId(c.id)}
                  className={`w-full aspect-square rounded-md transition-transform hover:scale-110 ${activeId === c.id ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`}
                  style={{ background: c.hex, border: `1px solid ${needsBorder(c.hex) ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.12)'}` }} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-xs text-gray-400 mt-3">Este produto não tem outras cores no site.</p>
        )}
      </div>
    );
  }

  // ── catálogo ──
  return (
    <div>
      <div className="relative mb-2">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
        <input className="input text-sm pl-7" value={search} maxLength={40}
          onChange={e => setSearch(e.target.value)} placeholder="Buscar produto" />
      </div>

      <div className="flex flex-wrap gap-1.5 mb-2.5 max-h-24 overflow-y-auto pr-1">
        <Chip active={!cat} onClick={() => setCat('')}>Todas</Chip>
        {categories.map(c => (
          <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>{c.name}</Chip>
        ))}
      </div>

      {isLoading ? (
        <p className="text-xs text-gray-400">Carregando produtos...</p>
      ) : cards.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhum produto encontrado.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2 max-h-72 overflow-y-auto pr-1">
          {cards.map(p => (
            <button key={p.id} onClick={() => { setCard(p); setColorId(null); }} title={p.name}
              className="rounded-xl border border-gray-200 p-1.5 text-left hover:border-violet-400 transition-colors">
              <div className="aspect-square rounded-lg bg-gray-50 flex items-center justify-center overflow-hidden">
                {p.image_url
                  ? <img src={p.image_url} alt="" loading="lazy" className="max-w-full max-h-full object-contain" />
                  : <Box size={18} className="text-gray-300" />}
              </div>
              <p className="text-[11px] font-medium text-gray-700 truncate mt-1">{p.name}</p>
              {p.count > 1 && <p className="text-[10px] text-gray-400">{p.count} cores</p>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({ active, onClick, children }) {
  return (
    <button onClick={onClick}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors ${active ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
      {children}
    </button>
  );
}
