import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, User, X, Phone, IdCard } from 'lucide-react';
import api from '@/lib/api';

// Seletor de cliente por busca (ID / nome / telefone / CPF) — funciona com
// milhares de clientes. value = id; onSelect recebe o objeto do cliente (ou null).
export default function CustomerPicker({ customerId, onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(null);

  // carrega o cliente atual (ex.: ao abrir um orçamento existente)
  const { data: loaded } = useQuery({
    queryKey: ['customer-one', customerId],
    queryFn: () => api.get(`/customers/${customerId}`),
    enabled: !!customerId && selected?.id !== customerId,
  });
  useEffect(() => { if (loaded?.id) setSelected(loaded); }, [loaded]);
  useEffect(() => { if (!customerId) setSelected(null); }, [customerId]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['customer-pick', search],
    queryFn: () => api.get(`/customers?search=${encodeURIComponent(search.trim())}&limit=8&is_active=true`),
    enabled: open && search.trim().length >= 1,
  });

  function pick(c) { setSelected(c); onSelect(c); setOpen(false); setSearch(''); }
  function consumidorFinal() { setSelected(null); onSelect(null); setOpen(false); setSearch(''); }

  // Cliente selecionado (card)
  if (selected && !open) {
    return (
      <div className="border border-gray-200 rounded-xl p-3 flex items-start gap-3">
        <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center shrink-0 font-bold">
          {(selected.name || '?').charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-gray-900 truncate flex items-center gap-1.5">
            {selected.name}
            {selected.display_id != null && <span className="text-[10px] font-mono bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">#{selected.display_id}</span>}
          </p>
          <div className="text-xs text-gray-400 flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
            {selected.cpf_cnpj && <span className="inline-flex items-center gap-1"><IdCard size={11} /> {selected.cpf_cnpj}</span>}
            {selected.phone && <span className="inline-flex items-center gap-1"><Phone size={11} /> {selected.phone}</span>}
          </div>
        </div>
        <button type="button" onClick={() => { setOpen(true); }} className="text-xs font-medium text-primary-600 hover:text-primary-700 shrink-0">Trocar</button>
      </div>
    );
  }

  // Busca
  return (
    <div>
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input autoFocus className="input pl-9" placeholder="Buscar por nome, ID, telefone ou CPF..."
          value={search} onChange={e => setSearch(e.target.value)} />
        {open && selected && (
          <button type="button" onClick={() => setOpen(false)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={15} /></button>
        )}
      </div>

      <div className="mt-1.5 border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
        <button type="button" onClick={consumidorFinal}
          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 text-gray-500">
          <User size={14} /> Consumidor Final (sem cliente)
        </button>
        {search.trim().length >= 1 && (results?.data || []).map(c => (
          <button key={c.id} type="button" onClick={() => pick(c)}
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2">
            {c.display_id != null && <span className="text-[10px] font-mono bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 shrink-0">#{c.display_id}</span>}
            <span className="min-w-0 flex-1">
              <span className="font-medium block truncate">{c.name}</span>
              <span className="text-xs text-gray-400">{c.cpf_cnpj || ''}{c.cpf_cnpj && c.phone ? ' · ' : ''}{c.phone || ''}</span>
            </span>
          </button>
        ))}
        {isFetching && <div className="px-3 py-2 text-xs text-gray-400">Buscando...</div>}
        {!isFetching && search.trim().length >= 1 && (results?.data || []).length === 0 && (
          <div className="px-3 py-2 text-xs text-gray-400">Nenhum cliente encontrado.</div>
        )}
      </div>
    </div>
  );
}
