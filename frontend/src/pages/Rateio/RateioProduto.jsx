import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Loader2, Package, Search, Calculator, Info } from 'lucide-react';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4 } from '@/lib/pricingCalc';

export default function RateioProduto() {
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');

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
  const lines = b ? [
    ['Matéria-prima', b.materia_prima],
    ['Tinta', b.tintas],
    ['Tela Serigrafia', b.serigrafia],
    ['Caixa', b.caixa],
    ['Frete', b.frete],
    ['Rateio das despesas fixas', b.rateio],
    ['Impostos', b.impostos],
  ] : [];

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Rateio por Produto</h1>
          <p className="text-sm text-gray-500 mt-1">
            Selecione um produto para ver a composição completa do custo unitário
          </p>
        </div>
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
              <div className="card overflow-hidden">
                <div className="bg-gray-900 text-white px-4 py-3">
                  <p className="font-semibold">{data.product.name}</p>
                  <p className="text-xs text-gray-300">
                    {data.product.category || 'Sem categoria'}
                    {b.source === 'ficha'
                      ? ` · ficha "${b.sheet_name}"`
                      : ' · sem ficha de precificação (usando custo do cadastro + rateio)'}
                  </p>
                </div>
                <div className="p-4 space-y-1.5 text-sm">
                  {lines.map(([label, value]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-gray-500">{label}</span>
                      <span className="font-medium text-gray-900">{fmtBRL4(value)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-2 border-t-2 border-gray-200">
                    <span className="font-bold text-gray-900">CUSTO TOTAL</span>
                    <span className="font-bold text-gray-900 text-lg">{fmtBRL(b.custo_total)}</span>
                  </div>
                </div>
              </div>

              {/* Lucro com o preço atual */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Preço de venda</p>
                  <p className="text-lg font-bold">{data.product.sale_price > 0 ? fmtBRL(data.product.sale_price) : '—'}</p>
                </div>
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Custo total</p>
                  <p className="text-lg font-bold">{fmtBRL(b.custo_total)}</p>
                </div>
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Lucro por unidade</p>
                  <p className={`text-lg font-bold ${data.lucro_unit == null ? 'text-gray-400' : data.lucro_unit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {data.lucro_unit == null ? '—' : fmtBRL(data.lucro_unit)}
                  </p>
                </div>
                <div className="card p-3">
                  <p className="text-[11px] text-gray-500 uppercase">Margem</p>
                  <p className={`text-lg font-bold ${data.margem_pct == null ? 'text-gray-400' : data.margem_pct >= 30 ? 'text-green-600' : data.margem_pct >= 15 ? 'text-amber-600' : 'text-red-600'}`}>
                    {data.margem_pct == null ? '—' : `${String(data.margem_pct).replace('.', ',')}%`}
                  </p>
                </div>
              </div>

              <p className="text-xs text-gray-400 flex items-start gap-1.5">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  {b.source === 'ficha' ? (
                    <>Valores da ficha de <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> com o rateio de custos fixos atualizado.</>
                  ) : (
                    <>Este produto ainda não tem ficha — crie uma na <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> para detalhar tinta, tela, caixa e frete. <Calculator size={11} className="inline" /></>
                  )}
                </span>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
