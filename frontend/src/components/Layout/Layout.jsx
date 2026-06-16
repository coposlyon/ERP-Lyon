import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect, Suspense } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import ErrorBoundary from '@/components/ErrorBoundary';
import GlobalSearch from '@/components/GlobalSearch';
import AIAssistant from '@/components/AIAssistant';

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
  const location = useLocation();

  // Fecha o sidebar mobile ao navegar
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <GlobalSearch />
      <AIAssistant />
      {/* Overlay escuro no mobile quando sidebar aberto */}
      {mobileSidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileSidebarOpen(false)}
        />
      )}

      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(v => !v)}
        mobileOpen={mobileSidebarOpen}
        onMobileClose={() => setMobileSidebarOpen(false)}
      />

      <div className="flex flex-col flex-1 overflow-hidden min-w-0">
        <Header
          onToggleSidebar={() => setSidebarCollapsed(v => !v)}
          onToggleMobileSidebar={() => setMobileSidebarOpen(v => !v)}
        />
        {/* pb-28: espaço extra embaixo para o conteúdo nunca ficar atrás do botão flutuante da IA */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 pb-28 lg:pb-28">
          <ErrorBoundary key={location.pathname}>
            <Suspense fallback={<PageLoading />}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
