import { useState, useEffect, useRef, useMemo } from 'react';
import { CheckCircle2, Loader2, Building2, Instagram, ExternalLink, Play } from 'lucide-react';
import storeApi from '@/store/storeApi';
import '@/store/store.css';
import toast from 'react-hot-toast';
import CadastroDone from './CadastroDone';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition';

const maskCNPJ = v => v.replace(/\D/g,'').slice(0,14).replace(/(\d{2})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1/$2').replace(/(\d{4})(\d{1,2})$/,'$1-$2');
const maskPhone = v => { const d=v.replace(/\D/g,'').slice(0,11); return d.length<=10 ? d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2') : d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2'); };
const maskCEP = v => v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');
const maskCPF = v => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
const igHandle = v => String(v||'').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?].*$/,'').replace(/^@/,'');

function validCPF(v) {
  const c = String(v||'').replace(/\D/g,'');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0; return d === +c[10];
}
function validIG(v) {
  const h = igHandle(v);
  if (!h) return true;
  if (h.length > 30) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return false;
  if (/^\./.test(h) || /\.$/.test(h) || /\.\./.test(h)) return false;
  return true;
}

function validCNPJ(v) {
  const c = String(v||'').replace(/\D/g,'');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len) => { let pos = len - 7, sum = 0; for (let i = len; i >= 1; i--) { sum += +c[len - i] * pos--; if (pos < 2) pos = 9; } const r = sum % 11; return r < 2 ? 0 : 11 - r; };
  return calc(12) === +c[12] && calc(13) === +c[13];
}

function Field({ label, children }) {
  return (<div><label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>{children}</div>);
}

// Estrelinhas brancas girando no fundo preto da abertura
function Starfield() {
  const stars = useMemo(() => Array.from({ length: 90 }, () => ({
    top: Math.random() * 100, left: Math.random() * 100,
    size: Math.random() * 2 + 1, delay: Math.random() * 4, dur: Math.random() * 2.5 + 1.8,
  })), []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-[-25%] st-spin-slower">
        {stars.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-white" style={{
            top: `${s.top}%`, left: `${s.left}%`, width: s.size, height: s.size,
            boxShadow: '0 0 4px rgba(255,255,255,.85)',
            animation: `st-twinkle ${s.dur}s ease-in-out ${s.delay}s infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function InstaInput({ value, onChange }) {
  const handle = igHandle(value);
  const invalid = !!String(value).trim() && !validIG(value);
  return (
    <div>
      <div className="relative">
        <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500" />
        <input className={`${INPUT} pl-9 pr-9 ${invalid ? 'border-red-400 focus:border-red-400 focus:ring-red-100' : ''}`}
          value={value} placeholder="@sua_empresa" onChange={e => onChange(e.target.value)} />
        {handle && !invalid && (
          <a href={`https://instagram.com/${handle}`} target="_blank" rel="noreferrer" title="Abrir perfil para conferir"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-500"><ExternalLink size={15} /></a>
        )}
      </div>
      {invalid && <p className="text-xs text-red-500 mt-1">Instagram inválido — use só letras, números, ponto e _</p>}
    </div>
  );
}

export default function CadastroFornecedor() {
  const [f, setF] = useState({ name:'', nome_fantasia:'', cnpj:'', ie:'', email:'', phone:'', mobile:'', contact_name:'', instagram:'' });
  const [ieIsento, setIeIsento] = useState(false);
  const [addr, setAddr] = useState({ zip:'', street:'', number:'', complement:'', neighborhood:'', city:'', state:'' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [storeCfg, setStoreCfg] = useState(null);
  const [contrato, setContrato] = useState(null);
  const [resp, setResp] = useState({ name: '', cpf: '', cargo: '' });
  const [note, setNote] = useState('');
  // CNPJ já cadastrado → o envio vira PEDIDO de alteração, que só vale depois
  // que a equipe da Lyon aprovar dentro do sistema.
  const [jaCadastrado, setJaCadastrado] = useState(false);
  const [pendente, setPendente] = useState(null); // protocolo do pedido enviado

  // Config do site (modo manutenção dos cadastros)
  useEffect(() => { storeApi.get('/store').then(d => setStoreCfg(d?.cadastro || null)).catch(() => {}); }, []);

  // Abertura: botão → vídeo (com som) → preto → card sobe.
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
    if (phase === 'video') t = setTimeout(() => setPhase('black2'), 20000);
    else if (phase === 'black2') t = setTimeout(() => setPhase('form'), 700);
    return () => clearTimeout(t);
  }, [phase]);

  const set = (k,v) => setF(p => ({ ...p, [k]: v }));
  const setA = (k,v) => setAddr(p => ({ ...p, [k]: typeof v === 'string' ? v.toUpperCase() : v }));

  async function lookupCep(cepRaw) {
    const cep = cepRaw.replace(/\D/g,''); if (cep.length !== 8) return;
    try {
      const res = await fetch(`/api/cep/${cep}`);
      if (!res.ok) return;
      const d = await res.json();
      const up = s => (s ? String(s).toUpperCase() : null);
      setAddr(p => ({ ...p, street:up(d.street)||p.street, neighborhood:up(d.neighborhood)||p.neighborhood, city:up(d.city)||p.city, state:d.state||p.state }));
    } catch {}
  }

  // O CNPJ já tem cadastro? A resposta é só sim/não — nenhum dado do
  // cadastro existente é devolvido para o link público.
  async function checkExistente(cnpjRaw) {
    const digits = cnpjRaw.replace(/\D/g, ''); if (digits.length !== 14) return;
    try {
      const r = await storeApi.post('/check-doc-empresa', { entity: 'fornecedor', cnpj: digits });
      setJaCadastrado(!!r?.exists);
    } catch { /* erro de rede → segue como cadastro novo */ }
  }

  // Puxa os dados da empresa pelo CNPJ (proxy interno /api/cnpj)
  async function lookupCnpj(cnpjRaw) {
    const digits = cnpjRaw.replace(/\D/g,''); if (digits.length !== 14) return;
    setCnpjLoading(true);
    try {
      const r = await fetch(`/api/cnpj/${digits}`);
      if (!r.ok) { toast.error('CNPJ não encontrado'); return; }
      const d = await r.json();
      const up = s => (s ? String(s).toUpperCase() : null);
      setF(p => ({ ...p,
        name: up(d.name) || p.name,
        nome_fantasia: p.nome_fantasia || up(d.trade_name) || '',
        ie: d.ie || p.ie,
        email: p.email || d.email || '',
        phone: p.phone || (d.phone ? maskPhone(d.phone) : ''),
      }));
      if (d.ie) setIeIsento(false);
      setAddr(p => ({ ...p,
        zip: d.zip ? maskCEP(d.zip) : p.zip,
        street: up(d.street) || p.street,
        number: d.number || p.number,
        complement: up(d.complement) || p.complement,
        neighborhood: up(d.neighborhood) || p.neighborhood,
        city: up(d.city) || p.city,
        state: d.state || p.state,
      }));
      toast.success('Dados da empresa preenchidos!');
    } catch { toast.error('Não consegui buscar o CNPJ'); }
    finally { setCnpjLoading(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error('Informe a razão social');
    if (!f.cnpj.trim()) return toast.error('Informe o CNPJ');
    if (!validCNPJ(f.cnpj)) return toast.error('CNPJ inválido. Confira os números.');
    if (!ieIsento && !f.ie.trim()) return toast.error('Informe a Inscrição Estadual (ou marque Isento)');
    if (!f.contact_name.trim()) return toast.error('Informe o contato / vendedor(a)');
    if (!f.email.trim()) return toast.error('Informe o e-mail');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('E-mail inválido');
    if (f.instagram.trim() && !validIG(f.instagram)) return toast.error('Instagram inválido — confira o @perfil');
    if (!f.phone.trim()) return toast.error('Informe o telefone / WhatsApp');
    if (!addr.zip.trim() || !addr.street.trim() || !addr.number.trim() || !addr.neighborhood.trim() || !addr.city.trim() || !addr.state.trim())
      return toast.error('Preencha o endereço completo (CEP, rua, número, bairro, cidade e estado)');
    if (!resp.name.trim() || !resp.cargo.trim()) return toast.error('Informe o nome completo e o cargo de quem está enviando o cadastro.');
    if (!validCPF(resp.cpf)) return toast.error('CPF inválido. Confira os números digitados.');
    // No pedido de atualização o contrato é opcional — só é obrigatório no
    // cadastro novo.
    if (!jaCadastrado && !contrato) return toast.error('Anexe o Contrato Comercial assinado para finalizar o cadastro.');
    setSending(true);
    try {
      const fd = new FormData();
      fd.append('name', f.name);
      fd.append('nome_fantasia', f.nome_fantasia);
      fd.append('cnpj', f.cnpj);
      fd.append('ie', ieIsento ? 'ISENTO' : f.ie);
      fd.append('ie_isento', ieIsento ? 'true' : '');
      fd.append('email', f.email);
      fd.append('phone', f.phone);
      fd.append('mobile', f.mobile);
      fd.append('contact_name', f.contact_name);
      fd.append('instagram', igHandle(f.instagram));
      fd.append('address', JSON.stringify(addr));
      fd.append('responsible_name', resp.name.trim());
      fd.append('responsible_cpf', resp.cpf);
      fd.append('responsible_cargo', resp.cargo.trim());
      fd.append('note', note.trim());
      if (contrato) fd.append('contrato', contrato);
      const res = await storeApi.post('/cadastro-fornecedor', fd);
      if (res?.pending) setPendente(res.protocolo || '—');
      else setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível enviar. Tente novamente.');
    } finally { setSending(false); }
  }

  const Bg = (
    <>
      <video autoPlay muted loop playsInline className="fixed inset-0 w-full h-full object-cover" style={{ zIndex: -2 }}>
        <source src="/cadastro-bg.mp4" type="video/mp4" />
      </video>
      <div className="fixed inset-0 bg-gradient-to-br from-white/60 via-white/40 to-fuchsia-50/50" style={{ zIndex: -1 }} />
    </>
  );

  // Pedido de atualização enviado — nada mudou ainda no sistema.
  if (pendente) {
    return <CadastroDone whatsapp={storeCfg?.whatsapp}
      title="PEDIDO ENVIADO PARA APROVAÇÃO"
      message={`Recebemos seu pedido de atualização (protocolo ${pendente}). Nossa equipe confere e aprova — até lá o cadastro continua como está.`} />;
  }

  // Modo manutenção: mostra só o card "VOCÊ CONCLUIU O CADASTRO"
  // Concluiu o cadastro → volta para o WhatsApp.
  if (done) {
    return <CadastroDone message={storeCfg?.message} whatsapp={storeCfg?.whatsapp} />;
  }

  return (
    <div className="cadastro-publico min-h-screen relative overflow-hidden py-8 px-4 bg-black">
      {/* Abertura cinematográfica */}
      {phase !== 'form' && (
        <div className="fixed inset-0 z-50 bg-black">
          <Starfield />
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
          <h1 className="text-2xl sm:text-3xl font-black leading-tight st-gradient-text">CADASTRE SUA EMPRESA COMO FORNECEDORA DA LYON COPOS!</h1>
          <p className="text-gray-500 mt-2 text-sm">Preencha os dados da sua empresa abaixo. Leva menos de 1 minuto.</p>
        </div>

        <form onSubmit={submit} className="bg-white/90 backdrop-blur rounded-3xl shadow-xl p-6 sm:p-8 space-y-4">
          {/* CNPJ já cadastrado → o envio é um pedido de alteração */}
          {jaCadastrado && (
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <span className="text-xl leading-none">🔒</span>
              <div className="text-sm">
                <p className="font-bold text-amber-900">Este CNPJ já está cadastrado</p>
                <p className="text-amber-800 mt-0.5">
                  Preencha os dados atualizados e, se quiser, anexe documentos. Por segurança, nada é alterado na hora:
                  o pedido vai para a conferência da equipe Lyon e só vale depois de aprovado.
                </p>
              </div>
            </div>
          )}

          <Field label="Razão Social *">
            <input className={INPUT} value={f.name} onChange={e => set('name', e.target.value.toUpperCase())} />
          </Field>

          <Field label="Nome Fantasia">
            <input className={INPUT} value={f.nome_fantasia} placeholder="Nome comercial (auto-preenchido)" onChange={e => set('nome_fantasia', e.target.value.toUpperCase())} />
          </Field>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="CNPJ *">
              <input className={INPUT} value={f.cnpj} placeholder="00.000.000/0000-00"
                onChange={e => { const v = maskCNPJ(e.target.value); set('cnpj', v); const d = v.replace(/\D/g,''); if (d.length !== 14) setJaCadastrado(false); if (d.length === 14 && validCNPJ(d)) { checkExistente(v); lookupCnpj(v); } }}
                onBlur={() => validCNPJ(f.cnpj) && lookupCnpj(f.cnpj)} />
              {cnpjLoading && <p className="text-xs text-violet-500 mt-1 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> buscando dados...</p>}
              {f.cnpj.replace(/\D/g,'').length === 14 && !validCNPJ(f.cnpj) && (
                <p className="text-xs text-red-500 mt-1">CNPJ inválido — confira os números digitados</p>
              )}
            </Field>
            <Field label={`Inscrição Estadual (IE)${ieIsento ? '' : ' *'}`}>
              <input className={INPUT} value={ieIsento ? 'ISENTO' : f.ie} disabled={ieIsento} onChange={e => set('ie', e.target.value.replace(/\D/g,''))} placeholder="000.000.000.000" />
              <label className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={ieIsento} onChange={e => setIeIsento(e.target.checked)} className="accent-violet-600 w-3.5 h-3.5" /> Isento de IE
              </label>
            </Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Contato / Vendedor(a) *"><input className={INPUT} value={f.contact_name} onChange={e => set('contact_name', e.target.value.toUpperCase())} /></Field>
            <Field label="E-mail *"><input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Telefone / WhatsApp *"><input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
            <Field label="Telefone Comercial"><input className={INPUT} value={f.mobile} placeholder="(44) 3333-3333" onChange={e => set('mobile', maskPhone(e.target.value))} /></Field>
          </div>

          <Field label="Instagram"><InstaInput value={f.instagram} onChange={v => set('instagram', v)} /></Field>

          {/* Endereço */}
          <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Endereço</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="CEP *"><input className={INPUT} value={addr.zip} placeholder="00000-000"
                onChange={e => { const v = maskCEP(e.target.value); setA('zip', v); if (v.replace(/\D/g, '').length === 8) lookupCep(v); }}
                onBlur={e => lookupCep(e.target.value)} /></Field>
              <Field label="Rua / Logradouro *"><input className={INPUT} value={addr.street} onChange={e => setA('street', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Número *"><input className={INPUT} value={addr.number} onChange={e => setA('number', e.target.value)} /></Field>
              <Field label="Complemento"><input className={INPUT} value={addr.complement} onChange={e => setA('complement', e.target.value)} /></Field>
              <Field label="Bairro *"><input className={INPUT} value={addr.neighborhood} onChange={e => setA('neighborhood', e.target.value)} /></Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Cidade *"><input className={INPUT} value={addr.city} onChange={e => setA('city', e.target.value)} /></Field>
              <Field label="Estado *">
                <select className={INPUT} value={addr.state} onChange={e => setA('state', e.target.value)}>
                  <option value="">UF</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </Field>
            </div>
          </div>

          {/* Documento obrigatório + responsável */}
          <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Contrato assinado e responsável</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-700">Contrato Comercial assinado {jaCadastrado ? '' : '*'}</p>
                <p className={`text-xs truncate ${contrato ? 'text-green-600' : 'text-gray-400'}`}>
                  {contrato ? contrato.name
                    : jaCadastrado ? 'Opcional — anexe só se quiser enviar um contrato novo'
                    : 'Nenhum arquivo (PDF, imagem ou documento)'}
                </p>
              </div>
              <label className="shrink-0 inline-flex items-center gap-1.5 bg-violet-100 text-violet-700 hover:bg-violet-200 text-sm font-medium px-3 py-2 rounded-xl cursor-pointer transition">
                {contrato ? 'Trocar' : 'Anexar'}
                <input type="file" className="hidden"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  onChange={e => { const x = e.target.files[0]; if (x) setContrato(x); e.target.value = ''; }} />
              </label>
            </div>
            <Field label="Quem está enviando (nome completo) *">
              <input className={INPUT} value={resp.name} onChange={e => setResp(p => ({ ...p, name: e.target.value }))} />
            </Field>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="CPF *">
                <input className={INPUT} value={resp.cpf} placeholder="000.000.000-00" maxLength={14}
                  onChange={e => setResp(p => ({ ...p, cpf: maskCPF(e.target.value) }))} />
              </Field>
              <Field label="Cargo *">
                <input className={INPUT} value={resp.cargo} placeholder="Ex: Comercial"
                  onChange={e => setResp(p => ({ ...p, cargo: e.target.value }))} />
              </Field>
            </div>
            {jaCadastrado && (
              <Field label="O que mudou? (ajuda a aprovar mais rápido)">
                <textarea className={INPUT} rows={2} value={note} onChange={e => setNote(e.target.value)}
                  placeholder="Ex: trocamos o telefone e o vendedor responsável" />
              </Field>
            )}
          </div>

          <button type="submit" disabled={sending}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</>
              : <><Building2 size={18} /> {jaCadastrado ? 'Enviar pedido de atualização' : 'Enviar cadastro'}</>}
          </button>
          <p className="text-xs text-gray-400 text-center">
            {jaCadastrado
              ? 'A atualização só entra no sistema depois que nossa equipe aprovar.'
              : 'Seus dados são usados apenas para o cadastro de fornecedores.'}
          </p>
        </form>
      </div>
      </>)}
    </div>
  );
}
