import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import Layout from '@/components/Layout/Layout';
import ErrorBoundary from '@/components/ErrorBoundary';
import Login from '@/pages/Auth/Login';
import MarcacaoPonto from '@/pages/Ponto/MarcacaoPonto';
import StoreApp from '@/store/StoreApp';
import CatalogoApp from '@/catalogo/CatalogoApp';
import CadastroCliente from '@/pages/Public/CadastroCliente';
import CadastroFornecedor from '@/pages/Public/CadastroFornecedor';
import CadastroTransportadora from '@/pages/Public/CadastroTransportadora';
import AcompanharPedido from '@/pages/Public/AcompanharPedido';
import PedidoCliente from '@/pages/Public/PedidoCliente';
import MeusPedidos from '@/pages/Public/MeusPedidos';

// Páginas do ERP carregadas sob demanda (code-splitting por rota) —
// cada uma vira um chunk próprio, deixando a carga inicial leve.
const Dashboard          = lazy(() => import('@/pages/Dashboard/Dashboard'));
const Products           = lazy(() => import('@/pages/Products/Products'));
const Customers          = lazy(() => import('@/pages/Customers/Customers'));
const CustomerDetail     = lazy(() => import('@/pages/Customers/CustomerDetail'));
const LyonPrime          = lazy(() => import('@/pages/LyonPrime/LyonPrime'));
const Suppliers          = lazy(() => import('@/pages/Suppliers/Suppliers'));
const Sales              = lazy(() => import('@/pages/Sales/Sales'));
const SaleForm           = lazy(() => import('@/pages/Sales/SaleForm'));
const NewSale            = lazy(() => import('@/pages/Sales/NewSale'));
const StorePayments      = lazy(() => import('@/pages/Sales/StorePayments'));
const VendedorDashboard  = lazy(() => import('@/pages/Vendedor/VendedorDashboard'));
const VendedorConfig     = lazy(() => import('@/pages/Vendedor/VendedorConfig'));
const PedidosVendedor    = lazy(() => import('@/pages/Vendedor/PedidosVendedor'));
const PedidoDetalhe      = lazy(() => import('@/pages/Vendedor/PedidoDetalhe'));
const DocumentoPedido    = lazy(() => import('@/pages/Vendedor/DocumentoPedido'));
const Catalogo           = lazy(() => import('@/pages/Vendedor/Catalogo'));
const AgendaVendedor     = lazy(() => import('@/pages/Vendedor/Agenda'));
const Comunicacao        = lazy(() => import('@/pages/Vendedor/Comunicacao'));
const DadosVendedor      = lazy(() => import('@/pages/Vendedor/DadosVendedor'));
const Permissoes         = lazy(() => import('@/pages/Settings/Permissoes'));
const Purchases          = lazy(() => import('@/pages/Purchases/Purchases'));
const PurchaseForm       = lazy(() => import('@/pages/Purchases/PurchaseForm'));
const Forecast           = lazy(() => import('@/pages/Forecast/Forecast'));
const Stock              = lazy(() => import('@/pages/Stock/Stock'));
const Financial          = lazy(() => import('@/pages/Financial/Financial'));
const FinancialConfig    = lazy(() => import('@/pages/Financial/FinancialConfig'));
const Contas             = lazy(() => import('@/pages/Financial/Contas'));
const Pricing            = lazy(() => import('@/pages/Pricing/Pricing'));
const PriceFormation     = lazy(() => import('@/pages/Pricing/PriceFormation'));
const PriceSimulator     = lazy(() => import('@/pages/Pricing/PriceSimulator'));
const PricingReports     = lazy(() => import('@/pages/Pricing/PricingReports'));
const DespesasFixas      = lazy(() => import('@/pages/Rateio/DespesasFixas'));
const DespesasVariaveis  = lazy(() => import('@/pages/Rateio/DespesasVariaveis'));
const RateioProduto      = lazy(() => import('@/pages/Rateio/RateioProduto'));
const RateioPedido       = lazy(() => import('@/pages/Rateio/RateioPedido'));
const SimuladorMetas     = lazy(() => import('@/pages/Rateio/SimuladorMetas'));
const HistoricoRateios   = lazy(() => import('@/pages/Rateio/HistoricoRateios'));
const Rentabilidade      = lazy(() => import('@/pages/Rateio/Rentabilidade'));
const Insumos            = lazy(() => import('@/pages/Insumos/Insumos'));
const Fiscal             = lazy(() => import('@/pages/Fiscal/Fiscal'));
const Contabil           = lazy(() => import('@/pages/Contabil/Contabil'));
const Reports            = lazy(() => import('@/pages/Reports/Reports'));
const Settings           = lazy(() => import('@/pages/Settings/Settings'));
const Users              = lazy(() => import('@/pages/Settings/Users'));
const Audit              = lazy(() => import('@/pages/Settings/Audit'));
const CadastroAprovacoes = lazy(() => import('@/pages/Settings/CadastroAprovacoes'));
const Feriados           = lazy(() => import('@/pages/Settings/Feriados'));
const CatalogoAdmin      = lazy(() => import('@/pages/Settings/CatalogoAdmin'));
const Sites             = lazy(() => import('@/pages/Sites/Sites'));
const SiteDetalhe        = lazy(() => import('@/pages/Sites/SiteDetalhe'));
const Quotes             = lazy(() => import('@/pages/Quotes/Quotes'));
const QuoteForm          = lazy(() => import('@/pages/Quotes/QuoteForm'));
const NewQuote           = lazy(() => import('@/pages/Quotes/NewQuote'));
const Customizations     = lazy(() => import('@/pages/Customizations/Customizations'));
const CustomizationDetail = lazy(() => import('@/pages/Customizations/CustomizationDetail'));
const CustomizationStudio = lazy(() => import('@/pages/Studio/CustomizationStudio'));
const PriceTables        = lazy(() => import('@/pages/PriceTable/PriceTables'));
const Coupons            = lazy(() => import('@/pages/Coupons/Coupons'));
const Employees          = lazy(() => import('@/pages/Employees/Employees'));
const EmployeeFull       = lazy(() => import('@/pages/Employees/EmployeeFull'));
const Logistics          = lazy(() => import('@/pages/Logistics/Logistics'));
const Returns            = lazy(() => import('@/pages/Returns/Returns'));
const Quality            = lazy(() => import('@/pages/Quality/Quality'));
const CRM                = lazy(() => import('@/pages/CRM/CRM'));
const Marketing          = lazy(() => import('@/pages/Marketing/Marketing'));
const Production         = lazy(() => import('@/pages/Production/Production'));
const HR                 = lazy(() => import('@/pages/HR/HR'));
const PainelRH           = lazy(() => import('@/pages/HR/PainelRH'));
const EstruturaEmpresa   = lazy(() => import('@/pages/HR/EstruturaEmpresa'));
const HRPonto            = lazy(() => import('@/pages/HR/HRPonto'));
const HRFerias           = lazy(() => import('@/pages/HR/HRFerias'));
const HRFolha            = lazy(() => import('@/pages/HR/HRFolha'));
const HRDocumentos       = lazy(() => import('@/pages/HR/HRDocumentos'));
const HRConformidade     = lazy(() => import('@/pages/HR/HRConformidade'));

// Fallback das rotas de tela cheia (fora do Layout, que tem o Suspense dele).
function AppLoading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary-600" />
    </div>
  );
}

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
/** Manda o endereço antigo do documento para o novo, sem perder o pedido. */
function LevaAoDocumento() {
  const { id } = useParams();
  return <Navigate to={`/sales/${id}/documento`} replace />;
}

function Mod({ m, children }) {
  const { hasModule, hasScreen } = useAuth();
  const { pathname } = useLocation();
  const mods = Array.isArray(m) ? m : [m];
  // Duas perguntas: o módulo libera, e a TELA está liberada para esta
  // pessoa. Sem a segunda, esconder o item do menu não adiantaria nada —
  // bastava digitar o endereço.
  if (!hasModule(...mods)) return <Navigate to="/" replace />;
  return hasScreen(pathname) ? children : <Navigate to="/" replace />;
}

function AdminOnly({ children }) {
  const { isAdmin } = useAuth();
  return isAdmin ? children : <Navigate to="/" replace />;
}

// Gerente também administra (metas e território de vendedor são decisão dele)
function ManagerOnly({ children }) {
  const { user, homePath } = useAuth();
  return ['admin', 'manager'].includes(user?.role) ? children : <Navigate to={homePath} replace />;
}

// A raiz "/" não é a mesma tela para todo mundo. Quem está na área do
// vendedor cai no painel dele — deixar o Dashboard geral abrir aqui
// mostraria contas a receber e contas vencidas a quem não deve ver.
function HomeRoute() {
  const { layout, homePath } = useAuth();
  if (layout === 'vendedor' && homePath !== '/') return <Navigate to={homePath} replace />;
  return <Dashboard />;
}

function AppRoutes() {
  const { user, homePath } = useAuth();

  return (
    // Boundary de Suspense do app inteiro. As páginas dentro do Layout já
    // têm o Suspense de lá (mais próximo, ganha). Este aqui cobre as rotas
    // de tela cheia — /sales/new, /quotes/new — que ficam FORA do Layout:
    // sem ele, o chunk lazy suspende no clique e o React quebra com o
    // erro #426 ("suspended while responding to synchronous input").
    <Suspense fallback={<AppLoading />}>
    <Routes>
      {/* Loja pública — sem login, fora do ERP. Só copos LISOS: quem
          quer personalização vai para o catálogo, logo abaixo. */}
      <Route path="/loja/*" element={<StoreApp />} />
      {/* Catálogo de Produtos Personalizados — o link que o vendedor
          manda ao cliente. Fora do ERP e sem login, igual à loja. */}
      <Route path="/catalogo/*" element={<CatalogoApp />} />
      {/* Autocadastro de cliente — link público p/ enviar ao cliente */}
      <Route path="/cadastro" element={<CadastroCliente />} />
      {/* Autocadastro de fornecedora — link público p/ enviar à fornecedora */}
      <Route path="/cadastro-fornecedor" element={<CadastroFornecedor />} />
      {/* Autocadastro de transportadora — link público p/ enviar à transportadora */}
      <Route path="/cadastro-transportadora" element={<CadastroTransportadora />} />
      {/* Acompanhamento do pedido pelo cliente — telas externas, fora do
          ERP. Nenhum módulo interno aparece aqui. */}
      <Route path="/acompanhar" element={<AcompanharPedido />} />
      <Route path="/acompanhar/pedidos" element={<MeusPedidos />} />
      <Route path="/acompanhar/pedido/:id" element={<PedidoCliente />} />
      <Route path="/login" element={user ? <Navigate to={homePath} replace /> : <Login />} />
      {/* App de marcação de ponto — tela cheia, todo colaborador acessa */}
      <Route path="/marcacao" element={<PrivateRoute><MarcacaoPonto /></PrivateRoute>} />
      {/* Novo pedido de venda — tela cheia (fora do layout com sidebar) */}
      <Route path="/sales/new" element={<PrivateRoute><Mod m="sales"><NewSale /></Mod></PrivateRoute>} />
      {/* Novo orçamento — tela cheia, salva histórico + gera foto PNG */}
      <Route path="/quotes/new" element={<PrivateRoute><Mod m="quotes"><NewQuote /></Mod></PrivateRoute>} />
      <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
        <Route index element={<HomeRoute />} />
        {/* Produtos / Clientes / Fornecedores */}
        <Route path="products" element={<Mod m="products"><Products /></Mod>} />
        <Route path="customers" element={<Mod m="customers"><Customers /></Mod>} />
        <Route path="customers/:id" element={<Mod m="customers"><CustomerDetail /></Mod>} />
        <Route path="lyon-prime" element={<Mod m="customers"><LyonPrime /></Mod>} />
        <Route path="suppliers" element={<Mod m="suppliers"><Suppliers /></Mod>} />
        <Route path="employees" element={<Mod m="employees"><Employees /></Mod>} />
        {/* O cadastro completo do colaborador: identidade, família, contrato,
            documentos e as permissões de acesso dele, em tela cheia. */}
        <Route path="employees/novo" element={<Mod m="employees"><EmployeeFull /></Mod>} />
        <Route path="employees/:id" element={<Mod m="employees"><EmployeeFull /></Mod>} />
        <Route path="logistics" element={<Mod m="logistics"><Logistics /></Mod>} />
        <Route path="price-tables" element={<Mod m="price-tables"><PriceTables /></Mod>} />
        <Route path="coupons" element={<Mod m={['price-tables','sales','pdv']}><Coupons /></Mod>} />
        {/* Vendas */}
        <Route path="sales" element={<Mod m="sales"><Sales /></Mod>} />
        {/* A tela do pedido é a MESMA do vendedor. Duas telas para
            "onde está este pedido" seriam duas para discordar no dia
            em que a produção mudar de etapa. */}
        <Route path="sales/:id/detalhe" element={<Mod m="sales"><PedidoDetalhe /></Mod>} />
        <Route path="sales/:id/documento" element={<Mod m="sales"><DocumentoPedido /></Mod>} />
        {/* O ENDEREÇO ERRADO QUE UMA VERSÃO ANTERIOR GERAVA.
            Ela colava "/documento" no fim do caminho atual, e em
            /sales/:id/detalhe isso virava /sales/:id/detalhe/documento —
            rota inexistente, que o curinga mandava para a home. Já
            corrigido na origem, mas o navegador de quem estiver com o
            pacote antigo em cache continua gerando o endereço velho.
            Uma linha aqui vale mais do que pedir Ctrl+Shift+R. */}
        <Route path="sales/:id/detalhe/documento" element={<LevaAoDocumento />} />
        <Route path="sales/:id" element={<Mod m="sales"><SaleForm /></Mod>} />
        <Route path="store-payments" element={<Mod m="sales"><StorePayments /></Mod>} />
        {/* Painel do Vendedor — a configuração (meta, território, promoções) é só de gestor */}
        <Route path="vendedor" element={<Mod m={['vendedor','sales','pdv','crm']}><VendedorDashboard /></Mod>} />
        <Route path="vendedor/config" element={<ManagerOnly><VendedorConfig /></ManagerOnly>} />
        {/* Área do vendedor — os cinco itens do menu enxuto */}
        <Route path="vendedor/pedidos" element={<Mod m={['pedidos-vendedor','vendedor','sales']}><PedidosVendedor /></Mod>} />
        <Route path="vendedor/catalogo" element={<Mod m={['catalogo','vendedor','sales']}><Catalogo /></Mod>} />
        <Route path="vendedor/agenda" element={<Mod m={['agenda','vendedor','sales']}><AgendaVendedor /></Mod>} />
        <Route path="vendedor/comunicacao" element={<Mod m={['comunicacao','vendedor','sales']}><Comunicacao /></Mod>} />
        <Route path="vendedor/perfil" element={<Mod m={['vendedor','pedidos-vendedor','sales']}><DadosVendedor /></Mod>} />
        {/* Detalhe do pedido. A Tela 2 completa ainda será especificada;
            esta versão sustenta o "Visualizar detalhes" sem expor custo. */}
        <Route path="vendedor/pedidos/:id" element={<Mod m={['pedidos-vendedor','vendedor','sales']}><PedidoDetalhe /></Mod>} />
        <Route path="vendedor/pedidos/:id/documento" element={<Mod m={['pedidos-vendedor','vendedor','sales']}><DocumentoPedido /></Mod>} />
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
        {/* Precificação (Formação de Preço / Simulador / Relatórios) */}
        <Route path="pricing/formacao" element={<Mod m={['financial','products','settings']}><PriceFormation /></Mod>} />
        <Route path="pricing/rateio" element={<Navigate to="/rateio/despesas-fixas" replace />} />
        <Route path="pricing/simulador" element={<Mod m={['financial','products','settings']}><PriceSimulator /></Mod>} />
        <Route path="pricing/relatorios" element={<Mod m={['financial','products','settings']}><PricingReports /></Mod>} />
        {/* Rateio de Custos (Despesas / Produto / Pedido / Metas / Histórico) */}
        <Route path="rateio" element={<Navigate to="/rateio/despesas-fixas" replace />} />
        <Route path="rateio/despesas-fixas" element={<Mod m={['financial','products','settings']}><DespesasFixas /></Mod>} />
        <Route path="rateio/despesas-variaveis" element={<Mod m={['financial','products','settings']}><DespesasVariaveis /></Mod>} />
        <Route path="rateio/produto" element={<Mod m={['financial','products','settings']}><RateioProduto /></Mod>} />
        <Route path="rateio/pedido" element={<Mod m={['financial','products','settings']}><RateioPedido /></Mod>} />
        <Route path="rateio/metas" element={<Mod m={['financial','products','settings']}><SimuladorMetas /></Mod>} />
        <Route path="rateio/historico" element={<Mod m={['financial','products','settings']}><HistoricoRateios /></Mod>} />
        <Route path="rateio/rentabilidade" element={<Mod m={['financial','products','settings']}><Rentabilidade /></Mod>} />
        <Route path="engenharia/insumos" element={<Mod m={['financial','products','settings','production']}><Insumos /></Mod>} />
        {/* Fiscal */}
        <Route path="fiscal" element={<Mod m="fiscal"><Fiscal /></Mod>} />
        {/* Contábil / Fiscal */}
        <Route path="contabil" element={<Mod m={['financial','fiscal','settings']}><Contabil /></Mod>} />
        {/* Relatórios */}
        <Route path="reports" element={<Mod m="reports"><Reports /></Mod>} />
        {/* Config */}
        <Route path="settings" element={<Mod m="settings"><Settings /></Mod>} />
        <Route path="users" element={<AdminOnly><Users /></AdminOnly>} />
        {/* Matriz setor × módulo — quem enxerga o quê no ERP */}
        <Route path="permissoes" element={<Mod m="settings"><Permissoes /></Mod>} />
        <Route path="audit" element={<AdminOnly><Audit /></AdminOnly>} />
        {/* Aprovação das alterações pedidas pelos links públicos de cadastro */}
        <Route path="cadastro-aprovacoes" element={<AdminOnly><CadastroAprovacoes /></AdminOnly>} />
        <Route path="feriados" element={<Mod m={['settings','hr']}><Feriados /></Mod>} />
        {/* O cadastro que alimenta o catálogo público: famílias, gabaritos,
            caixa do liso, ocasiões e o banco de artes. */}
        <Route path="catalogo-admin" element={<Mod m={['settings','products']}><CatalogoAdmin /></Mod>} />
        {/* Sites — o painel de todos os endereços públicos (loja, catálogo,
            acompanhamento e autocadastros): como estão agora e onde se edita
            cada um. Um site por submódulo, e o índice deles em /sites. */}
        <Route path="sites" element={<Mod m={['sites','settings']}><Sites /></Mod>} />
        <Route path="sites/:key" element={<Mod m={['sites','settings']}><SiteDetalhe /></Mod>} />
        {/* Novos módulos */}
        <Route path="returns"  element={<Mod m="returns"><Returns /></Mod>}  />
        <Route path="quality"  element={<Mod m="quality"><Quality /></Mod>}  />
        <Route path="crm"      element={<Mod m="crm"><CRM /></Mod>}      />
        <Route path="marketing" element={<Mod m={['marketing','crm']}><Marketing /></Mod>} />
        <Route path="production" element={<Mod m={['production','quality','stock']}><Production /></Mod>} />
        <Route path="hr" element={<Mod m="hr"><HR /></Mod>}>
          <Route index element={<Navigate to="painel" replace />} />
          {/* Painel e Estrutura: as duas telas que alimentam todas as
              outras — tudo calculado do cadastro mestre. */}
          <Route path="painel"     element={<PainelRH />} />
          <Route path="estrutura"  element={<EstruturaEmpresa />} />
          <Route path="ponto"      element={<HRPonto />} />
          <Route path="ferias"     element={<HRFerias />} />
          <Route path="folha"      element={<HRFolha />} />
          <Route path="documentos" element={<HRDocumentos />} />
          <Route path="conformidade" element={<HRConformidade />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </Suspense>
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
