import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Rocket, Loader2, Info, Calculator } from 'lucide-react';
import api from '@/lib/api';
import {
  simulate, priceFromMargin, fmtBRL, fmtBRL4, fmtQty, numInput,
} from '@/lib/pricingCalc';

const MARGIN_SCENARIOS = [20, 25, 30, 40, 50, 60];
const QTY_SCENARIOS = [250, 500, 1000, 2500, 5000, 10000];

export default function PriceSimulator() {
  const [sheetId, setSheetId] = useState('');
  const [manualCost, setManualCost] = useState('');
  const [manualTaxPct, setManualTaxPct] = useState('4');
  const [quantity, setQuantity] = useState('1000');
  const [margin, setMargin] = useState('40');
  const [priceOverride, setPriceOverride] = useState('');

  const { data: sheets, isLoading } = useQuery({
    queryKey: ['pricing-sheets'],
    queryFn: () => api.get('/pricing/sheets'),
  });

  const sheet = (sheets || []).find(s => s.id === sheetId) || null;

  // Custo unitário e imposto: da ficha selecionada ou do modo manual
  const { costUnit, taxUnit, sourceLabel } = useMemo(() => {
    if (sheet) {
      const subtotal = Number(sheet.cost_subtotal) || 0;
      const cost = Number(sheet.cost_unit) || 0;
      return {
        costUnit: cost,
        taxUnit: cost - subtotal,
        sourceLabel: `Ficha: ${sheet.name} (custo ${fmtBRL4(cost)})`,
      };
    }
    const subtotal = numInput(manualCost);
    const tax = subtotal * numInput(manualTaxPct) / 100;
    return { costUnit: subtotal + tax, taxUnit: tax, sourceLabel: null };
  }, [sheet, manualCost, manualTaxPct]);

  const price = priceOverride !== '' ? numInput(priceOverride) : priceFromMargin(costUnit, margin);
  const sim = simulate({ costUnit, taxUnit, price, quantity });

  const results = [
    ['Preço de Venda (unit.)', fmtBRL(price), 'text-gray-900'],
    ['Faturamento', fmtBRL(sim.faturamento), 'text-gray-900'],
    ['Custo Total', fmtBRL(sim.custoTotal), 'text-gray-600'],
    ['Impostos', fmtBRL(sim.impostos), 'text-amber-700'],
    ['Lucro Bruto', fmtBRL(sim.lucroBruto), sim.lucroBruto >= 0 ? 'text-gray-900' : 'text-red-600'],
    ['Lucro Líquido', fmtBRL(sim.lucroLiquido), sim.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'],
  ];

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Simulador de Preço</h1>
          <p className="text-sm text-gray-500 mt-1">
            Informe a quantidade e a margem para projetar faturamento, impostos e lucro
          </p>
        </div>
      </div>

      {/* Fonte do custo + parâmetros */}
      <div className="card p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="xl:col-span-2">
            <label className="label">Produto (ficha de precificação)</label>
            <select className="input text-sm" value={sheetId} onChange={e => { setSheetId(e.target.value); setPriceOverride(''); }}>
              <option value="">— Custo manual (sem ficha) —</option>
              {(sheets || []).map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.capacity ? ` ${s.capacity}` : ''} · custo {fmtBRL(s.cost_unit)}
                </option>
              ))}
            </select>
            {!sheets?.length && (
              <p className="text-xs text-gray-400 mt-1">
                Nenhuma ficha salva ainda — crie na <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> ou use o custo manual.
              </p>
            )}
          </div>
          {!sheet && (
            <>
              <div>
                <label className="label">Custo unitário (sem imposto)</label>
                <input className="input text-sm" inputMode="decimal" placeholder="2,10"
                  value={manualCost} onChange={e => setManualCost(e.target.value)} />
              </div>
              <div>
                <label className="label">Impostos (%)</label>
                <input className="input text-sm" inputMode="decimal"
                  value={manualTaxPct} onChange={e => setManualTaxPct(e.target.value)} />
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-gray-100">
          <div>
            <label className="label">Quantidade</label>
            <input type="number" min="1" className="input" value={quantity}
              onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="label">Margem de lucro desejada (%)</label>
            <input className="input" inputMode="decimal" value={margin}
              onChange={e => { setMargin(e.target.value); setPriceOverride(''); }} />
          </div>
          <div>
            <label className="label">Preço de venda (deixe vazio p/ usar a margem)</label>
            <input className="input" inputMode="decimal"
              placeholder={price ? price.toFixed(2).replace('.', ',') : '0,00'}
              value={priceOverride} onChange={e => setPriceOverride(e.target.value)} />
          </div>
        </div>
        {sourceLabel && <p className="text-xs text-gray-400 flex items-center gap-1"><Info size={12} /> {sourceLabel}</p>}
        {priceOverride !== '' && (
          <p className="text-xs text-gray-500">
            Margem efetiva com o preço digitado: <b className={sim.margemEfetiva >= 0 ? 'text-green-600' : 'text-red-600'}>{sim.margemEfetiva.toFixed(1)}%</b>
          </p>
        )}
      </div>

      {/* Resultado */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {results.map(([label, value, cls]) => (
          <div key={label} className={`card p-3 ${label === 'Lucro Líquido' ? 'bg-green-50 border-green-200' : ''}`}>
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Cenários de margem */}
      <div className="card overflow-x-auto">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Calculator size={16} className="text-primary-600" /> Cenários de margem — {fmtQty(quantity)} unidades
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2">Margem</th>
              <th className="px-4 py-2 text-right">Preço de venda</th>
              <th className="px-4 py-2 text-right">Faturamento</th>
              <th className="px-4 py-2 text-right">Lucro líquido</th>
              <th className="px-4 py-2 text-right">Lucro por unidade</th>
            </tr>
          </thead>
          <tbody>
            {MARGIN_SCENARIOS.map(m => {
              const p = priceFromMargin(costUnit, m);
              const s = simulate({ costUnit, taxUnit, price: p, quantity });
              const isCurrent = priceOverride === '' && Math.abs(m - numInput(margin)) < 0.01;
              return (
                <tr key={m} className={`border-b border-gray-50 ${isCurrent ? 'bg-primary-50' : ''}`}>
                  <td className="px-4 py-2 font-semibold">{m}% {isCurrent && <span className="badge badge-blue ml-1">atual</span>}</td>
                  <td className="px-4 py-2 text-right font-semibold">{fmtBRL(p)}</td>
                  <td className="px-4 py-2 text-right">{fmtBRL(s.faturamento)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${s.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(s.lucroLiquido)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{fmtBRL(p - costUnit)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Cenários de quantidade */}
      <div className="card overflow-x-auto">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Rocket size={16} className="text-primary-600" /> Cenários de quantidade — preço {fmtBRL(price)}
          </h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2">Quantidade</th>
              <th className="px-4 py-2 text-right">Faturamento</th>
              <th className="px-4 py-2 text-right">Custo total</th>
              <th className="px-4 py-2 text-right">Impostos</th>
              <th className="px-4 py-2 text-right">Lucro líquido</th>
            </tr>
          </thead>
          <tbody>
            {QTY_SCENARIOS.map(q => {
              const s = simulate({ costUnit, taxUnit, price, quantity: q });
              const isCurrent = q === parseInt(quantity);
              return (
                <tr key={q} className={`border-b border-gray-50 ${isCurrent ? 'bg-primary-50' : ''}`}>
                  <td className="px-4 py-2 font-semibold">{fmtQty(q)} un {isCurrent && <span className="badge badge-blue ml-1">atual</span>}</td>
                  <td className="px-4 py-2 text-right">{fmtBRL(s.faturamento)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{fmtBRL(s.custoTotal)}</td>
                  <td className="px-4 py-2 text-right text-amber-700">{fmtBRL(s.impostos)}</td>
                  <td className={`px-4 py-2 text-right font-semibold ${s.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(s.lucroLiquido)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="px-4 py-2 text-xs text-gray-400 flex items-center gap-1 border-t border-gray-100">
          <Info size={12} /> O custo unitário da ficha é mantido fixo nos cenários; rateios que dependem da quantidade
          (tela, tintas, frete) podem variar — refine na Formação de Preço se necessário.
        </p>
      </div>
    </div>
  );
}
