import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Loader2, Image as ImageIcon, AlertTriangle, Trash2, Check, PlusCircle } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import ComoEntraNoCopo from '@/components/UI/ComoEntraNoCopo';
import toast from 'react-hot-toast';

export default function BulkEditModal({ isOpen, onClose }) {
  const qc = useQueryClient();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [size, setSize] = useState('');           // filtro de tamanho (ex.: '350')
  const [selected, setSelected] = useState({});

  const [applyAll, setApplyAll] = useState(false);  // aplicar a TODOS do filtro
  // campos a aplicar (só os preenchidos)
  const [supplierId, setSupplierId] = useState(''); // '' = não altera | '__none__' = limpa | id
  const [costPrice, setCostPrice] = useState('');
  const [ncm, setNcm] = useState('');
  const [cst, setCst] = useState('');
  const [cfop, setCfop] = useState('');
  const [inkType, setInkType] = useState('');       // '' não altera | PP | PS | __none__ limpa
  // Publicação em massa. '' = não altera | 'sim' | 'nao'. No cadastro
  // existe um produto POR COR: colocar um modelo no ar de uma em uma
  // seriam 24 cliques, e é assim que metade das cores fica esquecida.
  const [noCatalogo, setNoCatalogo] = useState('');
  const [naLoja, setNaLoja] = useState('');
  // AJUSTE DE VITRINE (migração 094). É outra tabela, e por isso outro
  // conjunto de campos: aqui não se altera o produto, e sim o que ele
  // custa e o mínimo que ele pede DENTRO de um dos dois sites.
  const [ambiente, setAmbiente] = useState('');   // '' = não mexe | 'loja' | 'catalogo'
  const [ambPreco, setAmbPreco] = useState('');
  const [ambMinimo, setAmbMinimo] = useState('');
  // ADICIONAIS EM MASSA. Praticamente todo copo oferece as mesmas
  // bordas — aplicar as dezoito de um em um seriam 97 × 18 cliques, e
  // é exatamente o motivo de ninguém nunca ter cadastrado nenhuma.
  const [adicionais, setAdicionais] = useState([]);   // ids de ITENS
  const [adicPadrao, setAdicPadrao] = useState(false);
  const [buscaAdic, setBuscaAdic] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);        // modal de apagar em massa
  const [delPassword, setDelPassword] = useState('');

  const { data: cats } = useQuery({
    queryKey: ['categories-list'],
    queryFn: () => api.get('/products/categories/list'),
    enabled: isOpen,
  });
  const { data: filterOpts } = useQuery({
    queryKey: ['product-filters'],
    queryFn: () => api.get('/products/filters'),
    enabled: isOpen,
  });
  const volumeOptions = filterOpts?.volumes || [];
  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers-list'],
    queryFn: () => api.get('/suppliers?limit=200&is_active=true'),
    enabled: isOpen,
  });
  const suppliers = suppliersData?.data || [];

  const { data: itensCad = [] } = useQuery({
    queryKey: ['itens', 'todos'],
    queryFn: () => api.get('/itens'),
    enabled: isOpen,
  });
  const itensFiltrados = buscaAdic.trim()
    ? itensCad.filter(i => `${i.name} ${i.color_name || ''}`.toLowerCase().includes(buscaAdic.trim().toLowerCase()))
    : itensCad;

  /**
   * OS GRUPOS, TIRADOS DOS PRÓPRIOS ITENS.
   *
   * A lista chegava misturada — dezoito bordas, três canudos, duas
   * tampas e vinte e cinco cores numa fieira só — e marcar "todas as
   * bordas" era rolar e clicar dezoito vezes. Agora cada grupo é uma
   * caixa: um clique marca o grupo inteiro.
   *
   * OS GRUPOS NÃO ESTÃO ESCRITOS AQUI. Sai do cadastro: dentro de um
   * tipo, se há POUCOS nomes distintos, cada nome vira um grupo ("Borda
   * Metalizada", "Tampa", "Canudo", e as tintas "PS" e "PP" no dia em
   * que forem cadastradas); se há muitos — as vinte e cinco cores —, o
   * grupo é o tipo inteiro, senão seriam vinte e cinco caixas de um
   * item cada. Item novo aparece sozinho, sem deploy.
   */
  const gruposAdic = useMemo(() => {
    const ROTULO = { cor: 'Cores', acessorio: 'Acessórios', borda: 'Bordas', tinta: 'Tintas', embalagem: 'Embalagem', outro: 'Outros' };
    const LIMITE_DE_NOMES = 6;

    const porTipo = new Map();
    for (const i of itensFiltrados) {
      if (!porTipo.has(i.kind)) porTipo.set(i.kind, new Map());
      const nome = String(i.name || '').trim() || ROTULO[i.kind] || 'Outros';
      const nomes = porTipo.get(i.kind);
      if (!nomes.has(nome)) nomes.set(nome, []);
      nomes.get(nome).push(i);
    }

    const out = [];
    for (const [kind, nomes] of porTipo) {
      if (nomes.size > LIMITE_DE_NOMES) {
        out.push({ chave: `kind:${kind}`, rotulo: ROTULO[kind] || kind, itens: [...nomes.values()].flat() });
      } else {
        for (const [nome, lista] of nomes) out.push({ chave: `${kind}:${nome}`, rotulo: nome, itens: lista });
      }
    }
    // Grupo grande primeiro: é o que se marca inteiro com mais frequência.
    return out.sort((a, b) => b.itens.length - a.itens.length || a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
  }, [itensFiltrados]);

  // O tamanho NÃO entra na busca: como termo, o "400" casava com o código
  // (CT45-2400, que é 450 ML). Vai como volume=400, que o backend compara
  // com o número do nome. Vale para a lista e para o "aplicar a todos".
  const effectiveSearch = String(search || '').trim();
  const volumeParam = parseInt(size) || '';

  const { data, isFetching } = useQuery({
    queryKey: ['bulk-products', effectiveSearch, volumeParam, categoryId],
    queryFn: () => api.get(`/products?limit=1000&is_active=true${effectiveSearch ? `&search=${encodeURIComponent(effectiveSearch)}` : ''}${volumeParam ? `&volume=${volumeParam}` : ''}${categoryId ? `&category_id=${categoryId}` : ''}`),
    enabled: isOpen,
  });
  const products = data?.data || [];
  const totalMatching = data?.total || 0;
  const selectedIds = Object.keys(selected).filter(id => selected[id]);
  const allSelected = products.length > 0 && products.every(p => selected[p.id]);

  function toggle(id) { setSelected(s => ({ ...s, [id]: !s[id] })); }
  function toggleAll() {
    const n = { ...selected };
    if (allSelected) products.forEach(p => delete n[p.id]);
    else products.forEach(p => { n[p.id] = true; });
    setSelected(n);
  }
  function doSearch(e) { e.preventDefault(); setSearch(searchInput.trim()); }

  // Só busca e tamanho — a categoria não conta aqui porque ela tem
  // representação própria (uma linha por categoria).
  function hasFiltroDeBusca() { return !!(effectiveSearch || volumeParam); }

  const fields = {};
  if (supplierId === '__none__') fields.supplier_id = null;
  else if (supplierId) fields.supplier_id = supplierId;
  if (costPrice !== '') fields.cost_price = costPrice;
  if (ncm.trim()) fields.ncm = ncm.trim();
  if (cst.trim()) fields.cst = cst.trim();
  if (cfop.trim()) fields.cfop = cfop.trim();
  if (inkType) fields.ink_type = inkType;   // 'PP' | 'PS' | '__none__' (limpa)
  if (noCatalogo) fields.show_in_catalogo = noCatalogo === 'sim';
  if (naLoja) fields.show_in_store = naLoja === 'sim';
  const hasFields = Object.keys(fields).length > 0;

  // Vazio não é zero: campo em branco aqui devolve o produto ao preço do
  // cadastro naquela vitrine. Por isso só entram os preenchidos.
  const camposAmbiente = {};
  // Preco nao entra na edicao em massa — Precificacao e a unica porta.
  if (ambMinimo !== '') camposAmbiente.min_order_qty = ambMinimo;
  const temVitrine = !!ambiente && Object.keys(camposAmbiente).length > 0;

  /**
   * ONDE OS ADICIONAIS VÃO PARAR — e por que não é sempre "nos
   * selecionados".
   *
   * O mesmo alvo tem representações de custo muito diferente. Marcar
   * as dezoito bordas com "aplicar a todos" e nenhum filtro pode virar
   * 18 linhas (o curinga) ou 1746 (uma por copo) — e as 18 continuam
   * valendo para o copo cadastrado amanhã, coisa que as 1746 não
   * fazem. Então a tela escolhe a mais barata que responde ao que foi
   * pedido, e DIZ qual escolheu logo abaixo, porque alcance de regra
   * decidido em silêncio é o que ninguém consegue desfazer depois.
   */
  const alvoAdicional = !adicionais.length ? null
    : applyAll && categoryId ? { escopo: 'categoria', category_id: categoryId }
    : applyAll && !hasFiltroDeBusca() ? { escopo: 'todos' }
    : applyAll ? { escopo: 'produto', product_ids: (products || []).map(p => p.id) }
    : { escopo: 'produto', product_ids: selectedIds };

  // Apagar em massa (definitivo) — só nos selecionados e com senha da conta.
  const del = useMutation({
    mutationFn: (password) => api.post('/products/bulk-delete', { ids: selectedIds, password }),
    onSuccess: (r) => {
      toast.success(`${r.deleted} produto(s) apagado(s)`);
      qc.invalidateQueries(['products']);
      qc.invalidateQueries(['bulk-products']);
      setSelected({});
      setDelOpen(false); setDelPassword('');
    },
    onError: (e) => toast.error(e.error || 'Erro ao apagar'),
  });

  const apply = useMutation({
    // Duas gravações porque são duas tabelas: o cadastro do produto e os
    // ajustes de vitrine. O alvo é o mesmo nas duas, para não existir o
    // caso de o preço da vitrine pegar num conjunto e o cadastro noutro.
    mutationFn: async () => {
      const alvo = applyAll
        ? { all: true, match: { search: effectiveSearch, category_id: categoryId, volume: volumeParam || undefined } }
        : { ids: selectedIds };
      let updated = 0, vitrine = 0, adics = 0;
      if (hasFields) updated = (await api.patch('/products/bulk', { ...alvo, fields })).updated || 0;
      if (temVitrine) {
        vitrine = (await api.post('/products/ambientes/lote', { ...alvo, ambiente, campos: camposAmbiente })).tocados || 0;
      }
      // Os adicionais são OUTRA tabela e outro alcance: eles não
      // alteram o produto, dizem o que ele passa a oferecer.
      if (alvoAdicional) {
        adics = (await api.post('/itens/aplicacoes', {
          item_ids: adicionais, padrao: adicPadrao, ...alvoAdicional,
        })).aplicados || 0;
      }
      return { updated, vitrine, adics };
    },
    onSuccess: (r) => {
      toast.success([
        r.updated ? `${r.updated} produto(s) atualizado(s)` : null,
        r.vitrine ? `${r.vitrine} ajuste(s) de vitrine` : null,
        r.adics ? `${r.adics} adicional(is) aplicado(s)` : null,
      ].filter(Boolean).join(' · ') + '!');
      qc.invalidateQueries(['products']);
      qc.invalidateQueries(['bulk-products']);
      qc.invalidateQueries(['categories']);
      qc.invalidateQueries(['categories-list']);
      qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
      qc.invalidateQueries({ queryKey: ['adicionais-produto'] });
      setSelected({});
      setAdicionais([]);
    },
    onError: (e) => toast.error(e.error || 'Erro ao aplicar'),
  });

  const hasFilter = !!(effectiveSearch || categoryId || volumeParam);
  const targetCount = applyAll ? totalMatching : selectedIds.length;
  const canApply = (hasFields || temVitrine || !!alvoAdicional)
    && (applyAll ? totalMatching > 0 : selectedIds.length > 0);

  // Ao fechar, zera a seleção e os campos para o modal abrir limpo na próxima vez.
  function handleClose() {
    setSelected({});
    setApplyAll(false);
    setSupplierId('');
    setCostPrice('');
    setNcm(''); setCst(''); setCfop(''); setInkType('');
    setAmbiente(''); setAmbPreco(''); setAmbMinimo('');
    setAdicionais([]); setAdicPadrao(false); setBuscaAdic('');
    setConfirmOpen(false);
    setDelOpen(false); setDelPassword('');
    onClose();
  }

  // Resumo da confirmação: compara os valores novos com os atuais dos produtos-alvo
  // (carregados) e conta, por campo, quantos já têm o valor / têm outro / estão vazios.
  const supplierName = (id) => (suppliers || []).find(s => s.id === id)?.name || '—';
  function buildSummary() {
    const targets = applyAll ? (products || []) : (products || []).filter(p => selected[p.id]);
    const labels = {
      supplier_id: 'Fornecedor', cost_price: 'Custo', ncm: 'NCM', cst: 'CST', cfop: 'CFOP',
      ink_type: 'Tinta do copo',
      show_in_catalogo: 'Catálogo personalizado', show_in_store: 'Loja de copos lisos',
    };
    const norm = (key, val) => {
      if (val == null) return '';
      if (key === 'supplier_id') return String(val || '');
      if (key === 'cost_price') return val === '' ? '' : String(Number(val));
      if (['ncm', 'cst', 'cfop'].includes(key)) return String(val).trim();
      return String(val);
    };
    const display = (key) => {
      if (key === 'show_in_catalogo' || key === 'show_in_store') return fields[key] ? 'Publicado' : 'Fora do ar';
      if (key === 'supplier_id') return fields.supplier_id ? supplierName(fields.supplier_id) : 'Sem fornecedor';
      if (key === 'cost_price') return `R$ ${Number(fields[key]).toFixed(2)}`;
      if (['ncm', 'cst', 'cfop'].includes(key)) return String(fields[key]);
      return String(fields[key]);
    };
    const rows = Object.keys(fields).map(key => {
      const newN = norm(key, fields[key]);
      let same = 0, diff = 0, empty = 0;
      for (const p of targets) {
        const cur = key === 'show_in_store' ? (p.show_in_store !== false)
          : key === 'show_in_catalogo' ? (p.show_in_catalogo === true)
          : p[key];
        const curN = norm(key, cur);
        if (curN === newN) same++;
        else if (curN === '') empty++;
        else diff++;
      }
      return { key, label: labels[key] || key, value: display(key), same, diff, empty };
    });
    return { rows, analyzed: targets.length };
  }

  function doApply() {
    if (!canApply) return;
    setConfirmOpen(true);
  }
  function confirmApply() {
    setConfirmOpen(false);
    apply.mutate();
  }

  const summary = confirmOpen ? buildSummary() : null;

  return (
    <>
    <Modal isOpen={isOpen} onClose={handleClose} title="Edição em massa" size="lg">
      <div className="space-y-4 max-h-[85vh] overflow-y-auto pr-1">
        <p className="text-sm text-gray-500">
          Filtre por <b>categoria</b> ou <b>modelo</b>, selecione os produtos e defina o que quer alterar.
          Só os campos preenchidos são aplicados.
        </p>
        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-2">
          <select className="input w-full sm:w-auto sm:min-w-[190px] max-w-full" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
            <option value="">Todas as categorias</option>
            {(cats || []).filter(c => c.product_count > 0).map(c => <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>)}
          </select>
          {volumeOptions.length > 0 && (
            <select className="input w-auto" value={size} onChange={e => setSize(e.target.value)} title="Filtrar por tamanho">
              <option value="">Todos os tamanhos</option>
              {volumeOptions.map(v => <option key={v} value={parseInt(v)}>{v}</option>)}
            </select>
          )}
          <form onSubmit={doSearch} className="flex gap-2 flex-1 min-w-[220px]">
            <div className="relative flex-1">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input className="input pl-9" placeholder="Filtrar por modelo / nome / código..."
                value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn-secondary">Filtrar</button>
          </form>
        </div>

        {/* Lista */}
        <div className="border border-gray-200 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100 text-sm">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 accent-violet-600" />
              Selecionar todos ({products.length})
            </label>
            <span className="text-violet-600 font-medium">{selectedIds.length} selecionado(s)</span>
          </div>
          <div className="max-h-[46vh] min-h-[260px] overflow-y-auto divide-y divide-gray-50">
            {isFetching ? (
              <div className="p-6 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>
            ) : products.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-sm">Nenhum produto. Filtre por categoria ou modelo.</div>
            ) : products.map(p => (
              <label key={p.id} className="flex items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer">
                <input type="checkbox" checked={!!selected[p.id]} onChange={() => toggle(p.id)} className="w-4 h-4 accent-violet-600" />
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="w-8 h-8 rounded-md object-cover border border-gray-200 shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-md border border-dashed border-gray-300 bg-gray-50 flex items-center justify-center shrink-0" title="Sem foto">
                    <ImageIcon size={13} className="text-gray-300" />
                  </div>
                )}
                <span className="flex-1 min-w-0">
                  <span className="font-medium block truncate">{p.name}</span>
                  <span className="text-xs text-gray-400">{p.code || '—'}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* ══ ADICIONAIS ══════════════════════════════════════
            Praticamente todo copo oferece as mesmas bordas. Aplicar as
            dezoito de um em um seriam quase dois mil cliques — é
            exatamente o motivo de ninguém nunca ter cadastrado
            nenhuma. Aqui vão todas de uma vez. */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <PlusCircle size={13} /> Adicionais (bordas, canudos, tampas, tinta)
          </p>

          {itensCad.length === 0 ? (
            <p className="text-xs text-gray-400 rounded-xl border border-dashed border-gray-200 p-3">
              Nenhum item cadastrado ainda. Cadastre em <b>Cadastros › Acessórios / Bordas / Tintas</b>.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <input className="input flex-1 min-w-[160px] text-sm" placeholder="Filtrar itens…"
                  value={buscaAdic} onChange={e => setBuscaAdic(e.target.value)} />
                <button type="button" className="btn-secondary btn-sm"
                  onClick={() => setAdicionais(
                    adicionais.length === itensFiltrados.length ? [] : itensFiltrados.map(i => i.id))}>
                  {adicionais.length === itensFiltrados.length && itensFiltrados.length > 0
                    ? 'Limpar' : `Marcar ${itensFiltrados.length}`}
                </button>
              </div>

              {/* ══ AS CAIXAS DE GRUPO ═══════════════════════════
                  Um clique marca o grupo inteiro. É o que transforma
                  "aplicar as dezoito bordas" de dezoito cliques em um —
                  e é a razão de esta tela existir. */}
              {gruposAdic.length > 1 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {gruposAdic.map(g => {
                    const ids = g.itens.map(i => i.id);
                    const marcados = ids.filter(id => adicionais.includes(id)).length;
                    const todos = marcados === ids.length && ids.length > 0;
                    // PARCIAL É UM ESTADO DE VERDADE: cinco das dezoito
                    // marcadas à mão. Mostrar só "vazio" apagaria da
                    // tela o que a pessoa acabou de fazer.
                    const parcial = marcados > 0 && !todos;
                    return (
                      <button key={g.chave} type="button"
                        title={todos ? `Desmarcar as ${ids.length}` : `Marcar as ${ids.length} de uma vez`}
                        onClick={() => setAdicionais(a => (todos
                          ? a.filter(x => !ids.includes(x))
                          : [...new Set([...a, ...ids])]))}
                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition ${
                          todos ? 'bg-violet-600 border-violet-600 text-white'
                            : parcial ? 'bg-violet-50 border-violet-300 text-violet-800'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                        <span className={`w-3.5 h-3.5 rounded-[4px] border grid place-items-center shrink-0 ${
                          todos ? 'bg-white border-white text-violet-700'
                            : parcial ? 'border-violet-400 bg-white' : 'border-gray-300 bg-white'}`}>
                          {todos ? <Check size={9} strokeWidth={4} />
                            : parcial ? <span className="w-1.5 h-0.5 bg-violet-600 rounded-full" /> : null}
                        </span>
                        {g.rotulo}
                        <span className={todos ? 'opacity-80' : 'text-gray-400'}>
                          {parcial ? `${marcados}/${ids.length}` : ids.length}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* A lista, separada pelos mesmos grupos: sem o cabeçalho,
                  dezoito bordas e vinte e cinco cores continuam sendo
                  uma fieira só, e o chip de cima não teria a que
                  corresponder na hora de conferir. */}
              <div className="max-h-56 overflow-y-auto rounded-xl border border-gray-200">
                {gruposAdic.map(g => (
                  <div key={g.chave}>
                    {gruposAdic.length > 1 && (
                      <p className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 border-y border-gray-100">
                        {g.rotulo} · {g.itens.length}
                      </p>
                    )}
                    <div className="divide-y divide-gray-50">
                      {g.itens.map(i => {
                        const marcado = adicionais.includes(i.id);
                        return (
                          <button key={i.id} type="button"
                            onClick={() => setAdicionais(a => marcado ? a.filter(x => x !== i.id) : [...a, i.id])}
                            className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-sm transition ${
                              marcado ? 'bg-violet-50' : 'hover:bg-gray-50'}`}>
                            <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                              marcado ? 'bg-violet-600 border-violet-600 text-white' : 'border-gray-300'}`}>
                              {marcado && <Check size={11} />}
                            </span>
                            {/* A FOTO 25% MAIOR (28 → 35 px). Numa borda
                                mosaico a escolha é feita no olho, e o
                                quadradinho de 28 px não mostrava a
                                diferença entre "Mosaico Vermelho" e
                                "Mosaico Pink". */}
                            {i.photo_url
                              ? <img src={i.photo_url} alt="" className="w-[35px] h-[35px] rounded object-cover border border-gray-200 shrink-0" />
                              : <span className="w-[35px] h-[35px] rounded border border-gray-200 shrink-0"
                                  style={{ background: i.color_hex || '#f3f4f6' }} />}
                            <span className="flex-1 min-w-0">
                              <span className="block text-gray-900 truncate">
                                {i.color_name ? `${i.color_name} — ${i.name}` : i.name}
                              </span>
                              <span className="block text-[11px] text-gray-400">
                                custa R$ {Number(i.custo_na_peca || 0).toFixed(2).replace('.', ',')} ·
                                cobra R$ {Number(i.preco_na_peca || 0).toFixed(2).replace('.', ',')}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
                {itensFiltrados.length === 0 && (
                  <p className="p-4 text-center text-xs text-gray-400">Nenhum item com esse termo.</p>
                )}
              </div>

              {adicionais.length > 0 && (
                <div className="mt-2 space-y-2">
                  <ComoEntraNoCopo padrao={adicPadrao} onMudar={setAdicPadrao} />

                  {/* O ALCANCE ESCRITO. Regra aplicada em silêncio é
                      regra que ninguém consegue desfazer depois. */}
                  <p className="text-xs rounded-xl bg-violet-50 border border-violet-200 text-violet-900 p-2.5">
                    {alvoAdicional?.escopo === 'todos' && (
                      <><b>{adicionais.length} item(ns)</b> em <b>todos os copos personalizados</b> —
                      inclusive os que forem cadastrados depois. São {adicionais.length} regras, não uma por copo.</>
                    )}
                    {alvoAdicional?.escopo === 'categoria' && (
                      <><b>{adicionais.length} item(ns)</b> na categoria{' '}
                      <b>{(cats || []).find(c => c.id === categoryId)?.name || 'selecionada'}</b> inteira —
                      valendo também para os produtos que entrarem nela depois.</>
                    )}
                    {alvoAdicional?.escopo === 'produto' && (
                      <><b>{adicionais.length} item(ns)</b> em <b>{alvoAdicional.product_ids.length} copo(s)</b>{' '}
                      {applyAll ? 'do filtro atual' : 'selecionados'} —{' '}
                      {adicionais.length * alvoAdicional.product_ids.length} aplicações, uma por copo.
                      {' '}Vale só para estes; copo novo não herda.</>
                    )}
                  </p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Fornecedor */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fornecedor</p>
          <select className="input w-full sm:w-72" value={supplierId} onChange={e => setSupplierId(e.target.value)}>
            <option value="">— não alterar —</option>
            <option value="__none__">Limpar (sem fornecedor)</option>
            {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Custo */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Custo</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Custo de compra (R$)</label>
              <input className="input" type="number" step="0.01" value={costPrice} onChange={e => setCostPrice(e.target.value)} placeholder="—" />
            </div>
          </div>
        </div>

        {/* Tinta do copo */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Tinta do copo</p>
          <div className="flex flex-wrap gap-2">
            {[
              ['', 'Não alterar'],
              ['PP', 'PP'],
              ['PS', 'PS'],
              ['__none__', 'Limpar'],
            ].map(([v, label]) => (
              <button key={v || 'keep'} type="button" onClick={() => setInkType(v)}
                className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${inkType === v ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Publicação — as duas portas, em massa */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Onde os produtos aparecem</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TresEstados titulo="Catálogo personalizado" valor={noCatalogo} onMudar={setNoCatalogo}
              ajuda="O site de copo com arte e acabamento (/catalogo)." />
            <TresEstados titulo="Loja de copos lisos" valor={naLoja} onMudar={setNaLoja}
              ajuda="A loja de copo sem impressão (/loja)." />
          </div>
        </div>

        {/* AJUSTE POR VITRINE.
            O mesmo copo, dois preços. Na loja ele é unidade avulsa; no
            catálogo é caixa fechada, com mínimo alto e um preço que já
            embute a personalização. Em massa porque a regra costuma valer
            para a linha inteira — "no catálogo o mínimo é 100" são 97
            formulários se feito um a um. */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
            Ajuste por vitrine (não mexe no cadastro)
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select className="input" value={ambiente} onChange={e => setAmbiente(e.target.value)}>
              <option value="">— não alterar vitrine —</option>
              <option value="loja">Loja de copos lisos (/loja)</option>
              <option value="catalogo">Catálogo personalizado (/catalogo)</option>
            </select>
            {/* O preço saiu daqui: mudar o preço de trinta produtos
                de uma vez, numa tela que serve para outra coisa, era a
                forma mais rápida de o preço divergir do cadastro sem
                ninguém notar. Preço se define em Precificação. */}
            <input className="input" type="number" min="1" disabled={!ambiente}
              value={ambMinimo} onChange={e => setAmbMinimo(e.target.value)}
              placeholder="Qtd. mínima nesta vitrine" />
          </div>
          <p className="text-xs text-gray-400 mt-1">
            Vale só no site escolhido — o cadastro do produto não muda, e a outra vitrine
            continua como está. Campo em branco devolve o produto ao preço do cadastro naquele site.
          </p>
        </div>

        {/* Fiscal */}
        <div>
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Fiscal (NCM / CST / CFOP)</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input className="input" value={ncm} onChange={e => setNcm(e.target.value)} placeholder="NCM" />
            <input className="input" value={cst} onChange={e => setCst(e.target.value)} placeholder="CST / CSOSN" />
            <input className="input" value={cfop} onChange={e => setCfop(e.target.value)} placeholder="CFOP (ex.: 5101)" />
          </div>
          <p className="text-xs text-gray-400 mt-1">CFOP interno do Paraná (5101) vira 6101 automático para outros estados na NF-e.</p>
        </div>

        {/* Aplicar a todos do filtro */}
        <label className={`flex items-start gap-2 text-sm rounded-xl border p-3 cursor-pointer ${applyAll ? 'border-violet-300 bg-violet-50' : 'border-gray-200'}`}>
          <input type="checkbox" checked={applyAll} onChange={e => setApplyAll(e.target.checked)} className="mt-0.5 w-4 h-4 accent-violet-600" />
          <span>
            <span className="font-medium text-gray-800">
              Aplicar a TODOS os {totalMatching} produtos {hasFilter ? 'do filtro' : 'do catálogo'}
            </span>
            <span className="block text-xs text-gray-500 mt-0.5">
              Ignora a seleção e altera todos que casam com o filtro atual (tipo + busca), mesmo além dos {products.length} visíveis.
              {!hasFilter && <b className="text-amber-600"> Sem filtro = aplica ao catálogo inteiro.</b>}
            </span>
          </span>
        </label>

        <div className="flex flex-wrap gap-2 items-center pt-3 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={() => setDelOpen(true)} disabled={selectedIds.length === 0}
            className="flex items-center gap-1.5 text-sm font-medium text-red-600 hover:bg-red-50 rounded-lg px-3 py-2 disabled:opacity-40 disabled:hover:bg-transparent"
            title="Apagar os produtos selecionados (exige senha)">
            <Trash2 size={15} /> Apagar selecionados{selectedIds.length ? ` (${selectedIds.length})` : ''}
          </button>
          <div className="flex gap-2 ml-auto">
            <button onClick={handleClose} className="btn-secondary">Fechar</button>
            <button onClick={doApply}
              disabled={apply.isPending || !canApply}
              className="btn-primary disabled:opacity-50">
              {apply.isPending ? 'Aplicando...' : `Aplicar a ${targetCount} produto(s)`}
            </button>
          </div>
        </div>
      </div>
    </Modal>

    {/* Confirmação com resumo do que será alterado */}
    <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirmar edição em massa" size="md"
      footer={
        <>
          <button onClick={() => setConfirmOpen(false)} className="btn-secondary">Cancelar</button>
          <button onClick={confirmApply} disabled={apply.isPending} className="btn-primary disabled:opacity-50">
            {apply.isPending ? 'Aplicando...' : 'Confirmar e aplicar'}
          </button>
        </>
      }>
      {summary && (
        <div className="space-y-4 text-sm">
          <p className="text-gray-700">
            {(hasFields || temVitrine)
              ? <>Você vai alterar <b>{targetCount} produto(s)</b></>
              : <>Nenhum campo do cadastro será alterado</>}
            {(hasFields || temVitrine) && applyAll && summary.analyzed < targetCount
              ? <span className="text-gray-500"> (resumo baseado em {summary.analyzed} carregados)</span> : ''}.
          </p>
          {temVitrine && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="font-semibold text-amber-900">
                Ajuste de vitrine — {ambiente === 'loja' ? 'Loja de copos lisos' : 'Catálogo personalizado'}
              </p>
              <p className="text-amber-800 text-[13px] mt-0.5">
                {[camposAmbiente.sale_price != null && `preço R$ ${Number(camposAmbiente.sale_price).toFixed(2)}`,
                  camposAmbiente.min_order_qty != null && `mínimo ${camposAmbiente.min_order_qty}`]
                  .filter(Boolean).join(' · ')} nesta vitrine. O cadastro do produto e o outro site não mudam.
              </p>
            </div>
          )}
          {/* OS ADICIONAIS TÊM ALCANCE PRÓPRIO, e ele nem sempre é o
              conjunto de produtos selecionados: pode ser a categoria
              inteira ou o catálogo todo. Confirmar sem ler isso seria
              confirmar outra coisa. */}
          {alvoAdicional && (
            <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
              <p className="font-semibold text-violet-900">
                {adicionais.length} adicional(is) — {adicPadrao
                  ? 'já no preço do copo (a cliente não escolhe)'
                  : 'a cliente escolhe e paga à parte'}
              </p>
              <p className="text-violet-800 text-[13px] mt-0.5">
                {alvoAdicional.escopo === 'todos'
                  ? 'Vão valer para TODOS os copos personalizados, inclusive os cadastrados depois.'
                  : alvoAdicional.escopo === 'categoria'
                  ? `Vão valer para a categoria ${(cats || []).find(c => c.id === categoryId)?.name || ''} inteira, inclusive produtos que entrarem nela depois.`
                  : `Vão valer para ${alvoAdicional.product_ids.length} copo(s) — ${adicionais.length * alvoAdicional.product_ids.length} aplicações. Copo novo não herda.`}
              </p>
              <p className="text-violet-700 text-xs mt-1">
                Isto não altera o cadastro dos produtos: diz o que eles passam a oferecer.
              </p>
            </div>
          )}
          {summary.rows.length === 0 && !temVitrine && !alvoAdicional ? (
            <p className="text-gray-500">Nenhum campo preenchido para alterar.</p>
          ) : (
            <div className="space-y-3">
              {summary.rows.map(r => (
                <div key={r.key} className="rounded-lg border border-gray-200 p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-gray-800">{r.label}</span>
                    <span className="text-violet-600 font-medium">→ {r.value}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs">
                    {r.empty > 0 && <span className="text-green-600">{r.empty} serão preenchidos</span>}
                    {r.diff > 0 && <span className="text-amber-600">{r.diff} tinham outro valor (serão trocados)</span>}
                    {r.same > 0 && <span className="text-gray-500">{r.same} já têm esse valor</span>}
                  </div>
                  {r.same > 0 && (
                    <p className="mt-2 flex items-center gap-1.5 text-amber-700 bg-amber-50 rounded px-2 py-1 text-xs">
                      <AlertTriangle size={13} className="shrink-0" /> {r.same} já {r.same === 1 ? 'está preenchido' : 'estão preenchidos'} com essa informação.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
          <p className="text-gray-600">Tem certeza que deseja continuar? Esta ação não pode ser desfeita.</p>
        </div>
      )}
    </Modal>

    {/* Apagar em massa — exige a senha da conta */}
    <Modal isOpen={delOpen} onClose={() => { if (!del.isPending) { setDelOpen(false); setDelPassword(''); } }}
      title="Apagar produtos selecionados" size="sm"
      footer={
        <>
          <button onClick={() => { setDelOpen(false); setDelPassword(''); }} disabled={del.isPending} className="btn-secondary">Cancelar</button>
          <button onClick={() => del.mutate(delPassword)} disabled={del.isPending || !delPassword}
            className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5 disabled:opacity-50">
            {del.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />} Apagar {selectedIds.length}
          </button>
        </>
      }>
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 text-red-700 bg-red-50 rounded-lg p-3">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <p>Você vai apagar <b>{selectedIds.length} produto(s)</b> em definitivo. O histórico de vendas é mantido, mas o produto some do catálogo. <b>Não dá pra desfazer.</b></p>
        </div>
        <div>
          <label className="label">Senha da sua conta</label>
          <input type="password" className="input" autoFocus value={delPassword}
            onChange={e => setDelPassword(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && delPassword && !del.isPending) del.mutate(delPassword); }}
            placeholder="Digite a senha para confirmar" />
        </div>
      </div>
    </Modal>
    </>
  );
}

/**
 * "Não alterar" precisa ser um estado de verdade.
 *
 * Numa edição em massa, um checkbox de dois estados não sabe dizer a
 * diferença entre "deixe como está" e "desligue" — e a segunda leitura
 * tira do ar produtos que ninguém pediu para tirar.
 */
function TresEstados({ titulo, valor, onMudar, ajuda }) {
  return (
    <div>
      <p className="text-sm text-gray-700 mb-1.5">{titulo}</p>
      <div className="flex flex-wrap gap-2">
        {[['', 'Não alterar'], ['sim', 'Publicar'], ['nao', 'Tirar do ar']].map(([v, label]) => (
          <button key={v || 'keep'} type="button" onClick={() => onMudar(v)}
            className={`px-3 py-1.5 rounded-lg border text-sm font-medium ${
              valor === v ? 'border-violet-400 bg-violet-50 text-violet-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}>
            {label}
          </button>
        ))}
      </div>
      {ajuda && <p className="text-xs text-gray-400 mt-1">{ajuda}</p>}
    </div>
  );
}
