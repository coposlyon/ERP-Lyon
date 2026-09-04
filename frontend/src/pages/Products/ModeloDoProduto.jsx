// ============================================================
// O MODELO ABERTO — as cores e os adicionais dele, num lugar só.
//
// POR QUE O MODELO E NÃO O PRODUTO. No cadastro, cada COR é um produto,
// e tem que ser: cor tem estoque, código, NCM e foto próprios, e é ela
// que sai na nota. Mas ninguém trabalha assim — trabalha-se com UM Long
// Drink de 350 ml que existe em 24 cores. Esta janela é o produto do
// jeito que a fábrica pensa nele; o cadastro por trás continua o que a
// Receita e o estoque precisam.
//
// O PREÇO É SÓ DE LEITURA AQUI, E É DE PROPÓSITO. Preço de venda tem
// uma porta só (lib/preco.js): a Precificação. Já foram quatro telas
// gravando o mesmo campo, e o resultado era o cadastro dizer R$ 2,11 e
// o pedido cobrar outra coisa. Esta tela MOSTRA e aponta para lá.
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Palette, PlusCircle, Plus, Loader2, Edit2, AlertTriangle,
  Image as ImageIcon, Check, Search, Trash2, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import ComoEntraNoCopo from '@/components/UI/ComoEntraNoCopo';

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const miudo = v => {
  const n = Number(v) || 0;
  const casas = n !== 0 && Math.abs(n) < 0.01 ? 4 : 2;
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
};

/** "LONG DRINK TRADICIONAL - AZUL BIC 350 ML" → "AZUL BIC". */
function soACor(nome, titulo) {
  const semCapacidade = String(nome || '').replace(/\s*\d+(?:[.,]\d+)?\s*(ML|L)\s*$/i, '').trim();
  const partes = semCapacidade.split(' - ');
  if (partes.length > 1) return partes.slice(1).join(' - ');
  // Sem hífen: tira o nome da categoria do começo e fica o que sobrar.
  const cat = String(titulo || '').replace(/\s*\d+(?:[.,]\d+)?\s*(ML|L)\s*$/i, '').trim();
  return semCapacidade.toUpperCase().startsWith(cat.toUpperCase())
    ? semCapacidade.slice(cat.length).trim() || semCapacidade
    : semCapacidade;
}

// ─── Escolher itens para aplicar no modelo inteiro ───────────
function AdicionarAoModelo({ modelo, jaAplicados, onClose, onOk }) {
  const [busca, setBusca] = useState('');
  const [marcados, setMarcados] = useState([]);
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
    setSalvando(true);
    try {
      // NO MODELO É "NESTAS CORES", e não na categoria: a categoria
      // pode ter outras capacidades (350 e 500 ml), e o canudo do 350
      // não é o mesmo do 500.
      const r = await api.post('/itens/aplicacoes', {
        item_ids: marcados,
        escopo: 'produto',
        product_ids: modelo.cores.map(c => c.id),
        padrao,
      });
      toast.success(`Aplicado em ${modelo.cores.length} cores (${r.aplicados} regras)`);
      onOk();
    } catch (err) {
      toast.error(err.error || 'Erro ao aplicar');
    } finally { setSalvando(false); }
  }

  return (
    <Modal isOpen onClose={onClose} size="lg" closeOnBackdrop={false}
      title={`Adicionar ao modelo — ${modelo.titulo}`}
      footer={<>
        <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
        <button type="button" className="btn-primary" onClick={aplicar} disabled={salvando}>
          {salvando ? <Loader2 size={15} className="animate-spin" /> : `Aplicar ${marcados.length || ''}`}
        </button>
      </>}
    >
      <div className="space-y-4 text-sm">
        <p className="rounded-xl bg-violet-50 border border-violet-200 text-violet-900 p-2.5 text-xs">
          Vai valer para as <b>{modelo.cores.length} cores</b> deste modelo. Cor nova cadastrada
          depois não herda — aplique de novo, ou use o alcance por categoria em Cadastros.
        </p>

        <ComoEntraNoCopo padrao={padrao} onMudar={setPadrao} />

        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-9" placeholder="Buscar item…" value={busca}
            onChange={e => setBusca(e.target.value)} />
        </div>

        {isLoading ? (
          <div className="py-8 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
        ) : lista.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            Nenhum item cadastrado. Cadastre em <b>Cadastros › Acessórios / Bordas / Tintas</b>.
          </p>
        ) : (
          <div className="max-h-72 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
            {lista.map(i => {
              const marcado = marcados.includes(i.id);
              return (
                <button key={i.id} type="button"
                  onClick={() => setMarcados(m => marcado ? m.filter(x => x !== i.id) : [...m, i.id])}
                  className={`w-full flex items-center gap-2.5 p-2.5 text-left ${marcado ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                  <span className={`w-4 h-4 rounded border grid place-items-center shrink-0 ${
                    marcado ? 'bg-primary-600 border-primary-600 text-white' : 'border-gray-300'}`}>
                    {marcado && <Check size={11} />}
                  </span>
                  {i.photo_url
                    ? <img src={i.photo_url} alt="" className="w-8 h-8 rounded object-cover border border-gray-200 shrink-0" />
                    : <span className="w-8 h-8 rounded border border-gray-200 shrink-0"
                        style={{ background: i.color_hex || '#f3f4f6' }} />}
                  <span className="flex-1 min-w-0">
                    <span className="block text-gray-900 truncate">
                      {i.color_name ? `${i.name} — ${i.color_name}` : i.name}
                    </span>
                    <span className="block text-[11px] text-gray-500">
                      custa {miudo(i.custo_na_peca)} · cobra {miudo(i.preco_na_peca)}
                    </span>
                  </span>
                  {jaAplicados.includes(i.id) && (
                    <span className="text-[10px] text-gray-400 shrink-0">já aplicado</span>
                  )}
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
export default function ModeloDoProduto({ modelo, onClose, onEditarCor, onNovaCor }) {
  const qc = useQueryClient();
  const [aba, setAba] = useState('cores');
  const [adicionando, setAdicionando] = useState(false);

  // Os adicionais do modelo lidos pela PRIMEIRA cor: as regras que
  // valem para um modelo (categoria e curinga) valem para todas as
  // cores dele. Exceção de uma cor só aparece no cadastro dela.
  const primeira = modelo.cores[0];
  const { data: adicionais = [], isLoading: carregandoAdic } = useQuery({
    queryKey: ['adicionais-produto', primeira?.id],
    queryFn: () => api.get(`/itens/do-produto/${primeira.id}`),
    enabled: !!primeira?.id && aba === 'adicionais',
  });

  const padroes = adicionais.filter(a => a.padrao);
  const opcionais = adicionais.filter(a => !a.padrao);
  const custoFixo = padroes.reduce((s, a) => s + Number(a.custo || 0), 0);

  /**
   * TIRAR O ADICIONAL — DE ONDE QUER QUE ELE VENHA.
   *
   * Antes, item herdado da categoria ou da regra geral devolvia um
   * recado mandando a pessoa procurar outra tela. Isso é um beco sem
   * saída: quem está aqui está tentando resolver uma coisa, e a tela
   * responde "não é comigo". Se a regra pode ser criada por aqui, ela
   * tem que poder ser desfeita por aqui.
   *
   * O QUE MUDA CONFORME A ORIGEM é o ALCANCE, e é por isso que a
   * confirmação muda junto: apagar a regra geral tira o item de TODOS
   * os copos, não só deste modelo. Quem clica precisa ler isso ANTES,
   * não descobrir depois — regra que some em silêncio é a que ninguém
   * consegue reconstruir.
   */
  async function removerRegra(a) {
    const nome = `${a.item.name}${a.item.color_name ? ' ' + a.item.color_name : ''}`;

    const aviso = a.origem === 'todos'
      ? `Este adicional vem da REGRA GERAL.\n\nRemover vai tirar "${nome}" de TODOS os copos personalizados — não só deste modelo.\n\nContinuar?`
      : a.origem === 'categoria'
        ? `Este adicional vem da CATEGORIA.\n\nRemover vai tirar "${nome}" de toda a categoria, inclusive de outros tamanhos.\n\nContinuar?`
        : `Tirar "${nome}" das ${modelo.cores.length} cores deste modelo?`;
    if (!confirm(aviso)) return;

    try {
      if (a.origem === 'produto') {
        // Uma regra por cor: apagar só a da primeira deixaria as outras.
        const todas = await api.get('/itens/aplicacoes');
        const doModelo = todas.filter(x =>
          x.item_id === a.item.id && modelo.cores.some(c => c.id === x.product_id));
        for (const r of doModelo) await api.delete(`/itens/aplicacoes/${r.id}`);
        toast.success(`Removido de ${doModelo.length} cores`);
      } else {
        // Herdada: `aplicacao_id` JÁ É a linha da categoria ou do
        // curinga — é ela que ganhou a disputa das três camadas.
        await api.delete(`/itens/aplicacoes/${a.aplicacao_id}`);
        toast.success(a.origem === 'todos'
          ? 'Regra geral removida — saiu de todos os copos'
          : 'Regra da categoria removida');
      }
      qc.invalidateQueries({ queryKey: ['adicionais-produto'] });
      qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
    } catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  const ABAS = [
    { k: 'cores', t: `Cores (${modelo.cores.length})`, i: Palette },
    { k: 'adicionais', t: 'Adicionais', i: PlusCircle },
  ];

  return (
    <Modal isOpen onClose={onClose} size="xl" title={modelo.titulo}
      footer={<button className="btn-secondary" onClick={onClose}>Fechar</button>}>
      <div className="space-y-4">
        <div className="flex gap-1.5 border-b border-gray-100 pb-3">
          {ABAS.map(a => (
            <button key={a.k} type="button" onClick={() => setAba(a.k)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition ${
                aba === a.k ? 'bg-violet-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <a.i size={15} /> {a.t}
            </button>
          ))}
        </div>

        {aba === 'cores' ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500">
                Cada cor é um cadastro próprio — tem estoque, código e nota fiscal dela.
                Clique para abrir.
              </p>
              <button type="button" className="btn-primary btn-sm"
                onClick={() => onNovaCor(modelo)}>
                <Plus size={14} /> Adicionar cor
              </button>
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-50">
              {modelo.cores.map(c => (
                <div key={c.id} onClick={() => onEditarCor(c)}
                  className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  {c.image_url
                    ? <img src={c.image_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-gray-200 shrink-0" />
                    : <span className="w-10 h-10 rounded-lg border border-dashed border-gray-200 bg-gray-50 shrink-0 grid place-items-center text-gray-300">
                        <ImageIcon size={14} />
                      </span>}
                  <span className="font-mono text-[11px] text-gray-400 w-20 shrink-0">{c.code || '—'}</span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-medium text-gray-900 truncate">
                      {soACor(c.name, modelo.titulo)}
                    </span>
                    <span className="block text-[11px] text-gray-400 truncate">{c.name}</span>
                  </span>
                  <span className="text-right shrink-0 w-24">
                    <span className="block text-xs text-gray-500">custo {brl(c.cost_price)}</span>
                    <span className="block text-xs text-gray-900">{brl(c.sale_price)}</span>
                  </span>
                  <span className={`text-xs w-16 text-right shrink-0 ${
                    Number(c.current_stock) > 0 ? 'text-gray-600' : 'text-red-500'}`}>
                    {Number(c.current_stock) || 0} UN
                  </span>
                  <button className="btn-ghost p-1.5 shrink-0" title="Abrir cadastro"
                    onClick={e => { e.stopPropagation(); onEditarCor(c); }}>
                    <Edit2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <p className="flex items-start gap-1.5 text-[11px] text-gray-400">
              <Info size={12} className="mt-0.5 shrink-0" />
              O preço de venda é definido na{' '}
              <Link to="/pricing/formacao" className="text-primary-600 hover:underline">Formação de Preço</Link> —
              é a única tela que grava preço, para o cadastro e o pedido nunca discordarem.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-gray-500 max-w-md">
                Borda, canudo, tampa, tinta — o que este modelo oferece, valendo para as{' '}
                {modelo.cores.length} cores.
              </p>
              <button type="button" className="btn-primary btn-sm" onClick={() => setAdicionando(true)}>
                <Plus size={14} /> Adicionar Adicional
              </button>
            </div>

            {carregandoAdic ? (
              <div className="py-10 text-center text-gray-400"><Loader2 size={20} className="animate-spin mx-auto" /></div>
            ) : adicionais.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 p-8 text-center text-sm text-gray-500">
                Este modelo ainda não oferece nenhum adicional.
              </div>
            ) : (
              <div className="space-y-3">
                {padroes.length > 0 && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-3 py-1.5 flex items-center justify-between">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                        Já está no preço do copo
                      </span>
                      <span className="text-[11px] text-gray-500">custa {miudo(custoFixo)} na peça</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {padroes.map(a => <LinhaAdic key={a.aplicacao_id} a={a} onRemover={removerRegra} />)}
                    </div>
                  </div>
                )}
                {opcionais.length > 0 && (
                  <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-3 py-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-600">
                        A cliente escolhe — paga à parte
                      </span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {opcionais.map(a => <LinhaAdic key={a.aplicacao_id} a={a} onRemover={removerRegra} />)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {adicionando && (
        <AdicionarAoModelo
          modelo={modelo}
          jaAplicados={adicionais.map(a => a.item.id)}
          onClose={() => setAdicionando(false)}
          onOk={() => {
            setAdicionando(false);
            qc.invalidateQueries({ queryKey: ['adicionais-produto'] });
            qc.invalidateQueries({ queryKey: ['item-aplicacoes'] });
          }}
        />
      )}
    </Modal>
  );
}

const ORIGEM = {
  produto:   { t: 'deste modelo',   cls: 'bg-violet-100 text-violet-700' },
  categoria: { t: 'da categoria',   cls: 'bg-sky-100 text-sky-700' },
  todos:     { t: 'de todos',       cls: 'bg-gray-100 text-gray-600' },
};

function LinhaAdic({ a, onRemover }) {
  const o = ORIGEM[a.origem] || ORIGEM.todos;
  return (
    <div className="flex items-center gap-2.5 p-2.5">
      {a.item.photo_url
        ? <img src={a.item.photo_url} alt="" className="w-9 h-9 rounded-lg object-cover border border-gray-200 shrink-0" />
        : <span className="w-9 h-9 rounded-lg border border-gray-200 shrink-0"
            style={{ background: a.item.color_hex || '#f3f4f6' }} />}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {a.item.name}{a.item.color_name ? ` · ${a.item.color_name}` : ''}
        </p>
        <p className="text-[11px] text-gray-500">
          <span className={`inline-block rounded px-1.5 py-0.5 mr-1.5 ${o.cls}`}>{o.t}</span>
          custa {miudo(a.custo)} · cobra {miudo(a.preco)}
        </p>
      </div>
      {/* A LIXEIRA VALE PARA TODAS AS ORIGENS. Cinza e sem ação era
          uma promessa quebrada: o botão existe, então tem que agir. O
          que a origem muda é o alcance, e isso a confirmação diz. */}
      <button type="button" onClick={() => onRemover(a)}
        className="btn-ghost p-1.5 shrink-0 text-red-500"
        title={a.origem === 'produto' ? 'Tirar deste modelo'
          : a.origem === 'categoria' ? 'Tirar da categoria inteira'
          : 'Tirar de todos os copos personalizados'}>
        <Trash2 size={14} />
      </button>
    </div>
  );
}
