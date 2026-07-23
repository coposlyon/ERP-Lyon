import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RotateCcw, Plus, Search, CheckCircle, XCircle, RefreshCw,
  ChevronDown, AlertCircle, CreditCard,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { Table, Pagination } from '@/components/UI/Table';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmt = v =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const fmtDate = d => {
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); }
  catch { return d || '—'; }
};

const STATUS_CFG = {
  pending:   { label: 'Pendente',   cls: 'bg-yellow-100 text-yellow-700' },
  approved:  { label: 'Aprovada',   cls: 'bg-green-100  text-green-700'  },
  rejected:  { label: 'Rejeitada',  cls: 'bg-red-100    text-red-700'    },
  processed: { label: 'Processada', cls: 'bg-blue-100   text-blue-700'   },
  cancelled: { label: 'Cancelada',  cls: 'bg-gray-100   text-gray-500'   },
};
const TYPE_CFG = {
  devolucao: { label: 'Devolução', cls: 'bg-orange-100 text-orange-700' },
  troca:     { label: 'Troca',     cls: 'bg-purple-100 text-purple-700' },
};
const REASON_OPTIONS = [
  'Produto com defeito', 'Produto errado enviado', 'Insatisfação com o produto',
  'Arrependimento de compra', 'Danificado no transporte', 'Cor/tamanho errado',
  'Personalização incorreta', 'Outro',
];
const CONDITION_OPTIONS = [
  { v: 'ok',       l: 'Bom estado'   },
  { v: 'damaged',  l: 'Avariado'     },
  { v: 'defective',l: 'Com defeito'  },
];

// ── Formulário de nova devolução ──────────────────────────
function ReturnForm({ onSaved, onCancel }) {
  const [type, setType]         = useState('devolucao');
  const [reason, setReason]     = useState('');
  const [customReason, setCustomReason] = useState('');
  const [notes, setNotes]       = useState('');
  const [saleSearch, setSaleSearch] = useState('');
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleOpen, setSaleOpen] = useState(false);
  const [items, setItems]       = useState([{ product_name:'', quantity:1, unit_price:0, condition:'ok' }]);

  const { data: sales = [] } = useQuery({
    queryKey: ['returns-sale-search', saleSearch],
    queryFn: () => api.get(`/returns/search/sales?q=${encodeURIComponent(saleSearch)}`),
    enabled: saleSearch.length > 0,
  });

  function addItem() {
    setItems(p => [...p, { product_name:'', quantity:1, unit_price:0, condition:'ok' }]);
  }
  function removeItem(i) {
    setItems(p => p.filter((_, idx) => idx !== i));
  }
  function updateItem(i, field, value) {
    setItems(p => p.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  }

  const mutation = useMutation({
    mutationFn: data => api.post('/returns', data),
    onSuccess: () => { toast.success('Devolução criada'); onSaved(); },
    onError:   e  => toast.error(e.error || 'Erro ao criar devolução'),
  });

  function handleSubmit(e) {
    e.preventDefault();
    const finalReason = reason === 'Outro' ? customReason : reason;
    if (!finalReason) return toast.error('Informe o motivo');
    if (items.every(it => !it.product_name && !it.product_id))
      return toast.error('Informe ao menos um item');
    mutation.mutate({
      sale_id:     selectedSale?.id || null,
      customer_id: selectedSale?.customer_id || null,
      type,
      reason: finalReason,
      notes,
      items: items.map(it => ({
        ...it,
        quantity:   Number(it.quantity),
        unit_price: Number(it.unit_price),
      })),
    });
  }

  const credit = items.reduce((s,i) => s + Number(i.quantity||0)*Number(i.unit_price||0), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Tipo */}
      <div>
        <label className="label">Tipo</label>
        <div className="flex gap-2">
          {[['devolucao','Devolução'],['troca','Troca']].map(([v,l]) => (
            <button key={v} type="button"
              onClick={() => setType(v)}
              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${
                type===v ? 'border-pink-500 bg-pink-50 text-pink-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Pedido original */}
      <div>
        <label className="label">Pedido original (opcional)</label>
        <div className="relative">
          <input
            type="text"
            className="input"
            placeholder="Buscar por número do pedido..."
            value={selectedSale ? `#${String(selectedSale.number).padStart(4,'0')} — ${selectedSale.CLIENTES?.name || ''}` : saleSearch}
            onChange={e => { setSaleSearch(e.target.value); setSelectedSale(null); setSaleOpen(true); }}
            onFocus={() => setSaleOpen(true)}
          />
          {saleOpen && sales.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
              {sales.map(s => (
                <button key={s.id} type="button"
                  className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                  onClick={() => { setSelectedSale(s); setSaleOpen(false); setSaleSearch(''); }}>
                  <span className="font-mono font-semibold">#{String(s.number).padStart(4,'0')}</span>
                  <span className="text-gray-500 ml-2">{s.CLIENTES?.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">{fmtDate(s.created_at)} · {fmt(s.total)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedSale && (
          <button type="button" onClick={() => setSelectedSale(null)}
            className="text-xs text-gray-400 hover:text-red-500 mt-1">× Remover vínculo</button>
        )}
      </div>

      {/* Motivo */}
      <div>
        <label className="label">Motivo *</label>
        <select className="input" value={reason} onChange={e => setReason(e.target.value)} required>
          <option value="">Selecione...</option>
          {REASON_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        {reason === 'Outro' && (
          <input className="input mt-2" placeholder="Descreva o motivo..."
            value={customReason} onChange={e => setCustomReason(e.target.value)} required />
        )}
      </div>

      {/* Itens */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label mb-0">Itens devolvidos *</label>
          <button type="button" onClick={addItem} className="text-xs text-pink-600 hover:text-pink-700 font-medium flex items-center gap-1">
            <Plus size={12}/> Adicionar item
          </button>
        </div>
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 rounded-lg">
              <div className="col-span-4">
                <label className="text-xs text-gray-500 mb-0.5 block">Produto</label>
                <input className="input text-sm" placeholder="Nome do produto"
                  value={it.product_name} onChange={e => updateItem(i,'product_name',e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-0.5 block">Qtd</label>
                <input type="number" className="input text-sm" min="0.001" step="0.001"
                  value={it.quantity} onChange={e => updateItem(i,'quantity',e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-xs text-gray-500 mb-0.5 block">Vlr Unit.</label>
                <input type="number" className="input text-sm" min="0" step="0.01"
                  value={it.unit_price} onChange={e => updateItem(i,'unit_price',e.target.value)} />
              </div>
              <div className="col-span-3">
                <label className="text-xs text-gray-500 mb-0.5 block">Estado</label>
                <select className="input text-sm" value={it.condition}
                  onChange={e => updateItem(i,'condition',e.target.value)}>
                  {CONDITION_OPTIONS.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select>
              </div>
              <div className="col-span-1 flex items-end pb-1">
                {items.length > 1 && (
                  <button type="button" onClick={() => removeItem(i)}
                    className="text-red-400 hover:text-red-600 p-1">
                    <XCircle size={16}/>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {credit > 0 && (
          <p className="text-sm font-semibold text-green-700 mt-2 flex items-center gap-1">
            <CreditCard size={14}/> Crédito gerado: {fmt(credit)}
          </p>
        )}
      </div>

      {/* Obs */}
      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" disabled={mutation.isPending}
          className="btn-primary flex-1 bg-gradient-to-r from-pink-600 to-pink-700">
          {mutation.isPending ? 'Salvando...' : 'Criar Devolução'}
        </button>
      </div>
    </form>
  );
}

// ── Modal de detalhe / ações de status ────────────────────
function ReturnDetail({ ret, onClose, onRefresh }) {
  const qc = useQueryClient();
  const statusMut = useMutation({
    mutationFn: ({ id, status }) => api.patch(`/returns/${id}/status`, { status }),
    onSuccess: () => { toast.success('Status atualizado'); onRefresh(); qc.invalidateQueries(['returns']); onClose(); },
    onError:   e  => toast.error(e.error || 'Erro'),
  });

  if (!ret) return null;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Tipo</p>
          <span className={`badge ${TYPE_CFG[ret.type]?.cls}`}>{TYPE_CFG[ret.type]?.label}</span>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Status</p>
          <span className={`badge ${STATUS_CFG[ret.status]?.cls}`}>{STATUS_CFG[ret.status]?.label}</span>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Cliente</p>
          <p className="font-medium text-sm">{ret.CLIENTES?.name || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide">Crédito</p>
          <p className="font-semibold text-green-700">{fmt(ret.credit_amount)}</p>
        </div>
        <div className="col-span-2">
          <p className="text-xs text-gray-400 uppercase tracking-wide">Motivo</p>
          <p className="text-sm">{ret.reason}</p>
        </div>
        {ret.notes && (
          <div className="col-span-2">
            <p className="text-xs text-gray-400 uppercase tracking-wide">Obs.</p>
            <p className="text-sm text-gray-600">{ret.notes}</p>
          </div>
        )}
      </div>

      {ret.items?.length > 0 && (
        <div>
          <p className="text-xs text-gray-400 uppercase tracking-wide mb-2">Itens</p>
          <div className="space-y-1">
            {ret.items.map((it, i) => (
              <div key={i} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
                <div>
                  <span className="font-medium">{it.product_name || it.PRODUTOS?.name}</span>
                  <span className="text-gray-400 ml-2 text-xs">
                    {CONDITION_OPTIONS.find(c=>c.v===it.condition)?.l}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-gray-500">{it.quantity}x</span>
                  <span className="font-semibold ml-2">{fmt(it.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ações */}
      {ret.status === 'pending' && (
        <div className="flex gap-2 pt-2 border-t">
          <button
            onClick={() => statusMut.mutate({ id: ret.id, status: 'approved' })}
            disabled={statusMut.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
            <CheckCircle size={15}/> Aprovar
          </button>
          <button
            onClick={() => statusMut.mutate({ id: ret.id, status: 'rejected' })}
            disabled={statusMut.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            <XCircle size={15}/> Rejeitar
          </button>
        </div>
      )}
      {ret.status === 'approved' && (
        <div className="flex gap-2 pt-2 border-t">
          <button
            onClick={() => statusMut.mutate({ id: ret.id, status: 'processed' })}
            disabled={statusMut.isPending}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors">
            <RefreshCw size={15}/> Marcar como Processada
          </button>
        </div>
      )}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────
export default function Returns() {
  const [page, setPage]           = useState(1);
  const [statusFilter, setStatus] = useState('');
  const [typeFilter, setType]     = useState('');
  const [modalNew, setModalNew]   = useState(false);
  const [detailRet, setDetailRet] = useState(null);
  const qc = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['returns', page, statusFilter, typeFilter],
    queryFn: () => {
      let url = `/returns?page=${page}&limit=30`;
      if (statusFilter) url += `&status=${statusFilter}`;
      if (typeFilter)   url += `&type=${typeFilter}`;
      return api.get(url);
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['returns-stats'],
    queryFn: () => api.get('/returns/stats/summary'),
  });

  const columns = [
    {
      key: 'number', label: '#', width: 70,
      render: v => <span className="font-mono font-semibold text-gray-500 text-xs">#{String(v).padStart(4,'0')}</span>,
    },
    {
      key: 'CLIENTES', label: 'Cliente',
      render: v => <span className="font-medium text-sm">{v?.name || '—'}</span>,
    },
    {
      key: 'type', label: 'Tipo', width: 100,
      render: v => <span className={`badge text-xs ${TYPE_CFG[v]?.cls}`}>{TYPE_CFG[v]?.label}</span>,
    },
    {
      key: 'reason', label: 'Motivo',
      render: v => <span className="text-sm text-gray-600 line-clamp-1">{v}</span>,
    },
    {
      key: 'status', label: 'Status', width: 110,
      render: v => <span className={`badge text-xs ${STATUS_CFG[v]?.cls}`}>{STATUS_CFG[v]?.label}</span>,
    },
    {
      key: 'credit_amount', label: 'Crédito', width: 110,
      render: v => <span className="font-semibold text-green-700 text-sm">{fmt(v)}</span>,
    },
    {
      key: 'created_at', label: 'Data', width: 100,
      render: v => <span className="text-xs text-gray-400">{fmtDate(v)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-orange-100 rounded-lg flex items-center justify-center">
            <RotateCcw size={18} className="text-orange-600"/>
          </div>
          <div>
            <h1 className="page-title">Devoluções e Trocas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Gestão de devoluções com crédito automático</p>
          </div>
        </div>
        <button onClick={() => setModalNew(true)} className="btn-primary">
          <Plus size={16}/> Nova Devolução
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: stats?.total || 0, cls: 'text-gray-900', icon: <RotateCcw size={16} className="text-gray-400"/> },
          { label: 'Pendentes', value: stats?.pending || 0, cls: 'text-yellow-700', icon: <AlertCircle size={16} className="text-yellow-500"/> },
          { label: 'Aprovadas', value: stats?.approved || 0, cls: 'text-green-700', icon: <CheckCircle size={16} className="text-green-500"/> },
          { label: 'Em Crédito', value: fmt(stats?.total_credit), cls: 'text-blue-700 text-lg', icon: <CreditCard size={16} className="text-blue-500"/> },
        ].map((s,i) => (
          <div key={i} className="card p-4 flex items-center gap-3">
            <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center">{s.icon}</div>
            <div>
              <p className={`font-bold ${s.cls}`}>{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Filtros + tabela */}
      <div className="card">
        <div className="card-header flex flex-wrap items-center gap-3">
          {/* Status filter */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            {[['','Todos'],['pending','Pendentes'],['approved','Aprovadas'],['processed','Processadas']].map(([v,l]) => (
              <button key={v} onClick={() => { setStatus(v); setPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  statusFilter===v ? 'bg-white shadow text-pink-700' : 'text-gray-500 hover:text-gray-800'
                }`}>{l}</button>
            ))}
          </div>
          {/* Type filter */}
          <select className="input text-sm w-auto" value={typeFilter} onChange={e => { setType(e.target.value); setPage(1); }}>
            <option value="">Todos os tipos</option>
            <option value="devolucao">Devolução</option>
            <option value="troca">Troca</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                {columns.map(c => <th key={c.key} style={{ width: c.width }}>{c.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : (data?.data||[]).length === 0 ? (
                <tr><td colSpan={columns.length} className="text-center py-8 text-gray-400">Nenhuma devolução encontrada</td></tr>
              ) : (data?.data||[]).map((row, i) => (
                <tr key={row.id || i} className="cursor-pointer hover:bg-gray-50/80"
                  onClick={() => setDetailRet(row)}>
                  {columns.map(col => (
                    <td key={col.key}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} total={data?.total||0} limit={30} onPageChange={setPage}/>
      </div>

      {/* Modal nova devolução */}
      <Modal isOpen={modalNew} onClose={() => setModalNew(false)} title="Nova Devolução / Troca" size="xl">
        <ReturnForm onSaved={() => { setModalNew(false); qc.invalidateQueries(['returns']); qc.invalidateQueries(['returns-stats']); }} onCancel={() => setModalNew(false)}/>
      </Modal>

      {/* Modal detalhe */}
      <Modal isOpen={!!detailRet} onClose={() => setDetailRet(null)}
        title={`Devolução #${String(detailRet?.number||0).padStart(4,'0')}`} size="lg">
        <ReturnDetail ret={detailRet} onClose={() => setDetailRet(null)} onRefresh={refetch}/>
      </Modal>
    </div>
  );
}
