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

export default function ProductPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { add } = useCart();
  const [selVariant, setSelVariant] = useState(null);
  const [qty, setQty] = useState(1);

  const { data: product, isLoading, error } = useQuery({
    queryKey: ['store-product', id],
    queryFn: () => storeApi.get(`/products/${id}`),
    retry: false,
  });

  useEffect(() => {
    if (product?.variants?.length && !selVariant) setSelVariant(product.variants[0]);
  }, [product, selVariant]);

  const gradient = /degrad/i.test(product?.name || '');
  const bottleColor = selVariant ? resolveColor(selVariant) : '#F26522';

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return precoFaixa(product.price_tiers, product.sale_price, qty) + (Number(selVariant?.extra_price) || 0);
  }, [product, qty, selVariant]);

  if (isLoading) return <div className="max-w-6xl mx-auto px-4 py-16 text-center text-gray-400">Carregando...</div>;
  if (error || !product) return (
    <div className="max-w-6xl mx-auto px-4 py-16 text-center">
      <p className="text-gray-500">Produto não encontrado.</p>
      <Link to="/loja" className="text-orange-600 font-semibold mt-2 inline-block">Voltar à loja</Link>
    </div>
  );

  function addToCart() {
    add({
      product_id: product.id,
      product_name: product.name,
      color: selVariant?.name || null,
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
        <div className="bg-white rounded-2xl border border-gray-100 flex items-center justify-center py-12">
          <Bottle color={bottleColor} gradient={gradient} size={230} />
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

          {/* Faixas de preço */}
          {product.price_tiers?.length > 0 && (
            <div className="mt-6 bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Preço por quantidade</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
                {product.price_tiers.map((t, i) => (
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
            <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden">
              <button onClick={() => setQty(q => Math.max(1, q - 1))} className="px-3 py-3 hover:bg-gray-50"><Minus size={15} /></button>
              <input type="number" min="1" value={qty} onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 text-center font-bold outline-none" />
              <button onClick={() => setQty(q => q + 1)} className="px-3 py-3 hover:bg-gray-50"><Plus size={15} /></button>
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
