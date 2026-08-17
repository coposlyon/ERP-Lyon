import { useState, useMemo } from 'react';
import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

export function Table({ columns, data, loading, emptyMessage = 'Nenhum registro encontrado.', onRowClick, rowClassName }) {
  // Ordenação por cabeçalho (apenas nas colunas marcadas com `sortable`)
  const [sort, setSort] = useState({ key: null, dir: 'asc' });

  function toggleSort(col) {
    if (!col.sortable) return;
    setSort(s => {
      if (s.key !== col.key) return { key: col.key, dir: 'asc' };
      if (s.dir === 'asc')   return { key: col.key, dir: 'desc' };
      return { key: null, dir: 'asc' }; // 3º clique remove a ordenação
    });
  }

  const sortedData = useMemo(() => {
    if (!sort.key || !data) return data;
    const col = columns.find(c => c.key === sort.key);
    if (!col) return data;
    const getVal = row => (col.sortAccessor ? col.sortAccessor(row) : row[col.key]);
    const arr = [...data].sort((a, b) => {
      const va = getVal(a), vb = getVal(b);
      const na = Number(va), nb = Number(vb);
      const bothNum = va !== '' && vb !== '' && va != null && vb != null && !isNaN(na) && !isNaN(nb);
      if (bothNum) return na - nb;
      return String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true });
    });
    return sort.dir === 'desc' ? arr.reverse() : arr;
  }, [data, columns, sort]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-gray-400">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mr-3" />
        Carregando...
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-3">
          <span className="text-2xl">📋</span>
        </div>
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    // O cabeçalho gruda no topo enquanto as linhas rolam: numa lista de
    // 43 clientes (ou 400) perder de vista qual coluna é qual obriga a
    // subir de novo só para conferir. `overflow-x-auto` sozinho não
    // basta — o sticky precisa de um contêiner que role no eixo Y, e é
    // isso que o `max-height` abaixo cria.
    <div className="overflow-auto tabela-rolagem">
      <table className="table-auto">
        <thead className="sticky top-0 z-20">
          <tr>
            {columns.map(col => {
              const active = sort.key === col.key;
              return (
                <th key={col.key} style={{ width: col.width }}
                  onClick={() => toggleSort(col)}
                  className={col.sortable ? 'cursor-pointer select-none hover:text-primary-600 transition-colors' : undefined}
                  title={col.sortable ? 'Clique para ordenar' : undefined}>
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {col.sortable && (
                      active
                        ? (sort.dir === 'asc' ? <ChevronUp size={13} className="text-primary-600" /> : <ChevronDown size={13} className="text-primary-600" />)
                        : <ChevronsUpDown size={13} className="text-gray-300" />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sortedData.map((row, i) => (
            <tr key={row.id || i}
              className={`${onRowClick ? 'cursor-pointer hover:bg-gray-50 transition-colors' : 'cursor-pointer'} ${rowClassName ? rowClassName(row) : ''}`}
              onClick={onRowClick ? () => onRowClick(row) : undefined}>
              {columns.map(col => (
                <td key={col.key}>
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Pagination({ page, total, limit, onPageChange }) {
  const totalPages = Math.ceil(total / limit);
  const start = (page - 1) * limit + 1;
  const end = Math.min(page * limit, total);

  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
      <p className="text-xs sm:text-sm text-gray-500">
        {start}–{end} de {total} registros
      </p>
      <div className="flex items-center gap-1 ml-auto">
        <button
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1}
          className="btn-ghost btn-sm p-1.5 disabled:opacity-40"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = page <= 3 ? i + 1 : page - 2 + i;
          if (p > totalPages) return null;
          return (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`btn-sm px-3 py-1.5 rounded-lg text-sm ${
                p === page ? 'bg-primary-600 text-white' : 'btn-ghost'
              }`}
            >
              {p}
            </button>
          );
        })}
        <button
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages}
          className="btn-ghost btn-sm p-1.5 disabled:opacity-40"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
