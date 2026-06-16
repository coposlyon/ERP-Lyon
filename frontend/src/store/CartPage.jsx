import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingBag, CheckCircle2, Loader2, ArrowLeft, CalendarHeart } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { resolveColor } from './colors';
import { useCart } from './CartContext';
import { useStoreAuth } from './StoreAuthContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm';
const todayISO = new Date().toISOString().slice(0, 10);

export default function CartPage() {
  const { items, setQty, remove, clear, total, keyOf } = useCart();
  const { customer } = useStoreAuth();
  const [form, setForm] = useState({
    name: customer?.name || '', phone: customer?.phone || '', email: customer?.email || '',
    company: '', notes: '', event_date: '',
  });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);
  const [cep, setCep] = useState('');
  const [freteOpts, setFreteOpts] = useState(null);
  const [freteSel, setFreteSel] = useState(null);
  const [freteLoading, setFreteLoading] = useState(false);

  async function calcFrete() {
    const c = cep.replace(/\D/g, '');
    if (c.length !== 8) { toast.error('Informe um CEP válido (8 dígitos)'); return; }
    setFreteLoading(true); setFreteOpts(null); setFreteSel(null);
    try {
      const res = await storeApi.post('/frete', { cep: c, items: items.map(i => ({ product_id: i.product_id, quantity: i.quantity })) });
      setFreteOpts(res.options || []);
      if ((res.options || []).length) setFreteSel(res.options[0]);
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Não foi possível calcular o frete');
    } finally { setFreteLoading(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.name || !form.phone) { toast.error('Informe nome e telefone'); return; }
    setSending(true);
    try {
      const freteNote = freteSel
        ? `\nFrete: ${freteSel.company} ${freteSel.service} — ${fmt(freteSel.price)}${freteSel.days ? ` (${freteSel.days} dias)` : ''} para CEP ${cep}`
        : '';
      const res = await storeApi.post('/quote', {
        customer: form,
        customer_id: customer?.id || null,
        event_date: form.event_date || null,
        notes: (form.notes || '') + freteNote,
        items: items.map(i => ({ product_id: i.product_id, product_name: i.product_name, color: i.color, print_method: i.print_method || null, quantity: i.quantity, design: i.design || null, preview: i.preview || null })),
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
        <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
          {customer && (
            <Link to="/loja/pedidos" className="inline-block bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
              Acompanhar meus pedidos
            </Link>
          )}
          <Link to="/loja" className={`inline-block px-6 py-3 rounded-xl font-semibold transition-colors ${customer ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-orange-500 hover:bg-orange-600 text-white'}`}>
            Voltar à loja
          </Link>
        </div>
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
            <div className="pb-3 border-b border-gray-100 space-y-1">
              <div className="flex justify-between text-sm text-gray-500"><span>Produtos</span><span>{fmt(total)}</span></div>
              {freteSel && <div className="flex justify-between text-sm text-gray-500"><span>Frete ({freteSel.service})</span><span>{fmt(freteSel.price)}</span></div>}
              <div className="flex justify-between items-center pt-1">
                <span className="font-semibold text-gray-600">Total estimado</span>
                <span className="text-2xl font-extrabold text-gray-900">{fmt(total + (freteSel?.price || 0))}</span>
              </div>
            </div>

            {/* Frete por CEP */}
            <div>
              <p className="text-xs font-semibold text-gray-500 mb-1.5">Calcular frete</p>
              <div className="flex gap-2">
                <input className={INPUT} placeholder="CEP de entrega" value={cep}
                  onChange={e => setCep(e.target.value)} />
                <button type="button" onClick={calcFrete} disabled={freteLoading}
                  className="px-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-sm font-medium whitespace-nowrap disabled:opacity-60">
                  {freteLoading ? '...' : 'Calcular'}
                </button>
              </div>
              {freteOpts && freteOpts.length === 0 && <p className="text-xs text-gray-400 mt-2">Nenhuma opção de frete encontrada para esse CEP.</p>}
              {freteOpts && freteOpts.length > 0 && (
                <div className="space-y-1.5 mt-2">
                  {freteOpts.map(o => (
                    <label key={o.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${freteSel?.id === o.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                      <input type="radio" checked={freteSel?.id === o.id} onChange={() => setFreteSel(o)} className="accent-orange-500" />
                      <span className="flex-1 truncate">{o.company} {o.service}{o.days ? ` · ${o.days} dias` : ''}</span>
                      <span className="font-bold whitespace-nowrap">{fmt(o.price)}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Data do evento — usada na produção para calcular o prazo */}
            <div className="bg-orange-50/70 border border-orange-100 rounded-xl p-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-orange-700 mb-1.5">
                <CalendarHeart size={14} /> Para quando você precisa? (data do evento)
              </label>
              <input type="date" className={INPUT} min={todayISO} value={form.event_date}
                onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
              <p className="text-[11px] text-orange-500/80 mt-1">Assim a gente garante a entrega antes do seu evento. 🎉</p>
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
