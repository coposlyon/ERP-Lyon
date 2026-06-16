import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Droplet, Phone, Instagram, Mail, User, LogOut } from 'lucide-react';
import storeApi from './storeApi';
import { useCart } from './CartContext';
import { useStoreAuth } from './StoreAuthContext';

export default function StoreLayout({ children }) {
  const { count } = useCart();
  const { customer, logout } = useStoreAuth();
  const navigate = useNavigate();
  const firstName = (customer?.name || '').trim().split(/\s+/)[0];
  const { pathname } = useLocation();
  const [scrolled, setScrolled] = useState(false);
  const { data: store } = useQuery({ queryKey: ['store-info'], queryFn: () => storeApi.get('/store') });

  const isHome = pathname === '/loja' || pathname === '/loja/';

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // navbar transparente só sobre o hero da home
  const solid = scrolled || !isHome;

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${solid ? 'bg-white/90 backdrop-blur shadow-sm text-gray-900' : 'bg-transparent text-white'}`}>
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/loja" className="flex items-center gap-2 font-black text-lg tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center st-pulse">
              <Droplet size={18} className="text-white" />
            </span>
            <span>{store?.name || 'Loja'}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold">
            <a href="/loja#catalogo" className={`hover:text-orange-500 transition-colors ${solid ? '' : 'text-white/90'}`}>Catálogo</a>
            <a href="/loja#cores" className={`hover:text-orange-500 transition-colors ${solid ? '' : 'text-white/90'}`}>Cores</a>
          </nav>
          <div className="flex items-center gap-2 sm:gap-3">
            {customer ? (
              <div className="flex items-center gap-2">
                <span className={`hidden sm:flex items-center gap-1.5 text-sm font-bold ${solid ? 'text-gray-800' : 'text-white'}`}>
                  <User size={15} className="text-orange-500" /> Olá, {firstName}
                </span>
                <button onClick={() => { logout(); navigate('/loja'); }} title="Sair"
                  className={`p-2 rounded-lg transition-colors ${solid ? 'hover:bg-gray-100 text-gray-500' : 'hover:bg-white/10 text-white/80'}`}>
                  <LogOut size={17} />
                </button>
              </div>
            ) : (
              <button onClick={() => navigate('/loja/login')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm transition-all hover:scale-105 ${solid ? 'text-gray-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}>
                <User size={16} />
                <span className="hidden sm:inline">Entrar</span>
              </button>
            )}
            <button onClick={() => navigate('/loja/carrinho')}
              className="relative flex items-center gap-2 bg-orange-500 hover:bg-orange-600 transition-all hover:scale-105 px-4 py-2 rounded-xl font-bold text-sm text-white shadow-lg shadow-orange-500/25">
              <ShoppingCart size={17} />
              <span className="hidden sm:inline">Carrinho</span>
              {count > 0 && (
                <span className="absolute -top-2 -right-2 bg-white text-orange-600 text-xs font-black w-5 h-5 rounded-full flex items-center justify-center animate-bounce">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* espaçador quando a navbar é sólida fora da home */}
      {!isHome && <div className="h-16" />}

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300">
        <div className="max-w-6xl mx-auto px-4 py-12 grid sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2 font-black text-white text-lg">
              <span className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center"><Droplet size={15} /></span>
              {store?.name || 'Loja'}
            </div>
            <p className="text-sm text-gray-400 mt-3 max-w-xs">
              Copos e garrafas personalizados. Personalize do seu jeito, com a cara da sua marca.
            </p>
          </div>
          <div>
            <p className="text-white font-bold mb-3">Contato</p>
            <div className="space-y-2 text-sm">
              {store?.phone && <p className="flex items-center gap-2"><Phone size={14} className="text-orange-400" /> {store.phone}</p>}
              {store?.email && <p className="flex items-center gap-2"><Mail size={14} className="text-orange-400" /> {store.email}</p>}
              <p className="flex items-center gap-2"><Instagram size={14} className="text-orange-400" /> @suamarca</p>
            </div>
          </div>
          <div>
            <p className="text-white font-bold mb-3">Loja</p>
            <div className="space-y-2 text-sm">
              <Link to="/loja" className="block hover:text-orange-400 transition-colors">Início</Link>
              <a href="/loja#catalogo" className="block hover:text-orange-400 transition-colors">Catálogo</a>
              <a href="/loja#cores" className="block hover:text-orange-400 transition-colors">Cores</a>
              <Link to="/loja/carrinho" className="block hover:text-orange-400 transition-colors">Carrinho</Link>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10">
          <div className="max-w-6xl mx-auto px-4 py-4 text-xs text-gray-500 text-center">
            © {new Date().getFullYear()} {store?.name || 'Loja'}. Todos os direitos reservados.
          </div>
        </div>
      </footer>
    </div>
  );
}
