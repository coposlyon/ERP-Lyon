import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout/Layout';
import Login from '@/pages/Auth/Login';
import Dashboard from '@/pages/Dashboard/Dashboard';
import Products from '@/pages/Products/Products';
import Customers from '@/pages/Customers/Customers';
import Suppliers from '@/pages/Suppliers/Suppliers';
import Sales from '@/pages/Sales/Sales';
import SaleForm from '@/pages/Sales/SaleForm';
import PDV from '@/pages/Sales/PDV';
import Purchases from '@/pages/Purchases/Purchases';
import PurchaseForm from '@/pages/Purchases/PurchaseForm';
import Stock from '@/pages/Stock/Stock';
import Financial from '@/pages/Financial/Financial';
import FinancialConfig from '@/pages/Financial/FinancialConfig';
import Fiscal from '@/pages/Fiscal/Fiscal';
import Reports from '@/pages/Reports/Reports';
import Settings from '@/pages/Settings/Settings';
import Users from '@/pages/Settings/Users';
import Quotes from '@/pages/Quotes/Quotes';
import QuoteForm from '@/pages/Quotes/QuoteForm';
import Customizations from '@/pages/Customizations/Customizations';
import CustomizationDetail from '@/pages/Customizations/CustomizationDetail';
import PriceTables from '@/pages/PriceTable/PriceTables';
import CustomerDetail from '@/pages/Customers/CustomerDetail';
import Employees from '@/pages/Employees/Employees';
import Logistics from '@/pages/Logistics/Logistics';
import Returns from '@/pages/Returns/Returns';
import Quality from '@/pages/Quality/Quality';
import CRM from '@/pages/CRM/CRM';
import HR from '@/pages/HR/HR';
import HRPonto from '@/pages/HR/HRPonto';
import HRFerias from '@/pages/HR/HRFerias';
import HRFolha from '@/pages/HR/HRFolha';
import HRDocumentos from '@/pages/HR/HRDocumentos';

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
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
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
        {/* Vendas */}
        <Route path="sales" element={<Mod m="sales"><Sales /></Mod>} />
        <Route path="sales/new" element={<Mod m="sales"><SaleForm /></Mod>} />
        <Route path="sales/:id" element={<Mod m="sales"><SaleForm /></Mod>} />
        <Route path="pdv" element={<Mod m="pdv"><PDV /></Mod>} />
        {/* Orçamentos */}
        <Route path="quotes" element={<Mod m="quotes"><Quotes /></Mod>} />
        <Route path="quotes/new" element={<Mod m="quotes"><QuoteForm /></Mod>} />
        <Route path="quotes/:id" element={<Mod m="quotes"><QuoteForm /></Mod>} />
        {/* Personalização */}
        <Route path="customizations" element={<Mod m="customizations"><Customizations /></Mod>} />
        <Route path="customizations/:id" element={<Mod m="customizations"><CustomizationDetail /></Mod>} />
        {/* Compras */}
        <Route path="purchases" element={<Mod m="purchases"><Purchases /></Mod>} />
        <Route path="purchases/new" element={<Mod m="purchases"><PurchaseForm /></Mod>} />
        <Route path="purchases/:id" element={<Mod m="purchases"><PurchaseForm /></Mod>} />
        {/* Estoque */}
        <Route path="stock" element={<Mod m="stock"><Stock /></Mod>} />
        {/* Financeiro */}
        <Route path="financial" element={<Mod m="financial"><Financial /></Mod>} />
        <Route path="financial-config" element={<Mod m="financial"><FinancialConfig /></Mod>} />
        {/* Fiscal */}
        <Route path="fiscal" element={<Mod m="fiscal"><Fiscal /></Mod>} />
        {/* Relatórios */}
        <Route path="reports" element={<Mod m="reports"><Reports /></Mod>} />
        {/* Config */}
        <Route path="settings" element={<Mod m="settings"><Settings /></Mod>} />
        <Route path="users" element={<AdminOnly><Users /></AdminOnly>} />
        {/* Novos módulos */}
        <Route path="returns"  element={<Mod m="returns"><Returns /></Mod>}  />
        <Route path="quality"  element={<Mod m="quality"><Quality /></Mod>}  />
        <Route path="crm"      element={<Mod m="crm"><CRM /></Mod>}      />
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
        <AppRoutes />
      </AuthProvider>
    </ThemeProvider>
  );
}
