import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Loader2, Trash2, Image as ImageIcon, Upload, FolderPlus, Check, X, ClipboardPaste } from 'lucide-react';

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// Preço (venda, faixas por quantidade e por impressão) NÃO fica mais aqui:
// é responsabilidade do módulo de Precificação. O cadastro guarda só o custo.

export default function ProductForm({ product, onSaved, onCancel }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', code: '', ean: '', category_id: '',
    cost_price: '', min_stock: '',
    pricing_sheet_id: '',
    ncm: '', cst: '', cfop: '', is_active: true,
    supplier_id: '',
    height: '', weight: '', thickness: '',
    base_circumference: '', mouth_circumference: '',
    length: '', width: '',
  });
  const [mainImage, setMainImage] = useState(null);   // url ou dataURL
  const [loading, setLoading] = useState(false);

  // criação de novo tipo (categoria) na hora
  const [creatingType, setCreatingType] = useState(false);
  const [newType, setNewType] = useState('');
  const [confirmDelType, setConfirmDelType] = useState(false);

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=200&is_active=true'),
  });
  const suppliers = suppliersData?.data || [];

  // Tabelas de Precificação (fichas marcadas como mestre) — a fonte do preço
  const { data: pricingTables = [] } = useQuery({
    queryKey: ['pricing-tables'],
    queryFn: () => api.get('/pricing/tables'),
  });

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
        cost_price: product.cost_price || '',
        min_stock: product.min_stock || '',
        pricing_sheet_id: product.pricing_sheet_id || '',
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
      setMainImage(product.image_url || null);
    } else {
      setMainImage(null);
      const defaultCat = categories.find(c => c.name?.toUpperCase() === 'PRODUTO ACABADO');
      if (defaultCat) setForm(prev => ({ ...prev, category_id: defaultCat.id }));
    }
  }, [product, categories]);

  function set(field, value) { setForm(prev => ({ ...prev, [field]: value })); }

  function confirmNewType() {
    const n = newType.trim().toUpperCase();
    if (!n) return;
    if (categories.some(c => c.name?.toUpperCase() === n)) { toast.error('Esse tipo já existe'); return; }
    createType.mutate(n);
  }

  // Ctrl+V em QUALQUER lugar com o formulário aberto → vira a foto do produto
  useEffect(() => {
    function onPaste(e) {
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
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  // Botão "Colar": lê a imagem copiada direto da área de transferência
  async function pasteFromClipboard() {
    try {
      const items = await navigator.clipboard.read();
      for (const it of items) {
        const type = it.types.find(t => t.startsWith('image/'));
        if (type) {
          const blob = await it.getType(type);
          await pickImage(new File([blob], 'foto-colada.png', { type }), setMainImage);
          toast.success('Imagem colada como foto do produto!');
          return;
        }
      }
      toast.error('Nenhuma imagem copiada. Copie uma imagem (Ctrl+C) e tente de novo.');
    } catch {
      toast.error('Não consegui ler a área de transferência — aperte Ctrl+V com o formulário aberto.');
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

    setLoading(true);
    try {
      // Preço (venda/faixas/impressão) fica por conta da Precificação: o
      // cadastro não os envia, então os valores atuais são preservados.
      const payload = {
        ...form,
        name: form.name.toUpperCase(),
        cost_price: parseFloat(form.cost_price) || 0,
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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Identificação */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
          <label className="label">Categoria de produto</label>
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
                  <option value="">Sem categoria</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button type="button" onClick={() => setCreatingType(true)}
                  className="btn-secondary px-3 whitespace-nowrap" title="Criar nova categoria de produto">
                  <FolderPlus size={15} /> Nova categoria
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

      {/* Custo e estoque — o preço de VENDA vem da Precificação */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="label">Custo de Compra (R$)</label>
          <input type="number" step="0.01" min="0" className="input"
            value={form.cost_price} onChange={e => set('cost_price', e.target.value)} placeholder="0,00" />
        </div>
        <div>
          <label className="label">Estoque Mínimo</label>
          <input type="number" step="1" min="0" className="input"
            value={form.min_stock} onChange={e => set('min_stock', e.target.value)} placeholder="0" />
        </div>
      </div>

      {/* Tabela de Precificação — fonte do preço de venda */}
      <div>
        <label className="label">Tabela de Precificação</label>
        <select className="input" value={form.pricing_sheet_id}
          onChange={e => set('pricing_sheet_id', e.target.value)}>
          <option value="">Sem tabela (produto fica sem preço na loja)</option>
          {pricingTables.map(t => (
            <option key={t.id} value={t.id}>
              {t.name}{t.capacity ? ` — ${t.capacity}` : ''}
            </option>
          ))}
        </select>
        <p className="text-xs text-gray-400 mt-1">
          O preço de venda é calculado por esta tabela (faixas de quantidade + impressão + margem).
          Crie e edite as tabelas em <b>Precificação → Formação de Preço</b> (marque a ficha como “tabela mestre”).
        </p>
      </div>

      {/* Dimensões — PRODUTO ACABADO */}
      {isProdutoAcabado && (
        <div className="border border-gray-200 rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold text-gray-700">📦 Dimensões do Produto Acabado</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="px-4 pb-4 grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
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
          <button type="button" onClick={pasteFromClipboard} className="btn-secondary" title="Colar imagem copiada">
            <ClipboardPaste size={15} /> Colar
          </button>
          {mainImage && <button type="button" onClick={() => setMainImage('')} className="text-xs text-red-500 hover:text-red-600">Remover</button>}
        </div>
        <p className="text-xs text-gray-400 mt-1">Dica: copie uma imagem e aperte <b>Ctrl+V</b> em qualquer lugar desta janela — não precisa clicar em nada antes.</p>
      </div>

      {/* Status */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={form.is_active} onChange={e => set('is_active', e.target.checked)} className="w-4 h-4 text-primary-600 rounded" />
          <span className="text-sm text-gray-700">Produto ativo</span>
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
