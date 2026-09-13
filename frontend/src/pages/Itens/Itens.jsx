// ============================================================
// CADASTRO DE ITENS — cores, bordas e sub-produtos (tampa, canudo).
//
// POR QUE UMA TELA SÓ PARA COISAS TÃO DIFERENTES. Porque a pergunta é
// a mesma: "o que isto acrescenta na peça, quanto custa e quanto
// cobra". Quatro telas seriam quatro lugares para a regra de preço
// divergir. Produtos abre esta mesma tela travada em um tipo — Cores,
// Bordas, Sub-Produtos. (A aba Itens, com tudo junto, e a de Tintas
// saíram: repetiam o que as outras já mostravam.)
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
  Plus, Loader2, Pencil, Trash2, Search, Package, Layers, Sparkles,
  Image as ImageIcon, Upload, X, AlertTriangle, CheckSquare, Square, Tag,
  Check, Images, Palette,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import ComoEntraNoCopo from '@/components/UI/ComoEntraNoCopo';
import { fmtBRL } from '@/lib/pricingCalc';

// ── Os tipos, na ordem em que a fábrica pensa neles ──────────
export const TIPOS = [
  { kind: 'cor',       label: 'Cores',      singular: 'Cor',       icon: Palette,
    dica: 'A cor da peça crua. Cada copo do cadastro aponta para uma cor daqui.' },
  // SUB-PRODUTO É O `acessorio` DO BANCO. O nome mudou na tela; Tampa e
  // Canudo são os mesmos cadastros. Precisou de outro (alça, tag), é
  // aqui também.
  { kind: 'acessorio', label: 'Sub-Produtos', singular: 'Sub-produto', icon: Sparkles,
    dica: 'Tampas e canudos — o que vai junto com o copo. Cadastre outro sub-produto aqui se precisar.' },
  { kind: 'borda',     label: 'Bordas',     singular: 'Borda',     icon: Layers,
    dica: 'As metalizadas. Cada cor é um item, com a foto que a cliente vê.' },
  // TINTA, EMBALAGEM E OUTROS SAÍRAM DA TELA. Estavam sem nenhum
  // cadastro, e Tintas repetia o papel de Cores. O banco ainda aceita
  // esses tipos (a rota não mudou); só não há mais onde criá-los.
];
// Tipo que não está na lista (algum antigo) mostra um nome neutro, e não
// o rótulo de outro tipo.
const TIPO = k => TIPOS.find(t => t.kind === k)
  || { kind: k, label: 'Itens', singular: 'Item', icon: Package, dica: '' };

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
function FormItem({ item, kindPadrao, kindTravado, onClose, onSaved }) {
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
            {/* TELA DE SUB-PRODUTOS NÃO CADASTRA BORDA.
                O seletor aberto deixava criar uma borda de dentro dos
                Acessórios — e ela sumia na hora de salvar, porque a
                lista da tela filtra por tipo. O item existia e ninguém
                achava. Onde a tela já tem um tipo, o tipo é aquele. */}
            {kindTravado ? (
              <p className="input bg-gray-50 text-gray-600 flex items-center">
                {TIPO(f.kind).label}
              </p>
            ) : (
              <select className="input" value={f.kind} onChange={e => set('kind', e.target.value)}>
                {TIPOS.map(x => <option key={x.kind} value={x.kind}>{x.label}</option>)}
              </select>
            )}
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
              placeholder={f.kind === 'borda' ? 'Borda metalizada' : f.kind === 'cor' ? 'Azul Bic' : 'Canudo'} />
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

        <ComoEntraNoCopo padrao={padrao} onMudar={setPadrao} />
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// ENVIO DE FOTOS EM MASSA — a pasta inteira de uma vez.
//
// Dezoito bordas são dezoito vezes: abrir, enviar, salvar, fechar. É o
// tipo de tarefa que ninguém termina — para na sexta e as últimas
// ficam sem foto para sempre. Aqui se escolhe a pasta e o sistema
// adivinha, pelo nome do arquivo, a qual item cada foto pertence.
//
// MAS ADIVINHAR NÃO É DECIDIR. O palpite aparece numa lista, com a
// miniatura ao lado do item escolhido e um seletor para corrigir o que
// ficou errado. Subir dezoito fotos trocadas em silêncio seria pior do
// que não subir nenhuma: a foto errada não parece erro, parece
// catálogo.
//
// COMO O PALPITE FUNCIONA. "mosaico prata.jpg" tem que cair em Mosaico
// Prata e não em Prata — e "prata.jpg" no contrário. Por isso a nota
// olha os dois lados: quanto do nome do ITEM o arquivo cobre, e quanto
// do ARQUIVO o item explica. Cobrir tudo dos dois lados ganha de
// cobrir metade de um.
// ════════════════════════════════════════════════════════════

// Palavras que aparecem em todo arquivo e não distinguem nada. Sem
// isto, "borda-metalizada-prata.jpg" casaria igualmente bem com as
// dezoito, porque dezoito são "borda metalizada".
const RUIDO = new Set([
  'borda', 'bordas', 'metalizada', 'metalizado', 'metalica', 'copo', 'copos',
  'foto', 'fotos', 'img', 'image', 'imagem', 'whatsapp', 'photo', 'jpg', 'jpeg',
  'png', 'webp', 'final', 'novo', 'nova', 'editado', 'screenshot', 'captura',
]);

const semAcento = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/** Nome de arquivo → palavras que significam alguma coisa. */
function palavras(texto, tirarRuido = false) {
  return semAcento(texto)
    .toLowerCase()
    .replace(/\.[a-z0-9]{2,4}$/, '')        // a extensão
    .split(/[^a-z0-9]+/)
    .filter(p => p.length > 1 && !/^\d+$/.test(p))   // "01", "2" não dizem nada
    .filter(p => !(tirarRuido && RUIDO.has(p)));
}

/**
 * A nota de um item para um arquivo.
 *
 * Os dois lados pesam: `cobertura` é quanto do nome do item o arquivo
 * contém (é o que faz "mosaico prata" ganhar de "prata" no arquivo
 * "mosaico prata.jpg"), e `precisao` é quanto do arquivo o item
 * explica (é o que faz "prata" ganhar em "prata.jpg"). Zero acerto é
 * zero: sem nenhuma palavra em comum não há palpite, e é melhor pedir
 * para a pessoa escolher do que chutar.
 */
function nota(item, doArquivo) {
  const doItem = palavras(`${item.color_name || ''} ${item.name || ''}`, true);
  if (!doItem.length || !doArquivo.length) return 0;
  const acertos = doItem.filter(p => doArquivo.includes(p)).length;
  if (!acertos) return 0;
  const cobertura = acertos / doItem.length;
  const precisao  = acertos / doArquivo.length;
  return cobertura * 2 + precisao;
}

function melhorPalpite(nomeArquivo, itens) {
  const doArquivo = palavras(nomeArquivo, true);
  let melhor = null, melhorNota = 0, segundaNota = 0;
  for (const i of itens) {
    const n = nota(i, doArquivo);
    if (n > melhorNota) { segundaNota = melhorNota; melhorNota = n; melhor = i; }
    else if (n > segundaNota) segundaNota = n;
  }
  return {
    item: melhorNota > 0 ? melhor : null,
    // EMPATE NÃO É PALPITE. Duas notas iguais querem dizer que o nome
    // do arquivo não decide — a pessoa decide.
    duvidoso: melhorNota > 0 && melhorNota - segundaNota < 0.35,
  };
}

function FotosEmMassa({ itens, onClose, onOk }) {
  const [fila, setFila] = useState([]);      // { id, nome, dataUrl, itemId, duvidoso, estado }
  const [enviando, setEnviando] = useState(false);
  const [feitos, setFeitos] = useState(0);

  async function escolherArquivos(e) {
    const arquivos = [...(e.target.files || [])].filter(f => f.type.startsWith('image/'));
    e.target.value = '';
    if (!arquivos.length) { toast.error('Nenhuma imagem na seleção'); return; }
    if (arquivos.length > 100) { toast.error('Máximo de 100 fotos por vez'); return; }

    const usados = new Set();
    const nova = [];
    for (const f of arquivos) {
      if (f.size > 5 * 1024 * 1024) {
        nova.push({ id: `${f.name}-${f.size}`, nome: f.name, dataUrl: null, itemId: '', duvidoso: false, estado: 'grande' });
        continue;
      }
      const palpite = melhorPalpite(f.name, itens);
      // UM ITEM NÃO RECEBE DUAS FOTOS. Se o palpite já foi usado, a
      // segunda foto fica sem dono em vez de sobrescrever a primeira.
      const livre = palpite.item && !usados.has(palpite.item.id) ? palpite.item : null;
      if (livre) usados.add(livre.id);
      nova.push({
        id: `${f.name}-${f.size}`,
        nome: f.name,
        dataUrl: await fileToDataUrl(f),
        itemId: livre?.id || '',
        duvidoso: palpite.duvidoso || (!!palpite.item && !livre),
        estado: 'pendente',
      });
    }
    setFila(nova);
    setFeitos(0);
  }

  const prontos = fila.filter(f => f.itemId && f.estado !== 'grande');
  const semDono = fila.filter(f => !f.itemId && f.estado !== 'grande').length;
  const grandes = fila.filter(f => f.estado === 'grande').length;

  async function enviar() {
    if (!prontos.length) { toast.error('Nenhuma foto pronta para enviar'); return; }
    setEnviando(true);
    let ok = 0, erro = 0;
    // UMA DE CADA VEZ, de propósito: dezoito uploads em paralelo
    // derrubam o limite do servidor e voltam metade com erro — e aí
    // ninguém sabe quais subiram.
    for (const f of prontos) {
      try {
        await api.patch(`/itens/${f.itemId}/foto`, { photo_url: f.dataUrl });
        ok++;
        setFila(l => l.map(x => (x.id === f.id ? { ...x, estado: 'enviado' } : x)));
      } catch {
        erro++;
        setFila(l => l.map(x => (x.id === f.id ? { ...x, estado: 'erro' } : x)));
      }
      setFeitos(n => n + 1);
    }
    setEnviando(false);
    if (ok) toast.success(`${ok} foto${ok === 1 ? '' : 's'} no lugar!`);
    if (erro) toast.error(`${erro} não subiu${erro === 1 ? '' : 'ram'} — tente de novo.`);
    if (ok && !erro) onOk();
    else if (ok) onOk({ manterAberto: true });
  }

  return (
    <Modal isOpen onClose={onClose} size="xl" closeOnBackdrop={false}
      title="Enviar fotos em massa"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>{fila.length ? 'Fechar' : 'Cancelar'}</button>
        <button className="btn-primary" onClick={enviar} disabled={enviando || !prontos.length}>
          {enviando
            ? <><Loader2 size={15} className="animate-spin" /> {feitos}/{prontos.length}</>
            : `Enviar ${prontos.length || ''} foto${prontos.length === 1 ? '' : 's'}`}
        </button>
      </>}
    >
      <div className="space-y-4 text-sm">
        <div className="rounded-xl border border-dashed border-gray-300 p-5 text-center">
          <Upload size={22} className="mx-auto mb-2 text-gray-400" />
          <p className="text-gray-700 font-medium">Escolha a pasta inteira de uma vez</p>
          <p className="text-xs text-gray-500 mt-0.5 mb-3">
            Selecione todos os arquivos (Ctrl+A na pasta). O sistema adivinha de quem é cada
            foto pelo nome do arquivo — e você confere antes de subir.
          </p>
          <label className="btn-primary cursor-pointer inline-flex">
            <Upload size={15} /> Escolher fotos
            <input type="file" accept="image/*" multiple className="hidden" onChange={escolherArquivos} />
          </label>
        </div>

        {fila.length > 0 && (
          <>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-gray-600"><b>{prontos.length}</b> prontas</span>
              {semDono > 0 && <span className="text-amber-600"><b>{semDono}</b> sem item escolhido</span>}
              {grandes > 0 && <span className="text-red-600"><b>{grandes}</b> acima de 5 MB</span>}
            </div>

            <div className="max-h-96 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {fila.map(f => (
                <div key={f.id} className="flex items-center gap-2.5 p-2.5">
                  {f.dataUrl
                    ? <img src={f.dataUrl} alt="" className="w-11 h-11 rounded-lg object-cover border border-gray-200 shrink-0" />
                    : <span className="w-11 h-11 rounded-lg border border-dashed border-red-200 bg-red-50 grid place-items-center shrink-0 text-red-400"><X size={16} /></span>}

                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-500 truncate">{f.nome}</p>
                    {f.estado === 'grande' ? (
                      <p className="text-xs text-red-600">Imagem acima de 5 MB — reduza e tente de novo.</p>
                    ) : (
                      <select
                        className={`input text-sm mt-0.5 ${!f.itemId ? 'border-amber-300' : f.duvidoso ? 'border-amber-200' : ''}`}
                        value={f.itemId}
                        onChange={e => setFila(l => l.map(x => (x.id === f.id ? { ...x, itemId: e.target.value, duvidoso: false } : x)))}
                        disabled={enviando || f.estado === 'enviado'}
                      >
                        <option value="">— escolha o item —</option>
                        {itens.map(i => (
                          <option key={i.id} value={i.id}>
                            {i.color_name ? `${i.color_name} — ${i.name}` : i.name}
                            {i.photo_url ? ' (já tem foto)' : ''}
                          </option>
                        ))}
                      </select>
                    )}
                    {f.duvidoso && f.estado === 'pendente' && (
                      <p className="text-[11px] text-amber-600 mt-0.5">
                        Palpite incerto — confira antes de enviar.
                      </p>
                    )}
                  </div>

                  <span className="shrink-0 w-6 text-center">
                    {f.estado === 'enviado' && <Check size={16} className="text-green-600" />}
                    {f.estado === 'erro' && <AlertTriangle size={16} className="text-red-500" />}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-gray-400">
              A foto substitui a que o item já tiver. Nada mais do cadastro é alterado — preço,
              consumo e fornecedor ficam como estão.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// ONDE ESTE ITEM SE APLICA — e como tirar.
//
// APLICAR SEM PODER DESAPLICAR É UMA PORTA DE MÃO ÚNICA. Marcar as
// dezoito bordas em todos os copos é um clique; descobrir depois que
// foi cedo demais e não ter onde desfazer é o tipo de coisa que faz
// alguém parar de usar a tela inteira. Cada regra tem seu lixo aqui.
// ════════════════════════════════════════════════════════════
function OndeSeAplica({ item, aplicacoes, categorias, onClose, onMudou }) {
  const [apagando, setApagando] = useState(null);

  async function remover(a) {
    const onde = a.category_id
      ? `a categoria ${categorias.find(c => c.id === a.category_id)?.name || ''}`
      : a.product_id ? 'aquele copo' : 'TODOS os copos personalizados';
    if (!confirm(`Tirar "${item.name}" de ${onde}?`)) return;
    setApagando(a.id);
    try {
      await api.delete(`/itens/aplicacoes/${a.id}`);
      toast.success('Regra removida');
      onMudou();
    } catch (err) {
      toast.error(err.error || 'Erro ao remover');
    } finally { setApagando(null); }
  }

  const rotulo = a => a.category_id
    ? { t: categorias.find(c => c.id === a.category_id)?.name || 'Uma categoria', s: 'a categoria inteira', cls: 'bg-sky-100 text-sky-700' }
    : a.product_id
      ? { t: 'Um copo específico', s: 'só aquele produto', cls: 'bg-violet-100 text-violet-700' }
      : { t: 'Todos os personalizados', s: 'inclusive os cadastrados depois', cls: 'bg-gray-100 text-gray-700' };

  return (
    <Modal isOpen onClose={onClose} size="md" title={`Onde "${item.name}" se aplica`}
      footer={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      <div className="space-y-2 text-sm">
        {aplicacoes.length === 0 ? (
          <p className="text-gray-500 py-6 text-center">
            Este item ainda não foi aplicado em copo nenhum.
          </p>
        ) : aplicacoes.map(a => {
          const r = rotulo(a);
          return (
            <div key={a.id} className="flex items-center gap-2.5 rounded-xl border border-gray-200 p-2.5">
              <span className="flex-1 min-w-0">
                <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] mr-1.5 ${r.cls}`}>{r.t}</span>
                <span className="text-xs text-gray-500">{r.s}</span>
                <span className="block text-[11px] text-gray-400 mt-0.5">
                  {a.padrao ? 'já está no preço do copo — a cliente não escolhe' : 'a cliente escolhe e paga à parte'}
                </span>
              </span>
              <button className="btn-ghost p-1.5 text-red-500 shrink-0" onClick={() => remover(a)}
                disabled={apagando === a.id} title="Tirar esta regra">
                {apagando === a.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          );
        })}
        {aplicacoes.length > 1 && (
          <p className="text-[11px] text-gray-400 pt-1">
            Havendo mais de uma regra para o mesmo copo, vale a mais específica: o copo ganha da
            categoria, e a categoria ganha da regra geral.
          </p>
        )}
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
// POR CATEGORIA — "esta categoria vende todas as bordas?"
//
// A tela de aplicar em massa responde o caminho ITEM → onde ele entra:
// marco dezoito bordas e digo "no Long Drink". A pergunta do comercial
// é a INVERSA — "o Long Drink vende borda?" — e ela não tinha tela:
// para responder era preciso abrir as dezoito bordas, uma a uma, e ver
// em quais categorias cada uma estava ligada.
//
// Aqui a LINHA É A CATEGORIA e a chave é uma só. Ligada, todas as
// bordas do cadastro aparecem no configurador daquela categoria para a
// cliente escolher e comprar. Desligada, nenhuma aparece.
//
// A CHAVE NÃO É UM SALVAR. Cada clique grava na hora — é uma decisão
// por linha, e um botão "Salvar" no rodapé só criaria a chance de
// alguém marcar seis categorias e fechar a janela sem gravar nenhuma.
// ════════════════════════════════════════════════════════════
function PorCategoria({ tipo, onClose }) {
  const qc = useQueryClient();
  const [gravando, setGravando] = useState(null);   // id da linha em voo

  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ['item-cobertura', tipo.kind],
    queryFn: () => api.get('/itens/cobertura', { params: { kind: tipo.kind } }),
  });

  const total = data?.total || 0;

  async function alternar(linha, ligado) {
    setGravando(linha.chave);
    try {
      await api.post('/itens/cobertura', {
        kind: tipo.kind,
        category_ids: linha.ids || null,
        ligado,
      });
      toast.success(ligado
        ? `${tipo.label} à venda em ${linha.name}`
        : `${tipo.label} fora de ${linha.name}`);
      await refetch();
      // A lista de aplicações da tela de trás mostra "em 3 categorias" —
      // ela acabou de ficar velha.
      qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
    } catch (err) {
      toast.error(err.error || 'Não consegui gravar');
    } finally { setGravando(null); }
  }

  const geral = data?.geral;
  const linhas = [
    ...(geral ? [{
      chave: 'geral', ids: null, name: 'Todos os copos personalizados',
      dica: 'Vale para o catálogo inteiro, inclusive o que for cadastrado depois.',
      aplicados: geral.aplicados, ligado: geral.ligado, pelo_geral: false,
    }] : []),
    ...(data?.categorias || []).map(c => ({
      chave: c.id, ids: c.ids, name: c.name,
      dica: `${c.product_count} ${c.product_count === 1 ? 'produto' : 'produtos'}`,
      aplicados: c.aplicados, ligado: c.ligado, pelo_geral: c.pelo_geral,
    })),
  ];

  return (
    <Modal isOpen onClose={onClose} size="md"
      title={`${tipo.label} por categoria`}
      footer={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      <div className="space-y-3 text-sm">
        <p className="text-xs text-gray-500">
          Ligue a chave e <b>todas as {tipo.label.toLowerCase()} do cadastro</b> passam a aparecer
          no catálogo personalizado daquela categoria, para a cliente escolher e comprar.
          {total > 0 && <> Hoje são <b>{total}</b> {total === 1 ? 'cadastrada' : 'cadastradas'}.</>}
        </p>

        {isLoading ? (
          <div className="py-10 text-center text-gray-400">
            <Loader2 size={20} className="animate-spin mx-auto mb-2" /> Carregando…
          </div>
        ) : isError ? (
          <div className="py-8 text-center">
            <AlertTriangle size={20} className="mx-auto mb-2 text-amber-500" />
            <p className="text-sm text-gray-600">{error?.error || 'Não foi possível carregar as categorias.'}</p>
          </div>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">
            Nenhum item deste tipo cadastrado — cadastre as {tipo.label.toLowerCase()} primeiro.
          </p>
        ) : (
          <div className="rounded-xl border border-gray-200 divide-y divide-gray-100">
            {linhas.map(l => {
              // PARCIAL É UM ESTADO DE VERDADE: alguém ligou seis das
              // dezoito bordas à mão. Dizer só "desligado" apagaria o
              // trabalho dessa pessoa da tela.
              const parcial = !l.ligado && l.aplicados > 0;
              return (
                <div key={l.chave} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-gray-800 truncate">{l.name}</p>
                    <p className="text-[11px] text-gray-400">
                      {l.dica}
                      {parcial && ` · ${l.aplicados} de ${total} ligadas`}
                      {l.ligado && l.pelo_geral && l.chave !== 'geral'
                        && ' · vem da regra de todos os personalizados'}
                    </p>
                  </div>
                  {gravando === l.chave ? (
                    <Loader2 size={16} className="animate-spin text-gray-400 shrink-0" />
                  ) : (
                    <button type="button" onClick={() => alternar(l, !l.ligado)}
                      title={l.ligado ? 'Tirar do catálogo desta categoria' : 'Colocar à venda nesta categoria'}
                      className={`shrink-0 w-11 h-6 rounded-full transition-colors relative ${
                        l.ligado ? 'bg-emerald-500' : parcial ? 'bg-amber-300' : 'bg-gray-200'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${
                        l.ligado ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <p className="text-[11px] text-gray-400">
          Exceção de um copo continua na aplicação daquele item — o produto ganha da categoria,
          e a categoria ganha da regra geral.
        </p>
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
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [vendoAplicacoes, setVendoAplicacoes] = useState(null);
  const [porCategoria, setPorCategoria] = useState(false);

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
  const { data: categorias = [] } = useQuery({
    queryKey: ['product-categories'],
    queryFn: () => api.get('/products/categories/list'),
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
        <div className="flex gap-2 shrink-0 flex-wrap">
          {/* POR CATEGORIA — a pergunta invertida. "Esta categoria vende
              borda?" só se respondia abrindo item por item; aqui a
              linha é a categoria e a chave liga todas de uma vez.
              Só com um tipo escolhido: "todas as bordas" é uma frase
              com sentido, "todos os itens" não é. */}
          {t && (
            <button className="btn-secondary" onClick={() => setPorCategoria(true)}>
              <Layers size={16} /> Por categoria
            </button>
          )}
          {/* A PASTA INTEIRA DE UMA VEZ. Dezoito bordas são dezoito
              vezes abrir-enviar-salvar-fechar — o tipo de tarefa que
              para na sexta e as últimas ficam sem foto para sempre. */}
          <button className="btn-secondary" onClick={() => setEnviandoFotos(true)}>
            <Images size={16} /> Enviar fotos
          </button>
          <button className="btn-primary" onClick={() => setEditando({})}>
            <Plus size={16} /> {t ? `Novo ${t.singular.toLowerCase()}` : 'Novo item'}
          </button>
        </div>
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
                  <button
                    onClick={() => setVendoAplicacoes({ item: i, aplicacoes: aplic })}
                    className="mt-2 text-[11px] text-gray-500 hover:text-primary-700 underline decoration-dotted underline-offset-2">
                    Aplicado em{' '}
                    {aplic.some(a => !a.category_id && !a.product_id)
                      ? 'todos os personalizados'
                      : `${aplic.length} ${aplic.length === 1 ? 'destino' : 'destinos'}`}
                    {aplic.some(a => a.padrao) && ' · já no preço do copo'}
                    {' · gerenciar'}
                  </button>
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
          // Travado quando a TELA é de um tipo (Sub-Produtos, Cores,
          // Bordas) — que é como Produtos sempre abre esta tela.
          kindTravado={kind}
          onClose={() => setEditando(null)}
          onSaved={() => { setEditando(null); qc.invalidateQueries({ queryKey: ['itens'] }); }}
        />
      )}
      {vendoAplicacoes && (
        <OndeSeAplica
          item={vendoAplicacoes.item}
          aplicacoes={vendoAplicacoes.aplicacoes}
          categorias={categorias}
          onClose={() => setVendoAplicacoes(null)}
          onMudou={() => {
            setVendoAplicacoes(null);
            qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
            qc.invalidateQueries({ queryKey: ['adicionais-produto'] });
          }}
        />
      )}
      {porCategoria && t && (
        <PorCategoria tipo={t} onClose={() => setPorCategoria(false)} />
      )}
      {enviandoFotos && (
        <FotosEmMassa
          itens={lista}
          onClose={() => setEnviandoFotos(false)}
          onOk={(op) => {
            if (!op?.manterAberto) setEnviandoFotos(false);
            qc.invalidateQueries({ queryKey: ['itens'] });
          }}
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
