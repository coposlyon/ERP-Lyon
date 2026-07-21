import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, TrendingUp, TrendingDown, DollarSign, Wallet,
  Factory, AlertTriangle, ArrowUpRight,
} from 'lucide-react';
import api from '@/lib/api';
import { fmtBRL } from '@/lib/pricingCalc';

const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;

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
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const { data, isLoading } = useQuery({
    queryKey: ['rateio-rentabilidade', month],
    queryFn: () => api.get(`/rateio/rentabilidade?month=${month}`),
  });

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  const d = data || {};
  const vb = d.variavel_breakdown || {};
  const lucroPos = (d.lucro_projetado || 0) >= 0;
  const abaixoMeta = (d.produtos || []).filter(p => p.abaixo_meta);

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">Painel de Rentabilidade</h1>
          <p className="text-sm text-gray-500 mt-1">Faturamento, custos fixos e variáveis, margem por produto e lucro projetado.</p>
        </div>
        <input type="month" className="input py-1.5 text-sm w-auto" value={month} onChange={e => setMonth(e.target.value)} />
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
    </div>
  );
}
