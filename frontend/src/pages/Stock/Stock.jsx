import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, ArrowUpDown, MessageCircle,
  FileText, Loader2, Download, PackageX, CheckCircle2,
} from 'lucide-react';
import api from '@/lib/api';
import { Table, Pagination } from '@/components/UI/Table';
import Modal from '@/components/UI/Modal';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

function fmt(v) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────
const PERDA_MOTIVOS = ['Quebra', 'Vencimento', 'Defeito de fabricação', 'Erro de produção', 'Extravio', 'Outro'];

// ─────────────────────────────────────────────────────────────────────────────
// Formulário de Ajuste
// ─────────────────────────────────────────────────────────────────────────────
function AdjustmentForm({ onSaved, onCancel }) {
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [search, setSearch]       = useState('');
  const [mode, setMode]           = useState('entry');
  const [quantity, setQuantity]   = useState('');
  const [lossMotivo, setLossMotivo] = useState('');
  const [notes, setNotes]         = useState('');
  const [loading, setLoading]     = useState(false);

  const { data: products } = useQuery({
    queryKey: ['products-adj', search],
    queryFn: () => api.get(`/products?search=${search}&limit=10&is_active=true`),
    enabled: search.length >= 2,
  });

  function selectProduct(p) { setSelectedProduct(p); setSearch(''); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!selectedProduct)          { toast.error('Selecione um produto'); return; }
    const qty = parseFloat(quantity);
    if (!qty || qty <= 0)          { toast.error('Informe uma quantidade maior que zero'); return; }
    if (mode === 'loss' && !lossMotivo) { toast.error('Informe o motivo da perda'); return; }

    setLoading(true);
    try {
      const finalQty   = mode === 'entry' ? qty : -qty;
      const finalNotes = mode === 'loss'
        ? `PERDA DE PRODUÇÃO — Motivo: ${lossMotivo}${notes ? `. ${notes}` : ''}`
        : notes;
      await api.post('/stock/adjustment', { product_id: selectedProduct.id, quantity: finalQty, notes: finalNotes });
      toast.success(mode === 'loss' ? 'Perda registrada!' : 'Entrada registrada!');
      onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao ajustar estoque'); }
    finally { setLoading(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex gap-3">
        {[
          { v: 'entry', l: '📦 Entrada de estoque' },
          { v: 'loss',  l: '⚠️ Perda de produção' },
        ].map(({ v, l }) => (
          <label key={v} className="flex items-center gap-2 cursor-pointer">
            <input type="radio" checked={mode === v} onChange={() => setMode(v)} />
            <span className="text-sm font-medium">{l}</span>
          </label>
        ))}
      </div>

      <div>
        <label className="label">Produto</label>
        {selectedProduct ? (
          <div className="flex items-center justify-between bg-primary-50 border border-primary-200 rounded-lg px-3 py-2">
            <div>
              <p className="text-sm font-semibold text-primary-800">{selectedProduct.name}</p>
              <p className="text-xs text-primary-500">Estoque atual: {selectedProduct.current_stock}</p>
            </div>
            <button type="button" onClick={() => setSelectedProduct(null)}
              className="text-primary-400 hover:text-red-500 text-xs underline ml-2">trocar</button>
          </div>
        ) : (
          <div className="space-y-2">
            <input className="input" placeholder="Digite para buscar produto..." value={search}
              onChange={e => setSearch(e.target.value)} autoFocus />
            {products?.data?.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {products.data.map(p => (
                  <button key={p.id} type="button" onClick={() => selectProduct(p)}
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
        <label className="label">Quantidade {mode === 'loss' ? 'perdida *' : 'a adicionar *'}</label>
        <input type="number" step="1" min="1" className="input"
          value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Ex: 50" />
      </div>

      {mode === 'loss' && (
        <>
          <div>
            <label className="label">Motivo da perda *</label>
            <select className="input" value={lossMotivo} onChange={e => setLossMotivo(e.target.value)}>
              <option value="">Selecione o motivo...</option>
              {PERDA_MOTIVOS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Observação</label>
            <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Detalhes adicionais sobre a perda..." />
          </div>
        </>
      )}
      {mode === 'entry' && (
        <div>
          <label className="label">Observação</label>
          <input className="input" value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Nota fiscal, fornecedor..." />
        </div>
      )}

      <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading}
          className={mode === 'loss'
            ? 'bg-orange-500 hover:bg-orange-600 text-white rounded-lg px-4 py-2 text-sm font-medium flex items-center gap-1.5'
            : 'btn-primary'}>
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : mode === 'loss' ? '⚠️ Registrar Perda' : 'Confirmar Entrada'}
        </button>
      </div>
    </form>
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
export default function Stock() {
  const { tenant } = useAuth();
  const [tab, setTab]               = useState('position');
  const [page, setPage]             = useState(1);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [showZeroOnly, setShowZeroOnly] = useState(false);

  // Modal de reposição
  const [replenishModal, setReplenishModal]             = useState(false);
  const [soliciting, setSoliciting]                      = useState(false);
  const [confirmResend, setConfirmResend]                 = useState(null);   // group a reenviar
  const [confirmCompleteOrder, setConfirmCompleteOrder] = useState(null);
  const [completing, setCompleting]                     = useState(false);
  const [protocolInput, setProtocolInput]               = useState('');

  const qc = useQueryClient();

  // ── Movimentações ─────────────────────────────────────────────
  const { data: movements, isLoading: movLoading } = useQuery({
    queryKey: ['stock-movements', page],
    queryFn: () => api.get(`/stock/movements?page=${page}&limit=30`),
    enabled: tab === 'movements',
  });

  // ── Posição de estoque (compartilhada com aba Reposição) ───────
  const { data: stockReport, isLoading: repLoading } = useQuery({
    queryKey: ['stock-report'],
    queryFn: () => api.get('/reports/stock-position'),
    enabled: tab === 'position' || tab === 'replenishment',
  });

  // ── Pedidos de reposição pendentes ────────────────────────────
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

  const allProducts      = stockReport?.data || [];
  const displayProducts  = showZeroOnly
    ? allProducts.filter(p => (p.current_stock ?? 0) <= 0)
    : allProducts;

  // ── Grupos de fornecedores com produtos negativos ──────────────
  const negativeProducts = useMemo(
    () => allProducts.filter(p => (p.current_stock ?? 0) < 0),
    [allProducts]
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
      if (!a.id) return 1;  // "Sem fornecedor" sempre por último
      if (!b.id) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [negativeProducts]);

  // ── Gera número de controle aleatório de 5 dígitos ───────────
  function generateProtocol() {
    return String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  }

  // ── Abre modal de confirmação e reseta o input de protocolo ──
  function openCompleteModal(order) {
    setConfirmCompleteOrder(order);
    setProtocolInput('');
  }

  // ── Helper: monta payload de produtos para o pedido ──────────
  function buildOrderProducts(group) {
    return group.products.map(p => ({
      id:                       p.id,
      name:                     p.name,
      code:                     p.code || '',
      current_stock_at_request: p.current_stock,
      qty_to_replenish:         Math.abs(p.current_stock),
      cost_price:               p.cost_price || 0,
    }));
  }

  // ── Solicitar: verifica se já está pendente e pede confirmação ──
  function handleSendWhatsApp(group) {
    if (!group.phone) { toast.error('Fornecedor não tem telefone cadastrado'); return; }
    const existingOrder = pendingOrdersBySupplier[group.id];
    if (existingOrder) {
      // Já existe pedido pendente → mostra confirmação antes de reenviar
      setConfirmResend(group);
      return;
    }
    doSendWhatsApp(group);
  }

  // ── Executa o envio de fato (novo pedido ou reenvio confirmado) ─
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
        `Olá ${group.name}! 👋`,
        ``,
        `Segue nossa Solicitação de Compra — ${format(new Date(), 'dd/MM/yyyy')} | CONTROLE: ${protocol}`,
        ``,
        linhas,
        ``,
        `💰 Total Geral: ${fmt(totalGeral)}`,
        ``,
        `Atenciosamente,`,
        tenant?.name || '',
        tenant?.phone || '',
      ].join('\n');

      // 1. Abre WhatsApp ANTES de qualquer await (não bloqueado pelo browser)
      window.open(`https://wa.me/${full}?text=${encodeURIComponent(msg)}`, '_blank');

      // 2. Cria pedido OU loga reenvio
      if (!existingOrder && group.id) {
        const resp = await api.post('/stock/replenishment-orders', {
          supplier_id:     group.id,
          supplier_name:   group.name,
          protocol_number: protocol,
          products:        buildOrderProducts(group),
        }).catch(e => {
          if (e?.response?.status === 409) return null;
          throw e;
        });
        if (resp === null) qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
      } else if (existingOrder?.id) {
        await api.post(`/stock/replenishment-orders/${existingOrder.id}/log-resend`)
          .catch(e => console.warn('log-resend:', e.message));
      }

      // 3. Navega para Movimentações
      qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
      qc.invalidateQueries({ queryKey: ['stock-movements'] });
      setReplenishModal(false);
      setTab('movements');
      setPage(1);

      toast.success(`✅ Solicitação enviada! Controle: ${protocol} — veja em Movimentações.`);
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || 'Erro ao criar pedido no servidor';
      toast.error(`❌ ${msg}`);
      console.error('doSendWhatsApp:', err);
    } finally {
      setSoliciting(false);
    }
  }

  // ── Confirmar recebimento e atualizar estoque ─────────────────
  async function handleCompleteOrder(order) {
    setCompleting(true);
    try {
      await api.post(`/stock/replenishment-orders/${order.id}/complete`);
      qc.invalidateQueries(['replenishment-orders-pending']);
      qc.invalidateQueries(['stock-report']);
      qc.invalidateQueries(['stock-movements']);
      setConfirmCompleteOrder(null);
      toast.success(`✅ Estoque de ${order.products.length} produto(s) atualizado com sucesso!`);
    } catch (err) {
      toast.error(err.error || err.message || 'Erro ao atualizar estoque');
    } finally {
      setCompleting(false);
    }
  }

  // ── Colunas: Lista Completa ────────────────────────────────────
  const movColumns = [
    {
      key: 'created_at', label: 'Data/Hora', width: 140,
      render: v => { try { return format(parseISO(v), 'dd/MM/yy HH:mm', { locale: ptBR }); } catch { return v; } },
    },
    { key: 'PRODUTOS', label: 'Produto', render: v => v?.name || '—' },
    {
      key: 'type', label: 'Tipo', width: 145,
      render: (v, row) => {
        // Solicitações de reposição ficam salvas como 'adjustment' com reference_type = 'replenishment_request'
        if (row?.reference_type === 'replenishment_request') {
          return <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">🟡 Pend. Reposição</span>;
        }
        const cfg = {
          entry:   { cls: 'bg-green-100 text-green-700',   lbl: 'Entrada'   },
          exit:    { cls: 'bg-red-100 text-red-700',       lbl: 'Saída'     },
          adjustment: { cls: 'bg-blue-100 text-blue-700',  lbl: 'Ajuste'   },
          return:  { cls: 'bg-purple-100 text-purple-700', lbl: 'Devolução' },
        };
        const { cls, lbl } = cfg[v] || { cls: 'bg-gray-100 text-gray-600', lbl: v };
        return <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>{lbl}</span>;
      },
    },
    {
      key: 'quantity', label: 'Qtd', width: 80,
      render: (v, row) => (
        <span className={row.type === 'exit' ? 'text-red-600 font-semibold' : 'text-green-600 font-semibold'}>
          {row.type === 'exit' ? '-' : '+'}{Math.abs(v)}
        </span>
      ),
    },
    { key: 'previous_stock', label: 'Anterior', width: 80 },
    { key: 'current_stock',  label: 'Atual',    width: 80 },
    {
      key: 'reference_type', label: 'Referência', width: 130,
      render: v => {
        const labels = {
          replenishment_request:  'Solicitação de Reposição',
          replenishment_received: 'Reposição Recebida',
          replenishment:          'Reposição',
          manual:                 'Manual',
          sale:                   'Venda',
          purchase:               'Compra',
          return:                 'Devolução',
        };
        return labels[v] || v || '—';
      },
    },
    {
      key: 'notes', label: 'Obs.',
      render: v => {
        if (!v) return '—';
        // Se tiver URL de PDF no notes, renderiza link clicável
        const pdfMatch = v.match(/PDF:\s*(https?:\/\/\S+)/);
        if (pdfMatch) {
          const label = v.replace(/\s*\|\s*PDF:.*$/, '');
          return (
            <span className="text-xs">
              {label}{' '}
              <a href={pdfMatch[1]} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-0.5 text-amber-600 hover:text-amber-700 font-medium underline">
                <Download size={11} /> PDF
              </a>
            </span>
          );
        }
        return <span className="text-xs">{v}</span>;
      },
    },
    { key: 'USUARIOS', label: 'Usuário', width: 120, render: v => v?.name || '—' },
  ];

  const posColumns = [
    { key: 'code', label: 'Código', width: 80 },
    { key: 'name', label: 'Produto' },
    { key: 'CATEGORIAS', label: 'Categoria', render: v => v?.name || '—' },
    {
      key: 'current_stock', label: 'Estoque Atual', width: 120,
      render: (v, row) => (
        <span className={v < 0 ? 'text-red-700 font-bold' : v <= row.min_stock ? 'text-orange-600 font-bold' : 'text-green-700 font-semibold'}>
          {Number(v).toLocaleString('pt-BR')} {row.unit}
        </span>
      ),
    },
    {
      key: 'min_stock', label: 'Mín.', width: 80,
      render: (v, row) => `${Number(v).toLocaleString('pt-BR')} ${row.unit}`,
    },
    { key: 'cost_price', label: 'Custo/Un.', width: 110, render: v => fmt(v) },
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
    { key: 'code', label: 'Código', width: 80 },
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
      render: (v, row) => (
        <span className="text-gray-700">{fmt(Math.abs(row.current_stock) * (v || 0))}</span>
      ),
    },
  ];

  const TABS = [
    { key: 'position',     label: 'Lista Completa' },
    { key: 'replenishment',label: '📦 Reposição' },
    { key: 'movements',    label: 'Movimentações' },
  ];

  return (
    <div className="space-y-4">

      {/* ── Page header ─────────────────────────────────────────── */}
      <div className="page-header">
        <h1 className="page-title">Estoque</h1>
        <button onClick={() => setAdjustOpen(true)} className="btn-primary">
          <ArrowUpDown size={16} /> Ajuste de Estoque
        </button>
      </div>

      {/* ── KPIs ────────────────────────────────────────────────── */}
      {tab === 'position' && stockReport?.summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{stockReport.summary.total_products}</p>
            <p className="text-sm text-gray-500">Produtos ativos</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{stockReport.summary.below_min_stock}</p>
            <p className="text-sm text-gray-500">Abaixo do mínimo</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-lg font-bold text-gray-900">{fmt(stockReport.summary.total_cost_value)}</p>
            <p className="text-sm text-gray-500">Valor de custo</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-lg font-bold text-green-700">{fmt(stockReport.summary.total_sale_value)}</p>
            <p className="text-sm text-gray-500">Valor de venda</p>
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

        {/* ── Aba: Reposição ────────────────────────────────────── */}
        {tab === 'replenishment' && (
          <div className="space-y-4 p-4">

            {/* Banner de resumo */}
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
                {/* Cabeçalho da aba com CTA */}
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

                {/* Cards por fornecedor */}
                {supplierGroups.map(group => {
                  const pendingOrder = group.id ? pendingOrdersBySupplier[group.id] : null;
                  return (
                    <div key={group.id || '__none__'}
                      className={`rounded-xl overflow-hidden border ${pendingOrder ? 'border-amber-300' : 'border-gray-200'}`}>

                      {/* ── Banner ESTOQUE JÁ SOLICITADO ── */}
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

                      {/* ── Header do grupo ── */}
                      <div className={`flex items-center justify-between px-4 py-3 ${
                        !group.id      ? 'bg-gray-50 border-b border-gray-100'
                        : pendingOrder ? 'bg-amber-50 border-b border-amber-200'
                        :                'bg-amber-50 border-b border-amber-100'
                      }`}>
                        <div>
                          <p className="font-semibold text-gray-900 text-sm">{group.name}</p>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {group.products.length} produto{group.products.length > 1 ? 's' : ''} a repor
                            {group.phone
                              ? <span className="text-green-600 ml-2">📱 {group.phone}</span>
                              : !group.id ? null
                              : <span className="text-orange-500 ml-2">⚠️ sem telefone</span>
                            }
                          </p>
                        </div>

                        {group.id && (
                          <div className="flex items-center gap-2 flex-wrap justify-end">
                            {/* PENDENTE: Atualizar Estoque (esquerda) + Solicitar (direita) */}
                            {pendingOrder ? (
                              <>
                                <button
                                  onClick={() => openCompleteModal(pendingOrder)}
                                  className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors shadow-sm">
                                  <CheckCircle2 size={13} />
                                  Atualizar Estoque
                                </button>
                                {group.phone && (
                                  <button
                                    onClick={() => handleSendWhatsApp(group)}
                                    disabled={soliciting}
                                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                    {soliciting ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                                    Solicitar
                                  </button>
                                )}
                              </>
                            ) : (
                              /* NORMAL: apenas Solicitar */
                              <>
                                {group.phone && (
                                  <button
                                    onClick={() => handleSendWhatsApp(group)}
                                    disabled={soliciting}
                                    className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                                    {soliciting ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                                    Solicitar
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Tabela de produtos */}
                      <Table columns={replenishColumns} data={group.products} loading={repLoading} />
                    </div>
                  );
                })}
              </>
            )}
          </div>
        )}

        {/* ── Aba: Movimentações ────────────────────────────────── */}
        {tab === 'movements' && (
          <>
            <Table columns={movColumns} data={movements?.data} loading={movLoading} />
            <Pagination page={page} total={movements?.total || 0} limit={30} onPageChange={setPage} />
          </>
        )}
      </div>

      {/* ── Modal: Solicitar Reposição Geral ─────────────────────── */}
      <Modal
        isOpen={replenishModal}
        onClose={() => setReplenishModal(false)}
        title="Solicitar Reposição — Selecione o Fornecedor"
        size="md">
        <div className="space-y-3">
          {supplierGroups.filter(g => g.id).length === 0 && (
            <p className="text-center text-gray-500 py-6 text-sm">
              Nenhum produto negativo com fornecedor cadastrado.
            </p>
          )}
          {supplierGroups.filter(g => g.id).map(group => {
            const pendingOrder = pendingOrdersBySupplier[group.id];
            return (
              <div key={group.id}
                className={`flex items-center justify-between border rounded-xl p-4 transition-colors ${
                  pendingOrder
                    ? 'border-amber-200 bg-amber-50'
                    : 'border-gray-200 hover:bg-amber-50 hover:border-amber-200'
                }`}>
                <div>
                  <p className="font-semibold text-gray-900 flex items-center gap-2">
                    {group.name}
                    {pendingOrder && (
                      <span className="text-xs bg-amber-400 text-white px-2 py-0.5 rounded-full">🕐 Pendente</span>
                    )}
                  </p>
                  <p className="text-sm text-gray-500">
                    {group.products.length} produto{group.products.length > 1 ? 's' : ''} a repor
                  </p>
                  {group.phone
                    ? <p className="text-xs text-green-600 mt-0.5">📱 {group.phone} — vai receber no WhatsApp</p>
                    : <p className="text-xs text-orange-500 mt-0.5">⚠️ Sem telefone — cadastre para solicitar</p>
                  }
                </div>
                <div className="flex flex-col gap-2 ml-4 flex-shrink-0">
                  {pendingOrder ? (
                    <>
                      <button
                        onClick={() => { setReplenishModal(false); openCompleteModal(pendingOrder); }}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                        <CheckCircle2 size={13} /> Atualizar Estoque
                      </button>
                      {group.phone && (
                        <button
                          onClick={() => handleSendWhatsApp(group)}
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap">
                          <MessageCircle size={13} /> Solicitar
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      {group.phone ? (
                        <button
                          onClick={() => handleSendWhatsApp(group)}
                          disabled={soliciting}
                          className="flex items-center gap-1.5 bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 whitespace-nowrap">
                          {soliciting
                            ? <><Loader2 size={13} className="animate-spin" /> Enviando...</>
                            : <><MessageCircle size={13} /> Solicitar</>
                          }
                        </button>
                      ) : (
                        <span className="text-xs text-orange-500">⚠️ Sem telefone</span>
                      )}
                    </>
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
      <Modal
        isOpen={!!confirmCompleteOrder}
        onClose={() => !completing && setConfirmCompleteOrder(null)}
        title="Atualizar Estoque — Confirmar Recebimento"
        size="md">
        {confirmCompleteOrder && (
          <div className="space-y-4">
            {/* Protocolo em destaque */}
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

            {/* Lista de produtos */}
            <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1">
              {confirmCompleteOrder.products.map((p, i) => (
                <div key={p.id || i}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-gray-800">{p.name}</p>
                    {p.code && <p className="text-xs text-gray-400">{p.code}</p>}
                  </div>
                  <span className="text-green-600 font-bold text-sm bg-green-100 px-2.5 py-0.5 rounded-full">
                    +{p.qty_to_replenish}
                  </span>
                </div>
              ))}
            </div>

            {/* Input de confirmação do protocolo */}
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <label className="text-sm font-semibold text-gray-700">
                🔐 Digite o número de controle para liberar a atualização:
              </label>
              <input
                type="text"
                className="input text-center text-lg font-bold tracking-widest uppercase"
                placeholder="00000"
                maxLength={5}
                value={protocolInput}
                onChange={e => setProtocolInput(e.target.value.replace(/\D/g, ''))}
                autoFocus
              />
              {protocolInput.length === 5 && protocolInput !== confirmCompleteOrder.protocol_number && (
                <p className="text-xs text-red-500 font-medium">⚠️ Número de controle incorreto.</p>
              )}
              {protocolInput === confirmCompleteOrder.protocol_number && (
                <p className="text-xs text-green-600 font-medium">✅ Número de controle correto!</p>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setConfirmCompleteOrder(null)}
                disabled={completing}
                className="btn-secondary disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={() => handleCompleteOrder(confirmCompleteOrder)}
                disabled={completing || protocolInput !== confirmCompleteOrder.protocol_number}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {completing
                  ? <><Loader2 size={14} className="animate-spin" /> Atualizando...</>
                  : <><CheckCircle2 size={14} /> Atualizar Estoque</>
                }
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── Modal: Ajuste de Estoque ──────────────────────────────── */}
      <Modal isOpen={adjustOpen} onClose={() => setAdjustOpen(false)} title="Ajuste de Estoque" size="md">
        <AdjustmentForm
          onSaved={() => {
            setAdjustOpen(false);
            qc.invalidateQueries(['stock-movements']);
            qc.invalidateQueries(['stock-report']);
          }}
          onCancel={() => setAdjustOpen(false)}
        />
      </Modal>

      {/* ── Confirmação: Reenvio de solicitação já pendente ──────── */}
      {confirmResend && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="text-center mb-5">
              <div className="text-4xl mb-3">⚠️</div>
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Reposição já solicitada
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                Já foi solicitada reposição de estoque para{' '}
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
              <button
                onClick={() => setConfirmResend(null)}
                className="flex-1 py-2.5 text-sm font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-xl transition-colors">
                Não
              </button>
              <button
                onClick={() => doSendWhatsApp(confirmResend)}
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
