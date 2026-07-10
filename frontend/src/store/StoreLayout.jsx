import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Phone, Instagram, Mail, User, LogOut, Package, ChevronDown, LayoutGrid, Facebook, MessageCircle } from 'lucide-react';
import { SITE_DEFAULTS } from './siteDefaults';

// @handle limpo a partir de url/@handle/handle (para o link do Instagram)
const igHandle = v => String(v || '').trim()
  .replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/[/?].*$/, '').replace(/^@/, '');
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
  // Tipos de produto (COPOS, CANECAS...) para o menu superior, com as categorias no dropdown
  const { data: navTypes = [] } = useQuery({ queryKey: ['store-types'], queryFn: () => storeApi.get('/types') });

  const isHome = pathname === '/loja' || pathname === '/loja/';

  // Rodapé editável (Configurações → Site → Rodapé); cai no padrão / dados da empresa
  const site = store?.site || {};
  const footer = {
    about: site.footer_about || SITE_DEFAULTS.footer_about,
    phone: site.footer_phone || store?.phone || '',
    email: site.footer_email || store?.email || '',
    ig: igHandle(site.footer_instagram),
    whats: String(site.footer_whatsapp || '').replace(/\D/g, ''),
    fb: site.footer_facebook || site.facebook_page_url || '',
  };

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
        <div className="max-w-6xl mx-auto px-4 h-20 flex items-center justify-between">
          <Link to="/loja" className="flex items-center gap-3 font-black text-lg tracking-tight">
            <img src="/lyon-logo.png" alt={store?.name || 'Lyon Copos'} className="h-14 sm:h-16 w-auto object-contain drop-shadow"
              onError={e => { e.currentTarget.style.display = 'none'; }} />
            <span className="hidden sm:inline">{store?.name || 'Lyon Copos Personalizados'}</span>
          </Link>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold" />
          <div className="flex items-center gap-2 sm:gap-3">
            {customer ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <button onClick={() => navigate('/loja/pedidos')}
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors ${solid ? 'text-gray-700 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}>
                  <Package size={15} className="text-orange-500" />
                  <span className="hidden sm:inline">Meus Pedidos</span>
                </button>
                <button onClick={() => navigate('/loja/perfil')} title="Meu perfil"
                  className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-bold transition-colors ${solid ? 'text-gray-800 hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}>
                  {customer.avatar_url
                    ? <img src={customer.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-orange-300" />
                    : <span className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center"><User size={15} className="text-orange-500" /></span>}
                  <span className="hidden md:inline">Olá, {firstName}</span>
                </button>
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

        {/* Menu de tipos de produto (COPOS, CANECAS...) com dropdown de categorias */}
        {navTypes.length > 0 && (
          <nav className="bg-gray-900 text-white">
            <div className="max-w-6xl mx-auto px-4 h-11 flex items-center gap-1 overflow-x-auto md:overflow-visible">
              {navTypes.map(t => (
                <div key={t.id} className="relative group h-full flex items-center shrink-0">
                  <button onClick={() => navigate(`/loja?tipo=${t.id}#catalogo`)}
                    className="px-3 h-full flex items-center gap-1 text-xs sm:text-sm font-bold uppercase tracking-wide whitespace-nowrap hover:bg-white/10 hover:text-orange-300 transition-colors">
                    {t.name}
                    {t.categories.length > 0 && <ChevronDown size={13} className="opacity-60" />}
                  </button>
                  {t.categories.length > 0 && (
                    <div className="hidden md:group-hover:block absolute top-full left-0 bg-white text-gray-800 rounded-b-2xl shadow-2xl border border-gray-100 min-w-[240px] py-2 z-50">
                      {t.categories.map(c => (
                        <button key={c.id} onClick={() => navigate(`/loja?tipo=${t.id}&cat=${c.id}#catalogo`)}
                          className="block w-full text-left px-4 py-2 text-sm hover:bg-orange-50 hover:text-orange-600 transition-colors">
                          {c.name}
                        </button>
                      ))}
                      <button onClick={() => navigate(`/loja?tipo=${t.id}#catalogo`)}
                        className="block w-full text-left px-4 py-2 text-sm font-bold text-orange-500 hover:bg-orange-50 border-t border-gray-100 mt-1">
                        Ver tudo de {t.name}
                      </button>
                    </div>
                  )}
                </div>
              ))}
              <button onClick={() => navigate('/loja#catalogo')}
                className="px-3 h-full flex items-center gap-1.5 text-xs sm:text-sm font-bold uppercase tracking-wide whitespace-nowrap hover:bg-white/10 hover:text-orange-300 transition-colors shrink-0 ml-auto">
                <LayoutGrid size={14} /> Todas categorias
              </button>
            </div>
          </nav>
        )}
      </header>

      {/* espaçador quando a navbar é sólida fora da home */}
      {!isHome && <div className={navTypes.length > 0 ? 'h-[7.75rem]' : 'h-20'} />}

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300">
        <div className="max-w-6xl mx-auto px-4 py-12 grid sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-2.5 font-black text-white text-lg">
              <img src="/lyon-logo.png" alt={store?.name || 'Lyon Copos'} className="h-9 w-auto object-contain"
                onError={e => { e.currentTarget.style.display = 'none'; }} />
              {store?.name || 'Lyon Copos Personalizados'}
            </div>
            <p className="text-sm text-gray-400 mt-3 max-w-xs">
              {footer.about}
            </p>
            {/* Redes sociais — ícones clicáveis (só aparecem os preenchidos) */}
            {(footer.ig || footer.fb || footer.whats) && (
              <div className="flex items-center gap-2 mt-4">
                {footer.ig && (
                  <a href={`https://instagram.com/${footer.ig}`} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-orange-500 flex items-center justify-center transition-colors"><Instagram size={16} /></a>
                )}
                {footer.fb && (
                  <a href={footer.fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-orange-500 flex items-center justify-center transition-colors"><Facebook size={16} /></a>
                )}
                {footer.whats && (
                  <a href={`https://wa.me/${footer.whats.length <= 11 ? '55' + footer.whats : footer.whats}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-orange-500 flex items-center justify-center transition-colors"><MessageCircle size={16} /></a>
                )}
              </div>
            )}
          </div>
          <div>
            <p className="text-white font-bold mb-3">Contato</p>
            <div className="space-y-2 text-sm">
              {footer.phone && <a href={`tel:${footer.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 hover:text-orange-400 transition-colors"><Phone size={14} className="text-orange-400" /> {footer.phone}</a>}
              {footer.email && <a href={`mailto:${footer.email}`} className="flex items-center gap-2 hover:text-orange-400 transition-colors"><Mail size={14} className="text-orange-400" /> {footer.email}</a>}
              {footer.ig && <a href={`https://instagram.com/${footer.ig}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-orange-400 transition-colors"><Instagram size={14} className="text-orange-400" /> @{footer.ig}</a>}
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
