import { Menu, Bell, Search, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

export default function Header({ onToggleSidebar, onToggleMobileSidebar }) {
  const { user, tenant } = useAuth();
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const navigate = useNavigate();

  function handleSearch(e) {
    e.preventDefault();
    if (search.trim()) {
      navigate(`/products?search=${encodeURIComponent(search)}`);
      setSearch('');
      setSearchOpen(false);
    }
  }

  const headerStyle = {
    background: 'rgba(255,255,255,0.04)',
    borderBottom: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    flexShrink: 0,
  };

  const inputStyle = {
    background: 'rgba(255,255,255,0.07)',
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'white',
    outline: 'none',
    borderRadius: '0.5rem',
    padding: '0.375rem 0.75rem 0.375rem 2.25rem',
    fontSize: '0.875rem',
    width: '100%',
  };

  return (
    <header
      className="relative h-14 lg:h-16 flex items-center gap-2 px-3 lg:px-6"
      style={headerStyle}
    >
      {/* Botão menu — mobile */}
      <button
        onClick={onToggleMobileSidebar}
        className="p-2 rounded-lg lg:hidden transition-colors hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.6)' }}
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      {/* Botão menu — desktop */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-lg hidden lg:flex transition-colors hover:bg-white/10"
        style={{ color: 'rgba(255,255,255,0.6)' }}
        aria-label="Colapsar menu"
      >
        <Menu size={20} />
      </button>

      {/* Nome do sistema — só mobile */}
      <div className="flex-1 flex items-center gap-2 lg:hidden">
        <span className="text-sm font-bold truncate" style={{ color: 'rgba(255,255,255,0.85)' }}>
          {tenant?.app_name || 'Lyon Copos'}
        </span>
      </div>

      {/* Busca — desktop */}
      <form onSubmit={handleSearch} className="hidden lg:flex flex-1 max-w-md">
        <div className="relative w-full">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: 'rgba(255,255,255,0.3)' }} />
          <input
            type="text"
            placeholder="Buscar produtos, clientes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={inputStyle}
          />
        </div>
      </form>

      {/* Ações direita */}
      <div className="flex items-center gap-1 lg:gap-3 ml-auto">
        {/* Busca mobile — ícone */}
        <button
          onClick={() => setSearchOpen(v => !v)}
          className="p-2 rounded-lg lg:hidden transition-colors hover:bg-white/10"
          style={{ color: 'rgba(255,255,255,0.6)' }}
          aria-label="Buscar"
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>

        <button
          className="p-2 rounded-lg transition-colors hover:bg-white/10 relative"
          style={{ color: 'rgba(255,255,255,0.6)' }}
          aria-label="Notificações"
        >
          <Bell size={18} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
            style={{ background: 'linear-gradient(135deg, #E8187A 0%, #B80F5E 100%)' }}>
            <span className="text-white text-xs font-semibold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium leading-none" style={{ color: 'rgba(255,255,255,0.85)' }}>
              {user?.name}
            </p>
            <p className="text-xs capitalize mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>
              {user?.role}
            </p>
          </div>
        </div>
      </div>

      {/* Busca expandida mobile */}
      {searchOpen && (
        <form
          onSubmit={handleSearch}
          className="absolute top-14 left-0 right-0 z-20 px-3 py-2 lg:hidden"
          style={{
            background: 'rgba(17,17,17,0.97)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2"
              style={{ color: 'rgba(255,255,255,0.3)' }} />
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
