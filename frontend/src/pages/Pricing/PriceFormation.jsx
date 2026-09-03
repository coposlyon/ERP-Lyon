// ============================================================
// FORMAÇÃO DE PREÇO — TRÊS PERGUNTAS, NESTA ORDEM.
//
//   1. O que você vai vender, e quantas peças?
//   2. Quanto custa cada peça?
//   3. Quanto você quer ganhar?
//
// A tela anterior tinha sete cartões abertos ao mesmo tempo e trinta
// campos com a mesma cara. O problema não era a conta — a conta está
// certa e continua exatamente a mesma (lib/pricingCalc.js, espelhada
// no backend). O problema era não dar para saber:
//
//   · por onde começar;
//   · o que ainda faltava preencher;
//   · o que cada campo fazia com o preço.
//
// E havia uma armadilha específica: os exemplos ("1,59", "1000")
// moravam dentro dos campos como placeholder, e o resultado aparecia
// como "R$ 0,0000". Cinza dentro do campo parece preenchido; zero
// parece calculado. Dava para olhar a tela inteira preenchida e o
// preço estar sendo formado sobre NADA — foi exatamente o que
// aconteceu. Agora todo exemplo vem escrito "ex.:" e todo valor não
// informado aparece como "—".
//
// A OUTRA METADE DA CONFUSÃO: metade dos campos não mudava o preço.
// Capacidade, cor, tipo de impressão, descrição e referência de
// cálculo são a etiqueta da ficha — nenhum deles entra em `computeSheet`.
// Estar do lado dos que mudam fazia parecer que tudo importava.
// Foram para "Detalhes da ficha", fechado.
// ============================================================
import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, Save, Loader2, Plus, Trash2, Download, FolderOpen,
  Printer, AlertCircle, CheckCircle2, TrendingUp, Package,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  computeSheet, simulate, emptySheet,
  fmtBRL, fmtBRL4, fmtQty, numInput, TAX_REGIMES, PRINT_TYPES, CALC_REFERENCES,
} from '@/lib/pricingCalc';
import { buildSheetReportHtml, openPrintWindow } from '@/utils/pricingReportHtml';
import { expandVariants } from '@/pages/Products/ProductVariantsModal';
import { iconFor } from './fixedCostIcons';
import { Passo, LinhaCusto, Moeda, Quantidade, Texto, Percentual, Recolhivel } from './pecas';

// Métodos de impressão da Tabela de Precificação — espelha PRINT_METHODS
// do backend (lib/calc.js). Manter as duas listas em sincronia.
const PRINT_METHODS = [
  { key: 'serigrafia_1',     label: 'Serigrafia 1 Cor' },
  { key: 'serigrafia_2',     label: 'Serigrafia 2 Cores' },
  { key: 'transfer',         label: 'Transfer' },
  { key: 'dtf',              label: 'DTF' },
  { key: 'laser',            label: 'Laser' },
  { key: 'borda_metalizada', label: 'Borda Metalizada' },
  { key: 'pintura',          label: 'Pintura' },
  { key: 'degrade',          label: 'Degradê' },
];

const preenchido = v => v !== '' && v != null && numInput(v) !== 0;

export default function PriceFormation() {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState(null);
  const [saving, setSaving] = useState(false);
  const [simPrice, setSimPrice] = useState('');

  const { data: fixed, refetch: refetchFixed } = useQuery({
    queryKey: ['pricing-fixed-summary'],
    queryFn: () => api.get('/pricing/fixed-summary'),
  });
  const { data: sheets, refetch: refetchSheets } = useQuery({
    queryKey: ['pricing-sheets'],
    queryFn: () => api.get('/pricing/sheets'),
  });
  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];

  const { data: categoriesRes } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get('/products/categories/list'),
  });
  const categorias = Array.isArray(categoriesRes) ? categoriesRes : [];

  // Capacidades derivadas dos nomes reais dos produtos (300ml, 1L...).
  const capacities = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const m = String(p.name || '').match(/\d+(?:[.,]\d+)?\s?(?:ml|l(?:itros?)?)\b/gi) || [];
      for (const cap of m) set.add(cap.replace(/\s+/g, '').toLowerCase());
    }
    return [...set].sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')));
  }, [products]);

  const selectedVariants = useMemo(() => {
    const p = products.find(x => x.id === sheet?.product_id);
    return p ? expandVariants(p) : [];
  }, [products, sheet?.product_id]);

  useEffect(() => {
    if (fixed && !sheet) {
      setSheet(emptySheet({
        overhead_unit: fixed.overhead_unit,
        tax_regime: fixed.tax_regime,
        tax_pct: fixed.tax_pct_default || 4,
      }));
    }
  }, [fixed, sheet]);

  useEffect(() => {
    if (fixed && sheet) setSheet(s => ({ ...s, overhead_unit: fixed.overhead_unit }));
  }, [fixed?.overhead_unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => (sheet ? computeSheet(sheet) : null), [sheet]);

  if (!sheet || !calc) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  const set = patch => setSheet(s => ({ ...s, ...patch }));
  const setBlock = (block, patch) =>
    setSheet(s => ({ ...s, blocks: { ...s.blocks, [block]: { ...(s.blocks[block] || {}), ...patch } } }));
  const setTinta = (i, patch) =>
    setSheet(s => {
      const tintas = [...(s.blocks.tintas || [])];
      tintas[i] = { ...(tintas[i] || {}), ...patch };
      return { ...s, blocks: { ...s.blocks, tintas } };
    });

  const b = sheet.blocks;
  const nColors = Math.min(Math.max(parseInt(sheet.print_colors) || 1, 1), 4);
  const lote = calc.qty;

  // ── O que já foi informado ───────────────────────────────
  // Só isto separa "R$ 0,00 porque é de graça" de "R$ 0,00 porque
  // ninguém preencheu" — e era a diferença que a tela não mostrava.
  const temMat = preenchido(b.materia_prima.unit_cost);
  const temPers = preenchido(b.personalizacao.screen_cost);
  const temTinta = (b.tintas || []).some(t => preenchido(t.amount));
  const temEmb = preenchido(b.embalagem.box_price) && preenchido(b.embalagem.units_per_box);
  const temFrete = preenchido(b.frete.freight_value);
  const temFixo = numInput(fixed?.total) > 0;

  const faltando = [
    !temMat && { texto: 'quanto você paga por peça (matéria-prima)', obrigatorio: true },
    !temFixo && { texto: 'despesas fixas do mês (aluguel, energia…)', link: '/rateio/despesas-fixas' },
    !temEmb && { texto: 'embalagem' },
    !temFrete && { texto: 'frete da compra' },
  ].filter(Boolean);

  // ── Simulador: preço digitado ou o sugerido ──────────────
  const precoSim = simPrice !== '' ? numInput(simPrice) : (calc.price_ideal || 0);
  const sim = simulate({
    costUnit: calc.cost_unit, taxUnit: calc.tax_unit, price: precoSim, quantity: lote,
  });
  const ganhoPeca = precoSim - calc.cost_unit;

  // ── Tabela da loja (faixas + custo de impressão) ─────────
  const tiers = Array.isArray(sheet.blocks.tiers) ? sheet.blocks.tiers : [];
  const printCosts = sheet.blocks.print_costs || {};

  function syncPrintCosts(newTiers, pc) {
    const out = {};
    for (const [m, arr] of Object.entries(pc || {})) {
      out[m] = newTiers.map((t, i) => ({
        min_qty: t.min_qty, max_qty: t.max_qty,
        cost: (Array.isArray(arr) && arr[i] ? arr[i].cost : '') ?? '',
      }));
    }
    return out;
  }
  const setTiers = (newTiers) =>
    setSheet(s => ({ ...s, blocks: { ...s.blocks, tiers: newTiers, print_costs: syncPrintCosts(newTiers, s.blocks.print_costs) } }));
  const addTier = () => setTiers([...tiers, { min_qty: '', max_qty: '' }]);
  const removeTier = (i) => setTiers(tiers.filter((_, idx) => idx !== i));
  const setTier = (i, patch) => setTiers(tiers.map((t, idx) => idx === i ? { ...t, ...patch } : t));

  function toggleMethod(method) {
    setSheet(s => {
      const pc = { ...(s.blocks.print_costs || {}) };
      if (pc[method]) delete pc[method];
      else pc[method] = tiers.map(t => ({ min_qty: t.min_qty, max_qty: t.max_qty, cost: '' }));
      return { ...s, blocks: { ...s.blocks, print_costs: pc } };
    });
  }
  const setPrintCost = (method, i, cost) =>
    setSheet(s => {
      const arr = [...(s.blocks.print_costs?.[method] || [])];
      arr[i] = { min_qty: tiers[i]?.min_qty, max_qty: tiers[i]?.max_qty, cost };
      return { ...s, blocks: { ...s.blocks, print_costs: { ...s.blocks.print_costs, [method]: arr } } };
    });

  // ── Integração com Compras ───────────────────────────────
  async function pullLastPurchase(productId, { silent = false } = {}) {
    if (!productId) { if (!silent) toast.error('Escolha primeiro um produto do cadastro'); return; }
    try {
      const info = await api.get(`/pricing/purchase-info/${productId}`);
      if (!info.found) { if (!silent) toast('Este produto ainda não tem compras registradas', { icon: 'ℹ️' }); return; }
      setSheet(s => ({
        ...s,
        blocks: {
          ...s.blocks,
          // A QUANTIDADE COMPRADA NÃO ENTRA AQUI. O custo da
          // matéria-prima é por PEÇA; o total do bloco é ele vezes o
          // lote desta ficha. Gravar a quantidade da compra fazia o
          // "total" falar de um lote que não é o desta ficha.
          materia_prima: {
            ...s.blocks.materia_prima,
            unit_cost: info.unit_price,
            supplier_name: info.supplier_name,
          },
          frete: {
            supplier_name: info.supplier_name,
            freight_value: info.freight || s.blocks.frete.freight_value,
            quantity_bought: info.purchase_total_qty || s.blocks.frete.quantity_bought,
          },
        },
      }));
      if (!silent) toast.success(`Compra #${info.purchase_number}: ${fmtBRL(info.unit_price)}/un de ${info.supplier_name || 'fornecedor'}`);
    } catch (err) { if (!silent) toast.error(err.error || 'Erro ao buscar a última compra'); }
  }

  function onPickProduct(name) {
    const p = products.find(x => x.name === name);
    set({ name, product_id: p?.id || null, category: p?.CATEGORIAS?.name || sheet.category });
    if (p?.id) pullLastPurchase(p.id, { silent: true });
  }

  // ── Ações ────────────────────────────────────────────────
  async function save() {
    if (!sheet.name.trim()) { toast.error('Dê um nome ao produto antes de salvar'); return; }
    setSaving(true);
    try {
      const payload = {
        product_id: sheet.product_id, category_id: sheet.category_id || null, name: sheet.name, category: sheet.category,
        capacity: sheet.capacity, color_model: sheet.color_model,
        print_type: sheet.print_type, print_colors: nColors,
        calc_quantity: lote, calc_reference: sheet.calc_reference,
        description: sheet.description, blocks: sheet.blocks,
        tax_regime: sheet.tax_regime, tax_pct: numInput(sheet.tax_pct), tax_notes: sheet.tax_notes,
        margin_min_pct: numInput(sheet.margin_min_pct),
        margin_ideal_pct: numInput(sheet.margin_ideal_pct),
        margin_premium_pct: numInput(sheet.margin_premium_pct),
        is_master: !!sheet.is_master,
      };
      const saved = sheet.id
        ? await api.put(`/pricing/sheets/${sheet.id}`, payload)
        : await api.post('/pricing/sheets', payload);
      set({ id: saved.id });
      toast.success(`Ficha "${saved.name}" salva — preço sugerido ${fmtBRL(saved.price_ideal)}`);
      refetchSheets();
      qc.invalidateQueries({ queryKey: ['pricing-report'] });
    } catch (err) { toast.error(err.error || 'Erro ao salvar a ficha'); }
    finally { setSaving(false); }
  }

  function report() {
    if (!openPrintWindow(buildSheetReportHtml(sheet, calc, fixed))) {
      toast.error('Libere as janelas pop-up para gerar o relatório');
    }
  }

  function loadSheet(id) {
    if (!id) {
      setSheet(emptySheet({ overhead_unit: fixed?.overhead_unit, tax_regime: fixed?.tax_regime, tax_pct: fixed?.tax_pct_default }));
      setSimPrice('');
      return;
    }
    const s = (sheets || []).find(x => x.id === id);
    if (!s) return;
    setSheet({
      ...emptySheet({ overhead_unit: fixed?.overhead_unit }),
      ...s,
      blocks: {
        ...emptySheet({}).blocks,
        ...(s.blocks || {}),
        tintas: (s.blocks?.tintas?.length ? s.blocks.tintas : emptySheet({}).blocks.tintas),
      },
      overhead_unit: fixed?.overhead_unit ?? s.overhead_unit,
    });
    setSimPrice('');
  }

  async function removeSheet() {
    if (!sheet.id) return;
    if (!confirm(`Excluir a ficha "${sheet.name}"?`)) return;
    try {
      await api.delete(`/pricing/sheets/${sheet.id}`);
      toast.success('Ficha excluída');
      refetchSheets();
      loadSheet(null);
    } catch (err) { toast.error(err.error || 'Erro ao excluir'); }
  }

  async function saveMonthlyUnits(v) {
    const units = v === '' ? null : Math.max(0, parseInt(v) || 0);
    try {
      await api.put('/pricing/config', { monthly_units: units });
      await refetchFixed();
      toast.success('Produção mensal atualizada — rateio recalculado');
    } catch (err) { toast.error(err.error || 'Erro ao salvar a produção mensal'); }
  }

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">Formação de Preço</h1>
          <p className="text-sm text-gray-500 mt-1">
            Responda três perguntas e o preço sai pronto — com a conta aberta, para você conferir.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-secondary" onClick={report}>
            <Printer size={16} /> Imprimir ficha
          </button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Salvar ficha
          </button>
        </div>
      </div>

      {/* Fichas salvas */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <FolderOpen size={16} className="text-primary-600 shrink-0" />
        <select className="input max-w-md text-sm" value={sheet.id || ''} onChange={e => loadSheet(e.target.value)}>
          <option value="">— Nova ficha —</option>
          {(sheets || []).map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.capacity ? ` ${s.capacity}` : ''} · custa {fmtBRL(s.cost_unit)} · vende {fmtBRL(s.price_ideal)}
            </option>
          ))}
        </select>
        {sheet.id && (
          <button className="btn-ghost p-1.5 text-red-500" title="Excluir esta ficha" onClick={removeSheet}>
            <Trash2 size={15} />
          </button>
        )}
        <span className="text-xs text-gray-400 ml-auto">{(sheets || []).length} ficha(s) salva(s)</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2 space-y-4">

          {/* ═══ PASSO 1 ═══ */}
          <Passo n={1} titulo="O que você vai vender"
            descricao="O nome liga a ficha ao cadastro do produto; a quantidade é o lote sobre o qual tudo será rateado.">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[240px]">
                <label className="block text-[11px] text-gray-500 mb-0.5">Produto</label>
                <input list="pf-products" className="input text-sm w-full" value={sheet.name}
                  placeholder="ex.: Twister 500ml Degradê"
                  onChange={e => onPickProduct(e.target.value)} />
                <datalist id="pf-products">
                  {products.map(p => <option key={p.id} value={p.name} />)}
                </datalist>
              </div>
              <Quantidade label="Quantas peças neste lote" exemplo="1000" value={sheet.calc_quantity}
                onChange={v => set({ calc_quantity: v })} largura="w-40" />
              {sheet.product_id && (
                <button className="btn-secondary btn-sm mb-0.5" onClick={() => pullLastPurchase(sheet.product_id)}
                  title="Preenche a matéria-prima e o frete com a última compra registrada">
                  <Download size={13} /> Puxar da última compra
                </button>
              )}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              Tudo o que é pago uma vez pelo lote (tela, tinta, frete) é dividido por estas {fmtQty(lote)} peças.
              Mudar a quantidade muda o preço — é assim que pedido grande fica mais barato por peça.
            </p>
          </Passo>

          {/* ═══ PASSO 2 ═══ */}
          <Passo n={2} titulo="Quanto custa cada peça"
            descricao="Preencha o que existir. O que ficar em branco não entra na conta — e aparece como “—”, não como zero."
            direita={
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Soma dos custos</p>
                <p className="text-xl font-bold text-gray-900 tabular-nums">{fmtBRL4(calc.subtotal)}</p>
              </div>
            }>
            <div className="space-y-2.5">
              <LinhaCusto
                titulo="Matéria-prima"
                origem={{ texto: 'Este valor é digitado aqui, na ficha. O custo de compra do copo fica no cadastro do produto — clique para abrir e conferir.', link: '/products' }}
                ajuda="O copo, a caneca, a peça crua — o que você compra pronto para personalizar."
                valor={calc.mat_unit} informado={temMat}
                conta={temMat
                  ? `${fmtBRL(calc.mat_unit)} por peça × ${fmtQty(lote)} peças = ${fmtBRL(calc.mat_unit * lote)} no lote`
                  : null}
                fonte={b.materia_prima.supplier_name ? `Fornecedor: ${b.materia_prima.supplier_name}` : null}>
                <Moeda label="Preço que você paga por peça" exemplo="1,59"
                  value={b.materia_prima.unit_cost}
                  onChange={v => setBlock('materia_prima', { unit_cost: v })} />
              </LinhaCusto>

              <LinhaCusto
                titulo="Personalização (tela, clichê, matriz)"
                ajuda="O que você paga UMA vez e usa em várias peças."
                valor={calc.pers_unit} informado={temPers}
                conta={temPers
                  ? `${fmtBRL(numInput(b.personalizacao.screen_cost))} ÷ ${fmtQty(numInput(b.personalizacao.screen_uses) || lote)} peças = ${fmtBRL4(calc.pers_unit)} por peça`
                  : null}>
                <Moeda label="Custo da tela / clichê" exemplo="80,00"
                  value={b.personalizacao.screen_cost}
                  onChange={v => setBlock('personalizacao', { screen_cost: v })} />
                <Quantidade label="Quantas peças essa tela faz" exemplo={String(lote)}
                  value={b.personalizacao.screen_uses}
                  onChange={v => setBlock('personalizacao', { screen_uses: v })} />
              </LinhaCusto>

              <LinhaCusto
                titulo="Tintas"
                origem={{ texto: 'Tinta lançada por lote nesta ficha. Para a tinta com preço por ml e consumo por peça, use Cadastros › Tintas — de lá ela entra sozinha em todo copo.', link: '/cadastros/tintas' }}
                ajuda={`Quanto de tinta o lote inteiro consome, por cor. ${nColors} cor(es) — mude em Detalhes da ficha.`}
                valor={calc.tinta_unit} informado={temTinta}
                conta={temTinta
                  ? `${fmtBRL(calc.tinta_total)} no lote ÷ ${fmtQty(lote)} peças = ${fmtBRL4(calc.tinta_unit)} por peça`
                  : null}>
                {Array.from({ length: nColors }).map((_, i) => (
                  <div key={i} className="flex items-end gap-1.5">
                    <Moeda label={`Cor ${i + 1}`} exemplo="50,00" largura="w-28"
                      value={b.tintas[i]?.amount ?? ''}
                      onChange={v => setTinta(i, { amount: v, label: b.tintas[i]?.label || `Cor ${i + 1}` })} />
                    <input className="input text-sm w-24 mb-0" placeholder="nome"
                      value={(b.tintas[i]?.label || '').replace(/^Cor \d+\s*/, '')}
                      onChange={e => setTinta(i, { label: `Cor ${i + 1} ${e.target.value}`.trim() })} />
                  </div>
                ))}
              </LinhaCusto>

              <LinhaCusto
                titulo="Embalagem"
                origem={{ texto: 'Caixa lançada nesta ficha. Sacola, plástico e caixa com preço próprio se cadastram em Cadastros › Itens.', link: '/cadastros/itens' }}
                ajuda="A caixa em que as peças vão. O custo é dividido pelas peças que cabem nela."
                valor={calc.emb_unit} informado={temEmb}
                conta={temEmb
                  ? `${fmtBRL(numInput(b.embalagem.box_price))} a caixa ÷ ${fmtQty(numInput(b.embalagem.units_per_box))} peças = ${fmtBRL4(calc.emb_unit)} por peça`
                  : null}>
                <Texto label="Nome da caixa" exemplo="Caixa Twister" largura="w-40"
                  value={b.embalagem.box_name} onChange={v => setBlock('embalagem', { box_name: v })} />
                <Moeda label="Preço da caixa" exemplo="2,50"
                  value={b.embalagem.box_price} onChange={v => setBlock('embalagem', { box_price: v })} />
                <Quantidade label="Peças por caixa" exemplo="50"
                  value={b.embalagem.units_per_box} onChange={v => setBlock('embalagem', { units_per_box: v })} />
              </LinhaCusto>

              <LinhaCusto
                titulo="Frete da compra"
                origem={{ texto: 'Frete digitado aqui. O histórico de compras fica no módulo de Compras — clique para abrir.', link: '/purchases' }}
                ajuda="O que você pagou para a mercadoria chegar até você — dividido pelas peças que vieram."
                valor={calc.frete_unit} informado={temFrete}
                conta={temFrete
                  ? `${fmtBRL(numInput(b.frete.freight_value))} ÷ ${fmtQty(numInput(b.frete.quantity_bought) || lote)} peças = ${fmtBRL4(calc.frete_unit)} por peça`
                  : null}>
                <Texto label="Fornecedor" exemplo="Supercop" largura="w-40"
                  value={b.frete.supplier_name} onChange={v => setBlock('frete', { supplier_name: v })} />
                <Moeda label="Valor do frete" exemplo="250,00"
                  value={b.frete.freight_value} onChange={v => setBlock('frete', { freight_value: v })} />
                <Quantidade label="Peças que vieram" exemplo="5000"
                  value={b.frete.quantity_bought} onChange={v => setBlock('frete', { quantity_bought: v })} />
              </LinhaCusto>

              {/* Custos fixos: não se digitam aqui — vêm do rateio. */}
              <LinhaCusto
                titulo="Custos fixos da empresa"
                origem={{ texto: 'Este valor NÃO se digita aqui: vem das Despesas Fixas cadastradas, dividido pela produção mensal. Clique para abrir.', link: '/rateio/despesas-fixas' }}
                ajuda="Aluguel, energia, salários, sistema. Não se digitam aqui: vêm das despesas cadastradas."
                valor={calc.overhead_unit} informado={temFixo}
                conta={temFixo
                  ? `${fmtBRL(fixed?.total)} por mês ÷ ${fmtQty(fixed?.monthly_units || fixed?.auto_monthly_units)} peças produzidas no mês = ${fmtBRL4(calc.overhead_unit)} por peça`
                  : null}>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="block text-[11px] text-gray-500 mb-0.5">Produção mensal estimada</label>
                    <div className="relative">
                      <input type="number" min="0" className="input text-sm w-40 pr-14"
                        defaultValue={fixed?.monthly_units_source === 'manual' ? fixed?.monthly_units : ''}
                        placeholder={`auto: ${fmtQty(fixed?.auto_monthly_units)}`}
                        key={`mu-${fixed?.monthly_units}`}
                        onBlur={e => {
                          const v = e.target.value;
                          if (v !== (fixed?.monthly_units_source === 'manual' ? String(fixed?.monthly_units) : '')) saveMonthlyUnits(v);
                        }} />
                      <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">peças</span>
                    </div>
                  </div>
                  <Link to="/rateio/despesas-fixas" className="btn-secondary btn-sm mb-0.5">
                    <Package size={13} /> {temFixo ? 'Ver as despesas' : 'Cadastrar despesas'}
                  </Link>
                </div>
                {temFixo && (
                  <div className="w-full mt-2 flex flex-wrap gap-1.5">
                    {(fixed?.items || []).slice(0, 12).map(f => {
                      const Icon = iconFor(f.name);
                      return (
                        <span key={f.id} className="inline-flex items-center gap-1 rounded-lg border border-gray-200 px-2 py-1 text-[11px] text-gray-600">
                          <Icon size={11} className="text-gray-400" /> {f.name}
                          <b className="text-gray-800">{fmtBRL(f.amount)}</b>
                        </span>
                      );
                    })}
                    {(fixed?.items || []).length > 12 && (
                      <span className="text-[11px] text-gray-400 self-center">
                        +{(fixed.items.length - 12)} outras
                      </span>
                    )}
                  </div>
                )}
              </LinhaCusto>
            </div>
          </Passo>

          {/* ═══ PASSO 3 ═══ */}
          <Passo n={3} titulo="Quanto você quer ganhar"
            descricao="O imposto sai do seu regime; a margem é sua escolha. O preço é consequência dos dois.">
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Regime tributário</label>
                <select className="input text-sm w-48" value={sheet.tax_regime}
                  onChange={e => {
                    const r = TAX_REGIMES.find(x => x.value === e.target.value);
                    set({ tax_regime: e.target.value, tax_pct: r ? r.default_pct : sheet.tax_pct });
                  }}>
                  {TAX_REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <Percentual label="Imposto sobre a venda" value={sheet.tax_pct} onChange={v => set({ tax_pct: v })} />
              <Percentual label="Margem que você quer" value={sheet.margin_ideal_pct}
                onChange={v => { set({ margin_ideal_pct: v }); setSimPrice(''); }} />
              <div className="text-sm text-gray-500 pb-2">
                = imposto de <b className="text-gray-800">{fmtBRL4(calc.tax_unit)}</b> por peça
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-800 mb-2">E se eu vender por outro preço?</p>
              <div className="flex flex-wrap items-end gap-4">
                <Moeda label="Preço de venda por peça" exemplo="1,19" largura="w-32"
                  value={simPrice === '' ? (calc.price_ideal ? calc.price_ideal.toFixed(2).replace('.', ',') : '') : simPrice}
                  onChange={setSimPrice} />
                <div className="text-sm">
                  <p className="text-[11px] text-gray-500">Margem efetiva</p>
                  <p className={`font-bold ${sim.margemEfetiva >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {sim.margemEfetiva.toFixed(1)}%
                  </p>
                </div>
                <div className="text-sm">
                  <p className="text-[11px] text-gray-500">Faturamento do lote</p>
                  <p className="font-semibold text-gray-900">{fmtBRL(sim.faturamento)}</p>
                </div>
                <div className="text-sm">
                  <p className="text-[11px] text-gray-500">Lucro líquido do lote</p>
                  <p className={`font-bold ${sim.lucroLiquido >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {fmtBRL(sim.lucroLiquido)}
                  </p>
                </div>
                {simPrice !== '' && (
                  <button className="btn-ghost btn-sm text-primary-600 mb-0.5" onClick={() => setSimPrice('')}>
                    voltar ao preço sugerido
                  </button>
                )}
              </div>
            </div>
          </Passo>

          {/* ═══ O QUE NÃO MUDA O PREÇO ═══ */}
          <Recolhivel titulo="Detalhes da ficha"
            descricao="Categoria, capacidade, cor, impressão e observação. Nada aqui altera o preço — é a etiqueta da ficha.">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Categoria</label>
                <select className="input text-sm w-full" value={sheet.category_id || ''}
                  onChange={e => {
                    const id = e.target.value;
                    const cat = categorias.find(c => c.id === id);
                    set({ category_id: id || null, category: cat?.name || sheet.category });
                  }}>
                  <option value="">— Sem categoria —</option>
                  {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Capacidade</label>
                <input list="pf-capacity" className="input text-sm w-full" value={sheet.capacity || ''}
                  placeholder="ex.: 500ml" onChange={e => set({ capacity: e.target.value })} />
                <datalist id="pf-capacity">{capacities.map(c => <option key={c} value={c} />)}</datalist>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Cor / modelo</label>
                <input list="pf-variants" className="input text-sm w-full" value={sheet.color_model || ''}
                  placeholder="ex.: Azul Degradê" onChange={e => set({ color_model: e.target.value })} />
                <datalist id="pf-variants">{selectedVariants.map(v => <option key={v} value={v} />)}</datalist>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Tipo de impressão</label>
                <select className="input text-sm w-full" value={sheet.print_type}
                  onChange={e => set({ print_type: e.target.value })}>
                  {PRINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">
                  Quantas cores <span className="text-gray-400">(muda os campos de tinta)</span>
                </label>
                <select className="input text-sm w-full" value={nColors}
                  onChange={e => set({ print_colors: parseInt(e.target.value) })}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} cor{n > 1 ? 'es' : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-[11px] text-gray-500 mb-0.5">Referência de cálculo</label>
                <select className="input text-sm w-full" value={sheet.calc_reference}
                  onChange={e => set({ calc_reference: e.target.value })}>
                  {CALC_REFERENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-[11px] text-gray-500 mb-0.5">Observação</label>
                <input className="input text-sm w-full" value={sheet.description || ''}
                  placeholder="ex.: Copo Twister 500ml com pintura degradê e serigrafia 2 cores."
                  onChange={e => set({ description: e.target.value })} />
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="block text-[11px] text-gray-500 mb-0.5">Observação fiscal</label>
                <input className="input text-sm w-full" value={sheet.tax_notes || ''}
                  placeholder="ex.: confirmar a alíquota do regime com o contador."
                  onChange={e => set({ tax_notes: e.target.value })} />
              </div>
            </div>
          </Recolhivel>

          {/* ═══ TABELA DA LOJA ═══ */}
          <Recolhivel titulo="Preço da loja por quantidade"
            descricao="Só para quem vende no site: faixas de quantidade e o custo de impressão em cada uma.">
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-3">
              <input type="checkbox" className="w-4 h-4 rounded text-primary-600"
                checked={!!sheet.is_master} onChange={e => set({ is_master: e.target.checked })} />
              <span className="text-gray-700">
                Usar como <b>tabela mestre</b> da categoria — é esta ficha que a loja consulta.
              </span>
            </label>
            <p className="text-xs text-gray-500 mb-3">
              O preço da loja é <b>custo base + impressão da faixa + margem</b>. Custo maior nas faixas
              pequenas é o que faz o pedido grande sair mais barato por peça.
            </p>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">Faixas de quantidade</p>
                <button type="button" onClick={addTier} className="btn-secondary btn-sm">
                  <Plus size={13} /> Faixa
                </button>
              </div>
              {tiers.length === 0 && <p className="text-xs text-gray-400">Sem faixas. Clique em “Faixa” para começar.</p>}
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">De</span>
                  <input type="number" min="0" className="input py-1 text-sm w-24 text-center" placeholder="mín"
                    value={t.min_qty} onChange={e => setTier(i, { min_qty: e.target.value })} />
                  <span className="text-xs text-gray-500">até</span>
                  <input type="number" min="0" className="input py-1 text-sm w-24 text-center" placeholder="máx"
                    value={t.max_qty} onChange={e => setTier(i, { max_qty: e.target.value })} />
                  <span className="text-xs text-gray-500">peças</span>
                  <button type="button" onClick={() => removeTier(i)}
                    className="p-1.5 text-gray-400 hover:text-red-500 rounded"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>

            <div className="space-y-2 pt-3 mt-3 border-t border-gray-100">
              <p className="text-sm font-medium text-gray-700">Custo de impressão por peça</p>
              <div className="flex flex-wrap gap-1.5">
                {PRINT_METHODS.map(m => (
                  <button key={m.key} type="button" onClick={() => toggleMethod(m.key)}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors ${printCosts[m.key]
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                    {m.label}
                  </button>
                ))}
              </div>
              {tiers.length === 0 && Object.keys(printCosts).length > 0 && (
                <p className="text-xs text-amber-600">Crie as faixas acima para informar os custos.</p>
              )}
              {PRINT_METHODS.filter(m => printCosts[m.key]).map(m => (
                <div key={m.key} className="rounded-lg border border-gray-100 p-2.5">
                  <p className="text-xs font-semibold text-gray-700 mb-1.5">{m.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {tiers.map((t, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-[11px] text-gray-400 whitespace-nowrap">
                          {t.min_qty || '?'}–{t.max_qty || '∞'}
                        </span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">R$</span>
                          <input type="number" min="0" step="0.01" className="input py-1 text-sm w-24 pl-7"
                            placeholder="0,00" value={printCosts[m.key]?.[i]?.cost ?? ''}
                            onChange={e => setPrintCost(m.key, i, e.target.value)} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Recolhivel>
        </div>

        {/* ═══ RESULTADO — sempre à vista ═══ */}
        <div className="space-y-4 xl:sticky xl:top-4">
          <Resultado calc={calc} sheet={sheet} lote={lote} precoSim={precoSim}
            ganhoPeca={ganhoPeca} sim={sim} faltando={faltando} temMat={temMat}
            onMargem={(k, v) => set({ [k]: v })} />
        </div>
      </div>
    </div>
  );
}

// ── O RESULTADO ──────────────────────────────────────────────

/**
 * Um número grande e uma frase em português.
 *
 * O painel antigo tinha catorze linhas de valores com quatro casas
 * decimais e nenhuma frase. Dava para ler tudo e ainda não saber a
 * resposta da pergunta que levou a pessoa até ali: por quanto eu vendo?
 */
function Resultado({ calc, sheet, lote, precoSim, ganhoPeca, sim, faltando, temMat, onMargem }) {
  const prejuizo = ganhoPeca < 0;

  return (
    <>
      <div className="card overflow-hidden">
        <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center gap-2">
          <Calculator size={15} /> <span className="font-semibold text-sm">O SEU PREÇO</span>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <p className="text-xs text-gray-500">Cada peça custa</p>
            <p className="text-2xl font-bold text-gray-900 tabular-nums">
              {temMat ? fmtBRL(calc.cost_unit) : '—'}
            </p>
            <p className="text-[11px] text-gray-400">já com imposto e rateio dos custos fixos</p>
          </div>

          <div className={`rounded-xl border-2 p-3 text-center ${prejuizo ? 'border-red-400 bg-red-50' : 'border-emerald-500 bg-emerald-50'}`}>
            <p className={`text-[11px] font-bold tracking-wide ${prejuizo ? 'text-red-700' : 'text-emerald-700'}`}>
              VENDER POR
            </p>
            <p className={`text-3xl font-extrabold mt-0.5 ${prejuizo ? 'text-red-700' : 'text-emerald-700'}`}>
              {fmtBRL(precoSim)}
            </p>
            <p className="text-xs text-gray-600 mt-1.5">
              {prejuizo ? (
                <>Este preço fica <b>abaixo do custo</b>: cada peça vendida perde {fmtBRL(Math.abs(ganhoPeca))}.</>
              ) : (
                <>Sobram <b>{fmtBRL(ganhoPeca)}</b> por peça — <b>{fmtBRL(sim.lucroLiquido)}</b> no lote de {fmtQty(lote)}.</>
              )}
            </p>
          </div>

          {/* Os outros dois preços */}
          <div className="grid grid-cols-2 gap-2">
            {[
              ['Mínimo', 'margin_min_pct', calc.price_min, 'text-amber-700'],
              ['Premium', 'margin_premium_pct', calc.price_premium, 'text-violet-700'],
            ].map(([label, key, price, cls]) => (
              <div key={key} className="rounded-lg border border-gray-200 p-2 text-center">
                <div className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
                  {label}
                  <input className="w-9 text-right border-b border-dashed border-gray-300 bg-transparent focus:outline-none"
                    inputMode="decimal" value={sheet[key]} onChange={e => onMargem(key, e.target.value)} />%
                </div>
                <p className={`font-bold ${cls}`}>{fmtBRL(price)}</p>
              </div>
            ))}
          </div>

          {/* A conta aberta, para quem quiser conferir */}
          <details className="pt-1">
            <summary className="text-xs text-primary-600 cursor-pointer select-none">Ver a conta aberta</summary>
            <div className="mt-2 space-y-1 text-xs">
              {[
                ['Matéria-prima', calc.mat_unit],
                ['Personalização', calc.pers_unit],
                ['Tintas', calc.tinta_unit],
                ['Embalagem', calc.emb_unit],
                ['Frete da compra', calc.frete_unit],
                ['Custos fixos', calc.overhead_unit],
              ].map(([label, v]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className={`tabular-nums ${v ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                    {v ? fmtBRL4(v) : '—'}
                  </span>
                </div>
              ))}
              <div className="flex justify-between pt-1 border-t border-gray-200">
                <span className="text-gray-600">Soma dos custos</span>
                <span className="font-bold tabular-nums">{fmtBRL4(calc.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Imposto ({calc.tax_pct}%)</span>
                <span className="tabular-nums">{fmtBRL4(calc.tax_unit)}</span>
              </div>
              <div className="flex justify-between pt-1 border-t border-gray-300">
                <span className="font-bold text-gray-900">Custo por peça</span>
                <span className="font-bold tabular-nums">{fmtBRL4(calc.cost_unit)}</span>
              </div>
            </div>
          </details>
        </div>
      </div>

      {/* O QUE FALTA — a pergunta que a tela antiga nunca respondia */}
      <div className="card">
        <div className="card-body">
          {faltando.length === 0 ? (
            <p className="text-sm text-emerald-700 flex items-center gap-2">
              <CheckCircle2 size={16} /> Todos os custos estão informados.
            </p>
          ) : (
            <>
              <p className="text-sm font-medium text-gray-800 flex items-center gap-2 mb-2">
                <AlertCircle size={15} className="text-amber-500" /> Ainda não informado
              </p>
              <ul className="space-y-1.5">
                {faltando.map((f, i) => (
                  <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5">
                    <span className={`mt-1 w-1.5 h-1.5 rounded-full shrink-0 ${f.obrigatorio ? 'bg-red-500' : 'bg-gray-300'}`} />
                    <span>
                      {f.texto}
                      {f.obrigatorio && <b className="text-red-600"> — sem isso o preço não vale nada</b>}
                      {f.link && <> · <Link to={f.link} className="text-primary-600 hover:underline">cadastrar</Link></>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-body">
          <p className="text-xs text-gray-500 flex items-start gap-1.5">
            <TrendingUp size={14} className="text-gray-400 shrink-0 mt-0.5" />
            Margem aqui é sobre o <b className="mx-1">preço de venda</b>, não sobre o custo:
            {' '}{numInput(sheet.margin_ideal_pct)}% de margem sobre um custo de {fmtBRL(calc.cost_unit)} dá
            {' '}{fmtBRL(calc.price_ideal)} — e não {fmtBRL(calc.cost_unit * (1 + numInput(sheet.margin_ideal_pct) / 100))},
            que seria somar a porcentagem ao custo.
          </p>
        </div>
      </div>
    </>
  );
}
