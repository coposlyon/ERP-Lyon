import { NavLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import { ChevronDown, ChevronRight, X, UserCog, LogOut } from 'lucide-react';

import { useState } from 'react';
import { menuItems, menuVendedor } from '@/lib/menu';

// Dashboard primeiro (separado por um divisor), depois todos os módulos que
// têm submenu agrupados, em seguida os módulos diretos, e Configurações por último.
function SidebarVendedor({ onMobileClose }) {
  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-1">
      {menuVendedor.map(item => (
        <NavLink key={item.path} to={item.path} end={item.exact} onClick={onMobileClose}
          className={({ isActive }) => `sidebar-item items-start ${isActive ? 'active' : ''}`}>
          <item.icon size={18} className="mt-0.5 shrink-0" />
          <span className="min-w-0">
            <span className="block truncate">{item.label}</span>
            <span className="block text-[10px] font-normal opacity-60 truncate">{item.sub}</span>
          </span>
        </NavLink>
      ))}
    </nav>
  );
}

// ============================================================
// O PERFIL NO PÉ DO MENU.
//
// Ele morava no canto superior direito, longe de tudo o que a pessoa
// usa, e o cabeçalho ficava com três coisas que não conversam entre si.
// No pé do menu ele fica onde todo sistema o coloca — e o cabeçalho
// sobra para o que é do momento: buscar e ser avisado.
//
// A área do vendedor já tinha um bloco assim, escrito à parte. Eram dois
// blocos para a mesma informação; agora é este, com os itens extras
// entrando por parâmetro.
// ============================================================
function PerfilRodape({ collapsed, onMobileClose, extras = [] }) {
  const { user, logout, sectorName } = useAuth();
  const [aberto, setAberto] = useState(false);
  const navigate = useNavigate();

  async function sair() {
    setAberto(false);
    await logout();
    navigate('/login');
  }

  const inicial = (user?.name || '?').charAt(0).toUpperCase();
  const papel = sectorName || user?.role || 'Usuário';

  const itens = (
    <>
      {extras.map(e => (
        <NavLink key={e.path} to={e.path} onClick={() => { setAberto(false); onMobileClose?.(); }}
          className={({ isActive }) => `sidebar-item text-xs ${isActive ? 'active' : ''}`}>
          <e.icon size={15} /> <span>{e.label}</span>
        </NavLink>
      ))}
      <button onClick={sair} className="sidebar-item text-xs w-full text-red-300 hover:text-red-200">
        <LogOut size={15} /> <span>Sair</span>
      </button>
    </>
  );

  // Menu colapsado: o painel abre FLUTUANDO ao lado, porque numa
  // coluna de 64px não cabe nem o nome — e esconder o botão de sair
  // seria trancar a pessoa dentro do sistema.
  if (collapsed) {
    return (
      <div className="relative px-2 pb-3">
        {aberto && (
          <>
            <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
            <div className="absolute left-full bottom-0 ml-2 z-40 w-52 rounded-xl bg-sidebar shadow-xl p-2 space-y-1"
              style={{ border: '1px solid rgba(255,255,255,0.12)' }}>
              <p className="px-2 pt-1 text-xs font-medium text-white truncate">{user?.name}</p>
              <p className="px-2 pb-1 text-[10px] capitalize text-primary-300 truncate">{papel}</p>
              {itens}
            </div>
          </>
        )}
        <button onClick={() => setAberto(v => !v)} title={user?.name}
          className="w-full flex justify-center py-1.5 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.05)' }}>
          <span className="w-9 h-9 rounded-full text-white flex items-center justify-center font-bold"
            style={{ background: 'linear-gradient(135deg, #E8187A 0%, #B80F5E 100%)' }}>
            {inicial}
          </span>
        </button>
      </div>
    );
  }

  return (
    <div className="px-2 pb-3 space-y-1">
      {aberto && itens}
      <button onClick={() => setAberto(v => !v)}
        className="sidebar-item w-full items-center rounded-xl"
        style={{ background: 'rgba(255,255,255,0.05)' }}>
        <span className="w-9 h-9 rounded-full text-white flex items-center justify-center font-bold shrink-0"
          style={{ background: 'linear-gradient(135deg, #E8187A 0%, #B80F5E 100%)' }}>
          {inicial}
        </span>
        <span className="min-w-0 flex-1 text-left">
          <span className="block truncate">{user?.name}</span>
          <span className="block text-[10px] font-normal text-primary-300 capitalize truncate">{papel}</span>
        </span>
        {aberto ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
    </div>
  );
}

// Bolinha com o número de pendências ao lado do item do menu
function Badge({ n }) {
  if (!n) return null;
  return (
    <span className="ml-auto shrink-0 bg-amber-400 text-amber-950 text-[10px] font-bold rounded-full px-1.5 py-0.5 leading-none">
      {n > 99 ? '99+' : n}
    </span>
  );
}

function SidebarGroup({ item, collapsed, onMobileClose, badges = {} }) {
  const [open, setOpen] = useState(false);
  // Soma as pendências dos filhos p/ o grupo avisar mesmo fechado
  const groupBadge = (item.children || []).reduce((s, c) => s + (badges[c.path] || 0), 0);

  if (!item.children) {
    return (
      <NavLink
        to={item.path}
        end={item.exact}
        onClick={onMobileClose}
        className={({ isActive }) =>
          `sidebar-item ${isActive ? 'active' : ''}`
        }
      >
        <item.icon size={18} />
        {!collapsed && <span>{item.label}</span>}
      </NavLink>
    );
  }

  return (
    <div>
      <button
        onClick={() => setOpen(v => !v)}
        className="sidebar-item w-full"
      >
        <item.icon size={18} />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.label}</span>
            {!open && <Badge n={groupBadge} />}
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </>
        )}
      </button>
      {open && !collapsed && (
        <div className="ml-4 mt-1 space-y-0.5 border-l border-indigo-700 pl-3">
          {item.children.map(child => (
            <NavLink
              key={child.path}
              to={child.path}
              end={child.exact}
              onClick={onMobileClose}
              className={({ isActive }) =>
                `sidebar-item text-xs ${isActive ? 'active' : ''}`
              }
            >
              <child.icon size={15} />
              <span>{child.label}</span>
              <Badge n={badges[child.path]} />
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

// Aplica permissões: itens sem module são públicos; adminOnly exige admin;
// grupos somem quando nenhum filho sobra.
function filterMenu(items, hasModule, isAdmin, hasScreen) {
  // Duas perguntas, nesta ordem: o MÓDULO libera (module aceita 'stock'
  // ou ['sites','settings'] — basta um) e a TELA está liberada para esta
  // pessoa (cadastro do colaborador → Permissões). Menu e rota
  // discordarem é como o usuário descobre um item que abre e cai fora.
  const pode = m => hasModule(...(Array.isArray(m) ? m : [m]));
  const visivel = item => {
    if (item.adminOnly) return isAdmin;
    if (item.module && !pode(item.module)) return false;
    return !item.path || hasScreen(item.path);
  };
  return items
    .map(item => {
      if (item.children) {
        const children = item.children.filter(visivel);
        return children.length ? { ...item, children } : null;
      }
      return visivel(item) ? item : null;
    })
    .filter(Boolean);
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { hasModule, hasScreen, isAdmin, layout } = useAuth();
  const ehVendedor = layout === 'vendedor';
  const visibleItems = ehVendedor ? [] : filterMenu(menuItems, hasModule, isAdmin, hasScreen);

  // Pedidos de alteração de cadastro esperando aprovação (só admin enxerga)
  const { data: aprovacoes } = useQuery({
    queryKey: ['cadastro-requests-count'],
    queryFn: () => api.get('/cadastro-requests/count'),
    enabled: !!isAdmin,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const badges = { '/cadastro-aprovacoes': aprovacoes?.pendentes || 0 };

  return (
    <aside
      className={`
        flex flex-col bg-sidebar flex-shrink-0 z-40
        fixed lg:relative h-full
        transition-transform duration-300 ease-in-out
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        ${collapsed ? 'lg:w-16' : 'lg:w-64'}
        w-72
      `}
    >
      {/* Header do sidebar: logo Lyon Copos + botão fechar (mobile) */}
      <div className="flex items-center gap-2 px-3 pt-3 pb-2">
        {collapsed ? (
          /* Modo colapsado: logo média */
          <img
            src="/lyon-logo.png"
            alt="Lyon Copos"
            style={{ height: 48, width: 'auto', objectFit: 'contain' }}
            draggable={false}
          />
        ) : (
          /* Modo expandido: logo */
          <div className="flex min-w-0 flex-1">
            <img
              src="/lyon-logo.png"
              alt="Lyon Copos"
              style={{ width: '100%', height: 'auto', objectFit: 'contain', objectPosition: 'left' }}
              draggable={false}
            />
          </div>
        )}
        {/* Botão fechar — só no mobile */}
        <button
          onClick={onMobileClose}
          className="lg:hidden ml-auto text-indigo-300 hover:text-white p-1 rounded-lg hover:bg-indigo-800 transition-colors flex-shrink-0 self-start"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navegação */}
      {ehVendedor ? (
        <SidebarVendedor onMobileClose={onMobileClose} />
      ) : (
        <nav className="flex-1 overflow-y-auto px-2 pb-4 space-y-0.5">
          {visibleItems.map((item, idx) => (
            <div key={item.label}>
              <SidebarGroup
                item={item}
                collapsed={collapsed}
                onMobileClose={onMobileClose}
                badges={badges}
              />
              {/* Divisor após o Dashboard, separando-o dos módulos */}
              {idx === 0 && <div className="my-2 border-t border-indigo-800/60" />}
            </div>
          ))}
        </nav>
      )}

      {/* O perfil fica no pé, em qualquer um dos dois layouts. */}
      <PerfilRodape
        collapsed={collapsed}
        onMobileClose={onMobileClose}
        extras={ehVendedor ? [{ path: '/vendedor/perfil', label: 'Dados do vendedor', icon: UserCog }] : []}
      />
    </aside>
  );
}
