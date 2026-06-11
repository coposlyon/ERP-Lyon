import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  ShoppingBag, BarChart3, FileText, Settings, LogOut,
  Boxes, Wallet, Receipt, ChevronDown, ChevronRight,
  Monitor, TrendingUp, ClipboardList, Palette, Tag,
  Building2, Percent, PenLine, Briefcase, X,
} from 'lucide-react';
import { useState } from 'react';

const menuItems = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    exact: true,
  },
  {
    label: 'Comercial',
    icon: ShoppingCart,
    children: [
      { label: 'PDV / Caixa', path: '/pdv', icon: Monitor },
      { label: 'Pedidos de Venda', path: '/sales', icon: ShoppingCart },
      { label: 'Orçamentos', path: '/quotes', icon: ClipboardList },
      { label: 'Personalização', path: '/customizations', icon: Palette },
    ],
  },
  {
    label: 'Compras',
    icon: ShoppingBag,
    children: [
      { label: 'Pedidos de Compra', path: '/purchases', icon: ShoppingBag },
    ],
  },
  {
    label: 'Estoque',
    icon: Boxes,
    path: '/stock',
  },
  {
    label: 'Cadastros',
    icon: Package,
    children: [
      { label: 'Produtos', path: '/products', icon: Package },
      { label: 'Clientes', path: '/customers', icon: Users },
      { label: 'Fornecedores', path: '/suppliers', icon: Truck },
      { label: 'Colaboradores', path: '/employees', icon: Briefcase },
      { label: 'Tabelas de Preço', path: '/price-tables', icon: Percent },
    ],
  },
  {
    label: 'Financeiro',
    icon: Wallet,
    children: [
      { label: 'Contas a Receber/Pagar', path: '/financial', icon: Wallet },
      { label: 'Config. Financeira', path: '/financial-config', icon: Building2 },
    ],
  },
  {
    label: 'Fiscal / NF-e',
    icon: Receipt,
    path: '/fiscal',
  },
  {
    label: 'Relatórios',
    icon: BarChart3,
    path: '/reports',
  },
  {
    label: 'Configurações',
    icon: Settings,
    path: '/settings',
  },
];

function SidebarGroup({ item, collapsed, onMobileClose }) {
  const [open, setOpen] = useState(false);

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
              onClick={onMobileClose}
              className={({ isActive }) =>
                `sidebar-item text-xs ${isActive ? 'active' : ''}`
              }
            >
              <child.icon size={15} />
              <span>{child.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { tenant, user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/login');
  }

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
      {/* Header do sidebar: logo + botão fechar (mobile) */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-indigo-800 min-h-[64px]">
        <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center flex-shrink-0">
          <TrendingUp size={16} className="text-white" />
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="text-white font-bold text-sm truncate">
              {tenant?.app_name || 'Dator ERP'}
            </p>
            <p className="text-indigo-300 text-xs truncate">{tenant?.name}</p>
          </div>
        )}
        {/* Botão fechar — só no mobile */}
        <button
          onClick={onMobileClose}
          className="lg:hidden ml-auto text-indigo-300 hover:text-white p-1 rounded-lg hover:bg-indigo-800 transition-colors"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navegação */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 space-y-0.5">
        {menuItems.map((item) => (
          <SidebarGroup
            key={item.label}
            item={item}
            collapsed={collapsed}
            onMobileClose={onMobileClose}
          />
        ))}
      </nav>

      {/* Usuário / Logout */}
      <div className="border-t border-indigo-800 px-2 py-3">
        {!collapsed && (
          <div className="px-3 py-2 mb-1">
            <p className="text-white text-xs font-medium truncate">{user?.name}</p>
            <p className="text-indigo-300 text-xs truncate capitalize">{user?.role}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="sidebar-item w-full text-red-300 hover:text-red-200 hover:bg-red-900/20"
        >
          <LogOut size={18} />
          {!collapsed && <span>Sair</span>}
        </button>
      </div>
    </aside>
  );
}
