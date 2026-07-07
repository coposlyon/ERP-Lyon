import { useState, useEffect, useRef } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Star, Instagram, CheckCircle2, XCircle, Ban, ExternalLink } from 'lucide-react';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

// Data digitável DD/MM/AAAA (sem precisar do calendário)
const maskDate = v => String(v||'').replace(/\D/g,'').slice(0,8).replace(/(\d{2})(\d)/,'$1/$2').replace(/(\d{2})(\d)/,'$1/$2');
function brToISO(s) {
  const m = String(s||'').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dt = new Date(`${y}-${mo}-${d}T00:00:00`);
  if (isNaN(dt) || dt.getFullYear() !== +y || dt.getMonth()+1 !== +mo || dt.getDate() !== +d) return null;
  if (+y < 1900 || dt > new Date()) return null;
  return `${y}-${mo}-${d}`;
}
const isoToBR = iso => { const m = String(iso||'').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

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

// Instagram: extrai o @handle e valida o formato (letras/números/ponto/_)
const igHandle = v => String(v||'').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i,'').replace(/[/?].*$/,'').replace(/^@/,'');
function validIG(v) {
  const h = igHandle(v);
  if (!h) return true; // opcional
  if (h.length > 30) return false;
  if (!/^[a-zA-Z0-9._]+$/.test(h)) return false;
  if (/^\./.test(h) || /\.$/.test(h) || /\.\./.test(h)) return false;
  return true;
}

// ── Formatação CPF / CNPJ ────────────────────────────────────────────────────
function formatCpf(v) {
  const d = v.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3)  return d;
  if (d.length <= 6)  return `${d.slice(0,3)}.${d.slice(3)}`;
  if (d.length <= 9)  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6)}`;
  return `${d.slice(0,3)}.${d.slice(3,6)}.${d.slice(6,9)}-${d.slice(9)}`;
}

function formatCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

// Valida CPF pelos dois dígitos verificadores
function validateCpf(cpf) {
  const d = cpf.replace(/\D/g, '');
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += parseInt(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r >= 10 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

// Valida CNPJ pelos dois dígitos verificadores
function validateCnpj(cnpj) {
  const c = cnpj.replace(/\D/g, '');
  if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
  const calc = (len) => {
    let pos = len - 7, sum = 0;
    for (let i = len; i >= 1; i--) { sum += +c[len - i] * pos--; if (pos < 2) pos = 9; }
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === +c[12] && calc(13) === +c[13];
}

// ── Formatação de número para exibição: 200000 → "200.000" | 99990 com vírgula → "999,90"
function formatCreditLimit(raw) {
  const cleaned = String(raw).replace(/[^\d,]/g, '');
  const commaIdx = cleaned.indexOf(',');

  let intPart, decPart;
  if (commaIdx >= 0) {
    intPart = cleaned.slice(0, commaIdx).replace(/\D/g, '');
    decPart = cleaned.slice(commaIdx + 1).replace(/\D/g, '').slice(0, 2);
  } else {
    intPart = cleaned.replace(/\D/g, '');
    decPart = null;
  }

  const formattedInt = intPart ? parseInt(intPart, 10).toLocaleString('pt-BR') : '';

  if (decPart !== null) return (formattedInt || '0') + ',' + decPart;
  return formattedInt;
}

// Converte de volta para número ao salvar: "1.500.000,50" → 1500000.5
function parseCreditLimit(formatted) {
  if (!formatted) return 0;
  return parseFloat(String(formatted).replace(/\./g, '').replace(',', '.')) || 0;
}

export default function CustomerForm({ customer, onSaved, onCancel, hideRating = false }) {
  const [form, setForm] = useState({
    type: 'PF', name: '', cpf_cnpj: '', rg_ie: '', birth_date: '',
    email: '', phone: '', mobile: '',
    address: { ...emptyAddress },
    credit_limit: '', instagram: '', nome_fantasia: '',
    rating: null, is_active: true, notes: '',
    blocked: false, block_reason: '',
    vendedor: '', boleto_days: '',
  });
  const [loading, setLoading]       = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [duplicate, setDuplicate]   = useState(null);
  const [docLoading, setDocLoading] = useState(false);
  const [docStatus,  setDocStatus]  = useState(null); // null | 'ok' | 'error' | 'invalid'
  const lookupInProgress = useRef(false);          // ref para evitar stale closure na guard
  const lastLookup = useRef('');                   // último CNPJ consultado (evita repetir no blur)
  const lastCepLookup = useRef('');                // último CEP consultado (blur sem mudança não refaz)

  useEffect(() => {
    if (customer) {
      setForm({
        type:         customer.type || 'PF',
        name:         customer.name || '',
        cpf_cnpj:     customer.cpf_cnpj || '',
        rg_ie:        customer.rg_ie || '',
        birth_date:   isoToBR(customer.birth_date),
        email:        customer.email || '',
        phone:        customer.phone || '',
        mobile:       customer.mobile || '',
        address:      customer.address || { ...emptyAddress },
        credit_limit: customer.credit_limit != null && customer.credit_limit !== ''
          ? Number(customer.credit_limit).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
          : '',
        instagram:    customer.instagram || '',
        nome_fantasia: customer.nome_fantasia || '',
        rating:       customer.rating || null,
        is_active:    customer.is_active !== false,
        notes:        customer.notes || '',
        blocked:      !!customer.blocked,
        block_reason: customer.block_reason || '',
        vendedor:     customer.vendedor || '',
        boleto_days:  customer.boleto_days != null ? String(customer.boleto_days) : '',
      });
      // CEP já salvo conta como "consultado": abrir o cadastro e passar pelo
      // campo não dispara a busca de novo (era isso que apagava rua/bairro).
      lastCepLookup.current = String(customer.address?.zip || '').replace(/\D/g, '');
    }
    // Reinicializa APENAS quando muda o cliente em si (id). Antes dependia do
    // objeto inteiro: qualquer refetch da tela-mãe criava um objeto novo e
    // apagava o que estava sendo digitado (endereço sumia "do nada").
  }, [customer?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function set(f, v)       { setForm(p => ({ ...p, [f]: v })); }
  function setUp(f, v)     { setForm(p => ({ ...p, [f]: String(v).toUpperCase() })); }
  function setAddr(f, v)   { setForm(p => ({ ...p, address: { ...p.address, [f]: v } })); }
  function setAddrUp(f, v) { setForm(p => ({ ...p, address: { ...p.address, [f]: String(v).toUpperCase() } })); }

  // ── Lookup CNPJ (PJ) ────────────────────────────────────────────────────────
  async function lookupCnpj(digits) {
    if (digits.length !== 14 || lookupInProgress.current) return;
    if (lastLookup.current === digits) return; // já consultado — o blur não repete
    lookupInProgress.current = true;
    setDocLoading(true);
    setDocStatus(null);
    try {
      const res = await fetch(`/api/cnpj/${digits}`);
      if (!res.ok) throw new Error('not found');
      const d = await res.json();
      lastLookup.current = digits;
      const zip = d.zip ? d.zip.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
      // Só PREENCHE campos vazios — nunca apaga o que já foi digitado.
      // (a consulta demora alguns segundos; sobrescrever apagava o endereço
      // que a pessoa tinha acabado de preencher pelo CEP)
      setForm(p => ({
        ...p,
        name:         p.name          || (d.name       || '').toUpperCase(),
        nome_fantasia:p.nome_fantasia || (d.trade_name || '').toUpperCase(),
        rg_ie:        p.rg_ie  || d.ie    || '',
        email:        p.email  || d.email || '',
        phone:        p.phone  || (d.phone ? formatPhoneDisplay(d.phone) : ''),
        address: {
          ...p.address,
          street:       p.address.street       || (d.street       || '').toUpperCase(),
          number:       p.address.number       || (d.number       || '').toUpperCase(),
          complement:   p.address.complement   || (d.complement   || '').toUpperCase(),
          neighborhood: p.address.neighborhood || (d.neighborhood || '').toUpperCase(),
          city:         p.address.city         || (d.city         || '').toUpperCase(),
          state:        p.address.state        || (d.state        || '').toUpperCase(),
          zip:          p.address.zip          || zip,
        },
      }));
      setDocStatus('ok');
      toast.success('✅ Dados preenchidos automaticamente pelo CNPJ!');
    } catch {
      setDocStatus('error');
      toast.error('CNPJ não encontrado — preencha manualmente');
    } finally {
      setDocLoading(false);
      lookupInProgress.current = false;
    }
  }

  function formatPhoneDisplay(raw) {
    const d = raw.replace(/\D/g, '');
    if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
    return raw;
  }

  // ── Handler do campo CPF / CNPJ ─────────────────────────────────────────────
  function handleDocChange(e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (form.type === 'PJ') {
      const formatted = formatCnpj(e.target.value);
      set('cpf_cnpj', formatted);
      if (raw.length === 14) {
        if (validateCnpj(raw)) lookupCnpj(raw); // só busca se o CNPJ for válido
        else setDocStatus('invalid');
      } else {
        setDocStatus(null);
      }
    } else {
      const formatted = formatCpf(e.target.value);
      set('cpf_cnpj', formatted);
      if (raw.length === 11) {
        setDocStatus(validateCpf(raw) ? 'ok' : 'invalid');
      } else {
        setDocStatus(null);
      }
    }
  }

  async function handleCepBlur(e) {
    const cep = e.target.value.replace(/\D/g, '');
    if (cep.length !== 8) return;
    // Só consulta se o CEP realmente mudou — sair do campo sem alterar
    // não pode mexer no endereço já preenchido.
    if (cep === lastCepLookup.current) return;
    setCepLoading(true);
    try {
      const res  = await fetch(`/api/cep/${cep}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data.error || 'CEP não encontrado'); return; }
      lastCepLookup.current = cep;
      // CEP genérico de cidade vem sem rua/bairro — nunca apaga o que já
      // está preenchido com resposta vazia.
      setForm(p => ({
        ...p,
        address: {
          ...p.address,
          street:       data.street       ? data.street.toUpperCase()       : p.address.street,
          neighborhood: data.neighborhood ? data.neighborhood.toUpperCase() : p.address.neighborhood,
          city:         data.city         ? data.city.toUpperCase()         : p.address.city,
          state:        data.state        ? data.state.toUpperCase()        : p.address.state,
          zip:          e.target.value,
        },
      }));
    } catch { toast.error('Erro ao buscar CEP'); }
    finally  { setCepLoading(false); }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { toast.error('Nome é obrigatório'); return; }
    if (form.instagram && !validIG(form.instagram)) { toast.error('Instagram inválido — confira o @perfil (só letras, números, ponto e _)'); return; }
    // Bloqueia documento inválido (evita CPF/CNPJ digitado errado)
    const docDigits = (form.cpf_cnpj || '').replace(/\D/g, '');
    if (docDigits) {
      if (form.type === 'PJ' && !validateCnpj(docDigits)) {
        setDocStatus('invalid');
        toast.error('CNPJ inválido — confira os números digitados');
        return;
      }
      if (form.type !== 'PJ' && !validateCpf(docDigits)) {
        setDocStatus('invalid');
        toast.error('CPF inválido — confira os números digitados');
        return;
      }
    }
    setLoading(true);
    try {
      const payload = { ...form, credit_limit: parseCreditLimit(form.credit_limit), birth_date: brToISO(form.birth_date) };
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
              onChange={() => { set('type', v); setDocStatus(null); }} className="text-primary-600" />
            <span className="text-sm font-medium">{l}</span>
          </label>
        ))}
      </div>

      {/* Dados principais */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">{isPJ ? 'Razão Social *' : 'Nome Completo *'}</label>
          <input className="input" value={form.name} onChange={e => setUp('name', e.target.value)} />
        </div>

        {isPJ && (
          <div className="col-span-2">
            <label className="label">Nome Fantasia</label>
            <input className="input" value={form.nome_fantasia} onChange={e => setUp('nome_fantasia', e.target.value)} placeholder="Nome fantasia da empresa" />
          </div>
        )}

        <div>
          <label className="label">{isPJ ? 'CNPJ' : 'CPF'}</label>
          <div className="relative">
            <input
              className="input pr-10"
              value={form.cpf_cnpj}
              onChange={handleDocChange}
              onBlur={e => {
                if (isPJ) lookupCnpj(e.target.value.replace(/\D/g, ''));
              }}
              placeholder={isPJ ? '00.000.000/0000-00' : '000.000.000-00'}
              maxLength={isPJ ? 18 : 14}
              disabled={docLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {docLoading && <Loader2 size={15} className="animate-spin text-gray-400" />}
              {!docLoading && docStatus === 'ok'      && <CheckCircle2 size={15} className="text-green-500" />}
              {!docLoading && (docStatus === 'error' || docStatus === 'invalid') && <XCircle size={15} className="text-red-400" />}
            </div>
          </div>
          {docLoading && <p className="text-xs text-primary-600 mt-1 flex items-center gap-1"><Loader2 size={11} className="animate-spin" /> Consultando CNPJ...</p>}
          {!docLoading && docStatus === 'ok'      && isPJ  && <p className="text-xs text-green-600 mt-1">✅ Dados preenchidos automaticamente</p>}
          {!docLoading && docStatus === 'ok'      && !isPJ && <p className="text-xs text-green-600 mt-1">✅ CPF válido</p>}
          {!docLoading && docStatus === 'invalid'           && <p className="text-xs text-red-500 mt-1">{isPJ ? 'CNPJ inválido' : 'CPF inválido'} — verifique os dígitos</p>}
          {!docLoading && docStatus === 'error'             && <p className="text-xs text-red-500 mt-1">CNPJ não encontrado — preencha manualmente</p>}
        </div>

        {isPJ ? (
          <div>
            <label className="label">Inscrição Estadual</label>
            <input className="input" value={form.rg_ie} onChange={e => setUp('rg_ie', e.target.value)} />
          </div>
        ) : (
          <div>
            <label className="label">Data de Nascimento</label>
            <input className="input" inputMode="numeric" maxLength={10} placeholder="DD/MM/AAAA"
              value={form.birth_date} onChange={e => set('birth_date', maskDate(e.target.value))} />
          </div>
        )}

        <div>
          <label className="label">E-mail</label>
          <input type="email" className="input" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>

        <div>
          <label className="label">Telefone / WhatsApp</label>
          <input className="input" value={form.phone} onChange={e => setUp('phone', e.target.value)} placeholder="(44) 99999-9999" />
        </div>

        <div>
          <label className="label">Instagram</label>
          <div className="relative">
            <Instagram size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-pink-400" />
            <input className={`input pl-8 ${form.instagram && !validIG(form.instagram) ? 'border-red-400 focus:border-red-400' : ''}`}
              value={form.instagram} onChange={e => set('instagram', e.target.value)} placeholder="@perfil" />
            {validIG(form.instagram) && igHandle(form.instagram) && (
              <a href={`https://instagram.com/${igHandle(form.instagram)}`} target="_blank" rel="noreferrer"
                title="Abrir perfil para conferir" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-pink-500">
                <ExternalLink size={14} />
              </a>
            )}
          </div>
          {form.instagram && !validIG(form.instagram) && (
            <p className="text-xs text-red-500 mt-1">Instagram inválido — use só letras, números, ponto e _</p>
          )}
        </div>

        <div>
          <label className="label">Limite de Crédito (R$)</label>
          <input
            type="text"
            inputMode="decimal"
            className="input"
            value={form.credit_limit}
            onChange={e => set('credit_limit', formatCreditLimit(e.target.value))}
            placeholder="0"
          />
        </div>

        <div>
          <label className="label">Vendedor responsável</label>
          <input
            type="text"
            className="input"
            value={form.vendedor}
            onChange={e => set('vendedor', e.target.value)}
            placeholder="Nome do vendedor"
          />
        </div>

        <div>
          <label className="label">Prazo de boleto (dias)</label>
          <input
            type="number"
            min="0"
            step="1"
            className="input"
            value={form.boleto_days}
            onChange={e => set('boleto_days', e.target.value)}
            placeholder="Ex.: 30"
          />
          <p className="text-xs text-gray-400 mt-1">Vazio = usa o prazo do nível Lyon Prime.</p>
        </div>
      </div>

      {/* Avaliação */}
      {!hideRating && (
        <div>
          <label className="label">Avaliação do cliente</label>
          <StarRating value={form.rating} onChange={v => set('rating', v)} />
        </div>
      )}

      {/* Observação */}
      <div>
        <label className="label">Observação</label>
        <textarea className="input min-h-[70px] resize-y" value={form.notes}
          onChange={e => set('notes', e.target.value)}
          placeholder="Ex.: cliente sempre paga atrasado, atenção no crédito..." />
        <p className="text-xs text-gray-400 mt-1">Quando houver observação, aparece um ⚠️ ao lado do nome do cliente na lista.</p>
      </div>

      {/* Cliente problemático / bloqueado */}
      <div className={`rounded-xl border p-3 ${form.blocked ? 'border-red-200 bg-red-50' : 'border-gray-200'}`}>
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={form.blocked}
            onChange={e => set('blocked', e.target.checked)} className="accent-red-600 w-4 h-4" />
          <span className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
            <Ban size={15} className="text-red-500" /> Cliente bloqueado / com problemas
          </span>
        </label>
        {form.blocked && (
          <div className="mt-2">
            <input className="input" value={form.block_reason}
              onChange={e => set('block_reason', e.target.value)}
              placeholder="Motivo (ex.: calote, devolução abusiva, não retira pedidos...)" />
            <p className="text-xs text-red-500 mt-1">Aparece um 🚫 vermelho ao lado do nome do cliente na lista.</p>
          </div>
        )}
      </div>

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
            <input className="input" value={form.address.street} onChange={e => setAddrUp('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.address.number} onChange={e => setAddrUp('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.address.complement} onChange={e => setAddrUp('complement', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.address.neighborhood} onChange={e => setAddrUp('neighborhood', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.address.city} onChange={e => setAddrUp('city', e.target.value)} />
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
