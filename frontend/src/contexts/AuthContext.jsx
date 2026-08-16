import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('user');
    const storedTenant = localStorage.getItem('tenant');
    if (stored) {
      const u = JSON.parse(stored);
      setUser(u);
      if (storedTenant) setTenant(JSON.parse(storedTenant));

      // O login guardou um retrato; o acesso pode ter mudado desde então
      // (o admin mexeu no setor, alguém trocou de área). Sem esta
      // conferência, a permissão nova só valeria depois de um logout —
      // e ninguém faz logout.
      api.get('/setores/meu-acesso')
        .then(a => {
          const atualizado = { ...u, ...a };
          setUser(atualizado);
          localStorage.setItem('user', JSON.stringify(atualizado));
        })
        .catch(() => { /* offline ou sessão velha: segue com o retrato */ });
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    localStorage.setItem('user', JSON.stringify(data.user));
    localStorage.setItem('tenant', JSON.stringify(data.user.tenant));
    setUser(data.user);
    setTenant(data.user.tenant);
    return data;
  }

  async function logout() {
    try { await api.post('/auth/logout'); } catch {}
    localStorage.clear();
    setUser(null);
    setTenant(null);
  }

  // Verifica se o usuário pode ver/usar um módulo.
  // admin → tudo | allowed_modules null → sem restrição (legado) | senão precisa estar na lista
  const hasModule = useCallback((...modules) => {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const allowed = user.allowed_modules;
    if (allowed == null) return true;
    return modules.some(m => allowed.includes(m));
  }, [user]);

  const isAdmin = user?.role === 'admin';
  const isManager = ['admin', 'manager'].includes(user?.role);

  // Qual ERP esta pessoa vê. Vem do setor dela (Configurações →
  // Permissões por setor): 'erp' é o sistema inteiro, 'vendedor' é a
  // área enxuta de cinco itens. Admin sempre vê o sistema inteiro.
  const layout = isAdmin ? 'erp' : (user?.layout === 'vendedor' ? 'vendedor' : 'erp');
  const homePath = user?.home_path || '/';

  return (
    <AuthContext.Provider value={{
      user, tenant, loading, login, logout, hasModule, isAdmin, isManager,
      layout, homePath, sector: user?.sector_key || null, sectorName: user?.sector_name || null,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
