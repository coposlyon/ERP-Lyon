import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Megaphone, MessageCircle, Instagram, Facebook, Image as ImageIcon, X, Send, Loader2, Check, AlertTriangle, Star } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const CHANNELS = [
  { key: 'whatsapp',  label: 'WhatsApp',  icon: MessageCircle, color: 'text-green-600' },
  { key: 'instagram', label: 'Instagram', icon: Instagram,     color: 'text-pink-600' },
  { key: 'facebook',  label: 'Facebook',  icon: Facebook,      color: 'text-blue-600' },
];
const TYPES = [
  { value: 'cliente', label: 'Clientes (PF+PJ)' },
  { value: 'PF', label: 'Pessoa Física' },
  { value: 'PJ', label: 'Pessoa Jurídica' },
  { value: '', label: 'Todos' },
];

export default function Marketing() {
  const qc = useQueryClient();
  const fileRef = useRef(null);
  const [channels, setChannels] = useState({ whatsapp: false, instagram: false, facebook: false });
  const [message, setMessage] = useState('');
  const [title, setTitle] = useState('');
  const [image, setImage] = useState(null);
  const [type, setType] = useState('cliente');
  const [rating, setRating] = useState(null);
  const [result, setResult] = useState(null);

  const { data: status } = useQuery({ queryKey: ['mkt-status'], queryFn: () => api.get('/marketing/status') });
  const { data: audience } = useQuery({
    queryKey: ['mkt-audience', type, rating],
    queryFn: () => api.get(`/marketing/audience?type=${type}${rating ? `&rating=${rating}` : ''}`),
    enabled: channels.whatsapp,
  });
  const { data: campaigns } = useQuery({ queryKey: ['mkt-campaigns'], queryFn: () => api.get('/marketing/campaigns') });

  const selected = Object.keys(channels).filter(k => channels[k]);

  function pickImage(e) {
    const f = e.target.files?.[0]; if (!f) return; e.target.value = '';
    const r = new FileReader();
    r.onload = ev => setImage(ev.target.result);
    r.readAsDataURL(f);
  }

  const send = useMutation({
    mutationFn: () => api.post('/marketing/send', {
      title, message, image,
      channels: selected,
      segment: { type, rating },
    }),
    onSuccess: (r) => {
      setResult(r.results);
      qc.invalidateQueries(['mkt-campaigns']);
      toast.success('Campanha enviada!');
    },
    onError: (e) => toast.error(e.error || 'Erro ao enviar'),
  });

  const igNoImage = channels.instagram && !image;
  const canSend = selected.length > 0 && (message.trim() || image) && !igNoImage;

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center gap-3">
        <div className="w-9 h-9 bg-fuchsia-100 rounded-lg flex items-center justify-center"><Megaphone size={18} className="text-fuchsia-600" /></div>
        <div>
          <h1 className="page-title">Marketing</h1>
          <p className="text-sm text-gray-500 mt-0.5">Dispare WhatsApp e publique no Instagram e Facebook</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        {/* Compositor */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 space-y-3">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Canais</p>
            <div className="grid grid-cols-3 gap-2">
              {CHANNELS.map(c => {
                const on = channels[c.key];
                const configured = status?.[c.key];
                return (
                  <button key={c.key} onClick={() => setChannels(s => ({ ...s, [c.key]: !s[c.key] }))}
                    className={`relative px-3 py-3 rounded-xl border-2 flex flex-col items-center gap-1 transition-colors ${on ? 'border-fuchsia-500 bg-fuchsia-50' : 'border-gray-200 hover:border-gray-300'}`}>
                    <c.icon size={20} className={c.color} />
                    <span className="text-sm font-medium">{c.label}</span>
                    <span className={`text-[10px] ${configured ? 'text-green-600' : 'text-gray-400'}`}>{configured ? '● conectado' : '○ não configurado'}</span>
                    {on && <Check size={14} className="absolute top-1.5 right-1.5 text-fuchsia-600" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="card p-4 space-y-3">
            <input className="input font-medium" placeholder="Título da campanha (interno, opcional)" value={title} onChange={e => setTitle(e.target.value)} />
            <textarea className="input resize-none" rows={5} value={message} onChange={e => setMessage(e.target.value)}
              placeholder="Escreva a mensagem / legenda... Use {nome} para personalizar no WhatsApp." />
            <p className="text-xs text-gray-400">No WhatsApp, <b>{'{nome}'}</b> vira o nome do cliente.</p>

            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            {image ? (
              <div className="relative inline-block">
                <img src={image} alt="" className="max-h-44 rounded-xl border border-gray-200" />
                <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-white rounded-full shadow p-1 text-gray-500 hover:text-red-500"><X size={14} /></button>
              </div>
            ) : (
              <button onClick={() => fileRef.current?.click()} className="btn-secondary"><ImageIcon size={15} /> Anexar imagem</button>
            )}
            {igNoImage && <p className="text-xs text-pink-600 flex items-center gap-1"><AlertTriangle size={13} /> Instagram exige uma imagem.</p>}
          </div>

          {/* Audiência (WhatsApp) */}
          {channels.whatsapp && (
            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Público do WhatsApp</p>
              <div className="flex flex-wrap gap-2 items-center">
                <select className="input w-auto" value={type} onChange={e => setType(e.target.value)}>
                  {TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg px-2 py-1.5">
                  <span className="text-xs text-gray-400 mr-1">Avaliação:</span>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setRating(r => r === n ? null : n)}>
                      <Star size={15} className={n === rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'} />
                    </button>
                  ))}
                  {rating && <button onClick={() => setRating(null)} className="text-xs text-gray-400 ml-1">✕</button>}
                </div>
                <span className="text-sm text-fuchsia-700 font-medium ml-auto">{audience?.count ?? '—'} contatos</span>
              </div>
              <p className="text-[11px] text-gray-400">Envio proativo no WhatsApp pode exigir <b>template aprovado</b> na Meta (fora da janela de 24h).</p>
            </div>
          )}

          <button onClick={() => { setResult(null); send.mutate(); }} disabled={!canSend || send.isPending}
            className="btn-primary w-full py-3 disabled:opacity-50">
            {send.isPending ? <><Loader2 size={16} className="animate-spin" /> Enviando...</> : <><Send size={16} /> Enviar / Publicar{channels.whatsapp && audience?.count ? ` (${audience.count} no WhatsApp)` : ''}</>}
          </button>

          {result && (
            <div className="card p-4 space-y-2">
              <p className="text-sm font-semibold text-gray-700">Resultado</p>
              {result.whatsapp && <ResultLine label="WhatsApp" ok={result.whatsapp.sent > 0} text={`${result.whatsapp.sent}/${result.whatsapp.total} enviados${result.whatsapp.failed ? `, ${result.whatsapp.failed} falharam` : ''}${result.whatsapp.error ? ` — ${result.whatsapp.error}` : ''}`} />}
              {result.instagram && <ResultLine label="Instagram" ok={result.instagram.ok} text={result.instagram.ok ? 'Publicado!' : result.instagram.error} />}
              {result.facebook && <ResultLine label="Facebook" ok={result.facebook.ok} text={result.facebook.ok ? 'Publicado!' : result.facebook.error} />}
            </div>
          )}
        </div>

        {/* Histórico */}
        <div className="card p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Campanhas recentes</p>
          <div className="space-y-2 max-h-[70vh] overflow-y-auto">
            {(campaigns || []).length === 0 && <p className="text-sm text-gray-400">Nenhuma campanha ainda.</p>}
            {(campaigns || []).map(c => (
              <div key={c.id} className="border border-gray-100 rounded-lg p-2.5">
                <div className="flex items-center gap-1.5 mb-1">
                  {(c.channels || []).map(ch => {
                    const def = CHANNELS.find(x => x.key === ch);
                    return def ? <def.icon key={ch} size={13} className={def.color} /> : null;
                  })}
                  <span className="text-xs text-gray-400 ml-auto">{new Date(c.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                <p className="text-sm font-medium truncate">{c.title || c.message?.slice(0, 40) || 'Campanha'}</p>
                {c.results?.whatsapp && <p className="text-xs text-gray-400">WhatsApp: {c.results.whatsapp.sent}/{c.results.whatsapp.total}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function ResultLine({ label, ok, text }) {
  return (
    <div className={`flex items-start gap-2 text-sm ${ok ? 'text-green-700' : 'text-red-600'}`}>
      {ok ? <Check size={15} className="mt-0.5 shrink-0" /> : <AlertTriangle size={15} className="mt-0.5 shrink-0" />}
      <span><b>{label}:</b> {text}</span>
    </div>
  );
}
