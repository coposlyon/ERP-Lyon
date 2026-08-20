// ============================================================
// A LOJA — COPOS LISOS.
//
// A loja vende o copo como ele sai do molde: modelo, cor, quantidade,
// frete, pagamento. Sem arte, sem impressão, sem editor.
//
// A PERSONALIZAÇÃO MUDOU DE ENDEREÇO. Copo com nome, data, logo ou
// acabamento é o Catálogo de Produtos Personalizados, em /catalogo — lá
// existem o gabarito, o banco de artes, a compatibilidade de tinta e a
// aprovação da arte, que é o que a personalização precisa para não
// voltar cortada da gráfica.
//
// O antigo /loja/personalizar continua respondendo, e leva para lá: o
// link já foi mandado em conversa de WhatsApp que ninguém apaga, e link
// que dá 404 é cliente perdido.
// ============================================================
import { Routes, Route, Navigate } from 'react-router-dom';
import './store.css';
import { CartProvider } from './CartContext';
import { StoreAuthProvider } from './StoreAuthContext';
import StoreLayout from './StoreLayout';
import StoreHome from './StoreHome';
import ProductPage from './ProductPage';
import BorderPage from './BorderPage';
import CartPage from './CartPage';
import StoreLogin from './StoreLogin';
import StoreOrders from './StoreOrders';
import PayOrder from './PayOrder';
import StoreProfile from './StoreProfile';

/**
 * Sai do React Router para /catalogo.
 *
 * O catálogo é outra aplicação de rota (fora do StoreLayout): um
 * `<Navigate>` daqui trocaria só o endereço e deixaria o cliente dentro
 * da casca da loja. Recarregar é o que entrega a tela certa.
 */
function IrParaCatalogo() {
  window.location.replace('/catalogo');
  return null;
}

export default function StoreApp() {
  return (
    <StoreAuthProvider>
      <CartProvider>
        <StoreLayout>
          <Routes>
            <Route index element={<StoreHome />} />
            <Route path="produto/:id" element={<ProductPage />} />
            <Route path="borda" element={<BorderPage />} />
            <Route path="personalizar" element={<IrParaCatalogo />} />
            <Route path="carrinho" element={<CartPage />} />
            <Route path="pagar/:id" element={<PayOrder />} />
            <Route path="login" element={<StoreLogin />} />
            <Route path="pedidos" element={<StoreOrders />} />
            <Route path="perfil" element={<StoreProfile />} />
            <Route path="*" element={<Navigate to="/loja" replace />} />
          </Routes>
        </StoreLayout>
      </CartProvider>
    </StoreAuthProvider>
  );
}
