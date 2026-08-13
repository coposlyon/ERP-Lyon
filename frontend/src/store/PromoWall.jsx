import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Heart, X, Clock, ArrowRight } from 'lucide-react';
import storeApi from './storeApi';
import { Reveal } from './Reveal';
import { visitorId } from './visitor';

const CHAVE = ['store-promos'];
const dataBR = d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR');

/**
 * Mural de promoções no estilo de um feed: a arte é o conteúdo, quem entra
 * curte sem login e clicar na foto abre em tela cheia.
 */
export default function PromoWall({ badge, title, subtitle }) {
  const qc = useQueryClient();
  // guarda o id, não a promoção: assim a tela cheia enxerga a curtida nova
  const [aberta, setAberta] = useState(null);   // { id, origem }

  const { data: promos = [] } = useQuery({
    queryKey: CHAVE,
    queryFn: () => storeApi.get(`/promos?visitor=${encodeURIComponent(visitorId())}`),
  });
  const emFoco = aberta && promos.find(p => p.id === aberta.id);

  // Curtida otimista: o coração responde na hora e o servidor confirma depois.
  const curtir = useCallback(async (promo) => {
    const querCurtir = !promo.liked;
    const aplica = (fn) => qc.setQueryData(CHAVE, (old = []) => old.map(p => p.id === promo.id ? fn(p) : p));
    aplica(p => ({ ...p, liked: querCurtir, likes: Math.max(0, p.likes + (querCurtir ? 1 : -1)) }));
    try {
      const r = await storeApi.post(`/promos/${promo.id}/curtir`, { visitor: visitorId(), liked: querCurtir });
      aplica(p => ({ ...p, liked: r.liked, likes: r.likes }));
    } catch {
      qc.invalidateQueries({ queryKey: CHAVE });   // deu errado: volta ao que o servidor sabe
    }
  }, [qc]);

  if (!promos.length) return null;

  return (
    // Mais larga que o resto da página de propósito: aqui a arte é o produto,
    // e no contêiner padrão ela ficava pequena com folga branca sobrando.
    <section id="promocoes" className="lj-sec" style={{ scrollMarginTop: 120 }}>
      <div className="lj-env" style={{ maxWidth: 1500 }}>
        <div className="lj-cab">
          <p className="lj-olho">{badge}</p>
          <h2>{title}</h2>
          <p className="lj-sub mt-4">{subtitle}</p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {promos.map((p, i) => (
            <PromoCard key={p.id} promo={p} delay={(i % 3) * 100}
              onCurtir={() => curtir(p)}
              onAbrir={(origem) => setAberta({ id: p.id, origem })} />
          ))}
        </div>
      </div>

      {emFoco && (
        <PromoLightbox promo={emFoco} origem={aberta.origem}
          onCurtir={() => curtir(emFoco)} onFechar={() => setAberta(null)} />
      )}
    </section>
  );
}

function PromoCard({ promo, delay, onCurtir, onAbrir }) {
  const imgRef = useRef(null);
  const [pulo, setPulo] = useState(0);            // reinicia a animação do coração

  function curtiu(e) {
    e.stopPropagation();
    if (!promo.liked) setPulo(n => n + 1);
    onCurtir();
  }

  return (
    <Reveal delay={delay} scale>
      <article className="st-card group rounded-3xl overflow-hidden h-full flex flex-col"
        style={{ background: 'var(--creme)', border: '1px solid var(--linha)' }}>
        <button type="button" onClick={() => onAbrir(imgRef.current?.getBoundingClientRect())}
          className="relative block overflow-hidden cursor-zoom-in" style={{ background: 'var(--creme2)' }}
          aria-label={`Ampliar ${promo.title || 'promoção'}`}>
          <img ref={imgRef} src={promo.image_url} alt={promo.title || 'Promoção'} loading="lazy"
            className="w-full h-auto object-cover group-hover:scale-105 transition-transform duration-700" />
          {promo.badge && (
            <span className="absolute top-4 left-4 text-white text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: 'var(--laranja)' }}>
              {promo.badge}
            </span>
          )}
        </button>

        <div className="p-5 flex flex-col gap-3 flex-1">
          <div className="flex items-center gap-3">
            <BotaoCurtir promo={promo} pulo={pulo} onClick={curtiu} />
            {promo.until && (
              <span className="lj-mono flex items-center gap-1 ml-auto"
                style={{ fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--cinza)' }}>
                <Clock size={11} /> até {dataBR(promo.until)}
              </span>
            )}
          </div>
          {promo.title && <h3 style={{ fontSize: 15.5, letterSpacing: '-.025em' }}>{promo.title}</h3>}
          {promo.link && (
            <LinkPromo link={promo.link}
              className="mt-auto inline-flex items-center gap-1.5 text-sm font-semibold"
              style={{ color: 'var(--laranja)' }}>
              Ver produto <ArrowRight size={15} />
            </LinkPromo>
          )}
        </div>
      </article>
    </Reveal>
  );
}

function BotaoCurtir({ promo, pulo, onClick, grande = false, claro = false }) {
  const apagado = claro ? 'text-white/70 hover:text-rose-400' : 'text-gray-400 hover:text-rose-500';
  return (
    <button type="button" onClick={onClick} aria-pressed={promo.liked}
      aria-label={promo.liked ? 'Descurtir' : 'Curtir'}
      className={`group/like flex items-center gap-2 font-bold transition-colors ${grande ? 'text-base' : 'text-sm'} ${promo.liked ? 'text-rose-500' : apagado}`}>
      <Heart key={pulo} size={grande ? 26 : 22}
        className={`transition-transform group-hover/like:scale-110 ${promo.liked ? 'fill-rose-500 st-heart-pop' : ''}`} />
      <span className="tabular-nums">{promo.likes}</span>
    </button>
  );
}

// Link interno vira navegação de SPA; externo abre em outra aba.
function LinkPromo({ link, className, style, children }) {
  const l = String(link || '').trim();
  if (l.startsWith('/')) return <Link to={l} className={className} style={style}>{children}</Link>;
  return <a href={l} target="_blank" rel="noopener noreferrer" className={className} style={style}>{children}</a>;
}

/**
 * Tela cheia da arte. A foto sai de onde estava no card e cresce até o centro
 * (e volta para o mesmo lugar ao fechar) — a imagem parece a mesma o tempo
 * todo, em vez de uma janela que aparece por cima.
 */
function PromoLightbox({ promo, origem, onCurtir, onFechar }) {
  const imgRef = useRef(null);
  const fundoRef = useRef(null);
  const fechando = useRef(false);
  const [pulo, setPulo] = useState(0);

  // Anima entre o retângulo do card (origem) e o da tela cheia (destino).
  const voa = useCallback((paraOCard) => {
    const el = imgRef.current;
    if (!el || !origem) return null;
    const fim = el.getBoundingClientRect();
    if (!fim.width || !fim.height) return null;
    const dx = (origem.left + origem.width / 2) - (fim.left + fim.width / 2);
    const dy = (origem.top + origem.height / 2) - (fim.top + fim.height / 2);
    const escala = origem.width / fim.width;
    const noCard = { transform: `translate(${dx}px, ${dy}px) scale(${escala})`, opacity: 0.6 };
    const cheia  = { transform: 'none', opacity: 1 };
    return el.animate(paraOCard ? [cheia, noCard] : [noCard, cheia],
      { duration: paraOCard ? 300 : 420, easing: paraOCard ? 'cubic-bezier(.4,0,.7,.2)' : 'cubic-bezier(.16,1,.3,1)' });
  }, [origem]);

  const fechar = useCallback(() => {
    if (fechando.current) return;
    fechando.current = true;
    fundoRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: 'forwards' });
    const a = voa(true);
    if (a) a.onfinish = onFechar; else onFechar();
    setTimeout(onFechar, 340);                       // rede de segurança
  }, [voa, onFechar]);

  useEffect(() => {
    voa(false);
    fundoRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
    const tecla = e => { if (e.key === 'Escape') fechar(); };
    document.addEventListener('keydown', tecla);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';         // nada de rolar o fundo
    return () => { document.removeEventListener('keydown', tecla); document.body.style.overflow = overflow; };
  }, [voa, fechar]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8" role="dialog" aria-modal="true"
      aria-label={promo.title || 'Promoção'} onClick={fechar}>
      <div ref={fundoRef} className="absolute inset-0 bg-gray-900/85 backdrop-blur-sm" />

      <button type="button" onClick={fechar} aria-label="Fechar"
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors">
        <X size={22} />
      </button>

      <figure className="relative max-h-full flex flex-col items-center gap-4" onClick={e => e.stopPropagation()}>
        <img ref={imgRef} src={promo.image_url} alt={promo.title || 'Promoção'}
          className="max-h-[74vh] w-auto max-w-full rounded-2xl shadow-2xl" />
        <figcaption className="flex items-center gap-5 text-white">
          <BotaoCurtir promo={promo} pulo={pulo} grande claro
            onClick={e => { e.stopPropagation(); if (!promo.liked) setPulo(n => n + 1); onCurtir(); }} />
          {promo.title && <span className="font-bold">{promo.title}</span>}
          {promo.link && (
            <LinkPromo link={promo.link} className="inline-flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 transition-colors px-4 py-2 rounded-xl font-bold text-sm">
              Ver produto <ArrowRight size={15} />
            </LinkPromo>
          )}
        </figcaption>
      </figure>
    </div>
  );
}
