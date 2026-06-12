import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ScrollText, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import api from '@/lib/api';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const ENTITIES = {
  product:   { l: 'Produto',      cls: 'bg-blue-100   text-blue-700'   },
  sale:      { l: 'Venda',        cls: 'bg-green-100  text-green-700'  },
  stock:     { l: 'Estoque',      cls: 'bg-amber-100  text-amber-700'  },
  user:      { l: 'Usuário',      cls: 'bg-violet-100 text-violet-700' },
  employee:  { l: 'Colaborador',  cls: 'bg-indigo-100 text-indigo-700' },
  ponto:     { l: 'Ponto',        cls: 'bg-teal-100   text-teal-700'   },
  payroll:   { l: 'Folha',        cls: 'bg-pink-100   text-pink-700'   },
  financial: { l: 'Financeiro',   cls: 'bg-orange-100 text-orange-700' },
};

const ACTIONS = {
  create:     'Criação',
  update:     'Alteração',
  delete:     'Exclusão',
  status:     'Mudança de status',
  password:   'Senha redefinida',
  access:     'Acesso concedido',
  revoke:     'Acesso revogado',
  adjustment: 'Ajuste de estoque',
  payment:    'Pagamento',
  situation:  'Ajuste de ponto',
};

function DetailsCell({ details }) {
  if (!details) return <span className="text-gray-300 text-xs">—</span>;
  const parts = Object.entries(details).map(([k, v]) => {
    if (v && typeof v === 'object' && 'de' in v && 'para' in v) {
      return `${k}: ${v.de} → ${v.para}`;
    }
    if (v && typeof v === 'object') return `${k}: ${JSON.stringify(v)}`;
    return `${k}: ${v}`;
  });
  return (
    <span className="text-xs text-gray-500" title={parts.join(' · ')}>
      {parts.join(' · ').slice(0, 90)}{parts.join(' · ').length > 90 ? '…' : ''}
    </span>
  );
}

export default function Audit() {
  const [page, setPage]         = useState(1);
  const [entity, setEntity]     = useState('');
  const [action, setAction]     = useState('');
  const [search, setSearch]     = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate]   = useState('');
  const limit = 50;

  const params = new URLSearchParams({ page, limit });
  if (entity)    params.set('entity', entity);
  if (action)    params.set('action', action);
  if (search)    params.set('search', search);
  if (startDate) params.set('start_date', startDate);
  if (endDate)   params.set('end_date', endDate);

  const { data, isLoading } = useQuery({
    queryKey: ['audit', page, entity, action, search, startDate, endDate],
    queryFn: () => api.get(`/audit?${params.toString()}`),
  });

  const rows  = data?.data || [];
  const total = data?.total || 0;
  const pages = Math.max(1, Math.ceil(total / limit));

  function resetPage(setter) {
    return v => { setter(v); setPage(1); };
  }

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <ScrollText size={18} className="text-violet-600"/>
          </div>
          <div>
            <h1 className="page-title">Auditoria</h1>
            <p className="text-sm text-gray-500 mt-0.5">{total} registros · quem alterou o quê e quando</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="card p-4 flex items-end gap-3 flex-wrap">
        <div>
          <label className="label text-xs">Entidade</label>
          <select className="input text-sm w-40" value={entity} onChange={e => resetPage(setEntity)(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ENTITIES).map(([k, v]) => <option key={k} value={k}>{v.l}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">Ação</label>
          <select className="input text-sm w-44" value={action} onChange={e => resetPage(setAction)(e.target.value)}>
            <option value="">Todas</option>
            {Object.entries(ACTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label className="label text-xs">De</label>
          <input type="date" className="input text-sm" value={startDate} onChange={e => resetPage(setStartDate)(e.target.value)} />
        </div>
        <div>
          <label className="label text-xs">Até</label>
          <input type="date" className="input text-sm" value={endDate} onChange={e => resetPage(setEndDate)(e.target.value)} />
        </div>
        <div className="flex-1 min-w-44">
          <label className="label text-xs">Usuário</label>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input text-sm pl-8" placeholder="Nome do usuário..."
              value={search} onChange={e => resetPage(setSearch)(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Tabela */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Data / Hora</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Usuário</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Entidade</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">Ação</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Detalhes</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">Carregando...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">
                  Nenhum registro de auditoria{entity || action || search ? ' neste filtro' : ' ainda'}
                </td></tr>
              ) : rows.map(r => {
                const E = ENTITIES[r.entity] || { l: r.entity, cls: 'bg-gray-100 text-gray-600' };
                return (
                  <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 text-xs text-gray-500 font-mono">
                      {format(parseISO(r.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR })}
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-700 font-medium">{r.user_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className={`badge text-xs ${E.cls}`}>{E.l}</span>
                    </td>
                    <td className="px-4 py-2.5 text-sm text-gray-600">{ACTIONS[r.action] || r.action}</td>
                    <td className="px-4 py-2.5"><DetailsCell details={r.details} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <span className="text-xs text-gray-400">Página {page} de {pages} · {total} registros</span>
            <div className="flex gap-1">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
                className="btn-secondary p-1.5 disabled:opacity-40"><ChevronLeft size={15}/></button>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)}
                className="btn-secondary p-1.5 disabled:opacity-40"><ChevronRight size={15}/></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
