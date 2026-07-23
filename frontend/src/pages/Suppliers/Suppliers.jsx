import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Loader2, CheckCircle2, XCircle, MessageCircle, Phone, Mail } from 'lucide-react';
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

const emptyAddr = { nome_fantasia:'', street:'', number:'', complement:'', neighborhood:'', city:'', state:'', zip:'' };

function SupplierForm({ supplier, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name:         supplier?.name         || '',
    cnpj:         supplier?.cnpj         || '',
    ie:           supplier?.ie           || '',
    email:        supplier?.email        || '',
    phone:        supplier?.phone        || '',
    contact_name: supplier?.contact_name || '',
    address:      { ...emptyAddr, ...(supplier?.address || {}) },
    is_active:    supplier?.is_active !== false,
  });
  const [loading,     setLoading]     = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus,  setCnpjStatus]  = useState(null); // null | 'ok' | 'error'

  const up = s => (typeof s === 'string' ? s.toUpperCase() : s);
  function set(k, v)    { setForm(p => ({ ...p, [k]: (k === 'email' ? v : up(v)) })); }
  function setAddr(k,v) { setForm(p => ({ ...p, address: { ...p.address, [k]: up(v) } })); }

  async function handleCnpjBlur(e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length !== 14) return;
    setCnpjLoading(true);
    setCnpjStatus(null);
    try {
      const res = await fetch(`/api/cnpj/${raw}`);
      if (!res.ok) throw new Error('not found');
      const d = await res.json();
      const zip = d.zip ? d.zip.replace(/^(\d{5})(\d{3})$/, '$1-$2') : '';
      setForm(p => ({
        ...p,
        name:  up(d.name)  || p.name,
        ie:    up(d.ie)    || p.ie,
        email: d.email || p.email,
        phone: formatPhone(d.phone || ''),
        address: {
          ...p.address,
          nome_fantasia: up(d.trade_name)   || '',
          street:        up(d.street)       || '',
          number:        up(d.number)       || '',
          complement:    up(d.complement)   || '',
          neighborhood:  up(d.neighborhood) || '',
          city:          up(d.city)         || '',
          state:         up(d.state)        || '',
          zip,
        },
      }));
      setCnpjStatus('ok');
      toast.success('Dados do CNPJ preenchidos automaticamente!');
    } catch {
      setCnpjStatus('error');
      toast.error('CNPJ não encontrado ou inválido');
    } finally {
      setCnpjLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const a = form.address || {};
    // Todos os campos são obrigatórios (menos Complemento e o e-mail continua minúsculo)
    if (!form.cnpj?.trim())            { toast.error('Informe o CNPJ'); return; }
    if (!form.ie?.trim())             { toast.error('Informe a Inscrição Estadual (ou ISENTO)'); return; }
    if (!form.name?.trim())            { toast.error('Razão Social é obrigatória'); return; }
    if (!a.nome_fantasia?.trim())      { toast.error('Informe o Nome Fantasia'); return; }
    if (!form.contact_name?.trim())    { toast.error('Informe o Contato / Responsável'); return; }
    if (!form.phone?.trim())           { toast.error('Informe o Telefone'); return; }
    if (!form.email?.trim())           { toast.error('Informe o E-mail'); return; }
    if (!a.zip?.trim())                { toast.error('Informe o CEP'); return; }
    if (!a.street?.trim())             { toast.error('Informe a Rua / Logradouro'); return; }
    if (!String(a.number || '').trim()){ toast.error('Informe o Número'); return; }
    if (!a.neighborhood?.trim())       { toast.error('Informe o Bairro'); return; }
    if (!a.city?.trim())               { toast.error('Informe a Cidade'); return; }
    if (!a.state?.trim())              { toast.error('Informe o Estado (UF)'); return; }
    setLoading(true);
    try {
      if (supplier?.id) {
        await api.put(`/suppliers/${supplier.id}`, form);
        toast.success('Fornecedor atualizado!');
      } else {
        await api.post('/suppliers', form);
        toast.success('Fornecedor cadastrado!');
      }
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">

      {/* CNPJ com auto-fill + Inscrição Estadual */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">CNPJ *</label>
          <div className="relative">
            <input
              className="input pr-10"
              value={form.cnpj}
              onChange={e => set('cnpj', formatCnpj(e.target.value))}
              onBlur={handleCnpjBlur}
              placeholder="00.000.000/0000-00"
              maxLength={18}
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {cnpjLoading && <Loader2 size={16} className="animate-spin text-gray-400" />}
              {!cnpjLoading && cnpjStatus === 'ok'    && <CheckCircle2 size={16} className="text-green-500" />}
              {!cnpjLoading && cnpjStatus === 'error' && <XCircle      size={16} className="text-red-400"   />}
            </div>
          </div>
          {cnpjLoading && (
            <p className="text-xs text-gray-400 mt-1">Consultando Receita Federal...</p>
          )}
        </div>
        <div>
          <label className="label">Inscrição Estadual (IE) *</label>
          <input className="input" value={form.ie}
            onChange={e => set('ie', e.target.value)}
            placeholder="000.000.000.000 ou ISENTO" />
        </div>
      </div>

      {/* Razão Social + Nome Fantasia */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Razão Social *</label>
          <input className="input" value={form.name}
            onChange={e => set('name', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Nome Fantasia *</label>
          <input className="input" value={form.address.nome_fantasia}
            onChange={e => setAddr('nome_fantasia', e.target.value)}
            placeholder="Nome comercial (auto-preenchido)" />
        </div>

        <div>
          <label className="label">Contato / Responsável *</label>
          <input className="input" value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Telefone *</label>
          <input className="input" value={form.phone}
            onChange={e => set('phone', e.target.value)} placeholder="(44) 99999-9999" />
        </div>
        <div className="col-span-2">
          <label className="label">E-mail *</label>
          <input type="email" className="input" value={form.email}
            onChange={e => set('email', e.target.value)} />
        </div>
      </div>

      {/* Endereço — auto-preenchido, expansível */}
      <details className="border border-gray-200 rounded-lg" open>
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg select-none">
          Endereço {form.address.street && <span className="text-gray-400 font-normal">— {form.address.street}, {form.address.city}/{form.address.state}</span>}
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
          <div>
            <label className="label">CEP *</label>
            <input className="input" value={form.address.zip}
              onChange={e => setAddr('zip', e.target.value)} placeholder="00000-000" />
          </div>
          <div className="col-span-2">
            <label className="label">Rua / Logradouro *</label>
            <input className="input" value={form.address.street}
              onChange={e => setAddr('street', e.target.value)} />
          </div>
          <div>
            <label className="label">Número *</label>
            <input className="input" value={form.address.number}
              onChange={e => setAddr('number', e.target.value)} />
          </div>
          <div>
            <label className="label">Complemento</label>
            <input className="input" value={form.address.complement}
              onChange={e => setAddr('complement', e.target.value)} />
          </div>
          <div>
            <label className="label">Bairro *</label>
            <input className="input" value={form.address.neighborhood}
              onChange={e => setAddr('neighborhood', e.target.value)} />
          </div>
          <div>
            <label className="label">Cidade *</label>
            <input className="input" value={form.address.city}
              onChange={e => setAddr('city', e.target.value)} />
          </div>
          <div>
            <label className="label">Estado *</label>
            <select className="input" value={form.address.state}
              onChange={e => setAddr('state', e.target.value)}>
              <option value="">UF</option>
              {states.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      </details>

      {/* Status */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active}
          onChange={e => set('is_active', e.target.checked)} className="rounded" />
        <span className="text-sm text-gray-700">Fornecedor ativo</span>
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

export default function Suppliers() {
  const [page, setPage]               = useState(1);
  const [search, setSearch]           = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [modalOpen, setModalOpen]     = useState(false);
  const [editing, setEditing]         = useState(null);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['suppliers', page, search],
    queryFn: () => api.get(`/suppliers?page=${page}&limit=20${search ? `&search=${encodeURIComponent(search)}` : ''}`),
  });

  function openNew()  { setEditing(null); setModalOpen(true); }
  function openEdit(s){ setEditing(s);    setModalOpen(true); }
  function close()    { setModalOpen(false); setEditing(null); }
  function onSaved()  { close(); qc.invalidateQueries(['suppliers']); }

  const columns = [
    { key: 'name', label: 'Fornecedor',
      render: (v, row) => (
        <div>
          <p className="font-medium text-gray-900 text-sm">{v}</p>
          {row.address?.nome_fantasia && (
            <p className="text-xs text-gray-400">{row.address.nome_fantasia}</p>
          )}
        </div>
      )
    },
    { key: 'cnpj', label: 'CNPJ', width: 170 },
    { key: 'contact_name', label: 'Contato' },
    { key: 'phone', label: 'Telefone', width: 160,
      render: v => {
        const digits = String(v || '').replace(/\D/g, '');
        if (!digits) return <span className="text-gray-300">—</span>;
        const wa = (digits.length === 10 || digits.length === 11) ? '55' + digits : digits;
        return (
          <div className="flex items-center gap-2 whitespace-nowrap">
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noreferrer"
              className="flex items-center gap-1 text-green-600 hover:text-green-700 text-sm font-medium" title="Abrir no WhatsApp">
              <MessageCircle size={14} /> {v}
            </a>
            <a href={`tel:+${wa}`} className="text-gray-400 hover:text-gray-700" title="Ligar (sem WhatsApp)">
              <Phone size={13} />
            </a>
          </div>
        );
      }
    },
    { key: 'email', label: 'E-mail',
      render: v => v ? (
        <a href={`mailto:${v}`} className="inline-flex items-center gap-1 text-primary-600 hover:underline text-sm" title="Enviar e-mail">
          <Mail size={13} className="shrink-0" /> {v}
        </a>
      ) : <span className="text-gray-300">—</span>
    },
    { key: 'address', label: 'Cidade/UF', width: 130,
      render: v => v?.city ? `${v.city}/${v.state}` : '—'
    },
    { key: 'is_active', label: 'Status', width: 80,
      render: v => <span className={`badge ${v ? 'badge-green' : 'badge-gray'}`}>{v ? 'Ativo' : 'Inativo'}</span>
    },
    { key: 'id', label: '', width: 50,
      render: (_, row) => (
        <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar">
          <Edit2 size={14} />
        </button>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Fornecedores</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.total || 0} fornecedores</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <CopyLinkButton path="/cadastro-fornecedor" />
          <button onClick={openNew} className="btn-primary">
            <Plus size={16} /> Novo Fornecedor
          </button>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
            className="flex gap-3 max-w-md">
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

      <Modal isOpen={modalOpen} onClose={close}
        title={editing ? 'Editar Fornecedor' : 'Novo Fornecedor'} size="md">
        <SupplierForm supplier={editing} onSaved={onSaved} onCancel={close} />
      </Modal>
    </div>
  );
}
