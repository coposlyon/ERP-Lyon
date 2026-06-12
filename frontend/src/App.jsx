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

function AppRoutes() {
  const { user } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <Login />} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<Dashboard />} />
        {/* Produtos / Clientes / Fornecedores */}
        <Route path="products" element={<Products />} />
        <Route path="customers" element={<Customers />} />
        <Route path="customers/:id" element={<CustomerDetail />} />
        <Route path="suppliers" element={<Suppliers />} />
        <Route path="employees" element={<Employees />} />
        <Route path="logistics" element={<Logistics />} />
        <Route path="price-tables" element={<PriceTables />} />
        {/* Vendas */}
        <Route path="sales" element={<Sales />} />
        <Route path="sales/new" element={<SaleForm />} />
        <Route path="sales/:id" element={<SaleForm />} />
        <Route path="pdv" element={<PDV />} />
        {/* Orçamentos */}
        <Route path="quotes" element={<Quotes />} />
        <Route path="quotes/new" element={<QuoteForm />} />
        <Route path="quotes/:id" element={<QuoteForm />} />
        {/* Personalização */}
        <Route path="customizations" element={<Customizations />} />
        <Route path="customizations/:id" element={<CustomizationDetail />} />
        {/* Compras */}
        <Route path="purchases" element={<Purchases />} />
        <Route path="purchases/new" element={<PurchaseForm />} />
        <Route path="purchases/:id" element={<PurchaseForm />} />
        {/* Estoque */}
        <Route path="stock" element={<Stock />} />
        {/* Financeiro */}
        <Route path="financial" element={<Financial />} />
        <Route path="financial-config" element={<FinancialConfig />} />
        {/* Fiscal */}
        <Route path="fiscal" element={<Fiscal />} />
        {/* Relatórios */}
        <Route path="reports" element={<Reports />} />
        {/* Config */}
        <Route path="settings" element={<Settings />} />
        {/* Novos módulos */}
        <Route path="returns"  element={<Returns />}  />
        <Route path="quality"  element={<Quality />}  />
        <Route path="crm"      element={<CRM />}      />
        <Route path="hr" element={<HR />}>
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
