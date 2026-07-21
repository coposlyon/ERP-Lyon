import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Save, Truck, Landmark, Percent, Store, Info, HardHat,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const dBR = iso => {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '—';
};

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

export default function DespesasVariaveis() {
  const [form, setForm] = useState(null); // null = ainda não editou
  const [saving, setSaving] = useState(false);
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rateio-variable', month],
    queryFn: () => api.get(`/rateio/variable?month=${month}`),
  });

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

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title uppercase">Despesas Variáveis</h1>
          <p className="text-sm text-gray-500 mt-1">
            Comissões, taxas bancárias e de marketplace que entram no cálculo dos pedidos
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="input py-1.5 text-sm w-auto" value={month} onChange={e => setMonth(e.target.value)} />
          {form && (
            <button className="btn-primary" disabled={saving} onClick={save}>
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} SALVAR
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* MÃO DE OBRA DA PRODUÇÃO (integração com RH) */}
        <div className="card overflow-hidden md:col-span-2">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
              <HardHat size={15} className="text-primary-600" /> Mão de Obra da Produção
            </h2>
            {(data?.prod_labor?.items || []).length > 0 && (
              <span className="text-xs text-gray-500">
                {fmtBRL(data.prod_labor.total)}/mês · {fmtBRL4(data.prod_labor.per_unit)}/un
                <span className="text-gray-400"> ({fmtQty(data.prod_labor.monthly_units)} un/mês)</span>
              </span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Colaborador</th>
                <th className="px-4 py-2">Departamento</th>
                <th className="px-4 py-2 text-right">Salário (R$)</th>
                <th className="px-4 py-2 text-right">Custo por Unidade</th>
              </tr>
            </thead>
            <tbody>
              {(data?.prod_labor?.items || []).map(p => (
                <tr key={p.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{p.name}</td>
                  <td className="px-4 py-2 text-gray-500">{p.role || 'Produção'}</td>
                  <td className="px-4 py-2 text-right font-medium">{fmtBRL(p.salary)}</td>
                  <td className="px-4 py-2 text-right text-gray-600">
                    {fmtBRL4(data?.prod_labor?.monthly_units > 0 ? p.salary / data.prod_labor.monthly_units : 0)}
                  </td>
                </tr>
              ))}
              {(data?.prod_labor?.items || []).length === 0 && (
                <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">
                  Nenhum colaborador do departamento PRODUÇÃO com salário cadastrado no RH.
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-400 flex items-start gap-1.5 border-t border-gray-100">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Puxado automaticamente do módulo <Link to="/employees" className="text-primary-600 hover:underline">Recursos Humanos → Colaboradores</Link>:
              departamento PRODUÇÃO entra aqui como custo variável; os demais departamentos vão para as Despesas Fixas. Nada é digitado duas vezes.
            </span>
          </p>
        </div>

        {/* COMISSÕES DE VENDAS (calculado do RH + vendas entregues) */}
        <div className="card overflow-hidden md:col-span-2">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
              <Percent size={15} className="text-primary-600" /> Comissões de Vendas
            </h2>
            {(data?.commissions?.items || []).length > 0 && (
              <span className="text-xs text-gray-500">Total do mês: <b>{fmtBRL(data.commissions.total)}</b></span>
            )}
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Vendedor</th>
                <th className="px-4 py-2 text-right">Vendas entregues (mês)</th>
                <th className="px-4 py-2 text-right">Comissão %</th>
                <th className="px-4 py-2 text-right">Meta</th>
                <th className="px-4 py-2 text-right">Comissão (R$)</th>
              </tr>
            </thead>
            <tbody>
              {(data?.commissions?.items || []).map(c => (
                <tr key={c.id} className="border-b border-gray-50">
                  <td className="px-4 py-2 font-medium text-gray-900">{c.name}</td>
                  <td className="px-4 py-2 text-right">{fmtBRL(c.sales)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{String(c.pct).replace('.', ',')}%</td>
                  <td className="px-4 py-2 text-right">
                    {c.goal_pct != null
                      ? <span className={c.goal_pct >= 100 ? 'text-green-600 font-medium' : 'text-gray-500'}>{c.goal_pct.toFixed(0)}%</span>
                      : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right font-semibold text-green-700">{fmtBRL(c.commission)}</td>
                </tr>
              ))}
              {(data?.commissions?.items || []).length === 0 && (
                <tr><td colSpan={5} className="text-center py-8 text-sm text-gray-400">
                  Nenhuma comissão no mês. Defina a comissão % no cadastro do colaborador (RH) e vincule o vendedor ao cliente.
                </td></tr>
              )}
            </tbody>
          </table>
          <p className="px-4 py-2 text-xs text-gray-400 flex items-start gap-1.5 border-t border-gray-100">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Calculada automaticamente: comissão % do <Link to="/employees" className="text-primary-600 hover:underline">RH</Link> ×
              vendas <b>entregues</b> do mês atribuídas ao vendedor do cliente. Lançada como custo variável, separada do salário fixo.
            </span>
          </p>
        </div>

        {/* TAXA PADRÃO DE COMISSÃO (fallback p/ o cálculo de pedidos sem vendedor) */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
            <Percent size={15} className="text-primary-600" /> Comissão padrão
          </h2>
          <PctField label="Comissão de vendedor (% sobre a venda)" value={v.commission_pct}
            onChange={x => set({ commission_pct: x })} />
          <p className="text-xs text-gray-400">
            Usada no cálculo de lucratividade dos pedidos quando o vendedor não tem % próprio no RH.
          </p>
        </div>

        {/* TAXAS BANCÁRIAS */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
            <Landmark size={15} className="text-primary-600" /> Taxas Bancárias
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <PctField label="PIX" value={v.pix_pct} onChange={x => set({ pix_pct: x })} />
            <PctField label="Boleto (por emissão)" suffix="R$" value={v.boleto_fee} onChange={x => set({ boleto_fee: x })} />
            <PctField label="Cartão Débito" value={v.card_debit_pct} onChange={x => set({ card_debit_pct: x })} />
            <PctField label="Cartão Crédito (à vista)" value={v.card_credit_pct} onChange={x => set({ card_credit_pct: x })} />
            <PctField label="Cartão Parcelado" value={v.card_installment_pct} onChange={x => set({ card_installment_pct: x })} />
            <PctField label="Antecipação" value={v.antecipacao_pct} onChange={x => set({ antecipacao_pct: x })} />
            <PctField label="Link de Pagamento" value={v.payment_link_pct} onChange={x => set({ payment_link_pct: x })} />
          </div>
        </div>

        {/* TAXAS DE MARKETPLACE */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
            <Store size={15} className="text-primary-600" /> Taxas de Marketplace
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <PctField label="Shopee" value={v.marketplace.shopee} onChange={x => setMk({ shopee: x })} />
            <PctField label="Mercado Livre" value={v.marketplace.mercado_livre} onChange={x => setMk({ mercado_livre: x })} />
            <PctField label="Amazon" value={v.marketplace.amazon} onChange={x => setMk({ amazon: x })} />
            <PctField label="Site Próprio" value={v.marketplace.site_proprio} onChange={x => setMk({ site_proprio: x })} />
          </div>
        </div>

        {/* FRETES (integração com Compras) */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
              <Truck size={15} className="text-primary-600" /> Fretes de Compra
            </h2>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Fornecedor</th>
                  <th className="px-4 py-2">Compra</th>
                  <th className="px-4 py-2">Data</th>
                  <th className="px-4 py-2 text-right">Frete (R$)</th>
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
                  <tr><td colSpan={4} className="text-center py-8 text-sm text-gray-400">
                    Nenhum frete lançado nas Compras ainda.
                  </td></tr>
                )}
              </tbody>
              {(data?.freights || []).length > 0 && (
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50/60">
                    <td className="px-4 py-2 font-bold" colSpan={3}>Total</td>
                    <td className="px-4 py-2 text-right font-bold text-green-600">{fmtBRL(data?.freight_total)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="px-4 py-2 text-xs text-gray-400 flex items-start gap-1.5 border-t border-gray-100">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              Buscados automaticamente do módulo de <Link to="/purchases" className="text-primary-600 hover:underline">Compras</Link> (inclusive
              da NF-e importada) — nada é digitado duas vezes. O frete entra no custo do produto pela Formação de Preço.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
