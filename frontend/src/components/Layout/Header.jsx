import {
  Menu, Bell, Search, X, Sun, Moon, LogOut, ChevronDown, LayoutGrid,
  LayoutDashboard, ShoppingCart, ClipboardList, Package, Users, Truck,
  ShoppingBag, Boxes, Factory, Wallet, Calculator, CalendarDays, Receipt,
  MapPin, Target, Megaphone, UserCog, BarChart3, Settings, Palette, RotateCcw, FlaskConical,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

// Atalhos de módulos no topo — mesmo controle de permissão do menu lateral
const MODULES = [
  { label: 'Dashboard',        path: '/',            icon: LayoutDashboard },
  { label: 'Pedidos de Venda', path: '/sales',       icon: ShoppingCart,  module: 'sales' },
  { label: 'Orçamentos',       path: '/quotes',      icon: ClipboardList, module: 'quotes' },
  { label: 'Personalização',   path: '/customizations', icon: Palette,    module: 'customizations' },
  { label: 'Produtos',         path: '/products',    icon: Package,       module: 'products' },
  { label: 'Clientes',         path: '/customers',   icon: Users,         module: 'customers' },
  { label: 'Fornecedores',     path: '/suppliers',   icon: Truck,         module: 'suppliers' },
  { label: 'Compras',          path: '/purchases',   icon: ShoppingBag,   module: 'purchases' },
  { label: 'Estoque',          path: '/stock',       icon: Boxes,         module: 'stock' },
  { label: 'Produção',         path: '/production',  icon: Factory,       module: 'production' },
  { label: 'Central de Contas', path: '/contas',     icon: CalendarDays,  module: 'financial' },
  { label: 'Precificação',     path: '/pricing',     icon: Calculator,    module: 'financial' },
  { label: 'Financeiro',       path: '/financial',   icon: Wallet,        module: 'financial' },
  { label: 'Fiscal / NF-e',    path: '/fiscal',      icon: Receipt,       module: 'fiscal' },
  { label: 'Logística',        path: '/logistics',   icon: MapPin,        module: 'logistics' },
  { label: 'Devoluções',       path: '/returns',     icon: RotateCcw,     module: 'returns' },
  { label: 'Qualidade',        path: '/quality',     icon: FlaskConical,  module: 'quality' },
  { label: 'CRM',              path: '/crm',         icon: Target,        module: 'crm' },
  { label: 'Marketing',        path: '/marketing',   icon: Megaphone,     module: 'marketing' },
  { label: 'RH',               path: '/hr',          icon: UserCog,       module: 'hr' },
  { label: 'Relatórios',       path: '/reports',     icon: BarChart3,     module: 'reports' },
  { label: 'Configurações',    path: '/settings',    icon: Settings,      module: 'settings' },
];

export default function Header({ onToggleSidebar, onToggleMobileSidebar }) {
  const { user, tenant, logout, hasModule } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  const navigate = useNavigate();

  const visibleModules = MODULES.filter(m => !m.module || hasModule(m.module));

  function goModule(path) {
    setModulesOpen(false);
    navigate(path);
  }

  async function handleLogout() {
    setMenuOpen(false);
    await logout();
    navigate('/login');
  }

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/products?search=${encodeURIComponent(search)}`);
      setSearch('');
      setSearchOpen(false);
    }
  }

  const headerStyle = isDark
    ? { background: '#1f2937', borderBottom: '1px solid #374151', flexShrink: 0 }
    : { background: '#ffffff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 };

  const inputStyle = isDark
    ? {
        background: '#111827',
        border: '1px solid #374151',
        color: '#f9fafb',
        outline: 'none',
        borderRadius: '0.5rem',
        padding: '0.375rem 0.75rem 0.375rem 2.25rem',
        fontSize: '0.875rem',
        width: '100%',
      }
    : {
        background: '#f9fafb',
        border: '1px solid #e5e7eb',
        color: '#111827',
        outline: 'none',
        borderRadius: '0.5rem',
        padding: '0.375rem 0.75rem 0.375rem 2.25rem',
        fontSize: '0.875rem',
        width: '100%',
      };

  const iconCls = isDark
    ? 'p-2 rounded-lg transition-colors hover:bg-gray-700 text-gray-400 flex items-center justify-center'
    : 'p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500 flex items-center justify-center';

  const searchIconColor = isDark ? '#6b7280' : '#9ca3af';

  return (
    <header
      className="relative h-14 lg:h-16 flex items-center gap-2 px-3 lg:px-6"
      style={headerStyle}
    >
      {/* Botão menu — mobile */}
      <button onClick={onToggleMobileSidebar} className={`${iconCls} lg:hidden`} aria-label="Abrir menu">
        <Menu size={20} />
      </button>
      {/* Botão menu — desktop */}
      <button onClick={onToggleSidebar} className={`${iconCls} hidden lg:flex`} aria-label="Colapsar menu">
        <Menu size={20} />
      </button>

      {/* Módulos — atalho rápido no topo */}
      <div className="relative">
        <button
          onClick={() => setModulesOpen(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'}`}
          aria-label="Abrir módulos"
        >
          <LayoutGrid size={17} className={modulesOpen ? 'text-primary-500' : ''} />
          <span className="hidden sm:inline">Módulos</span>
          <ChevronDown size={13} className={`transition-transform ${modulesOpen ? 'rotate-180' : ''}`} />
        </button>

        {modulesOpen && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setModulesOpen(false)} />
            <div
              className="absolute left-0 mt-2 w-[560px] max-w-[92vw] rounded-2xl shadow-2xl z-40 p-3 grid grid-cols-3 sm:grid-cols-4 gap-1"
              style={{
                background: isDark ? '#1f2937' : '#ffffff',
                border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
              }}
            >
              {visibleModules.map(m => (
                <button
                  key={m.path}
                  onClick={() => goModule(m.path)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 text-xs font-medium transition-colors ${
                    isDark ? 'text-gray-300 hover:bg-gray-700' : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'}`}
                >
                  <m.icon size={20} className="text-primary-500" />
                  <span className="text-center leading-tight">{m.label}</span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Nome do sistema — só mobile */}
      <div className="flex-1 flex items-center gap-2 lg:hidden">
        <span className={`text-sm font-bold truncate ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
          {tenant?.app_name || 'Lyon Copos'}
        </span>
      </div>

      {/* Espaçador (a busca global do topo foi removida; ainda dá pra abrir por Ctrl+K) */}
      <div className="hidden lg:flex flex-1" />

      {/* Ações direita */}
      <div className="flex items-center gap-1 lg:gap-1.5 ml-auto">
        {/* Busca mobile — abre a paleta global */}
        <button onClick={() => window.dispatchEvent(new Event('open-global-search'))} className={`${iconCls} lg:hidden`} aria-label="Buscar">
          <Search size={18} />
        </button>

        {/* Toggle Tema — Sol / Lua */}
        <button
          onClick={toggleTheme}
          className={iconCls}
          aria-label={isDark ? 'Ativar modo claro' : 'Ativar modo escuro'}
          title={isDark ? 'Modo claro' : 'Modo escuro'}
        >
          {isDark
            ? <Sun size={18} className="text-yellow-400" />
            : <Moon size={18} />}
        </button>

        {/* Notificações */}
        <button className={`${iconCls} relative`} aria-label="Notificações">
          <Bell size={18} />
        </button>

        {/* Avatar + nome + menu (logout) */}
        <div className="relative ml-1">
          <button
            onClick={() => setMenuOpen(v => !v)}
            className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100'}`}
            aria-label="Menu do usuário"
          >
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #E8187A 0%, #B80F5E 100%)' }}>
              <span className="text-white text-xs font-semibold">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="hidden sm:block text-left">
              <p className={`text-sm font-medium leading-none ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>
                {user?.name}
              </p>
              <p className={`text-xs capitalize mt-0.5 ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>
                {user?.role}
              </p>
            </div>
            <ChevronDown size={15} className={`hidden sm:block transition-transform ${menuOpen ? 'rotate-180' : ''} ${isDark ? 'text-gray-500' : 'text-gray-400'}`} />
          </button>

          {menuOpen && (
            <>
              {/* backdrop para fechar ao clicar fora */}
              <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
              <div
                className="absolute right-0 mt-2 w-52 rounded-xl shadow-lg z-40 overflow-hidden"
                style={{
                  background: isDark ? '#1f2937' : '#ffffff',
                  border: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
                }}
              >
                <div className="px-4 py-3 sm:hidden" style={{ borderBottom: `1px solid ${isDark ? '#374151' : '#e5e7eb'}` }}>
                  <p className={`text-sm font-medium ${isDark ? 'text-gray-100' : 'text-gray-800'}`}>{user?.name}</p>
                  <p className={`text-xs capitalize ${isDark ? 'text-gray-500' : 'text-gray-400'}`}>{user?.role}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut size={16} />
                  Sair
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Busca expandida mobile */}
      {searchOpen && (
        <form
          onSubmit={handleSearch}
          className="absolute top-14 left-0 right-0 z-20 px-3 py-2 lg:hidden"
          style={{
            background: isDark ? '#1f2937' : '#ffffff',
            borderBottom: `1px solid ${isDark ? '#374151' : '#e5e7eb'}`,
          }}
        >
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: searchIconColor }} />
            <input
              type="text"
              placeholder="Buscar produtos, clientes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              style={{ ...inputStyle, paddingLeft: '2.25rem' }}
            />
          </div>
        </form>
      )}
    </header>
  );
}
