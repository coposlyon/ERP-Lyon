import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Package, Search, Calculator, Info, RefreshCw,
  ListTree, AlertTriangle, Clock, ArrowUpRight, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';

const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const dtBR = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

export default function RateioProduto() {
  const qc = useQueryClient();
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(false);
  const [recalc, setRecalc] = useState(false);

  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];
  const filtered = search.trim()
    ? products.filter(p => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : products;

  const { data, isLoading } = useQuery({
    queryKey: ['rateio-product', productId],
    queryFn: () => api.get(`/rateio/product/${productId}`),
    enabled: !!productId,
  });

  const b = data?.breakdown;
  const lines = data?.lines || [];
  const upd = data?.atualizacao;

  async function recalcular() {
    setRecalc(true);
    try {
      const r = await api.post(`/rateio/product/${productId}/recalcular`);
      toast.success(`Custos recalculados — ${fmtBRL4(r.cost_unit)}/un`);
      qc.invalidateQueries({ queryKey: ['rateio-product', productId] });
    } catch (err) {
      toast.error(err.error || 'Erro ao recalcular');
    } finally { setRecalc(false); }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Rateio por Produto</h1>
          <p className="text-sm text-gray-500 mt-1">
            Selecione um produto para ver a composição completa do custo unitário
          </p>
        </div>
        {productId && data && (
          <div className="flex items-center gap-2">
            <button className="btn-secondary" onClick={() => setDetail(true)}>
              <ListTree size={15} /> Detalhar Cálculo
            </button>
            <button className="btn-primary" onClick={recalcular} disabled={recalc}>
              {recalc ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalcular Custos
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        {/* Seletor de produto */}
        <div className="card overflow-hidden">
          <div className="card-header">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-8 text-sm w-full" placeholder="Buscar produto..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>
          <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
            {filtered.slice(0, 200).map(p => (
              <button key={p.id} onClick={() => setProductId(p.id)}
                className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                  productId === p.id ? 'bg-primary-50 border-l-2 border-primary-600' : ''}`}>
                <p className="font-medium text-gray-900 truncate">{p.name}</p>
                <p className="text-xs text-gray-400">{p.CATEGORIAS?.name || 'Sem categoria'}</p>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="p-6 text-center text-sm text-gray-400">Nenhum produto encontrado.</p>
            )}
          </div>
        </div>

        {/* Composição do custo */}
        <div className="lg:col-span-2 space-y-4">
          {!productId ? (
            <div className="card p-12 text-center text-gray-400">
              <Package size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-sm">Escolha um produto na lista ao lado para ver o rateio completo.</p>
            </div>
          ) : isLoading ? (
            <div className="card p-12 flex justify-center">
              <Loader2 className="animate-spin text-primary-500" size={24} />
            </div>
          ) : data && (
            <>
              {/* Alerta de custo desatualizado */}
              {upd?.alerta && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800">Custos possivelmente desatualizados</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Última atualização há {upd.dias} dias ({dtBR(upd.mais_recente)}). Confira os insumos e clique em <b>Recalcular Custos</b>.
                    </p>
                  </div>
                </div>
              )}

              <div className="card overflow-hidden">
                <div className="bg-gray-900 text-white px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{data.product.name}</p>
                    <p className="text-xs text-gray-300">
                      {data.product.category || 'Sem categoria'}
                      {b.source === 'ficha'
                        ? ` · ficha "${b.sheet_name}"`
                        : ' · sem ficha de precificação (usando custo do cadastro + rateio)'}
                    </p>
                  </div>
                  {upd?.mais_recente && (
                    <span className="text-[11px] text-gray-300 whitespace-nowrap flex items-center gap-1 shrink-0">
                      <Clock size={11} /> {dtBR(upd.mais_recente)}
                    </span>
                  )}
                </div>

                {/* Linhas com origem e % do custo */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
                      <th className="px-4 py-2">Componente</th>
                      <th className="px-3 py-2">Origem</th>
                      <th className="px-3 py-2 text-right">Valor / un</th>
                      <th className="px-3 py-2 text-right">% do custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map(l => (
                      <tr key={l.key} className="border-b border-gray-50">
                        <td className="px-4 py-2 text-gray-700">{l.label}</td>
                        <td className="px-3 py-2">
                          <Link to={l.link} className="text-xs text-primary-600 hover:underline inline-flex items-center gap-0.5">
                            {l.origin} <ArrowUpRight size={10} />
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{fmtBRL4(l.value)}</td>
                        <td className="px-3 py-2 text-right">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="hidden sm:block w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                              <span className="block h-full bg-primary-500" style={{ width: `${Math.min(100, l.pct)}%` }} />
                            </span>
                            <span className="text-gray-600 text-xs w-11 text-right">{pctBR(l.pct)}</span>
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-200 bg-gray-50/60">
                      <td className="px-4 py-3 font-bold text-gray-900" colSpan={2}>CUSTO TOTAL</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900 text-base whitespace-nowrap">{fmtBRL(data.custo_total)}</td>
                      <td className="px-3 py-3 text-right font-bold text-gray-900">100,0%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Preço, lucro e margem — calculados automaticamente */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Preço de venda</p>
                  <p className="text-lg font-bold">{data.product.sale_price > 0 ? fmtBRL(data.product.sale_price) : '—'}</p>
                </div>
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Custo total</p>
                  <p className="text-lg font-bold">{fmtBRL(data.custo_total)}</p>
                </div>
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Lucro por unidade</p>
                  <p className={`text-lg font-bold ${data.lucro_unit == null ? 'text-gray-400' : data.lucro_unit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {data.lucro_unit == null ? '—' : fmtBRL(data.lucro_unit)}
                  </p>
                </div>
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Margem</p>
                  <p className={`text-lg font-bold ${data.margem_pct == null ? 'text-gray-400' : !data.abaixo_meta ? 'text-green-600' : data.margem_pct >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                    {data.margem_pct == null ? '—' : pctBR(data.margem_pct)}
                  </p>
                  <p className="text-[10px] text-gray-400">meta {pctBR(data.margem_meta)}</p>
                </div>
              </div>

              {/* Sugestão de preço quando a margem está abaixo da meta */}
              {data.abaixo_meta && data.preco_sugerido > 0 && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <ArrowUpRight size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    Margem abaixo da meta. Para atingir {pctBR(data.margem_meta)}, o preço sugerido é{' '}
                    <b>{fmtBRL(data.preco_sugerido)}</b>
                    {data.product.sale_price > 0 && (
                      <> (hoje {fmtBRL(data.product.sale_price)}).</>
                    )}
                    <span className="block text-xs text-amber-700 mt-0.5">O sistema apenas sugere — o preço não muda sozinho.</span>
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 flex items-start gap-1.5">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  {b.source === 'ficha' ? (
                    <>Valores da ficha de <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link>, com rateio fixo e custos variáveis atualizados dos módulos.</>
                  ) : (
                    <>Este produto ainda não tem ficha — crie uma na <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> para detalhar tinta, tela, caixa e frete. <Calculator size={11} className="inline" /></>
                  )}
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      {/* Modal — Detalhar Cálculo */}
      <Modal isOpen={detail} onClose={() => setDetail(false)} title="Detalhamento do cálculo" size="lg">
        {data && (
          <div className="space-y-4 text-sm">
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="font-semibold text-gray-900">{data.product.name}</p>
              <p className="text-xs text-gray-500">
                {b.source === 'ficha' ? `Ficha "${b.sheet_name}"` : 'Sem ficha — custo do cadastro'} ·
                produção de referência: {fmtQty(data.monthly_units)} un/mês
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Como cada valor é obtido</p>
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.key} className="flex items-start justify-between gap-3 border-b border-gray-50 pb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{l.label}</p>
                      <p className="text-xs text-gray-400">
                        Origem: <Link to={l.link} className="text-primary-600 hover:underline">{l.origin}</Link>
                        {l.key === 'rateio' && ' · total das despesas fixas ÷ produção mensal'}
                        {l.key === 'variavel' && ' · (mão de obra + comissões + marketing + extras) ÷ produção mensal'}
                        {l.key === 'impostos' && ' · alíquota configurada no Fiscal sobre o subtotal'}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-semibold text-gray-900">{fmtBRL4(l.value)}</p>
                      <p className="text-xs text-gray-400">{pctBR(l.pct)} do custo</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 p-3 space-y-1.5">
              <div className="flex justify-between font-semibold text-gray-900">
                <span>Custo total por unidade</span><span>{fmtBRL(data.custo_total)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Preço de venda atual</span>
                <span>{data.product.sale_price > 0 ? fmtBRL(data.product.sale_price) : '—'}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Lucro por unidade</span>
                <span className={data.lucro_unit >= 0 ? 'text-green-600' : 'text-red-600'}>
                  {data.lucro_unit == null ? '—' : fmtBRL(data.lucro_unit)}
                </span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Margem (lucro ÷ preço)</span>
                <span>{data.margem_pct == null ? '—' : pctBR(data.margem_pct)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t border-gray-100 text-gray-600">
                <span>Preço sugerido para a meta de {pctBR(data.margem_meta)}</span>
                <span className="font-semibold">{fmtBRL(data.preco_sugerido)}</span>
              </div>
            </div>

            {/* Datas de atualização */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Última atualização dos custos</p>
              <div className="space-y-1">
                {(upd?.itens || []).map(i => (
                  <div key={i.label} className="flex justify-between text-xs">
                    <span className="text-gray-500">{i.label}</span>
                    <span className="text-gray-700">{dtBR(i.at)}</span>
                  </div>
                ))}
                {(upd?.itens || []).length === 0 && <p className="text-xs text-gray-400">Sem data registrada.</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button className="btn-secondary" onClick={() => setDetail(false)}><X size={14} /> Fechar</button>
              <button className="btn-primary" onClick={() => { setDetail(false); recalcular(); }} disabled={recalc}>
                <RefreshCw size={14} /> Recalcular Custos
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
