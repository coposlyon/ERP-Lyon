import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Copy, Check, CheckCircle2, Clock, Upload, Loader2, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

// Comprovante costuma ser print/foto de celular: reduz antes de subir.
function fileToDataUrl(file, max = 1400) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new Image();
      img.onerror = () => resolve(ev.target.result);
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        if (s >= 1) return resolve(ev.target.result);
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function restante(iso) {
  if (!iso) return null;
  const ms = new Date(iso) - new Date();
  if (ms <= 0) return 'expirado';
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

/**
 * Tela de pagamento PIX do pedido da loja. O dinheiro cai direto na conta
 * da Lyon; a confirmação é feita pela equipe dentro do ERP — por isso esta
 * tela fica consultando o pedido até ele ser liberado.
 */
export default function PixPayment({ order, snapshot }) {
  const [status, setStatus]   = useState('aguardando_pagamento');
  const [number, setNumber]   = useState(null);
  const [copied, setCopied]   = useState(false);
  const [avisando, setAvisando] = useState(false);
  const [avisado, setAvisado] = useState(false);
  const [prazo, setPrazo]     = useState(() => restante(order.expires_at));
  const fileRef = useRef(null);

  const pago = status === 'pago';

  // Consulta o pedido até o pagamento ser confirmado no ERP.
  useEffect(() => {
    if (pago) return;
    let tentativas = 0;
    const id = setInterval(async () => {
      if (++tentativas > 120) return clearInterval(id);   // ~20 min de tela aberta
      try {
        const r = await storeApi.get(`/pedido/${order.order_id}`);
        if (r?.status && r.status !== 'aguardando_pagamento') {
          setStatus(r.status); setNumber(r.number || null); clearInterval(id);
        }
      } catch { /* rede instável: tenta de novo no próximo tique */ }
    }, 10000);
    return () => clearInterval(id);
  }, [order.order_id, pago]);

  useEffect(() => {
    if (pago) return;
    const id = setInterval(() => setPrazo(restante(order.expires_at)), 60000);
    return () => clearInterval(id);
  }, [order.expires_at, pago]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(order.pix.copy_paste);
      setCopied(true); setTimeout(() => setCopied(false), 2500);
      toast.success('Código PIX copiado!');
    } catch {
      toast.error('Não consegui copiar. Selecione o código e copie manualmente.');
    }
  }

  async function avisar(file) {
    setAvisando(true);
    try {
      const receipt = file ? await fileToDataUrl(file) : null;
      await storeApi.post(`/pedido/${order.order_id}/paguei`, { receipt });
      setAvisado(true);
      toast.success('Avisamos a equipe! Assim que conferirmos, seu pedido entra em produção.');
    } catch {
      toast.error('Não consegui avisar agora. Tente de novo em instantes.');
    } finally { setAvisando(false); }
  }

  // ── Pagamento confirmado ──
  if (pago) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden text-center">
          <div className="text-white px-6 py-8" style={{ background: 'linear-gradient(120deg,#16a34a,#059669)' }}>
            <CheckCircle2 size={40} className="mx-auto mb-2" />
            <h1 className="text-2xl font-black">Pagamento confirmado!</h1>
            <p className="text-white/85 text-sm mt-1">
              {number ? `Pedido nº ${number} liberado para produção` : 'Seu pedido foi liberado para produção'}
            </p>
          </div>
          <div className="p-6 sm:p-8">
            <p className="text-gray-500">
              Recebemos o seu PIX de <b className="text-gray-800">{fmt(order.total)}</b>. A partir de agora você
              acompanha a produção pela sua área de pedidos.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 mt-6">
              <Link to="/loja/pedidos" className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-5 py-3 rounded-xl transition-colors">
                Acompanhar meu pedido
              </Link>
              <Link to="/loja" className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold px-5 py-3 rounded-xl transition-colors">
                Voltar à loja
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const expirado = prazo === 'expirado' || status === 'expirado';

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="text-white px-6 sm:px-8 py-7" style={{ background: 'linear-gradient(120deg,#ff7a18,#ff2d75 50%,#8a2be2 100%)' }}>
          <div className="flex items-center gap-2 text-white/90 text-sm font-bold">
            <QrCode size={18} /> Pague com PIX para liberar o pedido
          </div>
          <h1 className="text-3xl font-black mt-1">{fmt(order.total)}</h1>
          <p className="text-white/80 text-sm mt-1">
            {snapshot?.items?.length || order.items} {(snapshot?.items?.length || order.items) === 1 ? 'item' : 'itens'}
            {order.pix?.merchant ? ` · ${order.pix.merchant}` : ''}
          </p>
        </div>

        <div className="p-6 sm:p-8">
          {expirado ? (
            <div className="bg-red-50 border border-red-100 text-red-700 rounded-xl px-4 py-3 text-sm mb-5">
              O prazo deste PIX terminou. Se você já pagou, avise a equipe pelo WhatsApp que a gente confere.
              Se ainda não pagou, é só refazer o pedido.
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-5">
              <Clock size={15} className="text-orange-500" />
              {prazo ? <>Você tem <b className="text-gray-700">{prazo}</b> para pagar</> : 'Pague para liberar a produção'}
            </div>
          )}

          {/* QR */}
          {order.pix?.qr_base64 && (
            <div className="flex justify-center mb-5">
              <img src={`data:image/png;base64,${order.pix.qr_base64}`} alt="QR Code do PIX"
                className="w-56 h-56 rounded-2xl border border-gray-100 p-2" />
            </div>
          )}

          {/* Copia e cola */}
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-1.5">PIX copia e cola</p>
          <div className="flex gap-2">
            <input readOnly value={order.pix?.copy_paste || ''} onFocus={e => e.target.select()}
              className="flex-1 min-w-0 px-3 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-xs font-mono text-gray-600 outline-none" />
            <button onClick={copiar}
              className="shrink-0 bg-gray-900 hover:bg-gray-800 text-white font-semibold px-4 rounded-xl flex items-center gap-1.5 transition-colors">
              {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Copiado' : 'Copiar'}
            </button>
          </div>

          <ol className="mt-6 space-y-2 text-sm text-gray-500 list-decimal list-inside">
            <li>Abra o app do seu banco e escolha <b className="text-gray-700">Pagar com PIX</b>.</li>
            <li>Escaneie o QR ou cole o código acima.</li>
            <li>Confira o valor de <b className="text-gray-700">{fmt(order.total)}</b> e conclua.</li>
            <li>Assim que a equipe confirmar o recebimento, seu pedido entra em produção — esta tela avisa sozinha.</li>
          </ol>

          {/* Já paguei */}
          <div className="mt-6 border-t border-gray-100 pt-5">
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (f) avisar(f); }} />
            {avisado ? (
              <p className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3">
                <CheckCircle2 size={16} /> Avisamos a equipe. É só aguardar a confirmação.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <button onClick={() => avisar(null)} disabled={avisando}
                  className="flex-1 bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-semibold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  {avisando ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Já paguei
                </button>
                <button onClick={() => fileRef.current?.click()} disabled={avisando}
                  className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 font-semibold px-5 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                  <Upload size={16} /> Enviar comprovante
                </button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-3">
              O comprovante é opcional — ele só ajuda a equipe a localizar o seu pagamento mais rápido.
            </p>
          </div>

          <Link to="/loja/pedidos" className="block text-center text-sm text-gray-400 hover:text-orange-600 mt-6">
            Ver meus pedidos
          </Link>
        </div>
      </div>
    </div>
  );
}
