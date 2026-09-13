import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '@/lib/api';
import { podeVerTela } from '@/lib/menu';

const AuthContext = createContext(null);

// Lê um JSON do localStorage sem derrubar o site. `JSON.stringify(undefined)`
// não vira texto, e o setItem grava a palavra "undefined" — um login sem
// tenant deixava isso salvo, e o JSON.parse daqui quebrava o AuthProvider,
// que fica por fora de tudo: tela branca em TODAS as rotas daquele
// navegador, inclusive a loja e o catálogo, que nem usam login.
function lerJson(chave) {
  const bruto = localStorage.getItem(chave);
  if (!bruto || bruto === 'undefined' || bruto === 'null') return null;
  try { return JSON.parse(bruto); } catch { localStorage.removeItem(chave); return null; }
}

function gravarJson(chave, valor) {
  if (valor === undefined || valor === null) localStorage.removeItem(chave);
  else localStorage.setItem(chave, JSON.stringify(valor));
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = lerJson('user');
    const storedTenant = lerJson('tenant');
    if (u) {
      setUser(u);
      if (storedTenant) setTenant(storedTenant);

      // O login guardou um retrato; o acesso pode ter mudado desde então
      // (o admin mexeu no setor, alguém trocou de área). Sem esta
      // conferência, a permissão nova só valeria depois de um logout —
      // e ninguém faz logout.
      api.get('/setores/meu-acesso')
        .then(a => {
          const atualizado = { ...u, ...a };
          setUser(atualizado);
          gravarJson('user', atualizado);
        })
        .catch(() => { /* offline ou sessão velha: segue com o retrato */ });
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const data = await api.post('/auth/login', { email, password });
    localStorage.setItem('access_token', data.access_token);
    localStorage.setItem('refresh_token', data.refresh_token);
    gravarJson('user', data.user);
    gravarJson('tenant', data.user.tenant);
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

  // Pode ABRIR esta tela?
  //
  // Duas travas em série: o módulo (que o servidor também cobra) e a
  // lista de telas liberadas para esta pessoa. `allowed_screens` nulo
  // quer dizer "ninguém escolheu tela nenhuma" — vale a regra antiga, o
  // módulo decide. Lista vazia é escolha: não vê nada.
  const hasScreen = useCallback((path) => podeVerTela(path, {
    isAdmin: user?.role === 'admin',
    hasModule,
    screens: user?.allowed_screens ?? null,
  }), [user, hasModule]);

  const isAdmin = user?.role === 'admin';
  const isManager = ['admin', 'manager'].includes(user?.role);

  // Qual ERP esta pessoa vê. Vem do setor dela (Configurações →
  // Permissões por setor): 'erp' é o sistema inteiro, 'vendedor' é a
  // área enxuta de cinco itens. Admin sempre vê o sistema inteiro.
  const layout = isAdmin ? 'erp' : (user?.layout === 'vendedor' ? 'vendedor' : 'erp');
  const homePath = user?.home_path || '/';

  return (
    <AuthContext.Provider value={{
      user, tenant, loading, login, logout, hasModule, hasScreen, isAdmin, isManager,
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
