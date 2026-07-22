import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, Pencil, Trash2, X, Save, Search, FlaskConical, Package,
  Users, LineChart, AlertTriangle, Clock, TrendingUp, TrendingDown, Star,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL } from '@/lib/pricingCalc';

const CATEGORIES = ['Tintas', 'Solventes', 'Thinner', 'Emulsão', 'Telas / Poliéster', 'Vegetal', 'Recuperador', 'Fita', 'Embalagem', 'Caixa', 'Rótulo', 'Outros'];
const UNITS = ['ml', 'l', 'g', 'kg', 'm', 'm²', 'un', 'folha'];

// Máscara de dinheiro: dígitos = reais com ponto de milhar; vírgula manual
const fmtMoney = v => {
  let s = String(v ?? '').replace(/[^\d,]/g, '');
  const i = s.indexOf(',');
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/,/g, '');
  let [int, dec] = s.split(',');
  int = int.replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return dec != null ? `${int},${dec.slice(0, 2)}` : int;
};
const money = s => { const n = parseFloat(String(s ?? '').replace(/\./g, '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const numOf = s => { const n = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? n : NaN; };
const fmt6 = v => Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 6 });
const pctBR = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const dtBR = iso => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const COST_SOURCE = {
  manual: { label: 'Manual', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  compra: { label: 'Compra', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  nfe: { label: 'NF-e', cls: 'bg-teal-50 text-teal-700 border-teal-200' },
};

// ─── Modal: fornecedores do insumo ─────────────────────────
function FornecedoresModal({ insumo, suppliers, onClose }) {
  const qc = useQueryClient();
  const [novo, setNovo] = useState(null);

  const { data: lista = [], isLoading } = useQuery({
    queryKey: ['insumo-fornecedores', insumo?.id],
    queryFn: () => api.get(`/insumos/${insumo.id}/fornecedores`),
    enabled: !!insumo?.id,
  });

  async function salvar() {
    if (!(numOf(novo.package_qty) > 0)) { toast.error('Informe a quantidade da embalagem'); return; }
    try {
      await api.post(`/insumos/${insumo.id}/fornecedores`, {
        supplier_id: novo.supplier_id || null,
        supplier_name: novo.supplier_name || null,
        package_qty: numOf(novo.package_qty),
        package_price: money(novo.package_price) || 0,
        lead_time_days: novo.lead_time_days || null,
        is_default: !!novo.is_default,
      });
      toast.success('Fornecedor adicionado!');
      setNovo(null);
      qc.invalidateQueries({ queryKey: ['insumo-fornecedores', insumo.id] });
      qc.invalidateQueries({ queryKey: ['insumos'] });
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
  }

  async function remover(f) {
    if (!confirm(`Remover o fornecedor "${f.supplier}"?`)) return;
    try {
      await api.delete(`/insumos/${insumo.id}/fornecedores/${f.id}`);
      qc.invalidateQueries({ queryKey: ['insumo-fornecedores', insumo.id] });
    } catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  return (
    <Modal isOpen={!!insumo} onClose={onClose} title={`Fornecedores — ${insumo?.name || ''}`} size="lg">
      <div className="space-y-3 text-sm">
        <p className="text-xs text-gray-500">
          O fornecedor marcado como <b>padrão</b> define o custo usado na precificação. Os demais ficam para cotação.
        </p>

        {isLoading ? <div className="py-6 text-center text-gray-400">Carregando...</div> : (
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase text-gray-500 bg-gray-50">
                  <th className="px-3 py-2">Fornecedor</th>
                  <th className="px-3 py-2 text-right">Embalagem</th>
                  <th className="px-3 py-2 text-right">Preço</th>
                  <th className="px-3 py-2 text-right">Custo/un</th>
                  <th className="px-3 py-2 text-right">Prazo</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lista.map(f => (
                  <tr key={f.id} className={`border-t border-gray-100 ${f.is_default ? 'bg-primary-50/40' : ''}`}>
                    <td className="px-3 py-2 font-medium text-gray-900">
                      {f.is_default && <Star size={11} className="inline text-primary-600 mr-1" />}
                      {f.supplier}
                    </td>
                    <td className="px-3 py-2 text-right">{fmt6(f.package_qty)} {insumo?.base_unit}</td>
                    <td className="px-3 py-2 text-right">{fmtBRL(f.package_price)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-green-700">{fmtBRL(f.unit_cost)}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{f.lead_time_days ? `${f.lead_time_days}d` : '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <button className="btn-ghost p-1 text-red-500" onClick={() => remover(f)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                ))}
                {lista.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">
                    Nenhum fornecedor extra. O do cadastro principal continua valendo.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {novo ? (
          <div className="rounded-xl border border-primary-200 bg-primary-50/30 p-3 space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Fornecedor</label>
                <select className="input" value={novo.supplier_id || ''} onChange={e => setNovo({ ...novo, supplier_id: e.target.value })}>
                  <option value="">— digitar —</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Nome (se não cadastrado)</label>
                <input className="input" value={novo.supplier_name || ''} disabled={!!novo.supplier_id}
                  onChange={e => setNovo({ ...novo, supplier_name: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">Embalagem ({insumo?.base_unit})</label>
                <input className="input" inputMode="decimal" value={novo.package_qty || ''}
                  onChange={e => setNovo({ ...novo, package_qty: e.target.value.replace(/[^\d,.]/g, '') })} />
              </div>
              <div>
                <label className="label">Preço (R$)</label>
                <input className="input" inputMode="decimal" value={novo.package_price || ''}
                  onChange={e => setNovo({ ...novo, package_price: fmtMoney(e.target.value) })} />
              </div>
              <div>
                <label className="label">Prazo (dias)</label>
                <input type="number" min="0" className="input" value={novo.lead_time_days || ''}
                  onChange={e => setNovo({ ...novo, lead_time_days: e.target.value })} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
              <input type="checkbox" checked={!!novo.is_default} onChange={e => setNovo({ ...novo, is_default: e.target.checked })} />
              Definir como fornecedor padrão (passa a valer como custo do insumo)
            </label>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="btn-primary btn-sm" onClick={salvar}><Save size={13} /> Adicionar</button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary w-full" onClick={() => setNovo({})}>
            <Plus size={14} /> Adicionar fornecedor
          </button>
        )}

        <div className="flex justify-end pt-2 border-t">
          <button className="btn-secondary" onClick={onClose}><X size={14} /> Fechar</button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal: histórico de preço ─────────────────────────────
function HistoricoModal({ insumo, onClose }) {
  const { data: precos = [], isLoading } = useQuery({
    queryKey: ['insumo-precos', insumo?.id],
    queryFn: () => api.get(`/insumos/${insumo.id}/precos`),
    enabled: !!insumo?.id,
  });

  return (
    <Modal isOpen={!!insumo} onClose={onClose} title={`Histórico de preço — ${insumo?.name || ''}`} size="lg">
      <div className="space-y-3 text-sm">
        {isLoading ? <div className="py-6 text-center text-gray-400">Carregando...</div> : precos.length === 0 ? (
          <p className="py-6 text-center text-gray-400">Nenhum registro ainda. Toda alteração de preço passa a ser registrada aqui.</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {[
                ['Atual', precos[0]?.unit_cost],
                ['Menor', Math.min(...precos.map(p => Number(p.unit_cost) || 0))],
                ['Maior', Math.max(...precos.map(p => Number(p.unit_cost) || 0))],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-gray-50 px-3 py-2 text-center">
                  <p className="text-[11px] text-gray-500 uppercase">{l}</p>
                  <p className="font-bold text-gray-900">{fmtBRL(v)}</p>
                </div>
              ))}
            </div>
            <div className="rounded-xl border border-gray-200 overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-left text-[11px] uppercase text-gray-500">
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Fornecedor</th>
                    <th className="px-3 py-2">Origem</th>
                    <th className="px-3 py-2 text-right">Embalagem</th>
                    <th className="px-3 py-2 text-right">Custo/un</th>
                    <th className="px-3 py-2 text-right">Variação</th>
                  </tr>
                </thead>
                <tbody>
                  {precos.map(p => (
                    <tr key={p.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{dtBR(p.created_at)}</td>
                      <td className="px-3 py-2 text-gray-500">{p.supplier_name || '—'}</td>
                      <td className="px-3 py-2">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${(COST_SOURCE[p.source] || COST_SOURCE.manual).cls}`}>
                          {(COST_SOURCE[p.source] || COST_SOURCE.manual).label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">{fmt6(p.package_qty)} × {fmtBRL(p.package_price)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{fmtBRL(p.unit_cost)}</td>
                      <td className="px-3 py-2 text-right">
                        {p.variacao_pct == null ? <span className="text-gray-300">—</span> : (
                          <span className={`inline-flex items-center gap-0.5 ${p.variacao_pct > 0 ? 'text-red-600' : p.variacao_pct < 0 ? 'text-green-600' : 'text-gray-500'}`}>
                            {p.variacao_pct > 0 ? <TrendingUp size={11} /> : p.variacao_pct < 0 ? <TrendingDown size={11} /> : null}
                            {p.variacao_pct > 0 ? '+' : ''}{pctBR(p.variacao_pct)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="flex justify-end pt-2 border-t">
          <button className="btn-secondary" onClick={onClose}><X size={14} /> Fechar</button>
        </div>
      </div>
    </Modal>
  );
}

function InsumoModal({ open, initial, suppliers, products, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);

  const f = form || {
    category: initial?.category || 'Tintas',
    name: initial?.name || '',
    supplier_id: initial?.supplier_id || '',
    supplier_name: initial?.supplier_name || '',
    base_unit: initial?.base_unit || 'ml',
    package_qty: initial?.package_qty != null ? String(initial.package_qty).replace('.', ',') : '',
    package_price: initial?.package_price != null ? Number(initial.package_price).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '',
    cost_method: initial?.cost_method || 'consumo',
    consumption: initial?.consumption != null && initial.consumption !== 0 ? String(initial.consumption).replace('.', ',') : '',
    lifespan: initial?.lifespan != null && initial.lifespan !== 0 ? String(initial.lifespan).replace('.', ',') : '',
    min_stock: initial?.min_stock != null && initial.min_stock !== 0 ? String(initial.min_stock).replace('.', ',') : '',
    product_id: initial?.product_id || '',
    cost_source: initial?.cost_source || 'manual',
    notes: initial?.notes || '',
  };
  const set = patch => setForm({ ...f, ...patch });

  // Prévia do custo
  const qty = money(f.package_qty) || numOf(f.package_qty) || 0;
  const price = money(f.package_price) || 0;
  const unitCost = qty > 0 ? price / qty : 0;
  const cpp = f.cost_method === 'vida_util'
    ? (numOf(f.lifespan) > 0 ? price / numOf(f.lifespan) : 0)
    : unitCost * (numOf(f.consumption) || 0);

  async function save() {
    if (!f.name.trim()) { toast.error('Informe o nome do insumo'); return; }
    if (!(qty > 0)) { toast.error('Informe o volume/quantidade da embalagem'); return; }
    setSaving(true);
    try {
      const payload = {
        category: f.category, name: f.name.trim(),
        supplier_id: f.supplier_id || null,
        supplier_name: f.supplier_id ? null : (f.supplier_name || null),
        base_unit: f.base_unit,
        package_qty: numOf(f.package_qty),
        package_price: money(f.package_price) || 0,
        cost_method: f.cost_method,
        consumption: numOf(f.consumption) || 0,
        lifespan: numOf(f.lifespan) || 0,
        min_stock: numOf(f.min_stock) || 0,
        product_id: f.product_id || null,
        cost_source: f.cost_source,
        notes: f.notes,
      };
      if (isEdit) await api.put(`/insumos/${initial.id}`, payload);
      else await api.post('/insumos', payload);
      toast.success(isEdit ? 'Insumo atualizado!' : 'Insumo cadastrado!');
      setForm(null); onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  return (
    <Modal isOpen={open} onClose={() => { setForm(null); onClose(); }}
      title={isEdit ? 'Editar insumo' : 'Novo insumo'} size="md">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Categoria</label>
            <select className="input" value={f.category} onChange={e => set({ category: e.target.value })}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Nome do insumo *</label>
            <input className="input" value={f.name} placeholder="Ex.: Acrisolv Azul" onChange={e => set({ name: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Fornecedor</label>
            <select className="input" value={f.supplier_id} onChange={e => set({ supplier_id: e.target.value })}>
              <option value="">— (digitar abaixo) —</option>
              {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{f.supplier_id ? 'Fornecedor selecionado' : 'Fornecedor (texto livre)'}</label>
            <input className="input" value={f.supplier_name} disabled={!!f.supplier_id} placeholder="Ex.: Bruni"
              onChange={e => set({ supplier_name: e.target.value })} />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Unidade base</label>
            <select className="input" value={f.base_unit} onChange={e => set({ base_unit: e.target.value })}>
              {UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Embalagem ({f.base_unit})</label>
            <input className="input" inputMode="decimal" value={f.package_qty} placeholder="900"
              onChange={e => set({ package_qty: e.target.value.replace(/[^\d,.]/g, '') })} />
          </div>
          <div>
            <label className="label">Valor pago (R$)</label>
            <input className="input" inputMode="decimal" value={f.package_price} placeholder="180,00"
              onChange={e => set({ package_price: fmtMoney(e.target.value) })} />
          </div>
        </div>

        <div>
          <label className="label">Como entra no custo do produto</label>
          <div className="flex gap-2">
            {[['consumo', 'Por consumo (ml/g por peça)'], ['vida_util', 'Por vida útil (nº de impressões/usos)']].map(([k, l]) => (
              <button key={k} type="button" onClick={() => set({ cost_method: k })}
                className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  f.cost_method === k ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>

        {f.cost_method === 'consumo' ? (
          <div>
            <label className="label">Consumo médio por peça ({f.base_unit})</label>
            <input className="input" inputMode="decimal" value={f.consumption} placeholder="0,18"
              onChange={e => set({ consumption: e.target.value.replace(/[^\d,.]/g, '') })} />
          </div>
        ) : (
          <div>
            <label className="label">Vida útil (nº de impressões / usos)</label>
            <input className="input" inputMode="decimal" value={f.lifespan} placeholder="1500"
              onChange={e => set({ lifespan: e.target.value.replace(/[^\d,.]/g, '') })} />
          </div>
        )}

        {/* Estoque e integração com Compras/Estoque */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Estoque mínimo ({f.base_unit})</label>
            <input className="input" inputMode="decimal" value={f.min_stock} placeholder="0"
              onChange={e => set({ min_stock: e.target.value.replace(/[^\d,.]/g, '') })} />
            <p className="text-[11px] text-gray-400 mt-1">Abaixo disso, o insumo entra no alerta de reposição.</p>
          </div>
          <div>
            <label className="label">Produto vinculado (Compras/Estoque)</label>
            <select className="input" value={f.product_id} onChange={e => set({ product_id: e.target.value })}>
              <option value="">— sem vínculo —</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <p className="text-[11px] text-gray-400 mt-1">
              Vincule para o insumo herdar saldo em estoque e o preço da última compra.
            </p>
          </div>
        </div>

        <div>
          <label className="label">Origem do custo</label>
          <div className="flex gap-2">
            {Object.entries(COST_SOURCE).map(([k, v]) => (
              <button key={k} type="button" onClick={() => set({ cost_source: k })}
                className={`flex-1 px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  f.cost_source === k ? 'border-primary-500 bg-primary-50 text-primary-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prévia do custo */}
        <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Custo por {f.base_unit}</span>
            <span className="font-medium">{fmtBRL(unitCost)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Custo por peça</span>
            <span className="font-bold text-green-700">{fmtBRL(cpp)}</span>
          </div>
        </div>

        <div>
          <label className="label">Observações</label>
          <input className="input" value={f.notes} onChange={e => set({ notes: e.target.value })} />
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <button className="btn-secondary" onClick={() => { setForm(null); onClose(); }}><X size={14} /> Cancelar</button>
          <button className="btn-primary" disabled={saving} onClick={save}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function Insumos() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState('');
  const [fCat, setFCat] = useState('');
  const [soRepor, setSoRepor] = useState(false);
  const [fornModal, setFornModal] = useState(null);
  const [histModal, setHistModal] = useState(null);

  const { data: insumos = [], isLoading } = useQuery({
    queryKey: ['insumos'],
    queryFn: () => api.get('/insumos'),
  });
  const { data: suppliers = [] } = useQuery({
    queryKey: ['suppliers-min'],
    queryFn: () => api.get('/suppliers?limit=500').then(d => (Array.isArray(d) ? d : d.data || [])),
  });
  const { data: productsRes } = useQuery({
    queryKey: ['pricing-products'],
    queryFn: () => api.get('/products?limit=1000'),
  });
  const products = productsRes?.data || [];

  const rows = useMemo(() => {
    const s = search.trim().toLowerCase();
    return insumos
      .filter(i => !fCat || i.category === fCat)
      .filter(i => !soRepor || i.precisa_repor)
      .filter(i => !s || (i.name || '').toLowerCase().includes(s) || (i.supplier || '').toLowerCase().includes(s));
  }, [insumos, search, fCat, soRepor]);

  const repor = insumos.filter(i => i.precisa_repor);

  const cats = useMemo(() => [...new Set(insumos.map(i => i.category))], [insumos]);

  async function remove(i) {
    if (!confirm(`Remover o insumo "${i.name}"?`)) return;
    try { await api.delete(`/insumos/${i.id}`); toast.success('Insumo removido'); qc.invalidateQueries({ queryKey: ['insumos'] }); }
    catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title flex items-center gap-2"><FlaskConical size={20} className="text-primary-600" /> Insumos</h1>
          <p className="text-sm text-gray-500 mt-1">Catálogo central de materiais — custo por unidade e por peça calculados automaticamente.</p>
        </div>
        <button className="btn-primary" onClick={() => setModal({})}><Plus size={15} /> Novo Insumo</button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 py-1.5 text-sm" placeholder="Buscar por nome ou fornecedor..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="input py-1.5 text-sm w-auto" value={fCat} onChange={e => setFCat(e.target.value)}>
          <option value="">Todas as categorias</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={() => setSoRepor(v => !v)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
            soRepor ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
          <AlertTriangle size={13} className="inline mr-1" /> Repor ({repor.length})
        </button>
      </div>

      {/* Alerta de reposição */}
      {repor.length > 0 && !soRepor && (
        <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <AlertTriangle size={16} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="text-sm flex-1">
            <p className="font-semibold text-amber-800">{repor.length} insumo(s) no estoque mínimo</p>
            <p className="text-xs text-amber-700 mt-0.5">
              {repor.slice(0, 6).map(i => `${i.name} (${fmt6(i.stock)} ${i.base_unit})`).join(' · ')}
              {repor.length > 6 && ` e mais ${repor.length - 6}`}
            </p>
          </div>
          <button className="btn-secondary btn-sm shrink-0" onClick={() => setSoRepor(true)}>Ver</button>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2.5">Insumo</th>
                <th className="px-3 py-2.5">Fornecedor</th>
                <th className="px-3 py-2.5 text-right">Embalagem</th>
                <th className="px-3 py-2.5 text-right">Valor</th>
                <th className="px-3 py-2.5 text-right">Custo / unidade</th>
                <th className="px-3 py-2.5">Método</th>
                <th className="px-3 py-2.5 text-right">Custo / peça</th>
                <th className="px-3 py-2.5 text-right">Estoque</th>
                <th className="px-3 py-2.5">Origem</th>
                <th className="px-3 py-2.5">Atualizado</th>
                <th className="px-3 py-2.5 text-center">Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(i => (
                <tr key={i.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2.5">
                    <span className="block font-medium text-gray-900">{i.name}</span>
                    <span className="text-xs text-gray-400">{i.category}</span>
                  </td>
                  <td className="px-3 py-2.5 text-gray-600">{i.supplier || '—'}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmt6(i.package_qty)} {i.base_unit}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">{fmtBRL(i.package_price)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap text-gray-600">{fmtBRL(i.unit_cost)}<span className="text-xs text-gray-400">/{i.base_unit}</span></td>
                  <td className="px-3 py-2.5">
                    {i.cost_method === 'vida_util'
                      ? <span className="text-xs text-purple-600">Vida útil · {fmt6(i.lifespan)}</span>
                      : <span className="text-xs text-blue-600">Consumo · {fmt6(i.consumption)} {i.base_unit}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right font-semibold text-green-700 whitespace-nowrap">{fmtBRL(i.cost_per_piece)}</td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {i.stock == null ? <span className="text-gray-300" title="Sem produto vinculado">—</span> : (
                      <span className={i.precisa_repor ? 'text-amber-600 font-semibold' : 'text-gray-600'}>
                        {i.precisa_repor && <AlertTriangle size={11} className="inline mr-0.5" />}
                        {fmt6(i.stock)} {i.base_unit}
                        {Number(i.min_stock) > 0 && <span className="block text-[10px] text-gray-400">mín. {fmt6(i.min_stock)}</span>}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${(COST_SOURCE[i.cost_source] || COST_SOURCE.manual).cls}`}>
                      {(COST_SOURCE[i.cost_source] || COST_SOURCE.manual).label}
                    </span>
                    {i.fornecedores_count > 0 && (
                      <span className="block text-[10px] text-gray-400 mt-0.5">{i.fornecedores_count} fornec.</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-gray-500 text-xs whitespace-nowrap">{dtBR(i.updated_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-center gap-1">
                      <button className="btn-ghost p-1.5 text-gray-600" title="Fornecedores" onClick={() => setFornModal(i)}><Users size={14} /></button>
                      <button className="btn-ghost p-1.5 text-gray-600" title="Histórico de preço" onClick={() => setHistModal(i)}><LineChart size={14} /></button>
                      <button className="btn-ghost p-1.5 text-blue-600" title="Editar" onClick={() => setModal(i)}><Pencil size={14} /></button>
                      <button className="btn-ghost p-1.5 text-red-500" title="Excluir" onClick={() => remove(i)}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={11} className="text-center py-12 text-sm text-gray-400">
                  <Package size={28} className="mx-auto mb-2 opacity-30" />
                  {insumos.length === 0 ? 'Nenhum insumo cadastrado — clique em Novo Insumo.' : 'Nenhum insumo para esse filtro.'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        O <b>custo por peça</b> alimenta o Processo de Produção e a Formação de Preço — atualiza o preço de um material aqui e o custo real de todos os produtos que o usam se ajusta.
      </p>

      <InsumoModal open={!!modal} initial={modal || {}} suppliers={suppliers} products={products}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); qc.invalidateQueries({ queryKey: ['insumos'] }); }} />

      {fornModal && <FornecedoresModal insumo={fornModal} suppliers={suppliers} onClose={() => setFornModal(null)} />}
      {histModal && <HistoricoModal insumo={histModal} onClose={() => setHistModal(null)} />}
    </div>
  );
}
