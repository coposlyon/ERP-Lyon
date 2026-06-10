import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Search, Trash2, ShoppingCart, User, Check, Loader2, X } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

export default function PDV() {
  const [items, setItems] = useState([]);
  const [productSearch, setProductSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [discount, setDiscount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [receivedAmount, setReceivedAmount] = useState('');
  const searchRef = useRef();

  const { data: productResults } = useQuery({
    queryKey: ['pdv-products', productSearch],
    queryFn: () => api.get(`/products?search=${productSearch}&limit=10&is_active=true`),
    enabled: productSearch.length >= 2,
  });

  const { data: customerResults } = useQuery({
    queryKey: ['pdv-customers', customerSearch],
    queryFn: () => api.get(`/customers?search=${customerSearch}&limit=8&is_active=true`),
    enabled: customerSearch.length >= 2,
  });

  const saleMutation = useMutation({
    mutationFn: (data) => api.post('/sales', data),
    onSuccess: () => {
      toast.success('Venda finalizada com sucesso!');
      setItems([]);
      setSelectedCustomer(null);
      setDiscount('');
      setReceivedAmount('');
      setTimeout(() => searchRef.current?.focus(), 100);
    },
    onError: (err) => toast.error(err.error || 'Erro ao finalizar venda'),
  });

  function addProduct(product) {
    setProductSearch('');
    setItems(prev => {
      const existing = prev.find(i => i.product_id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product_id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, {
        product_id: product.id,
        name: product.name,
        unit: product.unit,
        unit_price: product.sale_price,
        quantity: 1,
        discount: 0,
      }];
    });
    setTimeout(() => searchRef.current?.focus(), 50);
  }

  function handleProductKeyDown(e) {
    if (e.key === 'Enter' && productResults?.data?.length >= 1) {
      addProduct(productResults.data[0]);
    }
  }

  function setQty(idx, val) {
    const q = parseFloat(val);
    if (isNaN(q) || q <= 0) return;
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, quantity: q } : item));
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updatePrice(idx, price) {
    setItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, unit_price: parseFloat(price) || 0 } : item
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
    saleMutation.mutate({
      customer_id: selectedCustomer?.id || null,
      type: 'sale',
      items: items.map(i => ({
        product_id: i.product_id,
        quantity: i.quantity,
        unit_price: i.unit_price,
        discount: i.discount || 0,
      })),
      discount: discountValue,
      payment_method: paymentMethod,
    });
  }

  return (
    <div className="h-full flex gap-4" style={{ maxHeight: 'calc(100vh - 160px)' }}>
      {/* Esquerda — Produtos */}
      <div className="flex-1 flex flex-col gap-3 overflow-hidden">
        <h1 className="page-title">PDV — Ponto de Venda</h1>

        {/* Busca produto */}
        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Buscar produto... (Enter para adicionar o 1º)"
            value={productSearch}
            onChange={e => setProductSearch(e.target.value)}
            onKeyDown={handleProductKeyDown}
            className="input pl-9 text-base"
            autoFocus
          />
          {productSearch.length >= 2 && productResults?.data?.length > 0 && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
              {productResults.data.map((p, idx) => (
                <button key={p.id} onClick={() => addProduct(p)}
                  className={`w-full flex items-center justify-between px-4 py-3 hover:bg-primary-50 text-left border-b border-gray-50 last:border-0 ${idx === 0 ? 'bg-blue-50/40' : ''}`}>
                  <div>
                    <p className="font-medium text-gray-900 text-sm">{p.name}</p>
                    <p className="text-xs text-gray-400">Estoque: {p.current_stock}</p>
                  </div>
                  <span className="font-semibold text-primary-600">{fmt(p.sale_price)}</span>
                </button>
              ))}
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
                      <p className="font-medium text-sm">{item.name}</p>
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
      <div className="w-80 flex flex-col gap-3">

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
                  placeholder="Buscar cliente..."
                  value={customerSearch}
                  onChange={e => setCustomerSearch(e.target.value)}
                  className="input text-sm pl-8"
                />
              </div>
              {customerSearch.length >= 2 && customerResults?.data?.length > 0 && (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {customerResults.data.map(c => (
                    <button key={c.id}
                      onClick={() => { setSelectedCustomer(c); setCustomerSearch(''); }}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-gray-400">{c.cpf_cnpj || c.phone}</p>
                    </button>
                  ))}
                </div>
              )}
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
              { value: 'check', label: '📄 Cheque' },
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
