// ============================================================
// O CADASTRO MESTRE DE PRODUTOS.
//
// UMA FICHA, TRÊS PORTAS. O mesmo copo pode ser vendido liso na loja,
// personalizado no catálogo, nos dois, ou em nenhum dos dois enquanto
// ainda está sendo montado. Por isso a publicação são perguntas
// separadas, e não um "ativo" só: elas não são degraus de uma escada.
//
// E O QUE O CATÁLOGO OFERECE SAI DAQUI. Acabamentos, cores de cada
// campo, impressão, caixa do liso e gabarito da arte moram na aba
// "Catálogo personalizado" — que é deste produto, não de um cadastro
// paralelo. É o que garante que o site e a produção leiam a mesma coisa.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import {
  Loader2, Image as ImageIcon, Upload, ClipboardPaste,
  ClipboardList, Sparkles, Eye, EyeOff, Info, PlusCircle,
} from 'lucide-react';
import CatalogoDoProduto from './CatalogoDoProduto';
import AdicionaisDoProduto from './AdicionaisDoProduto';
import AjusteDeVitrine from './AjusteDeVitrine';

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

export default function ProductForm({ product, onSaved, onCancel, onAba }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '', code: '', ean: '', category_id: '',
    cost_price: '', sale_price: '', current_stock: '',
    pricing_sheet_id: '',
    ncm: '', cst: '', cfop: '', is_active: true, cor_item_id: null,
    show_in_store: true, show_in_catalogo: false, ink_type: '',
    supplier_id: '',
    height: '', weight: '', thickness: '',
    base_circumference: '', mouth_circumference: '',
    length: '', width: '',
  });
  const [mainImage, setMainImage] = useState(null);   // url ou dataURL
  const [loading, setLoading] = useState(false);
  const [aba, setAba] = useState('cadastro');
  // A ficha de catálogo é larga — dezenas de acabamentos e cores em
  // colunas. Ela não cabe na largura de um formulário de cadastro, e é a
  // JANELA que precisa saber disso, não ela. Por isso a aba sobe.
  useEffect(() => { onAba?.(aba); }, [aba]); // eslint-disable-line

  // COM AS VAZIAS: a categoria que acabou de ser criada aqui ainda não
  // tem produto nenhum — e é justamente este produto que vai ser o primeiro.
  const { data: categories = [] } = useQuery({
    queryKey: ['categories', 'com-vazias'],
    queryFn: () => api.get('/products/categories/list?incluir_vazias=1'),
  });
  const [criandoCategoria, setCriandoCategoria] = useState(false);
  const [nomeNovaCategoria, setNomeNovaCategoria] = useState('');
  const [salvandoCategoria, setSalvandoCategoria] = useState(false);

  async function criarCategoria() {
    const nome = nomeNovaCategoria.trim().toUpperCase();
    if (!nome) { toast.error('Digite o nome da nova categoria'); return; }
    setSalvandoCategoria(true);
    try {
      // Nome que já existe devolve a que existe: o servidor não duplica.
      const cat = await api.post('/products/categories', { name: nome });
      await qc.invalidateQueries({ queryKey: ['categories'] });
      setForm(prev => ({ ...prev, category_id: cat.id }));
      setCriandoCategoria(false);
      setNomeNovaCategoria('');
      toast.success(`Categoria ${cat.name} pronta`);
    } catch (err) {
      toast.error(err.error || 'Erro ao criar a categoria');
    } finally { setSalvandoCategoria(false); }
  }

  const { data: coresCadastradas = [] } = useQuery({
    queryKey: ['itens', 'cor'],
    queryFn: () => api.get('/itens?kind=cor'),
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

  const selectedCat = categories.find(c => c.id === form.category_id);
  const catName = selectedCat?.name?.toUpperCase() || '';
  const isProdutoAcabado = catName === 'PRODUTO ACABADO';
  const isImpresso = catName === 'IMPRESSOS';

  // A margem existe para o custo e o preco pararem de ser dois numeros
  // sem relacao na mesma tela: 2,11 e 4,53 nao dizem nada juntos, "115%"
  // diz. Null quando falta um dos dois — dividir por zero nao informa.
  const margem = (() => {
    const c = parseFloat(String(form.cost_price).replace(',', '.'));
    const p = parseFloat(String(form.sale_price).replace(',', '.'));
    if (!Number.isFinite(c) || !Number.isFinite(p) || c <= 0 || p <= 0) return null;
    return ((p - c) / c) * 100;
  })();

  useEffect(() => {
    if (product) {
      setForm({
        name: product.name || '',
        code: product.code || '',
        ean: product.ean || '',
        category_id: product.category_id || '',
        cost_price: product.cost_price || '',
        cor_item_id: product.cor_item_id || null,
        sale_price: product.sale_price ?? '',
        current_stock: product.current_stock ?? '',
        pricing_sheet_id: product.pricing_sheet_id || '',
        ncm: product.ncm || '',
        cst: product.cst || '',
        cfop: product.cfop || '',
        is_active: product.is_active !== false,
        show_in_store: product.show_in_store !== false,
        show_in_catalogo: product.show_in_catalogo === true,
        ink_type: product.ink_type || '',
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
    // PRODUTO NOVO PERGUNTA A CATEGORIA. A tela de Produtos abre nos
    // cards das categorias: um produto sem categoria não teria card.
    if (!product?.id && !form.category_id) {
      toast.error('Escolha a categoria do produto (ou crie uma nova)'); return;
    }

    setLoading(true);
    try {
      // FAIXAS E IMPRESSAO ficam por conta da Precificacao: o cadastro
      // nao os envia, entao os valores atuais sao preservados.
      //
      // O PRECO DE VENDA e diferente, e essa diferenca custou caro. A
      // regra era "preco vem da Precificacao", so que produto SEM tabela
      // ficava com um `sale_price` orfao — gravado numa importacao,
      // usado pelo PDV, e invisivel em toda a interface. O cadastro
      // mostrava "Custo de Compra 2,11", o pedido cobrava 4,53, e nao
      // havia tela nenhuma onde os dois numeros se encontrassem.
      //
      // Agora o campo existe e so e enviado quando NAO ha tabela: com
      // tabela, quem manda no preco continua sendo ela.
      const payload = {
        ...form,
        name: form.name.toUpperCase(),
        cost_price: parseFloat(form.cost_price) || 0,
        // `sale_price` NAO vai no corpo: o servidor recusa preco por
        // esta rota, e de proposito. Ver backend/src/lib/preco.js.
        current_stock: parseInt(form.current_stock) || 0,
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
        // As três portas, sempre explícitas. Mandar só quando muda faria
        // o "desmarcar" nunca chegar ao servidor — `false` some num
        // `if (campo)`.
        show_in_store: !!form.show_in_store,
        show_in_catalogo: !!form.show_in_catalogo,
        ink_type: form.ink_type || null,
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

  const ABAS = [
    { key: 'cadastro', label: 'Cadastro', icone: ClipboardList },
    { key: 'catalogo', label: 'Catálogo personalizado', icone: Sparkles },
    // BORDA, CANUDO E TAMPA TÊM ABA PRÓPRIA, e não uma seção no fim do
    // cadastro: quem mexe neles quase sempre está aplicando em massa —
    // na categoria inteira ou em todo o catálogo — e essa decisão não
    // cabe espremida embaixo de NCM e CFOP.
    { key: 'adicionais', label: 'Adicionais', icone: PlusCircle },
  ];

  if (aba === 'adicionais') {
    return (
      <div className="space-y-5">
        <Abas abas={ABAS} atual={aba} onMudar={setAba} />
        <AdicionaisDoProduto productId={product?.id} categoryId={form.category_id || product?.category_id || null} />
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onCancel} className="btn-secondary">Fechar</button>
        </div>
      </div>
    );
  }

  if (aba === 'catalogo') {
    return (
      <div className="space-y-5">
        <Abas abas={ABAS} atual={aba} onMudar={setAba} />
        <CatalogoDoProduto productId={product?.id} />
        <div className="flex items-center justify-end gap-3 pt-2 border-t border-gray-100">
          <button type="button" onClick={onCancel} className="btn-secondary">Fechar</button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <Abas abas={ABAS} atual={aba} onMudar={setAba} />

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

        {/* A COR VEM DO CADASTRO, e não mais digitada dentro do nome.
            Digitada 97 vezes, ela virava "AZUL BEBE" e "AZUL BEBÊ" — e
            aí não havia como o sistema responder "quais cores a Lyon
            faz?" sem varrer nome por nome. Escolhida de uma lista, a
            cor é a MESMA em todo copo que a usa. */}
        <div className="col-span-2">
          <label className="label flex items-center gap-2">
            Cor da peça
            {form.cor_item_id && (() => {
              const c = coresCadastradas.find(x => x.id === form.cor_item_id);
              return c ? <span className="w-4 h-4 rounded border border-gray-200 inline-block"
                style={{ background: c.color_hex || '#f3f4f6' }} /> : null;
            })()}
          </label>
          <select className="input" value={form.cor_item_id || ''}
            onChange={e => set('cor_item_id', e.target.value || null)}>
            <option value="">— sem cor (peça lisa ou insumo) —</option>
            {coresCadastradas.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="text-[11px] text-gray-400 mt-1">
            Cor nova se cadastra em <b>Cadastros › Cores</b> — de lá ela fica disponível para
            todos os copos.
          </p>
        </div>

        {/* A FOTO MORA JUNTO DA COR, e não trinta campos abaixo.
            Ela não é "a foto do produto" no abstrato: é a foto DESTE
            copo NESTA cor — é ela que o catálogo mostra quando a
            cliente escolhe Azul Bic. Longe do campo de cor, ninguém
            liga uma coisa à outra, e é assim que 3 das 24 cores ficam
            sem foto e ninguém percebe. */}
        <div className="col-span-2">
          <label className="label flex items-center gap-1.5">
            <ImageIcon size={14} className="text-primary-500" />
            {(() => {
              const c = coresCadastradas.find(x => x.id === form.cor_item_id);
              return c ? `Foto deste copo na cor ${c.name}` : 'Foto deste copo';
            })()}
          </label>
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
          <p className="text-xs text-gray-400 mt-1">
            É esta foto que aparece no catálogo e na loja quando a cliente escolhe esta cor.
            Dica: copie uma imagem e aperte <b>Ctrl+V</b> em qualquer lugar desta janela.
          </p>
        </div>

        <div>
          <label className="label">EAN / Código de Barras</label>
          <input className="input" value={form.ean} onChange={e => set('ean', e.target.value)} placeholder="7891234567890" />
        </div>

        {/* Categoria — escolhe uma que existe ou cria uma nova ali mesmo.
            Antes era somente-leitura ("vem da importação"), e produto
            cadastrado à mão nascia sem categoria. */}
        <div>
          <label className="label">Categoria de produto *</label>
          {criandoCategoria ? (
            <div className="flex gap-2">
              <input className="input flex-1" autoFocus value={nomeNovaCategoria} maxLength={80}
                onChange={e => setNomeNovaCategoria(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); criarCategoria(); } }}
                placeholder="Ex.: COPO TWISTER 400 ML" />
              <button type="button" className="btn-primary text-xs shrink-0" onClick={criarCategoria}
                disabled={salvandoCategoria}>
                {salvandoCategoria ? <Loader2 size={14} className="animate-spin" /> : 'Criar'}
              </button>
              <button type="button" className="btn-secondary text-xs shrink-0"
                onClick={() => { setCriandoCategoria(false); setNomeNovaCategoria(''); }}>
                Cancelar
              </button>
            </div>
          ) : (
            <select className="input" value={form.category_id || ''}
              onChange={e => {
                if (e.target.value === '__nova__') setCriandoCategoria(true);
                else set('category_id', e.target.value);
              }}>
              <option value="">Selecione a categoria…</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__nova__">+ Criar nova categoria…</option>
            </select>
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

      {/* CUSTO, PRECO E ESTOQUE.
          O preco de venda passou a aparecer aqui porque ele existia e
          nao aparecia em lugar nenhum: quem abria o cadastro via so o
          custo e concluia que era o preco. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="label">Custo de Compra (R$)</label>
          <input type="number" step="0.01" min="0" className="input"
            value={form.cost_price} onChange={e => set('cost_price', e.target.value)} placeholder="0,00" />
          <p className="text-xs text-gray-400 mt-1">O que você paga. Não é o preço de venda.</p>
        </div>
        {/* O PREÇO SE LÊ AQUI E SE DEFINE EM PRECIFICAÇÃO.
            Este campo já foi editável, e era uma das QUATRO telas que
            gravavam o mesmo `sale_price` — junto com Precificação, a
            edição em massa e o ajuste de vitrine. Quatro portas para o
            mesmo número é o mesmo que não ter cadastro: o último que
            salvou ganha, e foi assim que o cadastro passou a dizer
            R$ 2,11 enquanto o pedido cobrava outro valor. */}
        <div>
          <label className="label">Preço de venda (R$)</label>
          <input type="text" className="input bg-gray-100 text-gray-500" readOnly
            value={form.sale_price === '' || form.sale_price == null
              ? '—'
              : Number(form.sale_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} />
          <p className="text-xs mt-1 text-gray-400">
            Definido em <b className="text-gray-500">Precificação</b> — é lá que o custo
            vira preço, e é de lá que o pedido de venda puxa.
          </p>
          {margem !== null && (
            <p className="text-xs mt-0.5" style={{ color: margem < 0 ? '#dc2626' : '#6b7280' }}>
              Margem sobre o custo: {margem.toFixed(1)}%
            </p>
          )}
        </div>
        <div>
          <label className="label">Estoque atual (un.)</label>
          <input type="number" step="1" min="0" className="input"
            value={form.current_stock} onChange={e => set('current_stock', e.target.value)} placeholder="0" />
          <p className="text-xs text-gray-400 mt-1">Editar aqui gera um ajuste de estoque registrado.</p>
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
          {form.pricing_sheet_id
            ? <>Com tabela, o preço de venda é <b>calculado</b> por ela (faixas de quantidade + impressão + margem)
                e o campo acima fica travado. Edite em <b>Engenharia de Custos → Formação de Preço</b>.</>
            : <>Sem tabela, vale o <b>Preço de venda</b> digitado acima. Escolher uma tabela passa o comando
                para ela — crie em <b>Engenharia de Custos → Formação de Preço</b> (marque a ficha como “tabela mestre”).</>}
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

      {/* Linha do material — quem determina a tinta compatível */}
      <div>
        <label className="label">Linha / material do copo</label>
        <select className="input" value={form.ink_type} onChange={e => set('ink_type', e.target.value)}>
          <option value="">Não definida</option>
          <option value="PS">PS</option>
          <option value="PP">PP</option>
          <option value="PET">PET</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">
          O cliente não escolhe a tinta: o material escolhe. O catálogo só oferece impressão
          compatível com esta linha.
        </p>
      </div>

      {/* Publicação — três perguntas independentes */}
      <div className="border border-gray-200 rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold text-gray-700">Onde este produto aparece</p>

        <Chave
          ligado={form.is_active} onMudar={v => set('is_active', v)}
          titulo="Ativo no sistema"
          ajuda="Desligado, o produto some de tudo: catálogo, loja, PDV, orçamento e pedido." />

        <Chave
          ligado={form.is_active && form.show_in_catalogo}
          desativado={!form.is_active}
          onMudar={v => set('show_in_catalogo', v)}
          titulo="Exibir no catálogo personalizado"
          ajuda="O site de copo com arte, nome e acabamento (/catalogo). Produto novo nasce em rascunho: começar a cadastrar não é publicar." />

        {/* O AJUSTE FICA GRUDADO NA CHAVE. É o mesmo copo nos dois sites,
            mas ele não se vende igual: aqui é caixa fechada, com mínimo
            alto e preço que já embute a personalização. Preço de vitrine
            longe da chave que liga a vitrine é o que faz alguém
            configurar no site errado. */}
        {product?.id && (
          <AjusteDeVitrine productId={product.id} ambiente="catalogo"
            nomeDaVitrine="Catálogo personalizado" />
        )}

        <Chave
          ligado={form.is_active && form.show_in_store}
          desativado={!form.is_active}
          onMudar={v => set('show_in_store', v)}
          titulo="Exibir no site de produtos lisos"
          ajuda="A loja de copo sem impressão (/loja). É outra pergunta: o mesmo copo pode estar num site e não no outro." />

        {product?.id && (
          <AjusteDeVitrine productId={product.id} ambiente="loja"
            nomeDaVitrine="Loja de lisos" />
        )}

        {product?.id && form.show_in_catalogo && (
          <p className="text-[11.5px] text-violet-700 bg-violet-50 rounded-lg p-2.5 flex items-start gap-2">
            <Info size={13} className="shrink-0 mt-0.5" />
            <span>
              Configure acabamentos, cores, impressão, caixa e gabarito na aba
              <b> Catálogo personalizado</b> — é de lá que o site monta as opções deste produto.
            </span>
          </p>
        )}
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

/** A troca de abas do cadastro. */
function Abas({ abas, atual, onMudar }) {
  return (
    <div className="flex gap-1.5 flex-wrap border-b border-gray-100 pb-3">
      {abas.map(a => (
        <button key={a.key} type="button" onClick={() => onMudar(a.key)}
          className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors ${
            atual === a.key ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}>
          <a.icone size={15} /> {a.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Uma chave de publicação.
 *
 * Fica desligada e travada quando o produto está inativo: um produto
 * fora do sistema não aparece em site nenhum, e deixar a chave clicável
 * ali prometeria uma publicação que não vai acontecer.
 */
function Chave({ ligado, desativado, onMudar, titulo, ajuda }) {
  return (
    <label className={`flex items-start gap-3 rounded-lg border p-3 ${
      desativado ? 'border-gray-100 bg-gray-50 opacity-60 cursor-not-allowed'
        : ligado ? 'border-green-200 bg-green-50 cursor-pointer' : 'border-gray-200 cursor-pointer'
    }`}>
      <input type="checkbox" checked={!!ligado} disabled={desativado}
        onChange={e => onMudar(e.target.checked)}
        className="w-4 h-4 mt-0.5 text-primary-600 rounded shrink-0" />
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-800">
          {ligado ? <Eye size={13} className="text-green-600" /> : <EyeOff size={13} className="text-gray-400" />}
          {titulo}
        </span>
        <span className="block text-[11.5px] text-gray-500 mt-0.5 leading-relaxed">{ajuda}</span>
      </span>
    </label>
  );
}
