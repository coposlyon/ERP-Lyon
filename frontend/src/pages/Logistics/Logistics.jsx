import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Loader2, CheckCircle2, XCircle, Truck } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import CopyLinkButton from '@/components/UI/CopyLinkButton';
import toast from 'react-hot-toast';

const states = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function formatPhone(raw) {
  if (!raw) return '';
  const d = raw.replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return raw;
}

function formatCnpj(v) {
  const d = v.replace(/\D/g, '').slice(0, 14);
  if (d.length <= 2)  return d;
  if (d.length <= 5)  return `${d.slice(0,2)}.${d.slice(2)}`;
  if (d.length <= 8)  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5)}`;
  if (d.length <= 12) return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8)}`;
  return `${d.slice(0,2)}.${d.slice(2,5)}.${d.slice(5,8)}/${d.slice(8,12)}-${d.slice(12)}`;
}

const DAYS = [
  { key: 'seg', label: 'Seg' },
  { key: 'ter', label: 'Ter' },
  { key: 'qua', label: 'Qua' },
  { key: 'qui', label: 'Qui' },
  { key: 'sex', label: 'Sex' },
  { key: 'sab', label: 'Sáb' },
  { key: 'dom', label: 'Dom' },
];

const emptySlot = () => ({ days: [], time: '08:00' });

const emptyForm = {
  name: '', trade_name: '', cnpj: '', ie: '', email: '',
  phone: '', whatsapp: '', contact_name: '',
  pickup_schedule: [], is_active: true,
  address: { street: '', number: '', complement: '', neighborhood: '', city: '', state: '', zip: '' },
};

function CarrierForm({ carrier, onSaved, onCancel }) {
  const [form, setForm] = useState({
    ...emptyForm,
    ...(carrier || {}),
    pickup_schedule:  carrier?.pickup_schedule  || [],
    address: { ...emptyForm.address, ...(carrier?.address || {}) },
    is_active: carrier?.is_active !== false,
  });
  const [loading,      setLoading]      = useState(false);
  const [cnpjLoading,  setCnpjLoading]  = useState(false);
  const [cnpjStatus,   setCnpjStatus]   = useState(null);
  const [addressOpen,  setAddressOpen]  = useState(!!carrier?.address?.street);

  function set(k, v)    { setForm(p => ({ ...p, [k]: v })); }
  function setAddr(k,v) { setForm(p => ({ ...p, address: { ...p.address, [k]: v } })); }

  // Horários de coleta
  function addSlot()        { setForm(p => ({ ...p, pickup_schedule: [...p.pickup_schedule, emptySlot()] })); }
  function removeSlot(i)    { setForm(p => ({ ...p, pickup_schedule: p.pickup_schedule.filter((_, idx) => idx !== i) })); }
  function updateSlot(i, k, v) {
    setForm(p => {
      const s = [...p.pickup_schedule];
      s[i] = { ...s[i], [k]: v };
      return { ...p, pickup_schedule: s };
    });
  }
  function toggleSlotDay(i, day) {
    setForm(p => {
      const s = [...p.pickup_schedule];
      const days = s[i].days.includes(day) ? s[i].days.filter(d => d !== day) : [...s[i].days, day];
      s[i] = { ...s[i], days };
      return { ...p, pickup_schedule: s };
    });
  }

  // Busca via backend (proxy server-side — sem CORS, tenta 4 APIs)
  async function lookupCnpj(digits) {
    if (digits.length !== 14 || cnpjLoading) return;
    setCnpjLoading(true);
    setCnpjStatus(null);

    try {
      const res = await fetch(`/api/cnpj/${digits}`);
      if (!res.ok) throw new Error('not found');
      const d = await res.json();

      const zip = d.zip ? d.zip.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
      setForm(p => ({
        ...p,
        name:       d.name       || p.name,
        trade_name: d.trade_name || p.trade_name,
        ie:         d.ie         || p.ie,
        email:      d.email      || p.email,
        phone:      formatPhone(d.phone || ''),
        address: {
          ...p.address,
          street:       d.street       || '',
          number:       d.number       || '',
          complement:   d.complement   || '',
          neighborhood: d.neighborhood || '',
          city:         d.city         || '',
          state:        d.state        || '',
          zip,
        },
      }));
      if (d.street || d.city) setAddressOpen(true);
      setCnpjStatus('ok');
      toast.success('✅ Dados do CNPJ preenchidos automaticamente!');
    } catch {
      setCnpjStatus('error');
      toast.error('CNPJ não encontrado');
    } finally {
      setCnpjLoading(false);
    }
  }

  function handleCnpjChange(e) {
    const formatted = formatCnpj(e.target.value);
    set('cnpj', formatted);
    // Dispara automaticamente ao completar os 14 dígitos
    const digits = formatted.replace(/\D/g, '');
    if (digits.length === 14) lookupCnpj(digits);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { toast.error('Razão Social é obrigatória'); return; }
    setLoading(true);
    try {
      if (carrier?.id) {
        await api.put(`/logistics/${carrier.id}`, form);
        toast.success('Transportadora atualizada!');
      } else {
        await api.post('/logistics', form);
        toast.success('Transportadora cadastrada!');
      }
      onSaved();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* CNPJ + IE */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">CNPJ</label>
          <div className="relative">
            <input
              className="input pr-10"
              value={form.cnpj}
              onChange={handleCnpjChange}
              onBlur={e => lookupCnpj(e.target.value.replace(/\D/g, ''))}
              placeholder="00.000.000/0000-00"
              maxLength={18}
              disabled={cnpjLoading}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {cnpjLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
              {!cnpjLoading && cnpjStatus === 'ok'    && <CheckCircle2 size={16} className="text-green-500" />}
              {!cnpjLoading && cnpjStatus === 'error' && <XCircle      size={16} className="text-red-400" />}
            </div>
          </div>
          {cnpjLoading && (
            <p className="text-xs text-primary-600 mt-1 flex items-center gap-1">
              <Loader2 size={11} className="animate-spin" /> Consultando...
            </p>
          )}
          {!cnpjLoading && cnpjStatus === 'ok' && (
            <p className="text-xs text-green-600 mt-1">✅ Dados preenchidos automaticamente</p>
          )}
          {!cnpjLoading && cnpjStatus === 'error' && (
            <p className="text-xs text-red-500 mt-1">CNPJ não encontrado — preencha manualmente</p>
          )}
        </div>

        <div>
          <label className="label">Inscrição Estadual (IE)</label>
          <input
            className="input"
            value={form.ie}
            onChange={e => set('ie', e.target.value)}
            placeholder="Auto-preenchido pelo CNPJ"
          />
        </div>
      </div>

      {/* Razão Social + Nome Fantasia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="label">Razão Social *</label>
          <input className="input" value={form.name}
            onChange={e => set('name', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className="label">Nome Fantasia</label>
          <input className="input" value={form.trade_name}
            onChange={e => set('trade_name', e.target.value)}
            placeholder="Nome comercial" />
        </div>

        <div>
          <label className="label">Responsável / Contato</label>
          <input className="input" value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className="label">E-mail</label>
          <input type="email" className="input" value={form.email}
            onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <label className="label">Telefone</label>
          <input className="input" value={form.phone}
            onChange={e => set('phone', e.target.value)}
            placeholder="(44) 3333-3333" />
        </div>
        <div>
          <label className="label">WhatsApp</label>
          <input className="input" value={form.whatsapp}
            onChange={e => set('whatsapp', e.target.value)}
            placeholder="(44) 99999-9999" />
        </div>
      </div>

      {/* Endereço */}
      <div className="border border-gray-200 rounded-lg">
        <button
          type="button"
          onClick={() => setAddressOpen(v => !v)}
          className="w-full px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg text-left flex items-center justify-between"
        >
          <span>
            Endereço
            {form.address.city && (
              <span className="text-gray-400 font-normal"> — {form.address.city}/{form.address.state}</span>
            )}
          </span>
          <span className="text-gray-400 text-xs">{addressOpen ? '▲' : '▼'}</span>
        </button>
        {addressOpen && <div className="px-4 pb-4 grid grid-cols-3 gap-3 border-t border-gray-100 pt-3">
          <div>
            <label className="label">CEP</label>
            <input className="input" value={form.address.zip}
              onChange={e => setAddr('zip', e.target.value)} placeholder="00000-000" />
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Logradouro</label>
            <input className="input" value={form.address.street}
              onChange={e => setAddr('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número</label>
            <input className="input" value={form.address.number}
              onChange={e => setAddr('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.address.complement}
              onChange={e => setAddr('complement', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro</label>
            <input className="input" value={form.address.neighborhood}
              onChange={e => setAddr('neighborhood', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade</label>
            <input className="input" value={form.address.city}
              onChange={e => setAddr('city', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado</label>
            <select className="input" value={form.address.state}
              onChange={e => setAddr('state', e.target.value)}>
              <option value="">UF</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>}
      </div>

      {/* Horários de Coleta */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Horários de Coleta</label>
          {form.pickup_schedule.length === 0 && (
            <button type="button" onClick={addSlot}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium flex items-center gap-1">
              <Plus size={13} /> Adicionar horário
            </button>
          )}
        </div>

        {form.pickup_schedule.length === 0 && (
          <p className="text-xs text-gray-400 py-3 text-center border border-dashed border-gray-200 rounded-lg">
            Nenhum horário cadastrado — clique em "Adicionar horário"
          </p>
        )}

        <div className="space-y-3">
          {form.pickup_schedule.map((slot, i) => (
            <div key={i} className="border border-gray-200 rounded-xl p-3 bg-gray-50 space-y-2">
              {/* Dias da semana */}
              <div className="flex flex-wrap gap-1.5">
                {DAYS.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => toggleSlotDay(i, key)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      slot.days.includes(key)
                        ? 'bg-primary-600 text-white'
                        : 'bg-white text-gray-500 border border-gray-300 hover:border-primary-400'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Hora da coleta + botão remover */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">Horário:</span>
                <input
                  type="time"
                  value={slot.time}
                  onChange={e => updateSlot(i, 'time', e.target.value)}
                  className="input py-1 text-sm w-28"
                />
                <button
                  type="button"
                  onClick={() => removeSlot(i)}
                  className="ml-auto text-red-400 hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                  title="Remover"
                >
                  <XCircle size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Status */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active}
          onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700">Transportadora ativa</span>
      </label>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export default function Logistics() {
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['carriers', page, search],
    queryFn: () => api.get(`/logistics?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  function openNew()   { setEditing(null); setModalOpen(true); }
  function openEdit(c) { setEditing(c);    setModalOpen(true); }
  function close()     { setModalOpen(false); setEditing(null); }
  function onSaved()   { close(); qc.invalidateQueries({ queryKey: ['carriers'] }); }

  const columns = [
    {
      key: 'name', label: 'Transportadora',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{v}</p>
          {row.trade_name && <p className="text-xs text-gray-400">{row.trade_name}</p>}
        </div>
      ),
    },
    { key: 'cnpj', label: 'CNPJ', width: 170 },
    { key: 'contact_name', label: 'Contato' },
    { key: 'phone', label: 'Telefone', width: 145 },
    {
      key: 'pickup_schedule', label: 'Horários', width: 160,
      render: v => {
        if (!v || v.length === 0) return <span className="text-gray-400 text-xs">—</span>;
        const DAY_LABELS = { seg:'Seg',ter:'Ter',qua:'Qua',qui:'Qui',sex:'Sex',sab:'Sáb',dom:'Dom' };
        return (
          <div className="space-y-0.5">
            {v.slice(0, 2).map((slot, i) => (
              <p key={i} className="text-xs text-gray-600 leading-tight">
                <span className="font-medium">{slot.days.map(d => DAY_LABELS[d] || d).join(', ')}</span>
                {slot.time && <span className="text-gray-400"> {slot.time}</span>}
              </p>
            ))}
            {v.length > 2 && <p className="text-xs text-gray-400">+{v.length - 2} mais</p>}
          </div>
        );
      },
    },
    {
      key: 'address', label: 'Cidade/UF', width: 130,
      render: v => v?.city ? `${v.city}/${v.state}` : '—',
    },
    {
      key: 'is_active', label: 'Status', width: 80,
      render: v => (
        <span className={`badge ${v ? 'badge-green' : 'badge-gray'}`}>
          {v ? 'Ativa' : 'Inativa'}
        </span>
      ),
    },
    {
      key: 'id', label: '', width: 50,
      render: (_, row) => (
        <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar">
          <Edit2 size={14} />
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Truck size={24} className="text-primary-600" />
            Transportadoras
          </h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} transportadoras cadastradas</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CopyLinkButton path="/cadastro-transportadora" />
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Nova Transportadora
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <form
            onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
            className="flex gap-3 max-w-md"
          >
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Nome, CNPJ..." value={searchInput}
                onChange={e => setSearchInput(e.target.value)} className="input pl-9" />
            </div>
            <button type="submit" className="btn-secondary">Buscar</button>
          </form>
        </div>

        <Table columns={columns} data={data?.data} loading={isLoading} />
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={setPage} />
      </div>

      <Modal
        isOpen={modalOpen}
        onClose={close}
        title={editing ? 'Editar Transportadora' : 'Nova Transportadora'}
        size="md"
      >
        <CarrierForm carrier={editing} onSaved={onSaved} onCancel={close} />
      </Modal>
    </div>
  );
}
