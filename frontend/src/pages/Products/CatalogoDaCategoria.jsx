// ============================================================
// O CATÁLOGO DA CATEGORIA INTEIRA.
//
// A matriz aceita regra por CATEGORIA ou por PRODUTO, e a de categoria
// resolve o caso comum: "todo Long Drink 350 aceita borda". Até aqui só
// existia tela para a regra de PRODUTO — quem quisesse abrir a borda
// para a categoria inteira tinha de abrir os 24 produtos, um a um.
//
// AQUI TAMBÉM SE DEFINE O PREÇO do acabamento e da impressão. Ligar um
// tipo de impressão e dizer quanto ele custa são a mesma decisão,
// tomada na mesma hora — separá-las em duas telas é o caminho mais
// curto para o preço ficar desatualizado.
//
// O QUE ESTA TELA NÃO FAZ: exceção. A regra de produto continua
// vencendo esta, e é assim que se abre para a categoria e se fecha uma
// cor específica sem reescrever o resto — isso continua na ficha do
// produto.
//
// LIGADO É LIGADO, DESLIGADO É A AUSÊNCIA DE REGRA. Não existe "não"
// gravado aqui: o que não está marcado simplesmente não tem linha, e a
// vitrine já lê ausência como "não aparece". Gravar um "não" para cada
// coisa encheria a tabela de decisões que ninguém tomou.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Save, Layers, Printer, Palette, Plus, Trash2, Tag } from 'lucide-react';
import api from '@/lib/api';

const brl = v => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');

// As faixas que o comercial usa, como atalho.
const PADRAO = [[50, 99], [100, 199], [200, null]];

// `preco: true` = a escolha cobra a mais. Cor não cobra: o copo azul e o
// verde custam o mesmo. Quem cobra é o acabamento e a impressão, que são
// trabalho aplicado em cima da peça.
const GRUPOS = [
  { chave: 'acabamentos', tipo: 'acabamento', rotulo: 'Acabamentos', Icone: Layers, preco: true,
    ajuda: 'O que dá para aplicar na peça — borda, degradê, jateado. É isto que vira card no configurador.' },
  { chave: 'processos', tipo: 'processo', rotulo: 'Tipos de impressão', Icone: Printer, preco: true,
    ajuda: 'Como a arte entra no copo. A linha da tinta quem determina é a ficha técnica.' },
  { chave: 'cores', tipo: 'cor', rotulo: 'Cores', Icone: Palette,
    ajuda: 'As cores que o cliente pode escolher nos campos do acabamento (cor da boca, do jateado, da borda).' },
];

export default function CatalogoDaCategoria({ categoryId }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['categoria-regras', categoryId],
    queryFn: () => api.get(`/catalogo-admin/categoria/${categoryId}/regras`),
    enabled: !!categoryId,
  });

  if (!categoryId) {
    return <p className="text-sm text-gray-500">Este modelo está sem categoria — não há regra a definir.</p>;
  }
  if (isLoading) {
    return <div className="flex justify-center py-10"><Loader2 className="animate-spin text-gray-300" /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-600">
        O que você marcar aqui vale para <b>a categoria inteira</b>
        {data?.categoria?.name ? <> — {data.categoria.name}</> : null}, e portanto para
        todos os modelos e cores dela. É o lugar de dizer, por exemplo, que
        <b> toda esta categoria aceita borda</b>.
      </p>

      {GRUPOS.map(g => (
        <Grupo key={g.chave} g={g} itens={data?.[g.chave] || []}
          categoryId={categoryId} qc={qc} />
      ))}

      <p className="text-xs text-gray-400">
        Exceção de uma cor específica continua na ficha daquele produto — a regra
        de produto vence esta.
      </p>
    </div>
  );
}

function Grupo({ g, itens, categoryId, qc }) {
  const [marcado, setMarcado] = useState({});

  // O servidor é a verdade. Depois de salvar a lista volta dele, e sem
  // isto a tela continuaria mostrando o rascunho anterior.
  useEffect(() => {
    const m = {};
    for (const it of itens) m[it.id] = !!it.permitido;
    setMarcado(m);
  }, [itens]);

  const salvar = useMutation({
    mutationFn: () => api.put(`/catalogo-admin/categoria/${categoryId}/regras`, {
      tipo: g.tipo, regras: marcado,
    }),
    onSuccess: r => {
      toast.success(`${g.rotulo}: ${r.liberados} liberado(s) para a categoria`);
      qc.invalidateQueries({ queryKey: ['categoria-regras', categoryId] });
    },
    onError: e => toast.error(e.error || 'Não consegui salvar'),
  });

  if (!itens.length) return null;
  const ligados = Object.values(marcado).filter(Boolean).length;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
            <g.Icone size={15} /> {g.rotulo}
            <span className="text-xs font-normal text-gray-400">
              {ligados} de {itens.length} liberados
            </span>
          </p>
          <p className="text-xs text-gray-500 mt-0.5">{g.ajuda}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className="btn-secondary text-xs"
            onClick={() => setMarcado(Object.fromEntries(itens.map(i => [i.id, true])))}>
            Todos
          </button>
          <button type="button" className="btn-secondary text-xs"
            onClick={() => setMarcado({})}>
            Nenhum
          </button>
          <button type="button" className="btn-primary text-xs"
            disabled={salvar.isPending} onClick={() => salvar.mutate()}>
            {salvar.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            Salvar
          </button>
        </div>
      </div>

      <div className={`p-3 gap-1.5 ${g.preco
        ? 'space-y-1.5'
        : 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
        {itens.map(it => (g.preco ? (
          <ItemComPreco key={it.id} it={it} tipo={g.tipo} qc={qc} categoryId={categoryId}
            ligado={!!marcado[it.id]}
            onLigar={() => setMarcado(m => ({ ...m, [it.id]: !m[it.id] }))} />
        ) : (
          <label key={it.id}
            className={`flex items-center gap-2 text-sm rounded-lg border px-2.5 py-2 cursor-pointer ${
              marcado[it.id] ? 'border-primary-300 bg-primary-50' : 'border-gray-200 hover:bg-gray-50'
            }`}>
            <input type="checkbox" className="w-4 h-4 accent-primary-600"
              checked={!!marcado[it.id]}
              onChange={() => setMarcado(m => ({ ...m, [it.id]: !m[it.id] }))} />
            {/* A bolinha da cor: numa lista de trinta tons, o nome
                sozinho não distingue "azul bic" de "azul translúcido". */}
            {it.hex && (
              <span className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0"
                style={{ background: it.hex }} />
            )}
            <span className="truncate">{it.nome}</span>
          </label>
        )))}
      </div>
    </div>
  );
}

/**
 * UMA LINHA QUE LIGA E TAMBÉM COBRA.
 *
 * O PREÇO É GLOBAL, e a tela diz isso em voz alta. Ele mora no cadastro
 * do acabamento ou do processo, não na categoria: "Serigrafia 1 cor"
 * custa o mesmo no Long Drink e na Caneca. O que é por categoria é só o
 * liga/desliga.
 *
 * Sem esse aviso, mexer no preço a partir da tela de uma categoria
 * parece mexer só nela — e o número muda em todas sem ninguém saber.
 */
function ItemComPreco({ it, tipo, qc, categoryId, ligado, onLigar }) {
  const [aberto, setAberto] = useState(false);
  const [base, setBase] = useState(String(it.preco_adicional ?? 0));
  const [faixas, setFaixas] = useState(
    Array.isArray(it.faixas) ? it.faixas.map(f => ({ ...f })) : [],
  );

  useEffect(() => {
    setBase(String(it.preco_adicional ?? 0));
    setFaixas(Array.isArray(it.faixas) ? it.faixas.map(f => ({ ...f })) : []);
  }, [it]);

  const salvar = useMutation({
    mutationFn: () => api.put(`/catalogo-admin/precos/${tipo}/${it.id}`, {
      preco_adicional: base, faixas,
    }),
    onSuccess: () => {
      toast.success(`${it.nome}: preço salvo`);
      qc.invalidateQueries({ queryKey: ['categoria-regras', categoryId] });
      qc.invalidateQueries({ queryKey: ['catalogo-precos'] });
    },
    onError: e => toast.error(e.error || 'Não consegui salvar o preço'),
  });

  const mudar = (i, campo, v) =>
    setFaixas(f => f.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));

  const somenteNumero = v => v.replace(/[^0-9]/g, '');
  const somenteValor = v => v.replace(/[^0-9.,]/g, '');

  return (
    <div className={`rounded-lg border ${ligado ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <input type="checkbox" className="w-4 h-4 accent-primary-600 shrink-0"
          checked={ligado} onChange={onLigar} />
        <span className="text-sm truncate flex-1 min-w-0">{it.nome}</span>

        <button type="button" onClick={() => setAberto(v => !v)}
          title="Quanto este item cobra a mais por unidade"
          className="text-xs text-gray-500 hover:text-primary-600 flex items-center gap-1 shrink-0">
          <Tag size={12} />
          {faixas.length
            ? `${faixas.length} faixa${faixas.length > 1 ? 's' : ''} · a partir de ${brl(base)}`
            : `+ ${brl(base)} por un.`}
        </button>
      </div>

      {aberto && (
        <div className="px-2.5 pb-2.5 pt-1 border-t border-gray-100 space-y-2 bg-white/60">
          <p className="text-[11px] text-gray-500">
            Vale para <b>todas as categorias</b> — o preço é do item, não desta
            categoria. Aqui se decide apenas se ele aparece.
          </p>

          <div className="flex items-end gap-2 flex-wrap">
            <div>
              <label className="block text-[11px] text-gray-500 mb-1">Por unidade</label>
              <input className="input text-sm w-28 text-right" inputMode="decimal"
                value={base} onChange={e => setBase(somenteValor(e.target.value))} />
            </div>
            <p className="text-[11px] text-gray-400 pb-2 flex-1 min-w-[180px]">
              É o que se cobra quando nenhuma faixa alcança a quantidade.
            </p>
          </div>

          {faixas.length > 0 && (
            <div className="space-y-1">
              <div className="flex gap-1.5 text-[10px] uppercase tracking-wide text-gray-400">
                <span className="w-20">A partir de</span>
                <span className="w-20">Até</span>
                <span className="w-24">Por unidade</span>
              </div>
              {faixas.map((f, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <input className="input text-xs w-20 text-right" inputMode="numeric"
                    value={f.min_qty ?? ''} placeholder="50"
                    onChange={e => mudar(i, 'min_qty', somenteNumero(e.target.value))} />
                  {/* Vazio é "daí para cima". Sem essa faixa aberta no
                      fim, pedido acima do teto cairia no piso — que é o
                      preço do pedido PEQUENO. */}
                  <input className="input text-xs w-20 text-right" inputMode="numeric"
                    value={f.max_qty ?? ''} placeholder="sem limite"
                    onChange={e => mudar(i, 'max_qty', somenteNumero(e.target.value))} />
                  <input className="input text-xs w-24 text-right" inputMode="decimal"
                    value={f.price ?? ''} placeholder="0,00"
                    onChange={e => mudar(i, 'price', somenteValor(e.target.value))} />
                  <button type="button" title="Tirar esta faixa"
                    onClick={() => setFaixas(x => x.filter((_, k) => k !== i))}
                    className="text-gray-300 hover:text-red-500">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="btn-secondary text-xs"
              onClick={() => setFaixas(f => [...f, { min_qty: '', max_qty: '', price: '' }])}>
              <Plus size={12} /> Faixa
            </button>
            {faixas.length === 0 && (
              <button type="button" className="btn-secondary text-xs"
                onClick={() => setFaixas(PADRAO.map(([a, b]) => ({ min_qty: a, max_qty: b, price: '' })))}>
                50 / 100 / 200
              </button>
            )}
            <button type="button" className="btn-primary text-xs ml-auto"
              disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              Salvar preço
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
