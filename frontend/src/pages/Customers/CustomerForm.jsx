import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Star, Instagram } from 'lucide-react';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function StarRating({ value, onChange }) {
  const [hovered, setHovered] = useState(0);
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        <button key={n} type="button"
          onClick={() => onChange(value === n ? null : n)}
          onMouseEnter={() => setHovered(n)}
          onMouseLeave={() => setHovered(0)}
          className="focus:outline-none">
          <Star size={22} className={`transition-colors ${(hovered || value) >= n ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
        </button>
      ))}
      {value && <span className="text-xs text-gray-500 self-center ml-1">{value}/5</span>}
    </div>
  );
}

const emptyAddress = { street:'', number:'', complement:'', neighborhood:'', city:'', state:'', zip:'' };

// Formata número para exibição: 200000 → "200.000"
function formatCreditLimit(raw) {
  const digits = String(raw).replace(/\D/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('pt-BR');
}

// Converte de volta para número ao salvar: "200.000" → 200000
function parseCreditLimit(formatted) {
  if (!formatted) return 0;
  return parseInt(String(formatted).replace(/\./g, ''), 10) || 0;
}

export default function CustomerForm({ customer, onSaved, onCancel, hideRating = false }) {
  const [form, setForm] = useState({
    type: 'PF', name: '', cpf_cnpj: '', rg_ie: '',
    email: '', phone: '', mobile: '',
    address: { ...emptyAddress },
    credit_limit: '', instagram: '', nome_fantasia: '',
    rating: null, is_active: true,
  });
  const [loading, setLoading]       = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [duplicate, setDuplicate]   = useState(null);

  useEffect(() => {
    if (customer) {
      setForm({
        type:         customer.type || 'PF',
        name:         customer.name || '',
        cpf_cnpj:     customer.cpf_cnpj || '',
        rg_ie:        customer.rg_ie || '',
        email:        customer.email || '',
        phone:        customer.phone || '',
        mobile:       customer.mobile || '',
        address:      customer.address || { ...emptyAddress },
        credit_limit: customer.credit_limit != null && customer.credit_limit !== ''
          ? formatCreditLimit(Math.round(Number(customer.credit_limit)))
          : '',
        instagram:    customer.instagram || '',
        nome_fantasia: customer.nome_fantasia || '',
        rating:       customer.rating || null,
        is_active:    customer.is_active !== false,
      });
    }
  }, [customer]);

  function set(f, v)    { setForm(p => ({ ...p, [f]: v })); }
  function setAddr(f,v) { setForm(p => ({ ...p, address: { ...p.address, [f]: v } })); }

  async function handleCepBlur(e) {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const res  = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await res.json();
      if (data.erro) { toast.error('CEP não encontrado'); return; }
      setForm(p => ({
        ...p,
        address: { ...p.address, street: data.logradouro||'', neighborhood: data.bairro||'', city: data.localidade||'', state: data.uf||'', zip: e.target.value },
      }));
    } catch { toast.error('Erro ao buscar CEP'); }
    finally  { setCepLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { toast.error('Nome é obrigatório'); return; }
    setLoading(true);
    try {
      const payload = { ...form, credit_limit: parseCreditLimit(form.credit_limit) };
      if (customer?.id) {
        await api.put(`/customers/${customer.id}`, payload);
        toast.success('Cliente atualizado!');
      } else {
        await api.post('/customers', payload);
        toast.success('Cliente cadastrado!');
      }
      onSaved();
    } catch (err) {
      if (err.duplicate) {
        setDuplicate({ id: err.existing_id, name: err.existing_name, display_id: err.existing_display_id });
      } else {
        toast.error(err.error || 'Erro ao salvar');
      }
    } finally { setLoading(false); }
  }

  const isPJ = form.type === 'PJ';

  /* CPF/CNPJ duplicado */
  if (duplicate) {
    return (
      <div className="space-y-5 text-center py-4">
        <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
          <span className="text-3xl">⚠️</span>
        </div>
        <div>
          <p className="text-base font-semibold text-gray-900">CPF/CNPJ já cadastrado</p>
          <p className="text-sm text-gray-500 mt-1">Já existe um cadastro com esse CPF/CNPJ:</p>
          <p className="text-sm font-bold text-primary-700 mt-2">#{duplicate.display_id} — {duplicate.name}</p>
        </div>
        <p className="text-sm text-gray-600">Deseja verificar esse cadastro?</p>
        <div className="flex gap-3 justify-center pt-2">
          <button type="button" onClick={() => setDuplicate(null)} className="btn-secondary">
            Não, voltar ao formulário
          </button>
          <a href={`/customers/${duplicate.id}`} className="btn-primary" onClick={() => onCancel?.()}>
            Sim, ver cadastro existente
          </a>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* Tipo */}
      <div className="flex gap-6">
        {[
          { v: 'PF', l: 'Pessoa Física' },
          { v: 'PJ', l: 'Pessoa Jurídica' },
        ].map(({ v, l }) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" name="type" value={v} checked={form.type === v}
              onChange={() => set('type', v)} className="text-primary-600" />
            <span className="text-sm font-medium">{l}</span>
          </label>
        ))}
      </div>

      {/* Dados principais */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">{isPJ ? 'Razão Social *' : 'Nome Completo *'}</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} />
        </div>

        {isPJ && (
          <div className="col-span-2">
            <label className="label">Nome Fantasia</label>
            <input className="input" value={form.nome_fantasia} onChange={e => set('nome_fantasia', e.target.value)} placeholder="Nome fantasia da empresa" />
          </div>
        )}

        <div>
          <label className="label">{isPJ ? 'CNPJ' : 'CPF'}</label>
          <input className="input" value={form.cpf_cnpj} onChange={e => set('cpf_cnpj', e.target.value)}
            placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'} />
        </div>

        {isPJ && (
          <div>
            <label className="label">Inscrição Estadual</label>
            <input className="input" value={form.rg_ie} onChange={e => set('rg_ie', e.target.value)} />
          </div>
        )}

        <div>
          <label className="label">E-mail</label>
          <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>

        <div>
          <label className="label">Telefone / WhatsApp</label>
          <input className="input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="(44) 99999-9999" />
        </div>

        <div>
          <label className="label">Instagram</label>
          <div className="relative">
            <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400" />
            <input className="input pl-8" value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@perfil" />
          </div>
        </div>

        <div>
          <label className="label">Limite de Crédito (R$)</label>
          <input
            type="text"
            inputMode="numeric"
            className="input"
            value={form.credit_limit}
            onChange={e => set('credit_limit', formatCreditLimit(e.target.value))}
            placeholder="0"
          />
        </div>
      </div>

      {/* Avaliação */}
      {!hideRating && (
        <div>
          <label className="label">Avaliação do cliente</label>
          <StarRating value={form.rating} onChange={v => set('rating', v)} />
        </div>
      )}

      {/* Endereço */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg select-none">
          Endereço
        </summary>
        <div className="px-4 pb-4 grid grid-cols-3 gap-3 mt-3">
          <div>
            <label className="label">CEP</label>
            <div className="relative">
              <input className="input pr-8" value={form.address.zip}
                onChange={e => setAddr('zip', e.target.value)}
                onBlur={handleCepBlur} placeholder="00000-000" />
              {cepLoading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />}
            </div>
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Logradouro</label>
            <input className="input" value={form.address.street} onChange={e => setAddr('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.address.number} onChange={e => setAddr('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.address.complement} onChange={e => setAddr('complement', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.address.neighborhood} onChange={e => setAddr('neighborhood', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.address.city} onChange={e => setAddr('city', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.address.state} onChange={e => setAddr('state', e.target.value)}>
              <option value="">UF</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </details>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        {onCancel && <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>}
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar'}
        </button>
      </div>
    </form>
  );
}
