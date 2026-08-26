// ============================================================
// O CABEÇALHO.
//
// O avatar e o menu de sair moravam aqui, no canto de cima. Foram para
// o pé do menu lateral (Sidebar → PerfilRodape), que é onde todo
// sistema os coloca e onde eles ficam perto do resto da navegação.
//
// O que sobra aqui é o do MOMENTO: abrir o menu, buscar, e ser avisado.
// ============================================================
import { Menu, Search } from 'lucide-react';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Notificacoes from './Notificacoes';

export default function Header({ onToggleSidebar, onToggleMobileSidebar }) {
  const { tenant } = useAuth();
  const { isDark } = useTheme();
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

  const headerStyle = isDark
    ? { background: '#080d24', borderBottom: '1px solid #1d2b6b', flexShrink: 0 }
    : { background: '#ffffff', borderBottom: '1px solid #e5e7eb', flexShrink: 0 };

  const inputStyle = isDark
    ? {
        background: '#060a1f',
        border: '1px solid #1d2b6b',
        color: '#eaf0ff',
        outline: 'none',
        borderRadius: '0.5rem',
        padding: '0.375rem 0.75rem 0.375rem 2.25rem',
        fontSize: '0.875rem',
        width: '100%',
      }
    : {
        background: '#eaf0ff',
        border: '1px solid #e5e7eb',
        color: '#060a1f',
        outline: 'none',
        borderRadius: '0.5rem',
        padding: '0.375rem 0.75rem 0.375rem 2.25rem',
        fontSize: '0.875rem',
        width: '100%',
      };

  const iconCls = isDark
    ? 'p-2 rounded-lg transition-colors hover:bg-gray-700 text-gray-400 flex items-center justify-center'
    : 'p-2 rounded-lg transition-colors hover:bg-gray-100 text-gray-500 flex items-center justify-center';

  const searchIconColor = isDark ? '#7b8fc7' : '#9db2e8';

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

        {/* O botão de tema saiu: o ERP tem um visual só. Enquanto ele
            existia, um clique acidental devolvia o sistema ao branco. */}

        {/* Notificações — o que mudou desde que você olhou. */}
        <Notificacoes />
      </div>

      {/* Busca expandida mobile */}
      {searchOpen && (
        <form
          onSubmit={handleSearch}
          className="absolute top-14 left-0 right-0 z-20 px-3 py-2 lg:hidden"
          style={{
            background: isDark ? '#080d24' : '#ffffff',
            borderBottom: `1px solid ${isDark ? '#1d2b6b' : '#e5e7eb'}`,
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
