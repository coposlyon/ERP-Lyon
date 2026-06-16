import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './store.css';
import { CartProvider } from './CartContext';
import { StoreAuthProvider } from './StoreAuthContext';
import StoreLayout from './StoreLayout';
import StoreHome from './StoreHome';
import ProductPage from './ProductPage';
import CartPage from './CartPage';
import StoreLogin from './StoreLogin';

const StoreStudio = lazy(() => import('./StoreStudio'));

function StudioFallback() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-20 text-center text-gray-400">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-orange-500 mx-auto mb-3" />
      Carregando estúdio 3D...
    </div>
  );
}

export default function StoreApp() {
  return (
    <StoreAuthProvider>
      <CartProvider>
        <StoreLayout>
          <Routes>
            <Route index element={<StoreHome />} />
            <Route path="produto/:id" element={<ProductPage />} />
            <Route path="personalizar" element={<Suspense fallback={<StudioFallback />}><StoreStudio /></Suspense>} />
            <Route path="carrinho" element={<CartPage />} />
            <Route path="login" element={<StoreLogin />} />
            <Route path="*" element={<Navigate to="/loja" replace />} />
          </Routes>
        </StoreLayout>
      </CartProvider>
    </StoreAuthProvider>
  );
}
