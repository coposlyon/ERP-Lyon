import { useState, useMemo, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Package, Coins, Calculator, Save, BarChart3, Loader2, Plus, Trash2,
  Landmark, Rocket, Download, Info, FolderOpen, Percent,
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

// ─── Blocos de custo (Matéria-prima, Personalização...) ────
function CostBlock({ title, color, children }) {
  return (
    <div className="rounded-xl border border-gray-200 p-3 space-y-2 min-w-0">
      <p className={`text-[11px] font-bold tracking-wide uppercase px-2 py-1 rounded-md inline-block ${color}`}>{title}</p>
      {children}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-[11px] text-gray-500 mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function RateioLine({ label = 'Rateio por Unidade', value }) {
  return (
    <div className="pt-1 border-t border-dashed border-gray-200">
      <p className="text-[11px] text-gray-500">{label}</p>
      <p className="font-bold text-gray-900">{fmtBRL4(value)}</p>
    </div>
  );
}

export default function PriceFormation() {
  const qc = useQueryClient();
  const [sheet, setSheet] = useState(null); // null até carregar custos fixos
  const [saving, setSaving] = useState(false);
  const [simPrice, setSimPrice] = useState(''); // '' = preço ideal automático
  const [flash, setFlash] = useState(false);

  // Custos fixos + produção mensal (rateio)
  const { data: fixed, refetch: refetchFixed } = useQuery({
    queryKey: ['pricing-fixed-summary'],
    queryFn: () => api.get('/pricing/fixed-summary'),
  });

  // Fichas salvas (histórico)
  const { data: sheets, refetch: refetchSheets } = useQuery({
    queryKey: ['pricing-sheets'],
    queryFn: () => api.get('/pricing/sheets'),
  });

  // Produtos p/ o seletor (vínculo com o cadastro e a última compra)
  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];

  // Categorias REAIS do cadastro de produtos (mesma fonte da tela Produtos) —
  // nada de lista fixa: o que existir lá é o que aparece aqui.
  const { data: categoriesRes } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get('/products/categories/list'),
  });
  const categories = useMemo(
    () => (Array.isArray(categoriesRes) ? categoriesRes.map(c => c.name) : []),
    [categoriesRes],
  );

  // Capacidades derivadas dos nomes reais dos produtos (300ml, 1L...) —
  // acompanha o cadastro automaticamente, sem valores inventados.
  const capacities = useMemo(() => {
    const set = new Set();
    for (const p of products) {
      const m = String(p.name || '').match(/\d+(?:[.,]\d+)?\s?(?:ml|l(?:itros?)?)\b/gi) || [];
      for (const cap of m) set.add(cap.replace(/\s+/g, '').toLowerCase());
    }
    return [...set].sort((a, b) => parseFloat(a.replace(',', '.')) - parseFloat(b.replace(',', '.')));
  }, [products]);

  // Variações (cores/modelos) cadastradas no produto vinculado
  const selectedVariants = useMemo(() => {
    const p = products.find(x => x.id === sheet?.product_id);
    return p ? expandVariants(p) : [];
  }, [products, sheet?.product_id]);

  // Inicializa a ficha em branco quando os custos fixos chegarem
  useEffect(() => {
    if (fixed && !sheet) {
      setSheet(emptySheet({
        overhead_unit: fixed.overhead_unit,
        tax_regime: fixed.tax_regime,
        tax_pct: fixed.tax_pct_default || 4,
      }));
    }
  }, [fixed, sheet]);

  // Rateio fixo sempre acompanha o resumo mais recente
  useEffect(() => {
    if (fixed && sheet) setSheet(s => ({ ...s, overhead_unit: fixed.overhead_unit }));
  }, [fixed?.overhead_unit]); // eslint-disable-line react-hooks/exhaustive-deps

  const calc = useMemo(() => (sheet ? computeSheet(sheet) : null), [sheet]);

  // Simulador rápido: preço manual (se digitado) ou o ideal
  const simUnitPrice = simPrice !== '' ? numInput(simPrice) : (calc?.price_ideal || 0);
  const sim = calc ? simulate({
    costUnit: calc.cost_unit, taxUnit: calc.tax_unit,
    price: simUnitPrice, quantity: calc.qty,
  }) : null;

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

  // ── Integração com Compras: última compra do produto ────
  async function pullLastPurchase(productId, { silent = false } = {}) {
    if (!productId) { if (!silent) toast.error('Selecione um produto do cadastro primeiro'); return; }
    try {
      const info = await api.get(`/pricing/purchase-info/${productId}`);
      if (!info.found) { if (!silent) toast('Este produto ainda não tem compras registradas', { icon: 'ℹ️' }); return; }
      setSheet(s => ({
        ...s,
        blocks: {
          ...s.blocks,
          materia_prima: {
            ...s.blocks.materia_prima,
            unit_cost: info.unit_price,
            quantity: s.blocks.materia_prima.quantity || info.quantity,
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

  // ── Ações do topo ────────────────────────────────────────
  async function save() {
    if (!sheet.name.trim()) { toast.error('Informe o nome do produto'); return; }
    setSaving(true);
    try {
      const payload = {
        product_id: sheet.product_id, name: sheet.name, category: sheet.category,
        capacity: sheet.capacity, color_model: sheet.color_model,
        print_type: sheet.print_type, print_colors: nColors,
        calc_quantity: calc.qty, calc_reference: sheet.calc_reference,
        description: sheet.description, blocks: sheet.blocks,
        tax_regime: sheet.tax_regime, tax_pct: numInput(sheet.tax_pct), tax_notes: sheet.tax_notes,
        margin_min_pct: numInput(sheet.margin_min_pct),
        margin_ideal_pct: numInput(sheet.margin_ideal_pct),
        margin_premium_pct: numInput(sheet.margin_premium_pct),
      };
      const saved = sheet.id
        ? await api.put(`/pricing/sheets/${sheet.id}`, payload)
        : await api.post('/pricing/sheets', payload);
      set({ id: saved.id });
      toast.success(`Ficha "${saved.name}" salva! Preço ideal: ${fmtBRL(saved.price_ideal)}`);
      refetchSheets();
      qc.invalidateQueries({ queryKey: ['pricing-report'] });
    } catch (err) { toast.error(err.error || 'Erro ao salvar a ficha'); }
    finally { setSaving(false); }
  }

  async function recalc() {
    await refetchFixed();
    setFlash(true);
    setTimeout(() => setFlash(false), 900);
    toast.success(`Preço calculado: ${fmtBRL(calc.price_ideal)} (margem ${sheet.margin_ideal_pct}%)`);
  }

  function report() {
    if (!openPrintWindow(buildSheetReportHtml(sheet, calc, fixed))) {
      toast.error('Libere as janelas pop-up para gerar o relatório');
    }
  }

  function loadSheet(id) {
    if (!id) { setSheet(emptySheet({ overhead_unit: fixed?.overhead_unit, tax_regime: fixed?.tax_regime, tax_pct: fixed?.tax_pct_default })); setSimPrice(''); return; }
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

  // Salva a produção mensal (meta de rateio) na configuração
  async function saveMonthlyUnits(v) {
    const units = v === '' ? null : Math.max(0, parseInt(v) || 0);
    try {
      await api.put('/pricing/config', { monthly_units: units });
      await refetchFixed();
      toast.success('Produção mensal atualizada — rateio recalculado');
    } catch (err) { toast.error(err.error || 'Erro ao salvar a produção mensal'); }
  }

  const resumoRows = [
    ['Custo Direto (Matéria-Prima)', calc.mat_unit],
    ['Personalização (Rateio)', calc.pers_unit],
    ['Tintas (Rateio)', calc.tinta_unit],
    ['Embalagem (caixa)', calc.emb_unit],
    ['Frete (rateio)', calc.frete_unit],
    ['Rateio de Custos Fixos', calc.overhead_unit],
  ];

  return (
    <div className="space-y-4">
      {/* Cabeçalho + ações */}
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">Formação de Preço / Rateio</h1>
          <p className="text-sm text-gray-500 mt-1">Cadastre seus custos e calcule o preço ideal de venda</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} SALVAR
          </button>
          <button className="btn-secondary" onClick={recalc}>
            <Calculator size={16} /> CALCULAR PREÇO
          </button>
          <button className="px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-amber-950 transition-colors" onClick={report}>
            <BarChart3 size={16} /> GERAR RELATÓRIO
          </button>
        </div>
      </div>

      {/* Fichas salvas (histórico) */}
      <div className="card p-3 flex items-center gap-3 flex-wrap">
        <FolderOpen size={16} className="text-primary-600 shrink-0" />
        <select className="input max-w-xs text-sm" value={sheet.id || ''} onChange={e => loadSheet(e.target.value)}>
          <option value="">— Nova ficha de precificação —</option>
          {(sheets || []).map(s => (
            <option key={s.id} value={s.id}>
              {s.name}{s.capacity ? ` ${s.capacity}` : ''} · custo {fmtBRL(s.cost_unit)} · ideal {fmtBRL(s.price_ideal)}
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
        {/* ═══ COLUNA PRINCIPAL ═══ */}
        <div className="xl:col-span-2 space-y-4">
          {/* DADOS DO PRODUTO */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Package size={17} className="text-primary-600" /> DADOS DO PRODUTO
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Produto">
                <input list="pf-products" className="input text-sm" value={sheet.name}
                  placeholder="Twister 500ml Degradê"
                  onChange={e => onPickProduct(e.target.value)} />
                <datalist id="pf-products">
                  {products.map(p => <option key={p.id} value={p.name} />)}
                </datalist>
              </Field>
              <Field label="Categoria">
                <select className="input text-sm" value={sheet.category || ''}
                  onChange={e => set({ category: e.target.value })}>
                  <option value="">— Sem categoria —</option>
                  {/* Somente as categorias reais do cadastro de produtos */}
                  {sheet.category && !categories.includes(sheet.category) && (
                    <option value={sheet.category}>{sheet.category} (antiga)</option>
                  )}
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Capacidade">
                <input list="pf-capacity" className="input text-sm" value={sheet.capacity || ''}
                  placeholder="500ml" onChange={e => set({ capacity: e.target.value })} />
                <datalist id="pf-capacity">
                  {/* Capacidades extraídas dos produtos cadastrados */}
                  {capacities.map(c => <option key={c} value={c} />)}
                </datalist>
              </Field>
              <Field label="Cor / Modelo">
                <input list="pf-variants" className="input text-sm" value={sheet.color_model || ''}
                  placeholder="Azul Degradê" onChange={e => set({ color_model: e.target.value })} />
                <datalist id="pf-variants">
                  {/* Variações cadastradas do produto selecionado */}
                  {selectedVariants.map(v => <option key={v} value={v} />)}
                </datalist>
              </Field>
              <Field label="Tipo de Impressão">
                <select className="input text-sm" value={sheet.print_type}
                  onChange={e => set({ print_type: e.target.value })}>
                  {PRINT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </Field>
              <Field label="Qtd. Cores na Impressão">
                <select className="input text-sm" value={nColors}
                  onChange={e => set({ print_colors: parseInt(e.target.value) })}>
                  {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} Cor{n > 1 ? 'es' : ''}</option>)}
                </select>
              </Field>
              <Field label="Quantidade para Cálculo">
                <div className="relative">
                  <input type="number" min="1" className="input text-sm pr-16" value={sheet.calc_quantity}
                    onChange={e => set({ calc_quantity: e.target.value })} />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">unidades</span>
                </div>
              </Field>
              <Field label="Referência de Cálculo">
                <select className="input text-sm" value={sheet.calc_reference}
                  onChange={e => set({ calc_reference: e.target.value })}>
                  {CALC_REFERENCES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Descrição / Observação">
              <input className="input text-sm" value={sheet.description || ''}
                placeholder="Copo Twister 500ml com pintura degradê e serigrafia 2 cores."
                onChange={e => set({ description: e.target.value })} />
            </Field>
          </div>

          {/* CUSTOS E RATEIOS */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Coins size={17} className="text-primary-600" /> CUSTOS E RATEIOS
              </h2>
              <button className="btn-ghost text-xs text-primary-600 flex items-center gap-1"
                onClick={() => pullLastPurchase(sheet.product_id)}
                title="Preenche matéria-prima e frete com a última compra registrada no módulo de Compras">
                <Download size={13} /> Puxar da última compra
              </button>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
              {/* MATÉRIA-PRIMA */}
              <CostBlock title="Matéria-Prima" color="bg-amber-100 text-amber-800">
                <Field label={b.materia_prima.label || 'Copo Vazio (un.)'}>
                  <input className="input text-sm" inputMode="decimal" placeholder="1,59"
                    value={b.materia_prima.unit_cost}
                    onChange={e => setBlock('materia_prima', { unit_cost: e.target.value })} />
                </Field>
                <Field label="Quantidade">
                  <input type="number" min="0" className="input text-sm" placeholder={String(calc.qty)}
                    value={b.materia_prima.quantity}
                    onChange={e => setBlock('materia_prima', { quantity: e.target.value })} />
                </Field>
                {b.materia_prima.supplier_name && (
                  <p className="text-[11px] text-gray-400 truncate" title={b.materia_prima.supplier_name}>
                    Fornecedor: {b.materia_prima.supplier_name}
                  </p>
                )}
                <RateioLine label="Total" value={calc.mat_total} />
              </CostBlock>

              {/* PERSONALIZAÇÃO */}
              <CostBlock title="Personalização" color="bg-fuchsia-100 text-fuchsia-800">
                <Field label={b.personalizacao.type || 'Tela de Serigrafia'}>
                  <input className="input text-sm" inputMode="decimal" placeholder="80,00"
                    value={b.personalizacao.screen_cost}
                    onChange={e => setBlock('personalizacao', { screen_cost: e.target.value })} />
                </Field>
                <Field label="Qtd. de Usos">
                  <input type="number" min="0" className="input text-sm" placeholder={String(calc.qty)}
                    value={b.personalizacao.screen_uses}
                    onChange={e => setBlock('personalizacao', { screen_uses: e.target.value })} />
                </Field>
                <RateioLine value={calc.pers_unit} />
              </CostBlock>

              {/* TINTAS */}
              <CostBlock title="Tintas" color="bg-sky-100 text-sky-800">
                {Array.from({ length: nColors }).map((_, i) => (
                  <Field key={i} label={
                    <span className="flex items-center gap-1">
                      Cor {i + 1}
                      <input className="border-0 border-b border-dashed border-gray-300 bg-transparent text-[11px] w-16 px-0.5 focus:outline-none"
                        placeholder={i === 0 ? '(Branco)' : '(nome)'}
                        value={(b.tintas[i]?.label || '').replace(/^Cor \d+\s*/, '')}
                        onChange={e => setTinta(i, { label: `Cor ${i + 1} ${e.target.value}`.trim() })} />
                    </span>
                  }>
                    <input className="input text-sm" inputMode="decimal" placeholder="50,00"
                      value={b.tintas[i]?.amount ?? ''}
                      onChange={e => setTinta(i, { amount: e.target.value, label: b.tintas[i]?.label || `Cor ${i + 1}` })} />
                  </Field>
                ))}
                <RateioLine value={calc.tinta_unit} />
              </CostBlock>

              {/* EMBALAGEM */}
              <CostBlock title="Embalagem" color="bg-orange-100 text-orange-800">
                <Field label="Nome da Caixa">
                  <input className="input text-sm" placeholder="Caixa Twister"
                    value={b.embalagem.box_name}
                    onChange={e => setBlock('embalagem', { box_name: e.target.value })} />
                </Field>
                <Field label="Preço da Caixa">
                  <input className="input text-sm" inputMode="decimal" placeholder="2,50"
                    value={b.embalagem.box_price}
                    onChange={e => setBlock('embalagem', { box_price: e.target.value })} />
                </Field>
                <Field label="Qtd. por Caixa">
                  <input type="number" min="0" className="input text-sm" placeholder="50"
                    value={b.embalagem.units_per_box}
                    onChange={e => setBlock('embalagem', { units_per_box: e.target.value })} />
                </Field>
                <RateioLine value={calc.emb_unit} />
              </CostBlock>

              {/* FRETE DE COMPRA */}
              <CostBlock title="Frete de Compra" color="bg-emerald-100 text-emerald-800">
                <Field label="Fornecedor">
                  <input className="input text-sm" placeholder="Supercop"
                    value={b.frete.supplier_name}
                    onChange={e => setBlock('frete', { supplier_name: e.target.value })} />
                </Field>
                <Field label="Valor do Frete">
                  <input className="input text-sm" inputMode="decimal" placeholder="250,00"
                    value={b.frete.freight_value}
                    onChange={e => setBlock('frete', { freight_value: e.target.value })} />
                </Field>
                <Field label="Qtd. Comprada">
                  <input type="number" min="0" className="input text-sm" placeholder="5.000"
                    value={b.frete.quantity_bought}
                    onChange={e => setBlock('frete', { quantity_bought: e.target.value })} />
                </Field>
                <RateioLine value={calc.frete_unit} />
              </CostBlock>
            </div>
          </div>

          {/* CUSTOS FIXOS MENSAIS (RATEIO) */}
          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                <Landmark size={17} className="text-primary-600" /> CUSTOS FIXOS MENSAIS (RATEIO)
              </h2>
              <Link to="/rateio/despesas-fixas" className="text-xs text-primary-600 hover:underline">
                Gerenciar despesas →
              </Link>
            </div>

            {(fixed?.items || []).length === 0 ? (
              <p className="text-sm text-gray-400">
                Nenhuma despesa fixa cadastrada. <Link to="/rateio/despesas-fixas" className="text-primary-600 hover:underline">Cadastre em Rateio de Custos</Link> para o rateio entrar no cálculo.
              </p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2">
                {(fixed?.items || []).map(f => {
                  const Icon = iconFor(f.name);
                  return (
                    <div key={f.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2">
                      <Icon size={14} className="text-gray-400 shrink-0" />
                      <span className="text-xs text-gray-600 truncate flex-1" title={f.name}>{f.name}</span>
                      <span className="text-xs font-semibold whitespace-nowrap">{fmtBRL(f.amount)}</span>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total Mensal</p>
                <p className="text-lg font-bold text-gray-900">{fmtBRL(fixed?.total)}</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-200 p-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">Produção Mensal Estimada</p>
                <div className="flex items-center gap-1">
                  <input type="number" min="0" className="input text-sm py-1 max-w-[130px]"
                    defaultValue={fixed?.monthly_units_source === 'manual' ? fixed?.monthly_units : ''}
                    placeholder={`Auto: ${fmtQty(fixed?.auto_monthly_units)}`}
                    key={`mu-${fixed?.monthly_units}`}
                    onBlur={e => { const v = e.target.value; if (v !== (fixed?.monthly_units_source === 'manual' ? String(fixed?.monthly_units) : '')) saveMonthlyUnits(v); }} />
                  <span className="text-xs text-gray-400">unidades</span>
                </div>
              </div>
              <div className="rounded-xl bg-gray-900 text-white p-3">
                <p className="text-[11px] text-gray-300 uppercase tracking-wide">Rateio por Unidade</p>
                <p className="text-lg font-bold">{fmtBRL4(calc.overhead_unit)}</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 flex items-center gap-1">
              <Info size={12} /> Altere os valores acima sempre que necessário. O rateio por unidade será recalculado automaticamente.
            </p>
          </div>

          {/* IMPOSTOS E REGIME FISCAL */}
          <div className="card p-4 space-y-3">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Percent size={17} className="text-primary-600" /> IMPOSTOS E REGIME FISCAL
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Regime Tributário">
                <select className="input text-sm" value={sheet.tax_regime}
                  onChange={e => {
                    const r = TAX_REGIMES.find(x => x.value === e.target.value);
                    set({ tax_regime: e.target.value, tax_pct: r ? r.default_pct : sheet.tax_pct });
                  }}>
                  {TAX_REGIMES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </Field>
              <Field label="Alíquota Efetiva (%)">
                <input className="input text-sm" inputMode="decimal" value={sheet.tax_pct}
                  onChange={e => set({ tax_pct: e.target.value })} />
                <p className="text-[11px] text-gray-400 mt-0.5">Alíquota utilizada para cálculo dos impostos.</p>
              </Field>
              <Field label="Observação">
                <input className="input text-sm" value={sheet.tax_notes || ''}
                  placeholder="Verifique com seu contador a alíquota correta do seu regime."
                  onChange={e => set({ tax_notes: e.target.value })} />
              </Field>
            </div>
          </div>
        </div>

        {/* ═══ COLUNA DIREITA ═══ */}
        <div className="space-y-4">
          {/* RESUMO DO CÁLCULO */}
          <div className={`card overflow-hidden transition-shadow ${flash ? 'ring-2 ring-primary-400' : ''}`}>
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center gap-2">
              <Calculator size={15} /> <span className="font-semibold text-sm">RESUMO DO CÁLCULO</span>
            </div>
            <div className="p-4 space-y-1.5 text-sm">
              {resumoRows.map(([label, v]) => (
                <div key={label} className="flex justify-between">
                  <span className="text-gray-500">{label}</span>
                  <span className="font-medium text-gray-900">{fmtBRL4(v)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-1.5 border-t border-gray-200">
                <span className="text-gray-600 font-medium">Subtotal de Custos</span>
                <span className="font-bold">{fmtBRL4(calc.subtotal)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Impostos (%)</span>
                <input className="input text-sm py-0.5 w-20 text-right bg-amber-50 border-amber-300"
                  inputMode="decimal" value={sheet.tax_pct}
                  onChange={e => set({ tax_pct: e.target.value })} />
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Valor do Imposto (unit.)</span>
                <span className="font-medium">{fmtBRL4(calc.tax_unit)}</span>
              </div>
              <div className="flex justify-between pt-1.5 border-t-2 border-gray-300">
                <span className="font-bold text-gray-900">CUSTO TOTAL UNITÁRIO</span>
                <span className="font-bold text-gray-900">{fmtBRL4(calc.cost_unit)}</span>
              </div>
            </div>
            {/* PREÇO DE VENDA SUGERIDO */}
            <div className="mx-4 mb-4 rounded-xl border-2 border-green-500 bg-green-50 p-3 text-center">
              <p className="text-xs font-bold text-green-700 tracking-wide">PREÇO DE VENDA SUGERIDO</p>
              <p className="text-3xl font-extrabold text-green-700 mt-1">{fmtBRL(calc.price_ideal)}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
                {[
                  ['Mínimo', 'margin_min_pct', calc.price_min, 'text-amber-700'],
                  ['Premium', 'margin_premium_pct', calc.price_premium, 'text-violet-700'],
                ].map(([label, key, price, cls]) => (
                  <div key={key} className="rounded-lg bg-white border border-green-200 p-2">
                    <div className="flex items-center justify-center gap-1 text-[11px] text-gray-500">
                      {label} · margem
                      <input className="w-10 text-right border-b border-dashed border-gray-300 bg-transparent focus:outline-none"
                        inputMode="decimal" value={sheet[key]}
                        onChange={e => set({ [key]: e.target.value })} />%
                    </div>
                    <p className={`font-bold ${cls}`}>{fmtBRL(price)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SIMULADOR RÁPIDO */}
          <div className="card overflow-hidden">
            <div className="bg-primary-700 text-white px-4 py-2.5 flex items-center gap-2">
              <Rocket size={15} /> <span className="font-semibold text-sm">SIMULADOR RÁPIDO</span>
            </div>
            <div className="p-4 space-y-2 text-sm">
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Margem de Lucro Desejada (%)</span>
                <input className="input text-sm py-0.5 w-20 text-right" inputMode="decimal"
                  value={sheet.margin_ideal_pct}
                  onChange={e => { set({ margin_ideal_pct: e.target.value }); setSimPrice(''); }} />
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Preço de Venda (unit.)</span>
                <input className="input text-sm py-0.5 w-24 text-right" inputMode="decimal"
                  value={simPrice === '' ? (calc.price_ideal ? calc.price_ideal.toFixed(2).replace('.', ',') : '') : simPrice}
                  onChange={e => setSimPrice(e.target.value)} />
              </div>
              {simPrice !== '' && (
                <p className="text-[11px] text-right text-gray-400">
                  Margem efetiva com este preço: <b className={sim.margemEfetiva >= 0 ? 'text-green-600' : 'text-red-600'}>{sim.margemEfetiva.toFixed(1)}%</b>
                </p>
              )}
              <div className="pt-2 border-t border-gray-100 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-gray-500">Faturamento (Qtd. Informada)</span>
                  <span className="font-semibold">{fmtBRL(sim.faturamento)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Impostos (Total)</span>
                  <span className="font-medium text-amber-700">{fmtBRL(sim.impostos)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Lucro Bruto (Total)</span>
                  <span className="font-semibold">{fmtBRL(sim.lucroBruto)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-gray-200">
                  <span className="font-semibold text-gray-800">Lucro Líquido Estimado</span>
                  <span className={`font-bold ${sim.lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmtBRL(sim.lucroLiquido)}</span>
                </div>
              </div>
              <div className="pt-2">
                <Link to="/pricing/simulador" className="text-xs text-primary-600 hover:underline flex items-center gap-1">
                  <Plus size={12} /> Simulação completa (cenários de quantidade e margem)
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
