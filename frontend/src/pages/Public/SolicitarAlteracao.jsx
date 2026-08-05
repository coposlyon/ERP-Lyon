import { useState } from 'react';
import { CheckCircle2, Loader2, ShieldCheck, Paperclip, X, FileText } from 'lucide-react';
import storeApi from '@/store/storeApi';
import toast from 'react-hot-toast';

// Pedido de alteração de um cadastro que JÁ existe.
//
// Regra: informar o CPF/CNPJ não dá acesso a nada. Nenhum dado do cadastro
// atual é mostrado aqui — quem pede preenche só o que quer mudar e a nossa
// equipe confere e aprova dentro do sistema antes de valer.

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm transition';
const MAX_MB = 10;
const MAX_DOCS = 6;

const maskCPF = v => v.replace(/\D/g,'').slice(0,11).replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d)/,'$1.$2').replace(/(\d{3})(\d{1,2})$/,'$1-$2');
const maskPhone = v => { const d=v.replace(/\D/g,'').slice(0,11); return d.length<=10 ? d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2') : d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2'); };
const maskCEP = v => v.replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');
const maskDate = v => v.replace(/\D/g,'').slice(0,8).replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2');
const igHandle = v => String(v||'').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?].*$/,'').replace(/^@/,'');

function validCPF(v) {
  const c = String(v||'').replace(/\D/g,'');
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i);
  let d = (s * 10) % 11; if (d === 10) d = 0; if (d !== +c[9]) return false;
  s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i);
  d = (s * 10) % 11; if (d === 10) d = 0; return d === +c[10];
}

function brToISO(s) {
  const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (isNaN(dt) || dt.getFullYear() !== +y || dt.getMonth()+1 !== +mo || dt.getDate() !== +d) return null;
  if (+y < 1900 || dt > new Date()) return null;
  return `${y}-${mo}-${d}`;
}

function Field({ label, children, hint }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

const vazio = { name:'', rg_ie:'', birth_date:'', email:'', phone:'', mobile:'', instagram:'' };
const vazioAddr = { zip:'', street:'', number:'', complement:'', neighborhood:'', city:'', state:'' };

/**
 * props:
 *  doc      — CPF/CNPJ já digitado (mascarado)
 *  isPJ     — pessoa jurídica?
 *  prefill  — { ...campos, address } quando o cliente já revisou os próprios
 *             dados (fluxo de login por data de nascimento). Sem prefill, o
 *             formulário abre em branco: campo vazio = "não mexer".
 *  onCancel / onDone
 */
export default function SolicitarAlteracao({ doc, isPJ, prefill, onCancel, onDone }) {
  const [f, setF] = useState({ ...vazio, ...(prefill || {}) });
  const [addr, setAddr] = useState({ ...vazioAddr, ...(prefill?.address || {}) });
  const [canPublish, setCanPublish] = useState(prefill?.can_publish || '');
  const [docs, setDocs] = useState([]);
  const [quem, setQuem] = useState({ name: '', cpf: '', cargo: '' });
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [protocolo, setProtocolo] = useState(null);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setA = (k, v) => setAddr(p => ({ ...p, [k]: typeof v === 'string' ? v.toUpperCase() : v }));
  const preenchido = prefill != null;

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

  function addDocs(lista) {
    const novos = [];
    for (const file of lista) {
      if (file.size > MAX_MB * 1024 * 1024) { toast.error(`"${file.name}" passa de ${MAX_MB} MB`); continue; }
      novos.push(file);
    }
    setDocs(p => {
      const junto = [...p, ...novos];
      if (junto.length > MAX_DOCS) { toast.error(`Máximo de ${MAX_DOCS} documentos`); return junto.slice(0, MAX_DOCS); }
      return junto;
    });
  }

  async function submit(e) {
    e.preventDefault();
    const mudouAlgo = Object.values(f).some(v => String(v || '').trim())
      || Object.values(addr).some(v => String(v || '').trim())
      || !!canPublish || docs.length > 0;
    if (!mudouAlgo) return toast.error('Preencha o que você quer alterar ou anexe um documento.');
    if (f.birth_date.trim() && !brToISO(f.birth_date)) return toast.error('Data de nascimento inválida (DD/MM/AAAA)');
    if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('E-mail inválido');
    if (!quem.name.trim()) return toast.error('Informe o seu nome completo (quem está pedindo)');
    if (!validCPF(quem.cpf)) return toast.error('CPF de quem está pedindo é inválido. Confira os números.');

    setSending(true);
    try {
      const fd = new FormData();
      fd.append('cpf_cnpj', doc);
      fd.append('type', isPJ ? 'PJ' : 'PF');
      fd.append('name', f.name.trim());
      fd.append('rg_ie', f.rg_ie.trim());
      fd.append('email', f.email.trim());
      fd.append('phone', f.phone.trim());
      fd.append('mobile', f.mobile.trim());
      fd.append('instagram', igHandle(f.instagram));
      if (f.birth_date.trim()) fd.append('birth_date', brToISO(f.birth_date));
      if (canPublish) fd.append('can_publish', canPublish);
      fd.append('address', JSON.stringify(addr));
      fd.append('requester_name', quem.name.trim());
      fd.append('requester_cpf', quem.cpf);
      fd.append('requester_cargo', quem.cargo.trim());
      fd.append('note', note.trim());
      fd.append('doc_kind', 'documento');
      for (const d of docs) fd.append('documentos', d);

      const res = await storeApi.post('/solicitar-alteracao', fd);
      setProtocolo(res?.protocolo || '—');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível enviar o pedido. Tente novamente.');
    } finally { setSending(false); }
  }

  if (protocolo) {
    return (
      <div className="fixed inset-0 z-40 bg-black/60 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-7 text-center st-rise">
          <CheckCircle2 size={56} className="text-green-500 mx-auto mb-3" />
          <h2 className="text-xl font-black text-gray-900">Pedido enviado! 🎉</h2>
          <p className="text-gray-500 text-sm mt-2">
            Nossa equipe vai conferir e aprovar a alteração. Seu cadastro continua como está até a aprovação.
          </p>
          <p className="mt-4 text-xs text-gray-400">Protocolo</p>
          <p className="text-lg font-mono font-bold text-violet-600 tracking-wider">{protocolo}</p>
          <button onClick={onDone}
            className="w-full mt-6 bg-violet-600 hover:bg-violet-700 text-white font-bold py-3 rounded-xl transition-colors">
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 bg-black/60 overflow-y-auto p-4 flex items-start sm:items-center justify-center">
      <form onSubmit={submit} className="bg-white rounded-3xl shadow-2xl max-w-lg w-full p-6 sm:p-7 my-4 space-y-4 st-rise">
        <div className="text-center">
          <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-3">
            <ShieldCheck size={26} className="text-violet-600" />
          </div>
          <h2 className="text-lg font-black text-gray-900">Pedir alteração do cadastro</h2>
          <p className="text-gray-500 text-sm mt-1">
            {preenchido
              ? 'Ajuste o que estiver errado. A alteração passa pela conferência da nossa equipe antes de valer.'
              : 'Por segurança não mostramos nada do cadastro atual. Preencha só o que você quer mudar — o resto fica como está.'}
          </p>
          <p className="text-xs text-gray-400 mt-2">{isPJ ? 'CNPJ' : 'CPF'} informado: <b className="text-gray-600">{doc}</b></p>
        </div>

        <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Dados a alterar</p>
          <Field label={isPJ ? 'Razão Social' : 'Nome completo'}>
            <input className={INPUT} value={f.name} onChange={e => set('name', e.target.value.toUpperCase())} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="E-mail"><input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} /></Field>
            <Field label="Telefone / WhatsApp"><input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="Telefone p/ recado"><input className={INPUT} value={f.mobile} onChange={e => set('mobile', maskPhone(e.target.value))} /></Field>
            <Field label="Instagram"><input className={INPUT} value={f.instagram} placeholder="@seu_perfil" onChange={e => set('instagram', e.target.value)} /></Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {isPJ ? (
              <Field label="Inscrição Estadual"><input className={INPUT} value={f.rg_ie} onChange={e => set('rg_ie', e.target.value.toUpperCase())} placeholder="000.000.000.000 ou ISENTO" /></Field>
            ) : (
              <Field label="Data de nascimento"><input className={INPUT} inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA" value={f.birth_date} onChange={e => set('birth_date', maskDate(e.target.value))} /></Field>
            )}
            <Field label="Publicar foto e marcar no Instagram?">
              <select className={INPUT} value={canPublish} onChange={e => setCanPublish(e.target.value)}>
                <option value="">Não alterar</option>
                <option value="sim">Pode publicar</option>
                <option value="nao">Não publicar</option>
              </select>
            </Field>
          </div>
        </div>

        <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Endereço <span className="font-normal text-gray-400">(só se mudou)</span></p>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="CEP"><input className={INPUT} value={addr.zip} placeholder="00000-000"
              onChange={e => { const v = maskCEP(e.target.value); setA('zip', v); if (v.replace(/\D/g,'').length === 8) lookupCep(v); }}
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

        {/* Documentos */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><Paperclip size={14} /> Documentos</p>
              <p className="text-xs text-gray-400">Comprovante de endereço, contrato, RG/CNH… até {MAX_DOCS} arquivos de {MAX_MB} MB.</p>
            </div>
            <label className="shrink-0 inline-flex items-center gap-1.5 bg-violet-100 text-violet-700 hover:bg-violet-200 text-sm font-medium px-3 py-2 rounded-xl cursor-pointer transition">
              Anexar
              <input type="file" className="hidden" multiple accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                onChange={e => { addDocs(Array.from(e.target.files || [])); e.target.value = ''; }} />
            </label>
          </div>
          {docs.length > 0 && (
            <ul className="space-y-1.5">
              {docs.map((d, i) => (
                <li key={i} className="flex items-center gap-2 bg-gray-50 rounded-xl px-3 py-2">
                  <FileText size={14} className="text-gray-400 shrink-0" />
                  <span className="text-sm text-gray-700 truncate flex-1">{d.name}</span>
                  <button type="button" onClick={() => setDocs(p => p.filter((_, j) => j !== i))}
                    className="text-gray-400 hover:text-red-500 shrink-0"><X size={15} /></button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Quem está pedindo */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Quem está pedindo</p>
          <Field label="Nome completo *">
            <input className={INPUT} value={quem.name} onChange={e => setQuem(p => ({ ...p, name: e.target.value }))} />
          </Field>
          <div className="grid sm:grid-cols-2 gap-4">
            <Field label="CPF *">
              <input className={INPUT} value={quem.cpf} placeholder="000.000.000-00" maxLength={14}
                onChange={e => setQuem(p => ({ ...p, cpf: maskCPF(e.target.value) }))} />
            </Field>
            <Field label={isPJ ? 'Cargo' : 'Relação com o cadastro'}>
              <input className={INPUT} value={quem.cargo} placeholder={isPJ ? 'Ex: Comercial' : 'Ex: sou o titular'}
                onChange={e => setQuem(p => ({ ...p, cargo: e.target.value }))} />
            </Field>
          </div>
          <Field label="Observação para a equipe" hint="Conte o que mudou — ajuda a aprovar mais rápido.">
            <textarea className={INPUT} rows={2} value={note} onChange={e => setNote(e.target.value)} />
          </Field>
        </div>

        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button type="button" onClick={onCancel}
            className="sm:flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 font-semibold py-3 rounded-xl transition-colors">
            Cancelar
          </button>
          <button type="submit" disabled={sending}
            className="sm:flex-1 bg-violet-600 hover:bg-violet-700 disabled:opacity-60 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
            {sending ? <><Loader2 size={17} className="animate-spin" /> Enviando...</> : <><ShieldCheck size={17} /> Enviar pedido</>}
          </button>
        </div>
        <p className="text-xs text-gray-400 text-center">
          A alteração só entra no sistema depois que nossa equipe aprovar.
        </p>
      </form>
    </div>
  );
}
