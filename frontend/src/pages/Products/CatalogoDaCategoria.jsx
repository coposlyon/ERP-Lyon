// ============================================================
// O CATÁLOGO DA CATEGORIA INTEIRA.
//
// A matriz aceita regra por CATEGORIA ou por PRODUTO, e a de categoria
// resolve o caso comum: "todo Long Drink 350 aceita borda". Até aqui só
// existia tela para a regra de PRODUTO — quem quisesse abrir a borda
// para a categoria inteira tinha de abrir os 24 produtos, um a um.
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
import { Loader2, Save, Layers, Printer, Palette } from 'lucide-react';
import api from '@/lib/api';

const GRUPOS = [
  { chave: 'acabamentos', tipo: 'acabamento', rotulo: 'Acabamentos', Icone: Layers,
    ajuda: 'O que dá para aplicar na peça — borda, degradê, jateado. É isto que vira card no configurador.' },
  { chave: 'processos', tipo: 'processo', rotulo: 'Tipos de impressão', Icone: Printer,
    ajuda: 'Como a arte entra no copo. A linha da tinta quem determina é a ficha técnica.' },
  { chave: 'cores', tipo: 'cor', rotulo: 'Cores', Icone: Palette,
    ajuda: 'As cores que o cliente pode escolher nos campos do acabamento (cor da boca, do jateado, da borda).' },
];

export default function CatalogoDaCategoria({ categoryId, titulo }) {
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

      <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
        {itens.map(it => (
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
        ))}
      </div>
    </div>
  );
}
