import { createContext, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ThemeCtx = createContext({ isDark: true, toggleTheme: () => {} });

// As telas que o CLIENTE abre. Elas têm identidade própria — a loja é
// creme e laranja, o cadastro é azul-marinho com neon — e nenhuma delas
// é o ERP.
const PUBLICAS = [
  '/loja', '/catalogo', '/acompanhar',
  '/cadastro', '/cadastro-fornecedor', '/cadastro-transportadora',
];

const ehPublica = caminho =>
  PUBLICAS.some(p => caminho === p || caminho.startsWith(p + '/'));

/**
 * O ERP tem UM visual: o escuro neon aprovado. Não há mais alternância.
 *
 * Antes existia um botão de tema, e o valor ficava no localStorage. O
 * problema é que a preferência era gravada sozinha a cada carregamento,
 * mesmo sem ninguém clicar em nada — então todo navegador que já tinha
 * aberto o sistema carregava um 'light' que ninguém escolheu, e ficava
 * preso nele. A chave antiga é apagada aqui para não sobrar rastro.
 *
 * O ESCURO PARA NO ERP, E ISSO NÃO É DETALHE. A classe `dark` no <html>
 * vale para a página inteira, e o index.css usa !important para pintar
 * `bg-white` de azul-marinho e `text-gray-900` de branco. Quando ela
 * ficava ligada nas telas públicas, a página do produto da loja saía
 * com texto branco sobre fundo creme — ilegível — e os cartões brancos
 * viravam blocos escuros no meio do site claro. A loja não é o ERP: só
 * o ERP usa o tema do ERP.
 *
 * O contexto continua existindo com a mesma forma porque várias telas
 * leem `isDark` para decidir cor de gráfico e estilo inline.
 */
export function ThemeProvider({ children }) {
  const { pathname } = useLocation();
  const publica = ehPublica(pathname);

  useEffect(() => {
    const raiz = document.documentElement;
    raiz.classList.toggle('dark', !publica);
    try { localStorage.removeItem('erp-theme'); } catch {}
  }, [publica]);

  return (
    <ThemeCtx.Provider value={{ isDark: !publica, toggleTheme: () => {} }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);
