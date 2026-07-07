import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Star, Shield, Search, RefreshCw, Loader2, Trophy, Wallet, CalendarDays, Sparkles } from 'lucide-react';
import { id4 } from '@/lib/ids';
import toast from 'react-hot-toast';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function Stars({ n, size = 15 }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} size={size} className={i <= (n || 0) ? 'text-amber-400 fill-amber-400' : 'text-gray-200'} />
      ))}
    </span>
  );
}

export default function LyonPrime() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['prime-ranking'],
    queryFn: () => api.get('/customers/prime/ranking'),
  });
  const clientes = data?.data || [];
  const tiers = data?.tiers || [];

  const recompute = useMutation({
    mutationFn: () => api.post('/customers/recompute-ratings'),
    onSuccess: (r) => {
      qc.invalidateQueries(['prime-ranking']);
      toast.success(`Estrelas recalculadas (${r.customers || 0} cliente(s))!`);
    },
    onError: e => toast.error(e.error || 'Erro ao recalcular'),
  });

  const s = search.trim().toLowerCase();
  const filtered = s
    ? clientes.filter(c => `${c.name} ${c.nome_fantasia || ''}`.toLowerCase().includes(s))
    : clientes;

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Sparkles size={22} className="text-amber-500" /> Programa Lyon Prime
          </h1>
          <p className="text-sm text-gray-500">Estrelas pelo faturamento de 12 meses · benefícios por nível · Selo de Confiança</p>
        </div>
        <button onClick={() => recompute.mutate()} disabled={recompute.isPending} className="btn-secondary disabled:opacity-50">
          {recompute.isPending ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalcular estrelas
        </button>
      </div>

      {/* Regras do programa */}
      <div className="card overflow-hidden">
        <div className="bg-[#0A1A3C] text-white px-5 py-3">
          <p className="font-bold tracking-wide text-sm">REGRAS DO PROGRAMA</p>
        </div>
        <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {tiers.map(t => (
            <div key={t.stars} className="border border-gray-100 rounded-xl p-3">
              <Stars n={t.stars} />
              <p className="text-xs text-gray-500 mt-1.5">a partir de</p>
              <p className="font-black text-gray-900">{fmt(t.min)}</p>
              <div className="mt-2 space-y-1 text-[11px] text-gray-600">
                <p className="flex items-center gap-1"><Wallet size={11} className="text-emerald-500" /> Limite {fmt(t.credit)}</p>
                <p className="flex items-center gap-1"><CalendarDays size={11} className="text-indigo-400" /> Boleto {t.boleto} dias</p>
                {t.perks.map((p, i) => <p key={i}>• {p}</p>)}
              </div>
            </div>
          ))}
          {tiers.length === 0 && <p className="text-sm text-gray-400 col-span-full text-center py-4">Carregando regras...</p>}
        </div>
        <p className="px-5 pb-4 text-xs text-gray-400">
          🛡️ <b>Selo de Confiança:</b> 3 ou mais títulos pagos, nenhuma conta vencida em aberto e cadastro sem bloqueio.
        </p>
      </div>

      {/* Ranking */}
      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-3">
          <p className="font-semibold text-gray-800 flex items-center gap-2">
            <Trophy size={17} className="text-amber-500" /> Ranking de clientes
          </p>
          <div className="relative ml-auto w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-8 text-sm" placeholder="Buscar cliente..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                <th>#</th><th>Cliente</th><th>Nível</th><th>Selo</th>
                <th className="text-right">Faturamento (12m)</th>
                <th className="text-right">Limite de crédito</th>
                <th>Vendedor</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>}
              {!isLoading && filtered.map((c, i) => (
                <tr key={c.id} className="cursor-pointer hover:bg-gray-50" onClick={() => navigate(`/customers/${c.id}`)}>
                  <td className="font-mono text-xs text-gray-400">{i + 1}º</td>
                  <td>
                    <p className="font-medium text-gray-800">{c.name}</p>
                    <p className="text-[11px] text-gray-400">{id4(c.display_id)}{c.nome_fantasia ? ` · ${c.nome_fantasia}` : ''}</p>
                  </td>
                  <td><Stars n={c.rating} /></td>
                  <td>
                    {c.selo_confianca
                      ? <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600"><Shield size={13} className="fill-amber-200" /> Selo</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="text-right font-semibold text-emerald-600">{fmt(c.total_12m)}</td>
                  <td className="text-right text-gray-700">{fmt(c.credit_limit)}</td>
                  <td className="text-sm text-gray-500">{c.vendedor || '—'}</td>
                </tr>
              ))}
              {!isLoading && filtered.length === 0 && (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum cliente encontrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
