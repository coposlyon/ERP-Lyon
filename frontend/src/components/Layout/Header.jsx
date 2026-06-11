import { Menu, Bell, Search, X, TrendingUp } from 'lucide-react';
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

  return (
    <header className="relative h-14 lg:h-16 bg-white border-b border-gray-200 flex items-center gap-2 px-3 lg:px-6 flex-shrink-0">

      {/* Botão menu — mobile abre drawer, desktop colapsa sidebar */}
      <button
        onClick={onToggleMobileSidebar}
        className="btn-ghost p-2 lg:hidden"
        aria-label="Abrir menu"
      >
        <Menu size={20} />
      </button>
      <button
        onClick={onToggleSidebar}
        className="btn-ghost p-2 hidden lg:flex"
        aria-label="Colapsar menu"
      >
        <Menu size={20} />
      </button>

      {/* Nome do sistema — só mobile, centralizado */}
      <div className="flex-1 flex items-center gap-2 lg:hidden">
        <span className="text-sm font-bold text-gray-800 truncate">
          {tenant?.app_name || 'Dator ERP'}
        </span>
      </div>

      {/* Busca — desktop sempre visível */}
      <form onSubmit={handleSearch} className="hidden lg:flex flex-1 max-w-md">
        <div className="relative w-full">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar produtos, clientes..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-9 py-1.5 text-sm"
          />
        </div>
      </form>

      {/* Ações direita */}
      <div className="flex items-center gap-1 lg:gap-3 ml-auto">
        {/* Busca mobile — ícone que expande */}
        <button
          onClick={() => setSearchOpen(v => !v)}
          className="btn-ghost p-2 lg:hidden"
          aria-label="Buscar"
        >
          {searchOpen ? <X size={18} /> : <Search size={18} />}
        </button>

        <button className="btn-ghost p-2 relative" aria-label="Notificações">
          <Bell size={18} />
        </button>

        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary-600 rounded-full flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-semibold">
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </span>
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-medium text-gray-900 leading-none">{user?.name}</p>
            <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
          </div>
        </div>
      </div>

      {/* Barra de busca expandida no mobile */}
      {searchOpen && (
        <form
          onSubmit={handleSearch}
          className="absolute top-14 left-0 right-0 z-20 bg-white border-b border-gray-200 px-3 py-2 lg:hidden"
        >
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar produtos, clientes..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="input pl-9 py-2 text-sm w-full"
            />
          </div>
        </form>
      )}
    </header>
  );
}
