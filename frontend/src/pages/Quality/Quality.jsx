import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FlaskConical, Plus, CheckCircle2, XCircle, AlertTriangle,
  Package, ClipboardCheck, Award,
} from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { Pagination } from '@/components/UI/Table';
import toast from 'react-hot-toast';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const fmtDate = d => {
  try { return format(parseISO(d), 'dd/MM/yyyy', { locale: ptBR }); } catch { return d || '—'; }
};

const STATUS_LOTE = {
  active:     { l:'Ativo',       cls:'bg-blue-100   text-blue-700'  },
  inspecting: { l:'Inspecionado',cls:'bg-yellow-100 text-yellow-700'},
  approved:   { l:'Aprovado',    cls:'bg-green-100  text-green-700' },
  rejected:   { l:'Rejeitado',   cls:'bg-red-100    text-red-700'   },
  consumed:   { l:'Consumido',   cls:'bg-gray-100   text-gray-500'  },
};
const RESULT_CFG = {
  approved:    { l:'Aprovado',    cls:'bg-green-100  text-green-700', icon: CheckCircle2 },
  rejected:    { l:'Reprovado',   cls:'bg-red-100    text-red-700',   icon: XCircle      },
  conditional: { l:'Condicional', cls:'bg-yellow-100 text-yellow-700',icon: AlertTriangle},
};

const DEFAULT_CRITERIA = [
  'Aparência visual', 'Dimensões dentro do padrão', 'Material sem falhas',
  'Personalização correta', 'Embalagem íntegra',
];

// ── Formulário novo lote ──────────────────────────────────
function LotForm({ onSaved, onCancel }) {
  const [form, setForm] = useState({ quantity:'', unit:'un', production_date:'', expiry_date:'', notes:'' });
  const [productSearch, setProductSearch] = useState('');
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [productOpen, setProductOpen] = useState(false);

  const { data: products = [] } = useQuery({
    queryKey: ['products-search-lot', productSearch],
    queryFn: () => api.get(`/products?search=${encodeURIComponent(productSearch)}&limit=10`),
    select: d => d.data || [],
    enabled: productSearch.length > 1,
  });

  const mut = useMutation({
    mutationFn: d => api.post('/quality/lots', d),
    onSuccess: () => { toast.success('Lote criado'); onSaved(); },
    onError:   e => toast.error(e.error || 'Erro'),
  });

  function submit(e) {
    e.preventDefault();
    if (!form.quantity) return toast.error('Informe a quantidade');
    mut.mutate({ ...form, product_id: selectedProduct?.id || null, quantity: Number(form.quantity) });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">Produto (opcional)</label>
        <div className="relative">
          <input className="input" placeholder="Buscar produto..."
            value={selectedProduct ? selectedProduct.name : productSearch}
            onChange={e => { setProductSearch(e.target.value); setSelectedProduct(null); setProductOpen(true); }}
            onFocus={() => setProductOpen(true)}
          />
          {productOpen && products.length > 0 && (
            <div className="absolute z-10 top-full left-0 right-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-40 overflow-y-auto">
              {products.map(p => (
                <button key={p.id} type="button"
                  className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0"
                  onClick={() => { setSelectedProduct(p); setProductOpen(false); }}>
                  <span className="font-mono text-xs text-gray-400">{p.code}</span>
                  <span className="ml-2">{p.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Quantidade *</label>
          <input type="number" className="input" min="0.001" step="0.001"
            value={form.quantity} onChange={e => setForm(p => ({...p, quantity: e.target.value}))} required />
        </div>
        <div>
          <label className="label">Unidade</label>
          <select className="input" value={form.unit} onChange={e => setForm(p => ({...p, unit: e.target.value}))}>
            {['un','cx','kg','m','m²','l','par','jogo'].map(u => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Data de produção</label>
          <input type="date" className="input"
            value={form.production_date} onChange={e => setForm(p => ({...p, production_date: e.target.value}))} />
        </div>
        <div>
          <label className="label">Validade</label>
          <input type="date" className="input"
            value={form.expiry_date} onChange={e => setForm(p => ({...p, expiry_date: e.target.value}))} />
        </div>
      </div>

      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2}
          value={form.notes} onChange={e => setForm(p => ({...p, notes: e.target.value}))} />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
          {mut.isPending ? 'Salvando...' : 'Criar Lote'}
        </button>
      </div>
    </form>
  );
}

// ── Formulário inspeção ───────────────────────────────────
function InspectForm({ lot, onSaved, onCancel }) {
  const [total, setTotal]      = useState('');
  const [rejected, setRejected]= useState('0');
  const [result, setResult]    = useState('');
  const [notes, setNotes]      = useState('');
  const [criteria, setCriteria]= useState(DEFAULT_CRITERIA.map(c => ({ name: c, result: 'pass' })));

  const rejQty = Number(rejected || 0);
  const totQty = Number(total    || 0);
  const appQty = Math.max(0, totQty - rejQty);
  const rate   = totQty > 0 ? ((rejQty / totQty) * 100).toFixed(1) : '0';

  const mut = useMutation({
    mutationFn: d => api.post(`/quality/lots/${lot.id}/inspect`, d),
    onSuccess: () => { toast.success('Inspeção registrada'); onSaved(); },
    onError:   e => toast.error(e.error || 'Erro'),
  });

  function submit(e) {
    e.preventDefault();
    if (!total) return toast.error('Informe o total inspecionado');
    const finalResult = result || (parseFloat(rate) > 5 ? 'rejected' : 'approved');
    mut.mutate({ total_inspected: totQty, approved_qty: appQty, rejected_qty: rejQty, result: finalResult, notes, criteria });
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="bg-blue-50 rounded-xl p-4">
        <p className="text-sm font-semibold text-blue-800">{lot.PRODUTOS?.name || `Lote ${lot.number}`}</p>
        <p className="text-xs text-blue-600 mt-0.5">Lote: {lot.number} · Qtd: {lot.quantity} {lot.unit}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Total inspecionado *</label>
          <input type="number" className="input" min="1" value={total}
            onChange={e => setTotal(e.target.value)} required />
        </div>
        <div>
          <label className="label">Quantidade rejeitada</label>
          <input type="number" className="input" min="0" value={rejected}
            onChange={e => setRejected(e.target.value)} />
        </div>
      </div>

      {/* Preview taxa */}
      {total && (
        <div className={`rounded-xl p-3 flex items-center gap-3 ${parseFloat(rate)>5 ? 'bg-red-50' : 'bg-green-50'}`}>
          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm ${parseFloat(rate)>5 ? 'bg-red-200 text-red-700':'bg-green-200 text-green-700'}`}>
            {rate}%
          </div>
          <div>
            <p className={`font-semibold text-sm ${parseFloat(rate)>5?'text-red-700':'text-green-700'}`}>
              Taxa de rejeição: {rate}%
            </p>
            <p className="text-xs text-gray-500">{appQty} aprovados · {rejQty} rejeitados de {totQty} inspecionados</p>
          </div>
        </div>
      )}

      {/* Critérios */}
      <div>
        <label className="label">Critérios de inspeção</label>
        <div className="space-y-2">
          {criteria.map((c, i) => (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
              <span className="text-sm flex-1">{c.name}</span>
              <div className="flex gap-1">
                {[['pass','✓ OK','bg-green-600'],['fail','✗ Falhou','bg-red-600']].map(([v,l,cls]) => (
                  <button key={v} type="button"
                    onClick={() => setCriteria(p => p.map((x,j) => j===i ? {...x, result: v} : x))}
                    className={`px-3 py-1 rounded-md text-xs font-medium text-white transition-colors ${
                      c.result===v ? cls : 'bg-gray-300 hover:bg-gray-400'
                    }`}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <label className="label">Resultado final</label>
        <select className="input" value={result} onChange={e => setResult(e.target.value)}>
          <option value="">Automático (baseado na taxa)</option>
          <option value="approved">Aprovado</option>
          <option value="conditional">Condicional</option>
          <option value="rejected">Reprovado</option>
        </select>
      </div>

      <div>
        <label className="label">Observações</label>
        <textarea className="input resize-none" rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div className="flex gap-2">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">Cancelar</button>
        <button type="submit" disabled={mut.isPending} className="btn-primary flex-1">
          {mut.isPending ? 'Registrando...' : 'Registrar Inspeção'}
        </button>
      </div>
    </form>
  );
}

// ── Certificado de conformidade ───────────────────────────
function Certificate({ lot }) {
  if (!lot) return null;
  const lastInsp = lot.inspections?.[0];
  const today    = format(new Date(), 'dd/MM/yyyy', { locale: ptBR });

  return (
    <div className="p-6 border-2 border-gray-200 rounded-xl space-y-4 text-sm" id="cert-print">
      <div className="flex items-center justify-between border-b pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Certificado de Conformidade</h2>
          <p className="text-gray-500 text-xs">Lote: {lot.number} · Emitido em {today}</p>
        </div>
        <Award size={40} className="text-green-600" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><p className="text-xs text-gray-400">Produto</p><p className="font-medium">{lot.PRODUTOS?.name || '—'}</p></div>
        <div><p className="text-xs text-gray-400">Quantidade</p><p className="font-medium">{lot.quantity} {lot.unit}</p></div>
        <div><p className="text-xs text-gray-400">Fornecedor</p><p className="font-medium">{lot.FORNECEDORES?.name || '—'}</p></div>
        <div><p className="text-xs text-gray-400">Data produção</p><p className="font-medium">{fmtDate(lot.production_date)}</p></div>
      </div>

      {lastInsp && (
        <div className="bg-gray-50 rounded-xl p-4 space-y-2">
          <p className="font-semibold text-gray-700">Resultado da Inspeção</p>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div><p className="text-xs text-gray-400">Inspecionados</p><p className="font-bold text-lg">{lastInsp.total_inspected}</p></div>
            <div><p className="text-xs text-gray-400">Aprovados</p><p className="font-bold text-lg text-green-700">{lastInsp.approved_qty}</p></div>
            <div><p className="text-xs text-gray-400">Rejeitados</p><p className="font-bold text-lg text-red-600">{lastInsp.rejected_qty}</p></div>
          </div>
          <div className="flex items-center justify-between pt-2 border-t">
            <span className="text-xs text-gray-500">Taxa de rejeição: <strong>{lastInsp.rejection_rate}%</strong></span>
            <span className={`badge ${RESULT_CFG[lastInsp.result]?.cls}`}>{RESULT_CFG[lastInsp.result]?.l}</span>
          </div>
        </div>
      )}

      <div className="pt-4 border-t text-center text-xs text-gray-400">
        Este certificado é gerado automaticamente pelo Sistema ERP Lyon Copos
      </div>
    </div>
  );
}

// ── Página principal ──────────────────────────────────────
export default function Quality() {
  const [tab, setTab]             = useState('lots');
  const [page, setPage]           = useState(1);
  const [statusFilter, setStatus] = useState('');
  const [modalNew, setModalNew]   = useState(false);
  const [inspectLot, setInspectLot] = useState(null);
  const [certLot, setCertLot]     = useState(null);
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['quality-stats'],
    queryFn: () => api.get('/quality/stats'),
  });
  const { data, isLoading } = useQuery({
    queryKey: ['lots', page, statusFilter, tab],
    queryFn: () => {
      if (tab === 'lots') {
        let u = `/quality/lots?page=${page}&limit=30`;
        if (statusFilter) u += `&status=${statusFilter}`;
        return api.get(u);
      }
      return api.get(`/quality/inspections?page=${page}&limit=30`);
    },
  });

  async function openCert(lot) {
    const detail = await api.get(`/quality/lots/${lot.id}`);
    setCertLot(detail);
  }

  const refresh = () => {
    qc.invalidateQueries(['lots']); qc.invalidateQueries(['quality-stats']);
  };

  return (
    <div className="space-y-5">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-teal-100 rounded-lg flex items-center justify-center">
            <FlaskConical size={18} className="text-teal-600"/>
          </div>
          <div>
            <h1 className="page-title">Qualidade e Lotes</h1>
            <p className="text-sm text-gray-500 mt-0.5">Controle de lotes com inspeção e certificação</p>
          </div>
        </div>
        <button onClick={() => setModalNew(true)} className="btn-primary"><Plus size={16}/> Novo Lote</button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label:'Total lotes',     val: stats?.lots?.total       || 0, cls:'text-gray-900'  },
          { label:'Ativos',          val: stats?.lots?.active      || 0, cls:'text-blue-700'  },
          { label:'Aprovados',       val: stats?.lots?.approved    || 0, cls:'text-green-700' },
          { label:'Rejeitados',      val: stats?.lots?.rejected    || 0, cls:'text-red-700'   },
          { label:'Taxa rej. média', val: `${stats?.inspections?.avg_rejection_rate||0}%`, cls:'text-orange-700' },
        ].map((s,i) => (
          <div key={i} className="card p-4 text-center">
            <p className={`text-2xl font-bold ${s.cls}`}>{s.val}</p>
            <p className="text-xs text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
        {[['lots','📦 Lotes'],['inspections','🔍 Inspeções']].map(([v,l]) => (
          <button key={v} onClick={() => { setTab(v); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===v ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-800'}`}>
            {l}
          </button>
        ))}
      </div>

      {/* Filtros */}
      {tab === 'lots' && (
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 w-fit">
          {[['','Todos'],['active','Ativos'],['approved','Aprovados'],['rejected','Rejeitados'],['consumed','Consumidos']].map(([v,l]) => (
            <button key={v} onClick={() => { setStatus(v); setPage(1); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${statusFilter===v?'bg-white shadow text-teal-700':'text-gray-500 hover:text-gray-800'}`}>
              {l}
            </button>
          ))}
        </div>
      )}

      {/* Tabela Lotes */}
      {tab === 'lots' && (
        <div className="card overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                <th>Lote</th><th>Produto</th><th>Qtd</th>
                <th>Status</th><th>Produção</th><th>Validade</th><th></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : (data?.data||[]).length===0 ? (
                <tr><td colSpan={7} className="text-center py-8 text-gray-400">Nenhum lote encontrado</td></tr>
              ) : (data?.data||[]).map(lot => (
                <tr key={lot.id} className="cursor-pointer hover:bg-gray-50/80">
                  <td className="font-mono font-semibold text-xs text-gray-600">{lot.number}</td>
                  <td>
                    <div>
                      <p className="font-medium text-sm">{lot.PRODUTOS?.name || '—'}</p>
                      {lot.FORNECEDORES && <p className="text-xs text-gray-400">{lot.FORNECEDORES.name}</p>}
                    </div>
                  </td>
                  <td className="font-semibold text-sm">{lot.quantity} {lot.unit}</td>
                  <td>
                    <span className={`badge text-xs ${STATUS_LOTE[lot.status]?.cls}`}>
                      {STATUS_LOTE[lot.status]?.l}
                    </span>
                  </td>
                  <td className="text-sm text-gray-500">{fmtDate(lot.production_date)}</td>
                  <td className="text-sm text-gray-500">{fmtDate(lot.expiry_date)}</td>
                  <td>
                    <div className="flex gap-1">
                      {['active','inspecting'].includes(lot.status) && (
                        <button onClick={e => { e.stopPropagation(); setInspectLot(lot); }}
                          className="btn-ghost btn-sm text-xs flex items-center gap-1">
                          <ClipboardCheck size={12}/> Inspecionar
                        </button>
                      )}
                      {lot.status === 'approved' && (
                        <button onClick={e => { e.stopPropagation(); openCert(lot); }}
                          className="btn-ghost btn-sm text-xs flex items-center gap-1 text-green-700">
                          <Award size={12}/> Certificado
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={page} total={data?.total||0} limit={30} onPageChange={setPage}/>
        </div>
      )}

      {/* Tabela Inspeções */}
      {tab === 'inspections' && (
        <div className="card overflow-x-auto">
          <table className="table-auto">
            <thead>
              <tr>
                <th>Data</th><th>Lote</th><th>Produto</th>
                <th className="text-right">Inspecionados</th>
                <th className="text-right">Aprovados</th>
                <th className="text-right">Rejeitados</th>
                <th>Taxa rej.</th><th>Resultado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Carregando...</td></tr>
              ) : (data?.data||[]).length===0 ? (
                <tr><td colSpan={8} className="text-center py-8 text-gray-400">Nenhuma inspeção</td></tr>
              ) : (data?.data||[]).map(insp => {
                const R = RESULT_CFG[insp.result];
                return (
                  <tr key={insp.id}>
                    <td className="text-sm">{fmtDate(insp.inspection_date)}</td>
                    <td className="font-mono text-xs font-semibold">{insp.LOTES?.number}</td>
                    <td className="text-sm">{insp.LOTES?.PRODUTOS?.name || '—'}</td>
                    <td className="text-right font-semibold">{insp.total_inspected}</td>
                    <td className="text-right text-green-700 font-semibold">{insp.approved_qty}</td>
                    <td className="text-right text-red-600 font-semibold">{insp.rejected_qty}</td>
                    <td>
                      <span className={`badge text-xs ${Number(insp.rejection_rate)>5?'bg-red-100 text-red-700':'bg-green-100 text-green-700'}`}>
                        {insp.rejection_rate}%
                      </span>
                    </td>
                    <td>
                      {R && <span className={`badge text-xs ${R.cls}`}>{R.l}</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination page={page} total={data?.total||0} limit={30} onPageChange={setPage}/>
        </div>
      )}

      {/* Modals */}
      <Modal isOpen={modalNew} onClose={() => setModalNew(false)} title="Novo Lote" size="lg">
        <LotForm onSaved={() => { setModalNew(false); refresh(); }} onCancel={() => setModalNew(false)}/>
      </Modal>
      <Modal isOpen={!!inspectLot} onClose={() => setInspectLot(null)} title="Registrar Inspeção" size="lg">
        <InspectForm lot={inspectLot} onSaved={() => { setInspectLot(null); refresh(); }} onCancel={() => setInspectLot(null)}/>
      </Modal>
      <Modal isOpen={!!certLot} onClose={() => setCertLot(null)} title="Certificado de Conformidade" size="lg">
        <Certificate lot={certLot}/>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setCertLot(null)} className="btn-secondary">Fechar</button>
          <button onClick={() => window.print()} className="btn-primary flex items-center gap-1"><Award size={14}/> Imprimir</button>
        </div>
      </Modal>
    </div>
  );
}
