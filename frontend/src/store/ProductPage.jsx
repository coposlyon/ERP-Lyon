import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ShoppingCart, Minus, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { resolveColor, needsBorder } from './colors';
import { useCart } from './CartContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

function precoFaixa(tiers, salePrice, qty) {
  let price = Number(salePrice) || 0;
  for (const t of tiers || []) {
    const min = Number(t.min_qty) || 0;
    const max = (t.max_qty == null || t.max_qty === '') ? Infinity : Number(t.max_qty);
    if (qty >= min && qty <= max) price = Number(t.price) || price;
  }
  return price;
}

// tabela do tipo de impressão escolhido (price/tiers) ou a padrão do produto
function methodTable(product, method) {
  const m = method && product?.print_pricing?.[method];
  if (m && (m.price != null || (Array.isArray(m.tiers) && m.tiers.length))) {
    return { tiers: m.tiers || [], base: m.price != null ? m.price : product.sale_price };
  }
  return { tiers: product?.price_tiers || [], base: product?.sale_price };
}
function availableMethods(product) {
  return (product?.print_methods || []).filter(m => {
    const d = product?.print_pricing?.[m.key];
    return d && (d.price != null || (Array.isArray(d.tiers) && d.tiers.length));
  });
}

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const [selVariant, setSelVariant] = useState(null);
  const [printMethod, setPrintMethod] = useState(null);
  const [qty, setQty] = useState(1);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['store-product', id],
    queryFn: () => storeApi.get(`/products/${id}`),
    retry: false,
  });

  const minQty = Math.max(1, product?.min_order_qty || 1);

  useEffect(() => {
    if (product?.variants?.length && !selVariant) setSelVariant(product.variants[0]);
  }, [product, selVariant]);

  // ao carregar o produto, garante a quantidade mínima do pedido
  useEffect(() => {
    if (product) setQty(q => Math.max(q, minQty));
  }, [product, minQty]);

  // seleciona o primeiro tipo de impressão disponível
  useEffect(() => {
    if (!product) return;
    const avail = availableMethods(product);
    if (avail.length) setPrintMethod(prev => prev || avail[0].key);
  }, [product]);

  const gradient = /degrad/i.test(product?.name || '');
  const bottleColor = selVariant ? resolveColor(selVariant) : '#F26522';
  const methods = availableMethods(product);
  const table = methodTable(product, printMethod);

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return precoFaixa(table.tiers, table.base, qty) + (Number(selVariant?.extra_price) || 0);
  }, [product, qty, selVariant, printMethod]); // eslint-disable-line

  if (isLoading) return <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-400">Carregando...</div>;
  if (error || !product) return (
    <div className="max-w-6xl mx-auto px-4 py-16 text-center">
      <p className="text-gray-500">Produto não encontrado.</p>
      <Link to="/loja" className="text-orange-600 font-semibold mt-2 inline-block">Voltar à loja</Link>
    </div>
  );

  function addToCart() {
    const methodLabel = methods.find(m => m.key === printMethod)?.label;
    add({
      product_id: product.id,
      product_name: product.name,
      color: selVariant?.name || null,
      print_method: printMethod || null,
      print_name: methodLabel || null,
      unit_price: unitPrice,
      quantity: qty,
    });
    toast.success('Adicionado ao carrinho!');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to="/loja" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 mb-6">
        <ArrowLeft size={15} /> Voltar ao catálogo
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Visual */}
        <div className="relative rounded-3xl overflow-hidden flex items-center justify-center py-16 bg-gray-900">
          <div className="st-blob" style={{ width: 240, height: 240, background: bottleColor, top: '8%', left: '6%', opacity: .5 }} />
          <div className="st-blob" style={{ width: 200, height: 200, background: bottleColor, bottom: '4%', right: '8%', opacity: .35, animationDelay: '3s' }} />
          <div className="relative st-float">
            <Bottle color={bottleColor} gradient={gradient} size={240} />
          </div>
        </div>

        {/* Info */}
        <div>
          {product.category && <span className="text-xs text-orange-500 font-semibold uppercase tracking-wide">{product.category}</span>}
          <h1 className="text-3xl font-extrabold text-gray-900 mt-1">{product.name}</h1>
          {product.description && <p className="text-gray-500 mt-2">{product.description}</p>}

          <div className="mt-4">
            <p className="text-sm text-gray-400">{product.price_tiers?.length ? 'a partir de' : 'preço unitário'}</p>
            <p className="text-3xl font-extrabold text-gray-900">{fmt(unitPrice)}</p>
          </div>

          {/* Cores */}
          {product.variants?.length > 0 && (
            <div className="mt-6">
              <p className="text-sm font-semibold text-gray-700 mb-2">
                Cor: <span className="text-gray-500 font-normal">{selVariant?.name}</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map(v => {
                  const c = resolveColor(v);
                  const active = selVariant?.id === v.id;
                  return (
                    <button key={v.id} onClick={() => setSelVariant(v)} title={v.name}
                      className={`w-9 h-9 rounded-full transition-transform ${active ? 'ring-2 ring-orange-500 ring-offset-2 scale-110' : 'hover:scale-105'}`}
                      style={{ background: c, border: needsBorder(c) ? '1px solid #D8DCE2' : 'none' }} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Tipo de impressão */}
          {methods.length > 0 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Tipo de impressão</p>
              <div className="flex flex-wrap gap-2">
                {methods.map(m => (
                  <button key={m.key} onClick={() => setPrintMethod(m.key)}
                    className={`px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${printMethod === m.key ? 'border-orange-500 bg-orange-50 text-orange-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Faixas de preço */}
          {table.tiers?.length > 0 && (
            <div className="mt-6 bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preço por quantidade</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {table.tiers.map((t, i) => (
                  <div key={i} className={`rounded-lg px-3 py-2 ${qty >= (t.min_qty||0) && (t.max_qty==null || qty <= t.max_qty) ? 'bg-orange-100 text-orange-800 font-semibold' : 'bg-white border border-gray-100'}`}>
                    <p className="text-xs text-gray-500">{t.min_qty}{t.max_qty ? `–${t.max_qty}` : '+'} un</p>
                    <p className="font-bold">{fmt(t.price)}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quantidade + adicionar */}
          <div className="mt-6 flex items-center gap-3">
            <div className="flex flex-col">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
                <button onClick={() => setQty(q => Math.max(minQty, q - 1))} className="px-3 py-3 hover:bg-gray-50"><Minus size={15} /></button>
                <input type="number" min={minQty} value={qty} onChange={e => setQty(Math.max(minQty, parseInt(e.target.value) || minQty))}
                  className="w-16 text-center font-bold outline-none" />
                <button onClick={() => setQty(q => q + 1)} className="px-3 py-3 hover:bg-gray-50"><Plus size={15} /></button>
              </div>
              {minQty > 1 && <p className="text-[11px] text-orange-600 mt-1">Pedido mínimo: {minQty} un.</p>}
            </div>
            <div className="flex-1">
              <p className="text-xs text-gray-400">Total</p>
              <p className="text-xl font-extrabold text-gray-900">{fmt(unitPrice * qty)}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button onClick={addToCart}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
              <ShoppingCart size={18} /> Adicionar ao carrinho
            </button>
            <button onClick={() => { addToCart(); navigate('/loja/carrinho'); }}
              className="bg-gray-900 hover:bg-gray-800 text-white font-semibold px-5 rounded-xl flex items-center gap-2 transition-colors">
              <Check size={18} /> Pedir
            </button>
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Ao pedir, você recebe um orçamento sem compromisso. Personalização e formas de pagamento são combinadas com nossa equipe.
          </p>
        </div>
      </div>
    </div>
  );
}
