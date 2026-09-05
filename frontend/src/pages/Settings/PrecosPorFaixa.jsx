// ============================================================
// O PREÇO DO ACABAMENTO E DA IMPRESSÃO, POR FAIXA DE QUANTIDADE.
//
// O produto já tinha faixa — "de 100 para cima, sai a tanto". O que se
// aplica EM CIMA dele não tinha: acabamento e tipo de impressão tinham
// um número só, cobrado igual para dez peças e para dois mil.
//
// É justamente aí que a escala aparece. Montar a tela da serigrafia
// custa o mesmo para 50 ou para 500 copos; cobrar por unidade o mesmo
// valor nos dois casos erra para os dois lados — caro no pedido grande,
// barato no pequeno.
//
// A FAIXA VAZIA NÃO É UM ERRO. Quem deixar a lista em branco continua
// cobrando o valor único de sempre (o campo "a partir de"), que vira o
// piso. Ninguém é obrigado a montar faixa para um acabamento que não
// muda de preço com a quantidade.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Plus, Trash2, Loader2, Save, Layers, Printer } from 'lucide-react';
import api from '@/lib/api';

const brl = v => 'R$ ' + (Number(v) || 0).toFixed(2).replace('.', ',');

// As faixas que o comercial usa. Botão de atalho: montar seis linhas à
// mão para catorze acabamentos é o tipo de trabalho que faz ninguém
// preencher.
const PADRAO = [[50, 99], [100, 199], [200, null]];

export default function PrecosPorFaixa() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['catalogo-precos'],
    queryFn: () => api.get('/catalogo-admin/precos'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" /></div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gray-200 px-4 py-3">
        <p className="text-sm text-gray-600">
          Aqui se define <b>quanto o acabamento e a impressão custam por faixa de
          quantidade</b> — "de 100 para cima, sai a tanto". Quem não usar faixa
          continua com o valor único, que vale como piso.
        </p>
      </div>

      <Grupo titulo="Acabamentos" Icone={Layers} tipo="acabamento"
        itens={data?.acabamentos || []} qc={qc} />
      <Grupo titulo="Tipos de impressão" Icone={Printer} tipo="processo"
        itens={data?.processos || []} qc={qc} />
    </div>
  );
}

function Grupo({ titulo, Icone, tipo, itens, qc }) {
  if (!itens.length) return null;
  return (
    <div>
      <p className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-2">
        <Icone size={15} /> {titulo}
      </p>
      <div className="space-y-2">
        {itens.map(it => <Linha key={it.id} item={it} tipo={tipo} qc={qc} />)}
      </div>
    </div>
  );
}

function Linha({ item, tipo, qc }) {
  const [aberto, setAberto] = useState(false);
  const [base, setBase] = useState(String(item.preco_adicional ?? 0));
  const [faixas, setFaixas] = useState(
    Array.isArray(item.faixas) ? item.faixas.map(f => ({ ...f })) : [],
  );

  // O servidor é a verdade: depois de salvar, a lista volta dele. Sem
  // isto, editar duas vezes seguidas partiria do rascunho antigo.
  useEffect(() => {
    setBase(String(item.preco_adicional ?? 0));
    setFaixas(Array.isArray(item.faixas) ? item.faixas.map(f => ({ ...f })) : []);
  }, [item]);

  const salvar = useMutation({
    mutationFn: () => api.put(`/catalogo-admin/precos/${tipo}/${item.id}`, {
      preco_adicional: base, faixas,
    }),
    onSuccess: () => {
      toast.success(`${item.name}: preços salvos`);
      qc.invalidateQueries({ queryKey: ['catalogo-precos'] });
    },
    onError: e => toast.error(e.error || 'Não consegui salvar'),
  });

  const mudar = (i, campo, v) =>
    setFaixas(f => f.map((x, k) => (k === i ? { ...x, [campo]: v } : x)));

  const resumo = faixas.length
    ? `${faixas.length} faixa${faixas.length > 1 ? 's' : ''} · a partir de ${brl(base)}`
    : `valor único · ${brl(base)}`;

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <button type="button" onClick={() => setAberto(v => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-800 break-words">{item.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">{resumo}</p>
        </div>
        <span className="text-xs text-primary-600 shrink-0">{aberto ? 'fechar' : 'editar'}</span>
      </button>

      {aberto && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-100 space-y-3">

          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Valor por unidade (piso)
              </label>
              <input className="input text-sm w-40 text-right" inputMode="decimal"
                value={base} onChange={e => setBase(e.target.value.replace(/[^\d.,]/g, ''))} />
            </div>
            <p className="text-xs text-gray-400 pb-2 flex-1 min-w-[220px]">
              É o que se cobra quando <b>nenhuma faixa alcança</b> a quantidade do
              pedido. Sem faixa nenhuma, é sempre ele.
            </p>
          </div>

          {faixas.length > 0 && (
            <div className="space-y-1.5">
              <div className="flex gap-2 text-[11px] uppercase tracking-wide text-gray-400">
                <span className="w-24">A partir de</span>
                <span className="w-24">Até</span>
                <span className="w-28">Por unidade</span>
              </div>
              {faixas.map((f, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className="input text-sm w-24 text-right" inputMode="numeric"
                    value={f.min_qty ?? ''} placeholder="50"
                    onChange={e => mudar(i, 'min_qty', e.target.value.replace(/\D/g, ''))} />
                  {/* VAZIO É "DAÍ PARA CIMA", e a tela diz isso no
                      lugar de deixar adivinhar. Sem a faixa aberta no
                      fim, um pedido acima do teto cairia no piso — que é
                      o preço do pedido PEQUENO. */}
                  <input className="input text-sm w-24 text-right" inputMode="numeric"
                    value={f.max_qty ?? ''} placeholder="sem limite"
                    onChange={e => mudar(i, 'max_qty', e.target.value.replace(/\D/g, ''))} />
                  <input className="input text-sm w-28 text-right" inputMode="decimal"
                    value={f.price ?? ''} placeholder="0,00"
                    onChange={e => mudar(i, 'price', e.target.value.replace(/[^\d.,]/g, ''))} />
                  <button type="button" title="Tirar esta faixa"
                    onClick={() => setFaixas(x => x.filter((_, k) => k !== i))}
                    className="text-gray-300 hover:text-red-500">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            <button type="button" className="btn-secondary text-xs"
              onClick={() => setFaixas(f => [...f, { min_qty: '', max_qty: '', price: '' }])}>
              <Plus size={13} /> Faixa
            </button>
            {faixas.length === 0 && (
              <button type="button" className="btn-secondary text-xs"
                onClick={() => setFaixas(PADRAO.map(([a, b]) => ({ min_qty: a, max_qty: b, price: '' })))}>
                Usar 50 / 100 / 200
              </button>
            )}
            <button type="button" className="btn-primary text-xs ml-auto"
              disabled={salvar.isPending} onClick={() => salvar.mutate()}>
              {salvar.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
