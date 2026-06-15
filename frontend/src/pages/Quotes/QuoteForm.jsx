import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Save, ArrowRightCircle, Loader2, Globe, Check, Ban } from 'lucide-react';
import api from '@/lib/api';
import CustomerPicker from '@/components/CustomerPicker';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const PAYMENT_METHODS = [
  ['pix','Pix'], ['cash','Dinheiro'], ['card_credit','Cartão Crédito'],
  ['card_debit','Cartão Débito'], ['transfer','Transferência'], ['check','Cheque'], ['boleto','Boleto'],
];

const STATUS = {
  open:      { label: 'Pendente',   cls: 'bg-blue-100 text-blue-700' },
  sent:      { label: 'Enviado',    cls: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Aprovado',   cls: 'bg-green-100 text-green-700' },
  rejected:  { label: 'Recusado',   cls: 'bg-red-100 text-red-700' },
  expired:   { label: 'Expirado',   cls: 'bg-gray-100 text-gray-600' },
  converted: { label: 'Convertido', cls: 'bg-violet-100 text-violet-700' },
};

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = !!id;

  const [form, setForm] = useState({
    customer_id: '', notes: '', artwork_notes: '', payment_method: 'pix',
    valid_until: '', delivery_days: 10, discount: 0, status: 'open',
  });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [productSearch, setProductSearch] = useState('');

  const { data: products } = useQuery({
    queryKey: ['products-search', productSearch],
    queryFn: () => api.get(`/products?search=${productSearch}&limit=20`),
    enabled: productSearch.length > 1,
  });

  const { data: existingQuote } = useQuery({
    queryKey: ['quote', id],
    queryFn: () => api.get(`/quotes/${id}`),
    enabled: isEditing,
  });

  useEffect(() => {
    if (existingQuote) {
      setForm({
        customer_id: existingQuote.customer_id || '',
        notes: existingQuote.notes || '',
        artwork_notes: existingQuote.artwork_notes || '',
        payment_method: existingQuote.payment_method || 'pix',
        valid_until: existingQuote.valid_until || '',
        delivery_days: existingQuote.delivery_days || 10,
        discount: existingQuote.discount || 0,
        status: existingQuote.status || 'open',
      });
      setItems((existingQuote.ORCAMENTO_ITENS || []).map(i => ({
        product_id: i.product_id, product_name: i.product_name,
        quantity: i.quantity, unit_price: i.unit_price,
        discount: i.discount || 0,
        customization: i.customization || {},
      })));
    }
  }, [existingQuote]);

  function addProduct(p) {
    setItems(prev => {
      const exists = prev.find(i => i.product_id === p.id);
      if (exists) return prev.map(i => i.product_id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { product_id: p.id, product_name: p.name, quantity: 1, unit_price: p.sale_price || 0, discount: 0, customization: {} }];
    });
    setProductSearch('');
  }

  function removeItem(idx) { setItems(prev => prev.filter((_, i) => i !== idx)); }
  function updateItem(idx, field, value) {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, [field]: value } : item));
  }

  const subtotal = items.reduce((s, i) => s + (i.quantity * i.unit_price) - (i.discount || 0), 0);
  const total = subtotal - (parseFloat(form.discount) || 0);

  const isSiteOrder = (existingQuote?.notes || '').includes('PEDIDO PELO SITE');
  const siteContact = isSiteOrder ? (existingQuote.notes.match(/Contato:\s*([^\n]+)/)?.[1]?.trim() || '') : '';

  async function quickStatus(newStatus) {
    setForm(p => ({ ...p, status: newStatus }));
    if (isEditing) {
      try { await api.patch(`/quotes/${id}/status`, { status: newStatus }); toast.success('Status atualizado!'); }
      catch (err) { toast.error(err.error || 'Erro ao atualizar status'); }
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!items.length) { toast.error('Adicione pelo menos um produto'); return; }
    setLoading(true);
    try {
      const payload = { ...form, customer_id: form.customer_id || null, items };
      if (isEditing) {
        await api.put(`/quotes/${id}`, payload);
        toast.success('Orçamento atualizado!');
      } else {
        await api.post('/quotes', payload);
        toast.success('Orçamento criado!');
      }
      navigate('/quotes');
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setLoading(false); }
  }

  async function handleConvert() {
    if (!confirm('Converter este orçamento em pedido de venda?')) return;
    setLoading(true);
    try {
      const res = await api.post(`/quotes/${id}/convert`);
      toast.success(`Venda #${res.sale?.number} criada!`);
      navigate('/sales');
    } catch (err) { toast.error(err.error || 'Erro ao converter'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => navigate('/quotes')} className="btn-ghost p-2">
            <ArrowLeft size={18} />
          </button>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="page-title">{isEditing ? `Orçamento #${String(existingQuote?.number || '').padStart(4,'0')}` : 'Novo Orçamento'}</h1>
              {isEditing && <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${(STATUS[form.status] || STATUS.open).cls}`}>{(STATUS[form.status] || STATUS.open).label}</span>}
              {isSiteOrder && <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 inline-flex items-center gap-1"><Globe size={11} /> Site</span>}
            </div>
            <p className="text-sm text-gray-500">Proposta comercial para cliente</p>
          </div>
        </div>
        <div className="flex gap-2">
          {isEditing && existingQuote?.status === 'approved' && (
            <button type="button" onClick={handleConvert} disabled={loading} className="btn-success">
              <ArrowRightCircle size={16} /> Converter em Venda
            </button>
          )}
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {isEditing ? 'Salvar' : 'Criar Orçamento'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card">
            <div className="card-header"><h2 className="font-semibold">Produtos / Serviços</h2></div>
            <div className="card-body space-y-3">
              {/* Product search */}
              <div className="relative">
                <input
                  type="text" className="input" placeholder="Buscar produto para adicionar..."
                  value={productSearch} onChange={e => setProductSearch(e.target.value)}
                />
                {products?.data?.length > 0 && productSearch && (
                  <div className="absolute top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                    {products.data.map(p => (
                      <button key={p.id} type="button" onClick={() => addProduct(p)}
                        className="w-full text-left px-4 py-2 hover:bg-gray-50 flex items-center justify-between text-sm">
                        <span>{p.name}</span>
                        <span className="text-gray-400 font-medium">{fmt(p.sale_price)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Items table */}
              {items.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Nenhum item adicionado. Busque um produto acima.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead><tr className="border-b border-gray-100 text-gray-500 text-xs">
                      <th className="text-left pb-2">Produto</th>
                      <th className="text-right pb-2 w-20">Qtd</th>
                      <th className="text-right pb-2 w-24">Preço Unit.</th>
                      <th className="text-right pb-2 w-24">Desconto</th>
                      <th className="text-right pb-2 w-24">Total</th>
                      <th className="w-8"></th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {items.map((item, idx) => (
                        <tr key={idx}>
                          <td className="py-2">
                            <div>
                              <p className="font-medium">{item.product_name}</p>
                              <input type="text" className="input mt-1 text-xs" placeholder="Observação de personalização..."
                                value={item.customization?.notes || ''}
                                onChange={e => updateItem(idx, 'customization', { ...item.customization, notes: e.target.value })}
                              />
                            </div>
                          </td>
                          <td className="py-2">
                            <input type="number" min="1" step="0.01" className="input text-right w-20"
                              value={item.quantity} onChange={e => updateItem(idx, 'quantity', parseFloat(e.target.value) || 1)} />
                          </td>
                          <td className="py-2">
                            <input type="number" min="0" step="0.01" className="input text-right w-24"
                              value={item.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)} />
                          </td>
                          <td className="py-2">
                            <input type="number" min="0" step="0.01" className="input text-right w-24"
                              value={item.discount} onChange={e => updateItem(idx, 'discount', parseFloat(e.target.value) || 0)} />
                          </td>
                          <td className="py-2 text-right font-semibold">
                            {fmt((item.quantity * item.unit_price) - (item.discount || 0))}
                          </td>
                          <td className="py-2">
                            <button type="button" onClick={() => removeItem(idx)} className="btn-ghost p-1 text-red-400 hover:text-red-600">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Totals */}
              <div className="border-t border-gray-100 pt-3 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Subtotal</span>
                  <span className="font-medium">{fmt(subtotal)}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-gray-500">Desconto geral (R$)</span>
                  <input type="number" min="0" step="0.01" className="input text-right w-28"
                    value={form.discount} onChange={e => setForm(p => ({ ...p, discount: parseFloat(e.target.value) || 0 }))} />
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span className="text-primary-600">{fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Details */}
        <div className="space-y-4">
          {/* Solicitado pelo Site */}
          {isSiteOrder && (
            <div className="card border-l-4 border-orange-400">
              <div className="card-body">
                <div className="flex items-center gap-2 text-orange-700 font-semibold">
                  <Globe size={16} /> Solicitado pelo Site
                </div>
                {siteContact && <p className="text-sm text-gray-600 mt-1.5">{siteContact}</p>}
                <div className="flex gap-2 mt-3">
                  <button type="button" onClick={() => quickStatus('approved')}
                    className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 inline-flex items-center justify-center gap-1">
                    <Check size={13} /> Aprovar
                  </button>
                  <button type="button" onClick={() => quickStatus('rejected')}
                    className="flex-1 text-xs font-medium px-2 py-1.5 rounded-lg bg-white border border-red-200 text-red-600 hover:bg-red-50 inline-flex items-center justify-center gap-1">
                    <Ban size={13} /> Recusar
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Cliente */}
          <div className="card">
            <div className="card-header"><h2 className="font-semibold">Cliente</h2></div>
            <div className="card-body">
              <CustomerPicker customerId={form.customer_id} onSelect={c => setForm(p => ({ ...p, customer_id: c?.id || '' }))} />
            </div>
          </div>

          {/* Status & condições */}
          <div className="card">
            <div className="card-header"><h2 className="font-semibold">Status & Condições</h2></div>
            <div className="card-body space-y-3">
              <div>
                <label className="label">Status</label>
                <select className="input" value={form.status} onChange={e => quickStatus(e.target.value)}>
                  {Object.entries(STATUS).map(([v, s]) => <option key={v} value={v}>{s.label}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Forma de Pagamento</label>
                <select className="input" value={form.payment_method} onChange={e => setForm(p => ({ ...p, payment_method: e.target.value }))}>
                  {PAYMENT_METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Válido até</label>
                  <input type="date" className="input" value={form.valid_until} onChange={e => setForm(p => ({ ...p, valid_until: e.target.value }))} />
                </div>
                <div>
                  <label className="label">Entrega (dias)</label>
                  <input type="number" min="1" className="input" value={form.delivery_days} onChange={e => setForm(p => ({ ...p, delivery_days: parseInt(e.target.value) || 10 }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Observações */}
          <div className="card">
            <div className="card-header"><h2 className="font-semibold">Observações</h2></div>
            <div className="card-body space-y-3">
              <div>
                <label className="label">Observações da Arte</label>
                <textarea rows={3} className="input" placeholder="Descreva as personalizações desejadas..."
                  value={form.artwork_notes} onChange={e => setForm(p => ({ ...p, artwork_notes: e.target.value }))} />
              </div>
              <div>
                <label className="label">Observações Gerais</label>
                <textarea rows={3} className="input"
                  value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
