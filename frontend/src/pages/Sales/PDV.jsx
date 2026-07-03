import { useState, useRef, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Trash2, ShoppingCart, User, Check, Loader2, X, ChevronLeft, ChevronRight, Truck, Star, Plus, MoreHorizontal, MessageCircle } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { expandVariants, expandVariantsWithCode } from '@/pages/Products/ProductVariantsModal';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

// Dinheiro digitado no padrão BR: "40" → 40, "100,5" → 100.5, "1.234,56" → 1234.56
function parseMoney(s) {
  const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}
// Formata para exibir no campo: 40 → "40,00" | 100 → "100,00"
function maskMoney(n) {
  return (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const todayISO = () => new Date().toISOString().split('T')[0];

// Link para chamar o cliente no WhatsApp (DDI 55 automático)
function waLink(phone, name) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const full = (digits.startsWith('55') ? '' : '55') + digits;
  return `https://wa.me/${full}?text=${encodeURIComponent(`Olá ${name || ''}, tudo bem?`)}`;
}

// Botão que aplica o passo no clique e, segurando, repete bem rápido
function HoldBtn({ onStep, title, children, className }) {
  const t = useRef(null);
  const iv = useRef(null);
  const stop = () => { clearTimeout(t.current); clearInterval(iv.current); };
  useEffect(() => stop, []);
  return (
    <button type="button" title={title} className={className}
      onPointerDown={(e) => { e.preventDefault(); onStep(); t.current = setTimeout(() => { iv.current = setInterval(onStep, 110); }, 350); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop}
      onContextMenu={e => e.preventDefault()}>
      {children}
    </button>
  );
}

// Preço oficial pela quantidade: faixa (price_tiers) ou preço de venda.
// O backend recalcula do lado dele — isso aqui é para a UI mostrar certo.
function tierPrice(tiers, salePrice, qty) {
  let price = Number(salePrice) || 0;
  for (const t of tiers || []) {
    const min = Number(t.min_qty) || 0;
    const max = (t.max_qty == null || t.max_qty === '') ? Infinity : Number(t.max_qty);
    if (qty >= min && qty <= max) price = Number(t.price) || price;
  }
  return price;
}

export default function PDV({ onDone }) {
  const inModal = typeof onDone === 'function';
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState(''); // filtro por tipo (categoria) do produto
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discount, setDiscount] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState(null); // { coupon_id, code, discount_type, discount_value }
  const [frete, setFrete] = useState(null); // { price, days, weightKg, uf }
  const [carrierId, setCarrierId] = useState(''); // transportadora desta venda
  const [freightInput, setFreightInput] = useState(''); // valor do frete (R$) — editável
  const [quoteNumber, setQuoteNumber] = useState(''); // nº da cotação do frete na transportadora
  const [payTerm, setPayTerm] = useState(null); // condição de pagamento { label, percent }
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [operationDate, setOperationDate] = useState(todayISO);
  // As demais datas já nascem com a data da operação — assim o ano (e o dd/mm)
  // vêm preenchidos e o operador só ajusta o dia/mês que precisar.
  const [eventDate, setEventDate] = useState(todayISO);
  const [shipDate, setShipDate] = useState(todayISO);
  const [deliveryDate, setDeliveryDate] = useState(todayISO);

  // Mudou a data da operação → replica o ano dela nas outras datas
  function changeOperationDate(v) {
    setOperationDate(v);
    const y = String(v || '').slice(0, 4);
    if (/^\d{4}$/.test(y)) {
      const withYear = iso => (iso ? `${y}${iso.slice(4)}` : iso);
      setEventDate(withYear);
      setShipDate(withYear);
      setDeliveryDate(withYear);
    }
  }
  const [showCustomerInfo, setShowCustomerInfo] = useState(false);
  // Chave aleatória de até 5 dígitos para o pedido
  const genKey = () => String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  const [orderKey, setOrderKey] = useState(genKey);
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const searchRef = useRef();

  // Carrega todos os produtos ativos (o backend já devolve em ordem alfabética)
  // para mostrar a lista completa ao abrir, e filtra no cliente conforme digita.
  const { data: allProducts } = useQuery({
    queryKey: ['pdv-all-products'],
    queryFn: () => api.get('/products?limit=2000&is_active=true'),
  });

  const productList = useMemo(() => {
    let arr = [...(allProducts?.data || [])].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    // filtro por tipo (categoria): COM BORDA, DEGRADÊ, TRADICIONAL etc.
    if (typeFilter) arr = arr.filter(p => (p.CATEGORIAS?.name || '').trim().toUpperCase() === typeFilter);
    const term = productSearch.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      String(p.code || '').toLowerCase().includes(term)
    );
  }, [allProducts, productSearch, typeFilter]);

  const { data: customerResults } = useQuery({
    queryKey: ['pdv-customers', customerSearch],
    queryFn: () => api.get(`/customers?search=${encodeURIComponent(customerSearch.trim())}&limit=8&is_active=true`),
    enabled: customerSearch.trim().length >= 1,
  });

  // Últimos 50 clientes cadastrados — aparecem ao clicar no campo (sem digitar)
  const [custFocus, setCustFocus] = useState(false);
  const { data: recentCustomers } = useQuery({
    queryKey: ['pdv-customers-recent'],
    queryFn: () => api.get('/customers?limit=50&sort=recent&is_active=true&type=cliente'),
  });

  // Transportadoras cadastradas — escolhida após selecionar o cliente
  const { data: carriers } = useQuery({
    queryKey: ['carriers'],
    queryFn: () => api.get('/shipping/carriers'),
    enabled: !!selectedCustomer,
  });

  // Tipos (categorias) de produto — para o filtro do painel de produtos
  const { data: productTypes = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  // Condições de pagamento (desconto/juros) configuradas em Configurações → Pagamento
  const { data: payTermsData } = useQuery({
    queryKey: ['payment-terms'],
    queryFn: () => api.get('/sales/payment-terms'),
  });
  const payTerms = payTermsData?.data || [];

  const saleMutation = useMutation({
    mutationFn: (data) => api.post('/sales', data),
    onSuccess: async (sale) => {
      // Consome o cupom (1 uso) vinculado a esta venda
      if (coupon?.coupon_id) {
        await api.post('/coupons/redeem', {
          coupon_id: coupon.coupon_id, customer_id: selectedCustomer?.id || null,
          sale_id: sale?.id || null, discount: couponDiscount,
        }).catch(() => {});
      }
      toast.success('Venda finalizada com sucesso!');
      setItems([]);
      setSelectedCustomer(null);
      setShowCustomerInfo(false);
      setDiscount('');
      setCoupon(null); setCouponInput('');
      setFrete(null);
      setCarrierId(''); setFreightInput(''); setQuoteNumber('');
      setPayTerm(null);
      setReceivedAmount('');
      setEventDate(todayISO()); setShipDate(todayISO()); setDeliveryDate(todayISO());
      setOrderKey(genKey());
      if (inModal) { onDone(); return; } // fecha o card e atualiza a lista
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (err) => toast.error(err.error || 'Erro ao finalizar venda'),
  });

  // Calcular frete + prazo pelo estado/CEP do cliente
  const freteMut = useMutation({
    mutationFn: () => api.post('/shipping/quote', {
      uf: selectedCustomer?.address?.state || null,
      cep: selectedCustomer?.address?.zip || null,
      qty: items.reduce((s, i) => s + i.quantity, 0),
      subtotal,
    }),
    onSuccess: (data) => {
      setFrete(data);
      setFreightInput(data.free || !data.price ? '' : maskMoney(data.price));
      // sugere a previsão de entrega = hoje + prazo
      if (data.days && !deliveryDate) {
        const d = new Date(); d.setDate(d.getDate() + Number(data.days));
        setDeliveryDate(d.toISOString().split('T')[0]);
      }
    },
    onError: (e) => { setFrete(null); toast.error(e.error || 'Não foi possível calcular o frete'); },
  });

  // Aplicar cupom — valida no servidor (data, limite, cliente) e guarda o cupom
  const couponMut = useMutation({
    mutationFn: () => api.post('/coupons/validate', {
      code: couponInput, total: subtotal, customer_id: selectedCustomer?.id || null,
    }),
    onSuccess: (data) => { setCoupon(data); toast.success(`Cupom ${data.code} aplicado!`); },
    onError: (e) => { setCoupon(null); toast.error(e.error || 'Cupom inválido'); },
  });

  // Modelo cujas variações estão sendo exibidas (drill-down). null = lista de modelos.
  const [drill, setDrill] = useState(null);

  // Card grande de produtos (abre pelo botão ADICIONAR PRODUTOS)
  const [productsOpen, setProductsOpen] = useState(false);
  // Horários de coleta da transportadora (abrem pelo ⋯)
  const [showSched, setShowSched] = useState(false);

  // ESC fecha primeiro o card de produtos (antes de fechar a tela toda)
  useEffect(() => {
    if (!productsOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setProductsOpen(false); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [productsOpen]);

  // Variações reais do modelo em drill (com código), filtradas pela busca
  const variantList = useMemo(() => {
    if (!drill) return [];
    const all = expandVariantsWithCode(drill);
    const term = productSearch.trim().toLowerCase();
    if (!term) return all;
    return all.filter(x => x.name.toLowerCase().includes(term) || x.code.toLowerCase().includes(term));
  }, [drill, productSearch]);

  // Adiciona um item ao carrinho. variantName != null → variação específica.
  function pushItem(product, variantName, variantCode) {
    const key = `${product.id}__${variantName || ''}`;
    setItems(prev => {
      const existing = prev.find(i => `${i.product_id}__${i.variant || ''}` === key);
      if (existing) {
        return prev.map(i => {
          if (`${i.product_id}__${i.variant || ''}` !== key) return i;
          const qty = i.quantity + 1;
          return { ...i, quantity: qty, unit_price: i.priceTouched ? i.unit_price : tierPrice(i.price_tiers, i.sale_price, qty) };
        });
      }
      return [...prev, {
        product_id: product.id,
        variant: variantName || null,
        variant_code: variantCode || null,
        name: variantName || product.name,
        unit: product.unit,
        sale_price: product.sale_price,
        price_tiers: product.price_tiers || [],
        unit_price: tierPrice(product.price_tiers, product.sale_price, 1),
        quantity: 1,
        discount: 0,
        priceTouched: false,
      }];
    });
  }

  // Clicou num modelo: se tem variações, abre a lista delas; senão adiciona direto.
  function pickProduct(product) {
    if (expandVariants(product).length > 1) {
      setDrill(product);
      setProductSearch('');
      setTimeout(() => searchRef.current?.focus(), 30);
      return;
    }
    addProduct(product);
  }

  function addProduct(product) {
    setProductSearch('');
    pushItem(product, null);
    toast.success(`${product.name} adicionado`, { duration: 1200 });
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  // Adiciona a variação escolhida; permanece no drill p/ adicionar mais do mesmo modelo.
  function addVariant(variant) {
    if (!drill) return;
    pushItem(drill, variant.name, variant.code);
    toast.success(`${variant.name} adicionado`, { duration: 1200 });
    setProductSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  }

  function backToModels() {
    setDrill(null);
    setProductSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  }

  // Enter NÃO adiciona mais nada automaticamente — o operador escolhe clicando no produto
  function handleProductKeyDown(e) {
    if (e.key === 'Enter') e.preventDefault();
  }

  function setQty(idx, val) {
    const q = parseFloat(val);
    if (isNaN(q) || q <= 0) return;
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      return {
        ...item,
        quantity: q,
        // reaplica a faixa de preço automaticamente, a menos que o
        // operador tenha editado o preço manualmente
        unit_price: item.priceTouched ? item.unit_price : tierPrice(item.price_tiers, item.sale_price, q),
      };
    }));
  }

  // Sobe/desce a quantidade em passos (ex.: ±10), sem deixar abaixo de 1
  function stepQty(idx, delta) {
    setItems(prev => prev.map((item, i) => {
      if (i !== idx) return item;
      const q = Math.max(1, (Number(item.quantity) || 0) + delta);
      return {
        ...item,
        quantity: q,
        unit_price: item.priceTouched ? item.unit_price : tierPrice(item.price_tiers, item.sale_price, q),
      };
    }));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  // Guarda o texto digitado (priceStr) e o número já convertido (unit_price)
  function updatePrice(idx, str) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, priceStr: str, unit_price: parseMoney(str), priceTouched: true } : item
    ));
  }

  // Ao sair do campo, formata com a pontuação (40 → 40,00)
  function blurPrice(idx) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, priceStr: undefined } : item
    ));
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const discountValue = parseMoney(discount);
  const couponDiscount = coupon
    ? (coupon.discount_type === 'percent'
        ? Math.min(subtotal, Math.round(subtotal * Number(coupon.discount_value)) / 100)
        : Math.min(subtotal, Number(coupon.discount_value)))
    : 0;
  const freteValue = parseMoney(freightInput);
  const goodsBase = subtotal - discountValue - couponDiscount;
  const payPercent = payTerm ? (Number(payTerm.percent) || 0) : 0;
  const paymentAdj = payTerm ? Math.round(goodsBase * payPercent) / 100 : 0; // − desconto / + juros
  const total = Math.max(0, goodsBase + paymentAdj + freteValue);
  const received = parseMoney(receivedAmount);
  const change = paymentMethod === 'cash' && received > 0 ? received - total : 0;

  function finalizeSale() {
    if (items.length === 0) { toast.error('Adicione ao menos um produto'); return; }
    if (!selectedCustomer) { toast.error('Selecione o cliente (obrigatório)'); return; }
    if (!operationDate) { toast.error('Informe a Data da operação'); return; }
    if (!eventDate) { toast.error('Informe a Data do evento'); return; }
    if (!shipDate) { toast.error('Informe a Data da saída'); return; }
    if (!deliveryDate) { toast.error('Informe a Previsão de entrega'); return; }
    if (paymentMethod === 'cash' && received > 0 && received < total) {
      toast.error(`Valor insuficiente! Faltam ${fmt(total - received)}`);
      return;
    }
    saleMutation.mutate({
      customer_id: selectedCustomer.id,
      type: 'sale',
      operation_date: operationDate || null,
      event_date: eventDate || null,
      ship_date: shipDate || null,
      delivery_date: deliveryDate || null,
      order_key: orderKey,
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount || 0,
        // guarda a variação escolhida (código + nome) no item da venda
        ...(i.variant ? { customization: { ...(i.variant_code ? { 'Código': i.variant_code } : {}), 'Variação': i.variant } } : {}),
      })),
      discount: discountValue + couponDiscount,
      coupon_code: coupon?.code || null,
      freight: freteValue,
      carrier_id: carrierId || null,
      payment_adjustment: paymentAdj,
      ...(() => {
        const noteParts = [];
        if (payTerm) noteParts.push(`Pagamento: ${payTerm.label}${payPercent ? ` (${payPercent > 0 ? '+' : ''}${payPercent}%)` : ''}`);
        if (quoteNumber.trim()) noteParts.push(`Cotação do frete: ${quoteNumber.trim()}`);
        return noteParts.length ? { notes: noteParts.join(' · ') } : {};
      })(),
      payment_method: paymentMethod,
      ...(paymentMethod === 'a_prazo' ? { installments, first_due_date: firstDueDate } : {}),
    });
  }

  // ── Painel de busca/lista de produtos (dentro do card ADICIONAR PRODUTOS) ──
  const ProductPanel = (
    <div className="flex flex-col overflow-hidden h-full border border-gray-100 rounded-xl">
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder={drill ? `Buscar variação de ${drill.name}...` : 'Buscar produto por nome ou código...'}
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            onKeyDown={handleProductKeyDown}
            className="input pl-9 text-base"
            autoFocus
          />
        </div>
        {/* Filtro por tipo: COM BORDA / DEGRADÊ / TRADICIONAL etc. */}
        {!drill && (
          <select className="input text-sm w-full mt-2" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">Todos os tipos</option>
            {productTypes.map(t => (
              <option key={t.id} value={String(t.name || '').trim().toUpperCase()}>
                {t.name}{t.product_count ? ` (${t.product_count})` : ''}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* a lista rola dentro do card */}
      <div className="flex-1 overflow-y-auto min-h-[200px]">
        {drill ? (
          <>
            <button type="button" onClick={backToModels}
              className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 sticky top-0 z-10 text-xs text-gray-600 hover:bg-gray-100 border-b border-gray-100">
              <span className="flex items-center gap-1"><ChevronLeft size={13} /> Voltar — <b className="ml-0.5">{drill.name}</b></span>
              <span>{variantList.length} variações</span>
            </button>
            {variantList.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4">Nenhuma variação encontrada.</p>
            ) : variantList.map((v, idx) => (
              <button key={idx} type="button" onClick={() => addVariant(v)}
                className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 && productSearch.trim() ? 'bg-blue-50/40' : ''}`}>
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0">{v.code}</span>
                  <span className="text-sm text-gray-800 leading-snug">{v.name}</span>
                </span>
                <span className="font-semibold text-primary-600 shrink-0">{fmt(drill.sale_price)}</span>
              </button>
            ))}
          </>
        ) : productList.length > 0 ? (
          <>
            <p className="text-[11px] text-gray-400 px-4 py-1.5 bg-gray-50 sticky top-0 z-10 flex justify-between">
              <span>{productSearch.trim() ? `${productList.length} encontrado(s)` : 'Todos os produtos (A–Z)'}</span>
              <span>{productList.length}</span>
            </p>
            {productList.map((p, idx) => {
              const nv = expandVariants(p).length;
              return (
                <button key={p.id} type="button" onClick={() => pickProduct(p)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 && productSearch.trim() ? 'bg-blue-50/40' : ''}`}>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm leading-snug">{p.name}</p>
                    <p className="text-xs text-gray-400">
                      Estoque: {p.current_stock}
                      {nv > 1 && <span className="ml-2 text-indigo-500 font-medium">{nv} variações</span>}
                    </p>
                  </div>
                  {nv > 1
                    ? <ChevronRight size={16} className="text-gray-300 shrink-0 ml-2" />
                    : <span className="font-semibold text-primary-600 shrink-0 ml-2">{fmt(p.sale_price)}</span>}
                </button>
              );
            })}
          </>
        ) : (
          <p className="text-sm text-gray-400 text-center py-8">Nenhum produto encontrado.</p>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* Linha compacta — data da operação, cliente, transportadora e frete */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[170px_minmax(0,1.1fr)_minmax(0,0.8fr)_130px_minmax(0,0.7fr)] gap-3 items-start">
          {/* Data da operação */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Data da operação *</label>
            <input type="date" className="input text-sm w-full" value={operationDate} onChange={e => changeOperationDate(e.target.value)} />
          </div>

          {/* Cliente */}
          <div className="relative min-w-0">
            <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><User size={12} /> Cliente *</label>
            {selectedCustomer ? (
              <div className="bg-primary-50 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap min-w-0">
                  {selectedCustomer.display_id != null && <span className="text-base font-mono font-bold bg-white text-primary-700 rounded-md px-2 py-0.5 shrink-0 border border-primary-200" title="ID do cliente">{selectedCustomer.display_id}</span>}
                  <p className="text-sm font-semibold text-primary-800 truncate">{selectedCustomer.name}</p>
                  <span className="flex items-center gap-0.5" title="Estrelas do cliente — para alterar, edite no cadastro de clientes">
                    {[1, 2, 3, 4, 5].map(n => (
                      <Star key={n} size={13} className={(selectedCustomer.rating || 0) >= n ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                    ))}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" onClick={() => setShowCustomerInfo(v => !v)} title="Ver todos os dados do cliente"
                    className="text-primary-500 hover:text-primary-700"><MoreHorizontal size={16} /></button>
                  <button onClick={() => { setSelectedCustomer(null); setShowCustomerInfo(false); }} className="text-primary-400 hover:text-red-500">
                    <X size={15} />
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Nome, ID ou telefone..."
                    value={customerSearch}
                    onChange={e => setCustomerSearch(e.target.value)}
                    onFocus={() => setCustFocus(true)}
                    onBlur={() => setTimeout(() => setCustFocus(false), 150)}
                    className="input text-sm pl-8 w-full"
                  />
                </div>
                {(() => {
                  const searching = customerSearch.trim().length >= 1;
                  const list = searching ? (customerResults?.data || []) : (custFocus ? (recentCustomers?.data || []) : []);
                  if (list.length === 0 && searching) return <p className="text-xs text-gray-400 mt-1">Nenhum cliente encontrado.</p>;
                  if (list.length === 0) return null;
                  return (
                    <div className="absolute left-0 right-0 z-20 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
                      {!searching && <p className="text-[11px] text-gray-400 px-3 py-1.5 bg-gray-50 sticky top-0">Últimos clientes cadastrados</p>}
                      {list.map(c => (
                        <button key={c.id} type="button"
                          onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustFocus(false); }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2">
                          {c.display_id != null && <span className="text-sm font-mono font-bold bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 shrink-0" title="ID do cliente">{c.display_id}</span>}
                          <span className="min-w-0">
                            <span className="font-medium block truncate">{c.name}</span>
                            <span className="text-xs text-gray-400">{c.cpf_cnpj || c.phone}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </>
            )}
          </div>

          {/* Transportadora */}
          <div className="min-w-0">
            <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1"><Truck size={12} /> Transportadora</label>
            <select className="input text-sm w-full" value={carrierId} onChange={e => { setCarrierId(e.target.value); setShowSched(false); }}>
              <option value="">— selecione —</option>
              {(carriers?.data || []).map(c => <option key={c.id} value={c.id}>{c.trade_name || c.name}</option>)}
            </select>
            {carrierId && (
              <button type="button" onClick={() => setShowSched(v => !v)} title="Horários de coleta"
                className="mt-1 text-gray-400 hover:text-primary-600 flex items-center gap-1 text-xs">
                <MoreHorizontal size={16} /> {showSched ? 'ocultar horários' : 'horários de coleta'}
              </button>
            )}
          </div>

          {/* Valor do frete */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Valor do frete (R$)</label>
            <input type="text" inputMode="decimal" className="input text-sm w-full" value={freightInput}
              onChange={e => setFreightInput(e.target.value.replace(/[^\d.,]/g, ''))}
              onBlur={() => { if (freightInput.trim() !== '') setFreightInput(maskMoney(parseMoney(freightInput))); }}
              placeholder="0,00" />
          </div>

          {/* Nº da cotação do frete */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">Número da Cotação</label>
            <input type="text" className="input text-sm w-full" value={quoteNumber}
              onChange={e => setQuoteNumber(e.target.value)} placeholder="ex.: 12345" />
          </div>
        </div>

        {!selectedCustomer && <p className="text-xs text-amber-600 mt-2">O cliente é obrigatório para o pedido.</p>}

        {/* Horários de coleta (abrem pelo ⋯ abaixo da transportadora) */}
        {carrierId && showSched && (() => {
          const c = (carriers?.data || []).find(x => x.id === carrierId);
          const sched = Array.isArray(c?.pickup_schedule) ? c.pickup_schedule : [];
          const DAY_LABELS = { seg: 'Seg', ter: 'Ter', qua: 'Qua', qui: 'Qui', sex: 'Sex', sab: 'Sáb', dom: 'Dom' };
          return (
            <div className="mt-2 text-xs bg-blue-50/60 border border-blue-100 rounded-lg px-3 py-2">
              <p className="font-semibold text-gray-700 mb-1">🕒 Horários de coleta — {c?.trade_name || c?.name || 'transportadora'}</p>
              {sched.length === 0 ? (
                <p className="text-gray-400">Nenhum horário de coleta cadastrado (cadastre em Logística → Transportadoras).</p>
              ) : (
                <ul className="space-y-0.5">
                  {sched.map((slot, i) => (
                    <li key={i} className="text-gray-600">
                      <b>{(slot.days || []).map(d => DAY_LABELS[d] || d).join(', ') || 'Todos os dias'}</b>
                      {slot.time && <span className="text-gray-500"> às {slot.time}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })()}

        {/* Dados completos do cliente (abrem pelo ⋯ ao lado do nome) */}
        {selectedCustomer && showCustomerInfo && (
          <div className="text-xs text-gray-600 grid sm:grid-cols-3 gap-x-6 gap-y-0.5 border-t border-gray-100 pt-2 mt-3">
            {selectedCustomer.email && <p><b>E-mail:</b> {selectedCustomer.email}</p>}
            {selectedCustomer.phone && (
              <p className="flex items-center gap-1.5">
                <b>Telefone:</b> {selectedCustomer.phone}
                <a href={waLink(selectedCustomer.phone, selectedCustomer.name)} target="_blank" rel="noreferrer"
                  title="Chamar no WhatsApp" className="text-green-500 hover:text-green-600">
                  <MessageCircle size={15} />
                </a>
              </p>
            )}
            {selectedCustomer.mobile && (
              <p className="flex items-center gap-1.5">
                <b>Celular:</b> {selectedCustomer.mobile}
                <a href={waLink(selectedCustomer.mobile, selectedCustomer.name)} target="_blank" rel="noreferrer"
                  title="Chamar no WhatsApp" className="text-green-500 hover:text-green-600">
                  <MessageCircle size={15} />
                </a>
              </p>
            )}
            {selectedCustomer.cpf_cnpj && <p><b>CPF/CNPJ:</b> {selectedCustomer.cpf_cnpj}</p>}
            {selectedCustomer.rg_ie && <p><b>RG/IE:</b> {selectedCustomer.rg_ie}</p>}
            {selectedCustomer.instagram && <p><b>Instagram:</b> {selectedCustomer.instagram}</p>}
            {(() => {
              const a = selectedCustomer.address;
              if (!a || (!a.street && !a.city)) return null;
              return <p className="sm:col-span-3"><b>Endereço:</b> {a.street}{a.number ? `, ${a.number}` : ''}{a.neighborhood ? ` - ${a.neighborhood}` : ''}{a.city ? ` - ${a.city}/${a.state || ''}` : ''}{a.zip ? ` (${a.zip})` : ''}</p>;
            })()}
          </div>
        )}
      </div>

        {/* Pedido — chave aleatória + datas (tudo obrigatório) */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">🔑 Pedido</span>
            <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 rounded px-2 py-0.5" title="Chave do pedido (gerada automaticamente)">#{orderKey}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Data do evento *</label>
              <input type="date" className="input w-full text-sm" value={eventDate} onChange={e => setEventDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Data da saída *</label>
              <input type="date" className="input w-full text-sm" value={shipDate} onChange={e => setShipDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Previsão de entrega *</label>
              <input type="date" className="input w-full text-sm" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Itens do pedido + botão ADICIONAR PRODUTOS */}
        <div className="card">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <ShoppingCart size={15} /> Itens do pedido{items.length > 0 ? ` (${items.length})` : ''}
            </p>
            <button type="button" onClick={() => setProductsOpen(true)} className="btn-primary text-sm">
              <Plus size={15} /> ADICIONAR PRODUTOS
            </button>
          </div>
          <div className="max-h-[42vh] overflow-y-auto">
          {items.length === 0 ? (
            <button type="button" onClick={() => setProductsOpen(true)}
              className="w-full flex flex-col items-center justify-center h-36 text-gray-400 hover:text-primary-600 transition-colors">
              <ShoppingCart size={30} className="mb-2 opacity-30" />
              <p className="text-sm">Nenhum item — clique em ADICIONAR PRODUTOS</p>
            </button>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-44">Qtd</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-28">Preço</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 uppercase w-28">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2">
                      <p className="font-medium text-sm flex items-center gap-2">
                        {item.variant_code && <span className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0">{item.variant_code}</span>}
                        <span>{item.name}</span>
                      </p>
                    </td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <HoldBtn onStep={() => stepQty(i, -10)} title="Diminui 10 — segure para descer rápido"
                          className="h-7 px-1.5 rounded-md border border-gray-200 text-[10px] font-bold text-red-500 hover:bg-red-50 select-none shrink-0">
                          −10
                        </HoldBtn>
                        <input
                          type="number"
                          step="1"
                          min="1"
                          value={item.quantity}
                          onChange={e => setQty(i, e.target.value)}
                          className="input text-center w-16 text-sm font-bold py-1"
                        />
                        <HoldBtn onStep={() => stepQty(i, 10)} title="Aumenta 10 — segure para subir rápido"
                          className="h-7 px-1.5 rounded-md border border-gray-200 text-[10px] font-bold text-green-600 hover:bg-green-50 select-none shrink-0">
                          +10
                        </HoldBtn>
                      </div>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="text" inputMode="decimal"
                        value={item.priceStr ?? maskMoney(item.unit_price)}
                        onChange={e => updatePrice(i, e.target.value.replace(/[^\d.,]/g, ''))}
                        onBlur={() => blurPrice(i)}
                        className="input text-right w-24 text-sm"
                      />
                      {item.price_tiers?.length > 0 && !item.priceTouched && (
                        <p className="text-[10px] text-blue-500 mt-0.5">faixa automática</p>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right font-semibold">
                      {fmt(item.quantity * item.unit_price)}
                    </td>
                    <td className="px-4 py-2">
                      <button onClick={() => removeItem(i)} className="btn-ghost p-1 text-red-400 hover:text-red-600">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          </div>
        </div>

        {/* Pagamento + Totais lado a lado (menos rolagem) */}
        <div className="grid lg:grid-cols-2 gap-3 items-start">
        {/* Forma de pagamento */}
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2">Pagamento</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { value: 'cash', label: '💵 Dinheiro' },
              { value: 'pix', label: '📱 Pix' },
              { value: 'card_debit', label: '💳 Débito' },
              { value: 'card_credit', label: '💳 Crédito' },
              { value: 'transfer', label: '🏦 Transf.' },
              { value: 'a_prazo', label: '🧾 A prazo' },
            ].map(pm => (
              <button key={pm.value}
                onClick={() => { setPaymentMethod(pm.value); setReceivedAmount(''); }}
                className={`py-2 px-3 rounded-lg text-sm font-medium border transition-colors ${
                  paymentMethod === pm.value
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-primary-300'
                }`}>
                {pm.label}
              </button>
            ))}
          </div>

          {paymentMethod === 'cash' && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">Valor recebido</span>
                <input type="text" inputMode="decimal"
                  value={receivedAmount} onChange={e => setReceivedAmount(e.target.value.replace(/[^\d.,]/g, ''))}
                  onBlur={() => { if (receivedAmount.trim() !== '') setReceivedAmount(maskMoney(parseMoney(receivedAmount))); }}
                  className="input text-right w-28 text-sm font-semibold" placeholder="0,00" />
              </div>
              {received > 0 && (
                <div className={`flex justify-between items-center p-3 rounded-xl font-bold ${
                  change >= 0 ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <span>{change >= 0 ? '💰 Troco' : '⚠️ Faltam'}</span>
                  <span>{fmt(Math.abs(change))}</span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'a_prazo' && (
            <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
              {!selectedCustomer && (
                <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-2 py-1.5">
                  ⚠️ Selecione o cliente — a prazo gera conta a receber no nome dele.
                </p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">Parcelas</span>
                <select className="input w-32 text-sm" value={installments}
                  onChange={e => setInstallments(parseInt(e.target.value))}>
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                    <option key={n} value={n}>{n}x de {fmt(total / n)}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium text-gray-700">1º vencimento</span>
                <input type="date" className="input w-40 text-sm" value={firstDueDate}
                  onChange={e => setFirstDueDate(e.target.value)} />
              </div>
            </div>
          )}
        </div>

        {/* Totais */}
        <div className="card p-4 space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>{items.length} iten{items.length !== 1 ? 's' : ''}</span>
            <span>{fmt(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm text-gray-600">Desconto (R$)</span>
            <input type="text" inputMode="decimal"
              value={discount} onChange={e => setDiscount(e.target.value.replace(/[^\d.,]/g, ''))}
              onBlur={() => { if (discount.trim() !== '') setDiscount(maskMoney(parseMoney(discount))); }}
              className="input text-right w-28 text-sm" placeholder="0,00" />
          </div>

          {/* Cupom de desconto */}
          {coupon ? (
            <div className="flex items-center justify-between gap-3 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
              <span className="text-sm text-green-700 font-medium">
                🎟️ {coupon.code} — {coupon.discount_type === 'percent' ? `${coupon.discount_value}%` : fmt(coupon.discount_value)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-sm text-green-700 font-semibold">−{fmt(couponDiscount)}</span>
                <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }}
                  className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <input value={couponInput} onChange={e => setCouponInput(e.target.value.toUpperCase().replace(/\s/g, ''))}
                onKeyDown={e => { if (e.key === 'Enter' && couponInput.trim()) { e.preventDefault(); couponMut.mutate(); } }}
                className="input text-sm font-mono flex-1" placeholder="Cupom de desconto" />
              <button type="button" onClick={() => couponMut.mutate()} disabled={!couponInput.trim() || couponMut.isPending || items.length === 0}
                className="btn-secondary text-sm disabled:opacity-50">
                {couponMut.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Aplicar'}
              </button>
            </div>
          )}

          {/* Condição de pagamento (desconto / juros) */}
          {payTerms.length > 0 && (
            <div className="border-t border-gray-100 pt-2 space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-gray-600">Condição de pagamento</span>
                <select value={payTerm?.label || ''}
                  onChange={e => setPayTerm(payTerms.find(t => t.label === e.target.value) || null)}
                  className="input text-sm w-44">
                  <option value="">À vista (sem ajuste)</option>
                  {payTerms.map((t, i) => (
                    <option key={i} value={t.label}>{t.label}{t.percent ? ` (${t.percent > 0 ? '+' : ''}${t.percent}%)` : ''}</option>
                  ))}
                </select>
              </div>
              {payTerm && paymentAdj !== 0 && (
                <div className={`flex justify-between text-sm font-medium ${paymentAdj < 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  <span>{paymentAdj < 0 ? 'Desconto' : 'Juros'} {payTerm.label} ({payPercent > 0 ? '+' : ''}{payPercent}%)</span>
                  <span>{paymentAdj < 0 ? '−' : '+'}{fmt(Math.abs(paymentAdj))}</span>
                </div>
              )}
            </div>
          )}

          {/* Frete + prazo automáticos */}
          <div className="border-t border-gray-100 pt-2">
            {frete ? (
              <div className="flex items-center justify-between gap-3 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                <span className="text-sm text-blue-800">
                  🚚 Frete {frete.uf ? `(${frete.uf})` : ''}: <b>{freteValue > 0 ? fmt(freteValue) : 'Grátis'}</b>
                  {frete.days ? <> · chega em <b>{frete.days} dia{frete.days > 1 ? 's' : ''}</b></> : ''}
                </span>
                <button type="button" onClick={() => { setFrete(null); setFreightInput(''); }} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
              </div>
            ) : (
              <>
                {freteValue > 0 && (
                  <div className="flex justify-between text-sm text-gray-600 mb-1.5">
                    <span>🚚 Frete</span>
                    <span className="font-medium">{fmt(freteValue)}</span>
                  </div>
                )}
                <button type="button" onClick={() => freteMut.mutate()}
                  disabled={freteMut.isPending || items.length === 0 || !selectedCustomer}
                  className="btn-secondary text-sm w-full disabled:opacity-50"
                  title={!selectedCustomer ? 'Selecione o cliente para usar o estado/CEP dele' : 'Calcula o frete e o prazo pelo estado do cliente'}>
                  {freteMut.isPending ? <Loader2 size={14} className="animate-spin" /> : '🚚'} Calcular frete e prazo
                </button>
              </>
            )}
          </div>

          <div className="flex justify-between font-bold text-2xl border-t border-gray-100 pt-2">
            <span>TOTAL</span>
            <span className="text-primary-600">{fmt(total)}</span>
          </div>
        </div>
        </div>

        {/* Finalizar */}
        <button
          onClick={finalizeSale}
          disabled={items.length === 0 || saleMutation.isPending}
          className="btn-primary w-full py-4 text-base"
        >
          {saleMutation.isPending
            ? <><Loader2 size={18} className="animate-spin" /> Processando...</>
            : <><Check size={18} /> Finalizar — {fmt(total)}</>
          }
        </button>

      {/* Card grande para escolher os produtos do pedido */}
      <Modal isOpen={productsOpen} onClose={() => setProductsOpen(false)} title="Adicionar produtos" size="full"
        footer={
          <button type="button" onClick={() => setProductsOpen(false)} className="btn-primary">
            <Check size={15} /> Concluir{items.length > 0 ? ` — ${items.length} ite${items.length > 1 ? 'ns' : 'm'} no pedido` : ''}
          </button>
        }>
        <div className="h-[65vh] flex flex-col">
          {ProductPanel}
        </div>
      </Modal>
    </div>
  );
}
