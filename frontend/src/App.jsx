import { lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import Login from '@/pages/Auth/Login';
import MarcacaoPonto from '@/pages/Ponto/MarcacaoPonto';
import StoreApp from '@/store/StoreApp';
import CadastroCliente from '@/pages/Public/CadastroCliente';
import CadastroFornecedor from '@/pages/Public/CadastroFornecedor';
import CadastroTransportadora from '@/pages/Public/CadastroTransportadora';

// Páginas do ERP carregadas sob demanda (code-splitting por rota) —
// cada uma vira um chunk próprio, deixando a carga inicial leve.
const Dashboard          = lazy(() => import('@/pages/Dashboard/Dashboard'));
const Products           = lazy(() => import('@/pages/Products/Products'));
const Customers          = lazy(() => import('@/pages/Customers/Customers'));
const CustomerDetail     = lazy(() => import('@/pages/Customers/CustomerDetail'));
const Suppliers          = lazy(() => import('@/pages/Suppliers/Suppliers'));
const Sales              = lazy(() => import('@/pages/Sales/Sales'));
const SaleForm           = lazy(() => import('@/pages/Sales/SaleForm'));
const NewSale            = lazy(() => import('@/pages/Sales/NewSale'));
const Purchases          = lazy(() => import('@/pages/Purchases/Purchases'));
const PurchaseForm       = lazy(() => import('@/pages/Purchases/PurchaseForm'));
const Forecast           = lazy(() => import('@/pages/Forecast/Forecast'));
const Stock              = lazy(() => import('@/pages/Stock/Stock'));
const Financial          = lazy(() => import('@/pages/Financial/Financial'));
const FinancialConfig    = lazy(() => import('@/pages/Financial/FinancialConfig'));
const Contas             = lazy(() => import('@/pages/Financial/Contas'));
const Pricing            = lazy(() => import('@/pages/Pricing/Pricing'));
const Fiscal             = lazy(() => import('@/pages/Fiscal/Fiscal'));
const Reports            = lazy(() => import('@/pages/Reports/Reports'));
const Settings           = lazy(() => import('@/pages/Settings/Settings'));
const Users              = lazy(() => import('@/pages/Settings/Users'));
const Audit              = lazy(() => import('@/pages/Settings/Audit'));
const Feriados           = lazy(() => import('@/pages/Settings/Feriados'));
const Quotes             = lazy(() => import('@/pages/Quotes/Quotes'));
const QuoteForm          = lazy(() => import('@/pages/Quotes/QuoteForm'));
const NewQuote           = lazy(() => import('@/pages/Quotes/NewQuote'));
const Customizations     = lazy(() => import('@/pages/Customizations/Customizations'));
const CustomizationDetail = lazy(() => import('@/pages/Customizations/CustomizationDetail'));
const CustomizationStudio = lazy(() => import('@/pages/Studio/CustomizationStudio'));
const PriceTables        = lazy(() => import('@/pages/PriceTable/PriceTables'));
const Coupons            = lazy(() => import('@/pages/Coupons/Coupons'));
const Employees          = lazy(() => import('@/pages/Employees/Employees'));
const Logistics          = lazy(() => import('@/pages/Logistics/Logistics'));
const Returns            = lazy(() => import('@/pages/Returns/Returns'));
const Quality            = lazy(() => import('@/pages/Quality/Quality'));
const CRM                = lazy(() => import('@/pages/CRM/CRM'));
const Marketing          = lazy(() => import('@/pages/Marketing/Marketing'));
const Production         = lazy(() => import('@/pages/Production/Production'));
const HR                 = lazy(() => import('@/pages/HR/HR'));
const HRPonto            = lazy(() => import('@/pages/HR/HRPonto'));
const HRFerias           = lazy(() => import('@/pages/HR/HRFerias'));
const HRFolha            = lazy(() => import('@/pages/HR/HRFolha'));
const HRDocumentos       = lazy(() => import('@/pages/HR/HRDocumentos'));

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
}

// Bloqueia a rota se o usuário não tiver acesso ao módulo
function Mod({ m, children }) {
  const { hasModule } = useAuth();
  const mods = Array.isArray(m) ? m : [m];
  return hasModule(...mods) ? children : <Navigate to="/" replace />;
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      {/* Loja pública — sem login, fora do ERP */}
      <Route path="/loja/*" element={<StoreApp />} />
      {/* Autocadastro de cliente — link público p/ enviar ao cliente */}
      <Route path="/cadastro" element={<CadastroCliente />} />
      {/* Autocadastro de fornecedora — link público p/ enviar à fornecedora */}
      <Route path="/cadastro-fornecedor" element={<CadastroFornecedor />} />
      {/* Autocadastro de transportadora — link público p/ enviar à transportadora */}
      <Route path="/cadastro-transportadora" element={<CadastroTransportadora />} />
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      {/* App de marcação de ponto — tela cheia, todo colaborador acessa */}
      <Route path="/marcacao" element={<PrivateRoute><MarcacaoPonto /></PrivateRoute>} />
      {/* Novo pedido de venda — tela cheia (fora do layout com sidebar) */}
      <Route path="/sales/new" element={<PrivateRoute><Mod m="sales"><NewSale /></Mod></PrivateRoute>} />
      {/* Novo orçamento — tela cheia, salva histórico + gera foto PNG */}
      <Route path="/quotes/new" element={<PrivateRoute><Mod m="quotes"><NewQuote /></Mod></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        {/* Produtos / Clientes / Fornecedores */}
        <Route path="products" element={<Mod m="products"><Products /></Mod>} />
        <Route path="customers" element={<Mod m="customers"><Customers /></Mod>} />
        <Route path="customers/:id" element={<Mod m="customers"><CustomerDetail /></Mod>} />
        <Route path="suppliers" element={<Mod m="suppliers"><Suppliers /></Mod>} />
        <Route path="employees" element={<Mod m="employees"><Employees /></Mod>} />
        <Route path="logistics" element={<Mod m="logistics"><Logistics /></Mod>} />
        <Route path="price-tables" element={<Mod m="price-tables"><PriceTables /></Mod>} />
        <Route path="coupons" element={<Mod m={['price-tables','sales','pdv']}><Coupons /></Mod>} />
        {/* Vendas */}
        <Route path="sales" element={<Mod m="sales"><Sales /></Mod>} />
        <Route path="sales/:id" element={<Mod m="sales"><SaleForm /></Mod>} />
        {/* Orçamentos */}
        <Route path="quotes" element={<Mod m="quotes"><Quotes /></Mod>} />
        <Route path="quotes/:id" element={<Mod m="quotes"><QuoteForm /></Mod>} />
        {/* Personalização */}
        <Route path="customizations" element={<Mod m="customizations"><Customizations /></Mod>} />
        <Route path="customizations/:id" element={<Mod m="customizations"><CustomizationDetail /></Mod>} />
        <Route path="studio" element={<Mod m="customizations"><CustomizationStudio /></Mod>} />
        {/* Compras */}
        <Route path="purchases" element={<Mod m="purchases"><Purchases /></Mod>} />
        <Route path="purchases/new" element={<Mod m="purchases"><PurchaseForm /></Mod>} />
        <Route path="purchases/:id" element={<Mod m="purchases"><PurchaseForm /></Mod>} />
        <Route path="forecast" element={<Mod m="reports"><Forecast /></Mod>} />
        {/* Estoque */}
        <Route path="stock" element={<Mod m="stock"><Stock /></Mod>} />
        {/* Financeiro */}
        <Route path="financial" element={<Mod m="financial"><Financial /></Mod>} />
        <Route path="financial-config" element={<Mod m="financial"><FinancialConfig /></Mod>} />
        <Route path="contas" element={<Mod m="financial"><Contas /></Mod>} />
        <Route path="pricing" element={<Mod m={['financial','products','settings']}><Pricing /></Mod>} />
        {/* Fiscal */}
        <Route path="fiscal" element={<Mod m="fiscal"><Fiscal /></Mod>} />
        {/* Relatórios */}
        <Route path="reports" element={<Mod m="reports"><Reports /></Mod>} />
        {/* Config */}
        <Route path="settings" element={<Mod m="settings"><Settings /></Mod>} />
        <Route path="users" element={<AdminOnly><Users /></AdminOnly>} />
        <Route path="audit" element={<AdminOnly><Audit /></AdminOnly>} />
        <Route path="feriados" element={<Mod m={['settings','hr']}><Feriados /></Mod>} />
        {/* Novos módulos */}
        <Route path="returns"  element={<Mod m="returns"><Returns /></Mod>}  />
        <Route path="quality"  element={<Mod m="quality"><Quality /></Mod>}  />
        <Route path="crm"      element={<Mod m="crm"><CRM /></Mod>}      />
        <Route path="marketing" element={<Mod m={['marketing','crm']}><Marketing /></Mod>} />
        <Route path="production" element={<Mod m={['production','quality','stock']}><Production /></Mod>} />
        <Route path="hr" element={<Mod m="hr"><HR /></Mod>}>
          <Route index element={<Navigate to="ponto" replace />} />
          <Route path="ponto"      element={<HRPonto />} />
          <Route path="ferias"     element={<HRFerias />} />
          <Route path="folha"      element={<HRFolha />} />
          <Route path="documentos" element={<HRDocumentos />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ErrorBoundary>
          <AppRoutes />
        </ErrorBoundary>
      </AuthProvider>
    </ThemeProvider>
  );
}
