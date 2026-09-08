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
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Calculator, Save, Loader2, Printer, AlertCircle, CheckCircle2,
  Package, Tag, ArrowRight, Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  computeSheet, emptySheet, fmtBRL, fmtQty, numInput,
} from '@/lib/pricingCalc';
import { buildSheetReportHtml, openPrintWindow } from '@/utils/pricingReportHtml';
import { Moeda, Quantidade, Percentual } from './pecas';

/** Informado é diferente de zero: "de graça" e "não perguntei" não são a mesma coisa. */
const temValor = v => v !== '' && v != null && numInput(v) !== 0;

export default function PriceFormation() {
  const qc = useQueryClient();
  const [categoryId, setCategoryId] = useState('');
  const [sheet, setSheet] = useState(null);
  const [previa, setPrevia] = useState(null);   // resultado do "simular" antes de aplicar

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
    if (carregada.current === categoryId) return;
    carregada.current = categoryId;
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
  }, [categoryId, fixed, fichas, cat]);   // guardado pela ref acima

  const calc = useMemo(() => (sheet ? computeSheet(sheet) : null), [sheet]);

  const salvar = useMutation({
    mutationFn: () => {
      const corpo = {
        ...sheet,
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

  const simular = useMutation({
    mutationFn: () => api.post('/pricing/aplicar-categoria', {
      category_id: categoryId, price: calc.price_ideal, simular: true,
    }),
    onSuccess: setPrevia,
    onError: e => toast.error(e.error || 'Não foi possível simular'),
  });

  const aplicar = useMutation({
    mutationFn: () => api.post('/pricing/aplicar-categoria', {
      category_id: categoryId, price: calc.price_ideal,
    }),
    onSuccess: r => {
      setPrevia(null);
      qc.invalidateQueries({ queryKey: ['pricing-categorias'] });
      qc.invalidateQueries({ queryKey: ['products'] });
      toast.success(r.alterados
        ? `${r.alterados} produto(s) de ${r.categoria} agora vendem a ${fmtBRL(r.preco)}`
        : `Nenhum produto mudou — ${r.categoria} já estava a ${fmtBRL(r.preco)}`);
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
              {categorias.map(c => (
                <option key={c.id} value={c.id}>
                  {c.name} — {c.produtos} produto{c.produtos !== 1 ? 's' : ''}
                  {c.com_preco === 0
                    ? ' · sem preço'
                    : c.com_preco < c.produtos
                      ? ` · ${c.com_preco} com preço`
                      : ` · hoje ${fmtBRL(c.preco_medio)}`}
                </option>
              ))}
            </select>
            {cat && (
              <p className="text-[12px] text-gray-500 mt-2 flex items-center gap-1.5 flex-wrap">
                <Package size={13} />
                <b>{cat.produtos}</b> produto{cat.produtos !== 1 ? 's' : ''} nesta categoria
                {cat.com_preco === 0 ? (
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
            </>
          )}
        </div>

        {/* ── O preço ────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-4 space-y-3">
          <Preco calc={calc} cat={cat} lote={lote} temMateria={temMateria} />

          {categoryId && temMateria && (
            <AplicarNaCategoria
              cat={cat} preco={calc.price_ideal} previa={previa}
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
function AplicarNaCategoria({ cat, preco, previa, simulando, aplicando, onSimular, onAplicar, onCancelar }) {
  if (!cat) return null;

  if (!previa) {
    return (
      <div className="card p-4">
        <p className="text-[13px] text-gray-700">
          Pôr <b>{fmtBRL(preco)}</b> em todos os <b>{cat.produtos}</b> produto
          {cat.produtos !== 1 ? 's' : ''} de <b>{cat.name}</b>.
        </p>
        <button onClick={onSimular} disabled={simulando || !cat.produtos}
          className="btn-secondary text-sm w-full justify-center mt-3 disabled:opacity-45">
          {simulando ? <Loader2 size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          Ver o que vai mudar
        </button>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <p className="text-[13px] font-semibold text-gray-800">
        {previa.alterados === 0
          ? `Nada muda — os ${previa.produtos} produtos já estão a ${fmtBRL(previa.preco)}.`
          : `${previa.alterados} de ${previa.produtos} produtos mudam de preço.`}
      </p>

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
        <button onClick={onAplicar} disabled={aplicando || previa.alterados === 0}
          className="btn-primary text-sm flex-1 justify-center disabled:opacity-45">
          {aplicando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
          Aplicar
        </button>
      </div>
    </div>
  );
}
