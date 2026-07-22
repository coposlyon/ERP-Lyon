import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, TrendingUp, TrendingDown, DollarSign, Wallet,
  Factory, AlertTriangle, ArrowUpRight, Filter, X, ListTree,
  RefreshCw, Target, Users, MapPin, Layers, Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtQty } from '@/lib/pricingCalc';

const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const dtBR = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const SOURCE_LABEL = { manual: 'Manual', site: 'Site / Loja' };

// Tabela de lucro por dimensão (vendedor, cliente, região, linha)
function GrupoCard({ icon: Icon, title, rows, col1 = 'Nome', showTicket }) {
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h2 className="font-semibold text-gray-900 text-sm flex items-center gap-1.5">
          <Icon size={15} className="text-primary-500" /> {title}
        </h2>
      </div>
      <div className="overflow-x-auto max-h-72">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
              <th className="px-3 py-2">{col1}</th>
              <th className="px-3 py-2 text-right">Receita</th>
              {showTicket && <th className="px-3 py-2 text-right">Ticket</th>}
              <th className="px-3 py-2 text-right">Lucro</th>
              <th className="px-3 py-2 text-right">Margem</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => (
              <tr key={i} className="border-b border-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900 truncate max-w-[160px]" title={g.name}>{g.name}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap">{fmtBRL(g.receita)}</td>
                {showTicket && <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{g.ticket_medio ? fmtBRL(g.ticket_medio) : '—'}</td>}
                <td className={`px-3 py-2 text-right font-semibold whitespace-nowrap ${g.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(g.lucro)}</td>
                <td className={`px-3 py-2 text-right ${g.margem_pct >= 0 ? 'text-gray-600' : 'text-red-500'}`}>{pctBR(g.margem_pct)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={showTicket ? 5 : 4} className="text-center py-8 text-sm text-gray-400">Sem dados no período.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, iconBg, iconColor, label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        <Icon size={20} style={{ color: iconColor }} />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 truncate">{label}</p>
        <p className={`text-xl font-extrabold ${valueClass} leading-tight`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
    </div>
  );
}

export default function Rentabilidade() {
  const qc = useQueryClient();
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [seller, setSeller] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [state, setState] = useState('');
  const [source, setSource] = useState('');
  const [detail, setDetail] = useState(false);
  const [recalc, setRecalc] = useState(false);

  const qs = new URLSearchParams({ month });
  if (seller) qs.set('seller', seller);
  if (customerId) qs.set('customer_id', customerId);
  if (productId) qs.set('product_id', productId);
  if (state) qs.set('state', state);
  if (source) qs.set('source', source);

  const { data, isLoading } = useQuery({
    queryKey: ['rateio-rentabilidade', month, seller, customerId, productId, state, source],
    queryFn: () => api.get(`/rateio/rentabilidade?${qs.toString()}`),
  });
  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];

  async function recalcular() {
    setRecalc(true);
    try {
      const r = await api.post('/rateio/rentabilidade/recalcular');
      toast.success(`${r.fichas_atualizadas} ficha(s) recalculada(s) com o rateio atual`);
      qc.invalidateQueries({ queryKey: ['rateio-rentabilidade'] });
    } catch (err) {
      toast.error(err.error || 'Erro ao recalcular');
    } finally { setRecalc(false); }
  }

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  const d = data || {};
  const vb = d.variavel_breakdown || {};
  const ind = d.indicadores || {};
  const f = d.filtros || {};
  const lucroPos = (d.lucro_projetado || 0) >= 0;
  const abaixoMeta = (d.produtos || []).filter(p => p.abaixo_meta);
  const temFiltro = seller || customerId || productId || state || source;
  const limpar = () => { setSeller(''); setCustomerId(''); setProductId(''); setState(''); setSource(''); };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel de Rentabilidade</h1>
          <p className="text-sm text-gray-500 mt-1">Faturamento, custos fixos e variáveis, margem por produto e lucro projetado.</p>
        </div>
        <div className="flex items-center gap-2">
          {d.atualizacao?.calculado_em && (
            <span className="text-xs text-gray-400 hidden sm:flex items-center gap-1">
              <Clock size={12} /> {dtBR(d.atualizacao.calculado_em)}
            </span>
          )}
          <button className="btn-secondary" onClick={() => setDetail(true)}>
            <ListTree size={15} /> Detalhar resultado
          </button>
          <button className="btn-primary" onClick={recalcular} disabled={recalc}>
            {recalc ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalcular rentabilidade
          </button>
        </div>
      </div>

      {/* Filtros — opções vindas dos módulos */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400 flex items-center gap-1"><Filter size={13} /> Filtros</span>
        <input type="month" className="input py-1.5 text-sm w-auto" value={month} onChange={e => setMonth(e.target.value)} />
        <select className="input py-1.5 text-sm w-auto" value={seller} onChange={e => setSeller(e.target.value)}>
          <option value="">Todos os vendedores</option>
          {(f.sellers || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto max-w-[180px]" value={customerId} onChange={e => setCustomerId(e.target.value)}>
          <option value="">Todos os clientes</option>
          {(f.customers || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto max-w-[180px]" value={productId} onChange={e => setProductId(e.target.value)}>
          <option value="">Todos os produtos</option>
          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto" value={state} onChange={e => setState(e.target.value)}>
          <option value="">Todos os estados</option>
          {(f.states || []).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="input py-1.5 text-sm w-auto" value={source} onChange={e => setSource(e.target.value)}>
          <option value="">Todos os canais</option>
          {(f.sources || []).map(s => <option key={s} value={s}>{SOURCE_LABEL[s] || s}</option>)}
        </select>
        {temFiltro && <button className="btn-ghost btn-sm text-gray-500" onClick={limpar}><X size={13} /> Limpar</button>}
      </div>

      {/* KPIs principais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={DollarSign} iconBg="#eff6ff" iconColor="#2563eb"
          label="Faturamento (mês)" value={fmtBRL(d.faturamento)} sub={`${d.quantidade || 0} un vendidas`} />
        <Kpi icon={Wallet} iconBg="#fef2f2" iconColor="#dc2626"
          label="Custo Fixo" value={fmtBRL(d.custo_fixo)} sub="despesas + salário fixo" />
        <Kpi icon={Factory} iconBg="#fff7ed" iconColor="#ea580c"
          label="Custo Variável" value={fmtBRL(d.custo_variavel)} sub="produto + impostos + comissão + prod." />
        <Kpi icon={lucroPos ? TrendingUp : TrendingDown} iconBg={lucroPos ? '#f0fdf4' : '#fef2f2'} iconColor={lucroPos ? '#16a34a' : '#dc2626'}
          label="Lucro Projetado" value={fmtBRL(d.lucro_projetado)} sub={`margem ${pctBR(d.margem_pct)}`}
          valueClass={lucroPos ? 'text-green-600' : 'text-red-600'} />
      </div>

      {/* Indicadores gerenciais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Target size={13} /> Ponto de Equilíbrio</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{fmtBRL(ind.ponto_equilibrio)}</p>
          <p className={`text-[11px] ${ind.atingiu_equilibrio ? 'text-green-600' : 'text-amber-600'}`}>
            {ind.ponto_equilibrio > 0
              ? (ind.atingiu_equilibrio ? '✓ atingido no período' : `faltam ${fmtBRL(Math.max(0, ind.ponto_equilibrio - (d.faturamento || 0)))}`)
              : 'sem margem de contribuição'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><TrendingUp size={13} /> Margem de Contribuição</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{fmtBRL(ind.margem_contribuicao)}</p>
          <p className="text-[11px] text-gray-400">{pctBR(ind.margem_contribuicao_pct)} da receita</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><DollarSign size={13} /> Ticket Médio</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{fmtBRL(ind.ticket_medio)}</p>
          <p className="text-[11px] text-gray-400">{d.pedidos || 0} pedido(s) no período</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-gray-500 flex items-center gap-1.5"><Factory size={13} /> Equilíbrio em unidades</p>
          <p className="text-xl font-extrabold text-gray-900 mt-1">{fmtQty(ind.ponto_equilibrio_un)} un</p>
          <p className="text-[11px] text-gray-400">preço médio {fmtBRL(ind.preco_medio_un)}</p>
        </div>
      </div>

      {/* Lucro por dimensão */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        <GrupoCard icon={Users} title="Lucro por Vendedor" rows={d.por_vendedor || []} col1="Vendedor" showTicket />
        <GrupoCard icon={Users} title="Lucro por Cliente (top 20)" rows={d.por_cliente || []} col1="Cliente" showTicket />
        <GrupoCard icon={MapPin} title="Lucro por Região" rows={d.por_regiao || []} col1="UF" showTicket />
        <GrupoCard icon={Layers} title="Lucro por Linha de Produto" rows={d.por_linha || []} col1="Categoria" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Composição do custo variável + resultado */}
        <div className="space-y-4">
          <div className="card p-4 space-y-2.5">
            <h2 className="font-semibold text-gray-900 text-sm">Composição do Custo Variável</h2>
            {[
              ['Custo dos produtos', vb.produtos],
              ['Impostos sobre vendas', vb.impostos],
              ['Comissões de vendas', vb.comissoes],
              ['Mão de obra (produção)', vb.mao_obra_producao],
              ['Marketing variável', vb.marketing],
              ['Extras (perdas, frete)', vb.extras],
            ].map(([l, val]) => (
              <div key={l} className="flex justify-between text-sm">
                <span className="text-gray-500">{l}</span>
                <span className="font-medium">{fmtBRL(val)}</span>
              </div>
            ))}
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Total variável</span>
              <span className="font-bold text-orange-600">{fmtBRL(d.custo_variavel)}</span>
            </div>
          </div>

          <div className="card p-4 space-y-2.5">
            <h2 className="font-semibold text-gray-900 text-sm">Resultado do Mês</h2>
            <div className="flex justify-between text-sm"><span className="text-gray-500">Faturamento</span><span className="font-medium">{fmtBRL(d.faturamento)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">(−) Custo variável</span><span className="text-red-500">{fmtBRL(d.custo_variavel)}</span></div>
            <div className="flex justify-between text-sm"><span className="text-gray-500">(−) Custo fixo</span><span className="text-red-500">{fmtBRL(d.custo_fixo)}</span></div>
            <div className="flex justify-between text-sm pt-2 border-t border-gray-100">
              <span className="text-gray-600 font-medium">Lucro projetado</span>
              <span className={`font-bold ${lucroPos ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(d.lucro_projetado)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Margem</span>
              <span className={`font-semibold ${lucroPos ? 'text-green-600' : 'text-red-600'}`}>{pctBR(d.margem_pct)}</span>
            </div>
          </div>
        </div>

        {/* Margem por produto */}
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide">Margem por Produto</h2>
            <span className="text-xs text-gray-400">Meta de margem: {pctBR(d.margin_goal_pct)}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-3 py-2 text-right">Receita</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2 text-right">Margem</th>
                  <th className="px-3 py-2 text-right">Sugestão</th>
                </tr>
              </thead>
              <tbody>
                {(d.produtos || []).map((p, i) => (
                  <tr key={i} className={`border-b border-gray-50 ${p.abaixo_meta ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2 font-medium text-gray-900">{p.name}<span className="text-xs text-gray-400 ml-1">×{p.qty}</span></td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">{fmtBRL(p.receita)}</td>
                    <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">{fmtBRL(p.custo)}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${p.abaixo_meta ? 'text-red-500' : 'text-green-600'}`}>{pctBR(p.margem_pct)}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {p.abaixo_meta && p.preco_sugerido_unit ? (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600" title={`Preço atual ${fmtBRL(p.preco_atual_unit)}/un`}>
                          <ArrowUpRight size={12} /> {fmtBRL(p.preco_sugerido_unit)}/un ({p.reajuste_pct > 0 ? '+' : ''}{pctBR(p.reajuste_pct)})
                        </span>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  </tr>
                ))}
                {(d.produtos || []).length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-sm text-gray-400">Sem vendas no mês para calcular margens.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          {abaixoMeta.length > 0 && (
            <p className="px-4 py-2.5 text-xs text-amber-700 bg-amber-50 border-t border-amber-100 flex items-start gap-1.5">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              <span>
                {abaixoMeta.length} produto(s) abaixo da meta de margem ({pctBR(d.margin_goal_pct)}). O sistema <b>sugere</b> o novo preço,
                mas <b>não altera nada sozinho</b> — o reajuste é sempre sua decisão.
              </span>
            </p>
          )}
        </div>
      </div>

      {/* Detalhar resultado — origem de cada dado */}
      <Modal isOpen={detail} onClose={() => setDetail(false)} title="Detalhamento do resultado" size="lg">
        <div className="space-y-4 text-sm">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="font-semibold text-gray-900">Período {month}</p>
            <p className="text-xs text-gray-500">
              {d.pedidos || 0} pedido(s) · {fmtQty(d.quantidade)} un
              {temFiltro && ' · com filtros aplicados'}
            </p>
          </div>

          {/* Cascata do resultado */}
          <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
            <div className="flex justify-between"><span className="text-gray-500">Faturamento</span><span className="font-medium">{fmtBRL(d.faturamento)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Custo dos produtos</span><span className="text-red-500">{fmtBRL(vb.produtos)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Impostos</span><span className="text-red-500">{fmtBRL(vb.impostos)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Comissões</span><span className="text-red-500">{fmtBRL(vb.comissoes)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Mão de obra (produção)</span><span className="text-red-500">{fmtBRL(vb.mao_obra_producao)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Marketing variável</span><span className="text-red-500">{fmtBRL(vb.marketing)}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Extras (perdas, frete)</span><span className="text-red-500">{fmtBRL(vb.extras)}</span></div>
            <div className="flex justify-between pt-1.5 border-t border-gray-100">
              <span className="font-medium text-gray-700">= Margem de contribuição</span>
              <span className="font-semibold">{fmtBRL(ind.margem_contribuicao)} ({pctBR(ind.margem_contribuicao_pct)})</span>
            </div>
            <div className="flex justify-between"><span className="text-gray-500">(−) Custo fixo</span><span className="text-red-500">{fmtBRL(d.custo_fixo)}</span></div>
            <div className="flex justify-between pt-1.5 border-t border-gray-100">
              <span className="font-semibold text-gray-700">= Lucro projetado</span>
              <span className={`font-bold ${lucroPos ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(d.lucro_projetado)}</span>
            </div>
          </div>

          {/* Como o ponto de equilíbrio é calculado */}
          <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-xs text-blue-800">
            <b>Ponto de equilíbrio</b> = custo fixo ÷ margem de contribuição % ={' '}
            {fmtBRL(d.custo_fixo)} ÷ {pctBR(ind.margem_contribuicao_pct)} = <b>{fmtBRL(ind.ponto_equilibrio)}</b>
            {ind.preco_medio_un > 0 && <> — equivalente a <b>{fmtQty(ind.ponto_equilibrio_un)} unidades</b> ao preço médio de {fmtBRL(ind.preco_medio_un)}.</>}
          </div>

          {/* Origem de cada dado */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Origem de cada dado</p>
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              {(d.origens || []).map(o => (
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
              Nenhum valor é digitado neste painel — tudo é apurado nos módulos de origem.
              {d.atualizacao?.fichas && <> Fichas de preço atualizadas em {dtBR(d.atualizacao.fichas)}.</>}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button className="btn-secondary" onClick={() => setDetail(false)}><X size={14} /> Fechar</button>
            <button className="btn-primary" onClick={() => { setDetail(false); recalcular(); }} disabled={recalc}>
              <RefreshCw size={14} /> Recalcular rentabilidade
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
