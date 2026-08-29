// ============================================================
// O QUE ESTE COPO TEM DE PRÓPRIO NESTA VITRINE.
//
// O mesmo Long Drink 350 ml é vendido nos dois sites, e é o MESMO
// produto: mesmo código, mesmo estoque, mesma ficha de custo. Só que ele
// não se vende igual nos dois — na loja é unidade avulsa com preço de
// prateleira; no catálogo é caixa fechada, com mínimo alto e um preço
// que já embute a personalização.
//
// Até a migração 094 as duas vitrines liam as mesmas colunas: mexer no
// preço do catálogo mexia no da loja no mesmo instante.
//
// VAZIO É HERDAR, e é assim que o campo nasce. O placeholder mostra o
// que o cadastro diz hoje, para ninguém precisar abrir outra aba para
// saber de quanto está falando — e para "R$ 1,44" cinza no campo vazio
// ser lido como "é isto que vale", não como "está faltando preencher".
//
// Este bloco fica GRUDADO na chave que publica o produto naquele site.
// Preço de vitrine longe da chave que liga a vitrine é o tipo de coisa
// que alguém configura no site errado.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, Loader2, Save, RotateCcw } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const brl = v => (v == null || v === '' ? '—'
  : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0));

const CAMPOS = [
  { chave: 'sale_price',    rotulo: 'Preço de venda',   tipo: 'moeda' },
  { chave: 'min_order_qty', rotulo: 'Quantidade mínima', tipo: 'inteiro' },
  { chave: 'image_url',     rotulo: 'Foto (endereço)',  tipo: 'texto', largo: true },
  { chave: 'description',   rotulo: 'Descrição',        tipo: 'texto', largo: true },
];

export default function AjusteDeVitrine({ productId, ambiente, nomeDaVitrine }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({});

  // Uma consulta só para os dois blocos: a chave é do produto, não do
  // ambiente, então loja e catálogo dividem a mesma resposta.
  const { data, isLoading } = useQuery({
    queryKey: ['produto-ambientes', productId],
    queryFn: () => api.get(`/products/${productId}/ambientes`),
    enabled: !!productId && aberto,
  });

  const atual = data?.ambientes?.[ambiente] || null;

  // O formulário só nasce quando a resposta chega — e guarda apenas o que
  // é PRÓPRIO. Copiar o efetivo para dentro do campo transformaria toda
  // herança em exceção no primeiro "salvar".
  useEffect(() => {
    if (!atual) return;
    setForm(Object.fromEntries(CAMPOS.map(c => [c.chave, atual[c.chave]?.valor ?? ''])));
  }, [data, ambiente]); // eslint-disable-line

  const salvar = useMutation({
    mutationFn: corpo => api.put(`/products/${productId}/ambientes/${ambiente}`, corpo),
    onSuccess: r => {
      toast.success(r.herdando
        ? `${nomeDaVitrine}: voltou a herdar tudo do cadastro`
        : `Ajustes do ${nomeDaVitrine.toLowerCase()} salvos`);
      qc.invalidateQueries({ queryKey: ['produto-ambientes', productId] });
      qc.invalidateQueries({ queryKey: ['products'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });

  const temProprio = CAMPOS.some(c => atual?.[c.chave]?.proprio);
  const mudou = atual && CAMPOS.some(c => String(form[c.chave] ?? '') !== String(atual[c.chave]?.valor ?? ''));

  return (
    <div className="mt-2 ml-1 border-l-2 border-gray-100 pl-3">
      <button type="button" onClick={() => setAberto(a => !a)}
        className="flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-gray-800">
        {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        Preço e mínimo desta vitrine
        {temProprio && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            tem ajuste próprio
          </span>
        )}
      </button>

      {aberto && (
        isLoading ? (
          <p className="text-xs text-gray-400 mt-2 flex items-center gap-1.5">
            <Loader2 size={12} className="animate-spin" /> Carregando…
          </p>
        ) : !atual ? (
          <p className="text-xs text-gray-400 mt-2">Salve o produto antes de ajustar a vitrine.</p>
        ) : (
          <div className="mt-2 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {CAMPOS.map(c => {
                const info = atual[c.chave] || {};
                const herdado = info.proprio ? null : info.efetivo;
                return (
                  <div key={c.chave} className={c.largo ? 'sm:col-span-2' : ''}>
                    <label className="label text-[11px]">{c.rotulo}</label>
                    <input
                      className="input text-sm"
                      type={c.tipo === 'texto' ? 'text' : 'number'}
                      step={c.tipo === 'moeda' ? '0.01' : '1'}
                      min={c.tipo === 'moeda' ? '0' : '1'}
                      value={form[c.chave] ?? ''}
                      onChange={e => setForm(f => ({ ...f, [c.chave]: e.target.value }))}
                      placeholder={placeholderDe(c, info)} />
                    {info.proprio && (
                      <p className="text-[10px] text-gray-400 mt-0.5">
                        O cadastro diz {c.tipo === 'moeda' ? brl(data.mestre[c.chave]) : (data.mestre[c.chave] ?? '—')}.
                        Apague para voltar a herdar.
                      </p>
                    )}
                    {!info.proprio && herdado != null && herdado !== '' && c.tipo !== 'texto' && (
                      <p className="text-[10px] text-gray-400 mt-0.5">Herdando do cadastro.</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button type="button" disabled={!mudou || salvar.isPending}
                onClick={() => salvar.mutate(form)}
                className="btn-primary btn-sm disabled:opacity-45">
                {salvar.isPending
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Save size={13} />} Salvar ajustes
              </button>
              {temProprio && (
                <button type="button" disabled={salvar.isPending}
                  onClick={() => salvar.mutate(Object.fromEntries(CAMPOS.map(c => [c.chave, ''])))}
                  className="btn-secondary btn-sm"
                  title="Apaga as exceções: esta vitrine volta a seguir o cadastro">
                  <RotateCcw size={13} /> Voltar a herdar tudo
                </button>
              )}
            </div>

            <p className="text-[10.5px] text-gray-400">
              Campo vazio segue o cadastro — inclusive quando o cadastro mudar depois.
              O que você escrever aqui vale só em <b>{nomeDaVitrine}</b>.
            </p>
          </div>
        )
      )}
    </div>
  );
}

/** O placeholder é o valor herdado — nunca "digite algo". */
function placeholderDe(campo, info) {
  if (info.proprio) return '';
  const v = info.efetivo;
  if (v == null || v === '') return 'segue o cadastro';
  return campo.tipo === 'moeda' ? `segue o cadastro: ${brl(v)}` : `segue o cadastro: ${v}`;
}
