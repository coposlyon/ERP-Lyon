import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ChevronDown, ChevronRight, Loader2, Percent } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

function PriceTableForm({ table, onSaved, onCancel }) {
  const [form, setForm] = useState({ name: table?.name || '', discount_percent: table?.discount_percent || 0, is_active: table?.is_active !== false });
  const [loading, setLoading] = useState(false);

  async function save(e) {
    e.preventDefault(); setLoading(true);
    try {
      if (table?.id) { await api.put(`/price-tables/${table.id}`, form); toast.success('Atualizado!'); }
      else { await api.post('/price-tables', form); toast.success('Criado!'); }
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <label className="label">Nome da Tabela *</label>
        <input className="input" placeholder="Ex: Atacado, Varejo, Revenda..." value={form.name} onChange={e => setForm(p => ({...p, name: e.target.value}))} required />
      </div>
      <div>
        <label className="label">Desconto Geral (%)</label>
        <div className="relative">
          <input type="number" min="0" max="100" step="0.01" className="input pr-8"
            value={form.discount_percent} onChange={e => setForm(p => ({...p, discount_percent: parseFloat(e.target.value) || 0}))} />
          <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        </div>
        <p className="text-xs text-gray-400 mt-1">Aplica desconto automático em todos os produtos</p>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" id="active" checked={form.is_active} onChange={e => setForm(p => ({...p, is_active: e.target.checked}))} />
        <label htmlFor="active" className="text-sm">Tabela ativa</label>
      </div>
      <div className="flex justify-end gap-3 pt-2 border-t">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <Loader2 size={14} className="animate-spin" /> : 'Salvar'}
        </button>
      </div>
    </form>
  );
}

export default function PriceTables() {
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [expanded, setExpanded] = useState({});
  const qc = useQueryClient();

  const { data = [], isLoading } = useQuery({
    queryKey: ['price-tables'],
    queryFn: () => api.get('/price-tables'),
  });

  async function handleDelete(id) {
    if (!confirm('Remover esta tabela de preços?')) return;
    try {
      await api.delete(`/price-tables/${id}`);
      toast.success('Removida!');
      qc.invalidateQueries(['price-tables']);
    } catch (err) { toast.error(err.error || 'Erro'); }
  }

  if (isLoading) return <div className="flex items-center justify-center h-32"><Loader2 className="animate-spin text-primary-500" /></div>;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Tabelas de Preço</h1>
          <p className="text-sm text-gray-500 mt-1">{data.length} tabelas cadastradas</p>
        </div>
        <button onClick={() => { setEditing(null); setModal(true); }} className="btn-primary">
          <Plus size={16} /> Nova Tabela
        </button>
      </div>

      {data.length === 0 ? (
        <div className="card p-12 text-center">
          <Percent size={40} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500">Nenhuma tabela de preço cadastrada</p>
          <p className="text-sm text-gray-400 mt-1">Crie tabelas para Atacado, Varejo, Revendedores, etc.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {data.map(table => (
            <div key={table.id} className="card">
              <div className="card-body">
                <div className="flex items-center gap-3">
                  <button onClick={() => setExpanded(p => ({ ...p, [table.id]: !p[table.id] }))} className="btn-ghost p-1">
                    {expanded[table.id] ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-semibold">{table.name}</h3>
                      <span className={`badge ${table.is_active ? 'badge-green' : 'badge-gray'}`}>
                        {table.is_active ? 'Ativa' : 'Inativa'}
                      </span>
                      {table.discount_percent > 0 && (
                        <span className="badge badge-blue">{table.discount_percent}% desconto</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {(table.TABELA_PRECO_ITENS || []).length} produtos com preço específico
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(table); setModal(true); }} className="btn-ghost p-1.5"><Edit2 size={14} /></button>
                    <button onClick={() => handleDelete(table.id)} className="btn-ghost p-1.5 text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>

                {expanded[table.id] && (table.TABELA_PRECO_ITENS || []).length > 0 && (
                  <div className="mt-3 border-t pt-3">
                    <p className="text-xs text-gray-500 mb-2">Preços específicos por produto:</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(table.TABELA_PRECO_ITENS || []).map(item => (
                        <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded text-sm">
                          <span className="text-gray-700">{item.PRODUTOS?.name}</span>
                          <div className="text-right">
                            <p className="font-semibold text-primary-600">{fmt(item.price)}</p>
                            {item.min_qty > 1 && <p className="text-xs text-gray-400">mín. {item.min_qty} un.</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title={editing ? 'Editar Tabela' : 'Nova Tabela de Preço'} size="sm">
        <PriceTableForm
          table={editing}
          onSaved={() => { setModal(false); setEditing(null); qc.invalidateQueries(['price-tables']); }}
          onCancel={() => { setModal(false); setEditing(null); }}
        />
      </Modal>
    </div>
  );
}
