import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, Edit2, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
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
    email:        supplier?.email        || '',
    phone:        supplier?.phone        || '',
    contact_name: supplier?.contact_name || '',
    address:      { ...emptyAddr, ...(supplier?.address || {}) },
    is_active:    supplier?.is_active !== false,
  });
  const [loading,     setLoading]     = useState(false);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjStatus,  setCnpjStatus]  = useState(null); // null | 'ok' | 'error'

  function set(k, v)    { setForm(p => ({ ...p, [k]: v })); }
  function setAddr(k,v) { setForm(p => ({ ...p, address: { ...p.address, [k]: v } })); }

  async function handleCnpjBlur(e) {
    const raw = e.target.value.replace(/\D/g, '');
    if (raw.length !== 14) return;
    setCnpjLoading(true);
    setCnpjStatus(null);

    const APIS = [
      {
        url:   `https://brasilapi.com.br/api/cnpj/v1/${raw}`,
        parse: d => ({
          name:          d.razao_social  || '',
          nome_fantasia: d.nome_fantasia || '',
          email:         d.email         || '',
          phone:         formatPhone(d.ddd_telefone_1 || d.ddd_telefone_2 || ''),
          street:        d.logradouro    || '',
          number:        d.numero        || '',
          complement:    d.complemento   || '',
          neighborhood:  d.bairro        || '',
          city:          d.municipio     || '',
          state:         d.uf            || '',
          zip:           (d.cep || '').replace(/\D/g,'').replace(/^(\d{5})(\d{3})$/,'$1-$2'),
        }),
      },
      {
        url:   `https://publica.cnpj.ws/cnpj/${raw}`,
        parse: d => {
          const est = d.estabelecimento || {};
          const tel = est.ddd1 && est.telefone1 ? `${est.ddd1}${est.telefone1}` : '';
          return {
            name:          d.razao_social       || '',
            nome_fantasia: est.nome_fantasia     || '',
            email:         est.email             || '',
            phone:         formatPhone(tel),
            street:        est.logradouro        || '',
            number:        est.numero            || '',
            complement:    est.complemento       || '',
            neighborhood:  est.bairro            || '',
            city:          est.municipio?.nome   || '',
            state:         est.estado?.sigla     || '',
            zip:           (est.cep || '').replace(/\D/g,'').replace(/^(\d{5})(\d{3})$/,'$1-$2'),
          };
        },
      },
    ];

    let p = null;
    for (const api of APIS) {
      try {
        const res = await fetch(api.url);
        if (!res.ok) continue;
        p = api.parse(await res.json());
        if (p.name) break;
      } catch { continue; }
    }

    if (p?.name) {
      setForm(prev => ({
        ...prev,
        name:  p.name  || prev.name,
        email: p.email || prev.email,
        phone: p.phone || prev.phone,
        address: {
          ...prev.address,
          nome_fantasia: p.nome_fantasia,
          street:        p.street,
          number:        p.number,
          complement:    p.complement,
          neighborhood:  p.neighborhood,
          city:          p.city,
          state:         p.state,
          zip:           p.zip,
        },
      }));
      setCnpjStatus('ok');
      toast.success('Dados do CNPJ preenchidos automaticamente!');
    } else {
      setCnpjStatus('error');
      toast.error('CNPJ não encontrado ou inválido');
    }
    setCnpjLoading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { toast.error('Razão Social é obrigatória'); return; }
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

      {/* CNPJ com auto-fill */}
      <div>
        <label className="label">CNPJ</label>
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

      {/* Razão Social + Nome Fantasia */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Razão Social *</label>
          <input className="input" value={form.name}
            onChange={e => set('name', e.target.value)} />
        </div>
        <div className="col-span-2">
          <label className="label">Nome Fantasia</label>
          <input className="input" value={form.address.nome_fantasia}
            onChange={e => setAddr('nome_fantasia', e.target.value)}
            placeholder="Nome comercial (auto-preenchido)" />
        </div>

        <div>
          <label className="label">Contato / Responsável</label>
          <input className="input" value={form.contact_name}
            onChange={e => set('contact_name', e.target.value)} />
        </div>
        <div>
          <label className="label">Telefone</label>
          <input className="input" value={form.phone}
            onChange={e => set('phone', e.target.value)} placeholder="(44) 99999-9999" />
        </div>
        <div className="col-span-2">
          <label className="label">E-mail</label>
          <input type="email" className="input" value={form.email}
            onChange={e => set('email', e.target.value)} />
        </div>
      </div>

      {/* Endereço — auto-preenchido, expansível */}
      <details className="border border-gray-200 rounded-lg" open={!!form.address.street}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg select-none">
          Endereço {form.address.street && <span className="text-gray-400 font-normal">— {form.address.street}, {form.address.city}/{form.address.state}</span>}
        </summary>
        <div className="px-4 pb-4 grid grid-cols-3 gap-3 mt-3">
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
    { key: 'phone', label: 'Telefone', width: 140 },
    { key: 'email', label: 'E-mail' },
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
        <button onClick={openNew} className="btn-primary">
          <Plus size={16} /> Novo Fornecedor
        </button>
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
