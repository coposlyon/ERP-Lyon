import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, RefreshCw, FileInput, Filter, Search, FileText, X, Globe, Loader2, ChevronRight, ChevronLeft, Truck, Save, MapPin } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import PDV from './PDV';
import { id4 } from '@/lib/ids';
import { SALE_STATUSES, SALE_STATUS_ORDER, saleStatusIndex, saleStatusLabel, saleStatusClass } from '@/lib/saleStatus';
import { format, parseISO } from 'date-fns';
import toast from 'react-hot-toast';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const d  = iso => { if (!iso) return ''; try { return format(parseISO(iso), 'dd/MM/yyyy'); } catch { return iso; } };
const dt = iso => { if (!iso) return ''; try { return format(parseISO(iso), 'dd/MM/yyyy HH:mm:ss'); } catch { return iso; } };

const statusFilterOptions = [{ value: '', label: 'Todos os Status' }, ...SALE_STATUSES.map(s => ({ value: s.key, label: s.label }))];

// Botão da barra de ferramentas (estilo Delphi)
function TBtn({ icon: Icon, label, sub, onClick, disabled, danger }) {
  return (
    <button onClick={onClick} disabled={disabled} type="button"
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${danger ? 'text-red-600 hover:bg-red-50' : 'text-gray-700 hover:bg-primary-50'}`}>
      <Icon size={15} className={danger ? 'text-red-500' : 'text-primary-600'} /> {label}
      {sub && <span className="text-[10px] text-gray-400 font-normal">{sub}</span>}
    </button>
  );
}

const GRID_COLS = [
  { key: 'number',   label: 'Chave',               w: 78,  align: 'left' },
  { key: 'data',     label: 'Data',                w: 92,  align: 'left' },
  { key: 'evento',   label: 'Data do Evento',      w: 112, align: 'left' },
  { key: 'saida',    label: 'Data da Saída',       w: 110, align: 'left' },
  { key: 'entrega',  label: 'Previsão de Entrega', w: 132, align: 'left' },
  { key: 'cod',      label: 'Cód. Cliente',        w: 92,  align: 'left' },
  { key: 'cliente',  label: 'Cliente',             w: 0,   align: 'left' },
  { key: 'total',    label: 'Vr. Total',           w: 110, align: 'right' },
  { key: 'frete',    label: 'Vr. Frete',           w: 100, align: 'right' },
  { key: 'status',   label: 'Status',              w: 210, align: 'left' },
];

export default function Sales() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [newSaleOpen, setNewSaleOpen] = useState(false);
  const [delTarget, setDelTarget] = useState(null);
  const [delPassword, setDelPassword] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const searchRef = useRef();

  const { data, isLoading } = useQuery({
    queryKey: ['sales', page, status, search, startDate, endDate],
    queryFn: () => {
      let url = `/sales?page=${page}&limit=20`;
      if (status) url += `&status=${status}`;
      if (search) url += `&search=${encodeURIComponent(search)}`;
      if (startDate) url += `&start_date=${startDate}`;
      if (endDate) url += `&end_date=${endDate}`;
      return api.get(url);
    },
  });

  const rows = data?.data || [];
  const selected = rows.find(r => r.id === selectedId) || null;
  const pageTotal  = rows.reduce((s, r) => s + (r.total || 0), 0);
  const pageFreight = rows.reduce((s, r) => s + (r.freight || 0), 0);

  const deleteSale = useMutation({
    mutationFn: () => api.post(`/sales/${delTarget.id}/delete`, { password: delPassword }),
    onSuccess: () => { qc.invalidateQueries(['sales']); setDelTarget(null); setDelPassword(''); setSelectedId(null); toast.success('Pedido excluído!'); },
    onError: (e) => toast.error(e.error || 'Não foi possível excluir'),
  });

  function handleSearch(e) { e.preventDefault(); setSearch(searchInput); setPage(1); }
  function clearFilters() { setSearch(''); setSearchInput(''); setStatus(''); setStartDate(''); setEndDate(''); setPage(1); }
  const hasFilters = search || status || startDate || endDate;

  function openDelete() { if (selected) { setDelTarget(selected); setDelPassword(''); } }
  function alterar() { if (selectedId) navigate(`/sales/${selectedId}`); }

  // Atalhos estilo Delphi (F2 incluir, F3 alterar, F4 excluir, F5 atualizar, F6 importar, Ctrl+F pesquisar, ESC fechar)
  useEffect(() => {
    const onKey = (e) => {
      if (newSaleOpen || delTarget) return; // deixa o modal tratar
      if (e.key === 'F2') { e.preventDefault(); setNewSaleOpen(true); }
      else if (e.key === 'F3') { if (selectedId) { e.preventDefault(); alterar(); } }
      else if (e.key === 'F4') { if (selectedId && isAdmin) { e.preventDefault(); openDelete(); } }
      else if (e.key === 'F5') { e.preventDefault(); qc.invalidateQueries(['sales']); }
      else if (e.key === 'F6') { e.preventDefault(); navigate('/quotes'); }
      else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); setShowFilters(true); setTimeout(() => searchRef.current?.focus(), 50); }
      else if (e.key === 'Escape') { const a = document.activeElement; if (!a || !/INPUT|SELECT|TEXTAREA/.test(a.tagName)) navigate('/'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, isAdmin, newSaleOpen, delTarget]); // eslint-disable-line

  function cellValue(col, row) {
    switch (col.key) {
      case 'number': return (
        <span className="flex items-center gap-1">
          <b className="font-mono">{row.number}</b>
          {row.source === 'site' && <Globe size={10} className="text-violet-500" title="Pedido pelo site" />}
        </span>
      );
      case 'data':    return d(row.operation_date || row.created_at);
      case 'evento':  return d(row.event_date) || <span className="text-gray-300">—</span>;
      case 'saida':   return d(row.ship_date) || <span className="text-gray-300">—</span>;
      case 'entrega': return d(row.delivery_date || row.max_delivery_date) || <span className="text-gray-300">—</span>;
      case 'cod':     return row.CLIENTES?.display_id != null ? <span className="font-mono">{id4(row.CLIENTES.display_id)}</span> : <span className="text-gray-300">—</span>;
      case 'cliente': return <span className="font-medium">{row.CLIENTES?.name || 'Consumidor Final'}</span>;
      case 'total':   return <b>{fmt(row.total)}</b>;
      case 'frete':   return row.freight > 0 ? fmt(row.freight) : <span className="text-gray-300">—</span>;
      case 'status':  return <span className={`badge ${saleStatusClass(row.status)} text-[10px]`}>{saleStatusLabel(row.status)}</span>;
      default: return '';
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h1 className="page-title">Pedido de Venda</h1>
        <p className="text-sm text-gray-500">{data?.total || 0} pedidos{hasFilters ? ' (filtrado)' : ''}</p>
      </div>

      {/* Barra de ferramentas (estilo Delphi) */}
      <div className="card flex items-center gap-1 px-2 py-1.5 flex-wrap">
        <TBtn icon={Plus}      label="Incluir"   sub="F2" onClick={() => setNewSaleOpen(true)} />
        <TBtn icon={Pencil}    label="Alterar"   sub="F3" onClick={alterar} disabled={!selectedId} />
        <TBtn icon={Trash2}    label="Excluir"   sub="F4" onClick={openDelete} disabled={!selectedId || !isAdmin} danger />
        <TBtn icon={RefreshCw} label="Atualizar" sub="F5" onClick={() => qc.invalidateQueries(['sales'])} />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <TBtn icon={Filter}    label="Filtros"   onClick={() => setShowFilters(v => !v)} />
        <TBtn icon={Search}    label="Pesquisar" sub="Ctrl+F" onClick={() => { setShowFilters(true); setTimeout(() => searchRef.current?.focus(), 50); }} />
        <TBtn icon={FileInput} label="Importar Orçamento" sub="F6" onClick={() => navigate('/quotes')} />
        <TBtn icon={FileText}  label="Relatórios" onClick={() => window.print()} />
        <span className="w-px h-5 bg-gray-200 mx-1" />
        <TBtn icon={X}         label="Fechar"    sub="ESC" onClick={() => navigate('/')} />
      </div>

      {/* Filtros (abrem/fecham) */}
      {showFilters && (
        <div className="card p-3">
          <form onSubmit={handleSearch} className="flex gap-3 flex-wrap items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="label">Buscar cliente</label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input ref={searchRef} type="text" placeholder="Nome do cliente..." value={searchInput}
                  onChange={e => setSearchInput(e.target.value)} className="input pl-8 text-sm" />
              </div>
            </div>
            <div>
              <label className="label">Status</label>
              <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="input w-56 text-sm">
                {statusFilterOptions.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">De</label>
              <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setPage(1); }} className="input w-36 text-sm" />
            </div>
            <div>
              <label className="label">Até</label>
              <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setPage(1); }} className="input w-36 text-sm" />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-secondary text-sm">Buscar</button>
              {hasFilters && <button type="button" onClick={clearFilters} className="btn-ghost text-sm text-red-500">Limpar</button>}
            </div>
          </form>
        </div>
      )}

      {/* Grade dos pedidos */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-blue-50 text-gray-700">
                {GRID_COLS.map(c => (
                  <th key={c.key} style={c.w ? { width: c.w } : undefined}
                    className={`px-2 py-2 font-bold border-b border-blue-100 ${c.align === 'right' ? 'text-right' : 'text-left'}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={GRID_COLS.length} className="text-center py-10 text-gray-400"><Loader2 size={20} className="animate-spin inline" /></td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={GRID_COLS.length} className="text-center py-10 text-gray-400">Nenhum pedido encontrado</td></tr>
              ) : rows.map(row => {
                const sel = row.id === selectedId;
                return (
                  <tr key={row.id} onClick={() => setSelectedId(row.id)} onDoubleClick={() => navigate(`/sales/${row.id}`)}
                    className={`cursor-pointer border-b border-gray-50 ${sel ? 'bg-blue-200/70' : 'hover:bg-blue-50/50'}`}>
                    {GRID_COLS.map(c => (
                      <td key={c.key} className={`px-2 py-1.5 whitespace-nowrap ${c.align === 'right' ? 'text-right' : 'text-left'} ${c.key === 'cliente' ? 'max-w-[260px] truncate' : ''}`}>
                        {cellValue(c, row)}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
            {/* Rodapé com contagem + soma (estilo Delphi) */}
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-yellow-50 font-bold text-gray-700 border-t-2 border-yellow-200">
                  <td className="px-2 py-1.5" colSpan={6}>{rows.length} pedido{rows.length !== 1 ? 's' : ''} nesta página</td>
                  <td className="px-2 py-1.5 text-right">{fmt(pageTotal)}</td>
                  <td className="px-2 py-1.5 text-right">{pageFreight > 0 ? fmt(pageFreight) : ''}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <Pagination page={page} total={data?.total || 0} limit={20} onPageChange={p => { setPage(p); setSelectedId(null); }} />
      </div>

      {/* Painel master-detail (abas) */}
      <SaleDetail saleId={selectedId} onChanged={() => qc.invalidateQueries(['sales'])} />

      {/* Novo pedido (PDV) */}
      <Modal isOpen={newSaleOpen} onClose={() => setNewSaleOpen(false)} title="Novo Pedido de Venda" size="full">
        <PDV onDone={() => { setNewSaleOpen(false); qc.invalidateQueries(['sales']); }} />
      </Modal>

      {/* Excluir pedido (admin + senha) */}
      <Modal isOpen={!!delTarget} onClose={() => !deleteSale.isPending && setDelTarget(null)} title="Excluir pedido de venda" size="sm">
        <div className="space-y-4">
          <div className="flex gap-2.5 bg-red-50 border border-red-100 rounded-xl p-3">
            <Trash2 size={18} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              Você vai <b>excluir permanentemente</b> o pedido <b>#{delTarget?.number}</b>
              {delTarget?.CLIENTES?.name ? <> de <b>{delTarget.CLIENTES.name}</b></> : ''}. Esta ação não pode ser desfeita.
            </p>
          </div>
          <div>
            <label className="label">Confirme com a sua senha de admin</label>
            <input type="password" className="input" autoFocus value={delPassword}
              onChange={e => setDelPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && delPassword && deleteSale.mutate()} placeholder="Sua senha" />
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button onClick={() => setDelTarget(null)} disabled={deleteSale.isPending} className="btn-secondary">Cancelar</button>
            <button onClick={() => deleteSale.mutate()} disabled={deleteSale.isPending || !delPassword}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50">
              {deleteSale.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Excluir
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Painel de detalhes do pedido selecionado (abas Produtos / Pagamento / Transportadores / Status / Anexos)
const PAY_LABELS = { cash: 'Dinheiro', pix: 'Pix', card_debit: 'Cartão Débito', card_credit: 'Cartão Crédito', transfer: 'Transferência', check: 'Cheque', a_prazo: 'A Prazo' };
const DETAIL_TABS = [
  ['produtos', '1 - Produtos'], ['pagamento', '2 - Forma de Pagamento'],
  ['transportadores', '3 - Transportadores'], ['status', '4 - Status'], ['anexos', '5 - Anexos'],
];

function SaleDetail({ saleId, onChanged }) {
  const [tab, setTab] = useState('produtos');
  const qc = useQueryClient();
  const { data: sale, isLoading } = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => api.get(`/sales/${saleId}`),
    enabled: !!saleId,
  });

  const changeStatus = useMutation({
    mutationFn: (dir) => {
      const idx = saleStatusIndex(sale.status);
      if (dir === 'next') {
        if (sale.status === 'iniciando_pedido') return api.post(`/sales/${saleId}/start`);
        return api.patch(`/sales/${saleId}/status`, { status: SALE_STATUS_ORDER[idx + 1] });
      }
      return api.patch(`/sales/${saleId}/status`, { status: SALE_STATUS_ORDER[idx - 1] });
    },
    onSuccess: () => { qc.invalidateQueries(['sale', saleId]); onChanged?.(); toast.success('Status atualizado'); },
    onError: (e) => toast.error(e.error || 'Não foi possível mudar o status'),
  });

  if (!saleId) {
    return (
      <div className="card p-6 text-center text-sm text-gray-400">
        Selecione um pedido acima para ver Produtos, Forma de Pagamento, Transportadores, Status e Anexos.
      </div>
    );
  }

  const idx = sale ? saleStatusIndex(sale.status) : -1;
  // Histórico de status (criação + mudanças registradas no production_log)
  const history = [];
  if (sale) {
    history.push({ action: 'iniciando_pedido', at: sale.created_at, user: sale.USUARIOS?.name || 'Sistema' });
    for (const e of (sale.production_log || [])) if (e.stage === 'status') history.push({ action: e.action, at: e.at, user: e.user });
  }

  return (
    <div className="card overflow-hidden">
      {/* Abas */}
      <div className="flex gap-1 border-b border-gray-200 bg-gray-50 px-2 pt-2 overflow-x-auto">
        {DETAIL_TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`px-3 py-2 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors ${tab === k ? 'bg-white border border-gray-200 border-b-white -mb-px text-primary-700' : 'text-gray-500 hover:text-gray-800'}`}>
            {l}
          </button>
        ))}
      </div>

      <div className="p-3 min-h-[180px]">
        {isLoading || !sale ? (
          <div className="flex items-center justify-center py-8 text-gray-400"><Loader2 size={20} className="animate-spin" /></div>
        ) : (
          <>
            {/* cabeçalho do pedido */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-3 pb-2 border-b border-gray-100">
              <span>Pedido <b className="text-gray-800 font-mono">{sale.number}</b></span>
              <span>Cliente <b className="text-gray-800">{sale.CLIENTES?.name || 'Consumidor Final'}</b></span>
              <span>Total <b className="text-gray-800">{fmt(sale.total)}</b></span>
              {sale.freight > 0 && <span>Frete <b className="text-gray-800">{fmt(sale.freight)}</b></span>}
              <span className={`badge ${saleStatusClass(sale.status)} text-[10px]`}>{saleStatusLabel(sale.status)}</span>
            </div>

            {tab === 'produtos' && (
              <table className="w-full text-xs">
                <thead><tr className="text-gray-500 border-b border-gray-100">
                  <th className="text-left py-1.5">Produto</th><th className="text-right">Qtd</th>
                  <th className="text-right">Vr. Unit.</th><th className="text-right">Desc.</th><th className="text-right">Total</th>
                </tr></thead>
                <tbody>
                  {(sale.items || []).map(it => (
                    <tr key={it.id} className="border-b border-gray-50">
                      <td className="py-1.5">
                        {it.PRODUTOS?.name || 'Produto'}
                        {it.customization?.['Variação'] && <span className="text-gray-400"> · {it.customization['Variação']}</span>}
                      </td>
                      <td className="text-right">{it.quantity}</td>
                      <td className="text-right">{fmt(it.unit_price)}</td>
                      <td className="text-right">{it.discount > 0 ? fmt(it.discount) : '—'}</td>
                      <td className="text-right font-semibold">{fmt(it.total)}</td>
                    </tr>
                  ))}
                  {(sale.items || []).length === 0 && <tr><td colSpan={5} className="py-4 text-center text-gray-400">Sem itens</td></tr>}
                </tbody>
              </table>
            )}

            {tab === 'pagamento' && (
              <div className="space-y-3">
                <div className="flex gap-6 text-sm">
                  <div><span className="text-gray-400 text-xs block">Forma</span><b>{PAY_LABELS[sale.payment_method] || sale.payment_method || '—'}</b></div>
                  <div><span className="text-gray-400 text-xs block">Desconto</span><b>{fmt(sale.discount)}</b></div>
                  <div><span className="text-gray-400 text-xs block">Total</span><b>{fmt(sale.total)}</b></div>
                </div>
                {(sale.payments || []).length > 0 && (
                  <table className="w-full text-xs mt-2">
                    <thead><tr className="text-gray-500 border-b border-gray-100">
                      <th className="text-left py-1.5">Parcela</th><th className="text-left">Vencimento</th><th className="text-right">Valor</th><th className="text-left pl-3">Situação</th>
                    </tr></thead>
                    <tbody>
                      {sale.payments.map(p => (
                        <tr key={p.id} className="border-b border-gray-50">
                          <td className="py-1.5">{p.installment || 1}{p.total_installments ? `/${p.total_installments}` : ''}</td>
                          <td>{d(p.due_date)}</td>
                          <td className="text-right">{fmt(p.amount)}</td>
                          <td className="pl-3"><span className={`badge text-[10px] ${p.status === 'paid' ? 'badge-green' : 'badge-yellow'}`}>{p.status === 'paid' ? 'Pago' : 'Pendente'}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {tab === 'transportadores' && <TransportTab key={sale.id} sale={sale} onChanged={onChanged} />}

            {tab === 'status' && (
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <button onClick={() => changeStatus.mutate('next')} disabled={changeStatus.isPending || idx >= SALE_STATUS_ORDER.length - 1}
                    className="flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 hover:bg-green-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
                    <ChevronRight size={14} /> Incluir Status {sale.status !== 'iniciando_pedido' && idx >= 0 && idx < SALE_STATUS_ORDER.length - 1 ? `→ ${saleStatusLabel(SALE_STATUS_ORDER[idx + 1])}` : ''}
                  </button>
                  <button onClick={() => changeStatus.mutate('prev')} disabled={changeStatus.isPending || idx <= 0}
                    className="flex items-center gap-1 text-xs font-semibold text-red-600 bg-red-50 hover:bg-red-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
                    <ChevronLeft size={14} /> Excluir Status
                  </button>
                </div>
                <table className="w-full text-xs">
                  <thead><tr className="text-gray-500 border-b border-gray-100">
                    <th className="text-left py-1.5">Status</th><th className="text-left">Data/Hora</th><th className="text-left">Usuário</th>
                  </tr></thead>
                  <tbody>
                    {history.map((h, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 font-semibold">{saleStatusLabel(h.action)}</td>
                        <td>{dt(h.at)}</td>
                        <td>{h.user || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {tab === 'anexos' && (
              <div className="text-sm">
                {sale.artwork_url ? (
                  <a href={sale.artwork_url} target="_blank" rel="noreferrer" className="text-primary-600 hover:underline font-medium">Ver arte anexada ↗</a>
                ) : <p className="text-gray-400">Nenhum anexo neste pedido.</p>}
                {sale.artwork_notes && <p className="text-gray-500 mt-2">{sale.artwork_notes}</p>}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Aba Transportadores: define a transportadora + código de rastreio e consulta o rastreio (J&T)
function TransportTab({ sale, onChanged }) {
  const qc = useQueryClient();
  const [carrierId, setCarrierId] = useState(sale.carrier_id || '');
  const [tracking, setTracking] = useState(sale.tracking_code || '');
  const [events, setEvents] = useState(null);

  const { data: carriers } = useQuery({ queryKey: ['carriers'], queryFn: () => api.get('/shipping/carriers') });

  const saveMut = useMutation({
    mutationFn: () => api.patch(`/sales/${sale.id}/shipping`, { carrier_id: carrierId || null, tracking_code: tracking }),
    onSuccess: () => { qc.invalidateQueries(['sale', sale.id]); onChanged?.(); toast.success('Transportadora salva'); },
    onError: (e) => toast.error(e.error || 'Erro ao salvar'),
  });

  const trackMut = useMutation({
    mutationFn: () => api.get(`/shipping/track/${encodeURIComponent(tracking.trim())}`),
    onSuccess: (r) => { setEvents(r.events || []); if (!(r.events || []).length) toast('Sem movimentações ainda.'); },
    onError: (e) => { setEvents(null); toast.error(e.error || 'Não foi possível rastrear'); },
  });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div><span className="text-gray-400 text-xs block">Vr. Frete</span><b>{fmt(sale.freight)}</b></div>
        <div><span className="text-gray-400 text-xs block">Data da Saída</span><b>{d(sale.ship_date) || '—'}</b></div>
        <div><span className="text-gray-400 text-xs block">Previsão de Entrega</span><b>{d(sale.delivery_date || sale.max_delivery_date) || '—'}</b></div>
        <div><span className="text-gray-400 text-xs block">Data do Evento</span><b>{d(sale.event_date) || '—'}</b></div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 items-end border-t border-gray-100 pt-3">
        <div>
          <label className="label flex items-center gap-1"><Truck size={13} /> Transportadora</label>
          <select className="input text-sm" value={carrierId} onChange={e => setCarrierId(e.target.value)}>
            <option value="">— selecione —</option>
            {(carriers?.data || []).map(c => <option key={c.id} value={c.id}>{c.trade_name || c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Código de rastreio</label>
          <div className="flex gap-2">
            <input className="input text-sm font-mono" value={tracking} onChange={e => setTracking(e.target.value)} placeholder="Ex.: JT0000000000" />
            <button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} className="btn-secondary text-sm whitespace-nowrap">
              {saveMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
            </button>
          </div>
        </div>
      </div>

      <div>
        <button onClick={() => trackMut.mutate()} disabled={trackMut.isPending || !tracking.trim()}
          className="flex items-center gap-1.5 text-sm font-semibold text-primary-700 bg-primary-50 hover:bg-primary-100 rounded-lg px-3 py-1.5 disabled:opacity-40">
          {trackMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <MapPin size={14} />} Rastrear encomenda
        </button>
        {events && events.length > 0 && (
          <ul className="mt-3 space-y-2">
            {events.map((ev, i) => (
              <li key={i} className="flex gap-3 text-xs">
                <span className="text-gray-400 whitespace-nowrap w-32 shrink-0">{ev.time ? dt(ev.time) : ''}</span>
                <span>
                  <b className="text-gray-800">{ev.status || ev.desc || '—'}</b>
                  {ev.where && <span className="text-gray-500"> · {ev.where}</span>}
                  {ev.desc && ev.desc !== ev.status && <span className="text-gray-500 block">{ev.desc}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        {events && events.length === 0 && <p className="text-xs text-gray-400 mt-2">Sem movimentações registradas para este código.</p>}
      </div>
    </div>
  );
}
