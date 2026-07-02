import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, Search, Check, Loader2, TrendingDown, TrendingUp,
  AlertTriangle, Save, Wand2, HelpCircle, Repeat,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const pct = v => (v == null ? '—' : `${Number(v).toFixed(1)}%`);

const STATUS = {
  prejuizo:  { label: 'Prejuízo',        cls: 'badge-red',    Icon: TrendingDown },
  abaixo:    { label: 'Margem baixa',    cls: 'badge-yellow', Icon: AlertTriangle },
  ok:        { label: 'OK',              cls: 'badge-green',  Icon: TrendingUp },
  sem_dados: { label: 'Sem custo/preço', cls: 'badge-gray',   Icon: HelpCircle },
};

// ─── Configuração de precificação ─────────────────────────
function ConfigCard({ overview, onSaved }) {
  const cfg = overview?.config || {};
  const [form, setForm] = useState(null); // null = ainda não editou
  const [saving, setSaving] = useState(false);
  const f = form || {
    margin_pct: cfg.margin_pct ?? 30,
    tax_pct: cfg.tax_pct ?? 0,
    card_fee_pct: cfg.card_fee_pct ?? 0,
    commission_pct: cfg.commission_pct ?? 0,
    freight_pct: cfg.freight_pct ?? 0,
    monthly_units: cfg.monthly_units ?? '',
  };

  const set = (k, v) => setForm({ ...f, [k]: v });

  async function save() {
    setSaving(true);
    try {
      await api.put('/pricing/config', {
        ...f,
        monthly_units: f.monthly_units === '' ? null : parseInt(f.monthly_units),
      });
      toast.success('Configuração salva! Preços recalculados.');
      setForm(null);
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  const fields = [
    ['margin_pct', 'Margem desejada (%)', 'Lucro que você quer em cada venda'],
    ['tax_pct', 'Impostos (%)', 'Simples Nacional / tributos sobre a venda'],
    ['card_fee_pct', 'Taxa cartão/gateway (%)', 'Taxa média das máquinas e PIX'],
    ['commission_pct', 'Comissão (%)', 'Comissão de vendedor, se houver'],
    ['freight_pct', 'Frete embutido (%)', 'Se você absorve parte do frete'],
  ];

  return (
    <div className="card p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2"><Calculator size={17} className="text-primary-600" /> Parâmetros de precificação</h2>
        {form && (
          <button className="btn-primary btn-sm" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar e recalcular
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {fields.map(([k, label, hint]) => (
          <div key={k}>
            <label className="label" title={hint}>{label}</label>
            <input type="number" step="0.1" min="0" max="95" className="input"
              value={f[k]} onChange={e => set(k, e.target.value)} />
          </div>
        ))}
        <div>
          <label className="label" title="Usado para dividir as despesas fixas por unidade. Vazio = média automática dos últimos 90 dias.">
            Unidades vendidas/mês
          </label>
          <input type="number" min="0" className="input"
            placeholder={`Auto: ${overview?.auto_monthly_units ?? 0}`}
            value={f.monthly_units} onChange={e => set('monthly_units', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500 flex items-center gap-1"><Repeat size={12} /> Despesas fixas/mês</p>
          <p className="font-bold text-gray-900">{fmt(overview?.fixed_monthly_total)}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Volume usado no rateio</p>
          <p className="font-bold text-gray-900">{(overview?.monthly_units || 0).toLocaleString('pt-BR')} un/mês</p>
        </div>
        <div className="rounded-xl bg-indigo-50 p-3">
          <p className="text-xs text-indigo-600">Custo fixo embutido por unidade</p>
          <p className="font-bold text-indigo-800">{fmt(overview?.overhead_unit)}</p>
        </div>
      </div>
      <p className="text-xs text-gray-400">
        Preço sugerido = (custo do produto + custo fixo por unidade) ÷ (1 − impostos − taxas − comissão − frete − margem).
        Cadastre as despesas fixas na <b>Central de Contas → Despesas Fixas</b> para o rateio ficar realista.
      </p>
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────
export default function Pricing() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [applying, setApplying] = useState(null); // id em processamento
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [bulkLoading, setBulkLoading] = useState(false);

  const { data: overview, isLoading, refetch } = useQuery({
    queryKey: ['pricing-overview'],
    queryFn: () => api.get('/pricing/overview'),
  });

  const rows = useMemo(() => {
    let list = overview?.products || [];
    if (statusFilter) list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      list = list.filter(p => (p.name || '').toLowerCase().includes(s) || (p.code || '').toLowerCase().includes(s));
    }
    return list;
  }, [overview, statusFilter, search]);

  async function applyPrice(p, price) {
    if (!(price > 0)) { toast.error('Sem preço sugerido para este produto'); return; }
    setApplying(p.id);
    try {
      await api.put(`/pricing/products/${p.id}`, { sale_price: price });
      toast.success(`${p.name}: preço atualizado para ${fmt(price)}`);
      refetch();
      qc.invalidateQueries({ queryKey: ['products'] });
    } catch (err) { toast.error(err.error || 'Erro ao aplicar preço'); }
    finally { setApplying(null); }
  }

  const bulkTargets = rows.filter(p => p.preco_sugerido > 0 && ['prejuizo', 'abaixo'].includes(p.status));

  async function applyBulk() {
    setBulkLoading(true);
    let ok = 0, fail = 0;
    for (const p of bulkTargets) {
      try { await api.put(`/pricing/products/${p.id}`, { sale_price: p.preco_sugerido }); ok++; }
      catch { fail++; }
    }
    setBulkLoading(false);
    setConfirmBulk(false);
    toast[fail ? 'error' : 'success'](`${ok} preço(s) aplicado(s)${fail ? `, ${fail} falharam` : ''}`);
    refetch();
    qc.invalidateQueries({ queryKey: ['products'] });
  }

  const sum = overview?.summary;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Calculator className="text-primary-600" size={24} /> Precificação
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Custo real (custo + rateio das despesas fixas) e preço sugerido para bater a margem desejada
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <>
          <ConfigCard overview={overview} onSaved={refetch} />

          {/* Resumo clicável (filtra a tabela) */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(STATUS).map(([key, st]) => (
              <button key={key} onClick={() => setStatusFilter(f => (f === key ? '' : key))}
                className={`card p-4 text-left transition-all ${statusFilter === key ? 'ring-2 ring-primary-500' : 'hover:shadow-md'}`}>
                <p className="text-xs text-gray-500 uppercase tracking-wide flex items-center gap-1"><st.Icon size={13} /> {st.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{sum?.[key] ?? 0}</p>
                <p className="text-xs text-gray-400">produto(s)</p>
              </button>
            ))}
          </div>

          {/* Busca + ação em massa */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9 w-72" placeholder="Buscar produto ou código..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {bulkTargets.length > 0 && (
              <button className="btn-secondary btn-sm" onClick={() => setConfirmBulk(true)}>
                <Wand2 size={14} /> Aplicar sugerido nos {bulkTargets.length} fora da margem
              </button>
            )}
          </div>

          {/* Tabela */}
          <div className="card overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  <th>Produto</th>
                  <th className="text-right">Custo</th>
                  <th className="text-right" title="Rateio das despesas fixas por unidade">+ Fixo/un</th>
                  <th className="text-right">Custo real</th>
                  <th className="text-right">Preço atual</th>
                  <th className="text-right">Margem atual</th>
                  <th className="text-right">Preço sugerido</th>
                  <th className="text-center">Situação</th>
                  <th className="text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(p => {
                  const st = STATUS[p.status] || STATUS.sem_dados;
                  return (
                    <tr key={p.id} className={p.status === 'prejuizo' ? 'bg-red-50/50' : ''}>
                      <td>
                        <p className="text-sm font-medium text-gray-900">{p.name}</p>
                        <p className="text-xs text-gray-400">{p.code}{p.category ? ` · ${p.category}` : ''}{p.has_tiers ? ' · tem faixas' : ''}</p>
                      </td>
                      <td className="text-right text-sm whitespace-nowrap">{fmt(p.custo_direto)}</td>
                      <td className="text-right text-sm text-indigo-600 whitespace-nowrap">{fmt(p.custo_fixo_unit)}</td>
                      <td className="text-right text-sm font-semibold whitespace-nowrap">{fmt(p.custo_total)}</td>
                      <td className="text-right font-semibold whitespace-nowrap">{fmt(p.sale_price)}</td>
                      <td className={`text-right text-sm font-semibold whitespace-nowrap ${
                        p.margem_atual == null ? 'text-gray-400' : p.margem_atual < 0 ? 'text-red-600' : p.status === 'abaixo' ? 'text-amber-600' : 'text-green-600'}`}>
                        {pct(p.margem_atual)}
                      </td>
                      <td className="text-right font-bold text-primary-700 whitespace-nowrap">{p.preco_sugerido ? fmt(p.preco_sugerido) : '—'}</td>
                      <td className="text-center"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                      <td className="text-right">
                        {p.preco_sugerido > 0 && p.status !== 'ok' && (
                          <button className="btn-primary btn-sm py-1 px-2 text-xs" disabled={applying === p.id}
                            onClick={() => applyPrice(p, p.preco_sugerido)}>
                            {applying === p.id ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Aplicar
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12 text-gray-400 text-sm">Nenhum produto neste filtro.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Confirmação da aplicação em massa */}
      <Modal isOpen={confirmBulk} onClose={() => setConfirmBulk(false)} title="Aplicar preços sugeridos" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            O preço de venda de <b>{bulkTargets.length}</b> produto(s) em prejuízo ou abaixo da margem será
            substituído pelo preço sugerido. As faixas de preço (atacado) não são alteradas.
          </p>
          <div className="max-h-48 overflow-y-auto rounded-lg border border-gray-100 divide-y text-sm">
            {bulkTargets.slice(0, 30).map(p => (
              <div key={p.id} className="flex justify-between px-3 py-1.5">
                <span className="truncate mr-2">{p.name}</span>
                <span className="whitespace-nowrap text-gray-500">{fmt(p.sale_price)} → <b className="text-primary-700">{fmt(p.preco_sugerido)}</b></span>
              </div>
            ))}
            {bulkTargets.length > 30 && <div className="px-3 py-1.5 text-gray-400">… e mais {bulkTargets.length - 30}</div>}
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t">
            <button className="btn-secondary" onClick={() => setConfirmBulk(false)}>Cancelar</button>
            <button className="btn-primary" disabled={bulkLoading} onClick={applyBulk}>
              {bulkLoading ? <Loader2 size={15} className="animate-spin" /> : <Wand2 size={15} />} Aplicar em todos
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
