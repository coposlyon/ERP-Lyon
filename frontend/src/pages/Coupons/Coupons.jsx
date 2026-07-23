import { useState, useEffect } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Plus, Tag, Edit2, Trash2, Loader2, Percent, DollarSign, Search, X } from 'lucide-react';
import api from '@/lib/api';
import { Table } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import { id4 } from '@/lib/ids';
import toast from 'react-hot-toast';

const fmt = v => `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`;
const brDate = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

const empty = {
  code: '', description: '', discount_type: 'percent', discount_value: '',
  min_total: '', max_uses: '', per_customer: '', customer_id: null,
  valid_from: '', valid_until: '', active: true,
};

function CustomerPicker({ value, customerName, onPick }) {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const { data } = useQuery({
    queryKey: ['coupon-cust', term],
    queryFn: () => api.get(`/customers?type=cliente&limit=8&search=${encodeURIComponent(term)}`),
    enabled: open && term.trim().length >= 2,
  });
  if (value) {
    return (
      <div className="flex items-center justify-between input">
        <span className="text-sm truncate">{customerName || 'Cliente selecionado'}</span>
        <button type="button" onClick={() => onPick(null, '')} className="text-gray-400 hover:text-red-500"><X size={15} /></button>
      </div>
    );
  }
  return (
    <div className="relative">
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
      <input className="input pl-9" placeholder="Buscar cliente (deixe vazio = todos)"
        value={term} onChange={e => { setTerm(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      {open && term.trim().length >= 2 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
          {(data?.data || []).length === 0
            ? <p className="text-sm text-gray-400 text-center py-3">Nenhum cliente</p>
            : data.data.map(c => (
              <button key={c.id} type="button"
                onMouseDown={() => { onPick(c.id, `#${id4(c.display_id)} ${c.name}`); setOpen(false); setTerm(''); }}
                className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm">
                <span className="font-mono text-gray-400 text-xs mr-1">#{id4(c.display_id)}</span> {c.name}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}

export default function Coupons() {
  const qc = useQueryClient();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [custName, setCustName] = useState('');
  const [delTarget, setDelTarget] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['coupons'], queryFn: () => api.get('/coupons') });

  const saveMut = useMutation({
    mutationFn: (payload) => editing ? api.put(`/coupons/${editing.id}`, payload) : api.post('/coupons', payload),
    onSuccess: () => { toast.success(editing ? 'Cupom atualizado' : 'Cupom criado'); setModalOpen(false); qc.invalidateQueries(['coupons']); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });
  const delMut = useMutation({
    mutationFn: (id) => api.delete(`/coupons/${id}`),
    onSuccess: () => { toast.success('Cupom removido'); setDelTarget(null); qc.invalidateQueries(['coupons']); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  function openNew() { setEditing(null); setForm(empty); setCustName(''); setModalOpen(true); }
  function openEdit(c) {
    setEditing(c);
    setForm({
      code: c.code || '', description: c.description || '', discount_type: c.discount_type || 'percent',
      discount_value: c.discount_value ?? '', min_total: c.min_total || '', max_uses: c.max_uses ?? '',
      per_customer: c.per_customer ?? '', customer_id: c.customer_id || null,
      valid_from: c.valid_from || '', valid_until: c.valid_until || '', active: c.active !== false,
    });
    setCustName(c.customer ? `#${id4(c.customer.display_id)} ${c.customer.name}` : '');
    setModalOpen(true);
  }
  function set(f, v) { setForm(p => ({ ...p, [f]: v })); }

  function submit(e) {
    e.preventDefault();
    if (!form.code.trim()) return toast.error('Informe o código');
    if (!(Number(form.discount_value) > 0)) return toast.error('Informe o valor do desconto');
    saveMut.mutate({
      ...form,
      code: form.code.trim().toUpperCase(),
      discount_value: Number(form.discount_value),
      min_total: Number(form.min_total) || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      per_customer: form.per_customer ? Number(form.per_customer) : null,
    });
  }

  const columns = [
    { key: 'code', label: 'Código', width: 130,
      render: (v, row) => (
        <div className="flex items-center gap-1.5">
          <Tag size={14} className="text-primary-500" />
          <span className="font-mono font-bold text-gray-900">{v}</span>
          {!row.active && <span className="badge badge-gray">inativo</span>}
        </div>
      )
    },
    { key: 'description', label: 'Descrição', render: v => v || <span className="text-gray-300">—</span> },
    { key: 'discount_value', label: 'Desconto', width: 110,
      render: (v, row) => <span className="font-semibold text-green-600">{row.discount_type === 'percent' ? `${v}%` : fmt(v)}</span>
    },
    { key: 'min_total', label: 'Mín.', width: 90, render: v => v > 0 ? fmt(v) : <span className="text-gray-300">—</span> },
    { key: 'customer', label: 'Cliente', width: 150,
      render: v => v ? <span className="text-xs">{v.name}</span> : <span className="text-xs text-gray-400">Todos</span>
    },
    { key: 'used_count', label: 'Usos', width: 80,
      render: (v, row) => <span className="text-sm">{v || 0}{row.max_uses != null ? ` / ${row.max_uses}` : ''}</span>
    },
    { key: 'valid_until', label: 'Validade', width: 110,
      render: (v, row) => {
        const expired = v && new Date(v) < new Date(new Date().toDateString());
        return v
          ? <span className={`text-xs ${expired ? 'text-red-500' : 'text-gray-600'}`}>{expired ? 'Expirado' : `até ${brDate(v)}`}</span>
          : <span className="text-xs text-gray-400">sem prazo</span>;
      }
    },
    { key: 'id', label: '', width: 80,
      render: (_, row) => (
        <div className="flex gap-1">
          <button onClick={() => openEdit(row)} className="btn-ghost p-1.5" title="Editar"><Edit2 size={14} /></button>
          <button onClick={() => setDelTarget(row)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Remover"><Trash2 size={14} /></button>
        </div>
      )
    },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cupons de Desconto</h1>
          <p className="text-sm text-gray-500 mt-1">{data?.data?.length || 0} cupons · use no PDV e na loja</p>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={16} /> Novo cupom</button>
      </div>

      <div className="card">
        <Table columns={columns} data={data?.data} loading={isLoading} />
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cupom' : 'Novo cupom'} size="lg">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Código *</label>
              <input className="input font-mono uppercase" value={form.code}
                onChange={e => set('code', e.target.value.toUpperCase().replace(/\s/g, ''))} placeholder="LYON10" />
            </div>
            <div>
              <label className="label">Tipo de desconto</label>
              <div className="flex gap-2">
                <button type="button" onClick={() => set('discount_type', 'percent')}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-sm font-medium ${form.discount_type === 'percent' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
                  <Percent size={14} /> Porcentagem
                </button>
                <button type="button" onClick={() => set('discount_type', 'value')}
                  className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg border text-sm font-medium ${form.discount_type === 'value' ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-500'}`}>
                  <DollarSign size={14} /> Valor fixo
                </button>
              </div>
            </div>
            <div>
              <label className="label">{form.discount_type === 'percent' ? 'Desconto (%) *' : 'Desconto (R$) *'}</label>
              <input type="number" step="0.01" min="0" className="input" value={form.discount_value}
                onChange={e => set('discount_value', e.target.value)} placeholder={form.discount_type === 'percent' ? '10' : '50,00'} />
            </div>
            <div>
              <label className="label">Pedido mínimo (R$)</label>
              <input type="number" step="0.01" min="0" className="input" value={form.min_total}
                onChange={e => set('min_total', e.target.value)} placeholder="0,00" />
            </div>
            <div className="col-span-2">
              <label className="label">Descrição</label>
              <input className="input" value={form.description} onChange={e => set('description', e.target.value)} placeholder="Ex.: Desconto de boas-vindas" />
            </div>
            <div>
              <label className="label">Limite total de usos</label>
              <input type="number" min="1" className="input" value={form.max_uses}
                onChange={e => set('max_uses', e.target.value)} placeholder="Vazio = ilimitado" />
            </div>
            <div>
              <label className="label">Usos por cliente</label>
              <input type="number" min="1" className="input" value={form.per_customer}
                onChange={e => set('per_customer', e.target.value)} placeholder="Vazio = sem limite" />
            </div>
            <div>
              <label className="label">Válido a partir de</label>
              <input type="date" className="input" value={form.valid_from} onChange={e => set('valid_from', e.target.value)} />
            </div>
            <div>
              <label className="label">Válido até</label>
              <input type="date" className="input" value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
            </div>
            <div className="col-span-2">
              <label className="label">Exclusivo de um cliente (opcional)</label>
              <CustomerPicker value={form.customer_id} customerName={custName}
                onPick={(id, name) => { set('customer_id', id); setCustName(name); }} />
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="accent-primary-600 w-4 h-4" />
            <span className="text-sm font-medium">Cupom ativo</span>
          </label>

          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary">
              {saveMut.isPending ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar cupom'}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={!!delTarget} onClose={() => setDelTarget(null)} title="Remover cupom" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">Remover o cupom <b>{delTarget?.code}</b>?</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setDelTarget(null)} className="btn-secondary">Cancelar</button>
            <button onClick={() => delMut.mutate(delTarget.id)} disabled={delMut.isPending}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-xl flex items-center gap-2 disabled:opacity-50">
              {delMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Remover
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
