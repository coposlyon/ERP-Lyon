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
//
// ESTA TELA FALA A LÍNGUA DA LOJA (.lj): creme, carvão e um laranja só,
// os mesmos da página inicial. Antes ela era Tailwind cru — `bg-white`,
// `text-gray-900` — e parecia uma tela de sistema colada no meio do
// site: fundo branco de recorte quadrado no creme, tipografia de painel
// administrativo e o campo de quantidade nativo do navegador, com as
// setinhas. Quem vinha da home sentia que tinha saído do site.
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Check, ShoppingCart, Minus, Plus, PenTool, Truck, ShieldCheck, Package } from 'lucide-react';
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

  // A faixa de preço que vale para a quantidade atual — destacada na
  // tabela, para o cliente ver que comprar mais barateia.
  const faixaAtiva = (t) => qty >= (Number(t.min_qty) || 0)
    && (t.max_qty == null || t.max_qty === '' || qty <= Number(t.max_qty));

  if (isLoading) {
    return (
      <div className="lj-env" style={{ padding: '120px 0', textAlign: 'center', color: 'var(--cinza)' }}>
        Carregando...
      </div>
    );
  }
  if (error || !product) {
    return (
      <div className="lj-env" style={{ padding: '120px 0', textAlign: 'center' }}>
        <p style={{ color: 'var(--cinza)' }}>Produto não encontrado.</p>
        <Link to="/loja" className="lj-btn laranja" style={{ marginTop: 18 }}>Voltar à loja</Link>
      </div>
    );
  }

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

  const semPreco = !(unitPrice > 0);

  return (
    <div className="lj-env lj-prod">
      <Link to="/loja" className="lj-prod-voltar">
        <ArrowLeft size={15} /> Voltar ao catálogo
      </Link>

      <div className="lj-prod-grade">
        {/* ── O copo ─────────────────────────────────────── */}
        <div className="lj-prod-palco">
          {productImg && !imgError ? (
            <img key={productImg} src={productImg} alt={product.name}
              onError={() => setImgError(true)} className="lj-prod-foto" />
          ) : (
            <div key={currentColor?.id || 'base'} className="st-color-in">
              <Bottle color={bodyHex} gradient={gradient} size={260} />
            </div>
          )}

          <a href="/catalogo" className="lj-prod-selo">
            <PenTool size={15} /> Quero personalizado
          </a>
        </div>

        {/* ── A compra ───────────────────────────────────── */}
        <div className="lj-prod-painel">
          {product.category && <span className="lj-olho">{product.category}</span>}
          <h1 className={`lj-prod-titulo ${isFetching ? 'trocando' : ''}`}>{product.name}</h1>
          {product.description && <p className="lj-sub" style={{ marginTop: 10 }}>{product.description}</p>}

          <div className="lj-prod-preco">
            <span className="rot">{table.tiers?.length ? 'a partir de' : 'preço unitário'}</span>
            {semPreco ? (
              <b className="valor combinar">Sob consulta</b>
            ) : (
              <b className="valor">{fmt(unitPrice)}</b>
            )}
            {minQty > 1 && <span className="min">a partir de {minQty} unidades</span>}
          </div>

          {/* Cores do modelo — cada cor é um produto do mesmo grupo */}
          {colorOptions.length > 1 && (
            <div className="lj-prod-bloco">
              <div className="lj-prod-rotulo">
                <span>Cor</span>
                {currentColor && <b>{currentColor.short}</b>}
                <i>{colorOptions.length} disponíveis</i>
              </div>
              <div className="lj-prod-cores">
                {colorOptions.map(c => {
                  const hex = resolveColor({ name: c.short, value: c.short });
                  const active = c.id === id;
                  return (
                    <button key={c.id} title={c.short} aria-label={c.short} aria-pressed={active}
                      onClick={() => { if (!active) navigate(`/loja/produto/${c.id}`); }}
                      className={`lj-prod-cor ${active ? 'on' : ''}`}
                      style={{
                        background: hex,
                        boxShadow: needsBorder(hex) ? 'inset 0 0 0 1px rgba(26,22,20,.18)' : 'none',
                      }}>
                      {active && <Check size={15} strokeWidth={3} color={needsBorder(hex) ? '#1A1614' : '#fff'} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Faixas de preço — comprar mais custa menos, e dá para ver */}
          {table.tiers?.length > 0 && (
            <div className="lj-prod-bloco">
              <div className="lj-prod-rotulo"><span>Preço por quantidade</span></div>
              <div className="lj-prod-faixas">
                {table.tiers.map((t, i) => (
                  <button key={i} type="button" className={`fx ${faixaAtiva(t) ? 'on' : ''}`}
                    onClick={() => setQty(Math.max(minQty, Number(t.min_qty) || minQty))}>
                    <span>{t.min_qty}{t.max_qty ? `–${t.max_qty}` : '+'} un</span>
                    <b>{fmt(t.price)}</b>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Quantidade + total */}
          <div className="lj-prod-compra">
            <div>
              <div className="lj-prod-rotulo"><span>Quantidade</span></div>
              <div className="lj-prod-qtd">
                <button onClick={() => setQty(q => Math.max(minQty, q - minQty))} aria-label="Diminuir">
                  <Minus size={15} />
                </button>
                {/* Campo de texto, não `number`: o input nativo traz as
                    setinhas do navegador, que no tema escuro do sistema
                    vinham como uma caixa preta no meio do site creme. */}
                <input type="text" inputMode="numeric" value={qty}
                  onChange={e => {
                    const n = parseInt(String(e.target.value).replace(/\D/g, ''), 10);
                    setQty(Number.isFinite(n) ? n : '');
                  }}
                  onBlur={() => setQty(q => (Number(q) >= minQty ? Number(q) : minQty))}
                  aria-label="Quantidade" />
                <button onClick={() => setQty(q => (Number(q) || 0) + minQty)} aria-label="Aumentar">
                  <Plus size={15} />
                </button>
              </div>
              {minQty > 1 && <p className="lj-prod-min">Pedido mínimo: {minQty} un.</p>}
            </div>

            <div className="lj-prod-total">
              <span>Total</span>
              <b>{semPreco ? '—' : fmt(unitPrice * (Number(qty) || 0))}</b>
            </div>
          </div>

          <div className="lj-prod-acoes">
            <button onClick={addToCart} className="lj-btn laranja">
              <ShoppingCart size={17} /> Adicionar ao carrinho
            </button>
            <button onClick={() => { addToCart(); navigate('/loja/carrinho'); }} className="lj-btn">
              <Check size={17} /> Pedir agora
            </button>
          </div>

          <p className="lj-prod-nota">
            Este é o copo liso, sem impressão. Ao pedir, você recebe um orçamento sem compromisso.
          </p>

          {/* A ponte para o outro caminho. Quem chegou aqui querendo o copo
              com nome e data precisa saber que isso existe — e onde. */}
          <a href="/catalogo" className="lj-prod-ponte">
            <PenTool size={18} />
            <span>
              <b>Quer com personalização?</b>
              No Catálogo de Produtos Personalizados você escolhe o acabamento, monta a arte com
              nomes e data e vê o copo pronto antes de fechar.
            </span>
          </a>
        </div>

        {/* Os três motivos que o cliente pergunta antes de fechar.
            No celular eles vêm DEPOIS do botão: quem abriu no telefone
            quer ver preço e comprar, não rolar 500px de selo até achar
            o valor. No computador o CSS devolve o bloco para baixo do
            copo, onde sobra espaço. */}
        <div className="lj-prod-garantias">
          <div><Package size={16} /><span>Caixa fechada, direto da fábrica</span></div>
          <div><Truck size={16} /><span>Frete calculado pelo seu estado</span></div>
          <div><ShieldCheck size={16} /><span>Orçamento sem compromisso</span></div>
        </div>
      </div>
    </div>
  );
}
