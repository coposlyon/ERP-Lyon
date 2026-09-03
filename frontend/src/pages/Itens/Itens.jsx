// ============================================================
// CADASTRO DE ITENS — canudo, tampa, borda, tinta, embalagem.
//
// POR QUE UMA TELA SÓ PARA COISAS TÃO DIFERENTES. Porque a pergunta é
// a mesma: "o que isto acrescenta na peça, quanto custa e quanto
// cobra". Quatro telas seriam quatro lugares para a regra de preço
// divergir. O menu abre esta mesma tela travada em um tipo —
// Acessórios, Bordas, Tintas — e quem quiser ver tudo junto entra por
// Cadastros › Itens.
//
// OS DOIS VALORES SÃO O CORAÇÃO DA TELA. `unit_cost` é o que a Lyon
// GASTA; `unit_price` é o que a Lyon COBRA. Antes só existia o
// primeiro, espalhado entre o cadastro do produto e a engenharia de
// custos — e por isso ninguém cobrava pelo canudo: ninguém sabia
// quanto ele valia na venda.
//
// A COLUNA QUE IMPORTA É "NA PEÇA", não o unitário. Tinta a R$ 0,20 o
// ml não diz nada; "entra R$ 1,00 no copo, porque gasta 5 ml" diz
// tudo. O servidor já devolve `custo_na_peca` e `preco_na_peca` prontos
// — a mesma conta que o pedido vai usar, para a tela não ter a sua.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, Pencil, Trash2, Search, Package, Layers,
  Droplet, Box, Sparkles, Image as ImageIcon, Upload, X, AlertTriangle,
  CheckSquare, Square, Tag,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { fmtBRL } from '@/lib/pricingCalc';

// ── Os tipos, na ordem em que a fábrica pensa neles ──────────
export const TIPOS = [
  { kind: 'acessorio', label: 'Acessórios', singular: 'Acessório', icon: Sparkles,
    dica: 'Canudo, tampa, alça, tag — o que a cliente escolhe e faz o preço subir.' },
  { kind: 'borda',     label: 'Bordas',     singular: 'Borda',     icon: Layers,
    dica: 'As metalizadas. Cada cor é um item, com a foto que a cliente vê.' },
  { kind: 'tinta',     label: 'Tintas',     singular: 'Tinta',     icon: Droplet,
    dica: 'Medida em ml, com o consumo por peça. Entra sempre no custo do personalizado.' },
  { kind: 'embalagem', label: 'Embalagem',  singular: 'Embalagem', icon: Box,
    dica: 'Caixa, sacola, plástico — o que sai junto com o pedido.' },
  { kind: 'outro',     label: 'Outros',     singular: 'Item',      icon: Package,
    dica: 'O que aparecer amanhã e não couber acima.' },
];
const TIPO = k => TIPOS.find(t => t.kind === k) || TIPOS[4];

const UNIDADES = [
  { v: 'un',    label: 'unidade' },
  { v: 'ml',    label: 'mililitro (ml)' },
  { v: 'g',     label: 'grama (g)' },
  { v: 'm',     label: 'metro (m)' },
  { v: 'folha', label: 'folha' },
];

// Número em português: aceita "0,15" e "0.15", devolve number.
const num = s => {
  if (s === '' || s == null) return 0;
  const n = parseFloat(String(s).replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
// Dinheiro miúdo: R$ 0,20 o ml não cabe em duas casas quando vira
// R$ 0,0083 a unidade. Mostra o que precisa e corta o resto.
const fmtMiudo = v => {
  const n = Number(v) || 0;
  const casas = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
};
const fmtQtd = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 6 });

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

// ─── A bolinha da cor / a foto ───────────────────────────────
// A foto ganha da cor quando existe: numa borda mosaico, a cor é uma
// aproximação e a foto é o produto.
function Amostra({ item, size = 40 }) {
  const s = { width: size, height: size };
  if (item.photo_url) {
    return <img src={item.photo_url} alt={item.name} style={s}
      className="rounded-lg object-cover border border-gray-200 shrink-0" />;
  }
  if (item.color_hex) {
    return <span style={{ ...s, background: item.color_hex }}
      className="rounded-lg border border-gray-200 shrink-0 inline-block" />;
  }
  return (
    <span style={s} className="rounded-lg border border-dashed border-gray-200 bg-gray-50 shrink-0 grid place-items-center text-gray-300">
      <ImageIcon size={size / 2.5} />
    </span>
  );
}

// ════════════════════════════════════════════════════════════
// FORMULÁRIO DO ITEM
// ════════════════════════════════════════════════════════════
function FormItem({ item, kindPadrao, onClose, onSaved }) {
  const novo = !item?.id;
  const [f, setF] = useState(() => ({
    kind:         item?.kind || kindPadrao || 'acessorio',
    name:         item?.name || '',
    color_name:   item?.color_name || '',
    color_hex:    item?.color_hex || '',
    photo_url:    item?.photo_url || '',
    base_unit:    item?.base_unit || 'un',
    package_qty:  item?.package_qty  != null ? String(item.package_qty).replace('.', ',') : '',
    package_cost: item?.package_cost != null ? String(item.package_cost).replace('.', ',') : '',
    unit_cost:    item?.unit_cost    != null ? String(item.unit_cost).replace('.', ',') : '',
    unit_price:   item?.unit_price   != null ? String(item.unit_price).replace('.', ',') : '',
    consumo:      item?.consumo      != null ? String(item.consumo).replace('.', ',') : '1',
    notes:        item?.notes || '',
    is_active:    item?.is_active !== false,
  }));
  const [salvando, setSalvando] = useState(false);
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));

  // A MESMA CONTA DO SERVIDOR, ANTES DE SALVAR. Sem isto, quem digita
  // "pote de 900 ml por R$ 180" só descobre que dá R$ 0,20 o ml depois
  // de gravar — e é justamente aí que o erro de digitação aparece.
  const custoUn = useMemo(() => {
    const q = num(f.package_qty);
    return q > 0 ? num(f.package_cost) / q : num(f.unit_cost);
  }, [f.package_qty, f.package_cost, f.unit_cost]);
  const consumo   = num(f.consumo) > 0 ? num(f.consumo) : 1;
  const custoPeca = custoUn * consumo;
  const precoPeca = num(f.unit_price) * consumo;
  const margem    = precoPeca - custoPeca;

  async function escolherFoto(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 5 MB)'); return; }
    set('photo_url', await fileToDataUrl(file));
  }

  async function salvar() {
    if (!f.name.trim()) { toast.error('Informe o nome do item'); return; }
    setSalvando(true);
    try {
      const corpo = {
        ...f,
        package_qty:  f.package_qty  === '' ? null : num(f.package_qty),
        package_cost: f.package_cost === '' ? null : num(f.package_cost),
        unit_cost:    custoUn,
        unit_price:   num(f.unit_price),
        consumo,
      };
      if (novo) await api.post('/itens', corpo);
      else await api.put(`/itens/${item.id}`, corpo);
      toast.success(novo ? 'Item cadastrado!' : 'Item atualizado!');
      onSaved();
    } catch (err) {
      toast.error(err.error || 'Erro ao salvar');
    } finally { setSalvando(false); }
  }

  const t = TIPO(f.kind);

  return (
    <Modal
      isOpen onClose={onClose} size="lg" closeOnBackdrop={false}
      title={novo ? `Novo ${t.singular.toLowerCase()}` : `Editar ${f.name}`}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={salvar} disabled={salvando}>
          {salvando ? <Loader2 size={15} className="animate-spin" /> : 'Salvar'}
        </button>
      </>}
    >
      <div className="space-y-4 text-sm">
        {/* ── identidade ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Tipo</label>
            <select className="input" value={f.kind} onChange={e => set('kind', e.target.value)}>
              {TIPOS.map(x => <option key={x.kind} value={x.kind}>{x.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Unidade de medida</label>
            <select className="input" value={f.base_unit} onChange={e => set('base_unit', e.target.value)}>
              {UNIDADES.map(u => <option key={u.v} value={u.v}>{u.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="label">Nome *</label>
            <input className="input" value={f.name} onChange={e => set('name', e.target.value)}
              placeholder={f.kind === 'tinta' ? 'Tinta plastisol' : f.kind === 'borda' ? 'Borda metalizada' : 'Canudo'} />
          </div>
          <div>
            <label className="label">Cor</label>
            <div className="flex gap-2">
              <input className="input flex-1" value={f.color_name} onChange={e => set('color_name', e.target.value)}
                placeholder="Preto, Rosa Pink…" />
              <input type="color" className="w-11 h-[38px] rounded-lg border border-gray-200 cursor-pointer shrink-0"
                value={f.color_hex || '#cccccc'} onChange={e => set('color_hex', e.target.value)} title="Cor aproximada" />
            </div>
          </div>
        </div>

        {/* ── foto ── */}
        <div className="flex items-center gap-3">
          <Amostra item={f} size={56} />
          <div className="flex flex-wrap gap-2">
            <label className="btn-secondary cursor-pointer text-xs">
              <Upload size={13} /> {f.photo_url ? 'Trocar foto' : 'Enviar foto'}
              <input type="file" accept="image/*" className="hidden" onChange={escolherFoto} />
            </label>
            {f.photo_url && (
              <button className="btn-ghost text-xs text-red-500" onClick={() => set('photo_url', '')}>
                <X size={13} /> Remover
              </button>
            )}
          </div>
        </div>

        {/* ── o que gastamos ── */}
        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">O que nós gastamos</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Qtd. da embalagem</label>
              <input className="input" value={f.package_qty} onChange={e => set('package_qty', e.target.value)}
                placeholder="900" inputMode="decimal" />
            </div>
            <div>
              <label className="label">Preço pago (R$)</label>
              <input className="input" value={f.package_cost} onChange={e => set('package_cost', e.target.value)}
                placeholder="180,00" inputMode="decimal" />
            </div>
            <div>
              <label className="label">Custo por {f.base_unit}</label>
              <input
                className={`input ${num(f.package_qty) > 0 ? 'bg-gray-50 text-gray-500' : ''}`}
                value={num(f.package_qty) > 0 ? custoUn.toFixed(6).replace('.', ',') : f.unit_cost}
                onChange={e => set('unit_cost', e.target.value)}
                readOnly={num(f.package_qty) > 0}
                placeholder="0,18" inputMode="decimal"
              />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Preencheu a embalagem? O custo por {f.base_unit} sai da divisão e se corrige sozinho no
            próximo reajuste. Se você compra por unidade, deixe a embalagem em branco e digite o custo direto.
          </p>
        </div>

        {/* ── o que cobramos ── */}
        <div className="rounded-xl border border-primary-200 bg-primary-50/40 p-3 space-y-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-primary-700">O que nós cobramos</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Preço por {f.base_unit} (R$)</label>
              <input className="input" value={f.unit_price} onChange={e => set('unit_price', e.target.value)}
                placeholder="0,50" inputMode="decimal" />
            </div>
            <div>
              <label className="label">Consumo por peça ({f.base_unit})</label>
              <input className="input" value={f.consumo} onChange={e => set('consumo', e.target.value)}
                placeholder={f.base_unit === 'ml' ? '5' : '1'} inputMode="decimal" />
            </div>
          </div>
        </div>

        {/* ── o resultado, que é o que interessa ── */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5">
            <p className="text-[10px] uppercase text-gray-500">Custa na peça</p>
            <p className="font-semibold text-gray-900">{fmtMiudo(custoPeca)}</p>
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-200 p-2.5">
            <p className="text-[10px] uppercase text-gray-500">Cobra na peça</p>
            <p className="font-semibold text-gray-900">{fmtMiudo(precoPeca)}</p>
          </div>
          <div className={`rounded-xl border p-2.5 ${margem < 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'}`}>
            <p className="text-[10px] uppercase text-gray-500">Sobra</p>
            <p className={`font-semibold ${margem < 0 ? 'text-red-700' : 'text-green-700'}`}>{fmtMiudo(margem)}</p>
          </div>
        </div>
        {margem < 0 && (
          <p className="flex items-start gap-1.5 text-xs text-red-600">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            Você está cobrando menos do que gasta neste item.
          </p>
        )}

        <div>
          <label className="label">Observações</label>
          <textarea className="input" rows={2} value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input type="checkbox" checked={f.is_active} onChange={e => set('is_active', e.target.checked)} />
          Item ativo
        </label>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// APLICAR EM MASSA — é isto que o pedido "quero em todos os copos" vira.
//
// Uma linha ligando o item a uma CATEGORIA vale para os produtos todos
// dela; com os dois alvos vazios, vale para o catálogo personalizado
// inteiro. Vinte e quatro copos deixam de ser vinte e quatro cliques.
// ════════════════════════════════════════════════════════════
function AplicarEmMassa({ itens, onClose, onOk }) {
  const [escopo, setEscopo] = useState('todos');
  const [categoryId, setCategoryId] = useState('');
  const [padrao, setPadrao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: categorias = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get('/products/categories/list'),
  });

  async function aplicar() {
    if (escopo === 'categoria' && !categoryId) { toast.error('Escolha a categoria'); return; }
    setSalvando(true);
    try {
      const r = await api.post('/itens/aplicacoes', {
        item_ids: itens.map(i => i.id),
        escopo,
        category_id: escopo === 'categoria' ? categoryId : null,
        padrao,
      });
      toast.success(`${r.aplicados} aplicaç${r.aplicados === 1 ? 'ão' : 'ões'} gravada${r.aplicados === 1 ? '' : 's'}!`);
      onOk();
    } catch (err) {
      toast.error(err.error || 'Erro ao aplicar');
    } finally { setSalvando(false); }
  }

  return (
    <Modal isOpen onClose={onClose} size="md" title={`Aplicar ${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`}
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button className="btn-primary" onClick={aplicar} disabled={salvando}>
          {salvando ? <Loader2 size={15} className="animate-spin" /> : 'Aplicar'}
        </button>
      </>}
    >
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap gap-1.5">
          {itens.map(i => (
            <span key={i.id} className="inline-flex items-center gap-1.5 rounded-lg bg-gray-100 px-2 py-1 text-xs">
              <Amostra item={i} size={16} />
              {i.name}{i.color_name ? ` · ${i.color_name}` : ''}
            </span>
          ))}
        </div>

        <div className="space-y-2">
          <label className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer ${escopo === 'todos' ? 'border-primary-400 bg-primary-50/50' : 'border-gray-200'}`}>
            <input type="radio" className="mt-1" checked={escopo === 'todos'} onChange={() => setEscopo('todos')} />
            <span>
              <b>Todos os copos personalizados</b>
              <span className="block text-xs text-gray-500">Vale para o catálogo inteiro, inclusive os que forem cadastrados depois.</span>
            </span>
          </label>

          <label className={`flex items-start gap-2.5 rounded-xl border p-3 cursor-pointer ${escopo === 'categoria' ? 'border-primary-400 bg-primary-50/50' : 'border-gray-200'}`}>
            <input type="radio" className="mt-1" checked={escopo === 'categoria'} onChange={() => setEscopo('categoria')} />
            <span className="flex-1">
              <b>Uma categoria só</b>
              <span className="block text-xs text-gray-500 mb-2">Ex.: só os Long Drink levam canudo.</span>
              <select className="input" value={categoryId} disabled={escopo !== 'categoria'}
                onChange={e => setCategoryId(e.target.value)}>
                <option value="">Escolha a categoria…</option>
                {categorias.map(c => (
                  <option key={c.id} value={c.id}>{c.name} ({c.product_count})</option>
                ))}
              </select>
            </span>
          </label>
        </div>

        <label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-xl border border-gray-200 p-3">
          <input type="checkbox" className="mt-0.5" checked={padrao} onChange={e => setPadrao(e.target.checked)} />
          <span>
            <b>Já vem no preço</b>
            <span className="block text-xs text-gray-500">
              Marcado, o item entra sempre no custo da peça (é o caso da tinta). Desmarcado, é
              opcional: a cliente escolhe e o preço sobe só no pedido dela.
            </span>
          </span>
        </label>
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// A TELA
// ════════════════════════════════════════════════════════════
export default function Itens({ kind = null }) {
  const qc = useQueryClient();
  const [aba, setAba] = useState(kind);          // null = todos os tipos
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState(null); // objeto = editar; {} = novo
  const [marcados, setMarcados] = useState([]);
  const [aplicando, setAplicando] = useState(false);

  const tipoAtual = kind || aba;

  const { data: itens = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['itens', tipoAtual || 'todos'],
    queryFn: () => api.get('/itens', { params: tipoAtual ? { kind: tipoAtual } : {} }),
  });

  // Onde cada item já está aplicado — o que dá o "em 3 categorias" da lista.
  const { data: aplicacoes = [] } = useQuery({
    queryKey: ['item-aplicacoes'],
    queryFn: () => api.get('/itens/aplicacoes'),
  });
  const aplicPorItem = useMemo(() => {
    const m = new Map();
    for (const a of aplicacoes) m.set(a.item_id, [...(m.get(a.item_id) || []), a]);
    return m;
  }, [aplicacoes]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    if (!t) return itens;
    return itens.filter(i =>
      `${i.name} ${i.color_name || ''}`.toLowerCase().includes(t));
  }, [itens, busca]);

  const selecionados = useMemo(
    () => lista.filter(i => marcados.includes(i.id)), [lista, marcados]);

  function alternar(id) {
    setMarcados(m => m.includes(id) ? m.filter(x => x !== id) : [...m, id]);
  }

  async function apagar(item) {
    if (!confirm(`Apagar "${item.name}"? As aplicações dele saem junto.`)) return;
    try {
      await api.delete(`/itens/${item.id}`);
      toast.success('Item apagado');
      qc.invalidateQueries({ queryKey: ['itens'] });
      qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
    } catch (err) { toast.error(err.error || 'Erro ao apagar'); }
  }

  const t = tipoAtual ? TIPO(tipoAtual) : null;
  const Icone = t?.icon || Package;

  return (
    <div className="space-y-4">
      {/* ── cabeçalho ── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Icone size={22} className="text-primary-600" />
            {t ? t.label : 'Itens'}
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            {t ? t.dica : 'Tudo que entra num copo — com o que se gasta e o que se cobra.'}
          </p>
        </div>
        <button className="btn-primary shrink-0" onClick={() => setEditando({})}>
          <Plus size={16} /> Novo item
        </button>
      </div>

      {/* ── abas por tipo (só quando a tela não vem travada) ── */}
      {!kind && (
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          <button
            onClick={() => setAba(null)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              aba === null ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >Todos</button>
          {TIPOS.map(x => (
            <button key={x.kind} onClick={() => setAba(x.kind)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                aba === x.kind ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
            >{x.label}</button>
          ))}
        </div>
      )}

      {/* ── busca + ação em massa ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar por nome ou cor…"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {selecionados.length > 0 && (
          <button className="btn-primary shrink-0" onClick={() => setAplicando(true)}>
            <Tag size={15} /> Aplicar {selecionados.length} em…
          </button>
        )}
        {lista.length > 0 && (
          <button className="btn-secondary shrink-0"
            onClick={() => setMarcados(marcados.length === lista.length ? [] : lista.map(i => i.id))}>
            {marcados.length === lista.length ? <Square size={15} /> : <CheckSquare size={15} />}
            {marcados.length === lista.length ? 'Limpar' : 'Marcar todos'}
          </button>
        )}
      </div>

      {/* ── a lista ── */}
      {isLoading ? (
        <div className="py-16 text-center text-gray-400">
          <Loader2 size={22} className="animate-spin mx-auto mb-2" /> Carregando…
        </div>
      ) : isError ? (
        <div className="py-12 text-center">
          <AlertTriangle size={22} className="mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-gray-600">{error?.error || 'Não foi possível carregar os itens.'}</p>
          <button className="btn-secondary mt-3" onClick={() => refetch()}>Tentar de novo</button>
        </div>
      ) : lista.length === 0 ? (
        <div className="py-16 text-center text-gray-400">
          <Package size={26} className="mx-auto mb-2" />
          <p className="text-sm">Nenhum item cadastrado{busca ? ' com esse termo' : ''}.</p>
        </div>
      ) : (
        // MOBILE PRIMEIRO: cartões que cabem na tela do celular, sem
        // arrastar para o lado. No desktop viram grade de três.
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
          {lista.map(i => {
            const aplic = aplicPorItem.get(i.id) || [];
            const marcado = marcados.includes(i.id);
            const negativo = Number(i.margem_na_peca) < 0;
            return (
              <div key={i.id}
                className={`rounded-xl border p-3 bg-white transition ${
                  marcado ? 'border-primary-400 ring-1 ring-primary-200' : 'border-gray-200'}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => alternar(i.id)} className="mt-0.5 shrink-0 text-gray-400 hover:text-primary-600">
                    {marcado ? <CheckSquare size={17} className="text-primary-600" /> : <Square size={17} />}
                  </button>
                  <Amostra item={i} size={44} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{i.name}</p>
                    <p className="text-xs text-gray-500 truncate">
                      {i.color_name || TIPO(i.kind).label}
                      {i.consumo != 1 && ` · ${fmtQtd(i.consumo)} ${i.base_unit}/peça`}
                    </p>
                  </div>
                  <div className="flex gap-0.5 shrink-0">
                    <button className="btn-ghost p-1.5" onClick={() => setEditando(i)} title="Editar">
                      <Pencil size={14} />
                    </button>
                    <button className="btn-ghost p-1.5 text-red-500" onClick={() => apagar(i)} title="Apagar">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="mt-2.5 grid grid-cols-3 gap-1.5 text-center">
                  <div className="rounded-lg bg-gray-50 py-1.5">
                    <p className="text-[9px] uppercase text-gray-500">Custa</p>
                    <p className="text-xs font-semibold text-gray-800">{fmtMiudo(i.custo_na_peca)}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 py-1.5">
                    <p className="text-[9px] uppercase text-gray-500">Cobra</p>
                    <p className="text-xs font-semibold text-gray-800">{fmtMiudo(i.preco_na_peca)}</p>
                  </div>
                  <div className={`rounded-lg py-1.5 ${negativo ? 'bg-red-50' : 'bg-green-50'}`}>
                    <p className="text-[9px] uppercase text-gray-500">Sobra</p>
                    <p className={`text-xs font-semibold ${negativo ? 'text-red-700' : 'text-green-700'}`}>
                      {fmtMiudo(i.margem_na_peca)}
                    </p>
                  </div>
                </div>

                {aplic.length > 0 && (
                  <p className="mt-2 text-[11px] text-gray-500">
                    Aplicado em{' '}
                    {aplic.some(a => !a.category_id && !a.product_id)
                      ? 'todos os personalizados'
                      : `${aplic.length} ${aplic.length === 1 ? 'destino' : 'destinos'}`}
                    {aplic.some(a => a.padrao) && ' · já vem no preço'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editando && (
        <FormItem
          item={editando.id ? editando : null}
          kindPadrao={tipoAtual}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['itens'] }); }}
        />
      )}
      {aplicando && (
        <AplicarEmMassa
          itens={selecionados}
          onClose={() => setAplicando(false)}
          onOk={() => {
            setAplicando(false); setMarcados([]);
            qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
          }}
        />
      )}
    </div>
  );
}
