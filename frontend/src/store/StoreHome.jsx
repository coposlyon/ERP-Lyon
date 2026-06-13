import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search, Palette, ShieldCheck, Sparkles, ArrowRight } from 'lucide-react';
import storeApi from './storeApi';
import Bottle from './Bottle';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const CARD_COLORS = ['#F26522', '#1E4FD8', '#2BB7B3', '#EC1C8E', '#2E9E32', '#7E3FF2', '#FFD400', '#E11D22'];

export default function StoreHome() {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');

  const { data: categories = [] } = useQuery({ queryKey: ['store-cats'], queryFn: () => storeApi.get('/categories') });
  const { data: products = [], isLoading } = useQuery({
    queryKey: ['store-products', search, category],
    queryFn: () => storeApi.get(`/products?${new URLSearchParams({ ...(search ? { search } : {}), ...(category ? { category } : {}) })}`),
  });

  return (
    <div>
      {/* Hero */}
      <section className="bg-gradient-to-br from-gray-900 via-gray-900 to-orange-900/40 text-white">
        <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20 grid sm:grid-cols-2 gap-8 items-center">
          <div>
            <span className="inline-block bg-orange-500 text-xs font-bold px-3 py-1 rounded-full mb-4">PERSONALIZADOS</span>
            <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight">
              Copos e garrafas <span className="text-orange-400">com a cara da sua marca</span>
            </h1>
            <p className="text-gray-300 mt-4 text-lg">
              Dezenas de cores, impressão de alta definição e personalização com precisão.
              Monte seu pedido e receba o orçamento na hora.
            </p>
            <a href="#catalogo" className="inline-flex items-center gap-2 bg-orange-500 hover:bg-orange-600 transition-colors mt-6 px-6 py-3 rounded-xl font-semibold">
              Ver catálogo <ArrowRight size={18} />
            </a>
          </div>
          <div className="hidden sm:flex justify-center items-end gap-1">
            {CARD_COLORS.slice(0, 5).map((c, i) => (
              <div key={c} style={{ transform: `translateY(${Math.abs(i - 2) * 10}px)` }}>
                <Bottle color={c} gradient={i % 2 === 0} size={i === 2 ? 130 : 100} />
              </div>
            ))}
          </div>
        </div>
        {/* Selos */}
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-4 grid grid-cols-3 gap-4 text-center text-xs sm:text-sm">
            <div className="flex items-center justify-center gap-2"><ShieldCheck size={16} className="text-orange-400" /> Qualidade premium · BPA Free</div>
            <div className="flex items-center justify-center gap-2"><Palette size={16} className="text-orange-400" /> Diversas cores e combinações</div>
            <div className="flex items-center justify-center gap-2"><Sparkles size={16} className="text-orange-400" /> Impressão de alta definição</div>
          </div>
        </div>
      </section>

      {/* Catálogo */}
      <section id="catalogo" className="max-w-6xl mx-auto px-4 py-10">
        <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
          <h2 className="text-2xl font-bold">Catálogo</h2>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm"
              placeholder="Buscar produto..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>

        {/* Categorias */}
        {categories.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-6">
            <button onClick={() => setCategory('')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${!category ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
              Todos
            </button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)}
                className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${category === c.id ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {c.name}
              </button>
            ))}
          </div>
        )}

        {/* Grid de produtos */}
        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 bg-white rounded-2xl animate-pulse" />)}
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-16 text-gray-400">Nenhum produto encontrado.</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {products.map((p, idx) => (
              <Link key={p.id} to={`/loja/produto/${p.id}`}
                className="group bg-white rounded-2xl border border-gray-100 hover:border-orange-200 hover:shadow-xl transition-all overflow-hidden flex flex-col">
                <div className="bg-gradient-to-b from-gray-50 to-white flex items-center justify-center py-6 relative">
                  <Bottle color={CARD_COLORS[idx % CARD_COLORS.length]} gradient={/degrad/i.test(p.name)} size={120} />
                  {p.colors > 0 && (
                    <span className="absolute top-3 right-3 bg-gray-900 text-white text-xs font-bold px-2.5 py-1 rounded-full">
                      {p.colors} cores
                    </span>
                  )}
                </div>
                <div className="p-4 flex-1 flex flex-col">
                  {p.category && <span className="text-xs text-orange-500 font-semibold uppercase tracking-wide">{p.category}</span>}
                  <h3 className="font-bold text-gray-900 leading-tight mt-0.5 group-hover:text-orange-600 transition-colors">{p.name}</h3>
                  <div className="mt-auto pt-3 flex items-end justify-between">
                    <div>
                      <p className="text-xs text-gray-400">{p.has_tiers ? 'a partir de' : 'unidade'}</p>
                      <p className="text-lg font-extrabold text-gray-900">{fmt(p.from_price)}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600">
                      Ver <ArrowRight size={15} />
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
