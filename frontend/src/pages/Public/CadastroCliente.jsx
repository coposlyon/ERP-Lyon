import { useState, useEffect, useRef } from 'react';
import { CheckCircle2, Loader2, User, Instagram, ExternalLink, Play } from 'lucide-react';
import storeApi from '@/store/storeApi';
import '@/store/store.css';
import toast from 'react-hot-toast';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition';

const maskCPF = v => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
const maskCNPJ = v => v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');
const maskPhone = v => { const d=v.replace(/\D/g,'').slice(0,11); return d.length<=10 ? d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2') : d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2'); };
const maskCEP = v => v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');
const igHandle = v => String(v||'').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?].*$/,'').replace(/^@/,'');

function Field({ label, children }) {
  return (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>);
}

export default function CadastroCliente() {
  const [type, setType] = useState('PF');
  const [f, setF] = useState({ name:'', cpf_cnpj:'', ie:'', email:'', phone:'', mobile:'', instagram:'' });
  const [ieIsento, setIeIsento] = useState(false);
  const [canPublish, setCanPublish] = useState('sim');
  const [addr, setAddr] = useState({ zip:'', street:'', number:'', complement:'', neighborhood:'', city:'', state:'' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  // Abertura: botão "INICIAR CADASTRO" → toca o vídeo (com som) → preto → card sobe.
  const [phase, setPhase] = useState('start'); // start | video | black2 | form
  const videoRef = useRef(null);

  function startIntro() {
    const v = videoRef.current;
    setPhase('video');
    if (!v) return;
    v.muted = false; v.volume = 1; v.currentTime = 0;
    const p = v.play();
    if (p && p.catch) p.catch(() => { v.muted = true; v.play().catch(() => setPhase('black2')); });
  }

  useEffect(() => {
    let t;
    if (phase === 'video') t = setTimeout(() => setPhase('black2'), 20000); // segurança
    else if (phase === 'black2') t = setTimeout(() => setPhase('form'), 700);
    return () => clearTimeout(t);
  }, [phase]);

  const set = (k,v) => setF(p => ({ ...p, [k]: v }));
  const setA = (k,v) => setAddr(p => ({ ...p, [k]: v }));
  const isPJ = type === 'PJ';

  async function lookupCep(cepRaw) {
    const cep = cepRaw.replace(/\D/g,''); if (cep.length !== 8) return;
    try {
      const d = await (await fetch(`https://viacep.com.br/ws/${cep}/json/`)).json();
      if (!d.erro) setAddr(p => ({ ...p, street:d.logradouro||p.street, neighborhood:d.bairro||p.neighborhood, city:d.localidade||p.city, state:d.uf||p.state }));
    } catch {}
  }

  // Puxa os dados da empresa pelo CNPJ (rota pública /api/cnpj)
  const [cnpjLoading, setCnpjLoading] = useState(false);
  async function lookupCnpj(cnpjRaw) {
    const digits = cnpjRaw.replace(/\D/g,''); if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const r = await fetch(`/api/cnpj/${digits}`);
      if (!r.ok) { toast.error('CNPJ não encontrado'); return; }
      const d = await r.json();
      setF(p => ({ ...p,
        name: d.name ? d.name.toUpperCase() : p.name,
        ie: d.ie || p.ie,
        email: p.email || d.email || '',
        phone: p.phone || (d.phone ? maskPhone(d.phone) : ''),
      }));
      if (d.ie) setIeIsento(false);
      setAddr(p => ({ ...p,
        zip: d.zip ? maskCEP(d.zip) : p.zip,
        street: d.street || p.street,
        number: d.number || p.number,
        complement: d.complement || p.complement,
        neighborhood: d.neighborhood || p.neighborhood,
        city: d.city || p.city,
        state: d.state || p.state,
      }));
      toast.success('Dados da empresa preenchidos!');
    } catch { toast.error('Não consegui buscar o CNPJ'); }
    finally { setCnpjLoading(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error('Informe o nome');
    if (!f.phone.trim() && !f.email.trim()) return toast.error('Informe telefone ou e-mail');
    if (isPJ && !ieIsento && !f.ie.trim()) return toast.error('Informe a Inscrição Estadual (ou marque Isento)');
    setSending(true);
    try {
      await storeApi.post('/cadastro', {
        type, name: f.name, cpf_cnpj: f.cpf_cnpj, email: f.email, phone: f.phone, mobile: f.mobile,
        instagram: igHandle(f.instagram),
        rg_ie: isPJ ? (ieIsento ? 'ISENTO' : f.ie) : null,
        ie_isento: isPJ ? ieIsento : false,
        can_publish: canPublish === 'sim',
        address: addr,
      });
      setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível enviar. Tente novamente.');
    } finally { setSending(false); }
  }

  const Bg = (
    <>
      <video autoPlay muted loop playsInline className="fixed inset-0 w-full h-full object-cover" style={{ zIndex: -2 }}>
        <source src="/cadastro-bg.mp4" type="video/mp4" />
      </video>
      {/* camada para legibilidade do formulário */}
      <div className="fixed inset-0 bg-gradient-to-br from-white/60 via-white/40 to-fuchsia-50/50" style={{ zIndex: -1 }} />
    </>
  );

  if (done) {
    return (
      <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-4">
        {Bg}
        <div className="relative z-10 bg-white/90 backdrop-blur rounded-3xl shadow-xl max-w-md w-full p-8 text-center st-float">
          <CheckCircle2 size={56} className="text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-gray-900">Cadastro enviado!</h1>
          <p className="text-gray-500 mt-2">Obrigado! Recebemos seus dados. Em breve nossa equipe entra em contato. 💜</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative overflow-hidden py-8 px-4 bg-black">
      {/* Abertura cinematográfica */}
      {phase !== 'form' && (
        <div className="fixed inset-0 z-50 bg-black">
          <video ref={videoRef} playsInline preload="auto"
            onEnded={() => setPhase('black2')} onError={() => setPhase('black2')}
            className={`w-full h-full object-contain transition-opacity duration-700 ${phase === 'video' ? 'opacity-100' : 'opacity-0'}`}>
            <source src="/cadastro-bg.mp4" type="video/mp4" />
          </video>

          {phase === 'start' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
              <img src="/lyon-logo.png" alt="Lyon Copos" className="h-24 sm:h-28 mb-8 object-contain st-float" onError={e => { e.target.style.display = 'none'; }} />
              <button type="button" onClick={startIntro}
                className="inline-flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-lg px-9 py-4 rounded-full shadow-2xl st-pulse transition-colors">
                <Play size={20} /> INICIAR CADASTRO
              </button>
            </div>
          )}

          {phase !== 'start' && (
            <button type="button" onClick={() => setPhase('form')} className="absolute bottom-5 right-6 text-white/60 text-xs hover:text-white z-10">Pular ›</button>
          )}
        </div>
      )}

      {phase === 'form' && (<>
      {Bg}
      <div className="relative z-10 max-w-xl mx-auto st-rise">
        <div className="text-center mb-6">
          <img src="/lyon-logo.png" alt="Lyon Copos" className="h-28 sm:h-32 mx-auto mb-3 object-contain st-float drop-shadow-xl" onError={e => { e.target.style.display='none'; }} />
          <h1 className="text-2xl sm:text-3xl font-black leading-tight st-gradient-text">FAÇA O SEU CADASTRO NO NOSSO SISTEMA LYON COPOS!</h1>
          <p className="text-gray-500 mt-2 text-sm">Preencha seus dados abaixo. Leva menos de 1 minuto.</p>
        </div>

        <form onSubmit={submit} className="bg-white/90 backdrop-blur rounded-3xl shadow-xl p-6 sm:p-8 space-y-4">
          <div className="flex gap-6">
            {['PF','PJ'].map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={type===t} onChange={() => setType(t)} className="accent-violet-600 w-4 h-4" />
                {t==='PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </label>
            ))}
          </div>

          <Field label={`${isPJ ? 'Razão Social' : 'Nome Completo'} *`}>
            <input className={INPUT} value={f.name} onChange={e => set('name', e.target.value)} />
          </Field>

          {isPJ ? (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="CNPJ">
                  <input className={INPUT} value={f.cpf_cnpj} placeholder="00.000.000/0000-00"
                    onChange={e => { const v = maskCNPJ(e.target.value); set('cpf_cnpj', v); if (v.replace(/\D/g, '').length === 14) lookupCnpj(v); }} />
                  {cnpjLoading && <p className="text-xs text-violet-500 mt-1 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> buscando dados...</p>}
                </Field>
                <Field label={`Inscrição Estadual (IE)${ieIsento ? '' : ' *'}`}>
                  <input className={INPUT} value={ieIsento ? 'ISENTO' : f.ie} disabled={ieIsento} onChange={e => set('ie', e.target.value.replace(/\D/g,''))} placeholder="000.000.000.000" />
                  <label className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 cursor-pointer">
                    <input type="checkbox" checked={ieIsento} onChange={e => setIeIsento(e.target.checked)} className="accent-violet-600 w-3.5 h-3.5" /> Isento de IE
                  </label>
                </Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="E-mail"><input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
                <Field label="Instagram"><InstaInput value={f.instagram} onChange={v => set('instagram', v)} /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Telefone / WhatsApp"><input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
                <Field label="Telefone p/ Recado"><input className={INPUT} value={f.mobile} placeholder="(44) 3333-3333" onChange={e => set('mobile', maskPhone(e.target.value))} /></Field>
              </div>
            </>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="CPF"><input className={INPUT} value={f.cpf_cnpj} placeholder="000.000.000-00" onChange={e => set('cpf_cnpj', maskCPF(e.target.value))} /></Field>
                <Field label="E-mail"><input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Telefone / WhatsApp"><input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
                <Field label="Telefone p/ Recado"><input className={INPUT} value={f.mobile} placeholder="(44) 3333-3333" onChange={e => set('mobile', maskPhone(e.target.value))} /></Field>
              </div>
              <Field label="Instagram"><InstaInput value={f.instagram} onChange={v => set('instagram', v)} /></Field>
            </>
          )}

          {/* Consentimento de publicação */}
          <div className="bg-violet-50/70 border border-violet-100 rounded-2xl p-4">
            <p className="text-sm font-medium text-gray-700 mb-2">Podemos publicar a foto do seu produto e te marcar no Instagram?</p>
            <div className="flex gap-2">
              {[['sim','Sim 💜'], ['nao','Não, obrigado']].map(([v, l]) => (
                <button type="button" key={v} onClick={() => setCanPublish(v)}
                  className={`flex-1 px-3 py-2 rounded-xl text-sm font-medium border-2 transition-colors ${canPublish===v ? 'border-violet-500 bg-violet-100 text-violet-700' : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>{l}</button>
              ))}
            </div>
          </div>

          {/* Endereço */}
          <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Endereço</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="CEP"><input className={INPUT} value={addr.zip} placeholder="00000-000"
                onChange={e => { const v = maskCEP(e.target.value); setA('zip', v); if (v.replace(/\D/g, '').length === 8) lookupCep(v); }}
                onBlur={e => lookupCep(e.target.value)} /></Field>
              <Field label="Rua / Logradouro"><input className={INPUT} value={addr.street} onChange={e => setA('street', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Número"><input className={INPUT} value={addr.number} onChange={e => setA('number', e.target.value)} /></Field>
              <Field label="Complemento"><input className={INPUT} value={addr.complement} onChange={e => setA('complement', e.target.value)} /></Field>
              <Field label="Bairro"><input className={INPUT} value={addr.neighborhood} onChange={e => setA('neighborhood', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Cidade"><input className={INPUT} value={addr.city} onChange={e => setA('city', e.target.value)} /></Field>
              <Field label="Estado">
                <select className={INPUT} value={addr.state} onChange={e => setA('state', e.target.value)}>
                  <option value="">UF</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <button type="submit" disabled={sending}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><User size={18} /> Enviar cadastro</>}
          </button>
          <p className="text-xs text-gray-400 text-center">Seus dados são usados apenas para atendimento e pedidos.</p>
        </form>
      </div>
      </>)}
    </div>
  );
}

function InstaInput({ value, onChange }) {
  const handle = igHandle(value);
  return (
    <div className="relative">
      <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500" />
      <input className={`${INPUT} pl-9 pr-9`} value={value} placeholder="@seu_perfil" onChange={e => onChange(e.target.value)} />
      {handle && (
        <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" title="Abrir perfil"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-500"><ExternalLink size={15} /></a>
      )}
    </div>
  );
}
