// ============================================================
// OS ADICIONAIS DESTE COPO — o botão "Adicionar Adicional".
//
// A LISTA NÃO É DO PRODUTO: é o resultado de três camadas. O que vale
// para TODO personalizado, o que vale para a CATEGORIA e o que vale só
// para este copo. O servidor junta as três e o mais específico ganha —
// por isso cada linha diz de onde veio, e por isso remover um item que
// veio da categoria não é remoção: é abrir exceção, e a tela avisa
// disso em vez de fingir que apagou.
//
// POR QUE ADICIONAR AQUI TAMBÉM APLICA EM MASSA. Quem está com o copo
// aberto é quem sabe que "todo Long Drink leva canudo". Obrigar essa
// pessoa a sair, ir em Cadastros › Acessórios e voltar era o caminho
// que ninguém percorria — e o canudo ficava sem cadastrar.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Loader2, Trash2, Search, Package, Info, Check,
  Image as ImageIcon, AlertTriangle, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import ComoEntraNoCopo from '@/components/UI/ComoEntraNoCopo';

const fmtMiudo = v => {
  const n = Number(v) || 0;
  const casas = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
};

const ORIGEM = {
  produto:   { txt: 'só neste copo',        cls: 'bg-violet-100 text-violet-700' },
  categoria: { txt: 'da categoria',         cls: 'bg-sky-100 text-sky-700' },
  todos:     { txt: 'todos os personalizados', cls: 'bg-gray-100 text-gray-600' },
};

function Amostra({ item, size = 34 }) {
  const s = { width: size, height: size };
  if (item?.photo_url) return <img src={item.photo_url} alt="" style={s} className="rounded-lg object-cover border border-gray-200 shrink-0" />;
  if (item?.color_hex) return <span style={{ ...s, background: item.color_hex }} className="rounded-lg border border-gray-200 shrink-0 inline-block" />;
  return <span style={s} className="rounded-lg border border-dashed border-gray-200 bg-gray-50 shrink-0 grid place-items-center text-gray-300"><ImageIcon size={size / 2.5} /></span>;
}

// ─── Escolher itens e dizer onde aplicam ─────────────────────
function EscolherItens({ productId, categoryId, jaAplicados, onClose, onOk }) {
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState([]);
  const [escopo, setEscopo] = useState('produto');
  const [padrao, setPadrao] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const { data: itens = [], isLoading } = useQuery({
    queryKey: ['itens', 'todos'],
    queryFn: () => api.get('/itens'),
  });

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return itens.filter(i => !t || `${i.name} ${i.color_name || ''}`.toLowerCase().includes(t));
  }, [itens, busca]);

  async function aplicar() {
    if (!marcados.length) { toast.error('Escolha ao menos um item'); return; }
    if (escopo === 'categoria' && !categoryId) {
      toast.error('Este produto não tem categoria — escolha outro alcance'); return;
    }
    setSalvando(true);
    try {
      await api.post('/itens/aplicacoes', {
        item_ids: marcados,
        escopo,
        product_id:  escopo === 'produto'   ? productId  : null,
        category_id: escopo === 'categoria' ? categoryId : null,
        padrao,
      });
      toast.success('Adicionais aplicados!');
      onOk();
    } catch (err) {
      toast.error(err.error || 'Erro ao aplicar');
    } finally { setSalvando(false); }
  }

  return (
    <Modal isOpen onClose={onClose} size="lg" title="Adicionar adicional" closeOnBackdrop={false}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={aplicar} disabled={salvando}>
          {salvando ? <Loader2 size={15} className="animate-spin" /> : `Aplicar ${marcados.length || ''}`}
        </button>
      </>}
    >
      <div className="space-y-4 text-sm">
        {/* ── onde aplica: a edição em massa mora aqui ── */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Aplicar em</p>
          {[
            { v: 'produto',   t: 'Só neste copo',                 d: 'A exceção — vale apenas para este produto.' },
            { v: 'categoria', t: 'Toda a categoria deste copo',   d: 'Ex.: todos os Long Drink passam a oferecer canudo.' },
            { v: 'todos',     t: 'Todos os copos personalizados', d: 'Inclusive os que forem cadastrados depois.' },
          ].map(o => (
            <label key={o.v}
              className={`flex items-start gap-2.5 rounded-xl border p-2.5 cursor-pointer ${
                escopo === o.v ? 'border-primary-400 bg-primary-50/50' : 'border-gray-200'}`}>
              <input type="radio" className="mt-1" checked={escopo === o.v} onChange={() => setEscopo(o.v)} />
              <span>
                <b>{o.t}</b>
                <span className="block text-xs text-gray-500">{o.d}</span>
              </span>
            </label>
          ))}
          {escopo === 'categoria' && !categoryId && (
            <p className="flex items-center gap-1.5 text-xs text-amber-600">
              <AlertTriangle size={13} /> Este produto não tem categoria definida.
            </p>
          )}
        </div>

        <ComoEntraNoCopo padrao={padrao} onMudar={setPadrao} />

        {/* ── quais itens ── */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar item…" value={busca}
            onChange={e => setBusca(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
        ) : lista.length === 0 ? (
          <div className="py-8 text-center text-gray-400 text-sm">
            <Package size={22} className="mx-auto mb-2" />
            Nenhum item cadastrado ainda. Cadastre em <b>Cadastros › Acessórios</b>.
          </div>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {lista.map(i => {
              const marcado = marcados.includes(i.id);
              const ja = jaAplicados.includes(i.id);
              return (
                <button key={i.id} type="button"
                  onClick={() => setMarcados(m => marcado ? m.filter(x => x !== i.id) : [...m, i.id])}
                  className={`w-full flex items-center gap-2.5 p-2.5 text-left transition ${
                    marcado ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                  <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                    marcado ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300'}`}>
                    {marcado && <Check size={11} />}
                  </span>
                  <Amostra item={i} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium text-gray-900 truncate">{i.name}</span>
                    <span className="block text-xs text-gray-500 truncate">
                      {i.color_name || '—'} · custa {fmtMiudo(i.custo_na_peca)} · cobra {fmtMiudo(i.preco_na_peca)}
                    </span>
                  </span>
                  {ja && <span className="text-[10px] text-gray-400 shrink-0">já aplicado</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════
export default function AdicionaisDoProduto({ productId, categoryId }) {
  const qc = useQueryClient();
  const [escolhendo, setEscolhendo] = useState(false);

  const { data: lista = [], isLoading, isError, error, refetch } = useQuery({
    queryKey: ['adicionais-produto', productId],
    queryFn: () => api.get(`/itens/do-produto/${productId}`),
    enabled: !!productId,
  });

  const padroes  = lista.filter(a => a.padrao);
  const opcionais = lista.filter(a => !a.padrao);
  const custoFixo = padroes.reduce((s, a) => s + Number(a.custo || 0), 0);
  const precoFixo = padroes.reduce((s, a) => s + Number(a.preco || 0), 0);

  /**
   * TIRAR DE ONDE QUER QUE VENHA — ver ModeloDoProduto para o porquê.
   * Botão que existe e não age é promessa quebrada; o que a origem
   * muda é o ALCANCE, e é a confirmação que precisa dizer isso.
   */
  async function remover(a) {
    const nome = `${a.item.name}${a.item.color_name ? ' ' + a.item.color_name : ''}`;
    const aviso = a.origem === 'todos'
      ? `Este adicional vem da REGRA GERAL.\n\nRemover vai tirar "${nome}" de TODOS os copos personalizados — não só deste.\n\nContinuar?`
      : a.origem === 'categoria'
        ? `Este adicional vem da CATEGORIA.\n\nRemover vai tirar "${nome}" de todos os copos da categoria.\n\nContinuar?`
        : `Tirar "${nome}" deste copo?`;
    if (!confirm(aviso)) return;
    try {
      await api.delete(`/itens/aplicacoes/${a.aplicacao_id}`);
      toast.success('Adicional removido');
      qc.invalidateQueries({ queryKey: ['adicionais-produto', productId] });
      qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
    } catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  if (!productId) {
    return (
      <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
        Salve o produto primeiro — os adicionais precisam de um copo para pendurar.
      </div>
    );
  }

  function Linha({ a }) {
    const o = ORIGEM[a.origem] || ORIGEM.todos;
    return (
      <div className="flex items-center gap-2.5 p-2.5">
        <Amostra item={a.item} />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate text-sm">
            {a.item.name}{a.item.color_name ? ` · ${a.item.color_name}` : ''}
          </p>
          <p className="text-[11px] text-gray-500">
            <span className={`inline-block rounded px-1.5 py-0.5 mr-1.5 ${o.cls}`}>{o.txt}</span>
            custa {fmtMiudo(a.custo)} · cobra {fmtMiudo(a.preco)}
            {a.consumo != 1 && ` · ${a.consumo} ${a.item.base_unit}/peça`}
          </p>
        </div>
        <button type="button" onClick={() => remover(a)}
          className="btn-ghost p-1.5 shrink-0 text-red-500"
          title={a.origem === 'produto' ? 'Tirar deste copo'
            : a.origem === 'categoria' ? 'Tirar da categoria inteira'
            : 'Tirar de todos os copos personalizados'}>
          <Trash2 size={14} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-xs text-gray-500 max-w-md leading-relaxed">
          Borda, canudo, tampa, tinta. O que <b>a cliente escolhe</b> aparece no catálogo e sobe o
          preço no pedido dela; o que <b>já está no preço do copo</b> é gasto seu em toda peça (a
          tinta) e não aparece para ela.
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={() => setEscolhendo(true)}>
          <Plus size={15} /> Adicionar Adicional
        </button>
      </div>

      {isLoading ? (
        <div className="py-10 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
      ) : isError ? (
        <div className="py-8 text-center">
          <AlertTriangle size={20} className="mx-auto mb-2 text-amber-500" />
          <p className="text-sm text-gray-600">{error?.error || 'Não foi possível carregar os adicionais.'}</p>
          <button type="button" className="btn-secondary mt-3" onClick={() => refetch()}>Tentar de novo</button>
        </div>
      ) : lista.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
          <Package size={22} className="mx-auto mb-2 text-gray-300" />
          Este copo ainda não tem adicional nenhum.
        </div>
      ) : (
        <div className="space-y-3">
          {padroes.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">Já está no preço do copo</span>
                <span className="text-[11px] text-gray-500">
                  custa {fmtMiudo(custoFixo)} · cobra {fmtMiudo(precoFixo)}
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {padroes.map(a => <Linha key={a.aplicacao_id} a={a} />)}
              </div>
            </div>
          )}

          {opcionais.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 px-3 py-1.5">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                  Opcionais — a cliente escolhe
                </span>
              </div>
              <div className="divide-y divide-gray-100">
                {opcionais.map(a => <Linha key={a.aplicacao_id} a={a} />)}
              </div>
            </div>
          )}
        </div>
      )}

      <p className="flex items-start gap-1.5 text-[11px] text-gray-400">
        <Info size={12} className="mt-0.5 shrink-0" />
        Os valores vêm do cadastro do item (Cadastros › Acessórios / Bordas / Tintas).
        Mudou lá, muda aqui e em todo copo que use o mesmo item.
      </p>

      {escolhendo && (
        <EscolherItens
          productId={productId}
          categoryId={categoryId}
          jaAplicados={lista.map(a => a.item.id)}
          onClose={() => setEscolhendo(false)}
          onOk={() => {
            setEscolhendo(false);
            qc.invalidateQueries({ queryKey: ['adicionais-produto', productId] });
            qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
          }}
        />
      )}
    </div>
  );
}
