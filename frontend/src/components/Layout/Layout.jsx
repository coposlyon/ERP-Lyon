import { Outlet, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

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
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
