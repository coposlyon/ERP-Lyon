import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Factory, Play, Check, Search, RefreshCw, Loader2, Save, Image as ImageIcon } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const STAGES = {
  aguardando_arte:     { label: 'Aguardando Arte',     cls: 'bg-gray-100 text-gray-600' },
  aguardando_producao: { label: 'Aguardando Produção', cls: 'bg-blue-100 text-blue-700' },
  revelacao:           { label: 'Em Revelação',        cls: 'bg-yellow-100 text-yellow-700' },
  producao:            { label: 'Em Produção',         cls: 'bg-orange-100 text-orange-700' },
  embalagem:           { label: 'Em Embalagem',        cls: 'bg-violet-100 text-violet-700' },
  finalizado:          { label: 'Finalizado',          cls: 'bg-green-100 text-green-700' },
};
const STEPS = [
  { stage: 'revelacao', label: 'Revelação' },
  { stage: 'producao',  label: 'Produção' },
  { stage: 'embalagem', label: 'Embalagem' },
];
const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

function canDo(s, stage, action) {
  if (!s) return false;
  if (action === 'finish') return s.stage === stage;
  if (stage === 'revelacao') return ['aguardando_arte', 'aguardando_producao'].includes(s.stage);
  if (stage === 'producao')  return s.stage === 'revelacao';
  if (stage === 'embalagem') return s.stage === 'producao';
  return false;
}

export default function Production() {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ start_date: '', end_date: '', search: '' });
  const [query, setQuery] = useState({ start_date: '', end_date: '', search: '' });
  const [selId, setSelId] = useState(null);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ['production', query],
    queryFn: () => api.get(`/production?${new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v)))}`),
  });
  const rows = data?.data || [];
  const selected = rows.find(r => r.id === selId) || null;

  const { data: detail } = useQuery({
    queryKey: ['production-detail', selId],
    queryFn: () => api.get(`/production/${selId}`),
    enabled: !!selId,
  });

  const stageMut = useMutation({
    mutationFn: ({ stage, action }) => api.post(`/production/${selId}/stage`, { stage, action }),
    onSuccess: () => { qc.invalidateQueries(['production']); qc.invalidateQueries(['production-detail', selId]); toast.success('Etapa registrada!'); },
    onError: e => toast.error(e.error || 'Erro (rodou a migration 019?)'),
  });

  const [edit, setEdit] = useState({});
  const saveFields = useMutation({
    mutationFn: () => api.patch(`/production/${selId}`, edit),
    onSuccess: () => { qc.invalidateQueries(['production']); qc.invalidateQueries(['production-detail', selId]); toast.success('Salvo!'); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });
  // sincroniza campos editáveis quando troca de pedido
  const d = detail || {};
  const ef = (k, fallback = '') => (k in edit ? edit[k] : (d[k] ?? fallback));

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center"><Factory size={18} className="text-orange-600" /></div>
          <div>
            <h1 className="page-title">Produção</h1>
            <p className="text-sm text-gray-500 mt-0.5">Revelação · Produção · Embalagem</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="btn-secondary"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Atualizar</button>
      </div>

      {/* Toolbar de etapas */}
      <div className="card p-3 flex flex-wrap items-center gap-2">
        {STEPS.map(s => (
          <div key={s.stage} className="flex items-center gap-1">
            <button disabled={!canDo(selected, s.stage, 'start') || stageMut.isPending}
              onClick={() => stageMut.mutate({ stage: s.stage, action: 'start' })}
              className="text-xs font-medium px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-30 inline-flex items-center gap-1">
              <Play size={13} /> Iniciar {s.label}
            </button>
            <button disabled={!canDo(selected, s.stage, 'finish') || stageMut.isPending}
              onClick={() => stageMut.mutate({ stage: s.stage, action: 'finish' })}
              className="text-xs font-medium px-3 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-30 inline-flex items-center gap-1">
              <Check size={13} /> Finalizar {s.label}
            </button>
          </div>
        ))}
        {!selected && <span className="text-xs text-gray-400 ml-2">Selecione um pedido na lista.</span>}
      </div>

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Saída de</label>
          <input type="date" className="input" value={filters.start_date} onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">até</label>
          <input type="date" className="input" value={filters.end_date} onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} />
        </div>
        <div className="flex-1 min-w-48">
          <label className="label">Procurar (pedido ou cliente)</label>
          <input className="input" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && setQuery(filters)} placeholder="Nº do pedido ou nome..." />
        </div>
        <button onClick={() => setQuery(filters)} className="btn-primary"><Search size={15} /> Filtrar</button>
      </div>

      {/* Board */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-2">Pedido</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Evento</th>
                <th className="px-3 py-2">Saída</th>
                <th className="px-3 py-2 text-center">Dias</th>
                <th className="px-3 py-2">Transportadora</th>
                <th className="px-3 py-2">Cidade/UF</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></td></tr>}
              {!isFetching && rows.length === 0 && <tr><td colSpan={9} className="p-8 text-center text-gray-400">Nenhum pedido em produção.</td></tr>}
              {rows.map(r => {
                const st = STAGES[r.stage] || STAGES.aguardando_producao;
                const late = r.diff_days != null && r.diff_days < 0;
                return (
                  <tr key={r.id} onClick={() => { setSelId(r.id); setEdit({}); }}
                    className={`border-b border-gray-50 cursor-pointer ${selId === r.id ? 'bg-orange-50' : 'hover:bg-gray-50/60'}`}>
                    <td className="px-3 py-2 font-mono font-semibold">#{String(r.number || '').padStart(4, '0')}</td>
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.event_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.ship_date)}</td>
                    <td className={`px-3 py-2 text-center font-medium ${late ? 'text-red-600' : 'text-gray-600'}`}>{r.diff_days ?? '—'}</td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{r.carrier || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.city ? `${r.city}/${r.uf || ''}` : '—'}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2 text-gray-500">{r.seller || '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalhe do pedido selecionado */}
      {selected && (
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Itens + dados */}
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Pedido #{String(selected.number || '').padStart(4, '0')} — itens</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 pr-2">Cód</th><th className="py-1.5 pr-2">Produto</th>
                    <th className="py-1.5 pr-2 text-right">Qtd</th><th className="py-1.5 pr-2">Cor</th><th className="py-1.5">Impressão</th>
                  </tr></thead>
                  <tbody>
                    {(detail?.items || []).map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 font-mono text-xs text-gray-400">{it.product_code || '—'}</td>
                        <td className="py-1.5 pr-2 font-medium">{it.product_name}</td>
                        <td className="py-1.5 pr-2 text-right">{it.quantity}</td>
                        <td className="py-1.5 pr-2">{it.color || '—'}</td>
                        <td className="py-1.5 text-gray-500">{it.impressao || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Logística & datas</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Data do evento</label><input type="date" className="input" value={ef('event_date') || ''} onChange={e => setEdit(s => ({ ...s, event_date: e.target.value }))} /></div>
                <div><label className="label">Data de saída</label><input type="date" className="input" value={ef('ship_date') || ''} onChange={e => setEdit(s => ({ ...s, ship_date: e.target.value }))} /></div>
                <div><label className="label">Transportadora</label><input className="input" value={ef('carrier') || ''} onChange={e => setEdit(s => ({ ...s, carrier: e.target.value }))} /></div>
                <div><label className="label">Horário</label><input className="input" value={ef('ship_time') || ''} onChange={e => setEdit(s => ({ ...s, ship_time: e.target.value }))} placeholder="10:00" /></div>
              </div>
              <div><label className="label">Observações de produção</label><textarea rows={2} className="input resize-none" value={ef('production_obs') || ''} onChange={e => setEdit(s => ({ ...s, production_obs: e.target.value }))} /></div>
              <button onClick={() => saveFields.mutate()} disabled={saveFields.isPending || !Object.keys(edit).length} className="btn-primary disabled:opacity-50">
                <Save size={15} /> Salvar dados
              </button>
            </div>
          </div>

          {/* Arte */}
          <div className="card p-4">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ImageIcon size={13} /> Arte / Layout</p>
            {(detail?.items || []).some(it => it.art) ? (
              <div className="space-y-3">
                {(detail?.items || []).filter(it => it.art).map((it, i) => (
                  <div key={i}>
                    <img src={it.art} alt="" className="w-full rounded-xl border border-gray-200" />
                    <p className="text-xs text-gray-400 mt-1">{it.product_name} · {it.color || ''}{it.art_file ? ` · ${it.art_file}` : ''}</p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-gray-400 text-center py-10">Sem arte anexada neste pedido.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
