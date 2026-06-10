import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2 } from 'lucide-react';

export default function ProductForm({ product, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: '', code: '', ean: '', description: '', category_id: '',
    cost_price: '', sale_price: '', min_stock: '',
    ncm: '', cst: '', cfop: '', is_active: true,
    supplier_id: '',
    // Produto Acabado
    height: '', weight: '', thickness: '',
    base_circumference: '', mouth_circumference: '',
    // Impresso
    length: '', width: '',
  });
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

  // Descobre o nome da categoria selecionada para campos condicionais
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
        description: product.description || '',
        category_id: product.category_id || '',
        cost_price: product.cost_price || '',
        sale_price: product.sale_price || '',
        min_stock: product.min_stock || '',
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
    } else {
      // Default: pré-seleciona PRODUTO ACABADO se existir
      const defaultCat = categories.find(c => c.name?.toUpperCase() === 'PRODUTO ACABADO');
      if (defaultCat) setForm(prev => ({ ...prev, category_id: defaultCat.id }));
    }
  }, [product, categories]);

  function set(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name) { toast.error('Nome do produto é obrigatório'); return; }

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
          <label className="label">Código Interno</label>
          <input className="input" value={form.code} onChange={e => set('code', e.target.value)} placeholder="COD001" />
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

      {/* Preços */}
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

      {/* Descrição */}
      <div>
        <label className="label">Descrição / Observações</label>
        <textarea className="input resize-none" rows={2}
          value={form.description} onChange={e => set('description', e.target.value)} />
      </div>

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
