import { NavLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/lib/api';
import {
  LayoutDashboard, Package, Users, Truck, ShoppingCart,
  ShoppingBag, BarChart3, FileText, Settings,
  Boxes, Wallet, Receipt, ChevronDown, ChevronRight,
  Monitor, ClipboardList, Palette, Tag,
  Building2, Percent, PenLine, Briefcase, X, MapPin,
  RotateCcw, FlaskConical, Target, UserCog,
  Clock, Umbrella, DollarSign, ScrollText, Fingerprint, CalendarDays, Box, LineChart, Megaphone, Factory, ShieldCheck,
  Calculator, PieChart, SlidersHorizontal, Trophy, Home, Landmark, Star,
} from 'lucide-react';

import { useState } from 'react';

// Dashboard primeiro (separado por um divisor), depois todos os módulos que
// têm submenu agrupados, em seguida os módulos diretos, e Configurações por último.
const menuItems = [
  {
    label: 'Dashboard',
    icon: LayoutDashboard,
    path: '/',
    exact: true,
    // sem module: visível para todos
  },

  // --- Módulos com submenu (agrupados) ---
  {
    label: 'Comercial',
    icon: ShoppingCart,
    children: [
      { label: 'Painel do Vendedor', path: '/vendedor', icon: Target, module: 'vendedor' },
      { label: 'Pedidos de Venda', path: '/sales', icon: ShoppingCart, module: 'sales' },
      { label: 'Pagamentos da Loja', path: '/store-payments', icon: Wallet, module: 'sales' },
      { label: 'Orçamentos', path: '/quotes', icon: ClipboardList, module: 'quotes' },
      { label: 'Estúdio 3D', path: '/studio', icon: Box, module: 'customizations' },
      { label: 'Cupons de Desconto', path: '/coupons', icon: Tag, module: 'sales' },
    ],
  },
  {
    label: 'Cadastros',
    icon: Package,
    children: [
      { label: 'Produtos', path: '/products', icon: Package, module: 'products' },
      { label: 'Clientes', path: '/customers', icon: Users, module: 'customers' },
      { label: 'Aprovações de Cadastro', path: '/cadastro-aprovacoes', icon: ShieldCheck, adminOnly: true },
      { label: 'Fornecedores', path: '/suppliers', icon: Truck, module: 'suppliers' },
      { label: 'Colaboradores', path: '/employees', icon: Briefcase, module: 'employees' },
      { label: 'Tabelas de Preço', path: '/price-tables', icon: Percent, module: 'price-tables' },
    ],
  },
  {
    label: 'Logística',
    icon: MapPin,
    children: [
      { label: 'Transportadoras', path: '/logistics', icon: Truck, module: 'logistics' },
    ],
  },
  {
    label: 'Financeiro',
    icon: Wallet,
    children: [
      { label: 'Central de Contas', path: '/contas', icon: CalendarDays, module: 'financial' },
      { label: 'Contas a Receber/Pagar', path: '/financial', icon: Wallet, module: 'financial' },
      { label: 'Config. Financeira', path: '/financial-config', icon: Building2, module: 'financial' },
    ],
  },
  {
    label: 'Precificação',
    icon: Calculator,
    children: [
      { label: 'Formação de Preço', path: '/pricing/formacao', icon: Calculator, module: 'financial' },
      { label: 'Simulador de Preço', path: '/pricing/simulador', icon: SlidersHorizontal, module: 'financial' },
      { label: 'Relatórios de Preço', path: '/pricing/relatorios', icon: Trophy, module: 'financial' },
      { label: 'Análise de Produtos', path: '/pricing', icon: LineChart, module: 'financial', exact: true },
    ],
  },
  {
    label: 'Engenharia de Custos',
    icon: PieChart,
    children: [
      { label: 'Insumos', path: '/engenharia/insumos', icon: FlaskConical, module: 'financial' },
      { label: 'Despesas Fixas', path: '/rateio/despesas-fixas', icon: Home, module: 'financial' },
      { label: 'Despesas Variáveis', path: '/rateio/despesas-variaveis', icon: Percent, module: 'financial' },
      { label: 'Rateio por Produto', path: '/rateio/produto', icon: Package, module: 'financial' },
      { label: 'Rateio por Pedido', path: '/rateio/pedido', icon: ShoppingCart, module: 'financial' },
      { label: 'Painel de Rentabilidade', path: '/rateio/rentabilidade', icon: LineChart, module: 'financial' },
      { label: 'Simulador de Metas', path: '/rateio/metas', icon: Target, module: 'financial' },
      { label: 'Histórico de Rateios', path: '/rateio/historico', icon: ScrollText, module: 'financial' },
    ],
  },
  {
    label: 'Relatórios',
    icon: BarChart3,
    children: [
      { label: 'Relatórios', path: '/reports', icon: BarChart3, module: 'reports' },
      { label: 'Previsão de Demanda', path: '/forecast', icon: LineChart, module: 'reports' },
    ],
  },
  {
    label: 'Recursos Humanos',
    icon: UserCog,
    children: [
      { label: 'Gestão de Pontos',    path: '/hr/ponto',      icon: Clock,      module: 'hr' },
      { label: 'Férias',              path: '/hr/ferias',     icon: Umbrella,   module: 'hr' },
      { label: 'Folha de Pagamento',  path: '/hr/folha',      icon: DollarSign, module: 'hr' },
      { label: 'Documentos',          path: '/hr/documentos', icon: FileText,   module: 'hr' },
      { label: 'Conformidade Trab.',  path: '/hr/conformidade', icon: ShieldCheck, module: 'hr' },
    ],
  },

  // --- Módulos diretos (sem submenu) ---
  {
    label: 'Bater Ponto',
    icon: Fingerprint,
    path: '/marcacao',
    // sem module: todo colaborador pode marcar o próprio ponto
  },
  {
    label: 'Estoque',
    icon: Boxes,
    path: '/stock',
    module: 'stock',
  },
  {
    label: 'Produção',
    icon: Factory,
    path: '/production',
    module: 'production',
  },
  {
    label: 'Fiscal / NF-e',
    icon: Receipt,
    path: '/fiscal',
    module: 'fiscal',
  },
  {
    label: 'Contábil / Fiscal',
    icon: Landmark,
    path: '/contabil',
    module: 'financial',
  },
  {
    label: 'Devoluções',
    icon: RotateCcw,
    path: '/returns',
    module: 'returns',
  },
  {
    label: 'Qualidade',
    icon: FlaskConical,
    path: '/quality',
    module: 'quality',
  },
  {
    label: 'Lyon Prime',
    icon: Star,
    path: '/lyon-prime',
    module: 'customers',
  },
  {
    label: 'CRM',
    icon: Target,
    path: '/crm',
    module: 'crm',
  },
  {
    label: 'Marketing',
    icon: Megaphone,
    path: '/marketing',
    module: 'marketing',
  },

  // --- Sempre por último ---
  {
    label: 'Configurações',
    icon: Settings,
    children: [
      { label: 'Geral',     path: '/settings', icon: Settings,     module: 'settings' },
      { label: 'Feriados',  path: '/feriados', icon: CalendarDays, module: 'settings' },
      { label: 'Usuários',  path: '/users',    icon: Users,        adminOnly: true },
      { label: 'Auditoria', path: '/audit',    icon: ScrollText,   adminOnly: true },
    ],
  },
];

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
function filterMenu(items, hasModule, isAdmin) {
  return items
    .map(item => {
      if (item.children) {
        const children = item.children.filter(c =>
          c.adminOnly ? isAdmin : (!c.module || hasModule(c.module))
        );
        return children.length ? { ...item, children } : null;
      }
      if (item.adminOnly && !isAdmin) return null;
      if (item.module && !hasModule(item.module)) return null;
      return item;
    })
    .filter(Boolean);
}

export default function Sidebar({ collapsed, onToggle, mobileOpen, onMobileClose }) {
  const { hasModule, isAdmin } = useAuth();
  const visibleItems = filterMenu(menuItems, hasModule, isAdmin);

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

    </aside>
  );
}
