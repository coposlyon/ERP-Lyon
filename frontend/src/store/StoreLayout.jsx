import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ShoppingCart, Droplet, Phone } from 'lucide-react';
import storeApi from './storeApi';
import { useCart } from './CartContext';

export default function StoreLayout({ children }) {
  const { count } = useCart();
  const navigate = useNavigate();
  const { data: store } = useQuery({ queryKey: ['store-info'], queryFn: () => storeApi.get('/store') });

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-gray-900 text-white shadow-lg">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/loja" className="flex items-center gap-2 font-extrabold text-lg tracking-tight">
            <span className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
              <Droplet size={18} className="text-white" />
            </span>
            <span>{store?.name || 'Loja'}</span>
          </Link>
          <button onClick={() => navigate('/loja/carrinho')}
            className="relative flex items-center gap-2 bg-orange-500 hover:bg-orange-600 transition-colors px-4 py-2 rounded-xl font-semibold text-sm">
            <ShoppingCart size={17} />
            <span className="hidden sm:inline">Carrinho</span>
            {count > 0 && (
              <span className="absolute -top-2 -right-2 bg-white text-orange-600 text-xs font-bold w-5 h-5 rounded-full flex items-center justify-center">
                {count}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      {/* Footer */}
      <footer className="bg-gray-900 text-gray-300 mt-12">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 font-bold text-white">
            <span className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
              <Droplet size={15} />
            </span>
            {store?.name || 'Loja'}
          </div>
          <div className="text-sm text-center sm:text-right space-y-1">
            {store?.phone && (
              <p className="flex items-center gap-1.5 justify-center sm:justify-end">
                <Phone size={13} className="text-orange-400" /> {store.phone}
              </p>
            )}
            <p className="text-xs text-gray-500">Personalize do seu jeito. Com a cara da sua marca.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
