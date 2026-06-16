import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2, X, Palette, Image as ImageIcon, Upload, Camera } from 'lucide-react';
import PrintPricingEditor, { cleanPrintPricing } from './PrintPricingEditor';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const emptyTier = () => ({ min_qty: '', max_qty: '', price: '' });

// Editor de lista por chips (cores / bordas / volumes)
function ChipEditor({ label, items, onChange, placeholder }) {
  const [val, setVal] = useState('');
  const add = () => {
    const v = val.trim().toUpperCase();
    if (!v) return;
    if (!items.some(i => i.toUpperCase() === v)) onChange([...items, v]);
    setVal('');
  };
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="label mb-0">{label}</label>
        <span className="text-xs text-gray-400">{items.length}</span>
      </div>
      <div className="flex gap-2 mb-2">
        <input className="input flex-1" value={val} placeholder={placeholder}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" onClick={add} className="btn-secondary"><Plus size={15} /></button>
      </div>
      {items.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
          {items.map((it, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-medium pl-2.5 pr-1 py-1 rounded-full">
              {it}
              <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))}
                className="text-gray-400 hover:text-red-500 rounded-full"><X size={13} /></button>
            </span>
          ))}
        </div>
      ) : <p className="text-xs text-gray-400">Nenhuma opção.</p>}
    </div>
  );
}

export default function ProductForm({ product, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: '', code: '', ean: '', category_id: '',
    cost_price: '', sale_price: '', min_stock: '', min_order_qty: '',
    ncm: '', cst: '', cfop: '', is_active: true,
    supplier_id: '',
    // Produto Acabado
    height: '', weight: '', thickness: '',
    base_circumference: '', mouth_circumference: '',
    // Impresso
    length: '', width: '',
  });
  const [priceTiers, setPriceTiers] = useState([]);
  const [printPricing, setPrintPricing] = useState({});
  const [variations, setVariations] = useState({ colors: [], borders: [], volumes: [] });
  const [mainImage, setMainImage] = useState(null);   // url ou dataURL
  const [varImages, setVarImages] = useState({});     // { cor: url|dataURL }
  const [loading, setLoading] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=200&is_active=true'),
  });
  const suppliers = suppliersData?.data || [];

  const selectedCat = categories.find(c => c.id === form.category_id);
  const catName = selectedCat?.name?.toUpperCase() || '';
  const isProdutoAcabado = catName === 'PRODUTO ACABADO';
  const isImpresso = catName === 'IMPRESSOS';

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        code: product.code || '',
        ean: product.ean || '',
        category_id: product.category_id || '',
        cost_price: product.cost_price || '',
        sale_price: product.sale_price || '',
        min_stock: product.min_stock || '',
        min_order_qty: product.min_order_qty || '',
        ncm: product.ncm || '',
        cst: product.cst || '',
        cfop: product.cfop || '',
        is_active: product.is_active !== false,
        supplier_id: product.supplier_id || '',
        height: product.height || '',
        weight: product.weight || '',
        thickness: product.thickness || '',
        base_circumference: product.base_circumference || '',
        mouth_circumference: product.mouth_circumference || '',
        length: product.length || '',
        width: product.width || '',
      });
      setPriceTiers(Array.isArray(product.price_tiers) ? product.price_tiers : []);
      setPrintPricing(product.print_pricing && typeof product.print_pricing === 'object' ? product.print_pricing : {});
      const v = product.variations && typeof product.variations === 'object' ? product.variations : {};
      setVariations({ colors: v.colors || [], borders: v.borders || [], volumes: v.volumes || [] });
      setMainImage(product.image_url || null);
      setVarImages(product.variation_images && typeof product.variation_images === 'object' ? product.variation_images : {});
    } else {
      setPrintPricing({});
      setVariations({ colors: [], borders: [], volumes: [] });
      setMainImage(null); setVarImages({});
      const defaultCat = categories.find(c => c.name?.toUpperCase() === 'PRODUTO ACABADO');
      if (defaultCat) setForm(prev => ({ ...prev, category_id: defaultCat.id }));
    }
  }, [product, categories]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  function addTier() {
    setPriceTiers(prev => [...prev, emptyTier()]);
  }

  function removeTier(idx) {
    setPriceTiers(prev => prev.filter((_, i) => i !== idx));
  }

  function setTier(idx, field, value) {
    setPriceTiers(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t));
  }

  async function pickImage(file, cb) {
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 8MB)'); return; }
    cb(await fileToDataUrl(file));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { toast.error('Nome do produto é obrigatório'); return; }

    // Valida faixas de preço
    for (const tier of priceTiers) {
      if (!tier.min_qty || !tier.price) {
        toast.error('Preencha quantidade mínima e preço em todas as faixas');
        return;
      }
    }

    setLoading(true);
    try {
      const payload = {
        ...form,
        name: form.name.toUpperCase(),
        cost_price: parseFloat(form.cost_price) || 0,
        sale_price: parseFloat(form.sale_price) || 0,
        min_stock: parseFloat(form.min_stock) || 0,
        category_id: form.category_id || null,
        supplier_id: form.supplier_id || null,
        height: parseFloat(form.height) || null,
        weight: parseFloat(form.weight) || null,
        thickness: parseFloat(form.thickness) || null,
        base_circumference: parseFloat(form.base_circumference) || null,
        mouth_circumference: parseFloat(form.mouth_circumference) || null,
        length: parseFloat(form.length) || null,
        width: parseFloat(form.width) || null,
        price_tiers: priceTiers.map(t => ({
          min_qty: parseInt(t.min_qty) || 0,
          max_qty: t.max_qty ? parseInt(t.max_qty) : null,
          price: parseFloat(t.price) || 0,
        })),
        print_pricing: cleanPrintPricing(printPricing),
        variations: {
          colors:  [...new Set((variations.colors  || []).map(s => String(s).trim().toUpperCase()).filter(Boolean))],
          borders: [...new Set((variations.borders || []).map(s => String(s).trim().toUpperCase()).filter(Boolean))],
          volumes: [...new Set((variations.volumes || []).map(s => String(s).trim().toUpperCase()).filter(Boolean))],
        },
        image: mainImage ?? '',
        variation_images: varImages,
      };

      if (product?.id) {
        await api.put(`/products/${product.id}`, payload);
        toast.success('Produto atualizado com sucesso!');
      } else {
        await api.post('/products', payload);
        toast.success('Produto cadastrado com sucesso!');
      }
      onSaved();
    } catch (err) {
      toast.error(err.error || 'Erro ao salvar produto');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identificação */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Nome do Produto *</label>
          <input
            className="input uppercase"
            value={form.name}
            onChange={e => set('name', e.target.value.toUpperCase())}
            placeholder="EX: COPO LONG DRINK 400ML"
          />
        </div>
        <div>
          <label className="label">ID (código do produto)</label>
          <input className="input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="0001" />
        </div>
        <div>
          <label className="label">EAN / Código de Barras</label>
          <input className="input" value={form.ean} onChange={e => set('ean', e.target.value)} placeholder="7891234567890" />
        </div>
        <div>
          <label className="label">Categoria</label>
          <select className="input" value={form.category_id} onChange={e => set('category_id', e.target.value)}>
            <option value="">Sem categoria</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">Fornecedor</label>
          <select className="input" value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
            <option value="">Sem fornecedor</option>
            {suppliers.map(s => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Preços base */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Preço de Custo (R$)</label>
          <input type="number" step="0.01" min="0" className="input"
            value={form.cost_price} onChange={e => set('cost_price', e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="label">Preço de Venda (R$)</label>
          <input type="number" step="0.01" min="0" className="input"
            value={form.sale_price} onChange={e => set('sale_price', e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="label">Estoque Mínimo</label>
          <input type="number" step="1" min="0" className="input"
            value={form.min_stock} onChange={e => set('min_stock', e.target.value)} placeholder="0" />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Qtd. mínima de pedido (loja)</label>
          <input type="number" step="1" min="1" className="input"
            value={form.min_order_qty} onChange={e => set('min_order_qty', e.target.value)} placeholder="1" />
          <p className="text-xs text-gray-400 mt-1">Mínimo que o cliente pode pedir na loja.</p>
        </div>
      </div>

      {/* Faixas de preço por quantidade */}
      <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-800">
            💰 Faixas de Preço por Quantidade
          </p>
          <button
            type="button"
            onClick={addTier}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Plus size={13} /> Adicionar faixa
          </button>
        </div>

        {priceTiers.length === 0 && (
          <p className="text-xs text-blue-500 text-center py-2">
            Sem faixas de preço. O preço de venda padrão será usado.
          </p>
        )}

        {priceTiers.map((tier, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-blue-100 px-3 py-2">
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-xs text-gray-500 whitespace-nowrap">De</span>
              <input
                type="number" min="0" step="1" className="input py-1 text-sm w-20 text-center"
                placeholder="Qtd mín"
                value={tier.min_qty}
                onChange={e => setTier(idx, 'min_qty', e.target.value)}
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">até</span>
              <input
                type="number" min="0" step="1" className="input py-1 text-sm w-20 text-center"
                placeholder="Qtd máx"
                value={tier.max_qty}
                onChange={e => setTier(idx, 'max_qty', e.target.value)}
              />
              <span className="text-xs text-gray-500 whitespace-nowrap">unid. →</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">R$</span>
                <input
                  type="number" min="0" step="0.01" className="input py-1 text-sm w-24"
                  placeholder="0,00"
                  value={tier.price}
                  onChange={e => setTier(idx, 'price', e.target.value)}
                />
              </div>
            </div>
            <button type="button" onClick={() => removeTier(idx)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Preço por tipo de impressão (loja) */}
      <PrintPricingEditor value={printPricing} onChange={setPrintPricing} />

      {/* Campos dimensionais — PRODUTO ACABADO */}
      {isProdutoAcabado && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">📦 Dimensões do Produto Acabado</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">Altura (mm)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.height} onChange={e => set('height', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Peso (g)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Espessura (mm)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.thickness} onChange={e => set('thickness', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Circunf. da Base (mm)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.base_circumference} onChange={e => set('base_circumference', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Circunf. da Boca (mm)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.mouth_circumference} onChange={e => set('mouth_circumference', e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
      )}

      {/* Campos dimensionais — IMPRESSO */}
      {isImpresso && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">🖨️ Dimensões do Impresso</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Comprimento (mm)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.length} onChange={e => set('length', e.target.value)} placeholder="0" />
            </div>
            <div>
              <label className="label">Largura (mm)</label>
              <input type="number" step="0.001" min="0" className="input"
                value={form.width} onChange={e => set('width', e.target.value)} placeholder="0" />
            </div>
          </div>
        </div>
      )}

      {/* Dados fiscais */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
          Dados Fiscais (NCM, CST, CFOP)
        </summary>
        <div className="px-4 pb-4 grid grid-cols-3 gap-4 mt-3">
          <div>
            <label className="label">NCM</label>
            <input className="input" value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="00000000" maxLength={8} />
          </div>
          <div>
            <label className="label">CST / CSOSN</label>
            <input className="input" value={form.cst} onChange={e => set('cst', e.target.value)} placeholder="000" maxLength={4} />
          </div>
          <div>
            <label className="label">CFOP</label>
            <input className="input" value={form.cfop} onChange={e => set('cfop', e.target.value)} placeholder="5102" maxLength={4} />
          </div>
        </div>
      </details>

      {/* Foto principal do produto (loja) */}
      <div>
        <label className="label flex items-center gap-1.5"><ImageIcon size={14} className="text-primary-500" /> Foto do produto (aparece na loja)</label>
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 rounded-xl bg-gray-100 border border-gray-200 overflow-hidden flex items-center justify-center shrink-0">
            {mainImage ? <img src={mainImage} alt="" className="w-full h-full object-cover" /> : <ImageIcon size={22} className="text-gray-300" />}
          </div>
          <label className="btn-secondary cursor-pointer">
            <Upload size={15} /> {mainImage ? 'Trocar foto' : 'Enviar foto'}
            <input type="file" accept="image/*" className="hidden" onChange={e => { pickImage(e.target.files?.[0], setMainImage); e.target.value = ''; }} />
          </label>
          {mainImage && <button type="button" onClick={() => setMainImage('')} className="text-xs text-red-500 hover:text-red-600">Remover</button>}
        </div>
      </div>

      {/* Variações (cores / bordas / volumes) */}
      <details className="border border-gray-200 rounded-lg" open={(variations.colors.length + variations.borders.length) > 0}>
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg select-none flex items-center gap-2">
          <Palette size={15} className="text-pink-500" />
          Variações — cores e bordas
          <span className="text-gray-400 font-normal">
            ({variations.colors.length} cores · {variations.borders.length} bordas)
          </span>
        </summary>
        <div className="px-4 pb-4 grid sm:grid-cols-2 gap-5 mt-2">
          {(variations.colors.length + variations.borders.length) === 0 && (
            <p className="sm:col-span-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
              Sem variações ainda. Use <b>Produtos → Importar Catálogo</b> para puxar todas as cores e bordas
              automaticamente, ou adicione manualmente abaixo.
            </p>
          )}
          <ChipEditor label="Cores disponíveis" items={variations.colors} placeholder="Ex.: AZUL TIFANNY"
            onChange={v => setVariations(s => ({ ...s, colors: v }))} />
          <ChipEditor label="Bordas disponíveis" items={variations.borders} placeholder="Ex.: BORDA METALIZADA DOURADO"
            onChange={v => setVariations(s => ({ ...s, borders: v }))} />
          <div className="sm:col-span-2">
            <ChipEditor label="Volumes" items={variations.volumes} placeholder="Ex.: 350 ML"
              onChange={v => setVariations(s => ({ ...s, volumes: v }))} />
          </div>

          {/* Foto por cor — a loja troca a imagem ao selecionar */}
          {variations.colors.length > 0 && (
            <div className="sm:col-span-2">
              <label className="label flex items-center gap-1.5"><Camera size={14} className="text-pink-500" /> Foto por cor (a loja troca ao selecionar)</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto pr-1">
                {variations.colors.map(c => (
                  <div key={c} className="flex items-center gap-2 border border-gray-200 rounded-lg p-1.5">
                    <label className="w-11 h-11 rounded bg-gray-100 overflow-hidden flex items-center justify-center shrink-0 cursor-pointer hover:ring-2 hover:ring-primary-300" title="Enviar foto desta cor">
                      {varImages[c] ? <img src={varImages[c]} alt="" className="w-full h-full object-cover" /> : <Camera size={15} className="text-gray-300" />}
                      <input type="file" accept="image/*" className="hidden" onChange={e => { pickImage(e.target.files?.[0], d => setVarImages(s => ({ ...s, [c]: d }))); e.target.value = ''; }} />
                    </label>
                    <span className="text-xs text-gray-700 truncate flex-1">{c}</span>
                    {varImages[c] && (
                      <button type="button" onClick={() => setVarImages(s => { const n = { ...s }; delete n[c]; return n; })}
                        className="text-gray-300 hover:text-red-500" title="Remover foto"><X size={13} /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </details>

      {/* Status */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={form.is_active}
          onChange={e => set('is_active', e.target.checked)}
          className="w-4 h-4 text-primary-600 rounded" />
        <span className="text-sm text-gray-700">Produto ativo</span>
      </label>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar Produto'}
        </button>
      </div>
    </form>
  );
}
