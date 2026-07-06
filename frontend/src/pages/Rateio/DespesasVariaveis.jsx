import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Save, Truck, Landmark, Percent, Store, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { fmtBRL } from '@/lib/pricingCalc';

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

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['rateio-variable'],
    queryFn: () => api.get('/rateio/variable'),
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
        {form && (
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} SALVAR
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* COMISSÕES */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 uppercase text-sm tracking-wide flex items-center gap-2">
            <Percent size={15} className="text-primary-600" /> Comissões
          </h2>
          <PctField label="Comissão de vendedor (% sobre a venda)" value={v.commission_pct}
            onChange={x => set({ commission_pct: x })} />
          <p className="text-xs text-gray-400">
            Aplicada sobre o valor de cada pedido no cálculo de lucratividade.
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
