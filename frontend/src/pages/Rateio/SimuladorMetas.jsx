import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Target, Save, TrendingUp, Wallet, Factory, PieChart,
  Coins, Trophy, Info, Filter, X, RefreshCw, Clock, CalendarDays,
  ArrowUpRight, ListTree,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const num = x => parseFloat(String(x).replace(/\./g, '').replace(',', '.')) || 0;
const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const dtBR = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const SOURCE_LABEL = { manual: 'Manual', site: 'Site / Loja' };

export default function SimuladorMetas() {
  const [goal, setGoal] = useState(null);    // null = usa o salvo
  const [margin, setMargin] = useState(null); // null = usa o automático/salvo
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState(false);
  // Filtros da simulação
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [seller, setSeller] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [state, setState] = useState('');
  const [source, setSource] = useState('');
  const [line, setLine] = useState('');

  const qs = new URLSearchParams({ month });
  if (seller) qs.set('seller', seller);
  if (customerId) qs.set('customer_id', customerId);
  if (productId) qs.set('product_id', productId);
  if (state) qs.set('state', state);
  if (source) qs.set('source', source);
  if (line) qs.set('line', line);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rateio-goals', month, seller, customerId, productId, state, source, line],
    queryFn: () => api.get(`/rateio/goals?${qs.toString()}`),
  });
  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];

  const goalValue = goal !== null ? num(goal) : (data?.profit_goal ?? 0);
  const marginValue = margin !== null ? num(margin) : (data?.avg_margin_unit ?? 0);
  const nec = data?.necessario || {};
  const rit = data?.ritmo || {};
  const f = data?.filtros || {};

  // Necessário vender (usa o cálculo do servidor; cai no local se a meta mudou na tela)
  const neededMonthly = marginValue > 0 ? Math.ceil((data?.fixed_total + goalValue) / marginValue) : (nec.unidades || 0);
  const neededWeekly = Math.ceil(neededMonthly / 4.345);
  const neededDaily = Math.ceil(neededMonthly / 30);
  const progress = goalValue > 0 ? Math.min(100, Math.max(0, (data?.month_profit / goalValue) * 100)) : 0;

  const temFiltro = seller || customerId || productId || state || source || line;
  const limpar = () => { setSeller(''); setCustomerId(''); setProductId(''); setState(''); setSource(''); setLine(''); };

  async function save() {
    setSaving(true);
    try {
      await api.put('/rateio/goals', {
        profit_goal: goal !== null ? num(goal) : data?.profit_goal,
        avg_margin_unit: margin !== null ? (margin === '' ? null : num(margin)) : undefined,
      });
      toast.success('Meta salva!');
      setGoal(null); setMargin(null);
      refetch();
    } catch (err) { toast.error(err.error || 'Erro ao salvar a meta'); }
    finally { setSaving(false); }
  }

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  // DASHBOARD DO RATEIO (topo — tempo real)
  const kpis = [
    ['Despesas Fixas do Mês', fmtBRL(data?.fixed_total), Wallet, 'text-gray-900'],
    ['Produção do Mês', `${fmtQty(data?.monthly_units)} un`, Factory, 'text-gray-900'],
    ['Rateio Unitário', fmtBRL4(data?.overhead_unit), PieChart, 'text-indigo-700'],
    ['Lucro Médio por Produto', fmtBRL(data?.avg_margin_unit), Coins, 'text-gray-900'],
    ['Meta de Lucro', data?.profit_goal != null ? fmtBRL(data.profit_goal) : '—', Target, 'text-gray-900'],
    ['Lucro Atual', fmtBRL(data?.month_profit), TrendingUp, (data?.month_profit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'],
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Simulador de Metas</h1>
          <p className="text-sm text-gray-500 mt-1">Informe quanto quer ganhar por mês e veja quanto precisa vender</p>
        </div>
        <div className="flex items-center gap-2">
          {data?.atualizacao?.calculado_em && (
            <span className="text-xs text-gray-400 hidden sm:flex items-center gap-1">
              <Clock size={12} /> {dtBR(data.atualizacao.calculado_em)}
            </span>
          )}
          <button className="btn-secondary" onClick={() => setDetail(true)}>
            <ListTree size={15} /> Detalhar
          </button>
          <button className="btn-primary" onClick={() => refetch()} disabled={isFetching}>
            {isFetching ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalcular simulação
          </button>
        </div>
      </div>

      {/* Filtros da simulação — opções vindas dos módulos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 flex items-center gap-1"><Filter size={13} /> Simular por</span>
        <input type="month" className="input py-1.5 text-sm w-auto" value={month} onChange={e => setMonth(e.target.value)} />
        <select className="input py-1.5 text-sm w-auto" value={seller} onChange={e => setSeller(e.target.value)}>
          <option value="">Todos os vendedores</option>
          {(f.sellers || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto max-w-[170px]" value={customerId} onChange={e => setCustomerId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {(f.customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto max-w-[170px]" value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Todos os produtos</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto" value={line} onChange={e => setLine(e.target.value)}>
          <option value="">Todas as linhas</option>
          {(f.lines || []).map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto" value={state} onChange={e => setState(e.target.value)}>
          <option value="">Todas as regiões</option>
          {(f.states || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">Todos os canais</option>
          {(f.sources || []).map(s => <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>)}
        </select>
        {temFiltro && <button className="btn-ghost btn-sm text-gray-500" onClick={limpar}><X size={13} /> Limpar</button>}
      </div>

      {/* DASHBOARD DO RATEIO */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpis.map(([label, value, Icon, cls]) => (
          <div key={label} className="card p-3">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
              <Icon size={11} /> {label}
            </p>
            <p className={`text-base font-bold mt-0.5 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* Entradas */}
        <div className="card p-4 space-y-4">
          <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
            <Target size={15} className="text-primary-600" /> Sua meta
          </h2>
          <div>
            <label className="label">Meta de Lucro Mensal (R$)</label>
            <input className="input text-lg font-semibold" inputMode="decimal"
              value={goal !== null ? goal : (data?.profit_goal != null ? String(data.profit_goal).replace('.', ',') : '')}
              placeholder="20.000,00"
              onChange={e => setGoal(e.target.value)} />
          </div>
          <div>
            <label className="label">Margem média por unidade (R$)</label>
            <input className="input" inputMode="decimal"
              value={margin !== null ? margin : (data?.avg_margin_unit != null ? String(data.avg_margin_unit).replace('.', ',') : '')}
              placeholder="1,50"
              onChange={e => setMargin(e.target.value)} />
            <p className="text-[11px] text-gray-400 mt-1">
              {data?.avg_margin_source === 'auto'
                ? <>Automática: média das {data?.sheet_count || 0} ficha(s) de <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> (preço − custo),
                    o mesmo custo usado no <Link to="/rateio/produto" className="text-primary-600 hover:underline">Rateio por Produto</Link>. Digite para fixar outro valor.</>
                : <>Valor fixado manualmente. Apague e salve para voltar à média automática das fichas.</>}
            </p>
          </div>
          <button className="btn-primary w-full" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar meta
          </button>
        </div>

        {/* Resultado */}
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center gap-2">
              <Trophy size={15} /> <span className="font-semibold text-sm">NECESSÁRIO VENDER</span>
            </div>
            <div className="p-5 text-center">
              {marginValue > 0 && goalValue > 0 ? (
                <>
                  <p className="text-4xl font-extrabold text-primary-700">{fmtQty(neededMonthly)}</p>
                  <p className="text-sm text-gray-500 mt-1">unidades por mês</p>

                  {/* Faturamento, pedidos e lucro esperado — automáticos */}
                  <div className="grid grid-cols-3 gap-2 mt-4">
                    {[
                      ['Faturamento', fmtBRL(nec.faturamento)],
                      ['Pedidos', `${fmtQty(nec.pedidos)}`],
                      ['Lucro esperado', fmtBRL(nec.lucro_esperado ?? goalValue)],
                    ].map(([label, v]) => (
                      <div key={label} className="rounded-xl bg-primary-50 p-2.5">
                        <p className="text-[11px] text-primary-600 uppercase">{label}</p>
                        <p className="font-bold text-primary-800 text-sm">{v}</p>
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[
                      ['Meta diária', neededDaily],
                      ['Meta semanal', neededWeekly],
                      ['Meta mensal', neededMonthly],
                    ].map(([label, v]) => (
                      <div key={label} className="rounded-xl bg-gray-50 p-2.5">
                        <p className="text-[11px] text-gray-500 uppercase">{label}</p>
                        <p className="font-bold text-gray-900">{fmtQty(v)} un</p>
                      </div>
                    ))}
                  </div>

                  <p className="text-[11px] text-gray-400 mt-3">
                    Faturamento = (despesas fixas + meta) ÷ margem de contribuição de {pctBR(nec.margem_contribuicao_pct)} ·
                    pedidos pelo ticket médio de {fmtBRL(nec.ticket_medio)}
                  </p>
                </>
              ) : (
                <p className="text-sm text-gray-400 py-4">
                  Informe a meta de lucro e a margem média por unidade para calcular.
                </p>
              )}
            </div>
          </div>

          {/* Progresso do mês */}
          <div className="card p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-gray-900">Progresso do mês</span>
              <span className="text-gray-500">
                {fmtBRL(data?.month_profit)} de {goalValue > 0 ? fmtBRL(goalValue) : '—'}
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-gray-100">
              <div className={`h-2.5 rounded-full transition-all ${progress >= 100 ? 'bg-green-500' : 'bg-primary-500'}`}
                style={{ width: `${progress}%` }} />
            </div>
            <p className="text-xs text-gray-400">
              {goalValue > 0
                ? `${progress.toFixed(1).replace('.', ',')}% da meta · ${fmtQty(data?.month_units)} unidade(s) vendida(s) em ${data?.month_orders} pedido(s) · faturamento ${fmtBRL(data?.month_revenue)}`
                : 'Defina uma meta para acompanhar o progresso.'}
            </p>
          </div>

          <p className="text-xs text-gray-400 flex items-start gap-1.5">
            <Info size={13} className="mt-0.5 shrink-0" />
            <span>O lucro atual vem do Rateio por Pedido (receita − custos − impostos das vendas do mês), atualizado em tempo real.</span>
          </p>
        </div>
      </div>

      {/* Ritmo até o fim do mês */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><CalendarDays size={13} /> Dias restantes</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{rit.dias_restantes ?? '—'}</p>
          <p className="text-[11px] text-gray-400">dia {rit.dia_atual} de {rit.dias_no_mes}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Wallet size={13} /> Falta faturar</p>
          <p className={`text-xl font-extrabold mt-1 ${(rit.falta_faturar ?? 0) > 0 ? 'text-amber-600' : 'text-green-600'}`}>
            {fmtBRL(rit.falta_faturar)}
          </p>
          <p className="text-[11px] text-gray-400">
            {(rit.falta_faturar ?? 0) > 0 ? `de ${fmtBRL(nec.faturamento)} necessários` : 'meta de faturamento atingida'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Target size={13} /> Meta diária</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{fmtBRL(rit.meta_diaria)}</p>
          <p className="text-[11px] text-gray-400">
            {rit.dias_restantes > 0 ? `por dia nos ${rit.dias_restantes} dias restantes` : 'mês encerrado'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><TrendingUp size={13} /> Projeção de fechamento</p>
          <p className={`text-xl font-extrabold mt-1 ${rit.projecao_bate_meta ? 'text-green-600' : 'text-gray-900'}`}>
            {fmtBRL(rit.projecao_faturamento)}
          </p>
          <p className="text-[11px] text-gray-400">
            lucro projetado {fmtBRL(rit.projecao_lucro)}
            {rit.projecao_bate_meta != null && (rit.projecao_bate_meta
              ? <span className="text-green-600"> · bate a meta</span>
              : <span className="text-amber-600"> · abaixo da meta</span>)}
          </p>
        </div>
      </div>

      {/* Detalhar — origem de cada dado */}
      <Modal isOpen={detail} onClose={() => setDetail(false)} title="Detalhamento da simulação" size="lg">
        <div className="space-y-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="font-semibold text-gray-900">Período {month}{temFiltro && ' · com filtros'}</p>
            <p className="text-xs text-gray-500">
              {data?.month_orders || 0} pedido(s) · {fmtQty(data?.month_units)} un · faturamento {fmtBRL(data?.month_revenue)}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
            <div className="flex justify-between"><span className="text-gray-500">Despesas fixas do mês</span><span className="font-medium">{fmtBRL(data?.fixed_total)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(+) Meta de lucro</span><span className="font-medium">{fmtBRL(goalValue)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(÷) Margem de contribuição</span><span className="font-medium">{pctBR(nec.margem_contribuicao_pct)}</span></div>
            <div className="flex justify-between pt-1.5 border-t border-gray-100">
              <span className="font-semibold text-gray-700">= Faturamento necessário</span>
              <span className="font-bold text-primary-700">{fmtBRL(nec.faturamento)}</span>
            </div>
            <div className="flex justify-between text-gray-500"><span>Unidades necessárias</span><span>{fmtQty(nec.unidades)} un</span></div>
            <div className="flex justify-between text-gray-500"><span>Pedidos necessários (ticket {fmtBRL(nec.ticket_medio)})</span><span>{fmtQty(nec.pedidos)}</span></div>
            <div className="flex justify-between pt-1.5 border-t border-gray-100">
              <span className="text-gray-600">% da meta atingida</span>
              <span className={`font-semibold ${(nec.pct_meta_atingida ?? 0) >= 100 ? 'text-green-600' : 'text-amber-600'}`}>
                {nec.pct_meta_atingida == null ? '—' : pctBR(nec.pct_meta_atingida)}
              </span>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Origem de cada dado</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {(data?.origens || []).map(o => (
                <div key={o.label} className="flex items-start justify-between gap-3 px-3 py-2.5 border-b border-gray-100 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-gray-800">{o.label}</p>
                    <p className="text-xs text-gray-400">{o.detail}</p>
                  </div>
                  <Link to={o.link} className="text-xs text-primary-600 hover:underline whitespace-nowrap shrink-0 inline-flex items-center gap-0.5">
                    {o.origin} <ArrowUpRight size={10} />
                  </Link>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Só a meta de lucro é definida por você — todo o resto é apurado nos módulos.
              {data?.atualizacao?.fichas && <> Fichas atualizadas em {dtBR(data.atualizacao.fichas)}.</>}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button className="btn-secondary" onClick={() => setDetail(false)}><X size={14} /> Fechar</button>
            <button className="btn-primary" onClick={() => { setDetail(false); refetch(); }}>
              <RefreshCw size={14} /> Recalcular simulação
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
