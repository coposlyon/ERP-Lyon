import { createContext, useContext, useEffect } from 'react';

const ThemeCtx = createContext({ isDark: true, toggleTheme: () => {} });

/**
 * O ERP tem UM visual: o escuro neon aprovado. Não há mais alternância.
 *
 * Antes existia um botão de tema, e o valor ficava no localStorage. O
 * problema é que a preferência era gravada sozinha a cada carregamento,
 * mesmo sem ninguém clicar em nada — então todo navegador que já tinha
 * aberto o sistema carregava um 'light' que ninguém escolheu, e ficava
 * presos nele. A chave antiga é apagada aqui para não sobrar rastro.
 *
 * O contexto continua existindo com a mesma forma porque várias telas
 * leem `isDark` para decidir cor de gráfico e estilo inline; elas
 * seguem funcionando, agora sempre no escuro.
 */
export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.classList.add('dark');
    try { localStorage.removeItem('erp-theme'); } catch {}
  }, []);

  return (
    <ThemeCtx.Provider value={{ isDark: true, toggleTheme: () => {} }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
