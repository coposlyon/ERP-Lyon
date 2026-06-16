import { useState, useMemo } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  AlertTriangle, MessageCircle, FileText, Loader2,
  PackageX, CheckCircle2, ChevronDown, ChevronRight,
  TrendingUp, TrendingDown, ArrowRight, Package,
  AlertCircle, PackageCheck, TriangleAlert,
} from 'lucide-react';
import api from '@/lib/api';
import { id4 } from '@/lib/ids';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

const PERDA_MOTIVOS = ['Quebra', 'Vencimento', 'Defeito de fabricação', 'Erro de produção', 'Extravio', 'Outro'];

const REF_LABELS = {
  replenishment_request:  'Solicitação de Reposição',
  replenishment_received: 'Reposição Recebida',
  replenishment:          'Reposição',
  manual:                 'Manual',
  sale:                   'Venda',
  purchase:               'Compra',
  return:                 'Devolução',
};

// ─────────────────────────────────────────────────────────────────────────────
// Formulário de Perda (apenas registro de perdas)
// ─────────────────────────────────────────────────────────────────────────────
function PerdaForm({ onSaved, onCancel }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search,    setSearch]    = useState('');
  const [quantity,  setQuantity]  = useState('');
  const [motivo,    setMotivo]    = useState('');
  const [notes,     setNotes]     = useState('');
  const [loading,   setLoading]   = useState(false);

  const { data: products } = useQuery({
    queryKey: ['products-adj', search],
    queryFn: () => api.get(`/products?search=${search}&limit=10&is_active=true`),
    enabled: search.length >= 2,
  });

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedProduct)  { toast.error('Selecione um produto'); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0)  { toast.error('Informe uma quantidade maior que zero'); return; }
    if (!motivo)           { toast.error('Informe o motivo da perda'); return; }

    setLoading(true);
    try {
      const msg = `PERDA DE PRODUÇÃO — Motivo: ${motivo}${notes ? `. ${notes}` : ''}`;
      await api.post('/stock/adjustment', { product_id: selectedProduct.id, quantity: -qty, notes: msg });
      toast.success('Perda registrada!');
      onSaved();
    } catch (err) {
      toast.error(err.error || 'Erro ao registrar perda');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Produto */}
      <div>
        <label className="label">Produto</label>
        {selectedProduct ? (
          <div className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-orange-800">{selectedProduct.name}</p>
              <p className="text-xs text-orange-500">Estoque atual: {selectedProduct.current_stock}</p>
            </div>
            <button type="button" onClick={() => setSelectedProduct(null)}
              className="text-orange-400 hover:text-red-500 text-xs underline ml-2">trocar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="input" placeholder="Digite para buscar produto..." value={search}
              onChange={e => setSearch(e.target.value)} autoFocus />
            {products?.data?.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {products.data.map(p => (
                  <button key={p.id} type="button" onClick={() => { setSelectedProduct(p); setSearch(''); }}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-50 last:border-0">
                    <p className="font-medium">{p.name}</p>
                    <p className="text-xs text-gray-400">Estoque: {p.current_stock}</p>
                  </button>
                ))}
              </div>
            )}
            {search.length >= 2 && products?.data?.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-2">Nenhum produto encontrado</p>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="label">Quantidade perdida *</label>
        <input type="number" step="1" min="1" className="input"
          value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ex: 10" />
      </div>

      <div>
        <label className="label">Motivo da perda *</label>
        <select className="input" value={motivo} onChange={e => setMotivo(e.target.value)}>
          <option value="">Selecione o motivo...</option>
          {PERDA_MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>

      <div>
        <label className="label">Observação</label>
        <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Detalhes adicionais sobre a perda..." />
      </div>

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading}
          className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50">
          {loading
            ? <><Loader2 size={15} className="animate-spin" /> Salvando...</>
            : <><AlertTriangle size={15} /> Registrar Perda</>}
        </button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Card de movimentação — compacto com "Detalhes" expansível
// ─────────────────────────────────────────────────────────────────────────────
function MovementCard({ m }) {
  const [open, setOpen] = useState(false);

  const produto  = m.PRODUTOS;
  const usuario  = m.USUARIOS;
  const isPending = m.reference_type === 'replenishment_request';
  const isLoss    = !isPending && (m.notes || '').toUpperCase().includes('PERDA');

  // Extrai número de controle das obs
  const controleMatch = (m.notes || '').match(/CONTROLE:\s*(\w+)/);
  const controle = controleMatch ? controleMatch[1] : null;

  // Tipo badge
  let badgeCls, badgeLbl;
  if (isPending)    { badgeCls = 'bg-amber-100 text-amber-700';   badgeLbl = 'Pend. Reposição'; }
  else if (isLoss)  { badgeCls = 'bg-red-100 text-red-700';       badgeLbl = '⚠️ Perda'; }
  else {
    const cfg = {
      entry:      ['bg-green-100 text-green-700',   '↑ Entrada'],
      exit:       ['bg-sky-100 text-sky-700',        '↓ Saída'],
      adjustment: ['bg-blue-100 text-blue-700',      'Ajuste'],
      return:     ['bg-purple-100 text-purple-700',  'Devolução'],
    };
    [badgeCls, badgeLbl] = cfg[m.type] || ['bg-gray-100 text-gray-600', m.type];
  }

  const qty        = m.quantity ?? 0;
  const isPositive = qty >= 0;

  let dateStr = '—';
  try { dateStr = format(parseISO(m.created_at), 'dd/MM/yy HH:mm', { locale: ptBR }); } catch {}

  // Limpa PDF do notes para exibição
  const cleanNotes = (m.notes || '').replace(/\s*\|\s*PDF:\s*https?:\/\/\S+/, '').trim();
  const pdfUrl     = (m.notes || '').match(/PDF:\s*(https?:\/\/\S+)/)?.[1] || null;

  return (
    <div className="border-b border-gray-100 last:border-0">
      {/* Linha principal */}
      <div
        className="flex items-center gap-2 px-4 py-3 hover:bg-gray-50/70 transition-colors cursor-pointer select-none"
        onClick={() => setOpen(v => !v)}
      >
        {/* Data */}
        <span className="text-xs text-gray-400 font-mono shrink-0 w-[90px]">{dateStr}</span>

        {/* Produto + Código */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate leading-tight">{produto?.name || '—'}</p>
          {produto?.code && (
            <span className="text-xs text-gray-400 font-mono">{id4(produto.code)}</span>
          )}
        </div>

        {/* Tipo badge */}
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${badgeCls}`}>
          {badgeLbl}
        </span>

        {/* Quantidade */}
        <span className={`text-sm font-bold w-10 text-right tabular-nums shrink-0 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
          {isPositive && qty !== 0 ? '+' : ''}{qty}
        </span>

        {/* Controle badge */}
        {controle
          ? <span className="text-xs font-mono bg-amber-50 border border-amber-200 text-amber-700 px-2 py-0.5 rounded-md shrink-0">#{controle}</span>
          : <span className="w-[68px] shrink-0" />
        }

        {/* Toggle Detalhes */}
        <div className="flex items-center gap-0.5 text-xs text-primary-600 font-medium shrink-0">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span>Detalhes</span>
        </div>
      </div>

      {/* Card expandido */}
      {open && (
        <div className="mx-4 mb-3 bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Estoque</p>
              <p className="text-sm font-semibold text-gray-800 tabular-nums flex items-center gap-1">
                {m.previous_stock ?? '—'}
                <ArrowRight size={12} className="text-gray-400" />
                {m.current_stock ?? '—'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Referência</p>
              <p className="text-sm text-gray-700">{REF_LABELS[m.reference_type] || m.reference_type || '—'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Usuário</p>
              <p className="text-sm text-gray-700">{usuario?.name || '—'}</p>
            </div>
          </div>

          {cleanNotes && (
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold mb-0.5">Observação</p>
              <p className="text-xs text-gray-700 bg-white border border-gray-100 rounded-lg px-3 py-2 break-words leading-relaxed">
                {cleanNotes}
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noreferrer"
                    className="ml-2 text-amber-600 hover:text-amber-700 underline font-medium">
                    📄 Ver PDF
                  </a>
                )}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// WhatsApp helper
// ─────────────────────────────────────────────────────────────────────────────
function openSupplierWhatsApp(product) {
  const supplier = product.FORNECEDORES;
  if (!supplier?.phone) { toast.error('Fornecedor não tem telefone cadastrado'); return; }
  const num  = supplier.phone.replace(/\D/g, '');
  const full = num.startsWith('55') ? num : `55${num}`;
  const msg  = encodeURIComponent(
    `Olá ${supplier.name}, tudo bem?\n\nEstamos precisando repor o produto *${product.name}* em nosso estoque.\n\nPoderia nos informar disponibilidade e prazo de entrega?\n\nObrigado!`
  );
  window.open(`https://wa.me/${full}?text=${msg}`, '_blank');
}

// ─────────────────────────────────────────────────────────────────────────────
// Stock page
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// Sugestão de Compra — itens no/abaixo do mínimo, agrupados por fornecedor
// ─────────────────────────────────────────────────────────────────────────────
function PurchaseSuggestion() {
  const { data: groups = [], isLoading } = useQuery({
    queryKey: ['purchase-suggestion'],
    queryFn: () => api.get('/stock/purchase-suggestion'),
  });

  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary-500" /></div>;
  if (groups.length === 0) return (
    <div className="text-center py-12">
      <PackageCheck size={40} className="text-green-500 mx-auto mb-3" />
      <p className="text-green-600 font-medium">Tudo em dia — nenhum produto abaixo do mínimo.</p>
    </div>
  );

  return (
    <div className="space-y-4 p-4">
      {groups.map(g => (
        <div key={g.supplier_id || 'none'} className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between bg-gray-50 px-4 py-3 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Package size={16} className="text-indigo-600" />
              <p className="font-semibold text-gray-800">{g.supplier_name}</p>
              <span className="text-xs text-gray-400">· {g.items.length} {g.items.length === 1 ? 'item' : 'itens'}</span>
            </div>
            <span className="font-bold text-indigo-700">{fmt(g.total_estimado)}</span>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-2 font-semibold">Produto</th>
                <th className="text-right px-4 py-2 font-semibold w-24">Estoque</th>
                <th className="text-right px-4 py-2 font-semibold w-24">Mínimo</th>
                <th className="text-right px-4 py-2 font-semibold w-28">Comprar</th>
                <th className="text-right px-4 py-2 font-semibold w-28">Custo est.</th>
              </tr>
            </thead>
            <tbody>
              {g.items.map(it => (
                <tr key={it.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 text-sm">
                    <span className="font-medium text-gray-800">{it.name}</span>
                    <span className="text-xs text-gray-400 ml-2 font-mono">{id4(it.code)}</span>
                  </td>
                  <td className={`px-4 py-2 text-right text-sm font-medium ${it.current_stock < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    {it.current_stock} {it.unit}
                  </td>
                  <td className="px-4 py-2 text-right text-sm text-gray-500">{it.min_stock}</td>
                  <td className="px-4 py-2 text-right text-sm font-bold text-indigo-700">+{it.suggested_qty} {it.unit}</td>
                  <td className="px-4 py-2 text-right text-sm text-gray-600">{fmt(it.estimated_cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      <p className="text-xs text-gray-400">
        Sugestão para repor cada produto até o estoque mínimo. Use estes números para criar os pedidos de compra.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Inventário — contagem física com ajuste automático das diferenças
// ─────────────────────────────────────────────────────────────────────────────
function InventoryCount() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [counts, setCounts] = useState({}); // { product_id: '12' }

  const { data: products = [], isLoading } = useQuery({
    queryKey: ['count-sheet', search],
    queryFn: () => api.get(`/stock/count-sheet${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  });

  const applyMut = useMutation({
    mutationFn: items => api.post('/stock/inventory', { items }),
    onSuccess: res => {
      toast.success(res.adjusted > 0 ? `${res.adjusted} produto(s) ajustado(s)!` : 'Nenhuma diferença encontrada');
      setCounts({});
      qc.invalidateQueries(['count-sheet']);
      qc.invalidateQueries(['stock-report']);
      qc.invalidateQueries(['stock-movements']);
    },
    onError: e => toast.error(e.error || 'Erro ao aplicar inventário'),
  });

  const pending = Object.entries(counts).filter(([id, v]) => {
    if (v === '' || v == null) return false;
    const p = products.find(x => x.id === id);
    return p && Number(v) !== Number(p.current_stock);
  });

  function apply() {
    const items = pending.map(([product_id, counted]) => ({ product_id, counted: Number(counted) }));
    if (items.length === 0) { toast.error('Nenhuma contagem diferente do sistema'); return; }
    if (!window.confirm(`Aplicar ${items.length} ajuste(s) de inventário? Isso altera o estoque.`)) return;
    applyMut.mutate(items);
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <input className="input max-w-xs text-sm" placeholder="Buscar produto para contar..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <button onClick={apply} disabled={applyMut.isPending || pending.length === 0}
          className="btn-primary btn-sm disabled:opacity-40">
          {applyMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
          Aplicar inventário {pending.length > 0 ? `(${pending.length})` : ''}
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center p-8"><Loader2 className="animate-spin text-primary-500" /></div>
      ) : (
        <div className="overflow-x-auto border border-gray-100 rounded-xl">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr className="text-xs text-gray-500 uppercase">
                <th className="text-left px-4 py-2 font-semibold">Produto</th>
                <th className="text-right px-4 py-2 font-semibold w-28">Sistema</th>
                <th className="text-right px-4 py-2 font-semibold w-32">Contado</th>
                <th className="text-right px-4 py-2 font-semibold w-28">Diferença</th>
              </tr>
            </thead>
            <tbody>
              {products.map(p => {
                const counted = counts[p.id];
                const has = counted !== '' && counted != null;
                const diff = has ? Number(counted) - Number(p.current_stock) : null;
                return (
                  <tr key={p.id} className="border-t border-gray-50 hover:bg-gray-50/50">
                    <td className="px-4 py-2 text-sm">
                      <span className="font-medium text-gray-800">{p.name}</span>
                      <span className="text-xs text-gray-400 ml-2 font-mono">{id4(p.code)}</span>
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-mono text-gray-600">{p.current_stock} {p.unit}</td>
                    <td className="px-4 py-2 text-right">
                      <input type="number" step="any" className="input w-24 text-right text-sm py-1"
                        value={counted ?? ''} placeholder="—"
                        onChange={e => setCounts(c => ({ ...c, [p.id]: e.target.value }))} />
                    </td>
                    <td className="px-4 py-2 text-right text-sm font-bold">
                      {diff === null ? <span className="text-gray-300">—</span>
                        : diff === 0 ? <span className="text-green-600">0</span>
                        : <span className={diff > 0 ? 'text-blue-600' : 'text-red-600'}>{diff > 0 ? '+' : ''}{diff}</span>}
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr><td colSpan={4} className="py-8 text-center text-gray-400 text-sm">Nenhum produto</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Digite a quantidade contada fisicamente. Ao aplicar, o sistema ajusta o estoque e registra cada diferença como movimentação de inventário.
      </p>
    </div>
  );
}

export default function Stock() {
  const { tenant } = useAuth();
  const [tab, setTab]             = useState('position');
  const [page, setPage]           = useState(1);
  const [showZeroOnly, setShowZeroOnly] = useState(false);
  const [perdaOpen, setPerdaOpen] = useState(false);

  // Modal de reposição
  const [replenishModal, setReplenishModal]             = useState(false);
  const [soliciting, setSoliciting]                     = useState(false);
  const [confirmResend, setConfirmResend]                = useState(null);
  const [confirmCompleteOrder, setConfirmCompleteOrder] = useState(null);
  const [completing, setCompleting]                     = useState(false);
  const [protocolInput, setProtocolInput]               = useState('');

  const qc = useQueryClient();

  // ── Movimentações ──────────────────────────────────────────────
  const { data: movements, isLoading: movLoading } = useQuery({
    queryKey: ['stock-movements', page],
    queryFn: () => api.get(`/stock/movements?page=${page}&limit=30`),
    enabled: tab === 'movements',
  });

  // ── Resumo de movimentações (últimos 30 dias) ───────────────────
  const { data: movSummary } = useQuery({
    queryKey: ['stock-movements-summary'],
    queryFn: () => api.get('/stock/movements-summary'),
    enabled: tab === 'position',
  });

  // ── Posição de estoque ─────────────────────────────────────────
  const { data: stockReport, isLoading: repLoading } = useQuery({
    queryKey: ['stock-report'],
    queryFn: () => api.get('/reports/stock-position'),
    enabled: tab === 'position' || tab === 'replenishment',
  });

  // ── Pedidos de reposição pendentes ─────────────────────────────
  const { data: pendingOrdersData } = useQuery({
    queryKey: ['replenishment-orders-pending'],
    queryFn: () => api.get('/stock/replenishment-orders?status=pending'),
  });

  const pendingOrdersBySupplier = useMemo(() => {
    const map = {};
    (pendingOrdersData?.data || []).forEach(o => {
      if (o.supplier_id) map[o.supplier_id] = o;
    });
    return map;
  }, [pendingOrdersData]);

  const allProducts     = stockReport?.data || [];
  const displayProducts = showZeroOnly
    ? allProducts.filter(p => (p.current_stock ?? 0) <= 0)
    : allProducts;

  const negativeProducts = useMemo(
    () => allProducts.filter(p => (p.current_stock ?? 0) < 0),
    [allProducts]
  );

  const replenishmentCost = useMemo(
    () => negativeProducts.reduce((sum, p) => sum + Math.abs(p.current_stock ?? 0) * (Number(p.cost_price) || 0), 0),
    [negativeProducts]
  );

  const supplierGroups = useMemo(() => {
    const map = {};
    negativeProducts.forEach(p => {
      const sid   = p.supplier_id || '__none__';
      const sinfo = p.FORNECEDORES;
      if (!map[sid]) {
        map[sid] = {
          id:       sid === '__none__' ? null : sid,
          name:     sinfo?.name || 'Sem Fornecedor',
          phone:    sinfo?.phone || null,
          products: [],
        };
      }
      map[sid].products.push(p);
    });
    return Object.values(map).sort((a, b) => {
      if (!a.id) return 1;
      if (!b.id) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [negativeProducts]);

  function generateProtocol() {
    return String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  }

  function openCompleteModal(order) {
    setConfirmCompleteOrder(order);
    setProtocolInput('');
  }

  function buildOrderProducts(group) {
    return group.products.map(p => ({
      id: p.id, name: p.name, code: p.code || '',
      current_stock_at_request: p.current_stock,
      qty_to_replenish: Math.abs(p.current_stock),
      cost_price: p.cost_price || 0,
    }));
  }

  function handleSendWhatsApp(group) {
    if (!group.phone) { toast.error('Fornecedor não tem telefone cadastrado'); return; }
    const existingOrder = pendingOrdersBySupplier[group.id];
    if (existingOrder) { setConfirmResend(group); return; }
    doSendWhatsApp(group);
  }

  async function doSendWhatsApp(group) {
    setConfirmResend(null);
    setSoliciting(true);
    try {
      const existingOrder = pendingOrdersBySupplier[group.id];
      const protocol      = existingOrder?.protocol_number || generateProtocol();

      const num  = group.phone.replace(/\D/g, '');
      const full = num.startsWith('55') ? num : `55${num}`;

      const linhas = group.products.map(p => {
        const qty = Math.abs(p.current_stock);
        return [`📦 ${p.name}`, `   • UNIDADES: ${qty}`].join('\n');
      }).join('\n\n');

      const totalGeral = group.products.reduce(
        (s, p) => s + Math.abs(p.current_stock) * (Number(p.cost_price) || 0), 0
      );

      const msg = [
        `Olá ${group.name}! 👋`, ``,
        `Segue nossa Solicitação de Compra — ${format(new Date(), 'dd/MM/yyyy')} | CONTROLE: ${protocol}`, ``,
        linhas, ``,
        `💰 Total Geral: ${fmt(totalGeral)}`, ``,
        `Atenciosamente,`, tenant?.name || '', tenant?.phone || '',
      ].join('\n');

      window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank');

      if (!existingOrder && group.id) {
        const resp = await api.post('/stock/replenishment-orders', {
          supplier_id: group.id, supplier_name: group.name,
          protocol_number: protocol, products: buildOrderProducts(group),
        }).catch(e => { if (e?.response?.status === 409) return null; throw e; });
        if (resp === null) qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
      } else if (existingOrder?.id) {
        await api.post(`/stock/replenishment-orders/${existingOrder.id}/log-resend`)
          .catch(e => console.warn('log-resend:', e.message));
      }

      qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      setReplenishModal(false);
      setTab('movements');
      setPage(1);
      toast.success(`✅ Solicitação enviada! Controle: ${protocol} — veja em Movimentações.`);
    } catch (err) {
      toast.error(`❌ ${err?.response?.data?.error || err?.message || 'Erro ao criar pedido'}`);
    } finally {
      setSoliciting(false);
    }
  }

  async function handleCompleteOrder(order) {
    setCompleting(true);
    try {
      await api.post(`/stock/replenishment-orders/${order.id}/complete`);
      qc.invalidateQueries(['replenishment-orders-pending']);
      qc.invalidateQueries(['stock-report']);
      qc.invalidateQueries(['stock-movements']);
      qc.invalidateQueries(['stock-movements-summary']);
      setConfirmCompleteOrder(null);
      toast.success(`✅ Estoque de ${order.products.length} produto(s) atualizado!`);
    } catch (err) {
      toast.error(err.error || err.message || 'Erro ao atualizar estoque');
    } finally {
      setCompleting(false);
    }
  }

  // ── Colunas: Lista Completa ─────────────────────────────────────
  const posColumns = [
    { key: 'code', label: 'Código', width: 80, sortable: true,
      sortAccessor: r => /^\d+$/.test(String(r.code || '')) ? Number(r.code) : r.code,
      render: v => <span className="font-mono text-xs text-gray-600">{id4(v)}</span> },
    { key: 'name', label: 'Produto', sortable: true },
    { key: 'CATEGORIAS', label: 'Categoria', sortable: true, sortAccessor: r => r.CATEGORIAS?.name || '', render: v => v?.name || '—' },
    {
      key: 'current_stock', label: 'Estoque Atual', width: 120, sortable: true,
      sortAccessor: r => Number(r.current_stock ?? 0),
      render: (v, row) => (
        <span className={v < 0 ? 'text-red-700 font-bold' : v <= row.min_stock ? 'text-orange-600 font-bold' : 'text-green-700 font-semibold'}>
          {Number(v).toLocaleString('pt-BR')} {row.unit}
        </span>
      ),
    },
    {
      key: 'min_stock', label: 'Mín.', width: 80, sortable: true,
      sortAccessor: r => Number(r.min_stock ?? 0),
      render: (v, row) => `${Number(v).toLocaleString('pt-BR')} ${row.unit}`,
    },
    { key: 'cost_price', label: 'Custo/Un.', width: 110, sortable: true, sortAccessor: r => Number(r.cost_price ?? 0), render: v => fmt(v) },
    {
      key: 'FORNECEDORES', label: 'Fornecedor', width: 140,
      render: v => v?.name
        ? <span className="text-xs text-gray-600">{v.name}</span>
        : <span className="text-gray-300 text-xs">—</span>,
    },
    {
      key: 'id', label: '', width: 110,
      render: (_, row) => (
        <button onClick={() => openSupplierWhatsApp(row)}
          className="flex items-center gap-1 text-xs font-medium text-green-600 hover:text-green-700 bg-green-50 hover:bg-green-100 px-2 py-1 rounded-lg transition-colors"
          title={row.FORNECEDORES?.phone ? `Enviar WhatsApp para ${row.FORNECEDORES.name}` : 'Fornecedor sem telefone'}>
          <MessageCircle size={12} /> Solicitar
        </button>
      ),
    },
  ];

  const replenishColumns = [
    { key: 'code', label: 'Código', width: 80, render: v => <span className="font-mono text-xs">{id4(v)}</span> },
    { key: 'name', label: 'Produto' },
    {
      key: 'current_stock', label: 'Estoque Atual', width: 120,
      render: v => <span className="text-red-700 font-bold">{Number(v).toLocaleString('pt-BR')}</span>,
    },
    {
      key: 'current_stock', label: 'Qtd a Repor', width: 110,
      render: v => <span className="font-semibold text-gray-800">{Math.abs(Number(v)).toLocaleString('pt-BR')}</span>,
    },
    { key: 'cost_price', label: 'Custo Unit.', width: 110, render: v => fmt(v) },
    {
      key: 'cost_price', label: 'Total Custo', width: 110,
      render: (v, row) => <span className="text-gray-700">{fmt(Math.abs(row.current_stock) * (v || 0))}</span>,
    },
  ];

  const TABS = [
    { key: 'position',      label: 'Lista Completa'  },
    { key: 'replenishment', label: '📦 Reposição'    },
    { key: 'suggestion',    label: '🛒 Sugestão de Compra' },
    { key: 'inventory',     label: '📋 Inventário'   },
    { key: 'movements',     label: 'Movimentações'   },
  ];

  const summary = stockReport?.summary || {};

  return (
    <div className="space-y-4">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header">
        <h1 className="page-title">Estoque</h1>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      {tab === 'position' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">

          {/* Produtos ativos */}
          <div className="card p-4 text-center">
            <div className="flex justify-center mb-1">
              <Package size={18} className="text-primary-400" />
            </div>
            <p className="text-2xl font-bold text-gray-900">{summary.total_products ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Produtos ativos</p>
          </div>

          {/* Entradas / 30d */}
          <div className="card p-4 text-center border-l-4 border-green-400">
            <div className="flex justify-center mb-1">
              <TrendingUp size={18} className="text-green-500" />
            </div>
            <p className="text-2xl font-bold text-green-600">{movSummary?.entries ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Entradas / 30d</p>
          </div>

          {/* Saídas / 30d */}
          <div className="card p-4 text-center border-l-4 border-sky-400">
            <div className="flex justify-center mb-1">
              <TrendingDown size={18} className="text-sky-500" />
            </div>
            <p className="text-2xl font-bold text-sky-600">{movSummary?.exits ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Saídas / 30d</p>
          </div>

          {/* Perdas / 30d */}
          <div className="card p-4 text-center border-l-4 border-orange-400">
            <div className="flex justify-center mb-1">
              <AlertTriangle size={18} className="text-orange-400" />
            </div>
            <p className="text-2xl font-bold text-orange-500">{movSummary?.losses ?? '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Perdas / 30d</p>
          </div>

          {/* Valor total do estoque */}
          <div className="card p-4 text-center">
            <div className="flex justify-center mb-1">
              <PackageCheck size={18} className="text-gray-400" />
            </div>
            <p className="text-base font-bold text-gray-800 leading-tight">{fmt(summary.total_cost_value)}</p>
            <p className="text-xs text-gray-500 mt-0.5">Custo total estoque</p>
          </div>

          {/* Custo de reposição (negativo) */}
          <div className="card p-4 text-center border-l-4 border-red-400">
            <div className="flex justify-center mb-1">
              <PackageCheck size={18} className="text-red-400" />
            </div>
            <p className="text-base font-bold text-red-600 leading-tight">
              {replenishmentCost > 0 ? `-${fmt(replenishmentCost)}` : fmt(0)}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">Custo reposição</p>
          </div>

        </div>
      )}

      {/* ── Card principal ───────────────────────────────────────── */}
      <div className="card">
        <div className="card-header flex items-center gap-4 flex-wrap">
          {/* Tabs */}
          <div className="flex gap-4 flex-1">
            {TABS.map(t => (
              <button key={t.key}
                onClick={() => { setTab(t.key); setPage(1); }}
                className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.key
                    ? 'border-primary-600 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-900'
                }`}>
                {t.label}
                {t.key === 'replenishment' && negativeProducts.length > 0 && (
                  <span className="ml-1.5 bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5">
                    {negativeProducts.length}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Filtro zerados (só na aba Lista Completa) */}
          {tab === 'position' && (
            <button onClick={() => setShowZeroOnly(v => !v)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                showZeroOnly
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-red-600 border-red-200 hover:bg-red-50'
              }`}>
              <AlertTriangle size={13} />
              {showZeroOnly ? `Zerados/Negativos (${displayProducts.length})` : 'Ver zerados/negativos'}
            </button>
          )}

          {/* Botão Registrar Perda (Lista Completa e Movimentações) */}
          {(tab === 'position' || tab === 'movements') && (
            <button onClick={() => setPerdaOpen(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors">
              <AlertTriangle size={13} /> Registrar Perda
            </button>
          )}
        </div>

        {/* ── Aba: Lista Completa ───────────────────────────────── */}
        {tab === 'position' && (
          <>
            {showZeroOnly && displayProducts.length === 0 && (
              <p className="text-center py-8 text-green-600 font-medium text-sm">
                ✅ Nenhum produto zerado ou negativo!
              </p>
            )}
            <Table columns={posColumns} data={displayProducts} loading={repLoading} />
          </>
        )}

        {/* ── Aba: Sugestão de Compra ───────────────────────────── */}
        {tab === 'suggestion' && <PurchaseSuggestion />}

        {/* ── Aba: Inventário ───────────────────────────────────── */}
        {tab === 'inventory' && <InventoryCount />}

        {/* ── Aba: Reposição ────────────────────────────────────── */}
        {tab === 'replenishment' && (
          <div className="space-y-4 p-4">
            {negativeProducts.length === 0 ? (
              <div className="text-center py-12 space-y-2">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <span className="text-3xl">✅</span>
                </div>
                <p className="font-semibold text-green-700 text-lg">Estoque saudável!</p>
                <p className="text-gray-500 text-sm">Nenhum produto com estoque negativo no momento.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between p-4 bg-red-50 border border-red-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <PackageX size={20} className="text-red-600" />
                    </div>
                    <div>
                      <p className="font-bold text-red-800">
                        {negativeProducts.length} produto{negativeProducts.length > 1 ? 's' : ''} com estoque negativo
                      </p>
                      <p className="text-sm text-red-600">
                        {supplierGroups.filter(g => g.id).length} fornecedor{supplierGroups.filter(g=>g.id).length !== 1 ? 'es' : ''} · clique abaixo para gerar os pedidos
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setReplenishModal(true)}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm">
                    <FileText size={16} />
                    Solicitar Reposição Geral
                  </button>
                </div>

                {supplierGroups.map(group => {
                  const pendingOrder = group.id ? pendingOrdersBySupplier[group.id] : null;
                  return (
                    <div key={group.id || '__none__'}
                      className={`rounded-xl overflow-hidden border ${pendingOrder ? 'border-amber-300' : 'border-gray-200'}`}>
                      {pendingOrder && (
                        <div className="bg-amber-400 text-white text-xs font-black py-2 px-4 flex items-center justify-center gap-3 tracking-wide uppercase">
                          <CheckCircle2 size={13} />
                          <span>ESTOQUE JÁ SOLICITADO — AGUARDANDO RECEBIMENTO</span>
                          {pendingOrder.protocol_number && (
                            <span className="bg-white text-amber-600 px-2 py-0.5 rounded font-black text-xs">
                              CONTROLE: {pendingOrder.protocol_number}
                            </span>
                          )}
                        </div>
                      )}
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        !group.id ? 'bg-gray-50 border-b border-gray-100'
                        : pendingOrder ? 'bg-amber-50 border-b border-amber-200'
                        : 'bg-amber-50 border-b border-amber-100'
                      }`}>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{group.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {group.products.length} produto{group.products.length > 1 ? 's' : ''} a repor
                            {group.phone
                              ? <span className="text-green-600 ml-2">📱 {group.phone}</span>
                              : !group.id ? null
                              : <span className="text-orange-500 ml-2">⚠️ sem telefone</span>}
                          </p>
                        </div>
                        {group.id && (
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {pendingOrder ? (
                              <>
                                <button onClick={() => openCompleteModal(pendingOrder)}
                                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                                  <CheckCircle2 size={13} /> Atualizar Estoque
                                </button>
                                {group.phone && (
                                  <button onClick={() => handleSendWhatsApp(group)} disabled={soliciting}
                                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                    {soliciting ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                                    Solicitar
                                  </button>
                                )}
                              </>
                            ) : (
                              group.phone && (
                                <button onClick={() => handleSendWhatsApp(group)} disabled={soliciting}
                                  className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                  {soliciting ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                                  Solicitar
                                </button>
                              )
                            )}
                          </div>
                        )}
                      </div>
                      <Table columns={replenishColumns} data={group.products} loading={repLoading} />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Aba: Movimentações ─────────────────────────────────── */}
        {tab === 'movements' && (
          <>
            {/* Cabeçalho informativo */}
            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
              <p className="text-xs text-gray-400 flex-1">
                {movLoading ? 'Carregando...' : `${movements?.total ?? 0} movimentação${movements?.total !== 1 ? 'ões' : ''} · clique em qualquer linha para ver detalhes`}
              </p>
            </div>

            {/* Lista de cards */}
            {movLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : (movements?.data || []).length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">Nenhuma movimentação encontrada</div>
            ) : (
              <div>
                {/* Cabeçalho das colunas */}
                <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[10px] uppercase tracking-wide font-semibold text-gray-400">
                  <span className="w-[90px] shrink-0">Data/Hora</span>
                  <span className="flex-1">Produto / Código</span>
                  <span className="w-[120px] shrink-0 text-center">Tipo</span>
                  <span className="w-10 text-right shrink-0">Qtd</span>
                  <span className="w-[68px] shrink-0 text-center">Controle</span>
                  <span className="w-[80px] shrink-0 text-right">Detalhes</span>
                </div>
                {(movements.data || []).map(m => (
                  <MovementCard key={m.id} m={m} />
                ))}
              </div>
            )}

            <Pagination page={page} total={movements?.total || 0} limit={30} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* ── Modal: Solicitar Reposição Geral ─────────────────────── */}
      <Modal isOpen={replenishModal} onClose={() => setReplenishModal(false)}
        title="Solicitar Reposição — Selecione o Fornecedor" size="md">
        <div className="space-y-3">
          {supplierGroups.filter(g => g.id).length === 0 && (
            <p className="text-center text-gray-500 py-6 text-sm">Nenhum produto negativo com fornecedor cadastrado.</p>
          )}
          {supplierGroups.filter(g => g.id).map(group => {
            const pendingOrder = pendingOrdersBySupplier[group.id];
            return (
              <div key={group.id}
                className={`flex items-center justify-between border rounded-xl p-4 transition-colors ${
                  pendingOrder ? 'border-amber-200 bg-amber-50' : 'border-gray-200 hover:bg-amber-50 hover:border-amber-200'
                }`}>
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {group.name}
                    {pendingOrder && <span className="text-xs bg-amber-400 text-white px-2 py-0.5 rounded-full">🕐 Pendente</span>}
                  </p>
                  <p className="text-sm text-gray-500">{group.products.length} produto{group.products.length > 1 ? 's' : ''} a repor</p>
                  {group.phone
                    ? <p className="text-xs text-green-600 mt-0.5">📱 {group.phone} — vai receber no WhatsApp</p>
                    : <p className="text-xs text-orange-500 mt-0.5">⚠️ Sem telefone — cadastre para solicitar</p>}
                </div>
                <div className="flex flex-col gap-2 ml-4 flex-shrink-0">
                  {pendingOrder ? (
                    <>
                      <button onClick={() => { setReplenishModal(false); openCompleteModal(pendingOrder); }}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                        <CheckCircle2 size={13} /> Atualizar Estoque
                      </button>
                      {group.phone && (
                        <button onClick={() => handleSendWhatsApp(group)}
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                          <MessageCircle size={13} /> Solicitar
                        </button>
                      )}
                    </>
                  ) : (
                    group.phone ? (
                      <button onClick={() => handleSendWhatsApp(group)} disabled={soliciting}
                        className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap">
                        {soliciting
                          ? <><Loader2 size={13} className="animate-spin" /> Enviando...</>
                          : <><MessageCircle size={13} /> Solicitar</>}
                      </button>
                    ) : <span className="text-xs text-orange-500">⚠️ Sem telefone</span>
                  )}
                </div>
              </div>
            );
          })}
          {supplierGroups.filter(g => !g.id).map(group => (
            <div key="__none__" className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500">
              <p className="font-medium text-gray-700">⚠️ {group.products.length} produto{group.products.length > 1 ? 's' : ''} sem fornecedor cadastrado</p>
              <p className="text-xs mt-1">Vincule um fornecedor a esses produtos para incluí-los no pedido.</p>
            </div>
          ))}
        </div>
      </Modal>

      {/* ── Modal: Confirmar Recebimento ─────────────────────────── */}
      <Modal isOpen={!!confirmCompleteOrder} onClose={() => !completing && setConfirmCompleteOrder(null)}
        title="Atualizar Estoque — Confirmar Recebimento" size="md">
        {confirmCompleteOrder && (
          <div className="space-y-4">
            <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-4 flex items-center gap-4">
              <div className="bg-amber-400 text-white rounded-lg px-4 py-2 text-center flex-shrink-0">
                <p className="text-xs font-bold uppercase tracking-wider opacity-80">Controle</p>
                <p className="text-2xl font-black tracking-widest">{confirmCompleteOrder.protocol_number || '—'}</p>
              </div>
              <div>
                <p className="font-semibold text-gray-800 text-sm">{confirmCompleteOrder.supplier_name}</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {confirmCompleteOrder.products.length} produto(s) ·{' '}
                  {confirmCompleteOrder.products.reduce((s, p) => s + (p.qty_to_replenish || 0), 0)} unidades totais
                </p>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {confirmCompleteOrder.products.map((p, i) => (
                <div key={p.id || i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    {p.code && <p className="text-xs text-gray-400">{p.code}</p>}
                  </div>
                  <span className="text-green-600 font-bold text-sm bg-green-100 px-2.5 py-0.5 rounded-full">+{p.qty_to_replenish}</span>
                </div>
              ))}
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                🔐 Digite o número de controle para liberar a atualização:
              </label>
              <input type="text" className="input text-center text-lg font-bold tracking-widest uppercase"
                placeholder="00000" maxLength={5} value={protocolInput}
                onChange={e => setProtocolInput(e.target.value.replace(/\D/g, ''))} autoFocus />
              {protocolInput.length === 5 && protocolInput !== confirmCompleteOrder.protocol_number && (
                <p className="text-xs text-red-500 font-medium">⚠️ Número de controle incorreto.</p>
              )}
              {protocolInput === confirmCompleteOrder.protocol_number && (
                <p className="text-xs text-green-600 font-medium">✅ Número de controle correto!</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button type="button" onClick={() => setConfirmCompleteOrder(null)} disabled={completing}
                className="btn-secondary disabled:opacity-50">Cancelar</button>
              <button onClick={() => handleCompleteOrder(confirmCompleteOrder)}
                disabled={completing || protocolInput !== confirmCompleteOrder.protocol_number}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {completing
                  ? <><Loader2 size={14} className="animate-spin" /> Atualizando...</>
                  : <><CheckCircle2 size={14} /> Atualizar Estoque</>}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Registrar Perda ────────────────────────────────── */}
      <Modal isOpen={perdaOpen} onClose={() => setPerdaOpen(false)} title="⚠️ Registrar Perda de Estoque" size="md">
        <PerdaForm
          onSaved={() => {
            setPerdaOpen(false);
            qc.invalidateQueries(['stock-movements']);
            qc.invalidateQueries(['stock-report']);
            qc.invalidateQueries(['stock-movements-summary']);
          }}
          onCancel={() => setPerdaOpen(false)}
        />
      </Modal>

      {/* ── Confirmação: Reenvio de solicitação já pendente ──────── */}
      {confirmResend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">Reposição já solicitada</h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Já foi solicitada reposição para{' '}
                <span className="font-semibold text-gray-800">{confirmResend.name}</span>.<br />
                Tem certeza que deseja solicitar novamente?
              </p>
              {(() => {
                const o = pendingOrdersBySupplier[confirmResend.id];
                return o ? (
                  <p className="mt-2 text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2 font-medium">
                    Controle em aberto: {o.protocol_number}
                  </p>
                ) : null;
              })()}
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmResend(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                Não
              </button>
              <button onClick={() => doSendWhatsApp(confirmResend)}
                className="flex-1 py-2.5 text-sm font-semibold text-white bg-green-500 hover:bg-green-600 rounded-xl transition-colors">
                Continuar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
