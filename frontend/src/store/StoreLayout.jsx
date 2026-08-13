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
    ig: igHandle(site.footer_instagram) || 'lyon_copos',
    whats: String(site.footer_whatsapp || store?.phone || '').replace(/\D/g, ''),
    fb: site.footer_facebook || site.facebook_page_url || '',
  };
  // WhatsApp com DDI: até 11 dígitos assume Brasil (55).
  const whatsFull = footer.whats ? (footer.whats.length <= 11 ? '55' + footer.whats : footer.whats) : '';
  const igUrl = `https://www.instagram.com/${footer.ig}/`;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // navbar transparente só sobre o hero da home
  const solid = scrolled || !isHome;

  return (
    <div className="lj min-h-screen flex flex-col">
      {/* Header — creme translúcido sobre o herói, sólido depois de rolar */}
      <header className={`fixed top-0 inset-x-0 z-40 transition-all duration-300 ${solid ? 'backdrop-blur' : ''}`}
        style={solid ? { background: 'rgba(255,249,245,.9)', boxShadow: '0 1px 0 var(--linha)' } : undefined}>
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
                  className={`flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5`}>
                  <Package size={15} className="text-orange-500" />
                  <span className="hidden sm:inline">Meus Pedidos</span>
                </button>
                <button onClick={() => navigate('/loja/perfil')} title="Meu perfil"
                  className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm font-semibold transition-colors hover:bg-black/5">
                  {customer.avatar_url
                    ? <img src={customer.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover ring-2 ring-orange-300" />
                    : <span className="w-7 h-7 rounded-full bg-orange-100 flex items-center justify-center"><User size={15} className="text-orange-500" /></span>}
                  <span className="hidden md:inline">Olá, {firstName}</span>
                </button>
                <button onClick={() => { logout(); navigate('/loja'); }} title="Sair"
                  className="p-2 rounded-lg transition-colors hover:bg-black/5" style={{ color: 'var(--cinza)' }}>
                  <LogOut size={17} />
                </button>
              </div>
            ) : (
              <button onClick={() => navigate('/loja/login')}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl font-bold text-sm transition-all hover:scale-105 hover:bg-black/5`}>
                <User size={16} />
                <span className="hidden sm:inline">Entrar</span>
              </button>
            )}
            <button onClick={() => navigate('/loja/carrinho')} className="lj-btn laranja relative"
              style={{ padding: '11px 20px', fontSize: 13.5 }}>
              <ShoppingCart size={16} />
              <span className="hidden sm:inline">Carrinho</span>
              {count > 0 && (
                <span className="absolute -top-2 -right-2 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center"
                  style={{ background: 'var(--carvao)', color: 'var(--creme)' }}>
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Menu de tipos de produto (COPOS, CANECAS...) com dropdown de categorias */}
        {navTypes.length > 0 && (
          <nav className="text-[var(--creme)]" style={{ background: 'var(--carvao)' }}>
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
      <footer className="text-[var(--cinza2)]" style={{ background: 'var(--carvao)' }}>
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
                  <a href={igUrl} target="_blank" rel="noopener noreferrer" aria-label="Instagram"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-orange-500 flex items-center justify-center transition-colors"><Instagram size={16} /></a>
                )}
                {footer.fb && (
                  <a href={footer.fb} target="_blank" rel="noopener noreferrer" aria-label="Facebook"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-orange-500 flex items-center justify-center transition-colors"><Facebook size={16} /></a>
                )}
                {whatsFull && (
                  <a href={`https://wa.me/${whatsFull}`} target="_blank" rel="noopener noreferrer" aria-label="WhatsApp"
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
              {footer.ig && <a href={igUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-orange-400 transition-colors"><Instagram size={14} className="text-orange-400" /> @{footer.ig}</a>}
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

      {/* Redes sociais flutuantes — visíveis e clicáveis em todas as páginas */}
      <div className="fixed right-4 bottom-4 z-40 flex flex-col gap-3">
        {whatsFull && (
          <a href={`https://wa.me/${whatsFull}`} target="_blank" rel="noopener noreferrer" aria-label="Falar no WhatsApp" title="WhatsApp"
            className="w-12 h-12 rounded-full shadow-lg text-white flex items-center justify-center transition-transform hover:scale-110"
            style={{ background: '#25D366' }}>
            <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.71.306 1.263.489 1.694.625.712.227 1.36.195 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </a>
        )}
        <a href={igUrl} target="_blank" rel="noopener noreferrer" aria-label="Ver no Instagram" title="Instagram"
          className="w-12 h-12 rounded-full shadow-lg text-white flex items-center justify-center transition-transform hover:scale-110"
          style={{ background: 'radial-gradient(circle at 30% 107%, #fdf497 0%, #fdf497 5%, #fd5949 45%, #d6249f 60%, #285AEB 90%)' }}>
          <Instagram size={22} />
        </a>
      </div>
    </div>
  );
}
