import { createContext, useContext, useState, useEffect } from 'react';

const ThemeCtx = createContext({ isDark: false, toggleTheme: () => {} });

export function ThemeProvider({ children }) {
  // Padrão escuro: é o visual aprovado do sistema. Quem já escolheu
  // claro alguma vez continua no claro — a preferência gravada manda.
  const [isDark, setIsDark] = useState(() => {
    try { return (localStorage.getItem('erp-theme') || 'dark') === 'dark'; }
    catch { return true; }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try { localStorage.setItem('erp-theme', isDark ? 'dark' : 'light'); } catch {}
  }, [isDark]);

  return (
    <ThemeCtx.Provider value={{ isDark, toggleTheme: () => setIsDark(v => !v) }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
