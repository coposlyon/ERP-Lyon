import { Routes, Route, Navigate } from 'react-router-dom';
import './store.css';
import { CartProvider } from './CartContext';
import StoreLayout from './StoreLayout';
import StoreHome from './StoreHome';
import ProductPage from './ProductPage';
import CartPage from './CartPage';

export default function StoreApp() {
  return (
    <CartProvider>
      <StoreLayout>
        <Routes>
          <Route index element={<StoreHome />} />
          <Route path="produto/:id" element={<ProductPage />} />
          <Route path="carrinho" element={<CartPage />} />
          <Route path="*" element={<Navigate to="/loja" replace />} />
        </Routes>
      </StoreLayout>
    </CartProvider>
  );
}
