import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Save, Truck, Landmark, Store, Info, HardHat,
  Users, DollarSign, RefreshCw, X, Megaphone, Layers, ArrowRight,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const dBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};
const pf = v => `${(Number(v) || 0).toFixed(2).replace('.', ',')}%`;
const avg = arr => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const metaColor = p => p >= 100 ? 'text-green-600' : p >= 70 ? 'text-amber-600' : 'text-red-500';

function PctField({ label, value, onChange, suffix = '%' }) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>
      <div className="relative">
        <input className="input text-sm pr-8" inputMode="decimal" value={value}
          onChange={e => onChange(e.target.value)} />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">{suffix}</span>
      </div>
    </div>
  );
}

function Kpi({ icon: Icon, iconBg, iconColor, label, value, sub, valueClass = 'text-gray-900' }) {
  return (
    <div className="card p-4 flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[11px] text-gray-500 uppercase tracking-wide truncate">{label}</p>
        <p className={`text-xl font-extrabold ${valueClass} leading-tight`}>{value}</p>
        {sub && <p className="text-[11px] text-gray-400 truncate">{sub}</p>}
      </div>
      <span className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: iconBg }}>
        <Icon size={20} style={{ color: iconColor }} />
      </span>
    </div>
  );
}

const SectionTitle = ({ icon: Icon, n, children, tag }) => (
  <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
    <Icon size={15} className="text-primary-600" />
    <span>{n}. {children}</span>
    {tag && <span className="text-[10px] font-medium text-gray-400 normal-case">({tag})</span>}
  </h2>
);

export default function DespesasVariaveis() {
  const [form, setForm] = useState(null); // null = ainda não editou
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [updatedAt, setUpdatedAt] = useState(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['rateio-variable', month],
    queryFn: () => api.get(`/rateio/variable?month=${month}`),
  });
  useEffect(() => { if (data) setUpdatedAt(new Date()); }, [data]);

  const v = form || {
    commission_pct: data?.variable?.commission_pct ?? 0,
    pix_pct: data?.variable?.pix_pct ?? 0,
    boleto_fee: data?.variable?.boleto_fee ?? 0,
    card_debit_pct: data?.variable?.card_debit_pct ?? 0,
    card_credit_pct: data?.variable?.card_credit_pct ?? 0,
    card_installment_pct: data?.variable?.card_installment_pct ?? 0,
    antecipacao_pct: data?.variable?.antecipacao_pct ?? 0,
    payment_link_pct: data?.variable?.payment_link_pct ?? 0,
    marketplace: {
      shopee: data?.variable?.marketplace?.shopee ?? 0,
      mercado_livre: data?.variable?.marketplace?.mercado_livre ?? 0,
      amazon: data?.variable?.marketplace?.amazon ?? 0,
      site_proprio: data?.variable?.marketplace?.site_proprio ?? 0,
    },
  };
  const set = patch => setForm({ ...v, ...patch });
  const setMk = patch => setForm({ ...v, marketplace: { ...v.marketplace, ...patch } });
  const num = x => parseFloat(String(x).replace(',', '.')) || 0;

  async function save() {
    setSaving(true);
    try {
      await api.put('/rateio/variable', {
        commission_pct: num(v.commission_pct),
        pix_pct: num(v.pix_pct),
        boleto_fee: num(v.boleto_fee),
        card_debit_pct: num(v.card_debit_pct),
        card_credit_pct: num(v.card_credit_pct),
        card_installment_pct: num(v.card_installment_pct),
        antecipacao_pct: num(v.antecipacao_pct),
        payment_link_pct: num(v.payment_link_pct),
        marketplace: {
          shopee: num(v.marketplace.shopee),
          mercado_livre: num(v.marketplace.mercado_livre),
          amazon: num(v.marketplace.amazon),
          site_proprio: num(v.marketplace.site_proprio),
        },
      });
      toast.success('Despesas variáveis salvas!');
      setForm(null);
      refetch();
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  // ── Agregados p/ KPIs e totais ──
  const labor = data?.prod_labor || { items: [], total: 0, per_unit: 0, monthly_units: 0 };
  const comm = data?.commissions || { items: [], total: 0 };
  const mkt = data?.marketing || { items: [], total: 0, per_unit: 0 };
  const extras = data?.extras || { items: [], total: 0, per_unit: 0 };
  const commSales = comm.items.reduce((s, c) => s + (Number(c.sales) || 0), 0);
  const commTotal = comm.items.reduce((s, c) => s + (Number(c.commission) || 0), 0);
  const commAvgPct = commSales > 0 ? (commTotal / commSales) * 100 : 0;
  const metaGoal = comm.items.reduce((s, c) => s + (Number(c.goal) || 0), 0);
  const metaPct = metaGoal > 0 ? (commSales / metaGoal) * 100 : null;
  const bankAvg = avg([v.pix_pct, v.card_debit_pct, v.card_credit_pct, v.card_installment_pct, v.antecipacao_pct, v.payment_link_pct].map(num));
  const mkVals = [v.marketplace.shopee, v.marketplace.mercado_livre, v.marketplace.amazon, v.marketplace.site_proprio].map(num);
  const mkAvg = avg(mkVals.filter(x => x > 0));

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title uppercase">Precificação / Despesas Variáveis</h1>
          <p className="text-sm text-gray-500 mt-1">Configure e acompanhe os custos variáveis que impactam diretamente cada venda.</p>
        </div>
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-xs text-gray-400 hidden sm:inline">
              Última atualização: {dBR(updatedAt.toISOString())} {String(updatedAt.getHours()).padStart(2, '0')}:{String(updatedAt.getMinutes()).padStart(2, '0')}
            </span>
          )}
          <input type="month" className="input py-1.5 text-sm w-auto" value={month} onChange={e => setMonth(e.target.value)} />
          <button className="btn-secondary" disabled={isFetching} onClick={() => refetch()}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi icon={Users} iconBg="#f5f3ff" iconColor="#7c3aed"
          label="Total Mão de Obra (Produção)" value={`${fmtBRL(labor.total)}`}
          sub={`${fmtBRL4(labor.per_unit)} / unidade`} />
        <Kpi icon={DollarSign} iconBg="#f0fdf4" iconColor="#16a34a"
          label="Total Comissões (Mês)" value={fmtBRL(commTotal)}
          sub={metaPct != null ? `${pf(metaPct)} da meta atingida` : 'meta não definida'} />
        <Kpi icon={Landmark} iconBg="#eff6ff" iconColor="#2563eb"
          label="Taxas Bancárias (Média)" value={pf(bankAvg)} sub="Impacto médio nas vendas" />
        <Kpi icon={Store} iconBg="#fff7ed" iconColor="#ea580c"
          label="Taxas Marketplace (Média)" value={pf(mkAvg)} sub="Impacto médio nas vendas" />
        <Kpi icon={Truck} iconBg="#fdf2f8" iconColor="#db2777"
          label="Fretes de Compra (Mês)" value={fmtBRL(data?.freight_total)} sub="Total no mês" />
      </div>

      {/* 1 e 2 — automáticos */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        {/* 1. MÃO DE OBRA DA PRODUÇÃO */}
        <div className="card overflow-hidden">
          <div className="card-header"><SectionTitle icon={HardHat} n="1">Mão de Obra da Produção<span className="ml-1">(Automático)</span></SectionTitle></div>
          <p className="px-4 pt-2 text-xs text-gray-400">Colaboradores do departamento Produção (Gravação/Serigrafia) com salário cadastrado no RH.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Colaborador</th>
                  <th className="px-4 py-2">Departamento</th>
                  <th className="px-4 py-2 text-right">Salário (R$)</th>
                  <th className="px-4 py-2 text-right">Custo por Unidade (R$)</th>
                </tr>
              </thead>
              <tbody>
                {labor.items.map(p => (
                  <tr key={p.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{p.name}</td>
                    <td className="px-4 py-2 text-gray-500">{p.role || 'Produção'}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtBRL(p.salary)}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{fmtBRL4(labor.monthly_units > 0 ? p.salary / labor.monthly_units : 0)}</td>
                  </tr>
                ))}
                {labor.items.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">
                    Nenhum colaborador do departamento PRODUÇÃO com salário cadastrado no RH.
                  </td></tr>
                )}
              </tbody>
              {labor.items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                    <td className="px-4 py-2.5 font-bold text-gray-900 uppercase text-xs" colSpan={2}>Total Folha Produção</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmtBRL(labor.total)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmtBRL4(labor.per_unit)} / unid.</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            Custo por unidade = Salário ÷ Produção mensal estimada ({fmtQty(labor.monthly_units)} unidades). Puxado do módulo <Link to="/employees" className="text-primary-600 hover:underline">RH → Colaboradores</Link>.
          </p>
        </div>

        {/* 2. COMISSÕES DE VENDAS */}
        <div className="card overflow-hidden">
          <div className="card-header"><SectionTitle icon={DollarSign} n="2">Comissões de Vendas<span className="ml-1">(Automático)</span></SectionTitle></div>
          <p className="px-4 pt-2 text-xs text-gray-400">Comissão calculada sobre as vendas entregues no mês, conforme % definido no RH.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Vendedor</th>
                  <th className="px-4 py-2 text-right">Vendas Entregues (R$)</th>
                  <th className="px-4 py-2 text-right">Comissão (%)</th>
                  <th className="px-4 py-2 text-right">% da Meta</th>
                  <th className="px-4 py-2 text-right">Comissão (R$)</th>
                </tr>
              </thead>
              <tbody>
                {comm.items.map(c => (
                  <tr key={c.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                    <td className="px-4 py-2 text-right">{fmtBRL(c.sales)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{pf(c.pct)}</td>
                    <td className="px-4 py-2 text-right">
                      {c.goal_pct != null
                        ? <span className={`font-medium ${metaColor(c.goal_pct)}`}>{pf(c.goal_pct)}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold text-green-700">{fmtBRL(c.commission)}</td>
                  </tr>
                ))}
                {comm.items.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">
                    Nenhuma comissão no mês. Defina a comissão % no cadastro do colaborador (RH) e vincule o vendedor ao cliente.
                  </td></tr>
                )}
              </tbody>
              {comm.items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                    <td className="px-4 py-2.5 font-bold text-gray-900 uppercase text-xs">Total Comissões do Mês</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{fmtBRL(commSales)}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-gray-900">{pf(commAvgPct)}</td>
                    <td className="px-4 py-2.5" />
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmtBRL(commTotal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            Comissão = % do colaborador (definida no RH) × vendas entregues do mês atribuídas a ele.
          </p>
        </div>
      </div>

      {/* 3 e 4 — editáveis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* 3. COMISSÃO PADRÃO */}
        <div className="card p-4 space-y-3">
          <SectionTitle icon={DollarSign} n="3">% Comissão Padrão<span className="ml-1">(Editável)</span></SectionTitle>
          <p className="text-xs text-gray-500">Usado quando o vendedor não tem % definido no RH.</p>
          <PctField label="Comissão padrão de vendedor (%)" value={v.commission_pct} onChange={x => set({ commission_pct: x })} />
          <p className="text-xs text-gray-400">Valor de reserva para cálculo de lucratividade dos pedidos.</p>
        </div>

        {/* 4. TAXAS BANCÁRIAS */}
        <div className="card p-4 space-y-3 lg:col-span-2">
          <SectionTitle icon={Landmark} n="4">Taxas Bancárias<span className="ml-1">(Editável)</span></SectionTitle>
          <p className="text-xs text-gray-500">Informe as taxas cobradas pelas instituições financeiras em cada meio de pagamento.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <PctField label="PIX (%)" value={v.pix_pct} onChange={x => set({ pix_pct: x })} />
            <PctField label="Boleto (R$ por emissão)" suffix="R$" value={v.boleto_fee} onChange={x => set({ boleto_fee: x })} />
            <PctField label="Cartão Débito (%)" value={v.card_debit_pct} onChange={x => set({ card_debit_pct: x })} />
            <PctField label="Cartão Crédito à vista (%)" value={v.card_credit_pct} onChange={x => set({ card_credit_pct: x })} />
            <PctField label="Cartão Parcelado (%)" value={v.card_installment_pct} onChange={x => set({ card_installment_pct: x })} />
            <PctField label="Antecipação (%)" value={v.antecipacao_pct} onChange={x => set({ antecipacao_pct: x })} />
            <PctField label="Link de Pagamento (%)" value={v.payment_link_pct} onChange={x => set({ payment_link_pct: x })} />
          </div>
        </div>
      </div>

      {/* 5 e 6 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 5. TAXAS DE MARKETPLACE */}
        <div className="card p-4 space-y-3">
          <SectionTitle icon={Store} n="5">Taxas de Marketplace<span className="ml-1">(Editável)</span></SectionTitle>
          <p className="text-xs text-gray-500">Percentual cobrado por cada canal sobre as vendas realizadas.</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <PctField label="Shopee (%)" value={v.marketplace.shopee} onChange={x => setMk({ shopee: x })} />
            <PctField label="Mercado Livre (%)" value={v.marketplace.mercado_livre} onChange={x => setMk({ mercado_livre: x })} />
            <PctField label="Amazon (%)" value={v.marketplace.amazon} onChange={x => setMk({ amazon: x })} />
            <PctField label="Site Próprio (%)" value={v.marketplace.site_proprio} onChange={x => setMk({ site_proprio: x })} />
          </div>
        </div>

        {/* 6. FRETES DE COMPRA */}
        <div className="card overflow-hidden">
          <div className="card-header"><SectionTitle icon={Truck} n="6">Fretes de Compra<span className="ml-1">(Automático)</span></SectionTitle></div>
          <p className="px-4 pt-2 text-xs text-gray-400">Fretes lançados no módulo de Compras (inclusive via NF-e importada).</p>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Fornecedor</th>
                  <th className="px-4 py-2">Nº Compra</th>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {(data?.freights || []).map(f => (
                  <tr key={f.id} className="border-b border-gray-50">
                    <td className="px-4 py-2">{f.supplier}</td>
                    <td className="px-4 py-2 text-gray-500">#{f.number}</td>
                    <td className="px-4 py-2 text-gray-500">{dBR(f.date)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtBRL(f.freight)}</td>
                  </tr>
                ))}
                {(data?.freights || []).length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">Nenhum frete lançado nas Compras ainda.</td></tr>
                )}
              </tbody>
              {(data?.freights || []).length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                    <td className="px-4 py-2.5 font-bold text-gray-900 uppercase text-xs" colSpan={3}>Total Fretes de Compra (Mês)</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmtBRL(data?.freight_total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            Buscados do módulo de <Link to="/purchases" className="text-primary-600 hover:underline">Compras</Link>. O frete entra no custo do produto pela Formação de Preço.
          </p>
        </div>
      </div>

      {/* 7 e 8 — automáticos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
        {/* 7. MARKETING VARIÁVEL */}
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <SectionTitle icon={Megaphone} n="7">Marketing Variável<span className="ml-1">(Automático)</span></SectionTitle>
            {mkt.total > 0 && <span className="text-xs text-gray-500">{fmtBRL4(mkt.per_unit)}/un</span>}
          </div>
          <p className="px-4 pt-2 text-xs text-gray-400">
            Gasto real com anúncios lançado no Financeiro (Meta, Google, impulsionamentos). O marketing fixo continua nas Despesas Fixas.
          </p>
          <div className="max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Lançamento</th>
                  <th className="px-4 py-2">Conta</th>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2 text-right">Valor (R$)</th>
                </tr>
              </thead>
              <tbody>
                {mkt.items.map(i => (
                  <tr key={i.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 font-medium text-gray-900">{i.description}</td>
                    <td className="px-4 py-2 text-gray-500">{i.account || '—'}</td>
                    <td className="px-4 py-2 text-gray-500">{dBR(i.date)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmtBRL(i.amount)}</td>
                  </tr>
                ))}
                {mkt.items.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">
                    Nenhum gasto com anúncio no mês. Lance a fatura do Meta/Google no Financeiro que ela aparece aqui.
                  </td></tr>
                )}
              </tbody>
              {mkt.items.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                    <td className="px-4 py-2.5 font-bold text-gray-900 uppercase text-xs" colSpan={3}>Total Marketing Variável</td>
                    <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmtBRL(mkt.total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            Puxado do <Link to="/financial" className="text-primary-600 hover:underline">Financeiro</Link> — contas a pagar do mês classificadas como anúncio/publicidade.
          </p>
        </div>

        {/* 8. CUSTOS VARIÁVEIS EXTRAS */}
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <SectionTitle icon={Layers} n="8">Custos Variáveis Extras<span className="ml-1">(Automático)</span></SectionTitle>
            {extras.total > 0 && <span className="text-xs text-gray-500">{fmtBRL4(extras.per_unit)}/un</span>}
          </div>
          <p className="px-4 pt-2 text-xs text-gray-400">
            Perdas de produção, frete das vendas e demais lançamentos variáveis — todos apurados nos módulos de origem.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Custo</th>
                <th className="px-4 py-2">Origem</th>
                <th className="px-4 py-2 text-right">Valor (R$)</th>
              </tr>
            </thead>
            <tbody>
              {extras.items.map(i => (
                <tr key={i.label} className="border-b border-gray-50">
                  <td className="px-4 py-2">
                    <span className="block font-medium text-gray-900">{i.label}</span>
                    <span className="text-xs text-gray-400">{i.hint}</span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">{i.source}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtBRL(i.value)}</td>
                </tr>
              ))}
              {extras.items.length === 0 && (
                <tr><td colSpan={3} className="text-center py-8 text-sm text-gray-400">
                  Nenhum custo variável extra no mês.
                </td></tr>
              )}
            </tbody>
            {extras.items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                  <td className="px-4 py-2.5 font-bold text-gray-900 uppercase text-xs" colSpan={2}>Total Extras</td>
                  <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmtBRL(extras.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
            Depreciação, manutenção e investimentos <b>não entram aqui</b> — serão tratados no módulo de Engenharia de Custos e Ativos.
          </p>
        </div>
      </div>

      {/* Para onde esse módulo alimenta */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
            <ArrowRight size={15} className="text-primary-500" /> Custo variável por unidade
          </span>
          <span className="text-xl font-extrabold text-green-600">{fmtBRL4(data?.variable_unit)}</span>
          <span className="text-xs text-gray-400">
            (mão de obra + comissões + marketing + extras) ÷ {fmtQty(data?.monthly_units)} un
          </span>
          <span className="flex-1" />
          <span className="text-xs text-gray-500">Alimenta:</span>
          <Link to="/pricing/formacao" className="text-xs text-primary-600 hover:underline">Formação de Preço</Link>
          <span className="text-gray-300">·</span>
          <Link to="/rateio/pedido" className="text-xs text-primary-600 hover:underline">Rateio por Pedido</Link>
          <span className="text-gray-300">·</span>
          <Link to="/rateio/rentabilidade" className="text-xs text-primary-600 hover:underline">Painel de Rentabilidade</Link>
        </div>
      </div>

      {/* Barra inferior fixa (sticky dentro da área de rolagem) */}
      <div className="sticky bottom-0 z-30 -mx-3 sm:-mx-4 lg:-mx-6 -mb-3 sm:-mb-4 lg:-mb-6 mt-4 bg-white/95 backdrop-blur border-t border-gray-200 px-4 sm:px-6 py-3 flex items-center gap-3">
        <Info size={15} className="text-primary-500 shrink-0" />
        <p className="text-xs text-gray-500 flex-1">
          <b className="text-gray-700">Importante:</b> os itens automáticos são atualizados em tempo real com base nos módulos de RH, Vendas e Compras.
        </p>
        {form && (
          <button className="btn-secondary" onClick={() => setForm(null)} disabled={saving}>
            <X size={14} /> Cancelar
          </button>
        )}
        <button className="btn-primary" onClick={save} disabled={saving || !form}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar Alterações
        </button>
      </div>
    </div>
  );
}
