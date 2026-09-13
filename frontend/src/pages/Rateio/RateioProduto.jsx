// ============================================================
// RATEIO — POR CATEGORIA E POR PRODUTO.
//
// A CATEGORIA VEM PRIMEIRO, e essa é a mudança. Ninguém forma preço de
// "Long Drink 400 ml Azul" sozinho: forma-se o preço de LONG DRINK.
// Abrir vinte e quatro fichas para descobrir que todas têm o mesmo
// rateio, o mesmo custo variável e o mesmo imposto era o trabalho que
// fazia esta tela parecer grande demais para ser usada. Agora a
// categoria é a porta de entrada e o produto é o detalhe — que continua
// inteiro, na outra aba.
//
// TODO VALOR DIZ DE ONDE VEM. Passe o mouse em qualquer número e ele
// explica a procedência; clique e você cai na tela que o define. Número
// de custo sem procedência é número que ninguém conserta: quem discorda
// dele não sabe onde discordar. E agora que borda, canudo e tinta moram
// nos Cadastros, a linha "Adicionais" leva direto para lá.
// ============================================================
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Loader2, Package, Search, Calculator, Info, RefreshCw,
  ListTree, AlertTriangle, Clock, ArrowUpRight, X, FolderTree, TrendingDown,
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

/**
 * O VALOR QUE SE EXPLICA SOZINHO.
 *
 * O número é um link para a tela que o define, e o balão diz por quê.
 * `title` fica junto de propósito: no celular não existe passar o
 * mouse, e o toque longo ainda mostra o texto nativo.
 */
function ValorComOrigem({ linha, formatar = fmtBRL4, className = '' }) {
  const [aberto, setAberto] = useState(false);
  return (
    <span className="relative inline-block"
      onMouseEnter={() => setAberto(true)} onMouseLeave={() => setAberto(false)}>
      <Link to={linha.link} title={linha.explicacao || `Vem de ${linha.origin}`}
        className={`font-medium text-gray-900 whitespace-nowrap border-b border-dotted border-gray-300 hover:border-primary-500 hover:text-primary-700 ${className}`}>
        {formatar(linha.value)}
      </Link>
      {aberto && (linha.explicacao || linha.origin) && (
        <span className="absolute right-0 bottom-full mb-1.5 z-30 w-64 rounded-xl bg-gray-900 text-white text-[11px] leading-relaxed p-2.5 shadow-lg text-left font-normal">
          <span className="block font-semibold mb-0.5">Vem de: {linha.origin}</span>
          {linha.explicacao}
          <span className="block mt-1 text-gray-300">Clique para abrir.</span>
        </span>
      )}
    </span>
  );
}

/** A barrinha de % do custo — a mesma nas duas vistas. */
function Percentual({ pct }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="hidden sm:block w-12 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <span className="block h-full bg-primary-500" style={{ width: `${Math.min(100, pct)}%` }} />
      </span>
      <span className="text-gray-600 text-xs w-11 text-right">{pctBR(pct)}</span>
    </span>
  );
}

/** A tabela de componentes, usada pela categoria e pelo produto. */
function TabelaDeLinhas({ lines, total, rotuloTotal = 'CUSTO TOTAL' }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-[11px] uppercase text-gray-500 border-b border-gray-100">
          <th className="px-4 py-2">Componente</th>
          <th className="px-3 py-2 hidden sm:table-cell">Origem</th>
          <th className="px-3 py-2 text-right">Valor / un</th>
          <th className="px-3 py-2 text-right">% do custo</th>
        </tr>
      </thead>
      <tbody>
        {lines.map(l => (
          <tr key={l.key} className="border-b border-gray-50">
            <td className="px-4 py-2 text-gray-700">{l.label}</td>
            <td className="px-3 py-2 hidden sm:table-cell">
              <Link to={l.link} className="text-xs text-primary-600 hover:underline inline-flex items-center gap-0.5">
                {l.origin} <ArrowUpRight size={10} />
              </Link>
            </td>
            <td className="px-3 py-2 text-right"><ValorComOrigem linha={l} /></td>
            <td className="px-3 py-2 text-right"><Percentual pct={l.pct} /></td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-gray-200 bg-gray-50/60">
          <td className="px-4 py-3 font-bold text-gray-900" colSpan={2}>{rotuloTotal}</td>
          <td className="px-3 py-3 text-right font-bold text-gray-900 text-base whitespace-nowrap">{fmtBRL(total)}</td>
          <td className="px-3 py-3 text-right font-bold text-gray-900">100,0%</td>
        </tr>
      </tfoot>
    </table>
  );
}

// ════════════════════════════════════════════════════════════
// VISTA: CATEGORIA
// ════════════════════════════════════════════════════════════
function VistaCategoria() {
  const [categoryId, setCategoryId] = useState('');
  const [busca, setBusca] = useState('');

  const { data: categorias = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get('/products/categories/list'),
  });
  const filtradas = busca.trim()
    ? categorias.filter(c => c.name.toLowerCase().includes(busca.trim().toLowerCase()))
    : categorias;

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['rateio-categoria', categoryId],
    queryFn: () => api.get(`/rateio/categoria/${categoryId}`),
    enabled: !!categoryId,
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
      {/* ── as categorias ── */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-8 text-sm w-full" placeholder="Buscar categoria..."
              value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </div>
        <div className="max-h-[520px] overflow-y-auto divide-y divide-gray-50">
          {filtradas.map(c => (
            <button key={c.id} onClick={() => setCategoryId(c.id)}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors ${
                categoryId === c.id ? 'bg-primary-50 border-l-2 border-primary-600' : ''}`}>
              <p className="font-medium text-gray-900 truncate">{c.name}</p>
              <p className="text-xs text-gray-400">{c.product_count} produto{c.product_count === 1 ? '' : 's'}</p>
            </button>
          ))}
          {filtradas.length === 0 && (
            <p className="p-6 text-center text-sm text-gray-400">Nenhuma categoria encontrada.</p>
          )}
        </div>
      </div>

      {/* ── o rateio da categoria ── */}
      <div className="lg:col-span-2 space-y-4">
        {!categoryId ? (
          <div className="card p-12 text-center text-gray-400">
            <FolderTree size={32} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">Escolha uma categoria para ver o custo médio e onde ele se forma.</p>
          </div>
        ) : isLoading ? (
          <div className="card p-12 flex justify-center"><Loader2 className="animate-spin text-primary-500" size={24} /></div>
        ) : isError ? (
          <div className="card p-10 text-center">
            <AlertTriangle size={22} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm text-gray-600">{error?.error || 'Não foi possível calcular esta categoria.'}</p>
          </div>
        ) : data && (
          <>
            <div className="card overflow-hidden">
              <div className="bg-gray-900 text-white px-4 py-3">
                <p className="font-semibold">{data.categoria.name}</p>
                <p className="text-xs text-gray-300">
                  {data.categoria.produtos} produtos · {data.sem_ficha} sem ficha de preço · {data.sem_preco} sem preço de venda
                </p>
              </div>
              <TabelaDeLinhas lines={data.lines} total={data.custo_medio} rotuloTotal="CUSTO MÉDIO DA CATEGORIA" />
            </div>

            {/* A DISPERSÃO, que é o que a média esconde. */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="card p-3">
                <p className="text-[11px] text-gray-500 uppercase">Custo médio</p>
                <p className="text-lg font-bold">{fmtBRL(data.custo_medio)}</p>
              </div>
              <div className="card p-3">
                <p className="text-[11px] text-gray-500 uppercase">Do mais barato ao mais caro</p>
                <p className="text-sm font-bold">{fmtBRL(data.custo_min)} — {fmtBRL(data.custo_max)}</p>
              </div>
              <div className="card p-3">
                <p className="text-[11px] text-gray-500 uppercase">Margem média</p>
                <p className={`text-lg font-bold ${data.margem_media == null ? 'text-gray-400'
                  : data.margem_media >= data.margem_meta ? 'text-green-600' : 'text-amber-600'}`}>
                  {data.margem_media == null ? '—' : pctBR(data.margem_media)}
                </p>
                <p className="text-[10px] text-gray-400">meta {pctBR(data.margem_meta)}</p>
              </div>
              <div className="card p-3">
                <p className="text-[11px] text-gray-500 uppercase">Abaixo da meta</p>
                <p className={`text-lg font-bold ${data.abaixo_meta ? 'text-red-600' : 'text-green-600'}`}>
                  {data.abaixo_meta}
                </p>
                <p className="text-[10px] text-gray-400">de {data.categoria.produtos}</p>
              </div>
            </div>

            {/* Os adicionais da categoria — a ponte com o cadastro. */}
            {(data.adicionais.padrao.length > 0 || data.adicionais.opcionais.length > 0) && (
              <div className="card p-4 space-y-2">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Adicionais desta categoria
                </p>
                {data.adicionais.padrao.map((a, i) => (
                  <div key={`p${i}`} className="flex justify-between text-sm">
                    <span className="text-gray-700">{a.nome}{a.cor ? ` · ${a.cor}` : ''} <span className="text-[10px] text-gray-400 uppercase">já no preço</span></span>
                    <span className="text-gray-500">custa {fmtBRL4(a.custo)} · cobra {fmtBRL4(a.preco)}</span>
                  </div>
                ))}
                {data.adicionais.opcionais.map((a, i) => (
                  <div key={`o${i}`} className="flex justify-between text-sm">
                    <span className="text-gray-700">{a.nome}{a.cor ? ` · ${a.cor}` : ''} <span className="text-[10px] text-gray-400 uppercase">opcional</span></span>
                    <span className="text-gray-500">custa {fmtBRL4(a.custo)} · cobra {fmtBRL4(a.preco)}</span>
                  </div>
                ))}
                <p className="text-[11px] text-gray-400 pt-1">
                  Cadastrados em <Link to="/products?secao=subprodutos" className="text-primary-600 hover:underline">Produtos › Sub-Produtos e Bordas</Link>.
                  Mudou lá, muda aqui e em todo copo da categoria.
                </p>
              </div>
            )}

            {/* Quem está puxando a margem para baixo. */}
            <div className="card overflow-hidden">
              <div className="card-header flex items-center gap-2">
                <TrendingDown size={14} className="text-gray-400" />
                <span className="text-sm font-medium text-gray-700">Produtos da categoria — pior margem primeiro</span>
              </div>
              <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                {data.produtos.map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="block text-gray-800 truncate">{p.name}</span>
                      {!p.com_ficha && <span className="text-[10px] text-amber-600">sem ficha de preço</span>}
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block text-gray-900">{fmtBRL(p.custo_total)}</span>
                      <span className={`block text-[11px] ${p.margem_pct == null ? 'text-gray-400'
                        : p.margem_pct < data.margem_meta ? 'text-red-600' : 'text-green-600'}`}>
                        {p.margem_pct == null ? 'sem preço' : `margem ${pctBR(p.margem_pct)}`}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// VISTA: PRODUTO
// ════════════════════════════════════════════════════════════
function VistaProduto() {
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
    <>
      {productId && data && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <button className="btn-secondary" onClick={() => setDetail(true)}>
            <ListTree size={15} /> Detalhar Cálculo
          </button>
          <button className="btn-primary" onClick={recalcular} disabled={recalc}>
            {recalc ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Recalcular Custos
          </button>
        </div>
      )}

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
              {upd?.alerta && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold text-amber-800">Custos possivelmente desatualizados</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Última atualização há {upd.dias} dias ({dtBR(upd.mais_recente)}). Confira os cadastros e clique em <b>Recalcular Custos</b>.
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
                <TabelaDeLinhas lines={lines} total={data.custo_total} />
              </div>

              {/* Os opcionais não entram no custo — mas o vendedor precisa saber que existem. */}
              {data.adicionais?.opcionais?.length > 0 && (
                <div className="card p-4 space-y-1.5">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Opcionais deste copo (só entram no pedido de quem escolher)
                  </p>
                  {data.adicionais.opcionais.map((a, i) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="text-gray-700">{a.nome}{a.cor ? ` · ${a.cor}` : ''}</span>
                      <span className="text-gray-500">custa {fmtBRL4(a.custo)} · cobra {fmtBRL4(a.preco)}</span>
                    </div>
                  ))}
                </div>
              )}

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

              {data.abaixo_meta && data.preco_sugerido > 0 && (
                <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                  <ArrowUpRight size={16} className="text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-amber-800">
                    Margem abaixo da meta. Para atingir {pctBR(data.margem_meta)}, o preço sugerido é{' '}
                    <b>{fmtBRL(data.preco_sugerido)}</b>
                    {data.product.sale_price > 0 && (<> (hoje {fmtBRL(data.product.sale_price)}).</>)}
                    <span className="block text-xs text-amber-700 mt-0.5">O sistema apenas sugere — o preço não muda sozinho.</span>
                  </p>
                </div>
              )}

              <p className="text-xs text-gray-400 flex items-start gap-1.5">
                <Info size={13} className="mt-0.5 shrink-0" />
                <span>
                  {b.source === 'ficha' ? (
                    <>Valores da ficha de <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link>, dos <Link to="/products?secao=subprodutos" className="text-primary-600 hover:underline">Cadastros</Link> e do rateio.</>
                  ) : (
                    <>Este produto ainda não tem ficha — crie uma na <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link>. Bordas e sub-produtos (tampa, canudo) se cadastram em <Link to="/products?secao=subprodutos" className="text-primary-600 hover:underline">Produtos</Link>. <Calculator size={11} className="inline" /></>
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
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">De onde vem cada valor</p>
              <div className="space-y-2">
                {lines.map(l => (
                  <div key={l.key} className="flex items-start justify-between gap-3 border-b border-gray-50 pb-2">
                    <div className="min-w-0">
                      <p className="font-medium text-gray-800">{l.label}</p>
                      <p className="text-xs text-gray-400">
                        <Link to={l.link} className="text-primary-600 hover:underline">{l.origin}</Link>
                        {l.explicacao ? ` — ${l.explicacao}` : ''}
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
    </>
  );
}

// ════════════════════════════════════════════════════════════
export default function RateioProduto() {
  const [modo, setModo] = useState('categoria');

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title uppercase">Rateio de custos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Onde o custo se forma — e de onde vem cada número. Passe o mouse em qualquer valor.
          </p>
        </div>
      </div>

      <div className="flex gap-1.5">
        {[
          { v: 'categoria', t: 'Por categoria', i: FolderTree },
          { v: 'produto',   t: 'Por produto',   i: Package },
        ].map(o => (
          <button key={o.v} onClick={() => setModo(o.v)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
              modo === o.v ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
            <o.i size={15} /> {o.t}
          </button>
        ))}
      </div>

      {modo === 'categoria' ? <VistaCategoria /> : <VistaProduto />}
    </div>
  );
}
