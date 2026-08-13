import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Search, Sparkles, ArrowRight, ChevronDown, ChevronUp, ChevronLeft,
  Wand2, X, Instagram, CreditCard, Truck, Palette as PaletteIcon,
} from 'lucide-react';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { CountUp } from './Reveal';
import { RawEmbed, FacebookPage } from './SocialEmbeds';
import { siteIcon } from './siteIcons';
import { resolveColor } from './colors';
import CupPhoto from './CupPhoto';
import PromoWall from './PromoWall';
import { useReveal, Mascara } from './revelar';
import {
  SITE_DEFAULTS, DEFAULT_HERO_BOTTLES, DEFAULT_MARQUEE, DEFAULT_BENEFITS,
  DEFAULT_PILLARS, DEFAULT_STATS, resolveSections,
} from './siteDefaults';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const CARD_COLORS = ['#F26522', '#1E4FD8', '#2BB7B3', '#EC1C8E', '#2E9E32', '#7E3FF2', '#FFD400', '#E11D22'];
const CORES_VISIVEIS = 16;   // 2 fileiras de 8 no desktop

// Caixa de cada copo do topo, em arco (o do meio é o maior). Largura fixa por
// slot é o que impede a caneca de roubar o espaço dos vizinhos.
const HERO_BOX = [
  { w: 70, h: 190 }, { w: 84, h: 228 }, { w: 100, h: 272 }, { w: 84, h: 228 }, { w: 70, h: 190 },
];
const PALETTE = [
  ['Amarelo', '#FFD400'], ['Laranja', '#F26522'], ['Vermelho', '#E11D22'], ['Magenta', '#D6006E'],
  ['Pink', '#EC1C8E'], ['Rosa Bebê', '#F4B6C2'], ['Roxo', '#7E3FF2'], ['Violeta', '#8E44AD'],
  ['Azul Royal', '#1E4FD8'], ['Azul Bebê', '#9EC4E8'], ['Azul Tifanny', '#2BB7B3'], ['Verde Folha', '#2E9E32'],
  ['Verde Bandeira', '#0E6B4F'], ['Marsala', '#7B1E2B'], ['Preto', '#1A1A1A'], ['Branco', '#F4F4F4'],
];

// "40+", "500ml", "48h" → conta animado no número + sufixo; senão texto puro.
function StatValue({ value }) {
  const m = String(value ?? '').match(/^(\d[\d.]*)(.*)$/);
  if (m) return <CountUp to={parseInt(m[1], 10) || 0} suffix={m[2] || ''} />;
  return <>{value}</>;
}

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
  const S = { ...SITE_DEFAULTS, ...(store?.site || {}) }; // textos/opções do site (config + padrão)
  const show3d = S.show_3d !== false;

  // Conteúdo editável (fallback = comportamento atual quando não configurado)
  const heroBottles = Array.isArray(S.hero_bottles) && S.hero_bottles.length ? S.hero_bottles.slice(0, 5) : DEFAULT_HERO_BOTTLES;
  const marquee  = Array.isArray(S.marquee)  && S.marquee.length  ? S.marquee  : DEFAULT_MARQUEE;
  const benefits = Array.isArray(S.benefits) && S.benefits.length ? S.benefits : DEFAULT_BENEFITS;
  const pillars  = Array.isArray(S.pillars)  && S.pillars.length  ? S.pillars  : DEFAULT_PILLARS;
  const stats    = Array.isArray(S.stats)    && S.stats.length    ? S.stats    : DEFAULT_STATS;
  const sections = resolveSections(S.sections);

  // Uma foto real por cor do catálogo (o backend já garante "sem repetir cor")
  const { data: showcase = [] } = useQuery({
    queryKey: ['store-showcase'], queryFn: () => storeApi.get('/showcase'), staleTime: 10 * 60 * 1000,
  });

  // Baralho embaralhado uma vez por visita: o topo anda de 5 em 5, então os 5
  // copos em cena nunca repetem cor entre si.
  const deck = useMemo(() => {
    const a = [...showcase];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }, [showcase]);

  // A paleta abre com 2 fileiras (8 por fileira no desktop); o resto fica atrás
  // de um botão pra seção não virar um paredão de 25 copos.
  const [todasAsCores, setTodasAsCores] = useState(false);
  const coresVisiveis = todasAsCores ? showcase : showcase.slice(0, CORES_VISIVEIS);

  const heroConfigurado = heroBottles.some(b => b.image_url || b.image);
  const [passo, setPasso] = useState(0);
  useEffect(() => {
    if (heroConfigurado || deck.length <= 5) return;   // nada pra revezar
    const iv = setInterval(() => setPasso(p => p + 1), 5000);
    return () => clearInterval(iv);
  }, [heroConfigurado, deck.length]);

  const heroSlots = (heroConfigurado || deck.length < 5)
    ? heroBottles
    : Array.from({ length: 5 }, (_, i) => {
        const p = deck[(passo * 5 + i) % deck.length];
        return { image_url: p.image_url, label: p.color };
      });

  const { data: instagram } = useQuery({ queryKey: ['store-instagram'], queryFn: () => storeApi.get('/instagram'), staleTime: 10 * 60 * 1000 });
  const igPosts = instagram?.ok ? (instagram.posts || []) : [];

  const { data: categories = [] } = useQuery({ queryKey: ['store-cats'], queryFn: () => storeApi.get('/categories') });
  const { data: types = [] } = useQuery({ queryKey: ['store-types'], queryFn: () => storeApi.get('/types') });
  const activeTipo = types.find(t => t.id === tipo);
  const chipCats = activeTipo ? activeTipo.categories : categories;

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['store-products', search, category, tipo],
    queryFn: () => storeApi.get(`/products?${new URLSearchParams({
      ...(search ? { search } : {}),
      // dentro de uma categoria, o card é por COR (expand=1) — quem entrou em
      // "LONG DRINK TRADICIONAL" quer ver os 24 copos, não um card só.
      ...(category ? { category, expand: '1' } : {}),
      ...(tipo ? { type: tipo } : {}),
    })}`),
  });

  const productsByCategory = useMemo(() => {
    const m = new Map();
    for (const p of products) {
      const k = p.category || '';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    return m;
  }, [products]);
  const showCategoryCards = !category && !search && chipCats.length > 0;
  const filtering = !!(category || tipo || search);   // cliente está garimpando produto

  useEffect(() => {
    if (tipo || category) document.getElementById('catalogo')?.scrollIntoView({ behavior: 'smooth' });
  }, [tipo, category]);

  // ── Seções da home (renderizadas por ordem/visibilidade da config) ──
  const RENDERERS = {
    marquee: () => (
      <div key="marquee" className="text-white overflow-hidden border-y border-white/10"
        style={{ background: 'linear-gradient(100deg,#ff7a18,#ff2d75 48%,#8a2be2 96%)' }}>
        <div className="st-marquee-track py-2.5">
          {[...marquee, ...marquee, ...marquee, ...marquee].map((t, i) => (
            <span key={i} className="flex items-center text-sm font-bold uppercase tracking-[0.22em] text-white/90">
              <span className="mx-6">{t}</span>
              <Sparkles size={12} className="text-white/50" />
            </span>
          ))}
        </div>
      </div>
    ),

    benefits: () => <Confia key="benefits" itens={benefits} />,

    promos: () => <PromoWall key="promos" badge={S.promos_badge} title={S.promos_title} subtitle={S.promos_subtitle} />,

    passos: () => <Passos key="passos" showcase={showcase} titulo={S.passos_title} />,

    desfile: () => <Desfile key="desfile" showcase={showcase} />,

    stats: () => <Estatisticas key="stats" stats={stats} />,

    pillars: () => <Pilares key="pillars" pillars={pillars} titulo={S.pillars_title} sub={S.pillars_subtitle} />,

    colors: () => (
      <Cores key="colors" showcase={showcase} visiveis={coresVisiveis} todas={todasAsCores}
        onAlternar={() => setTodasAsCores(v => !v)} titulo={S.colors_title} sub={S.colors_subtitle} />
    ),

    personalizar: () => <Personalizar key="personalizar" showcase={showcase} titulo={S.pers_title} sub={S.pers_subtitle} />,

    numeros: () => <Numeros key="numeros" cores={showcase.length} site={S} />,

    studio: () => show3d ? (
      <section key="studio" className="lj-sec">
        <div className="lj-env">
          <Reveal className="relative rounded-[26px] overflow-hidden bg-[var(--carvao)] text-[var(--creme)] grid md:grid-cols-2 items-center">
            <div className="relative p-8 sm:p-14">
              <p className="lj-olho claro lj-an">Novo · 3D</p>
              <h2 className="lj-an d1 mt-3" style={{ fontSize: 'clamp(24px,3.6vw,42px)' }}>{S.studio_title}</h2>
              <p className="lj-sub lj-an d2 mt-4" style={{ color: 'var(--cinza2)' }}>{S.studio_subtitle}</p>
              <Link to="/loja/personalizar" className="lj-btn laranja lj-an d3 mt-7">
                <Wand2 size={17} /> Abrir estúdio 3D <ArrowRight size={16} />
              </Link>
            </div>
            <div className="relative flex justify-center items-end gap-3 pb-8 md:pb-0 md:pr-8">
              {showcase.slice(0, 3).map((p, i) => (
                <CupPhoto key={p.id} src={p.image_url} alt={p.color}
                  className="lj-an object-contain drop-shadow-2xl"
                  style={{ height: i === 1 ? 210 : 160, transitionDelay: `${i * 90}ms` }} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>
    ) : null,

    catalog: () => (
      <Catalogo key="catalog" {...{
        S, activeTipo, search, setSearch, showCategoryCards, isLoading, chipCats, productsByCategory,
        setCategory, setFilters, category, products,
      }} />
    ),

    social: () => (S.instagram_embed || igPosts.length > 0 || S.facebook_page_url) ? (
      <Social key="social" S={S} instagram={instagram} igPosts={igPosts} />
    ) : null,

    cta: () => <Cartas key="cta" showcase={showcase} S={S} />,
  };

  return (
    <div className="lj overflow-x-hidden">
      <Heroi S={S} show3d={show3d} heroSlots={heroSlots} />

      {/* seções ordenáveis/ocultáveis pela config. Filtrando (tipo, categoria ou
          busca) a paleta sai da frente: ela fica logo acima do catálogo e parece
          um seletor de cor do que foi filtrado, mas é só vitrine. */}
      {sections
        .filter(s => s.visible !== false)
        .filter(s => !(filtering && (s.key === 'colors' || s.key === 'passos' || s.key === 'personalizar')))
        .map(s => <Fragment key={s.key}>{RENDERERS[s.key] ? RENDERERS[s.key]() : null}</Fragment>)}
    </div>
  );
}

/* Bloco genérico que revela o conteúdo ao entrar em cena. */
function Reveal({ children, className = '', as: Tag = 'div', umaVez = true, ...resto }) {
  const ref = useReveal({ umaVez });
  return <Tag ref={ref} className={className} {...resto}>{children}</Tag>;
}

/* ── TOPO ───────────────────────────────────────────────── */
function Heroi({ S, show3d, heroSlots }) {
  const ref = useReveal();
  // Quebra o título em linhas para cada uma subir de dentro da máscara. Sem
  // quebra manual, corta nos espaços em até 3 linhas — título de uma linha só
  // ficaria gigante e sem o efeito.
  const linhas = useMemo(() => {
    const t = String(S.hero_title || '').trim();
    if (t.includes('\n')) return t.split('\n').filter(Boolean);
    const palavras = t.split(/\s+/);
    if (palavras.length < 4) return [t];
    const porLinha = Math.ceil(palavras.length / 3);
    return [0, 1, 2].map(i => palavras.slice(i * porLinha, (i + 1) * porLinha).join(' ')).filter(Boolean);
  }, [S.hero_title]);

  return (
    <section ref={ref} className="lj-heroi">
      <div className="lj-env duas">
        <div>
          <p className="lj-olho lj-an">{S.hero_badge}</p>
          <h1 className="mt-5"><Mascara linhas={linhas} /></h1>
          <p className="lj-sub lj-an d3 mt-6" style={{ fontSize: 'clamp(15px,1.35vw,17.5px)' }}>{S.hero_subtitle}</p>
          <div className="flex flex-wrap gap-3 mt-7 lj-an d4">
            <a href="#catalogo" className="lj-btn">{S.btn_catalog} <ArrowRight size={16} /></a>
            {show3d && <Link to="/loja/personalizar" className="lj-btn vazio"><Wand2 size={16} /> {S.btn_3d}</Link>}
          </div>
        </div>
        <div className="lj-prateleira">
          {heroSlots.map((b, i) => {
            const foto = b.image_url || b.image;
            const box = HERO_BOX[i] || HERO_BOX[0];
            return (
              <span key={i} className="lj-copo">
                {foto
                  ? <CupPhoto key={foto} src={foto} alt={b.label || ''} />
                  : <Bottle color={b.color || '#F26522'} gradient={b.gradient !== false} size={Math.round(box.h * 0.55)} />}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── FAIXA DE CONFIANÇA ─────────────────────────────────── */
function Confia({ itens }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="lj-confia">
      <div className="lj-env">
        {itens.slice(0, 3).map((b, i) => {
          const Icon = siteIcon(b.icon, 'star');
          return (
            <div key={i} className={`it lj-an d${i}`}>
              <span className="ic"><Icon size={18} /></span>
              <span><b>{b.title}</b><span>{b.text}</span></span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ── COMO FUNCIONA (copo fixo, texto passando) ──────────── */
const PASSOS = [
  { n: '01 · A COR', h: 'Comece escolhendo', p: 'Cores em estoque, do neon ao translúcido. Todas com o mesmo prazo de entrega.', cor: '#00B7C7' },
  { n: '02 · A ARTE', h: 'Mande a sua', p: 'Ou peça pra gente criar — está incluso. Você aprova a prova digital antes de qualquer impressão.', cor: '#E5348F' },
  { n: '03 · A ENTREGA', h: 'Chega antes', p: 'Seis dias úteis de produção. A gente conta de trás pra frente a partir da data da sua festa.', cor: '#FFCA1D' },
];

function Passos({ showcase, titulo }) {
  const ref = useReveal();
  const [ativo, setAtivo] = useState(0);
  const fotos = showcase.slice(0, 3);

  useEffect(() => {
    if (fotos.length < 1) return;
    const els = [...document.querySelectorAll('.lj-passos .p')];
    if (!els.length) return;
    const io = new IntersectionObserver(es => {
      es.forEach(e => { if (e.intersectionRatio > 0.45) setAtivo(Number(e.target.dataset.p)); });
    }, { threshold: [0, .45, .8] });
    els.forEach(e => io.observe(e));
    return () => io.disconnect();
  }, [fotos.length]);

  if (fotos.length < 1) return null;

  return (
    <section className="lj-sec" id="como-funciona">
      <div className="lj-env">
        <div ref={ref} className="lj-cab">
          <p className="lj-olho lj-an">Como funciona</p>
          <h2><Mascara linhas={(titulo || 'Três passos até\na sua festa.').split('\n')} /></h2>
        </div>
      </div>
      <div className="lj-env lj-passos">
        <div className="palco">
          <i className="halo" style={{ background: PASSOS[ativo].cor }} />
          {fotos.map((p, i) => (
            <CupPhoto key={p.id} src={p.image_url} alt={p.color} className={i === ativo ? 'on' : ''} />
          ))}
        </div>
        <div className="lista">
          {PASSOS.slice(0, fotos.length).map((s, i) => (
            <Reveal key={i} className="p" data-p={i}>
              <span className="lj-olho lj-an">{s.n}</span>
              <h3 className="lj-an d1">{s.h}</h3>
              <p className="lj-an d2">{s.p}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── DESFILE: a rolagem vertical anda com o catálogo pro lado ── */
function Desfile({ showcase }) {
  const secRef = useRef(null);
  const trilhoRef = useRef(null);
  const [pos, setPos] = useState(1);
  const pecas = showcase.slice(0, 10);

  useEffect(() => {
    const sec = secRef.current, trilho = trilhoRef.current;
    if (!sec || !trilho || !pecas.length) return;
    const andar = () => {
      const total = sec.offsetHeight - window.innerHeight;
      const t = total > 0 ? Math.min(1, Math.max(0, -sec.getBoundingClientRect().top / total)) : 0;
      const percorrer = Math.max(0, trilho.scrollWidth - window.innerWidth + 40);
      trilho.style.transform = `translateX(${-t * percorrer}px)`;
      const barra = sec.querySelector('.lj-prog i');
      if (barra) barra.style.setProperty('--p', (t * 100).toFixed(1) + '%');
      setPos(Math.min(pecas.length, Math.floor(t * pecas.length) + 1));
    };
    window.addEventListener('scroll', andar, { passive: true });
    window.addEventListener('resize', andar);
    andar();
    return () => { window.removeEventListener('scroll', andar); window.removeEventListener('resize', andar); };
  }, [pecas.length]);

  if (pecas.length < 4) return null;
  const dois = n => String(n).padStart(2, '0');

  return (
    <section ref={secRef} className="lj-desfile" id="desfile">
      <div className="cola">
        <div className="cab2">
          <div>
            <p className="lj-olho">O catálogo</p>
            <h2>Passe os olhos</h2>
          </div>
          <span className="cont">{dois(pos)} / {dois(pecas.length)}</span>
        </div>
        <div ref={trilhoRef} className="lj-trilho">
          {pecas.map(p => (
            <Link key={p.id} to={`/loja/produto/${p.id}`} className="lj-pe">
              <CupPhoto src={p.image_url} alt={p.color} />
              <b>{p.color}</b>
              <span>{p.model}</span>
            </Link>
          ))}
        </div>
        <div className="lj-prog"><i /></div>
      </div>
    </section>
  );
}

/* ── PALETA DE CORES ────────────────────────────────────── */
function Cores({ showcase, visiveis, todas, onAlternar, titulo, sub }) {
  const ref = useReveal();
  return (
    <section className="lj-sec alt" id="cores">
      <div ref={ref} className="lj-env">
        <div className="lj-cab">
          <p className="lj-olho lj-an">A paleta</p>
          <h2><Mascara linhas={(titulo || 'Escolha a sua cor').split('\n')} /></h2>
          <p className="lj-sub lj-an d3 mt-4">
            {sub}{showcase.length > 0 && <> Foto real de cada uma — <b>{showcase.length} cores</b> em estoque.</>}
          </p>
        </div>
        <div className="lj-paleta">
          {showcase.length > 0 ? visiveis.map((p, i) => (
            <Link key={p.id} to={`/loja/produto/${p.id}`} className="lj-cor"
              style={{ transitionDelay: `${Math.min(i, 15) * 34}ms` }}>
              <span className="caixa"><CupPhoto src={p.image_url} alt={p.color} /></span>
              <b>{p.color}</b>
            </Link>
          )) : PALETTE.map(([name, hex], i) => (
            <span key={name} className="lj-cor" style={{ transitionDelay: `${i * 34}ms` }}>
              <span className="caixa"><Bottle color={hex} gradient={i % 3 === 0} size={70} /></span>
              <b>{name}</b>
            </span>
          ))}
        </div>
        {showcase.length > CORES_VISIVEIS && (
          <div className="flex justify-center mt-10">
            <button type="button" onClick={onAlternar} className="lj-btn vazio">
              {todas ? <>Mostrar menos <ChevronUp size={16} /></> : <>Ver as {showcase.length} cores <ChevronDown size={16} /></>}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

/* ── PERSONALIZADOR (o nome aparece no copo) ────────────── */
function Personalizar({ showcase, titulo, sub }) {
  const ref = useReveal();
  const [nome, setNome] = useState('Ágatha');
  const [linha2, setLinha2] = useState('3 aninhos · #EuFui');
  const [cor, setCor] = useState(0);
  const tons = showcase.slice(0, 8);
  if (tons.length < 3) return null;

  return (
    <section ref={ref} className="lj-sec escura" id="personalizar">
      <div className="lj-env lj-pers">
        <div className="palco2 lj-an">
          <CupPhoto src={tons[cor]?.image_url} alt={tons[cor]?.color || ''} />
          <div className="arte">
            <div className="nm">{nome.trim() || 'Seu nome'}</div>
            <div className="sb">{linha2}</div>
          </div>
        </div>
        <div>
          <p className="lj-olho claro lj-an">Prévia ao vivo</p>
          <h2 className="lj-an d1 mt-3" style={{ fontSize: 'clamp(25px,3.8vw,46px)' }}>{titulo}</h2>
          <p className="lj-sub lj-an d2 mt-4">{sub}</p>
          <div className="lj-campo lj-an d3 mt-6">
            <label htmlFor="lj-nome">Nome ou frase</label>
            <input id="lj-nome" value={nome} maxLength={18} onChange={e => setNome(e.target.value)} />
          </div>
          <div className="lj-campo lj-an d3 mt-4">
            <label htmlFor="lj-linha2">Linha de baixo</label>
            <input id="lj-linha2" value={linha2} maxLength={26} onChange={e => setLinha2(e.target.value)} />
          </div>
          <div className="lj-campo lj-an d4 mt-4">
            <label>Cor do copo</label>
            <div className="lj-tons">
              {tons.map((p, i) => (
                <button key={p.id} type="button" aria-label={`Copo ${p.color}`} title={p.color}
                  aria-pressed={i === cor} onClick={() => setCor(i)}
                  style={{ background: resolveColor({ name: p.color }) }} />
              ))}
            </div>
          </div>
          <div className="lj-an d5 mt-7">
            <Link to={`/loja/produto/${tons[cor]?.id}`} className="lj-btn laranja">
              Pedir este copo <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── NÚMEROS (contam do zero) ───────────────────────────── */
function Numeros({ cores, site }) {
  const [contar, setContar] = useState(false);
  const ref = useReveal({ aoEntrar: useCallback(() => setContar(true), []) });
  useEffect(() => { const t = setTimeout(() => setContar(true), 1600); return () => clearTimeout(t); }, []);

  const dados = [
    { ate: Number(site.num_copos) || 100000, mil: true, t: 'copos entregues', d: 'Para todo o Brasil, desde 2010.', w: '100%' },
    { ate: cores || 25, t: 'cores em estoque', d: 'Pronta entrega, sem espera de fábrica.', w: '62%' },
    { ate: Number(site.num_dias) || 6, t: 'dias de produção', d: 'Da prova aprovada até a transportadora.', w: '40%' },
    { ate: Number(site.num_anos) || 16, suf: 'anos', t: 'no mesmo endereço', d: 'Cambé, Paraná. Sempre a mesma equipe.', w: '78%' },
  ];

  return (
    <section ref={ref} className="lj-sec escura" id="numeros">
      <div className="lj-env">
        <div className="lj-cab">
          <p className="lj-olho claro lj-an">Em números</p>
          <h2><Mascara linhas={['O tamanho de uma', 'fábrica pequena.']} /></h2>
        </div>
      </div>
      <div className="lj-env">
        <div className="lj-nums">
          {dados.map((d, i) => (
            <div key={i} className="c">
              <div className="v">
                {contar
                  ? <CountUp to={d.mil ? Math.round(d.ate / 1000) : d.ate} suffix={d.mil ? '' : ''} />
                  : 0}
                {d.mil && <small> mil</small>}
                {d.suf && <small> {d.suf}</small>}
              </div>
              <div className="t">{d.t}</div>
              <p className="d">{d.d}</p>
              <div className="bp"><i style={{ width: contar ? d.w : 0 }} /></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── ESTATÍSTICAS (bloco editável antigo, no visual novo) ── */
function Estatisticas({ stats }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="lj-sec">
      <div className="lj-env grid grid-cols-2 lg:grid-cols-4 gap-6 text-center">
        {stats.map((s, i) => (
          <div key={i} className={`lj-an d${i} py-6`}>
            <p className="font-bold" style={{ fontSize: 'clamp(30px,4.4vw,52px)', letterSpacing: '-.05em' }}>
              <StatValue value={s.value} />
            </p>
            <p className="lj-mono mt-2" style={{ fontSize: 10.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--cinza)' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ── PILARES ────────────────────────────────────────────── */
function Pilares({ pillars, titulo, sub }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="lj-sec alt">
      <div className="lj-env">
        <div className="lj-cab">
          <p className="lj-olho lj-an">Por que a Lyon</p>
          <h2><Mascara linhas={String(titulo || '').split('\n')} /></h2>
          <p className="lj-sub lj-an d3 mt-4">{sub}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {pillars.map((p, i) => {
            const Icon = siteIcon(p.icon, 'star');
            return (
              <div key={i} className={`lj-an d${i + 1} rounded-3xl p-8`}
                style={{ background: 'var(--creme)', border: '1px solid var(--linha)' }}>
                <span className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
                  style={{ background: 'rgba(242,101,34,.12)', color: 'var(--laranja)' }}><Icon size={22} /></span>
                <h3 style={{ fontSize: 20 }}>{p.title}</h3>
                <p className="lj-sub mt-2" style={{ fontSize: 13.5 }}>{p.text}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── CATÁLOGO (busca, categorias e produtos — a parte funcional) ── */
function Catalogo({ S, activeTipo, search, setSearch, showCategoryCards, isLoading, chipCats,
                    productsByCategory, setCategory, setFilters, category, products }) {
  const ref = useReveal();
  return (
    <section className="lj-sec" id="catalogo" style={{ scrollMarginTop: 120 }}>
      <div ref={ref} className="lj-env">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
          <div className="lj-cab" style={{ marginBottom: 0 }}>
            <p className="lj-olho lj-an">{S.catalog_badge}</p>
            <h2 className="lj-an d1">{activeTipo ? activeTipo.name : S.catalog_title}</h2>
          </div>
          <div className="relative w-full sm:w-72 lj-an d2">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2" style={{ color: 'var(--cinza)' }} />
            <input className="w-full pl-11 pr-4 py-3.5 rounded-2xl outline-none text-sm"
              style={{ background: 'var(--creme2)', border: '1.4px solid var(--linha)' }}
              placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {showCategoryCards && (
          isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-80 rounded-3xl animate-pulse" style={{ background: 'var(--creme2)' }} />
              ))}
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {chipCats.map((c, idx) => (
                <CategoryCard key={c.id} cat={c} delay={(idx % 3) * 100} color={CARD_COLORS[idx % CARD_COLORS.length]}
                  items={productsByCategory.get(c.name) || []} onClick={() => setCategory(c.id)} />
              ))}
            </div>
          )
        )}

        {!showCategoryCards && (chipCats.length > 0 || activeTipo) && (
          <div className="flex gap-2 flex-wrap items-center mb-10">
            {category && (
              <button onClick={() => setCategory('')} className="lj-btn vazio" style={{ padding: '10px 18px', fontSize: 13 }}>
                <ChevronLeft size={15} /> Categorias
              </button>
            )}
            {activeTipo && (
              <button onClick={() => setFilters({ tipo: '', cat: '' })} className="lj-btn laranja"
                style={{ padding: '10px 18px', fontSize: 13 }} title="Limpar filtro de tipo">
                {activeTipo.name} <X size={14} />
              </button>
            )}
            <button onClick={() => setCategory('')} className={category ? 'lj-btn vazio' : 'lj-btn'}
              style={{ padding: '10px 20px', fontSize: 13 }}>Todos</button>
            {chipCats.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)} className={category === c.id ? 'lj-btn' : 'lj-btn vazio'}
                style={{ padding: '10px 20px', fontSize: 13 }}>{c.name}</button>
            ))}
          </div>
        )}

        {showCategoryCards ? null : isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-72 rounded-3xl animate-pulse" style={{ background: 'var(--creme2)' }} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--cinza)' }}>
            Nenhum produto encontrado. {search && 'Tente outra busca.'}
          </div>
        ) : (
          <div key={category || 'all'} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {products.map((p, idx) => (
              <Link key={p.id} to={p.kind === 'border'
                  ? `/loja/borda?type=${encodeURIComponent(p.type)}&border=${encodeURIComponent(p.border)}`
                  : `/loja/produto/${p.id}`}
                className="st-open group rounded-3xl overflow-hidden flex flex-col h-full"
                style={{ background: 'var(--creme)', border: '1px solid var(--linha)', animationDelay: `${(idx % 9) * 55}ms` }}>
                <div className="flex items-end justify-center pt-8 pb-6 relative" style={{ background: 'var(--creme2)', minHeight: 210 }}>
                  {p.image_url
                    ? <CupPhoto src={p.image_url} alt={p.name}
                        className="max-h-44 w-auto object-contain group-hover:-translate-y-2 transition-transform duration-500" />
                    : <Bottle color={p.color_label ? resolveColor({ name: p.color_label }) : CARD_COLORS[idx % CARD_COLORS.length]}
                        gradient={/degrad/i.test(p.full_name || p.name)} size={130} />}
                  {p.colors > 0 && (
                    <span className="absolute top-4 right-4 lj-mono text-white px-3 py-1 rounded-full"
                      style={{ background: 'var(--carvao)', fontSize: 10, letterSpacing: '.1em' }}>
                      {p.colors} CORES
                    </span>
                  )}
                </div>
                <div className="p-5 flex-1 flex flex-col">
                  {p.category && <span className="lj-olho" style={{ fontSize: 9.5 }}>{p.category}</span>}
                  <h3 className="mt-2 leading-tight group-hover:text-[var(--laranja)] transition-colors" style={{ fontSize: 15 }}>{p.name}</h3>
                  <div className="mt-auto pt-4 flex items-end justify-between">
                    <div>
                      <p className="lj-mono" style={{ fontSize: 9.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--cinza)' }}>
                        {p.has_tiers ? 'a partir de' : 'unidade'}
                      </p>
                      <p className="font-bold" style={{ fontSize: 19, letterSpacing: '-.03em' }}>{fmt(p.from_price)}</p>
                    </div>
                    <span className="w-9 h-9 rounded-full flex items-center justify-center transition-transform group-hover:translate-x-1"
                      style={{ background: 'var(--laranja)', color: '#fff' }}><ArrowRight size={16} /></span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ── REDES SOCIAIS ──────────────────────────────────────── */
function Social({ S, instagram, igPosts }) {
  const ref = useReveal();
  return (
    <section ref={ref} className="lj-sec alt">
      <div className="lj-env">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-10">
          <div>
            <p className="lj-olho lj-an"><Instagram size={12} className="inline mr-1.5 -mt-0.5" /> Redes sociais</p>
            <h2 className="lj-an d1 mt-3">Siga a gente</h2>
          </div>
          {instagram?.username && !S.instagram_embed && (
            <a href={`https://instagram.com/${instagram.username}`} target="_blank" rel="noopener noreferrer" className="lj-btn lj-an d2">
              <Instagram size={17} /> @{instagram.username}
            </a>
          )}
        </div>
        {S.instagram_embed ? (
          <RawEmbed html={S.instagram_embed} className="ig-embed" />
        ) : igPosts.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
            {igPosts.map((post, idx) => (
              <a key={post.id} href={post.permalink} target="_blank" rel="noopener noreferrer"
                className="lj-an group relative block aspect-square rounded-2xl overflow-hidden"
                style={{ background: 'var(--creme)', transitionDelay: `${(idx % 4) * 80}ms` }}>
                <img src={post.image} alt={post.caption?.slice(0, 80) || 'Post do Instagram'} loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
              </a>
            ))}
          </div>
        ) : null}
        {S.facebook_page_url && <div className="mt-10"><FacebookPage url={S.facebook_page_url} /></div>}
      </div>
    </section>
  );
}

/* ── FECHO EM CAMADAS ───────────────────────────────────── */
function Cartas({ showcase, S }) {
  const fotos = showcase.slice(0, 3);
  const cartas = [
    { olho: 'Para eventos grandes', h: 'Volume alto com data marcada', p: 'Impressão própria, sem terceirizar. É o que a gente mais faz.', btn: 'Falar sobre volume', href: '#catalogo', classe: 'lj-btn' },
    { olho: 'Para a sua festa', h: S.cta_title, p: S.cta_subtitle, btn: S.cta_button, href: '#catalogo', classe: 'lj-btn vazio' },
    { olho: 'Ainda com dúvida?', h: 'Fala com a gente', p: 'Resposta em até 48h úteis — normalmente no mesmo dia.', btn: 'Chamar no WhatsApp', href: '#catalogo', classe: 'lj-btn laranja' },
  ];
  return (
    <section className="lj-sec alt">
      <div className="lj-env lj-cartas">
        {cartas.map((c, i) => (
          <Reveal key={i} className="lj-carta">
            <p className={`lj-olho lj-an${i === 1 ? '' : i === 2 ? ' claro' : ''}`}
              style={i === 1 ? { color: 'rgba(255,255,255,.85)' } : undefined}>{c.olho}</p>
            <h3 className="lj-an d1">{c.h}</h3>
            <p className="lj-an d2">{c.p}</p>
            <a href={c.href} className={`${c.classe} lj-an d3`}
              style={i === 1 ? { color: '#fff', boxShadow: 'inset 0 0 0 1.4px rgba(255,255,255,.5)' } : undefined}>{c.btn}</a>
            {fotos[i] && <CupPhoto src={fotos[i].image_url} alt={fotos[i].color} />}
          </Reveal>
        ))}
      </div>
    </section>
  );
}

/* ── Card de categoria (crossfade das fotos) ────────────── */
function CategoryCard({ cat, items, color, onClick, delay = 0 }) {
  const slides = (items.length ? items : [{ id: cat.id, image_url: null, name: cat.name }]).slice(0, 6);
  const [i, setI] = useState(0);
  const ref = useReveal();

  useEffect(() => {
    if (slides.length <= 1) return;
    const start = setTimeout(() => setI(v => (v + 1) % slides.length), 600 + (delay % 300));
    const iv = setInterval(() => setI(v => (v + 1) % slides.length), 2600);
    return () => { clearTimeout(start); clearInterval(iv); };
  }, [slides.length, delay]);

  return (
    <button ref={ref} type="button" onClick={onClick}
      className="lj-an group w-full text-left rounded-3xl overflow-hidden flex flex-col h-full"
      style={{ background: 'var(--creme)', border: '1px solid var(--linha)', transitionDelay: `${delay}ms` }}>
      <div className="relative h-64 overflow-hidden flex items-end justify-center" style={{ background: 'var(--creme2)' }}>
        {slides.map((p, idx) => (
          <div key={(p.id || idx) + '-' + idx} className={`st-slide absolute inset-0 flex items-end justify-center pb-4 ${idx === i ? 'st-slide-on' : ''}`}>
            {p.image_url
              ? <CupPhoto src={p.image_url} alt="" className="max-h-52 w-auto object-contain" />
              : <Bottle color={color} gradient={/degrad/i.test(p.name || '')} size={150} />}
          </div>
        ))}
        <span className="absolute top-4 left-4 lj-mono px-3 py-1 rounded-full"
          style={{ background: 'rgba(255,249,245,.9)', color: 'var(--cinza)', fontSize: 10, letterSpacing: '.1em' }}>
          {items.length} {items.length === 1 ? 'MODELO' : 'MODELOS'}
        </span>
      </div>
      <div className="p-6 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate group-hover:text-[var(--laranja)] transition-colors" style={{ fontSize: 17 }}>{cat.name}</h3>
          <p className="lj-sub mt-1" style={{ fontSize: 13 }}>Ver todos os modelos</p>
        </div>
        <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 transition-transform group-hover:translate-x-1"
          style={{ background: 'var(--laranja)', color: '#fff' }}><ArrowRight size={17} /></span>
      </div>
    </button>
  );
}
