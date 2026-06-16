import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { User, Camera, Loader2, Save, History, LogIn, Instagram } from 'lucide-react';
import toast from 'react-hot-toast';
import storeApi from './storeApi';
import { useStoreAuth } from './StoreAuthContext';

const INPUT = 'w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 outline-none text-sm';
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

const maskPhone = v => { const d = String(v||'').replace(/\D/g,'').slice(0,11); return d.length<=10 ? d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{4})(\d{1,4})$/,'$1-$2') : d.replace(/(\d{2})(\d)/,'($1) $2').replace(/(\d{5})(\d{1,4})$/,'$1-$2'); };
const maskCEP = v => String(v||'').replace(/\D/g,'').slice(0,8).replace(/(\d{5})(\d)/,'$1-$2');
const maskDate = v => String(v||'').replace(/\D/g,'').slice(0,8).replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2');
function brToISO(s) { const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/); if (!m) return null; const [,d,mo,y]=m; const dt=new Date(`${y}-${mo}-${d}T00:00:00`); if (isNaN(dt)||dt.getFullYear()!=+y||dt.getMonth()+1!=+mo||dt.getDate()!=+d) return null; if (+y<1900||dt>new Date()) return null; return `${y}-${mo}-${d}`; }
const isoToBR = iso => { const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
const fmtDT = d => { try { return new Date(d).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' }); } catch { return ''; } };

export default function StoreProfile() {
  const { customer, login } = useStoreAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['my-profile', customer?.id],
    queryFn: () => storeApi.get(`/profile?customer_id=${customer.id}`),
    enabled: !!customer?.id,
  });
  const c = data?.customer;
  const isPJ = c?.type === 'PJ';

  const [f, setF] = useState(null);
  const [avatar, setAvatar] = useState(null);   // dataURL nova (preview)
  const [saving, setSaving] = useState(false);

  // Preenche o formulário quando os dados chegam
  useEffect(() => {
    if (!c) return;
    const a = c.address || {};
    setF({
      name: c.name || '', email: c.email || '',
      phone: maskPhone(c.phone || ''), mobile: maskPhone(c.mobile || ''),
      instagram: c.instagram || '', birth_date: isoToBR(c.birth_date),
      zip: maskCEP(a.zip || ''), street: a.street || '', number: a.number || '',
      complement: a.complement || '', neighborhood: a.neighborhood || '', city: a.city || '', state: a.state || '',
    });
    setAvatar(null);
  }, [c]);

  const set = (k, v) => setF(p => ({ ...p, [k]: v }));

  async function lookupCep(cepRaw) {
    const cep = String(cepRaw).replace(/\D/g,''); if (cep.length !== 8) return;
    try {
      const res = await fetch(`/api/cep/${cep}`); if (!res.ok) return;
      const d = await res.json();
      setF(p => ({ ...p, street: d.street||p.street, neighborhood: d.neighborhood||p.neighborhood, city: d.city||p.city, state: d.state||p.state }));
    } catch { /* ignore */ }
  }

  function onPickAvatar(e) {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 6 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 6MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setAvatar(reader.result);
    reader.readAsDataURL(file);
  }

  async function save(e) {
    e.preventDefault();
    if (!f.name.trim()) return toast.error('Informe seu nome');
    if (f.email && !/^\S+@\S+\.\S+$/.test(f.email.trim())) return toast.error('E-mail inválido');
    if (!isPJ && f.birth_date && !brToISO(f.birth_date)) return toast.error('Data de nascimento inválida (DD/MM/AAAA)');
    setSaving(true);
    try {
      const res = await storeApi.post('/profile', {
        customer_id: customer.id,
        avatar: avatar || undefined,
        name: f.name, email: f.email, phone: f.phone, mobile: f.mobile, instagram: f.instagram,
        birth_date: isPJ ? undefined : (brToISO(f.birth_date) || null),
        address: { zip: f.zip, street: f.street, number: f.number, complement: f.complement, neighborhood: f.neighborhood, city: f.city, state: f.state },
      });
      if (res?.customer) login(res.customer); // atualiza o cabeçalho/localStorage
      qc.invalidateQueries(['my-profile']);
      setAvatar(null);
      toast.success('Perfil atualizado!');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Não foi possível salvar');
    } finally { setSaving(false); }
  }

  if (!customer) {
    return (
      <div className="max-w-md mx-auto px-4 py-24 text-center">
        <User size={48} className="text-gray-300 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-gray-700">Meu Perfil</h1>
        <p className="text-gray-500 mt-2">Entre com seu CPF para acessar e editar seu perfil.</p>
        <Link to="/loja/login" className="inline-flex items-center gap-2 mt-6 bg-orange-500 hover:bg-orange-600 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          <LogIn size={17} /> Entrar
        </Link>
      </div>
    );
  }

  if (isLoading || !f) {
    return <div className="flex justify-center py-24"><Loader2 className="animate-spin text-orange-500" /></div>;
  }

  const avatarSrc = avatar || c?.avatar_url || null;
  const history = Array.isArray(c?.profile_history) ? [...c.profile_history].reverse() : [];

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-black mb-6">Meu Perfil</h1>

      <form onSubmit={save} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-5">
        {/* Avatar */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-orange-100 overflow-hidden flex items-center justify-center ring-2 ring-orange-200">
              {avatarSrc ? <img src={avatarSrc} alt="" className="w-full h-full object-cover" /> : <User size={34} className="text-orange-400" />}
            </div>
            <label className="absolute -bottom-1 -right-1 bg-orange-500 hover:bg-orange-600 text-white p-1.5 rounded-full cursor-pointer shadow-lg" title="Trocar foto">
              <Camera size={14} />
              <input type="file" accept="image/*" className="hidden" onChange={onPickAvatar} />
            </label>
          </div>
          <div>
            <p className="font-bold text-gray-900">{f.name || 'Seu nome'}</p>
            <p className="text-xs text-gray-400 font-mono">{isPJ ? 'CNPJ' : 'CPF'}: {c?.cpf_cnpj || '—'}</p>
            <p className="text-xs text-gray-400">Toque na câmera para {avatarSrc ? 'trocar' : 'adicionar'} sua foto.</p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-500">{isPJ ? 'Razão Social' : 'Nome completo'}</label>
            <input className={INPUT} value={f.name} onChange={e => set('name', e.target.value.toUpperCase())} />
          </div>
          {!isPJ && (
            <div>
              <label className="text-xs font-semibold text-gray-500">Data de nascimento</label>
              <input className={INPUT} inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA" value={f.birth_date} onChange={e => set('birth_date', maskDate(e.target.value))} />
            </div>
          )}
          <div>
            <label className="text-xs font-semibold text-gray-500">E-mail</label>
            <input type="email" className={INPUT} value={f.email} onChange={e => set('email', e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Telefone / WhatsApp</label>
            <input className={INPUT} value={f.phone} onChange={e => set('phone', maskPhone(e.target.value))} placeholder="(44) 99999-9999" />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500">Telefone p/ recado</label>
            <input className={INPUT} value={f.mobile} onChange={e => set('mobile', maskPhone(e.target.value))} placeholder="(44) 3333-3333" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-semibold text-gray-500">Instagram</label>
            <div className="relative">
              <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-500" />
              <input className={`${INPUT} pl-9`} value={f.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@seu_perfil" />
            </div>
          </div>
        </div>

        {/* Endereço */}
        <div className="border border-gray-200 rounded-2xl p-4 space-y-4">
          <p className="text-sm font-semibold text-gray-700">Endereço</p>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-gray-500">CEP</label>
              <input className={INPUT} value={f.zip} placeholder="00000-000"
                onChange={e => { const v = maskCEP(e.target.value); set('zip', v); if (v.replace(/\D/g,'').length === 8) lookupCep(v); }}
                onBlur={e => lookupCep(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Rua / Logradouro</label>
              <input className={INPUT} value={f.street} onChange={e => set('street', e.target.value)} />
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4">
            <div><label className="text-xs font-semibold text-gray-500">Número</label><input className={INPUT} value={f.number} onChange={e => set('number', e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500">Complemento</label><input className={INPUT} value={f.complement} onChange={e => set('complement', e.target.value)} /></div>
            <div><label className="text-xs font-semibold text-gray-500">Bairro</label><input className={INPUT} value={f.neighborhood} onChange={e => set('neighborhood', e.target.value)} /></div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div><label className="text-xs font-semibold text-gray-500">Cidade</label><input className={INPUT} value={f.city} onChange={e => set('city', e.target.value)} /></div>
            <div>
              <label className="text-xs font-semibold text-gray-500">Estado</label>
              <select className={INPUT} value={f.state} onChange={e => set('state', e.target.value)}>
                <option value="">UF</option>{UFS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving}
          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3.5 rounded-xl flex items-center justify-center gap-2 transition-colors">
          {saving ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : <><Save size={18} /> Salvar alterações</>}
        </button>
      </form>

      {/* Histórico de alterações */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 mt-5">
        <p className="font-bold text-gray-900 flex items-center gap-2 mb-3"><History size={17} className="text-orange-500" /> Histórico de alterações</p>
        {history.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhuma alteração registrada ainda.</p>
        ) : (
          <ol className="space-y-3">
            {history.map((h, i) => (
              <li key={i} className="flex gap-2.5 text-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-orange-400 mt-2 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400">{fmtDT(h.at)} · {h.source === 'site' ? 'pelo site' : 'no sistema'}</p>
                  <ul className="text-gray-700">
                    {(h.changes || []).map((ch, j) => (
                      <li key={j}>
                        <b>{ch.label}</b>{ch.from ? <> : <span className="text-gray-400 line-through">{ch.from}</span> → {ch.to}</> : ch.to ? <> {ch.to}</> : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <button onClick={() => navigate('/loja/pedidos')} className="mt-5 text-sm text-orange-600 font-semibold hover:underline">
        Ver meus pedidos →
      </button>
    </div>
  );
}
