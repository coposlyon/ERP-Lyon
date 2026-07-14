import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2, Minus, Plus, ShoppingBag, CheckCircle2, Loader2, ArrowLeft, CalendarHeart, User, LogIn, Printer, Package } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';
import Bottle from './Bottle';
import { resolveColor } from './colors';
import { useCart } from './CartContext';
import { useStoreAuth } from './StoreAuthContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm';
const todayISO = new Date().toISOString().slice(0, 10);
const dBR = iso => { if (!iso) return null; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : iso; };

// Frete: sem transportadora configurada o valor volta 0 → mostramos "A combinar"
// em vez de "R$ 0,00" (que parece frete grátis por engano).
function freightView(opt) {
  if (!opt) return { text: '—', quote: false };
  if (Number(opt.price) > 0) return { text: fmt(opt.price), quote: false };
  if (/gr[áa]tis/i.test(opt.service || '')) return { text: 'Grátis', quote: false };
  return { text: 'A combinar', quote: true };
}

export default function CartPage() {
  const { items, setQty, remove, clear, total, keyOf } = useCart();
  const { customer } = useStoreAuth();
  const [form, setForm] = useState({ notes: '', event_date: '' });
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
    if (!customer) { toast.error('Faça login para solicitar o orçamento.'); return; }
    // Dados vêm do cadastro (login obrigatório) — sem formulário manual.
    const cust = {
      name: customer.name || '',
      phone: customer.phone || customer.mobile || '',
      email: customer.email || '',
    };
    if (!cust.name || !cust.phone) {
      toast.error('Seu cadastro está sem nome ou telefone. Atualize no seu perfil.');
      return;
    }
    setSending(true);
    try {
      const fv = freightView(freteSel);
      const freteNote = freteSel && !fv.quote
        ? `\nFrete: ${freteSel.company} ${freteSel.service} — ${fv.text}${freteSel.days ? ` (${freteSel.days} dias)` : ''} para CEP ${cep}`
        : (cep ? `\nFrete a combinar para CEP ${cep}` : '');
      // "foto" do pedido para o painel do orçamento (o carrinho é limpo depois)
      const snapshot = {
        items: items.map(i => ({ ...i })),
        subtotal: total,
        freightPrice: freteSel?.price || 0,
        freightName: freteSel ? `${freteSel.company} ${freteSel.service}`.trim() : null,
        freightDays: freteSel?.days || null,
        freightQuote: fv.quote || !freteSel,
        event_date: form.event_date || null,
        cep,
        customer: cust,
      };
      const res = await storeApi.post('/quote', {
        customer: cust,
        customer_id: customer.id || null,
        event_date: form.event_date || null,
        freight: (freteSel && !fv.quote) ? freteSel.price : 0,
        notes: (form.notes || '') + freteNote,
        items: items.map(i => ({ product_id: i.product_id, product_name: i.product_name, color: i.color, border: i.border || null, volume: i.volume || null, print_method: i.print_method || null, quantity: i.quantity, design: i.design || null, preview: i.preview || null })),
      });
      setDone({ ...res, ...snapshot });
      clear();
    } catch (err) {
      const e = err?.response?.data;
      if (e?.code === 'LOGIN_REQUIRED') toast.error('Faça login para solicitar o orçamento.');
      else toast.error(e?.error || 'Erro ao enviar o pedido');
    } finally { setSending(false); }
  }

  // ── Painel do orçamento (tela automática após solicitar) ──
  if (done) {
    const total = (done.subtotal || 0) + (done.freightQuote ? 0 : (done.freightPrice || 0));
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden print:shadow-none">
          {/* Cabeçalho */}
          <div className="st-animated-gradient text-white px-6 sm:px-8 py-7"
            style={{ background: 'linear-gradient(120deg,#ff7a18,#ff2d75 50%,#8a2be2 100%)' }}>
            <div className="flex items-center gap-2 text-white/90 text-sm font-bold">
              <CheckCircle2 size={18} /> Orçamento solicitado
            </div>
            <h1 className="text-2xl sm:text-3xl font-black mt-1">
              {done.number ? `Pedido nº ${done.number}` : 'Seu orçamento'}
            </h1>
            <p className="text-white/80 text-sm mt-1">
              {done.customer?.name} · emitido em {dBR(todayISO)}
            </p>
          </div>

          <div className="p-6 sm:p-8">
            {/* Itens detalhados */}
            <div className="space-y-3">
              {(done.items || []).map((i, idx) => {
                const color = i.color ? resolveColor({ name: i.color, value: i.color }) : '#F26522';
                const line = (Number(i.unit_price) || 0) * (Number(i.quantity) || 0);
                return (
                  <div key={idx} className="flex items-center gap-4 border-b border-gray-100 pb-3 last:border-0">
                    <div className="bg-gray-50 rounded-xl flex items-center justify-center w-16 h-20 flex-shrink-0 overflow-hidden">
                      {i.preview ? <img src={i.preview} alt="" className="w-full h-full object-contain" /> : <Bottle color={color} size={44} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-gray-900 leading-tight">{i.product_name}</p>
                      <div className="text-xs text-gray-400 mt-0.5 space-x-2">
                        {i.color && <span>Cor: {i.color}</span>}
                        {i.border && <span>{i.border.replace(/^BORDA\s*/i, 'Borda: ')}</span>}
                        {i.volume && <span>Vol: {i.volume}</span>}
                        {i.design && <span className="text-orange-500 font-medium">Arte 3D</span>}
                      </div>
                      <p className="text-sm text-gray-500 mt-0.5">
                        {i.quantity} × {i.unit_price > 0 ? `${fmt(i.unit_price)}/un` : 'a orçar'}
                      </p>
                    </div>
                    <div className="text-right w-24 font-bold text-gray-900">
                      {i.unit_price > 0 ? fmt(line) : '—'}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totais */}
            <div className="mt-5 border-t border-gray-100 pt-4 space-y-1.5">
              <div className="flex justify-between text-sm text-gray-500"><span>Subtotal dos produtos</span><span>{fmt(done.subtotal)}</span></div>
              <div className="flex justify-between text-sm text-gray-500">
                <span>Frete{done.freightName && !done.freightQuote ? ` (${done.freightName})` : ''}{done.cep ? ` · CEP ${done.cep}` : ''}</span>
                <span>{done.freightQuote ? 'A combinar' : (done.freightPrice > 0 ? fmt(done.freightPrice) : 'Grátis')}</span>
              </div>
              <div className="flex justify-between items-center pt-2">
                <span className="font-bold text-gray-700">Total estimado</span>
                <span className="text-2xl font-extrabold text-gray-900">{fmt(total)}</span>
              </div>
              {done.freightQuote && <p className="text-xs text-gray-400 text-right">+ frete a combinar com a equipe</p>}
            </div>

            {/* Data do evento */}
            {done.event_date && (
              <div className="mt-4 flex items-center gap-2 bg-orange-50/70 border border-orange-100 rounded-xl px-4 py-3 text-sm">
                <CalendarHeart size={16} className="text-orange-500 shrink-0" />
                <span className="text-orange-700"><b>Data do evento:</b> {dBR(done.event_date)}</span>
              </div>
            )}

            <p className="text-sm text-gray-500 mt-5">
              Recebemos seu pedido! Nossa equipe vai revisar e entrar em contato com o orçamento final
              e os detalhes de personalização. Você também acompanha tudo pela loja.
            </p>

            {/* Ações */}
            <div className="flex flex-col sm:flex-row gap-3 mt-6 print:hidden">
              <Link to="/loja/pedidos" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-3 rounded-xl text-center transition-colors">
                Acompanhar meus pedidos
              </Link>
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-3 rounded-xl transition-colors">
                <Printer size={16} /> Imprimir / salvar PDF
              </button>
              <Link to="/loja" className="flex items-center justify-center bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-3 rounded-xl transition-colors">
                Voltar à loja
              </Link>
            </div>
          </div>
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

  const fv = freightView(freteSel);
  const totalEstimado = total + (fv.quote ? 0 : (freteSel?.price || 0));

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
                  {i.border && <p className="text-xs text-gray-400">{i.border.replace(/^BORDA\s*/i, 'Borda: ')}</p>}
                  {i.volume && <p className="text-xs text-gray-400">Volume: {i.volume}</p>}
                  {i.design && <p className="text-xs text-orange-500 font-medium">Arte personalizada em 3D</p>}
                  <p className="text-sm text-gray-500 mt-0.5">{i.unit_price > 0 ? `${fmt(i.unit_price)} / un` : 'a orçar'}</p>
                </div>
                {(() => {
                  const step = Math.max(1, i.min_order_qty || 1);  // sobe/desce pelo pedido mínimo (ex.: 10)
                  return (
                    <div className="flex items-center border border-gray-200 rounded-lg overflow-hidden">
                      <button onClick={() => setQty(k, Math.max(step, i.quantity - step))} className="px-2 py-2 hover:bg-gray-50"><Minus size={13} /></button>
                      <input type="number" min={step} step={step} value={i.quantity}
                        onChange={e => setQty(k, Math.max(1, parseInt(e.target.value) || 1))}
                        onBlur={e => { if ((parseInt(e.target.value) || 0) < step) setQty(k, step); }}
                        className="w-16 text-center font-bold outline-none text-sm" />
                      <button onClick={() => setQty(k, i.quantity + step)} className="px-2 py-2 hover:bg-gray-50"><Plus size={13} /></button>
                    </div>
                  );
                })()}
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
          {!customer ? (
            /* Login obrigatório para solicitar o orçamento */
            <div className="bg-white rounded-2xl border border-gray-100 p-6 sticky top-20 text-center space-y-4">
              <div className="pb-3 border-b border-gray-100 flex justify-between items-center text-left">
                <span className="font-semibold text-gray-600">Total estimado</span>
                <span className="text-2xl font-extrabold text-gray-900">{fmt(total)}</span>
              </div>
              <div className="w-14 h-14 rounded-2xl bg-orange-500 flex items-center justify-center mx-auto">
                <User size={26} className="text-white" />
              </div>
              <h2 className="text-lg font-black text-gray-900">Entre para finalizar</h2>
              <p className="text-sm text-gray-500">
                Faça login com seu CPF para solicitar o orçamento e acompanhar tudo pela loja. Seu carrinho fica salvo.
              </p>
              <Link to="/loja/login?next=/loja/carrinho"
                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
                <LogIn size={18} /> Entrar e continuar
              </Link>
              <p className="text-xs text-gray-400">
                Ainda não tem cadastro?{' '}
                <Link to="/cadastro" className="text-orange-600 font-bold hover:underline">Cadastre-se</Link>
              </p>
            </div>
          ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-gray-100 p-5 sticky top-20 space-y-3">
            <div className="pb-3 border-b border-gray-100 space-y-1">
              <div className="flex justify-between text-sm text-gray-500"><span>Produtos</span><span>{fmt(total)}</span></div>
              {freteSel && (
                <div className="flex justify-between text-sm text-gray-500">
                  <span>Frete{freteSel.service ? ` (${freteSel.service})` : ''}</span>
                  <span>{fv.text}</span>
                </div>
              )}
              <div className="flex justify-between items-center pt-1">
                <span className="font-semibold text-gray-600">Total estimado</span>
                <span className="text-2xl font-extrabold text-gray-900">{fmt(totalEstimado)}</span>
              </div>
              {fv.quote && freteSel && <p className="text-[11px] text-gray-400 text-right">+ frete a combinar</p>}
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
                  {freteOpts.map(o => {
                    const ov = freightView(o);
                    return (
                      <label key={o.id} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${freteSel?.id === o.id ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}>
                        <input type="radio" checked={freteSel?.id === o.id} onChange={() => setFreteSel(o)} className="accent-orange-500" />
                        <span className="flex-1 truncate">{o.company} {o.service}{o.days ? ` · ${o.days} dias` : ''}</span>
                        <span className="font-bold whitespace-nowrap">{ov.text}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Cliente (do cadastro — login obrigatório) */}
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Pedido para</p>
              <p className="font-semibold text-gray-800">{customer.name}</p>
              <p className="text-gray-500 text-xs">{customer.phone || customer.mobile}{customer.email ? ` · ${customer.email}` : ''}</p>
              <Link to="/loja/perfil" className="text-orange-600 text-xs font-medium hover:underline">Atualizar meus dados</Link>
            </div>

            <textarea className={`${INPUT} resize-none`} rows={2} placeholder="Observações (arte, prazo, etc.)"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />

            {/* Data do evento — no momento de enviar */}
            <div className="bg-orange-50/70 border border-orange-100 rounded-xl p-3">
              <label className="flex items-center gap-1.5 text-xs font-bold text-orange-700 mb-1.5">
                <CalendarHeart size={14} /> Para quando você precisa? (data do evento)
              </label>
              <input type="date" className={INPUT} min={todayISO} value={form.event_date}
                onChange={e => setForm(p => ({ ...p, event_date: e.target.value }))} />
              <p className="text-[11px] text-orange-500/80 mt-1.5">
                Essa data é apenas informativa pra nossa equipe se esforçar pra garantir o quanto antes a entrega dos produtos solicitados.
              </p>
            </div>

            <button type="submit" disabled={sending}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-semibold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
              {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><Package size={18} /> Solicitar orçamento</>}
            </button>
            <p className="text-xs text-gray-400 text-center">Sem compromisso — é um pedido de orçamento.</p>
          </form>
          )}
        </div>
      </div>
    </div>
  );
}
