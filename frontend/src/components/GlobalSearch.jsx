import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, Package, User, ShoppingCart, ArrowRight, X } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const SHORTCUTS = [
  { label: 'PDV / Caixa',        path: '/pdv',            module: 'pdv' },
  { label: 'Nova venda',         path: '/sales/new',      module: 'sales' },
  { label: 'Produtos',           path: '/products',       module: 'products' },
  { label: 'Clientes',           path: '/customers',      module: 'customers' },
  { label: 'Estoque',            path: '/stock',          module: 'stock' },
  { label: 'Estúdio 3D',         path: '/studio',         module: 'customizations' },
  { label: 'Financeiro',         path: '/financial',      module: 'financial' },
  { label: 'Relatórios',         path: '/reports',        module: 'reports' },
  { label: 'Orçamentos',         path: '/quotes',         module: 'quotes' },
  { label: 'Recursos Humanos',   path: '/hr/ponto',       module: 'hr' },
];

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  const navigate = useNavigate();
  const { hasModule } = useAuth();

  useEffect(() => {
    function onKey(e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen(o => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    }
    function onOpen() { setOpen(true); }
    window.addEventListener('keydown', onKey);
    window.addEventListener('open-global-search', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('open-global-search', onOpen);
    };
  }, []);

  useEffect(() => {
    if (open) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  const { data } = useQuery({
    queryKey: ['global-search', q],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(q)}`),
    enabled: open && q.trim().length >= 2,
  });

  const shortcuts = SHORTCUTS.filter(s => hasModule(s.module) &&
    (!q || s.label.toLowerCase().includes(q.toLowerCase())));

  function go(path) { setOpen(false); navigate(path); }

  if (!open) return null;

  const products = data?.products || [];
  const customers = data?.customers || [];
  const sales = data?.sales || [];
  const hasResults = products.length || customers.length || sales.length || shortcuts.length;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-4 border-b border-gray-100">
          <Search size={18} className="text-gray-400" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)}
            placeholder="Buscar produtos, clientes, vendas... ou ir para um módulo"
            className="flex-1 py-4 outline-none text-sm" />
          <kbd className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">esc</kbd>
          <button onClick={() => setOpen(false)} className="text-gray-300 hover:text-gray-500"><X size={16} /></button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-2">
          {shortcuts.length > 0 && (
            <Group title="Ir para">
              {shortcuts.map(s => (
                <Row key={s.path} onClick={() => go(s.path)} icon={ArrowRight} label={s.label} />
              ))}
            </Group>
          )}
          {products.length > 0 && (
            <Group title="Produtos">
              {products.map(p => (
                <Row key={p.id} onClick={() => go('/products')} icon={Package}
                  label={p.name} hint={`${p.code || ''} · ${fmt(p.sale_price)}`} />
              ))}
            </Group>
          )}
          {customers.length > 0 && (
            <Group title="Clientes">
              {customers.map(c => (
                <Row key={c.id} onClick={() => go(`/customers/${c.id}`)} icon={User}
                  label={c.name} hint={c.cpf_cnpj || c.phone || ''} />
              ))}
            </Group>
          )}
          {sales.length > 0 && (
            <Group title="Vendas">
              {sales.map(s => (
                <Row key={s.id} onClick={() => go(`/sales/${s.id}`)} icon={ShoppingCart}
                  label={`Venda #${s.number}`} hint={`${s.CLIENTES?.name || ''} · ${fmt(s.total)}`} />
              ))}
            </Group>
          )}
          {q.trim().length >= 2 && !hasResults && (
            <p className="text-center text-sm text-gray-400 py-8">Nada encontrado para "{q}"</p>
          )}
          {q.trim().length < 2 && shortcuts.length === 0 && (
            <p className="text-center text-sm text-gray-400 py-8">Digite para buscar</p>
          )}
        </div>
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return (
    <div className="mb-1">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-1.5">{title}</p>
      {children}
    </div>
  );
}
function Row({ onClick, icon: Icon, label, hint }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-violet-50 text-left transition-colors">
      <Icon size={16} className="text-gray-400 flex-shrink-0" />
      <span className="flex-1 text-sm font-medium text-gray-800 truncate">{label}</span>
      {hint && <span className="text-xs text-gray-400 truncate max-w-[40%]">{hint}</span>}
    </button>
  );
}
