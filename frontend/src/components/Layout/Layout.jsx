import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, useMemo, useCallback, Suspense } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from '@/components/ErrorBoundary';
import GlobalSearch from '@/components/GlobalSearch';
import AIAssistant from '@/components/AIAssistant';
import { TelaCheiaProvider } from '@/contexts/TelaCheiaContext';

function PageLoading() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-primary-600" />
    </div>
  );
}

export default function Layout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  // TELA CHEIA DO MÓDULO: o módulo pede, o Layout apaga a moldura.
  const [telaCheia, setTelaCheia] = useState(false);
  const location = useLocation();

  // Fecha o sidebar mobile ao navegar
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  // Tela cheia vale para A TELA, não para o sistema. Trocar de módulo
  // devolve o menu — senão a pessoa chega no próximo sem saber por onde
  // sair, e o botão que ela usou ficou na tela anterior.
  useEffect(() => {
    setTelaCheia(false);
  }, [location.pathname]);

  // ESC devolve a moldura. Fica aqui, e não em cada módulo, porque a
  // saída não pode depender de o módulo ter lembrado de escrevê-la.
  useEffect(() => {
    if (!telaCheia) return;
    const onKey = e => {
      if (e.key !== 'Escape') return;
      const a = document.activeElement;
      if (a && /INPUT|SELECT|TEXTAREA/.test(a.tagName)) return;
      setTelaCheia(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [telaCheia]);

  const sairTelaCheia = useCallback(() => setTelaCheia(false), []);
  const alternarTelaCheia = useCallback(() => setTelaCheia(x => !x), []);
  const ctxTelaCheia = useMemo(
    () => ({ ativo: telaCheia, alternar: alternarTelaCheia, sair: sairTelaCheia }),
    [telaCheia, alternarTelaCheia, sairTelaCheia]);

  return (
    <TelaCheiaProvider value={ctxTelaCheia}>
    <div className="flex h-screen overflow-hidden bg-gray-50 erp-shell">
      <GlobalSearch />
      <AIAssistant />
      {/* Overlay escuro no mobile quando sidebar aberto */}
      {mobileSidebarOpen && !telaCheia && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      {!telaCheia && (
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(v => !v)}
          mobileOpen={mobileSidebarOpen}
          onMobileClose={() => setMobileSidebarOpen(false)}
        />
      )}

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        {!telaCheia && (
          <Header
            onToggleSidebar={() => setSidebarCollapsed(v => !v)}
            onToggleMobileSidebar={() => setMobileSidebarOpen(v => !v)}
          />
        )}
        {/* pb-28: espaço extra embaixo para o conteúdo nunca ficar atrás do botão flutuante da IA */}
        {/* O respiro de 24px so volta na tela larga de verdade. Entre 1024
            e 1536 pontos — onde caem os notebooks com ampliacao do
            Windows ligada — ele custava uma coluna de conteudo. */}
        <main className={telaCheia
          ? 'flex-1 overflow-y-auto p-3 pb-28'
          : 'flex-1 overflow-y-auto p-3 sm:p-4 lg:p-5 2xl:p-6 pb-28 lg:pb-28'}>
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>

          {/* O rodapé é assinatura, não trabalho: em tela cheia ele sai
              junto com o resto da moldura. */}
          {!telaCheia && (
            <footer className="flex flex-wrap items-center justify-between gap-2 mt-8 pt-4 text-[11px] text-gray-400 border-t border-gray-100">
              <span>© {new Date().getFullYear()} Lyon Copos Acrílicos. Todos os direitos reservados.</span>
              <a href="https://lyoncopos.com.br" target="_blank" rel="noreferrer" className="text-primary-500 hover:underline">
                LyonCopos.com.br
              </a>
            </footer>
          )}
        </main>
      </div>
    </div>
    </TelaCheiaProvider>
  );
}
