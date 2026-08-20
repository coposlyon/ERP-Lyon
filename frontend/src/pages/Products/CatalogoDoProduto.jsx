// ============================================================
// CADASTRO DE PRODUTOS → CATÁLOGO PERSONALIZADO.
//
// A aba onde o produto mestre define o que o cliente vai encontrar no
// site: acabamentos, cores de cada campo, tipo de impressão, caixa do
// liso, gabarito da arte e em que famílias da vitrine ele entra.
//
// É AQUI E EM MAIS LUGAR NENHUM. O catálogo, o configurador, o editor de
// arte, o orçamento, o pagamento e a produção leem este mesmo cadastro.
// Se amanhã o Jateado for desmarcado aqui, o cliente para de ver Jateado
// neste produto no mesmo instante — sem deploy, sem segunda tela.
//
// HERDAR É O NORMAL. Quase toda regra é da CATEGORIA inteira ("todo Long
// Drink aceita degradê"). O produto entra só para a exceção. Por isso
// cada item tem três estados e não dois: marcar tudo produto a produto
// seria repetir 97 vezes o que a categoria já resolveu — e no dia em que
// a fábrica parasse de fazer borda seriam 97 cadastros para corrigir.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Save, AlertTriangle, Info, Ruler, Package, Layers, Palette,
  Droplet, LayoutGrid, Check, RotateCcw, Eye, EyeOff, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const HERDAR = 'herdar';
const PERMITIR = 'permitir';
const BLOQUEAR = 'bloquear';

// Como o cliente lê cada grupo de cor. O grupo vem do cadastro técnico
// (CONFIG_CORES.grupo); este mapa só traduz para português de tela e
// explica onde aquela cor é usada — grupo novo cai no próprio nome.
const GRUPOS = {
  produto:        { titulo: 'Cor do copo', ajuda: 'A cor da peça crua. Cada cor é um produto irmão no cadastro — o catálogo oferece as que estiverem publicadas.' },
  pintura:        { titulo: 'Cores de pintura', ajuda: 'Alimenta os campos de cor base, cor da boca e degradê.' },
  borda:          { titulo: 'Cores de borda', ajuda: 'Só os acabamentos com borda usam esta lista.' },
  jateado:        { titulo: 'Cores de jateado', ajuda: 'Usada quando o acabamento pede jateamento.' },
  personalizacao: { titulo: 'Cores de personalização', ajuda: 'As cores de tinta que o cliente pode escolher para a arte.' },
};

export default function CatalogoDoProduto({ productId }) {
  const qc = useQueryClient();

  const { data: ficha, isLoading, error } = useQuery({
    queryKey: ['produto-catalogo', productId],
    queryFn: () => api.get(`/products/${productId}/catalogo`),
    enabled: !!productId,
  });

  // O rascunho da tela. Começa vazio e vai recebendo só o que o usuário
  // mexeu — o PUT grava bloco a bloco, então mandar apenas o alterado é o
  // que impede salvar o gabarito e apagar os acabamentos sem querer.
  const [rascunho, setRascunho] = useState({});
  useEffect(() => { setRascunho({}); }, [productId]);

  const salvar = useMutation({
    mutationFn: corpo => api.put(`/products/${productId}/catalogo`, corpo),
    onSuccess: () => {
      toast.success('Ficha de catálogo salva');
      setRascunho({});
      qc.invalidateQueries(['produto-catalogo', productId]);
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const publicarModelo = useMutation({
    mutationFn: publicar => api.post(`/products/${productId}/catalogo/publicar-modelo`, { publicar }),
    onSuccess: r => {
      toast.success(`${r.atualizados} cor(es) do modelo ${r.atualizados === 1 ? 'atualizada' : 'atualizadas'}`);
      qc.invalidateQueries(['produto-catalogo', productId]);
      qc.invalidateQueries(['products']);
    },
    onError: e => toast.error(e.error || 'Erro ao publicar o modelo'),
  });

  // O estado vigente de um item: o que o usuário acabou de escolher ou,
  // se ele não mexeu, o que está gravado.
  const estadoDe = (bloco, id, original) => rascunho[bloco]?.[id] ?? original;

  function mexer(bloco, id, valor) {
    setRascunho(a => ({ ...a, [bloco]: { ...(a[bloco] || {}), [id]: valor } }));
  }

  /** Monta o corpo do PUT com os blocos que foram tocados. */
  function corpoParaSalvar() {
    const corpo = {};
    for (const [bloco, campo] of [['acabamentos', 'acabamentos'], ['cores', 'cores'], ['processos', 'processos']]) {
      if (!rascunho[bloco]) continue;
      // Cada bloco vai INTEIRO: o servidor reescreve as exceções do
      // produto naquele tipo, e mandar meia lista apagaria o resto.
      corpo[campo] = { ...estadosOriginais(ficha, bloco), ...rascunho[bloco] };
    }
    if (rascunho.gabarito !== undefined) corpo.gabarito = rascunho.gabarito;
    if (rascunho.embalagem !== undefined) corpo.embalagem = rascunho.embalagem;
    if (rascunho.familias !== undefined) corpo.familias = rascunho.familias;
    return corpo;
  }

  const mudou = Object.keys(rascunho).length > 0;

  if (!productId) {
    return (
      <Aviso icone={Info} cor="violet">
        Salve o produto primeiro. Depois de existir no cadastro, ele pode ser publicado no catálogo
        e configurado aqui.
      </Aviso>
    );
  }

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={26} className="animate-spin text-violet-500" /></div>;
  }
  if (error) {
    return <Aviso icone={AlertTriangle} cor="red">{error.error || 'Não consegui abrir a ficha de catálogo.'}</Aviso>;
  }
  if (ficha?.config_ausente) {
    return (
      <Aviso icone={AlertTriangle} cor="amber">
        A configuração técnica ainda não existe neste banco. Rode as migrações <b>074</b> e
        <b> 076</b> para cadastrar acabamentos, cores, processos e gabaritos.
      </Aviso>
    );
  }

  const p = ficha.produto;

  return (
    <div className="space-y-5">

      {/* ── O que o cliente vai ler ───────────────────────── */}
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-500">
              No catálogo o cliente vê
            </p>
            <p className="text-lg font-bold text-gray-900 mt-0.5">{p.nome_catalogo || p.nome}</p>
            <p className="text-xs text-gray-500 mt-1">
              {[
                p.categoria && `Categoria: ${p.categoria}`,
                p.capacidade && `Capacidade: ${p.capacidade}`,
                p.cor && `Cor desta linha: ${p.cor}`,
                p.linha && `Linha/tinta: ${p.linha}`,
                `Mínimo: ${p.qtd_minima} un`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${
              p.show_in_catalogo ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'
            }`}>
              {p.show_in_catalogo ? <><Eye size={13} /> Publicado</> : <><EyeOff size={13} /> Rascunho</>}
            </span>
            <p className="text-[11px] text-gray-500 mt-1.5 max-w-[220px]">
              A chave de publicação fica na aba <b>Cadastro</b>.
            </p>
          </div>
        </div>

        {/* No cadastro existe um produto POR COR. Publicar de uma em uma
            seriam 24 cliques para colocar um modelo no ar — e é assim que
            metade das cores fica esquecida fora da vitrine. */}
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-violet-200">
          <button type="button" className="btn-secondary btn-sm"
            disabled={publicarModelo.isPending}
            onClick={() => publicarModelo.mutate(true)}>
            <Sparkles size={13} /> Publicar todas as cores deste modelo
          </button>
          <button type="button" className="btn-secondary btn-sm text-red-600"
            disabled={publicarModelo.isPending}
            onClick={() => publicarModelo.mutate(false)}>
            <EyeOff size={13} /> Tirar o modelo inteiro do ar
          </button>
        </div>
      </div>

      {/* O cliente escolhe "Long Drink 350 ml" e a cor depois; no cadastro
          cada cor é um produto. Uma exceção que valesse só nesta linha
          deixaria metade das cores aceitando Jateado e a outra metade
          não — e o site, que pergunta pelo modelo, teria duas respostas
          para a mesma pergunta. Dizer isso na tela evita a surpresa. */}
      <Aviso icone={Info} cor="violet">
        O que você marcar abaixo vale para <b>o modelo inteiro</b> ({p.nome_catalogo}) — todas as
        cores dele. É assim porque no catálogo o cliente escolhe o modelo primeiro e a cor depois.
        A publicação, essa sim, é por cor.
      </Aviso>

      {!ficha.coluna_publicacao && (
        <Aviso icone={AlertTriangle} cor="amber">
          A coluna de publicação ainda não existe no banco. Rode a migração <b>077</b> — até lá o
          catálogo segue usando a mesma chave da loja de lisos.
        </Aviso>
      )}

      {/* ── Acabamentos ──────────────────────────────────── */}
      <Bloco titulo="Acabamentos permitidos" icone={Layers}
        ajuda="Cada acabamento vira um card na vitrine. O nome ao lado é exatamente o que o cliente vai ler.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ficha.acabamentos.map(a => (
            <LinhaTri key={a.id}
              titulo={a.nome}
              sub={a.nome_comercial}
              alerta={!a.no_catalogo ? 'Este acabamento está marcado como “não aparece no catálogo” na configuração técnica.' : null}
              herdado={a.herdado}
              estado={estadoDe('acabamentos', a.id, a.estado)}
              onMudar={v => mexer('acabamentos', a.id, v)} />
          ))}
          {!ficha.acabamentos.length && <Vazio texto="Nenhum acabamento cadastrado na configuração técnica." />}
        </div>
      </Bloco>

      {/* ── Cores, por onde se aplicam ───────────────────── */}
      <Bloco titulo="Cores permitidas" icone={Palette}
        ajuda="Cor de borda não é cor de pintura nem cor de personalização. Cada campo do configurador se alimenta de uma destas listas.">
        <div className="space-y-4">
          {Object.entries(ficha.cores).map(([grupo, lista]) => (
            <div key={grupo}>
              <p className="text-sm font-semibold text-gray-700">
                {GRUPOS[grupo]?.titulo || grupo}
                <span className="ml-2 text-[11px] font-normal text-gray-400">
                  {lista.filter(c => (estadoDe('cores', c.id, c.estado) === PERMITIR)
                    || (estadoDe('cores', c.id, c.estado) === HERDAR && c.herdado)).length} de {lista.length} liberadas
                </span>
              </p>
              {GRUPOS[grupo]?.ajuda && (
                <p className="text-[11px] text-gray-500 mt-0.5 mb-1.5">{GRUPOS[grupo].ajuda}</p>
              )}
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3 max-h-64 overflow-y-auto pr-1">
                {lista.map(c => (
                  <LinhaTri key={c.id} compacto
                    titulo={c.name}
                    cor={c.hex}
                    herdado={c.herdado}
                    estado={estadoDe('cores', c.id, c.estado)}
                    onMudar={v => mexer('cores', c.id, v)} />
                ))}
              </div>
            </div>
          ))}
          {!Object.keys(ficha.cores).length && <Vazio texto="Nenhuma cor cadastrada na configuração técnica." />}
        </div>
      </Bloco>

      {/* ── Impressão ────────────────────────────────────── */}
      <Bloco titulo="Tipo de impressão" icone={Droplet}
        ajuda="A química da tinta tem que casar com o material do copo. O cliente escolhe a cor da arte; a linha de tinta quem determina é a ficha técnica.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ficha.processos.map(pr => (
            <LinhaTri key={pr.id}
              titulo={pr.nome}
              sub={[pr.max_cores ? `até ${pr.max_cores} cor(es)` : 'colorido', pr.linha_tinta && `tinta ${pr.linha_tinta}`]
                .filter(Boolean).join(' · ')}
              alerta={pr.incompativel
                ? `Tinta ${pr.linha_tinta} num copo ${p.linha}: incompatível de fábrica.`
                : null}
              herdado={pr.herdado}
              estado={estadoDe('processos', pr.id, pr.estado)}
              onMudar={v => mexer('processos', pr.id, v)} />
          ))}
          {!ficha.processos.length && <Vazio texto="Nenhum processo de impressão cadastrado." />}
        </div>
      </Bloco>

      {/* ── Caixa do liso ────────────────────────────────── */}
      <RegraHerdavel
        titulo="Caixa do pedido liso" icone={Package}
        ajuda="No modo liso o cliente compra caixa fechada. Estes números viram o mínimo de unidades e o teto de cores no site."
        vigente={ficha.embalagem}
        rascunho={rascunho.embalagem}
        onMudar={v => setRascunho(a => ({ ...a, embalagem: v }))}
        resumo={e => `caixa de ${e.caixa_qtd} un · até ${e.max_cores_caixa} cores · mínimo ${e.min_caixas} caixa(s)`}
        campos={[
          { key: 'caixa_qtd', rotulo: 'Unidades por caixa', tipo: 'numero' },
          { key: 'max_cores_caixa', rotulo: 'Máximo de cores na caixa', tipo: 'numero' },
          { key: 'min_caixas', rotulo: 'Mínimo de caixas', tipo: 'numero' },
        ]} />

      {/* ── Gabarito da arte ─────────────────────────────── */}
      <RegraHerdavel
        titulo="Gabarito da arte" icone={Ruler}
        ajuda="A área em que a arte pode existir, em milímetros. Sem gabarito o editor de arte não abre — e é de propósito: arte sem medida volta cortada da gráfica."
        vigente={ficha.gabarito}
        rascunho={rascunho.gabarito}
        onMudar={v => setRascunho(a => ({ ...a, gabarito: v }))}
        alertaSemMedida="Este produto ainda não tem gabarito — nem próprio, nem herdado da categoria. O cliente vai conseguir configurar o copo, mas não montar arte."
        resumo={g => (g.largura_mm && g.altura_mm)
          ? `${g.largura_mm} × ${g.altura_mm} mm · margem ${g.margem_mm} mm${g.permite_verso === false ? ' · só frente' : ''}`
          : null}
        campos={[
          { key: 'largura_mm', rotulo: 'Largura (mm)', tipo: 'numero' },
          { key: 'altura_mm', rotulo: 'Altura (mm)', tipo: 'numero' },
          { key: 'margem_mm', rotulo: 'Margem segura (mm)', tipo: 'numero' },
          { key: 'permite_verso', rotulo: 'Aceita arte no verso', tipo: 'sim_nao' },
          { key: 'observacao', rotulo: 'Observação para o editor', tipo: 'texto', largo: true },
        ]}
        padrao={{ largura_mm: 45, altura_mm: 120, margem_mm: 2, permite_verso: true, observacao: '' }} />

      {/* ── Famílias da vitrine ──────────────────────────── */}
      <Bloco titulo="Famílias da vitrine" icone={LayoutGrid}
        ajuda="A família é o card da primeira tela do catálogo. O normal é a família pegar a categoria inteira; marque aqui só se este produto tiver de entrar numa família avulsa.">
        <div className="grid gap-1.5 sm:grid-cols-2">
          {ficha.familias.map(f => {
            const marcadas = rascunho.familias
              ?? ficha.familias.filter(x => x.via === 'produto').map(x => x.id);
            const porCategoria = f.via === 'categoria';
            const marcada = porCategoria || marcadas.includes(f.id);
            return (
              <label key={f.id}
                className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg border ${
                  marcada ? 'border-violet-300 bg-violet-50' : 'border-gray-200'
                } ${porCategoria ? 'opacity-70' : 'cursor-pointer hover:bg-gray-50'}`}>
                <input type="checkbox" checked={marcada} disabled={porCategoria}
                  onChange={e => setRascunho(a => ({
                    ...a,
                    familias: e.target.checked
                      ? [...marcadas, f.id]
                      : marcadas.filter(x => x !== f.id),
                  }))} />
                <span className="min-w-0 flex-1 truncate">{f.nome}</span>
                {porCategoria && (
                  <span className="text-[10px] text-gray-500 shrink-0">pela categoria</span>
                )}
              </label>
            );
          })}
          {!ficha.familias.length && (
            <Vazio texto="Nenhuma família cadastrada. Crie em Configurações → Catálogo." />
          )}
        </div>
      </Bloco>

      {/* ── Salvar ───────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 pt-3 border-t border-gray-100 sticky bottom-0 bg-white py-3">
        <p className="text-xs text-gray-500">
          {mudou
            ? 'Há alterações não salvas nesta aba.'
            : 'Tudo salvo. O catálogo já mostra exatamente o que está aqui.'}
        </p>
        <div className="flex gap-2">
          {mudou && (
            <button type="button" className="btn-secondary btn-sm" onClick={() => setRascunho({})}>
              <RotateCcw size={13} /> Descartar
            </button>
          )}
          <button type="button" className="btn btn-primary"
            disabled={!mudou || salvar.isPending}
            onClick={() => salvar.mutate(corpoParaSalvar())}>
            {salvar.isPending
              ? <><Loader2 size={15} className="animate-spin" /> Salvando…</>
              : <><Save size={15} /> Salvar ficha de catálogo</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/** O que está gravado hoje, no formato do PUT. */
function estadosOriginais(ficha, bloco) {
  const saida = {};
  const lista = bloco === 'cores'
    ? Object.values(ficha.cores || {}).flat()
    : (ficha[bloco] || []);
  for (const item of lista) saida[item.id] = item.estado;
  return saida;
}

// ── Peças de tela ───────────────────────────────────────────

function Bloco({ titulo, icone: Icone, ajuda, children }) {
  return (
    <section className="border border-gray-200 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
        {Icone && <Icone size={15} className="text-violet-500" />} {titulo}
      </h3>
      {ajuda && <p className="text-[11.5px] text-gray-500 mt-1 mb-3 leading-relaxed">{ajuda}</p>}
      {children}
    </section>
  );
}

/**
 * O controle de três estados.
 *
 * "Herdar" mostra o que a categoria decide, para o usuário não precisar
 * abrir outra tela para saber se aquilo está aberto ou fechado hoje.
 */
function LinhaTri({ titulo, sub, cor, alerta, herdado, estado, onMudar, compacto }) {
  const efetivo = estado === PERMITIR ? true : estado === BLOQUEAR ? false : herdado;

  return (
    <div className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${
      efetivo ? 'border-gray-200' : 'border-gray-200 bg-gray-50'
    }`}>
      {cor !== undefined && (
        <span className="w-4 h-4 rounded-full shrink-0"
          style={{ background: cor || 'transparent', border: cor ? '1px solid rgba(0,0,0,.15)' : '1px dashed #cbd5e1' }} />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-[13px] leading-tight truncate ${efetivo ? 'text-gray-900' : 'text-gray-400 line-through'}`}>
          {titulo}
        </p>
        {!compacto && sub && <p className="text-[10.5px] text-gray-400 truncate">{sub}</p>}
        {alerta && (
          <p className="text-[10.5px] text-amber-600 flex items-start gap-1 mt-0.5">
            <AlertTriangle size={10} className="shrink-0 mt-0.5" /> {alerta}
          </p>
        )}
      </div>

      <div className="flex shrink-0 rounded-md overflow-hidden border border-gray-200">
        {[
          { v: HERDAR, t: herdado ? 'Herda: liberado' : 'Herda: bloqueado', l: 'Herdar' },
          { v: PERMITIR, t: 'Liberar só neste produto', l: 'Sim' },
          { v: BLOQUEAR, t: 'Bloquear só neste produto', l: 'Não' },
        ].map(o => (
          <button key={o.v} type="button" title={o.t} onClick={() => onMudar(o.v)}
            className={`px-2 py-1 text-[10.5px] font-medium transition-colors ${
              estado === o.v
                ? (o.v === BLOQUEAR ? 'bg-red-500 text-white'
                  : o.v === PERMITIR ? 'bg-green-500 text-white'
                  : 'bg-gray-700 text-white')
                : 'bg-white text-gray-500 hover:bg-gray-50'
            }`}>
            {o.l}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Uma regra que o produto herda da categoria e pode sobrescrever.
 *
 * O botão "voltar a herdar" precisa existir: sem ele, quem criasse uma
 * exceção por engano ficaria preso a ela para sempre.
 */
function RegraHerdavel({
  titulo, icone, ajuda, vigente, rascunho, onMudar, campos, resumo, padrao, alertaSemMedida,
}) {
  // `undefined` = não mexeu; `null` = pediu para herdar; objeto = próprio.
  const mexido = rascunho !== undefined;
  const proprio = mexido ? rascunho !== null : vigente.proprio;
  const valores = mexido && rascunho ? rascunho : vigente;
  const semMedida = alertaSemMedida && !resumo(valores);

  function ativarProprio() {
    onMudar({ ...padrao, ...camposDe(vigente, campos) });
  }

  return (
    <Bloco titulo={titulo} icone={icone} ajuda={ajuda}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className={`text-[11px] px-2 py-1 rounded-full ${
          proprio ? 'bg-violet-100 text-violet-700' : 'bg-gray-100 text-gray-600'
        }`}>
          {proprio ? 'Regra própria deste produto' : vigente.origem === 'categoria' ? 'Herdado da categoria' : 'Padrão do sistema'}
        </span>
        {!proprio && resumo(vigente) && (
          <span className="text-[11.5px] text-gray-500">{resumo(vigente)}</span>
        )}
        <span className="ml-auto flex gap-2">
          {proprio ? (
            <button type="button" className="btn-secondary btn-sm" onClick={() => onMudar(null)}>
              <RotateCcw size={13} /> Voltar a herdar
            </button>
          ) : (
            <button type="button" className="btn-secondary btn-sm" onClick={ativarProprio}>
              <Check size={13} /> Definir só para este produto
            </button>
          )}
        </span>
      </div>

      {semMedida && (
        <Aviso icone={AlertTriangle} cor="amber">{alertaSemMedida}</Aviso>
      )}

      <div className={`grid gap-3 sm:grid-cols-2 ${proprio ? '' : 'opacity-50 pointer-events-none'}`}>
        {campos.map(c => (
          <div key={c.key} className={c.largo ? 'sm:col-span-2' : ''}>
            <label className="label text-xs">{c.rotulo}</label>
            {c.tipo === 'sim_nao' ? (
              <label className="flex items-center gap-2 text-sm text-gray-700 h-[38px]">
                <input type="checkbox" checked={valores[c.key] !== false}
                  onChange={e => onMudar({ ...valores, [c.key]: e.target.checked })} />
                {valores[c.key] !== false ? 'Sim' : 'Não'}
              </label>
            ) : c.tipo === 'numero' ? (
              <input type="number" step="any" min="0" className="input text-sm"
                value={valores[c.key] ?? ''}
                onChange={e => onMudar({ ...valores, [c.key]: e.target.value === '' ? '' : Number(e.target.value) })} />
            ) : (
              <input className="input text-sm" value={valores[c.key] ?? ''}
                onChange={e => onMudar({ ...valores, [c.key]: e.target.value })} />
            )}
          </div>
        ))}
      </div>
    </Bloco>
  );
}

/** Só os campos da regra, sem `origem`, `proprio` e companhia. */
function camposDe(objeto, campos) {
  const saida = {};
  for (const c of campos) if (objeto?.[c.key] != null) saida[c.key] = objeto[c.key];
  return saida;
}

const CORES_AVISO = {
  violet: 'border-violet-200 bg-violet-50 text-violet-800',
  amber:  'border-amber-200 bg-amber-50 text-amber-800',
  red:    'border-red-200 bg-red-50 text-red-700',
};

function Aviso({ icone: Icone, cor = 'violet', children }) {
  return (
    <div className={`flex items-start gap-2 text-[12.5px] rounded-lg border p-3 ${CORES_AVISO[cor]}`}>
      <Icone size={14} className="shrink-0 mt-0.5" />
      <span>{children}</span>
    </div>
  );
}

const Vazio = ({ texto }) => (
  <p className="text-xs text-gray-400 py-4 text-center sm:col-span-2 lg:col-span-3">{texto}</p>
);
