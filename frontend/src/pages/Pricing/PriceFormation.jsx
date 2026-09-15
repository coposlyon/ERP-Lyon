// ============================================================
// FORMAÇÃO DE PREÇO — UMA CONTA POR CATEGORIA.
//
// O QUE MUDOU, E POR QUÊ.
//
// A ficha era por PRODUTO. Só que os 35 twisters tradicionais têm o
// mesmo copo cru, a mesma tela, a mesma tinta e a mesma caixa — muda a
// cor, e cor não muda custo. Precificar um por um é fazer 35 vezes a
// mesma conta e chegar a 35 respostas ligeiramente diferentes: é assim
// que o mesmo copo passa a custar R$ 1,08 numa cor e R$ 1,12 na outra.
//
// Agora a pergunta é "quanto custa fazer um copo DESTA categoria", e a
// resposta vale para todos os produtos dela.
//
// A TELA ANTERIOR TINHA SETE CARTÕES E TRINTA CAMPOS. A conta nunca foi
// o problema — ela está certa e continua exatamente a mesma
// (lib/pricingCalc.js, espelhada no backend). O problema era não dar
// para saber por onde começar nem o que faltava. O que sumiu daqui:
//
//   quatro campos de tinta      viraram um: "tinta gasta no lote".
//                               Ninguém preenchia cor 2, 3 e 4, e as
//                               três linhas vazias faziam a tela
//                               parecer incompleta para sempre.
//
//   três margens                virou uma. Mínimo e premium continuam
//                               aparecendo no resultado, calculados —
//                               são leitura, não pergunta.
//
//   capacidade, cor, modelo,    são a etiqueta da ficha e não entram
//   tipo de impressão,          em `computeSheet`. Estar do lado do que
//   descrição, referência       muda o preço fazia parecer que
//                               importavam.
//
// E FICOU UMA COISA QUE NÃO EXISTIA: o botão que põe o preço nos
// produtos. Antes a ficha calculava e o número morria ali — alguém
// tinha de abrir produto por produto e digitar. Agora aplica na
// categoria inteira, com a prévia do de/para antes de confirmar.
//
// APLICAR É UM CLIQUE À PARTE, e não consequência de salvar: salvar
// guarda a conta, aplicar mexe no preço de venda de dezenas de
// produtos. O sistema calcula e sugere; quem muda preço é quem
// responde por ele.
// ============================================================
import { useState, useMemo, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, Save, Loader2, Printer, AlertCircle, CheckCircle2,
  Package, Tag, ArrowRight, Layers, Plus, Trash2, TrendingDown, Wand2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  computeSheet, emptySheet, fmtBRL, fmtQty, numInput,
} from '@/lib/pricingCalc';
import { buildSheetReportHtml, openPrintWindow } from '@/utils/pricingReportHtml';
import { Moeda, Quantidade, Percentual } from './pecas';

/** Informado é diferente de zero: "de graça" e "não perguntei" não são a mesma coisa. */
/** "1 produto / 3 produtos", "1 item / 2 itens", "1 cor / 5 cores"… */
const plural = (u, n) => {
  const um = { produto: 'produto', item: 'item', cor: 'cor', borda: 'borda', insumo: 'insumo' }[u] || u;
  const varios = { produto: 'produtos', item: 'itens', cor: 'cores', borda: 'bordas', insumo: 'insumos' }[u] || `${u}s`;
  return n === 1 ? um : varios;
};
const temValor = v => v !== '' && v != null && numInput(v) !== 0;

export default function PriceFormation() {
  const qc = useQueryClient();
  // `?categoria=<id>` abre a ficha já na categoria certa. É por onde a
  // janela do modelo do produto manda quem clicou em "onde mudo isso" —
  // cair na tela com o seletor vazio seria mandar a pessoa procurar de
  // novo o que ela acabou de dizer que queria.
  const [params] = useSearchParams();
  const [categoryId, setCategoryId] = useState(params.get('categoria') || '');
  const [sheet, setSheet] = useState(null);
  const [previa, setPrevia] = useState(null);   // resultado do "simular" antes de aplicar
  // O desconto por volume: linhas em edição (texto) e o mínimo do pedido.
  // Elas viram `blocks.faixas` ao salvar e vão nos produtos ao aplicar.
  const [linhas, setLinhas] = useState([]);
  const [minimo, setMinimo] = useState('');

  const { data: fixed } = useQuery({
    queryKey: ['pricing-fixed-summary'],
    queryFn: () => api.get('/pricing/fixed-summary'),
  });
  const { data: categorias = [] } = useQuery({
    queryKey: ['pricing-categorias'],
    queryFn: () => api.get('/pricing/categorias'),
  });
  const { data: fichas = [] } = useQuery({
    queryKey: ['pricing-sheets'],
    queryFn: () => api.get('/pricing/sheets'),
  });

  const cat = categorias.find(c => c.id === categoryId) || null;

  /**
   * ESCOLHER A CATEGORIA CARREGA A FICHA DELA, se já existir.
   *
   * Sem isto, quem voltasse para ajustar o preço do Twister recomeçaria
   * do zero e salvaria uma segunda ficha da mesma categoria — duas
   * contas para o mesmo copo, e nenhuma das duas sabendo da outra.
   *
   * A REF É O QUE IMPEDE ISTO DE RODAR DE NOVO SOZINHO. As listas vêm
   * de useQuery e trocam de referência a cada recarga — e recarregar as
   * categorias (o que "Aplicar" faz de propósito, para atualizar o
   * preço médio) reexecutaria este efeito e apagaria o que estivesse
   * digitado. Só troca de categoria recarrega a ficha.
   */
  const carregada = useRef(null);
  useEffect(() => {
    if (!fixed) return;
    // Categoria vinda da URL chega ANTES da lista de categorias. Marcar
    // como carregada agora seria carregar a ficha sem `cat` — sem custo
    // do cadastro e sem as faixas de hoje —, e o efeito não roda de
    // novo, porque a ref já o teria dado por feito.
    if (categoryId && !categorias.length) return;
    if (carregada.current === categoryId) return;
    carregada.current = categoryId;

    /**
     * AS FAIXAS COMEÇAM DE ONDE ELAS ESTÃO HOJE.
     *
     * Duas fontes, nesta ordem: a ficha (se já foi salva com faixas) e,
     * na falta dela, o que os PRODUTOS da categoria já têm gravado —
     * porque este bloco veio de outra tela, e as faixas escritas lá
     * continuam valendo. Abrir a ficha em branco faria o primeiro
     * "Aplicar" apagar, sem avisar, o desconto que já estava no ar.
     */
    const daFicha = fichas.find(f => f.category_id === categoryId)?.blocks?.faixas;
    const fonte = (daFicha?.length ? daFicha : cat?.faixas) || [];
    setLinhas(fonte
      .slice()
      .sort((a, b) => (Number(a.min_qty) || 0) - (Number(b.min_qty) || 0))
      .map(t => ({ min: String(Number(t.min_qty) || ''), preco: String(Number(t.price) || '') })));
    setMinimo(String(
      fichas.find(f => f.category_id === categoryId)?.blocks?.min_pedido
      || cat?.min_pedido || '',
    ));
    const base = {
      overhead_unit: fixed.overhead_unit,
      tax_regime: fixed.tax_regime,
      tax_pct: fixed.tax_pct_default || 4,
    };
    if (!categoryId) { setSheet(emptySheet(base)); return; }

    const daCategoria = fichas.find(f => f.category_id === categoryId);
    if (daCategoria) {
      setSheet({
        ...emptySheet(base),
        ...daCategoria,
        blocks: { ...emptySheet(base).blocks, ...(daCategoria.blocks || {}) },
        overhead_unit: fixed.overhead_unit,
      });
    } else {
      const nova = emptySheet(base);
      setSheet({
        ...nova,
        category_id: categoryId,
        name: cat?.name || '',
        category: cat?.name || '',
        // O CUSTO DO CADASTRO ENTRA COMO PONTO DE PARTIDA, não como
        // verdade: é o que a empresa paga pelo copo cru, e começar de
        // um número plausível é melhor do que começar de vazio. Quem
        // sabe o número certo digita por cima.
        blocks: {
          ...nova.blocks,
          materia_prima: { ...nova.blocks.materia_prima, unit_cost: cat?.custo_medio || '' },
        },
      });
    }
    setPrevia(null);
  }, [categoryId, fixed, fichas, cat, categorias]);   // guardado pela ref acima

  const calc = useMemo(() => (sheet ? computeSheet(sheet) : null), [sheet]);

  /**
   * As linhas digitadas viram faixas: só as completas, em ordem, e o
   * fim de cada uma sai do começo da seguinte — do lado do servidor,
   * que é quem grava. Aqui só se manda "a partir de" e "por quanto".
   */
  const faixas = useMemo(() => linhas
    .map(l => ({
      min_qty: parseInt(l.min, 10),
      price: Number(String(l.preco).replace(',', '.')),
    }))
    .filter(t => Number.isFinite(t.min_qty) && t.min_qty > 0
              && Number.isFinite(t.price) && t.price >= 0)
    .sort((a, b) => a.min_qty - b.min_qty), [linhas]);

  const faixaRepetida = new Set(faixas.map(f => f.min_qty)).size !== faixas.length;
  const minPedido = Math.max(1, parseInt(minimo, 10) || 1);
  const faixaAbaixoDoMinimo = !!faixas.length && faixas[0].min_qty < minPedido;

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        ...sheet,
        // A ficha guarda o desconto por volume junto da conta que o
        // justifica: é o mesmo lote diluindo tela, tinta e frete.
        blocks: { ...sheet.blocks, faixas, min_pedido: minPedido },
        category_id: categoryId,
        name: cat?.name || sheet.name,
        category: cat?.name || '',
        is_master: true,
      };
      return sheet.id
        ? api.put(`/pricing/sheets/${sheet.id}`, corpo)
        : api.post('/pricing/sheets', corpo);
    },
    onSuccess: f => {
      setSheet(s => ({ ...s, id: f.id }));
      qc.invalidateQueries({ queryKey: ['pricing-sheets'] });
      toast.success('Ficha salva');
    },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });

  // O preço de tabela E o desconto por volume vão no mesmo pedido: são
  // a mesma decisão, e aplicá-los em dois cliques deixaria a categoria
  // com o preço novo e a faixa velha no intervalo entre um e outro.
  const corpoAplicar = () => ({
    category_id: categoryId,
    price: calc.price_ideal,
    price_tiers: faixas,
    min_order_qty: minPedido,
  });

  const simular = useMutation({
    mutationFn: () => api.post('/pricing/aplicar-categoria', { ...corpoAplicar(), simular: true }),
    onSuccess: setPrevia,
    onError: e => toast.error(e.error || 'Não foi possível simular'),
  });

  const aplicar = useMutation({
    mutationFn: () => api.post('/pricing/aplicar-categoria', corpoAplicar()),
    onSuccess: r => {
      setPrevia(null);
      qc.invalidateQueries({ queryKey: ['pricing-categorias'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      const doPreco = r.alterados
        ? `${r.alterados} produto(s) de ${r.categoria} agora vendem a ${fmtBRL(r.preco)}`
        : `Nenhum produto mudou de preço — ${r.categoria} já estava a ${fmtBRL(r.preco)}`;
      const daFaixa = r.faixas_alteradas
        ? ` · ${r.faixas?.length ? `${r.faixas.length} faixa(s) de quantidade aplicada(s)` : 'faixas removidas'}`
        : '';
      toast.success(doPreco + daFaixa);
    },
    onError: e => toast.error(e.error || 'Não foi possível aplicar'),
  });

  if (!sheet || !calc) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  const set = patch => { setSheet(s => ({ ...s, ...patch })); setPrevia(null); };
  const setBloco = (bloco, patch) => {
    setSheet(s => ({ ...s, blocks: { ...s.blocks, [bloco]: { ...(s.blocks[bloco] || {}), ...patch } } }));
    setPrevia(null);
  };
  const setTinta = valor => {
    setSheet(s => ({ ...s, blocks: { ...s.blocks, tintas: [{ label: 'Tinta', amount: valor }] } }));
    setPrevia(null);
  };

  // Mexeu na faixa, a prévia deixa de valer: ela foi calculada com os
  // números de antes, e um "ver o que vai mudar" desatualizado é pior
  // que nenhum.
  const mudarLinha = (i, k, v) => {
    setLinhas(l => l.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
    setPrevia(null);
  };
  const tirarLinha = i => { setLinhas(l => l.filter((_, j) => j !== i)); setPrevia(null); };
  const somarLinha = () => { setLinhas(l => [...l, { min: '', preco: '' }]); setPrevia(null); };

  /**
   * O PREÇO QUE A PRÓPRIA CONTA DÁ PARA AQUELA QUANTIDADE.
   *
   * É por isso que este bloco mora AQUI e não numa tela de cadastro: a
   * ficha já sabe que tela, tinta e frete são divididos pelo lote — um
   * pedido de 500 dilui a mesma tela por 500 peças. Dá para descobrir
   * quanto o copo custa em cada faixa refazendo a conta com aquele
   * lote, em vez de chutar o desconto.
   *
   * É sugestão, não imposição: preenche o campo e quem decide o preço
   * continua sendo quem responde por ele.
   */
  const precoPelaConta = qtd => computeSheet({ ...sheet, calc_quantity: qtd }).price_ideal;

  const b = sheet.blocks;
  const lote = Math.max(1, parseInt(sheet.calc_quantity) || 1);
  const temMateria = temValor(b.materia_prima?.unit_cost);

  return (
    <div className="space-y-4">
      <div className="page-header flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">Formação de Preço</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Uma conta por categoria — o preço vale para todos os produtos dela.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => openPrintWindow(buildSheetReportHtml(sheet, calc))}
            disabled={!categoryId} className="btn-secondary text-sm disabled:opacity-45">
            <Printer size={15} /> Imprimir
          </button>
          <button onClick={() => salvar.mutate()} disabled={!categoryId || salvar.isPending}
            className="btn-primary text-sm disabled:opacity-45">
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            Salvar ficha
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px] items-start">

        {/* ── As perguntas ───────────────────────────────────── */}
        <div className="space-y-3">

          <Bloco n={1} titulo="Qual categoria?"
            ajuda="O preço que sair daqui vale para todos os produtos desta categoria.">
            <select value={categoryId} onChange={e => setCategoryId(e.target.value)}
              className="input text-sm w-full max-w-md">
              <option value="">— escolha a categoria —</option>
              {/* TUDO O QUE TEM CADASTRO, em grupos: Produtos (todas as
                  categorias, mesmo sem produto), Sub-produtos (Tampas,
                  Canudos…), Cadastro (Cores, Bordas) e Insumos. */}
              {['Produtos', 'Sub-produtos', 'Cadastro', 'Insumos'].map(grupo => {
                const lista = categorias.filter(c => (c.grupo || 'Produtos') === grupo);
                if (!lista.length) return null;
                return (
                  <optgroup key={grupo} label={grupo}>
                    {lista.map(c => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.produtos} {plural(c.unidade || 'produto', c.produtos)}
                        {c.sem_preco_de_venda
                          ? (c.custo_medio > 0 ? ` · custo médio ${fmtBRL(c.custo_medio)}` : '')
                          : c.produtos === 0
                            ? ' · nenhum cadastrado ainda'
                            : c.com_preco === 0
                              ? ' · sem preço'
                              : c.com_preco < c.produtos
                                ? ` · ${c.com_preco} com preço`
                                : ` · hoje ${fmtBRL(c.preco_medio)}`}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
            {cat && (
              <p className="text-[12px] text-gray-500 mt-2 flex items-center gap-1.5 flex-wrap">
                <Package size={13} />
                <b>{cat.produtos}</b> {plural(cat.unidade || 'produto', cat.produtos)} nesta categoria
                {cat.sem_preco_de_venda ? (
                  <span className="text-amber-600">· insumo não tem preço de venda — a ficha vale como custo de referência</span>
                ) : cat.produtos === 0 ? (
                  <span className="text-amber-600">· cadastre produtos nela para o preço ter onde ir; a ficha pode ser salva desde já</span>
                ) : cat.com_preco === 0 ? (
                  <span className="text-amber-600">· nenhum tem preço ainda</span>
                ) : (
                  <>
                    · <b>{cat.com_preco}</b> com preço
                    {cat.preco_min !== cat.preco_max
                      ? <>, entre <b>{fmtBRL(cat.preco_min)}</b> e <b>{fmtBRL(cat.preco_max)}</b></>
                      : <>, a <b>{fmtBRL(cat.preco_min)}</b></>}
                  </>
                )}
                {fichas.some(f => f.category_id === categoryId) && (
                  <span className="text-emerald-600 flex items-center gap-1">
                    <CheckCircle2 size={12} /> ficha já existente, carregada
                  </span>
                )}
              </p>
            )}
          </Bloco>

          {!categoryId ? (
            <div className="card p-10 text-center">
              <Layers size={30} className="mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">Escolha a categoria acima para começar.</p>
            </div>
          ) : (
            <>
              <Bloco n={2} titulo="Quanto custa fazer um copo?"
                ajuda="Preencha o que existir. O que ficar em branco não entra na conta."
                direita={<span className="text-[11px] text-gray-400">no lote de {fmtQty(lote)}</span>}>

                <div className="space-y-3">
                  <Pergunta titulo="O copo cru, por peça"
                    nota="O que você paga pelo copo antes de qualquer personalização."
                    porPeca={calc.mat_unit} obrigatorio informado={temMateria}>
                    <Moeda exemplo="1,59" value={b.materia_prima?.unit_cost}
                      onChange={v => setBloco('materia_prima', { unit_cost: v })} />
                  </Pergunta>

                  <Pergunta titulo="Quantas peças neste lote"
                    nota="Tela, tinta e frete são divididos por esta quantidade — é por isso que pedido grande sai mais barato."
                    valorTexto={`${fmtQty(lote)} peças`} informado>
                    <Quantidade exemplo="1000" value={sheet.calc_quantity}
                      onChange={v => set({ calc_quantity: v })} />
                  </Pergunta>

                  <Pergunta titulo="Tela / clichê"
                    nota="O que você paga UMA vez e usa em várias peças."
                    porPeca={calc.pers_unit} informado={temValor(b.personalizacao?.screen_cost)}>
                    <div className="flex items-end gap-2 flex-wrap">
                      <Moeda label="custo" exemplo="80,00" value={b.personalizacao?.screen_cost}
                        onChange={v => setBloco('personalizacao', { screen_cost: v })} />
                      <Quantidade label="rende" exemplo="1000" value={b.personalizacao?.screen_uses}
                        onChange={v => setBloco('personalizacao', { screen_uses: v })} />
                    </div>
                  </Pergunta>

                  <Pergunta titulo="Tinta gasta no lote"
                    nota="O total de tinta do lote inteiro, somando todas as cores."
                    porPeca={calc.tinta_unit} informado={temValor(b.tintas?.[0]?.amount)}>
                    <Moeda exemplo="50,00" value={b.tintas?.[0]?.amount} onChange={setTinta} />
                  </Pergunta>

                  <Pergunta titulo="Embalagem"
                    nota="A caixa em que as peças vão. O custo é dividido pelas peças que cabem nela."
                    porPeca={calc.emb_unit} informado={temValor(b.embalagem?.box_price)}>
                    <div className="flex items-end gap-2 flex-wrap">
                      <Moeda label="preço da caixa" exemplo="2,50" value={b.embalagem?.box_price}
                        onChange={v => setBloco('embalagem', { box_price: v })} />
                      <Quantidade label="cabem" exemplo="50" value={b.embalagem?.units_per_box}
                        onChange={v => setBloco('embalagem', { units_per_box: v })} />
                    </div>
                  </Pergunta>

                  <Pergunta titulo="Frete da compra"
                    nota="O que você pagou para o copo cru chegar até aqui."
                    porPeca={calc.frete_unit} informado={temValor(b.frete?.freight_value)}>
                    <div className="flex items-end gap-2 flex-wrap">
                      <Moeda label="valor" exemplo="300,00" value={b.frete?.freight_value}
                        onChange={v => setBloco('frete', { freight_value: v })} />
                      <Quantidade label="peças compradas" exemplo="1000" value={b.frete?.quantity_bought}
                        onChange={v => setBloco('frete', { quantity_bought: v })} />
                    </div>
                  </Pergunta>

                  {/* O rateio não se digita: vem das Despesas Fixas. */}
                  <Pergunta titulo="Custos fixos (rateio)"
                    nota="Aluguel, energia, salários — divididos pela produção do mês. Muda em Despesas Fixas."
                    porPeca={calc.overhead_unit} informado={calc.overhead_unit > 0}>
                    <Link to="/rateio" className="text-[12px] text-primary-600 hover:underline">
                      ver o rateio →
                    </Link>
                  </Pergunta>
                </div>
              </Bloco>

              <Bloco n={3} titulo="Quanto entra de imposto e quanto você quer ganhar?">
                <div className="flex items-end gap-4 flex-wrap">
                  <Percentual label="Imposto" value={sheet.tax_pct}
                    onChange={v => set({ tax_pct: v })} />
                  <Percentual label="Margem" value={sheet.margin_ideal_pct}
                    onChange={v => set({ margin_ideal_pct: v })} />
                  <p className="text-[11.5px] text-gray-500 max-w-sm">
                    A margem é sobre o <b>preço de venda</b>, não sobre o custo: 40% em cima de
                    um custo de {fmtBRL(calc.cost_unit)} dá {fmtBRL(calc.price_ideal)} — e não
                    {' '}{fmtBRL(calc.cost_unit * 1.4)}, que seria somar a porcentagem ao custo.
                  </p>
                </div>
              </Bloco>

              {/* ── 4. O desconto por volume ──────────────────────
                  ELE MOROU NA TELA DO MODELO DO PRODUTO, e ali era uma
                  segunda conta em outro lugar: o preço de tabela saía
                  daqui e o "de 100 para cima sai a tanto" saía de lá,
                  sem nenhuma das duas telas saber da outra. Preço é uma
                  pergunta só, e agora tem uma porta só.

                  E aqui ele ganha o que não tinha lá: a conta que o
                  justifica. A ficha sabe que tela, tinta e frete são
                  divididos pelo lote — então sabe dizer quanto o copo
                  custa em 500 e em 1000, em vez de deixar o desconto no
                  chute. */}
              {/* Item e insumo não têm faixa de quantidade: o preço vai direto na peça. */}
              {cat?.tem_faixas !== false && (
              <Bloco n={4} titulo="Quanto o preço cai quando o pedido é grande?"
                ajuda="O desconto por volume desta categoria. Sem faixa, todo pedido sai pelo preço de tabela."
                direita={<span className="text-[11px] text-gray-400">vai junto no “Aplicar”</span>}>

                <div className="space-y-3">
                  <div>
                    <label className="label">Mínimo do pedido (un)</label>
                    <input className="input w-40" type="number" min={1} value={minimo}
                      placeholder="10"
                      onChange={e => { setMinimo(e.target.value); setPrevia(null); }} />
                    <p className="text-[11px] text-gray-500 mt-1">
                      Abaixo disso o catálogo não deixa fechar — ele sobe a quantidade para o mínimo.
                    </p>
                  </div>

                  {cat?.faixas_divergem && (
                    <p className="text-[11.5px] text-amber-600 flex items-start gap-1.5">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      Hoje os produtos desta categoria têm faixas diferentes entre si. Aplicar iguala todos.
                    </p>
                  )}

                  <div className="space-y-2">
                    {linhas.map((l, i) => {
                      const qtd = parseInt(l.min, 10);
                      const sugestao = Number.isFinite(qtd) && qtd > 0 ? precoPelaConta(qtd) : null;
                      return (
                        <div key={i} className="flex flex-wrap items-end gap-2">
                          <div className="w-36">
                            <label className="label">A partir de</label>
                            <div className="relative">
                              <input className="input pr-8" type="number" min={1} value={l.min}
                                placeholder="500" onChange={e => mudarLinha(i, 'min', e.target.value)} />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">un</span>
                            </div>
                          </div>
                          <div className="w-36">
                            <label className="label">Cada peça sai a</label>
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] text-gray-400">R$</span>
                              <input className="input pl-8" type="number" step="0.01" min={0} value={l.preco}
                                placeholder="1,80" onChange={e => mudarLinha(i, 'preco', e.target.value)} />
                            </div>
                          </div>
                          {sugestao != null && (
                            <button type="button" title={`A conta desta ficha, refeita para um lote de ${fmtQty(qtd)} peças`}
                              onClick={() => mudarLinha(i, 'preco', sugestao.toFixed(2))}
                              className="btn-secondary btn-sm mb-0.5">
                              <Wand2 size={13} /> usar a conta ({fmtBRL(sugestao)})
                            </button>
                          )}
                          <button type="button" onClick={() => tirarLinha(i)}
                            className="btn-secondary btn-sm mb-0.5" title="Tirar esta faixa">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      );
                    })}
                    <button type="button" onClick={somarLinha} className="btn-secondary btn-sm">
                      <Plus size={14} /> {linhas.length ? 'Mais uma faixa' : 'Criar uma faixa'}
                    </button>
                  </div>

                  {faixaRepetida && (
                    <p className="text-[11.5px] text-red-600 flex items-start gap-1.5">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      Duas faixas começam na mesma quantidade — são dois preços para o mesmo pedido.
                    </p>
                  )}
                  {faixaAbaixoDoMinimo && (
                    <p className="text-[11.5px] text-red-600 flex items-start gap-1.5">
                      <AlertCircle size={13} className="mt-0.5 shrink-0" />
                      A primeira faixa começa em {faixas[0].min_qty} un, abaixo do mínimo do pedido
                      ({minPedido} un) — ela nunca seria alcançada.
                    </p>
                  )}

                  <ComoFicaNoCatalogo faixas={faixas} minPedido={minPedido} tabela={calc.price_ideal} />
                </div>
              </Bloco>
              )}
            </>
          )}
        </div>

        {/* ── O preço ────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <Preco calc={calc} cat={cat} lote={lote} temMateria={temMateria} />

          {categoryId && temMateria && (
            <AplicarNaCategoria
              cat={cat} preco={calc.price_ideal} previa={previa}
              faixas={faixas} minPedido={minPedido}
              impedido={faixaRepetida || faixaAbaixoDoMinimo}
              simulando={simular.isPending} aplicando={aplicar.isPending}
              onSimular={() => simular.mutate()}
              onAplicar={() => aplicar.mutate()}
              onCancelar={() => setPrevia(null)} />
          )}
        </div>
      </div>
    </div>
  );
}

/* ── peças da tela ───────────────────────────────────────── */

function Bloco({ n, titulo, ajuda, direita, children }) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="w-6 h-6 rounded-lg bg-primary-100 text-primary-700 text-[12px] font-bold flex items-center justify-center shrink-0">
            {n}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-800">{titulo}</h2>
            {ajuda && <p className="text-[12px] text-gray-500 mt-0.5">{ajuda}</p>}
          </div>
        </div>
        {direita}
      </div>
      {children}
    </div>
  );
}

/**
 * Uma linha de custo: o que se pergunta, e quanto aquilo virou por peça.
 *
 * O VALOR POR PEÇA FICA DO LADO DA PERGUNTA. Antes ele morava numa
 * coluna à direita, longe do campo — e a relação entre "R$ 80,00 de
 * tela" e "R$ 0,08 por peça" ficava por conta de quem lia. É essa
 * relação que ensina a formar preço.
 *
 * Não informado sai "—", e nunca "R$ 0,00": zero parece conta feita.
 */
function Pergunta({ titulo, nota, children, porPeca, valorTexto, informado, obrigatorio }) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-gray-100 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-gray-800 flex items-center gap-1.5">
          {titulo}
          {obrigatorio && !informado && (
            <span className="text-[10px] font-semibold text-red-600 bg-red-50 rounded px-1.5 py-0.5">
              sem isto não há preço
            </span>
          )}
        </p>
        {nota && <p className="text-[11.5px] text-gray-500 mt-0.5 mb-2">{nota}</p>}
        {children}
      </div>
      <div className="text-right shrink-0 w-24">
        <p className="text-[10px] uppercase tracking-wider text-gray-400">
          {valorTexto ? 'lote' : 'por peça'}
        </p>
        <p className={`text-sm font-semibold tabular-nums ${informado ? 'text-gray-800' : 'text-gray-300'}`}>
          {valorTexto || (informado ? fmtBRL(porPeca) : '—')}
        </p>
      </div>
    </div>
  );
}

function Preco({ calc, cat, lote, temMateria }) {
  const margem = m => {
    const d = 1 - (Number(m) || 0) / 100;
    return d > 0 ? calc.cost_unit / d : 0;
  };
  return (
    <div className="card p-4">
      <h2 className="text-sm font-semibold text-gray-800 flex items-center gap-2 mb-3">
        <Calculator size={15} className="text-primary-600" /> O preço
      </h2>

      {!temMateria ? (
        <div className="text-center py-6">
          <AlertCircle size={24} className="mx-auto mb-2 text-amber-400" />
          <p className="text-[13px] text-gray-600">Falta o custo do copo cru.</p>
          <p className="text-[11.5px] text-gray-400 mt-1">
            Sem ele o preço não vale nada — tudo o mais é acréscimo em cima dele.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-baseline justify-between mb-1">
            <span className="text-[12px] text-gray-500">Cada peça custa</span>
            <span className="text-sm font-semibold text-gray-700 tabular-nums">{fmtBRL(calc.cost_unit)}</span>
          </div>
          <p className="text-[11px] text-gray-400 mb-3">já com imposto e rateio dos custos fixos</p>

          <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3 text-center">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700">Vender por</p>
            <p className="text-3xl font-bold text-emerald-700 tabular-nums">{fmtBRL(calc.price_ideal)}</p>
            <p className="text-[11.5px] text-emerald-800 mt-1">
              Sobram <b>{fmtBRL(calc.price_ideal - calc.cost_unit)}</b> por peça —
              {' '}<b>{fmtBRL((calc.price_ideal - calc.cost_unit) * lote)}</b> no lote de {fmtQty(lote)}.
            </p>
          </div>

          {/* Mínimo e premium são LEITURA: as duas contas que a pessoa
              faria de cabeça para saber até onde dá para negociar. Como
              campo, eram duas perguntas a mais para a mesma resposta. */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <Faixa rot="Mínimo (20%)" v={margem(20)} />
            <Faixa rot="Premium (50%)" v={margem(50)} />
          </div>

          {cat?.com_preco > 0 && (
            <p className="text-[11.5px] text-gray-500 mt-3 flex items-center gap-1.5">
              <Tag size={12} />
              Hoje {cat.com_preco === cat.produtos ? 'esta categoria vende' : `${cat.com_preco} destes produtos vendem`}
              {' '}por {fmtBRL(cat.preco_medio)} em média.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/**
 * O QUE O CLIENTE VAI VER, ESCRITO POR EXTENSO.
 *
 * Os campos acima são o que se digita; isto é o que eles SIGNIFICAM. É
 * aqui que um "500 mais caro que 200" salta aos olhos — antes de ir
 * para o catálogo, e não depois de um cliente perguntar.
 */
function ComoFicaNoCatalogo({ faixas, minPedido, tabela }) {
  const fora = faixas.some((f, i) => i > 0 && f.price > faixas[i - 1].price);
  return (
    <div className="rounded-xl border border-gray-200 p-3">
      <p className="text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
        <TrendingDown size={13} className="text-primary-600" /> Como vai ficar no catálogo
      </p>
      {!faixas.length ? (
        <p className="text-xs text-gray-500">
          Sem faixa, todo pedido sai por <b>{fmtBRL(tabela)}</b> a peça (o preço de tabela desta ficha).
        </p>
      ) : (
        <ul className="text-xs text-gray-600 space-y-1">
          {minPedido < faixas[0].min_qty && (
            <li>
              De <b>{minPedido}</b> a <b>{faixas[0].min_qty - 1}</b> un — <b>{fmtBRL(tabela)}</b> cada
              <span className="text-gray-400"> (preço de tabela)</span>
            </li>
          )}
          {faixas.map((f, i) => {
            const ate = i + 1 < faixas.length ? faixas[i + 1].min_qty - 1 : null;
            return (
              <li key={f.min_qty}>
                {ate == null
                  ? <>De <b>{f.min_qty}</b> un para cima — </>
                  : <>De <b>{f.min_qty}</b> a <b>{ate}</b> un — </>}
                <b>{fmtBRL(f.price)}</b> cada
                <span className="text-gray-400"> ({fmtBRL(f.price * f.min_qty)} em {f.min_qty} un)</span>
              </li>
            );
          })}
        </ul>
      )}
      {fora && (
        <p className="text-[11.5px] text-amber-600 mt-2 flex items-start gap-1.5">
          <AlertCircle size={13} className="mt-0.5 shrink-0" />
          Uma faixa maior está mais cara que a anterior — o cliente pagaria mais por comprar mais.
        </p>
      )}
    </div>
  );
}

const Faixa = ({ rot, v }) => (
  <div className="rounded-lg border border-gray-200 p-2 text-center">
    <p className="text-[10px] text-gray-500">{rot}</p>
    <p className="text-sm font-semibold text-gray-700 tabular-nums">{fmtBRL(v)}</p>
  </div>
);

/**
 * O botão que põe o preço nos produtos.
 *
 * DUAS ETAPAS, DE PROPÓSITO. O primeiro clique só pergunta ao servidor
 * o que aconteceria; o segundo grava. Mexer no preço de venda de
 * dezenas de produtos sem ver o de/para antes é o tipo de clique que só
 * se descobre errado quando o cliente reclama da nota.
 */
function AplicarNaCategoria({
  cat, preco, previa, faixas = [], minPedido, impedido,
  simulando, aplicando, onSimular, onAplicar, onCancelar,
}) {
  if (!cat) return null;

  // O CLIQUE MEXE EM DUAS COISAS, e as duas são ditas antes.
  const oQueVai = (
    <p className="text-[11.5px] text-gray-500 mt-1">
      {faixas.length
        ? <>Junto vão <b>{faixas.length}</b> faixa{faixas.length !== 1 ? 's' : ''} de quantidade
            (a partir de {faixas[0].min_qty} un) e o mínimo de <b>{minPedido}</b> un por pedido.</>
        : <>Sem faixas de quantidade: todo pedido sai por este preço, com mínimo
            de <b>{minPedido}</b> un.</>}
    </p>
  );

  if (!previa) {
    return (
      <div className="card p-4">
        <p className="text-[13px] text-gray-700">
          {cat.sem_preco_de_venda
            ? <>Insumo não tem preço de venda: a ficha de <b>{cat.name}</b> fica salva como custo de referência.</>
            : <>Pôr <b>{fmtBRL(preco)}</b> em todos os <b>{cat.produtos}</b> {plural(cat.unidade || 'produto', cat.produtos)} de <b>{cat.name}</b>.</>}
        </p>
        {oQueVai}
        {impedido && (
          <p className="text-[11.5px] text-red-600 mt-2">
            Corrija as faixas acima antes de aplicar.
          </p>
        )}
        <button onClick={onSimular} disabled={simulando || !cat.produtos || impedido || cat.sem_preco_de_venda}
          className="btn-secondary text-sm w-full justify-center mt-3 disabled:opacity-45">
          {simulando ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          Ver o que vai mudar
        </button>
      </div>
    );
  }

  // Faixa que muda sem preço que muda é motivo suficiente para aplicar:
  // a categoria pode já estar no preço certo e sem desconto nenhum.
  const mexeEmAlgo = previa.alterados > 0 || previa.faixas_alteradas > 0;

  return (
    <div className="card p-4">
      <p className="text-[13px] font-semibold text-gray-800">
        {previa.alterados === 0
          ? `Nenhum preço muda — os ${previa.produtos} produtos já estão a ${fmtBRL(previa.preco)}.`
          : `${previa.alterados} de ${previa.produtos} produtos mudam de preço.`}
      </p>
      {previa.faixas_alteradas > 0 && (
        <p className="text-[12px] text-gray-600 mt-1">
          {previa.faixas?.length
            ? <><b>{previa.faixas_alteradas}</b> produto(s) recebem as {previa.faixas.length} faixa(s) de quantidade.</>
            : <><b>{previa.faixas_alteradas}</b> produto(s) ficam <b>sem</b> faixa de quantidade.</>}
        </p>
      )}

      {previa.alterados > 0 && (
        <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-gray-200 divide-y divide-gray-100">
          {previa.itens.map(it => (
            <div key={it.id} className="flex items-center gap-2 px-2.5 py-1.5 text-[11.5px]">
              <span className="min-w-0 flex-1 truncate text-gray-700">{it.name}</span>
              <span className="tabular-nums text-gray-400 line-through shrink-0">{fmtBRL(it.de)}</span>
              <span className="tabular-nums font-semibold text-emerald-700 shrink-0">{fmtBRL(it.para)}</span>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2 mt-3">
        <button onClick={onCancelar} className="btn-secondary text-sm flex-1 justify-center">Cancelar</button>
        <button onClick={onAplicar} disabled={aplicando || !mexeEmAlgo}
          className="btn-primary text-sm flex-1 justify-center disabled:opacity-45">
          {aplicando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Aplicar
        </button>
      </div>
    </div>
  );
}
