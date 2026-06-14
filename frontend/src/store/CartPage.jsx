import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingBag, CheckCircle2, Loader2, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { resolveColor } from './colors';
import { useCart } from './CartContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm';

export default function CartPage() {
  const { items, setQty, remove, clear, total, keyOf } = useCart();
  const [form, setForm] = useState({ name: '', phone: '', email: '', company: '', notes: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!form.name || !form.phone) { toast.error('Informe nome e telefone'); return; }
    setSending(true);
    try {
      const res = await storeApi.post('/quote', {
        customer: form,
        notes: form.notes,
        items: items.map(i => ({ product_id: i.product_id, product_name: i.product_name, color: i.color, quantity: i.quantity, design: i.design || null, preview: i.preview || null })),
      });
      setDone(res);
      clear();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao enviar pedido');
    } finally { setSending(false); }
  }

  if (done) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <CheckCircle2 size={56} className="text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-extrabold text-gray-900">Pedido enviado!</h1>
        <p className="text-gray-500 mt-2">
          Recebemos seu pedido{done.number ? ` (nº ${done.number})` : ''}. Nossa equipe vai entrar em contato
          com o orçamento e os detalhes de personalização.
        </p>
        <Link to="/loja" className="inline-block mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          Voltar à loja
        </Link>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="max-w-md mx-auto px-4 py-20 text-center">
        <ShoppingBag size={48} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-700">Seu carrinho está vazio</h1>
        <Link to="/loja" className="inline-block mt-4 text-orange-600 font-semibold">Ver produtos</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <Link to="/loja" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-orange-600 mb-6">
        <ArrowLeft size={15} /> Continuar comprando
      </Link>
      <h1 className="text-2xl font-bold mb-6">Seu Pedido</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Itens */}
        <div className="lg:col-span-2 space-y-3">
          {items.map(i => {
            const k = keyOf(i);
            const color = i.color ? resolveColor({ name: i.color, value: i.color }) : '#F26522';
            return (
              <div key={k} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-center gap-4">
                <div className="bg-gray-50 rounded-xl flex items-center justify-center w-20 h-24 flex-shrink-0 overflow-hidden">
                  {i.preview ? <img src={i.preview} alt="" className="w-full h-full object-contain" /> : <Bottle color={color} size={56} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-gray-900 truncate">{i.product_name}</p>
                  {i.color && <p className="text-sm text-gray-400">Cor: {i.color}</p>}
                  {i.design && <p className="text-xs text-orange-500 font-medium">Arte personalizada em 3D</p>}
                  <p className="text-sm text-gray-500 mt-0.5">{i.unit_price > 0 ? `${fmt(i.unit_price)} / un` : 'a orçar'}</p>
                </div>
                <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setQty(k, i.quantity - 1)} className="px-2 py-2 hover:bg-gray-50"><Minus size={13} /></button>
                  <input type="number" min="1" value={i.quantity}
                    onChange={e => setQty(k, Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-12 text-center font-bold outline-none text-sm" />
                  <button onClick={() => setQty(k, i.quantity + 1)} className="px-2 py-2 hover:bg-gray-50"><Plus size={13} /></button>
                </div>
                <div className="text-right w-24">
                  <p className="font-bold text-gray-900">{i.unit_price > 0 ? fmt(i.unit_price * i.quantity) : '—'}</p>
                </div>
                <button onClick={() => remove(k)} className="text-gray-300 hover:text-red-500 p-1"><Trash2 size={16} /></button>
              </div>
            );
          })}
        </div>

        {/* Checkout */}
        <div>
          <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-20 space-y-3">
            <div className="flex justify-between items-center pb-3 border-b border-gray-100">
              <span className="text-gray-500">Total estimado</span>
              <span className="text-2xl font-extrabold text-gray-900">{fmt(total)}</span>
            </div>
            <p className="text-xs text-gray-400">Preencha seus dados para receber o orçamento:</p>
            <input className={INPUT} placeholder="Nome *" value={form.name}
              onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            <input className={INPUT} placeholder="Telefone / WhatsApp *" value={form.phone}
              onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} />
            <input className={INPUT} placeholder="E-mail" value={form.email}
              onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
            <input className={INPUT} placeholder="Empresa (opcional)" value={form.company}
              onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
            <textarea className={`${INPUT} resize-none`} rows={2} placeholder="Observações (arte, prazo, etc.)"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
            <button type="submit" disabled={sending}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : 'Enviar pedido'}
            </button>
            <p className="text-xs text-gray-400 text-center">Sem compromisso — é um pedido de orçamento.</p>
          </form>
        </div>
      </div>
    </div>
  );
}
