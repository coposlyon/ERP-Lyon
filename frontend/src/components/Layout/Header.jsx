import {
  Menu, Bell, Search, X, Sun, Moon, LogOut, ChevronDown,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Header({ onToggleSidebar, onToggleMobileSidebar }) {
  const { user, tenant, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

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
