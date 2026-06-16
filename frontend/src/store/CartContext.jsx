import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const CartCtx = createContext(null);
const KEY = 'loja_cart';

export function CartProvider({ children }) {
  const [items, setItems] = useState(() => {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; }
  });

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(items)); }, [items]);

  // chave única por produto + cor + borda + volume + impressão
  const keyOf = i => `${i.product_id}::${i.color || ''}::${i.border || ''}::${i.volume || ''}::${i.print_method || ''}`;

  const add = useCallback((item) => {
    setItems(prev => {
      const k = keyOf(item);
      const found = prev.find(i => keyOf(i) === k);
      if (found) {
        return prev.map(i => keyOf(i) === k ? { ...i, quantity: i.quantity + item.quantity } : i);
      }
      return [...prev, item];
    });
  }, []);

  const setQty = useCallback((k, qty) => {
    setItems(prev => prev.map(i => keyOf(i) === k ? { ...i, quantity: Math.max(1, qty) } : i));
  }, []);

  const remove = useCallback((k) => {
    setItems(prev => prev.filter(i => keyOf(i) !== k));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.quantity * (i.unit_price || 0), 0);

  return (
    <CartCtx.Provider value={{ items, add, setQty, remove, clear, count, total, keyOf }}>
      {children}
    </CartCtx.Provider>
  );
}

export const useCart = () => useContext(CartCtx);
