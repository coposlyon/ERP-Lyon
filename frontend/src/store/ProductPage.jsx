// ============================================================
// O PRODUTO NA LOJA — COPO LISO.
//
// A loja vende o copo como ele sai do molde: modelo, cor, quantidade.
// Sem arte, sem impressão, sem editor. Quem quer o copo com nome, data
// ou logo vai para o Catálogo de Produtos Personalizados, que é onde o
// gabarito, as artes e a aprovação de arte existem.
//
// POR QUE SEPARAR. Personalização exige gabarito, tinta compatível com
// o material, aprovação e prazo de produção. Misturar isso com a
// compra de caixa fechada fazia a mesma tela responder duas perguntas
// diferentes — e a resposta ficava pior para as duas.
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ShoppingCart, Minus, Plus, PenTool } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { useCart } from './CartContext';
import { resolveColor, needsBorder } from './colors';
import { shortColor } from './productMeta';

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
  const [qty, setQty] = useState(1);
  const [imgError, setImgError] = useState(false);

  const { data: product, isLoading, isFetching, error } = useQuery({
    queryKey: ['store-product', id],
    queryFn: () => storeApi.get(`/products/${id}`),
    retry: false,
    // mantém o produto anterior na tela enquanto busca o da nova cor —
    // sem isso a página inteira vira "Carregando..." a cada troca
    placeholderData: prev => prev,
  });

  const minQty = Math.max(1, product?.min_order_qty || 1);

  useEffect(() => { if (product) setQty(q => Math.max(q, minQty)); }, [product, minQty]);
  useEffect(() => { setImgError(false); }, [id]);

  const gradient = /degrad/i.test(product?.name || '');
  // foto: foto principal → qualquer foto que o produto tenha (compatível com cadastros antigos)
  const anyImg = product?.image_url
    || (product?.variation_images && Object.values(product.variation_images).find(Boolean))
    || (product?.variations?.images && Object.values(product.variations.images).find(Boolean))
    || null;
  const productImg = anyImg;
  // O preço do copo liso é a tabela do próprio produto, sem tabela de
  // impressão por cima: aqui não existe impressão.
  const table = { tiers: product?.price_tiers || [], base: product?.sale_price };
  // Cores do modelo (produtos irmãos do mesmo store_group)
  const colorOptions = useMemo(
    () => (product?.color_options || []).map(c => ({ ...c, short: shortColor(c.label, product?.group) })),
    [product]);
  // usa o id da URL (muda na hora do clique) → a cor troca antes da resposta chegar
  const currentColor = colorOptions.find(c => c.id === id)
    || colorOptions.find(c => c.id === product?.id) || null;

  const unitPrice = useMemo(() => {
    if (!product) return 0;
    return precoFaixa(table.tiers, table.base, qty);
  }, [product, qty]); // eslint-disable-line

  // cor da variante escolhida; se não houver grupo de cores, tenta pelo
  // nome do produto (ex.: "... AZUL BIC ...") antes do padrão.
  const bodyHex = currentColor
    ? resolveColor({ name: currentColor.short, value: currentColor.short })
    : resolveColor({ name: product?.color_label || product?.name, value: product?.color_label });

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
      color: currentColor?.short || product.color_label || null,
      unit_price: unitPrice,
      quantity: qty,
      min_order_qty: minQty,
    });
    toast.success('Adicionado ao carrinho!');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to="/loja" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 mb-6">
        <ArrowLeft size={15} /> Voltar ao catálogo
      </Link>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Visual — foto real ou desenho 3D */}
        {/* Card branco e parado: sem os blobs de fundo e sem o copo flutuando */}
        <div className="relative rounded-3xl overflow-hidden flex items-center justify-center py-16 bg-white border border-gray-200">
          {productImg && !imgError ? (
            <img key={productImg} src={productImg} alt={product.name}
              onError={() => setImgError(true)}
              className="relative z-10 max-h-[360px] w-auto object-contain drop-shadow-xl" />
          ) : (
            <div key={currentColor?.id || 'base'} className="relative st-color-in">
              <Bottle color={bodyHex} gradient={gradient} size={240} />
            </div>
          )}

          <a href="/catalogo"
            className="absolute bottom-3 right-3 z-20 flex items-center gap-1.5 bg-gray-900/90 hover:bg-gray-900 text-white text-sm font-semibold px-3.5 py-2 rounded-xl shadow-lg backdrop-blur transition-colors">
            <PenTool size={16} /> Quero personalizado
          </a>
        </div>

        {/* Info */}
        <div>
          {product.category && <span className="text-xs text-orange-500 font-semibold uppercase tracking-wide">{product.category}</span>}
          <h1 className={`text-3xl font-extrabold text-gray-900 mt-1 transition-opacity duration-200 ${isFetching ? 'opacity-50' : ''}`}>
            {product.name}
          </h1>
          {product.description && <p className="text-gray-500 mt-2">{product.description}</p>}

          <div className="mt-4">
            <p className="text-sm text-gray-400">{product.price_tiers?.length ? 'a partir de' : 'preço unitário'}</p>
            <p className="text-3xl font-extrabold text-gray-900">{fmt(unitPrice)}</p>
          </div>

          {/* Cores do modelo — cada cor é um produto do mesmo grupo */}
          {colorOptions.length > 1 && (
            <div className="mt-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Cor {currentColor && <span className="text-gray-900 normal-case font-bold">· {currentColor.short}</span>}
                <span className="text-gray-400 font-normal normal-case"> ({colorOptions.length} disponíveis)</span>
              </p>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map(c => {
                  const hex = resolveColor({ name: c.short, value: c.short });
                  const active = c.id === id;
                  return (
                    <button key={c.id} title={c.short}
                      onClick={() => { if (!active) navigate(`/loja/produto/${c.id}`); }}
                      className={`w-10 h-10 rounded-full transition-transform hover:scale-110 ${
                        active ? 'ring-2 ring-offset-2 ring-orange-500 scale-110' : ''}`}
                      style={{
                        background: hex,
                        border: needsBorder(hex) ? '1px solid #D8DCE2' : '1px solid rgba(0,0,0,.08)',
                      }} />
                  );
                })}
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
                <button onClick={() => setQty(q => Math.max(minQty, q - minQty))} className="px-3 py-3 hover:bg-gray-50"><Minus size={15} /></button>
                <input type="number" min={minQty} step={minQty} value={qty}
                  onChange={e => setQty(Math.max(1, parseInt(e.target.value) || 1))}
                  onBlur={e => { if ((parseInt(e.target.value) || 0) < minQty) setQty(minQty); }}
                  className="w-20 text-center font-bold outline-none" />
                <button onClick={() => setQty(q => q + minQty)} className="px-3 py-3 hover:bg-gray-50"><Plus size={15} /></button>
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
            Este é o copo liso, sem impressão. Ao pedir, você recebe um orçamento sem compromisso.
          </p>

          {/* A ponte para o outro caminho. Quem chegou aqui querendo o copo
              com nome e data precisa saber que isso existe — e onde. */}
          <a href="/catalogo"
            className="mt-4 flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-3.5 hover:bg-violet-100 transition-colors">
            <PenTool size={18} className="text-violet-600 shrink-0 mt-0.5" />
            <span>
              <span className="block font-semibold text-sm text-violet-900">Quer com personalização?</span>
              <span className="block text-xs text-violet-700 mt-0.5">
                No Catálogo de Produtos Personalizados você escolhe o acabamento, monta a arte com
                nomes e data e vê o copo pronto antes de fechar.
              </span>
            </span>
          </a>
        </div>
      </div>
    </div>
  );
}
