import { createContext, useContext, useState, useCallback } from 'react';

// Autenticação SUPER simples do cliente da loja — só guarda o cliente no
// localStorage. Segurança intencionalmente mínima (login só por CPF).
const KEY = 'lyon_store_customer';
const Ctx = createContext(null);

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; }
}

export function StoreAuthProvider({ children }) {
  const [customer, setCustomer] = useState(read);

  const login = useCallback((c) => {
    if (!c) return;
    localStorage.setItem(KEY, JSON.stringify(c));
    setCustomer(c);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(KEY);
    setCustomer(null);
  }, []);

  return <Ctx.Provider value={{ customer, login, logout }}>{children}</Ctx.Provider>;
}

export function useStoreAuth() {
  return useContext(Ctx) || { customer: null, login: () => {}, logout: () => {} };
}

// Usado pela página de cadastro (que fica FORA do StoreAuthProvider) para
// já deixar o cliente logado antes de redirecionar para a loja.
export function setStoreCustomer(c) {
  if (c) localStorage.setItem(KEY, JSON.stringify(c));
}
