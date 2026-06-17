import { useState, useRef, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Trash2, ShoppingCart, User, Check, Loader2, X, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { expandVariants, expandVariantsWithCode } from '@/pages/Products/ProductVariantsModal';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
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
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const [installments, setInstallments] = useState(1);
  const [operationDate, setOperationDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [firstDueDate, setFirstDueDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  });
  const searchRef = useRef();
  const [prodFocus, setProdFocus] = useState(false);

  // Carrega todos os produtos ativos (o backend já devolve em ordem alfabética)
  // para mostrar a lista completa ao abrir, e filtra no cliente conforme digita.
  const { data: allProducts } = useQuery({
    queryKey: ['pdv-all-products'],
    queryFn: () => api.get('/products?limit=2000&is_active=true'),
  });

  const productList = useMemo(() => {
    const arr = [...(allProducts?.data || [])].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'pt-BR'));
    const term = productSearch.trim().toLowerCase();
    if (!term) return arr;
    return arr.filter(p =>
      (p.name || '').toLowerCase().includes(term) ||
      String(p.code || '').toLowerCase().includes(term)
    );
  }, [allProducts, productSearch]);

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

  const saleMutation = useMutation({
    mutationFn: (data) => api.post('/sales', data),
    onSuccess: () => {
      toast.success('Venda finalizada com sucesso!');
      setItems([]);
      setSelectedCustomer(null);
      setDiscount('');
      setReceivedAmount('');
      if (inModal) { onDone(); return; } // fecha o card e atualiza a lista
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (err) => toast.error(err.error || 'Erro ao finalizar venda'),
  });

  // Modelo cujas variações estão sendo exibidas (drill-down). null = lista de modelos.
  const [drill, setDrill] = useState(null);

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
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  // Adiciona a variação escolhida; permanece no drill p/ adicionar mais do mesmo modelo.
  function addVariant(variant) {
    if (!drill) return;
    pushItem(drill, variant.name, variant.code);
    setProductSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  }

  function backToModels() {
    setDrill(null);
    setProductSearch('');
    setTimeout(() => searchRef.current?.focus(), 30);
  }

  function handleProductKeyDown(e) {
    if (e.key !== 'Enter') return;
    if (drill) { if (variantList.length >= 1) addVariant(variantList[0]); }
    else if (productList.length >= 1) pickProduct(productList[0]);
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

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePrice(idx, price) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, unit_price: parseFloat(price) || 0, priceTouched: true } : item
    ));
  }

  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unit_price, 0);
  const discountValue = parseFloat(discount) || 0;
  const total = Math.max(0, subtotal - discountValue);
  const received = parseFloat(receivedAmount) || 0;
  const change = paymentMethod === 'cash' && received > 0 ? received - total : 0;

  function finalizeSale() {
    if (items.length === 0) { toast.error('Adicione ao menos um produto'); return; }
    if (paymentMethod === 'cash' && received > 0 && received < total) {
      toast.error(`Valor insuficiente! Faltam ${fmt(total - received)}`);
      return;
    }
    if (paymentMethod === 'a_prazo' && !selectedCustomer) {
      toast.error('Venda a prazo exige um cliente. Selecione o cliente.');
      return;
    }
    saleMutation.mutate({
      customer_id: selectedCustomer?.id || null,
      type: 'sale',
      operation_date: operationDate || null,
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount || 0,
        // guarda a variação escolhida (código + nome) no item da venda
        ...(i.variant ? { customization: { ...(i.variant_code ? { 'Código': i.variant_code } : {}), 'Variação': i.variant } } : {}),
      })),
      discount: discountValue,
      payment_method: paymentMethod,
      ...(paymentMethod === 'a_prazo' ? { installments, first_due_date: firstDueDate } : {}),
    });
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:h-full" style={{ maxHeight: 'none' }}>
      {/* Esquerda — Produtos */}
      <div className="flex-1 flex flex-col gap-3 lg:overflow-hidden">
        {!inModal && <h1 className="page-title">PDV — Ponto de Venda</h1>}

        {/* Busca produto */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder={drill ? `Buscar variação de ${drill.name}...` : 'Buscar produto ou clique para ver todos'}
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            onKeyDown={handleProductKeyDown}
            onFocus={() => setProdFocus(true)}
            onBlur={() => setTimeout(() => { if (document.activeElement !== searchRef.current) setProdFocus(false); }, 150)}
            className="input pl-9 text-base"
            autoFocus
          />
          {(prodFocus || productSearch.trim().length >= 1 || drill) && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-96 overflow-y-auto">
              {drill ? (
                <>
                  <button type="button" onMouseDown={backToModels}
                    className="w-full flex items-center justify-between px-4 py-2 bg-gray-50 sticky top-0 text-xs text-gray-600 hover:bg-gray-100 border-b border-gray-100">
                    <span className="flex items-center gap-1"><ChevronLeft size={13} /> Voltar — <b className="ml-0.5">{drill.name}</b></span>
                    <span>{variantList.length} variações</span>
                  </button>
                  {variantList.length === 0 ? (
                    <p className="text-sm text-gray-400 text-center py-4">Nenhuma variação encontrada.</p>
                  ) : variantList.map((v, idx) => (
                    <button key={idx} type="button" onMouseDown={() => addVariant(v)}
                      className={`w-full flex items-center justify-between gap-2 px-4 py-2.5 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 && productSearch.trim() ? 'bg-blue-50/40' : ''}`}>
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] font-mono font-semibold text-indigo-600 bg-indigo-50 rounded px-1.5 py-0.5 shrink-0">{v.code}</span>
                        <span className="text-sm text-gray-800 truncate">{v.name}</span>
                      </span>
                      <span className="font-semibold text-primary-600 shrink-0">{fmt(drill.sale_price)}</span>
                    </button>
                  ))}
                </>
              ) : productList.length > 0 ? (
                <>
                  <p className="text-[11px] text-gray-400 px-4 py-1.5 bg-gray-50 sticky top-0 flex justify-between">
                    <span>{productSearch.trim() ? `${productList.length} produto(s) encontrado(s)` : 'Todos os produtos (A–Z)'}</span>
                    <span>{productList.length}</span>
                  </p>
                  {productList.map((p, idx) => {
                    const nv = expandVariants(p).length;
                    return (
                      <button key={p.id} type="button" onMouseDown={() => pickProduct(p)}
                        className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 && productSearch.trim() ? 'bg-blue-50/40' : ''}`}>
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate">{p.name}</p>
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
                <p className="text-sm text-gray-400 text-center py-4">Nenhum produto encontrado.</p>
              )}
            </div>
          )}
        </div>

        {/* Lista de itens */}
        <div className="card flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400">
              <ShoppingCart size={32} className="mb-2 opacity-30" />
              <p className="text-sm">Nenhum item adicionado</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-24">Qtd</th>
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
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={item.quantity}
                        onChange={e => setQty(i, e.target.value)}
                        className="input text-center w-20 text-sm font-bold py-1"
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number" step="0.01" min="0"
                        value={item.unit_price}
                        onChange={e => updatePrice(i, e.target.value)}
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

      {/* Direita — Checkout */}
      <div className="w-full lg:w-80 flex flex-col gap-3">

        {/* Data da operação */}
        <div className="card p-4">
          <label className="text-sm font-semibold text-gray-700 mb-1.5 block">📅 Data da operação</label>
          <input type="date" className="input w-full text-sm" value={operationDate}
            onChange={e => setOperationDate(e.target.value)} />
        </div>

        {/* Cliente — sempre visível */}
        <div className="card p-4">
          <p className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
            <User size={15} /> Cliente
          </p>
          {selectedCustomer ? (
            <div className="flex items-center justify-between bg-primary-50 rounded-lg px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-primary-800">{selectedCustomer.name}</p>
                <p className="text-xs text-primary-500">{selectedCustomer.cpf_cnpj || selectedCustomer.phone || ''}</p>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="text-primary-400 hover:text-red-500 ml-2">
                <X size={15} />
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Nome, ID ou telefone..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  onFocus={() => setCustFocus(true)}
                  onBlur={() => setTimeout(() => setCustFocus(false), 150)}
                  className="input text-sm pl-8"
                />
              </div>
              {(() => {
                const searching = customerSearch.trim().length >= 1;
                const list = searching ? (customerResults?.data || []) : (custFocus ? (recentCustomers?.data || []) : []);
                if (list.length === 0 && searching) {
                  return <p className="text-xs text-gray-400 text-center py-1">Nenhum cliente encontrado.</p>;
                }
                if (list.length === 0) return null;
                return (
                  <div className="border border-gray-200 rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                    {!searching && <p className="text-[11px] text-gray-400 px-3 py-1.5 bg-gray-50 sticky top-0">Últimos clientes cadastrados</p>}
                    {list.map(c => (
                      <button key={c.id} type="button"
                        onMouseDown={() => { setSelectedCustomer(c); setCustomerSearch(''); setCustFocus(false); }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0 flex items-center gap-2">
                        {c.display_id != null && <span className="text-[10px] font-mono bg-gray-100 text-gray-500 rounded px-1.5 py-0.5 shrink-0">#{c.display_id}</span>}
                        <span className="min-w-0">
                          <span className="font-medium block truncate">{c.name}</span>
                          <span className="text-xs text-gray-400">{c.cpf_cnpj || c.phone}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                );
              })()}
              <p className="text-xs text-gray-400 text-center">ou deixe em branco (consumidor final)</p>
            </div>
          )}
        </div>

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
                <input type="number" step="0.01" min="0"
                  value={receivedAmount} onChange={e => setReceivedAmount(e.target.value)}
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
            <input type="number" step="0.01" min="0"
              value={discount} onChange={e => setDiscount(e.target.value)}
              className="input text-right w-28 text-sm" placeholder="0,00" />
          </div>
          <div className="flex justify-between font-bold text-2xl border-t border-gray-100 pt-2">
            <span>TOTAL</span>
            <span className="text-primary-600">{fmt(total)}</span>
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
      </div>
    </div>
  );
}
