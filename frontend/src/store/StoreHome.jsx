import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Palette, ShieldCheck, Sparkles, ArrowRight, ChevronDown, ChevronLeft,
  Droplet, Printer, Wand2, Star, CreditCard, QrCode, Truck, X,
} from 'lucide-react';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { Reveal, CountUp } from './Reveal';
import { SITE_DEFAULTS } from './siteDefaults';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const HERO_BOTTLES = [
  { c: '#FFD400', g: true }, { c: '#EC1C8E', g: true }, { c: '#1E4FD8', g: true },
  { c: '#2BB7B3', g: true }, { c: '#F26522', g: true },
];
const CARD_COLORS = ['#F26522', '#1E4FD8', '#2BB7B3', '#EC1C8E', '#2E9E32', '#7E3FF2', '#FFD400', '#E11D22'];
const PALETTE = [
  ['Amarelo', '#FFD400'], ['Laranja', '#F26522'], ['Vermelho', '#E11D22'], ['Magenta', '#D6006E'],
  ['Pink', '#EC1C8E'], ['Rosa Bebê', '#F4B6C2'], ['Roxo', '#7E3FF2'], ['Violeta', '#8E44AD'],
  ['Azul Royal', '#1E4FD8'], ['Azul Bebê', '#9EC4E8'], ['Azul Tifanny', '#2BB7B3'], ['Verde Folha', '#2E9E32'],
  ['Verde Bandeira', '#0E6B4F'], ['Marsala', '#7B1E2B'], ['Preto', '#1A1A1A'], ['Branco', '#F4F4F4'],
];
const MARQUEE = ['PERSONALIZADO', '20 CORES', 'DEGRADÊ', 'ALTA DEFINIÇÃO', 'BPA FREE', '500ML', 'SUA MARCA'];
const PILLARS = [
  { icon: ShieldCheck, t: 'Qualidade Premium', d: 'Material resistente, BPA free e tampa rosqueável com bico flip.', c: '#F26522' },
  { icon: Printer, t: 'Alta Definição', d: 'Impressão nítida da sua logo, em cores vibrantes que não desbotam.', c: '#1E4FD8' },
  { icon: Wand2, t: 'Personalização Total', d: 'Você escolhe cor, quantidade e arte. Do seu jeito, com a sua cara.', c: '#EC1C8E' },
];

export default function StoreHome() {
  const [search, setSearch] = useState('');
  // tipo (COPOS, CANECAS...) e categoria vêm da URL — o menu do topo navega para cá
  const [params, setParams] = useSearchParams();
  const tipo = params.get('tipo') || '';
  const category = params.get('cat') || '';

  function setFilters({ tipo: t = tipo, cat = category } = {}) {
    const p = new URLSearchParams(params);
    if (t) p.set('tipo', t); else p.delete('tipo');
    if (cat) p.set('cat', cat); else p.delete('cat');
    setParams(p);
  }
  const setCategory = (id) => setFilters({ cat: id });

  const { data: store } = useQuery({ queryKey: ['store-info'], queryFn: () => storeApi.get('/store') });
  const S = { ...SITE_DEFAULTS, ...(store?.site || {}) }; // textos do site (config + padrão)
  const show3d = S.show_3d !== false;

  const { data: categories = [] } = useQuery({ queryKey: ['store-cats'], queryFn: () => storeApi.get('/categories') });
  const { data: types = [] } = useQuery({ queryKey: ['store-types'], queryFn: () => storeApi.get('/types') });
  const activeTipo = types.find(t => t.id === tipo);
  // com um tipo selecionado, os chips mostram só as categorias daquele tipo
  const chipCats = activeTipo ? activeTipo.categories : categories;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['store-products', search, category, tipo],
    queryFn: () => storeApi.get(`/products?${new URLSearchParams({
      ...(search ? { search } : {}),
      ...(category ? { category } : {}),
      ...(tipo ? { type: tipo } : {}),
    })}`),
  });

  // Sem categoria/busca, a query acima já traz TODOS os produtos do tipo —
  // agrupa por categoria para montar os cards grandes (sem query extra).
  const productsByCategory = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      const k = p.category || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    return m;
  }, [products]);
  // Mostra os cards grandes de categoria quando nada está filtrado ainda.
  const showCategoryCards = !category && !search && chipCats.length > 0;

  // chegou pelo menu (tipo/categoria na URL) → desce direto para o catálogo
  useEffect(() => {
    if (tipo || category) {
      document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [tipo, category]);

  return (
    <div className="overflow-x-hidden">

      {/* ══ HERO ══ */}
      <section className="relative min-h-[92vh] flex items-center overflow-hidden">
        {/* fundo gradiente animado */}
        <div className="absolute inset-0 st-animated-gradient"
          style={{ background: 'linear-gradient(120deg,#1a1130,#2a1530,#3a1020,#1a1130)' }} />
        {/* blobs */}
        <div className="st-blob" style={{ width: 420, height: 420, background: '#ff7a18', top: '-6%', left: '-6%', opacity: .45 }} />
        <div className="st-blob" style={{ width: 380, height: 380, background: '#ff2d75', bottom: '-10%', right: '4%', opacity: .4, animationDelay: '3s' }} />
        <div className="st-blob" style={{ width: 320, height: 320, background: '#8a2be2', top: '30%', right: '30%', opacity: .35, animationDelay: '6s' }} />

        <div className="relative max-w-6xl mx-auto px-4 grid lg:grid-cols-2 gap-10 items-center py-20 text-white">
          <div>
            <Reveal as="span" className="inline-block bg-white/10 backdrop-blur border border-white/15 text-xs font-bold px-4 py-1.5 rounded-full mb-5 tracking-wide">
              {S.hero_badge}
            </Reveal>
            <Reveal as="h1" delay={80} className="text-5xl sm:text-6xl xl:text-7xl font-black leading-[0.95] tracking-tight st-gradient-text">
              {S.hero_title}
            </Reveal>
            <Reveal as="p" delay={160} className="text-lg text-white/70 mt-6 max-w-md">
              {S.hero_subtitle}
            </Reveal>
            <Reveal delay={240} className="flex flex-wrap gap-3 mt-8">
              {show3d && (
                <Link to="/loja/personalizar" className="group bg-orange-500 hover:bg-orange-600 transition-all px-7 py-3.5 rounded-2xl font-bold flex items-center gap-2 shadow-xl shadow-orange-500/30 hover:scale-105">
                  <Wand2 size={18} /> {S.btn_3d} <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              )}
              <a href="#catalogo" className="bg-white/10 backdrop-blur border border-white/20 hover:bg-white/20 transition-colors px-7 py-3.5 rounded-2xl font-bold flex items-center gap-2">
                <Palette size={18} /> {S.btn_catalog}
              </a>
            </Reveal>
          </div>

          {/* garrafas flutuantes */}
          <div className="hidden lg:flex justify-center items-end gap-2 relative">
            <div className="absolute w-72 h-72 rounded-full bg-white/5 blur-2xl st-pulse" />
            {HERO_BOTTLES.map((b, i) => (
              <div key={i} className="st-float" style={{ animationDelay: `${i * 0.5}s`, transform: `translateY(${Math.abs(i - 2) * 14}px)` }}>
                <Bottle color={b.c} gradient={b.g} size={i === 2 ? 150 : 108} />
              </div>
            ))}
          </div>
        </div>

        {/* seta scroll */}
        <a href="#cores" className="absolute bottom-6 left-1/2 -translate-x-1/2 text-white/60 st-bob">
          <ChevronDown size={26} />
        </a>
      </section>

      {/* ══ MARQUEE ══ */}
      <div className="bg-orange-500 text-white py-3 overflow-hidden">
        <div className="st-marquee-track">
          {[...MARQUEE, ...MARQUEE, ...MARQUEE, ...MARQUEE].map((t, i) => (
            <span key={i} className="mx-6 text-lg font-black tracking-widest flex items-center gap-6">
              {t} <Droplet size={16} className="fill-white" />
            </span>
          ))}
        </div>
      </div>

      {/* ══ BENEFÍCIOS (parcelamento / PIX / envio) ══ */}
      <section className="bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 py-8 grid sm:grid-cols-3 gap-6">
          {[
            { icon: CreditCard, t: S.benefit_1_title, d: S.benefit_1_text },
            { icon: QrCode,     t: S.benefit_2_title, d: S.benefit_2_text },
            { icon: Truck,      t: S.benefit_3_title, d: S.benefit_3_text },
          ].map((b, i) => (
            <Reveal key={i} delay={i * 90} className="flex items-center gap-3 justify-center sm:justify-start">
              <span className="w-11 h-11 rounded-xl bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                <b.icon size={22} />
              </span>
              <span>
                <p className="font-extrabold text-gray-900 leading-tight">{b.t}</p>
                <p className="text-sm text-gray-500">{b.d}</p>
              </span>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ STATS ══ */}
      <section className="max-w-6xl mx-auto px-4 py-16 grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
        {[
          { v: <CountUp to={40} suffix="+" />, l: 'Cores disponíveis' },
          { v: <CountUp to={500} suffix="ml" />, l: 'Capacidade' },
          { v: '100%', l: 'BPA Free' },
          { v: <CountUp to={48} suffix="h" />, l: 'Resposta rápida' },
        ].map((s, i) => (
          <Reveal key={i} delay={i * 90} className="bg-white rounded-3xl border border-gray-100 py-8 st-card">
            <p className="text-4xl font-black st-gradient-text">{s.v}</p>
            <p className="text-sm text-gray-500 mt-1 font-medium">{s.l}</p>
          </Reveal>
        ))}
      </section>

      {/* ══ PILARES ══ */}
      <section className="max-w-6xl mx-auto px-4 pb-8">
        <Reveal as="h2" className="text-3xl sm:text-4xl font-black text-center mb-3">
          {S.pillars_title}
        </Reveal>
        <Reveal as="p" delay={80} className="text-gray-500 text-center mb-10 max-w-xl mx-auto">
          {S.pillars_subtitle}
        </Reveal>
        <div className="grid md:grid-cols-3 gap-6">
          {PILLARS.map((p, i) => (
            <Reveal key={i} delay={i * 120} scale className="bg-white rounded-3xl border border-gray-100 p-8 st-card text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 st-pulse"
                style={{ background: p.c + '1a', color: p.c }}>
                <p.icon size={28} />
              </div>
              <h3 className="text-xl font-extrabold">{p.t}</h3>
              <p className="text-gray-500 mt-2 text-sm leading-relaxed">{p.d}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ══ MURAL DE CORES ══ */}
      <section id="cores" className="bg-gray-900 text-white py-20 mt-12 relative overflow-hidden">
        <div className="st-blob" style={{ width: 300, height: 300, background: '#7E3FF2', top: '10%', left: '-5%', opacity: .3 }} />
        <div className="st-blob" style={{ width: 260, height: 260, background: '#2BB7B3', bottom: '0%', right: '0%', opacity: .25, animationDelay: '4s' }} />
        <div className="relative max-w-6xl mx-auto px-4">
          <Reveal as="span" className="inline-block bg-white/10 text-xs font-bold px-4 py-1.5 rounded-full mb-4">PALETA</Reveal>
          <Reveal as="h2" delay={60} className="text-3xl sm:text-5xl font-black mb-3 st-gradient-text">{S.colors_title}</Reveal>
          <Reveal as="p" delay={120} className="text-white/60 mb-10 max-w-lg">{S.colors_subtitle}</Reveal>

          <div className="grid grid-cols-4 sm:grid-cols-8 gap-4 sm:gap-6">
            {PALETTE.map(([name, hex], i) => (
              <Reveal key={name} delay={i * 45} scale className="flex flex-col items-center gap-2 group cursor-default">
                <div className="st-float" style={{ animationDelay: `${(i % 6) * 0.4}s` }}>
                  <Bottle color={hex} gradient={i % 3 === 0} size={70} />
                </div>
                <span className="text-[11px] text-white/55 group-hover:text-white transition-colors text-center font-medium">{name}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ══ BANNER ESTÚDIO 3D ══ */}
      {show3d && (
      <section className="max-w-6xl mx-auto px-4 pt-16">
        <Reveal scale className="relative rounded-[2rem] overflow-hidden bg-gray-900 text-white grid md:grid-cols-2 items-center">
          <div className="st-blob" style={{ width: 280, height: 280, background: '#7E3FF2', top: '-10%', left: '20%', opacity: .35 }} />
          <div className="relative p-8 sm:p-12">
            <span className="inline-block bg-orange-500 text-xs font-bold px-3 py-1 rounded-full mb-4">NOVO · 3D</span>
            <h2 className="text-3xl sm:text-4xl font-black leading-tight st-gradient-text">{S.studio_title}</h2>
            <p className="text-white/70 mt-3 max-w-sm">{S.studio_subtitle}</p>
            <Link to="/loja/personalizar" className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 transition-all px-6 py-3.5 rounded-2xl font-bold mt-6 hover:scale-105">
              <Wand2 size={18} /> Abrir estúdio 3D <ArrowRight size={18} />
            </Link>
          </div>
          <div className="relative flex justify-center items-center gap-2 pb-8 md:pb-0 md:pr-8">
            {[['#F26522', true], ['#1E4FD8', false], ['#EC1C8E', true]].map(([c, g], i) => (
              <div key={i} className="st-float" style={{ animationDelay: `${i * 0.5}s` }}>
                <Bottle color={c} gradient={g} size={i === 1 ? 150 : 110} />
              </div>
            ))}
          </div>
        </Reveal>
      </section>
      )}

      {/* ══ CATÁLOGO ══ */}
      <section id="catalogo" className="max-w-6xl mx-auto px-4 py-16 scroll-mt-32">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-8">
          <div>
            <Reveal as="span" className="text-orange-500 font-bold text-sm tracking-wide">{S.catalog_badge}</Reveal>
            <Reveal as="h2" delay={60} className="text-3xl sm:text-4xl font-black">
              {activeTipo ? activeTipo.name : S.catalog_title}
            </Reveal>
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-3 rounded-2xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
              placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* CATEGORIAS EM CARDS GRANDES — cada card passa as fotos dos produtos da categoria */}
        {showCategoryCards && (
          isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-80 bg-white rounded-3xl animate-pulse" />)}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mb-4">
              {chipCats.map((c, idx) => (
                <CategoryCard
                  key={c.id} cat={c} delay={(idx % 3) * 100}
                  color={CARD_COLORS[idx % CARD_COLORS.length]}
                  items={productsByCategory.get(c.name) || []}
                  onClick={() => setCategory(c.id)}
                />
              ))}
            </div>
          )
        )}

        {/* Navegação quando já se está dentro de uma categoria (ou buscando) */}
        {!showCategoryCards && (chipCats.length > 0 || activeTipo) && (
          <div className="flex gap-2 flex-wrap items-center mb-8">
            {category && (
              <button onClick={() => setCategory('')}
                className="px-4 py-2 rounded-full text-sm font-bold bg-white border border-gray-200 text-gray-700 flex items-center gap-1 hover:border-orange-300 hover:text-orange-600 transition-all">
                <ChevronLeft size={16} /> Categorias
              </button>
            )}
            {activeTipo && (
              <button onClick={() => setFilters({ tipo: '', cat: '' })}
                className="px-4 py-2 rounded-full text-sm font-bold bg-orange-500 text-white flex items-center gap-1.5 hover:bg-orange-600 transition-all"
                title="Limpar filtro de tipo">
                {activeTipo.name} <X size={14} />
              </button>
            )}
            <button onClick={() => setCategory('')}
              className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${!category ? 'bg-gray-900 text-white scale-105' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              Todos
            </button>
            {chipCats.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`px-5 py-2 rounded-full text-sm font-semibold transition-all ${category === c.id ? 'bg-gray-900 text-white scale-105' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {showCategoryCards ? null : isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-72 bg-white rounded-3xl animate-pulse" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            Nenhum produto encontrado. {search && 'Tente outra busca.'}
          </div>
        ) : (
          <div key={category || 'all'} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {products.map((p, idx) => (
              <div key={p.id} className="st-open h-full" style={{ animationDelay: `${(idx % 9) * 60}ms` }}>
                <Link to={`/loja/produto/${p.id}`}
                  className="st-card group bg-white rounded-3xl border border-gray-100 overflow-hidden flex flex-col h-full">
                  <div className="bg-gradient-to-b from-gray-50 to-white flex items-center justify-center py-8 relative overflow-hidden h-52">
                    <div className="absolute w-40 h-40 rounded-full bg-orange-100/40 blur-2xl group-hover:bg-orange-200/50 transition-colors" />
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="relative max-h-44 w-auto object-contain group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="relative group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500">
                        <Bottle color={CARD_COLORS[idx % CARD_COLORS.length]} gradient={/degrad/i.test(p.name)} size={130} />
                      </div>
                    )}
                    {p.colors > 0 && (
                      <span className="absolute top-4 right-4 bg-gray-900 text-white text-xs font-bold px-3 py-1 rounded-full">
                        {p.colors} cores
                      </span>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    {p.category && <span className="text-xs text-orange-500 font-bold uppercase tracking-wide">{p.category}</span>}
                    <h3 className="font-extrabold text-gray-900 leading-tight mt-1 group-hover:text-orange-600 transition-colors">{p.name}</h3>
                    <div className="mt-auto pt-4 flex items-end justify-between">
                      <div>
                        <p className="text-xs text-gray-400">{p.has_tiers ? 'a partir de' : 'unidade'}</p>
                        <p className="text-xl font-black text-gray-900">{fmt(p.from_price)}</p>
                      </div>
                      <span className="w-10 h-10 rounded-full bg-orange-500 text-white flex items-center justify-center group-hover:scale-110 group-hover:rotate-12 transition-transform">
                        <ArrowRight size={18} />
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══ CTA FINAL ══ */}
      <section className="max-w-6xl mx-auto px-4 pb-20">
        <Reveal scale className="relative rounded-[2rem] overflow-hidden st-animated-gradient text-white text-center px-6 py-16"
          style={{ background: 'linear-gradient(120deg,#ff7a18,#ff2d75,#8a2be2)' }}>
          <Sparkles size={32} className="mx-auto mb-4 st-pulse" />
          <h2 className="text-3xl sm:text-5xl font-black max-w-2xl mx-auto leading-tight">
            {S.cta_title}
          </h2>
          <p className="text-white/85 mt-4 max-w-md mx-auto">{S.cta_subtitle}</p>
          <a href="#catalogo" className="inline-flex items-center gap-2 bg-white text-gray-900 font-bold px-8 py-4 rounded-2xl mt-8 hover:scale-105 transition-transform shadow-2xl">
            {S.cta_button} <ArrowRight size={18} />
          </a>
          <div className="flex items-center justify-center gap-1 mt-6 text-white/80 text-sm">
            {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={15} className="fill-white" />)}
            <span className="ml-2">Qualidade que vira recompra</span>
          </div>
        </Reveal>
      </section>
    </div>
  );
}

// Card grande de categoria: passa (crossfade) as fotos dos produtos da categoria
// e, ao clicar, abre todos os produtos daquela categoria.
function CategoryCard({ cat, items, color, onClick, delay = 0 }) {
  // até 6 fotos giram no carrossel; produto sem foto vira uma garrafinha colorida
  const slides = (items.length ? items : [{ id: cat.id, image_url: null, name: cat.name }]).slice(0, 6);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    // arranca defasado por card p/ as fotos não trocarem todas ao mesmo tempo
    const start = setTimeout(() => {
      setI(v => (v + 1) % slides.length);
    }, 600 + (delay % 300));
    const iv = setInterval(() => setI(v => (v + 1) % slides.length), 2600);
    return () => { clearTimeout(start); clearInterval(iv); };
  }, [slides.length, delay]);

  return (
    <Reveal delay={delay}>
      <button type="button" onClick={onClick}
        className="st-card group w-full text-left bg-white rounded-3xl border border-gray-100 overflow-hidden flex flex-col h-full">
        <div className="relative h-64 bg-gradient-to-b from-gray-50 to-white overflow-hidden flex items-center justify-center">
          <div className="absolute w-52 h-52 rounded-full blur-3xl transition-colors group-hover:scale-110"
            style={{ background: color + '2e' }} />
          {slides.map((p, idx) => (
            <div key={(p.id || idx) + '-' + idx}
              className={`st-slide absolute inset-0 flex items-center justify-center ${idx === i ? 'st-slide-on' : ''}`}>
              {p.image_url ? (
                <img src={p.image_url} alt="" loading="lazy"
                  className="max-h-52 w-auto object-contain group-hover:scale-105 transition-transform duration-700" />
              ) : (
                <Bottle color={color} gradient={/degrad/i.test(p.name || '')} size={150} />
              )}
            </div>
          ))}
          <span className="absolute top-4 left-4 bg-white/85 backdrop-blur text-gray-700 text-xs font-bold px-3 py-1 rounded-full shadow-sm">
            {items.length} {items.length === 1 ? 'modelo' : 'modelos'}
          </span>
          {slides.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-1.5">
              {slides.map((_, idx) => (
                <span key={idx} className={`h-1.5 rounded-full transition-all duration-500 ${idx === i ? 'w-5 bg-orange-500' : 'w-1.5 bg-gray-300'}`} />
              ))}
            </div>
          )}
        </div>
        <div className="p-6 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-gray-900 leading-tight truncate group-hover:text-orange-600 transition-colors">{cat.name}</h3>
            <p className="text-sm text-gray-400 mt-0.5">Ver todos os modelos</p>
          </div>
          <span className="w-11 h-11 rounded-full bg-orange-500 text-white flex items-center justify-center shrink-0 group-hover:scale-110 group-hover:translate-x-0.5 transition-transform">
            <ArrowRight size={18} />
          </span>
        </div>
      </button>
    </Reveal>
  );
}
