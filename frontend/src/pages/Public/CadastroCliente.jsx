import { useState } from 'react';
import { CheckCircle2, Loader2, User } from 'lucide-react';
import storeApi from '@/store/storeApi';
import toast from 'react-hot-toast';

const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 outline-none text-sm';

function maskCPF(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}
function maskCNPJ(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d.replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}
function maskPhone(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}
function maskCEP(v) { return v.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2'); }

export default function CadastroCliente() {
  const [type, setType] = useState('PF');
  const [f, setF] = useState({ name: '', cpf_cnpj: '', email: '', phone: '', instagram: '' });
  const [addr, setAddr] = useState({ zip: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '' });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const setA = (k, v) => setAddr(p => ({ ...p, [k]: v }));

  async function lookupCep(cepRaw) {
    const cep = cepRaw.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) return;
      setAddr(p => ({ ...p, street: d.logradouro || p.street, neighborhood: d.bairro || p.neighborhood, city: d.localidade || p.city, state: d.uf || p.state }));
    } catch { /* ignora */ }
  }

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) { toast.error('Informe o nome'); return; }
    if (!f.phone.trim() && !f.email.trim()) { toast.error('Informe telefone ou e-mail'); return; }
    setSending(true);
    try {
      await storeApi.post('/cadastro', { type, ...f, address: addr });
      setDone(true);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível enviar. Tente novamente.');
    } finally { setSending(false); }
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-violet-50 to-fuchsia-50 p-4">
        <div className="bg-white rounded-3xl shadow-xl max-w-md w-full p-8 text-center">
          <CheckCircle2 size={56} className="text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-extrabold text-gray-900">Cadastro enviado!</h1>
          <p className="text-gray-500 mt-2">Obrigado! Recebemos seus dados. Em breve nossa equipe entra em contato. 💜</p>
        </div>
      </div>
    );
  }

  const isPJ = type === 'PJ';
  return (
    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-fuchsia-50 py-8 px-4">
      <div className="max-w-xl mx-auto">
        <div className="text-center mb-6">
          <img src="/lyon-logo.png" alt="Lyon Copos" className="h-16 mx-auto mb-3 object-contain" onError={e => { e.target.style.display = 'none'; }} />
          <h1 className="text-2xl sm:text-3xl font-black text-gray-900 leading-tight">FAÇA O SEU CADASTRO NO NOSSO SISTEMA LYON COPOS!</h1>
          <p className="text-gray-500 mt-2 text-sm">Preencha seus dados abaixo. Leva menos de 1 minuto.</p>
        </div>

        <form onSubmit={submit} className="bg-white rounded-3xl shadow-xl p-6 sm:p-8 space-y-4">
          {/* Tipo */}
          <div className="flex gap-6">
            {['PF', 'PJ'].map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer text-sm">
                <input type="radio" checked={type === t} onChange={() => setType(t)} className="accent-violet-600 w-4 h-4" />
                {t === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica'}
              </label>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{isPJ ? 'Razão Social' : 'Nome Completo'} *</label>
            <input className={INPUT} value={f.name} onChange={e => set('name', e.target.value)} />
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{isPJ ? 'CNPJ' : 'CPF'}</label>
              <input className={INPUT} value={f.cpf_cnpj} placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'}
                onChange={e => set('cpf_cnpj', isPJ ? maskCNPJ(e.target.value) : maskCPF(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
              <input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} />
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Telefone / WhatsApp</label>
              <input className={INPUT} value={f.phone} placeholder="(44) 99999-9999" onChange={e => set('phone', maskPhone(e.target.value))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Instagram</label>
              <input className={INPUT} value={f.instagram} placeholder="@perfil" onChange={e => set('instagram', e.target.value)} />
            </div>
          </div>

          {/* Endereço */}
          <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
            <p className="text-sm font-semibold text-gray-700">Endereço</p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">CEP</label>
                <input className={INPUT} value={addr.zip} placeholder="00000-000"
                  onChange={e => { const v = maskCEP(e.target.value); setA('zip', v); }} onBlur={e => lookupCep(e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rua / Logradouro</label>
                <input className={INPUT} value={addr.street} onChange={e => setA('street', e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Número</label>
                <input className={INPUT} value={addr.number} onChange={e => setA('number', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                <input className={INPUT} value={addr.complement} onChange={e => setA('complement', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bairro</label>
                <input className={INPUT} value={addr.neighborhood} onChange={e => setA('neighborhood', e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cidade</label>
                <input className={INPUT} value={addr.city} onChange={e => setA('city', e.target.value)} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select className={INPUT} value={addr.state} onChange={e => setA('state', e.target.value)}>
                  <option value="">UF</option>
                  {UFS.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          </div>

          <button type="submit" disabled={sending}
            className="w-full bg-violet-600 hover:bg-violet-700 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-60">
            {sending ? <><Loader2 size={18} className="animate-spin" /> Enviando...</> : <><User size={18} /> Enviar cadastro</>}
          </button>
          <p className="text-xs text-gray-400 text-center">Seus dados são usados apenas para atendimento e pedidos.</p>
        </form>
      </div>
    </div>
  );
}
