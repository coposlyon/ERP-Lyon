import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ArrowRight } from 'lucide-react';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { Reveal } from './Reveal';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const CARD_COLORS = ['#F26522', '#1E4FD8', '#2BB7B3', '#EC1C8E', '#2E9E32', '#7E3FF2', '#FFD400', '#E11D22'];
// "Borda Holográfica Dourado" em vez do BORDA GRITADO em maiúsculas
const titleCase = s => String(s || '').toLowerCase().replace(/(^|\s)\p{L}/gu, m => m.toUpperCase());

// Nível 2 do catálogo com borda: escolhida uma cor de borda (ex.: BORDA
// HOLOGRÁFICA DOURADO) para um tipo (ex.: LONG DRINK TRADICIONAL), lista todas
// as cores de copo disponíveis com aquela borda. Cada uma leva ao produto.
export default function BorderPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const type = params.get('type') || '';
  const border = params.get('border') || '';

  const { data, isLoading } = useQuery({
    queryKey: ['store-border', type, border],
    queryFn: () => storeApi.get(`/products/border?${new URLSearchParams({ type, border })}`),
    enabled: !!(type && border),
  });
  const items = data?.items || [];

  return (
    <main className="min-h-screen bg-gray-50">
      <section className="max-w-6xl mx-auto px-4 pt-28 pb-20">
        <button onClick={() => navigate(-1)}
          className="inline-flex items-center gap-1 text-sm font-bold text-gray-600 hover:text-orange-600 transition-colors mb-6">
          <ChevronLeft size={16} /> Voltar
        </button>

        <span className="text-xs text-orange-500 font-bold uppercase tracking-wide">{titleCase(type)}</span>
        <h1 className="text-3xl sm:text-4xl font-black text-gray-900 leading-tight mt-1">{titleCase(border)}</h1>
        <p className="text-gray-500 mt-2">
          Escolha a cor do copo com esta borda{items.length ? ` — ${items.length} ${items.length === 1 ? 'opção' : 'opções'}` : ''}.
        </p>

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-72 bg-white rounded-3xl animate-pulse" />)}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            Nenhuma cor de copo encontrada para esta borda.{' '}
            <Link to="/loja#catalogo" className="text-orange-600 font-semibold">Voltar ao catálogo</Link>.
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {items.map((p, idx) => (
              <Reveal key={p.id} delay={(idx % 9) * 50} scale>
                <Link to={`/loja/produto/${p.id}`}
                  className="st-card group bg-white rounded-3xl border border-gray-100 overflow-hidden flex flex-col h-full">
                  <div className="bg-gradient-to-b from-gray-50 to-white flex items-center justify-center py-8 relative overflow-hidden h-52">
                    <div className="absolute w-40 h-40 rounded-full bg-orange-100/40 blur-2xl group-hover:bg-orange-200/50 transition-colors" />
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} className="relative max-h-44 w-auto object-contain group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="relative group-hover:scale-110 group-hover:-rotate-3 transition-transform duration-500">
                        <Bottle color={CARD_COLORS[idx % CARD_COLORS.length]} gradient={/degrad/i.test(type)} size={130} />
                      </div>
                    )}
                  </div>
                  <div className="p-5 flex-1 flex flex-col">
                    <span className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Cor do copo</span>
                    <h3 className="font-extrabold text-gray-900 leading-tight mt-1 group-hover:text-orange-600 transition-colors">
                      {titleCase(p.cup)}
                    </h3>
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
              </Reveal>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
