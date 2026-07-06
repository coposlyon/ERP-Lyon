import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Plus, Trash2, Image as ImageIcon, Upload, FolderPlus, Check, X } from 'lucide-react';
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

export default function ProductForm({ product, onSaved, onCancel }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', code: '', ean: '', category_id: '', tipo_id: '',
    cost_price: '', sale_price: '', min_stock: '', min_order_qty: '',
    ncm: '', cst: '', cfop: '', is_active: true, show_in_store: true,
    supplier_id: '',
    height: '', weight: '', thickness: '',
    base_circumference: '', mouth_circumference: '',
    length: '', width: '',
  });
  const [priceTiers, setPriceTiers] = useState([]);
  const [printPricing, setPrintPricing] = useState({});
  const [mainImage, setMainImage] = useState(null);   // url ou dataURL
  const [loading, setLoading] = useState(false);

  // criação de novo tipo (categoria) na hora
  const [creatingType, setCreatingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [confirmDelType, setConfirmDelType] = useState(false);

  // criação de novo tipo de produto do SITE (COPOS, CANECAS...) na hora
  const [creatingTipo, setCreatingTipo] = useState(false);
  const [newTipo, setNewTipo] = useState('');

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  const { data: tipos = [] } = useQuery({
    queryKey: ['product-types'],
    queryFn: () => api.get('/products/types/list'),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=200&is_active=true'),
  });
  const suppliers = suppliersData?.data || [];

  const createType = useMutation({
    mutationFn: (name) => api.post('/products/categories', { name }),
    onSuccess: async (cat) => {
      await qc.invalidateQueries(['categories']);
      set('category_id', cat.id);
      setCreatingType(false); setNewType('');
      toast.success('Tipo criado!');
    },
    onError: (e) => toast.error(e.error || 'Erro ao criar tipo'),
  });

  const createTipo = useMutation({
    mutationFn: (name) => api.post('/products/types', { name }),
    onSuccess: async (tipo) => {
      await qc.invalidateQueries(['product-types']);
      set('tipo_id', tipo.id);
      setCreatingTipo(false); setNewTipo('');
      toast.success('Tipo de produto criado!');
    },
    onError: (e) => toast.error(e.error || 'Erro ao criar tipo de produto'),
  });

  const delType = useMutation({
    mutationFn: (id) => api.delete(`/products/categories/${id}`),
    onSuccess: async (r) => {
      await qc.invalidateQueries(['categories']);
      set('category_id', '');
      setConfirmDelType(false);
      toast.success(`Tipo apagado${r?.products_unlinked ? ` · ${r.products_unlinked} item(ns) ficaram sem tipo` : ''}`);
    },
    onError: (e) => toast.error(e.error || 'Erro ao apagar tipo'),
  });

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
        tipo_id: product.tipo_id || '',
        cost_price: product.cost_price || '',
        sale_price: product.sale_price || '',
        min_stock: product.min_stock || '',
        min_order_qty: product.min_order_qty || '',
        ncm: product.ncm || '',
        cst: product.cst || '',
        cfop: product.cfop || '',
        is_active: product.is_active !== false,
        show_in_store: product.show_in_store !== false,
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
      setMainImage(product.image_url || null);
    } else {
      setPrintPricing({});
      setMainImage(null);
      const defaultCat = categories.find(c => c.name?.toUpperCase() === 'PRODUTO ACABADO');
      if (defaultCat) setForm(prev => ({ ...prev, category_id: defaultCat.id }));
    }
  }, [product, categories]);

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }
  function addTier() { setPriceTiers(prev => [...prev, emptyTier()]); }
  function removeTier(idx) { setPriceTiers(prev => prev.filter((_, i) => i !== idx)); }
  function setTier(idx, field, value) { setPriceTiers(prev => prev.map((t, i) => i === idx ? { ...t, [field]: value } : t)); }

  function confirmNewType() {
    const n = newType.trim().toUpperCase();
    if (!n) return;
    if (categories.some(c => c.name?.toUpperCase() === n)) { toast.error('Esse tipo já existe'); return; }
    createType.mutate(n);
  }

  function confirmNewTipo() {
    const n = newTipo.trim().toUpperCase();
    if (!n) return;
    const existing = tipos.find(t => t.name?.toUpperCase() === n);
    if (existing) { set('tipo_id', existing.id); setCreatingTipo(false); setNewTipo(''); return; }
    createTipo.mutate(n);
  }

  // Cola imagem do clipboard (Ctrl+V) como foto do produto
  function handlePaste(e) {
    const items = e.clipboardData?.items || [];
    for (const item of items) {
      if (item.type?.startsWith('image/')) {
        e.preventDefault();
        pickImage(item.getAsFile(), setMainImage);
        toast.success('Imagem colada como foto do produto!');
        return;
      }
    }
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
        tipo_id: form.tipo_id || null,
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
        image: mainImage ?? '',
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
    <form onSubmit={handleSubmit} onPaste={handlePaste} className="space-y-5">
      {/* Identificação */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">Nome do Produto *</label>
          <input className="input uppercase" value={form.name}
            onChange={e => set('name', e.target.value.toUpperCase())}
            placeholder="EX: COPO LONG DRINK 400ML" />
        </div>
        <div>
          <label className="label">ID (código do produto)</label>
          <input className="input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="0001" />
        </div>
        <div>
          <label className="label">EAN / Código de Barras</label>
          <input className="input" value={form.ean} onChange={e => set('ean', e.target.value)} placeholder="7891234567890" />
        </div>

        {/* Tipo (categoria) + criar novo tipo */}
        <div>
          <label className="label">Tipo do produto</label>
          {creatingType ? (
            <div className="flex gap-2">
              <input className="input uppercase" autoFocus value={newType}
                onChange={e => setNewType(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmNewType(); } if (e.key === 'Escape') { setCreatingType(false); setNewType(''); } }}
                placeholder="NOME DO NOVO TIPO" />
              <button type="button" onClick={confirmNewType} disabled={createType.isPending}
                className="btn-primary px-3" title="Salvar tipo">
                {createType.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              </button>
              <button type="button" onClick={() => { setCreatingType(false); setNewType(''); }}
                className="btn-secondary px-3" title="Cancelar"><X size={15} /></button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <select className="input flex-1" value={form.category_id} onChange={e => { set('category_id', e.target.value); setConfirmDelType(false); }}>
                  <option value="">Sem tipo</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => setCreatingType(true)}
                  className="btn-secondary px-3 whitespace-nowrap" title="Criar novo tipo de produto">
                  <FolderPlus size={15} /> Novo tipo
                </button>
                {form.category_id && (
                  <button type="button" onClick={() => setConfirmDelType(true)}
                    className="btn-secondary px-3 text-red-500 hover:text-red-600" title="Apagar este tipo">
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
              {confirmDelType && selectedCat && (
                <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm">
                  <p className="text-gray-800">Tem certeza que deseja apagar o tipo <b>{selectedCat.name}</b>?</p>
                  <p className="text-gray-600 mt-0.5">
                    Possuem <b>{selectedCat.product_count || 0}</b> {Number(selectedCat.product_count) === 1 ? 'item' : 'itens'} com esse tipo —
                    eles ficarão <b>sem tipo</b> (não serão apagados).
                  </p>
                  <div className="flex justify-end gap-2 mt-2">
                    <button type="button" onClick={() => setConfirmDelType(false)} className="btn-secondary text-xs">Cancelar</button>
                    <button type="button" onClick={() => delType.mutate(form.category_id)} disabled={delType.isPending}
                      className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
                      {delType.isPending ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />} Apagar tipo
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div>
          <label className="label">Fornecedor</label>
          <select className="input" value={form.supplier_id} onChange={e => set('supplier_id', e.target.value)}>
            <option value="">Sem fornecedor</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
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
        <div className="col-span-2">
          <label className="label">Tipo de produto (menu do site)</label>
          {creatingTipo ? (
            <div className="flex gap-2">
              <input className="input uppercase" autoFocus value={newTipo}
                onChange={e => setNewTipo(e.target.value.toUpperCase())}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirmNewTipo(); } if (e.key === 'Escape') { setCreatingTipo(false); setNewTipo(''); } }}
                placeholder="EX: COPOS" />
              <button type="button" onClick={confirmNewTipo} disabled={createTipo.isPending}
                className="btn-primary px-3" title="Salvar tipo de produto">
                {createTipo.isPending ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              </button>
              <button type="button" onClick={() => { setCreatingTipo(false); setNewTipo(''); }}
                className="btn-secondary px-3" title="Cancelar"><X size={15} /></button>
            </div>
          ) : (
            <div className="flex gap-2">
              <select className="input flex-1" value={form.tipo_id} onChange={e => set('tipo_id', e.target.value)}>
                <option value="">Sem tipo</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button type="button" onClick={() => setCreatingTipo(true)}
                className="btn-secondary px-3 whitespace-nowrap" title="Adicionar novo tipo de produto">
                <FolderPlus size={15} /> Novo tipo
              </button>
            </div>
          )}
          <p className="text-xs text-gray-400 mt-1">
            Grupo que aparece no menu do site (ex.: COPOS). Dentro dele o cliente vê as categorias (ex.: LONG DRINK TRADICIONAL).
          </p>
        </div>
      </div>

      {/* Faixas de preço por quantidade */}
      <div className="border border-blue-200 rounded-lg bg-blue-50/30 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-blue-800">💰 Faixas de Preço por Quantidade</p>
          <button type="button" onClick={addTier}
            className="flex items-center gap-1.5 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 px-3 py-1.5 rounded-lg transition-colors">
            <Plus size={13} /> Adicionar faixa
          </button>
        </div>

        {priceTiers.length === 0 && (
          <p className="text-xs text-blue-500 text-center py-2">Sem faixas de preço. O preço de venda padrão será usado.</p>
        )}

        {priceTiers.map((tier, idx) => (
          <div key={idx} className="flex items-center gap-2 bg-white rounded-lg border border-blue-100 px-3 py-2">
            <div className="flex items-center gap-1.5 flex-1">
              <span className="text-xs text-gray-500 whitespace-nowrap">De</span>
              <input type="number" min="0" step="1" className="input py-1 text-sm w-20 text-center" placeholder="Qtd mín"
                value={tier.min_qty} onChange={e => setTier(idx, 'min_qty', e.target.value)} />
              <span className="text-xs text-gray-500 whitespace-nowrap">até</span>
              <input type="number" min="0" step="1" className="input py-1 text-sm w-20 text-center" placeholder="Qtd máx"
                value={tier.max_qty} onChange={e => setTier(idx, 'max_qty', e.target.value)} />
              <span className="text-xs text-gray-500 whitespace-nowrap">unid. →</span>
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-500">R$</span>
                <input type="number" min="0" step="0.01" className="input py-1 text-sm w-24" placeholder="0,00"
                  value={tier.price} onChange={e => setTier(idx, 'price', e.target.value)} />
              </div>
            </div>
            <button type="button" onClick={() => removeTier(idx)}
              className="p-1.5 text-gray-400 hover:text-red-500 transition-colors rounded"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {/* Preço por tipo de impressão (loja) */}
      <PrintPricingEditor value={printPricing} onChange={setPrintPricing} />

      {/* Dimensões — PRODUTO ACABADO */}
      {isProdutoAcabado && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">📦 Dimensões do Produto Acabado</p>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="label">Altura (mm)</label><input type="number" step="0.001" min="0" className="input" value={form.height} onChange={e => set('height', e.target.value)} placeholder="0" /></div>
            <div><label className="label">Peso (g)</label><input type="number" step="0.001" min="0" className="input" value={form.weight} onChange={e => set('weight', e.target.value)} placeholder="0" /></div>
            <div><label className="label">Espessura (mm)</label><input type="number" step="0.001" min="0" className="input" value={form.thickness} onChange={e => set('thickness', e.target.value)} placeholder="0" /></div>
            <div><label className="label">Circunf. da Base (mm)</label><input type="number" step="0.001" min="0" className="input" value={form.base_circumference} onChange={e => set('base_circumference', e.target.value)} placeholder="0" /></div>
            <div><label className="label">Circunf. da Boca (mm)</label><input type="number" step="0.001" min="0" className="input" value={form.mouth_circumference} onChange={e => set('mouth_circumference', e.target.value)} placeholder="0" /></div>
          </div>
        </div>
      )}

      {/* Dimensões — IMPRESSO */}
      {isImpresso && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">🖨️ Dimensões do Impresso</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="label">Comprimento (mm)</label><input type="number" step="0.001" min="0" className="input" value={form.length} onChange={e => set('length', e.target.value)} placeholder="0" /></div>
            <div><label className="label">Largura (mm)</label><input type="number" step="0.001" min="0" className="input" value={form.width} onChange={e => set('width', e.target.value)} placeholder="0" /></div>
          </div>
        </div>
      )}

      {/* Dados fiscais */}
      <details className="border border-gray-200 rounded-lg">
        <summary className="px-4 py-3 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-lg">
          Dados Fiscais (NCM, CST, CFOP)
        </summary>
        <div className="px-4 pb-4 grid grid-cols-3 gap-4 mt-3">
          <div><label className="label">NCM</label><input className="input" value={form.ncm} onChange={e => set('ncm', e.target.value)} placeholder="00000000" maxLength={8} /></div>
          <div><label className="label">CST / CSOSN</label><input className="input" value={form.cst} onChange={e => set('cst', e.target.value)} placeholder="000" maxLength={4} /></div>
          <div><label className="label">CFOP</label><input className="input" value={form.cfop} onChange={e => set('cfop', e.target.value)} placeholder="5102" maxLength={4} /></div>
        </div>
      </details>

      {/* Foto do produto (loja) */}
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
        <p className="text-xs text-gray-400 mt-1">Dica: copie uma imagem e cole aqui com <b>Ctrl+V</b>.</p>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
          <span className="text-sm text-gray-700">Produto ativo</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.show_in_store} onChange={e => set('show_in_store', e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
          <span className="text-sm text-gray-700">Aparecer na loja (site)</span>
        </label>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
        <button type="button" onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? <><Loader2 size={15} className="animate-spin" /> Salvando...</> : 'Salvar Produto'}
        </button>
      </div>
    </form>
  );
}
