// ============================================================
// FOLHA E BENEFÍCIOS.
//
// Não existe campo para digitar salário, falta, hora extra ou comissão
// nesta tela. Tudo já está no sistema: o salário no cadastro, as faltas
// e extras no ponto, as férias em Férias/Afastamentos, a comissão nas
// vendas ENTREGUES do vendedor. A folha só MONTA o que já é fato.
//
// A COMISSÃO NÃO NASCE AQUI (item 7). Ela vem do percentual do cadastro
// do vendedor sobre o que ele entregou no mês. Quem não tem percentual
// não aparece na lista de comissões — nem por engano, nem por digitação.
//
// FECHAR CONGELA. Enquanto está aberta, a folha se recalcula a cada
// abertura da tela: corrigiu o ponto, mudou o valor. Depois de fechada,
// o mês não muda mais sozinho — porque o dinheiro já saiu.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Wallet, Users, TrendingUp, Coins, Receipt, PiggyBank, Loader2, Lock,
  Check, AlertTriangle, Download, FileText, RefreshCw, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const fmt = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const hhmm = min => (!min ? '—' : `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`);

function Cartao({ icone: Icone, cor, titulo, valor, rodape }) {
  return (
    <div className="card">
      <div className="card-body">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${cor}`}><Icone size={17} /></span>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-3">{titulo}</p>
        <p className="text-xl font-bold text-gray-900 leading-tight">{valor ?? '—'}</p>
        {rodape && <p className="text-[11px] text-gray-500 mt-0.5">{rodape}</p>}
      </div>
    </div>
  );
}

function Bloco({ titulo, descricao, acao, children, className = '' }) {
  return (
    <section className={`card ${className}`}>
      <div className="card-header flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900 text-[15px]">{titulo}</h2>
          {descricao && <p className="text-xs text-gray-500 mt-0.5">{descricao}</p>}
        </div>
        {acao}
      </div>
      <div className="card-body">{children}</div>
    </section>
  );
}

/** O holerite de uma pessoa, rubrica a rubrica. */
function Holerite({ linha, aoFechar }) {
  if (!linha) return null;
  const proventos = linha.rubricas.filter(r => r.tipo === 'provento');
  const descontos = linha.rubricas.filter(r => r.tipo === 'desconto');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={aoFechar}>
      <div className="card max-w-lg w-full max-h-[90vh] overflow-auto" onClick={e => e.stopPropagation()}>
        <div className="card-header flex items-start justify-between">
          <div>
            <h2 className="font-semibold text-gray-900">{linha.nome}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {linha.cargo || '—'} · {linha.setor || '—'} · competência {linha.competencia.split('-').reverse().join('/')}
            </p>
          </div>
          <button onClick={aoFechar} className="btn-ghost btn-sm text-gray-400"><X size={16} /></button>
        </div>
        <div className="card-body space-y-4">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Proventos</p>
            <ul className="space-y-1 text-sm">
              {proventos.map((r, i) => (
                <li key={i} className="flex justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-700">{r.rubrica}{r.ref ? ` (${r.ref})` : ''}</span>
                  <span className="font-medium">{fmt(r.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Descontos</p>
            <ul className="space-y-1 text-sm">
              {descontos.map((r, i) => (
                <li key={i} className="flex justify-between border-b border-gray-100 pb-1">
                  <span className="text-gray-700">{r.rubrica}{r.ref ? ` (${r.ref})` : ''}</span>
                  <span className="font-medium text-red-500">− {fmt(r.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex justify-between items-baseline pt-2 border-t border-gray-200">
            <span className="font-semibold text-gray-700">Líquido a receber</span>
            <span className="text-2xl font-bold text-gray-900">{fmt(linha.net_salary)}</span>
          </div>
          <div className="text-[11px] text-gray-400 bg-gray-50 rounded-lg p-2.5 space-y-0.5">
            <p className="font-medium text-gray-500">De onde veio cada número:</p>
            {Object.entries(linha.origens).filter(([, v]) => v).map(([k, v]) => (
              <p key={k}>· {k.replace('_', ' e ')}: {v}</p>
            ))}
          </div>
          <p className="text-[11px] text-gray-400">
            FGTS do mês: {fmt(linha.fgts_value)} (recolhido pela empresa, não descontado do salário).
          </p>
        </div>
      </div>
    </div>
  );
}

export default function FolhaBeneficios() {
  const qc = useQueryClient();
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));
  const [holerite, setHolerite] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-folha', comp],
    queryFn: () => api.get(`/rh/folha?competencia=${comp}`),
  });

  const fechar = useMutation({
    mutationFn: () => api.post('/rh/folha/fechar', { competencia: comp }),
    onSuccess: r => {
      toast.success(`Folha fechada: ${r.colaboradores} colaborador(es), ${fmt(r.total_liquido)}`);
      qc.invalidateQueries(['rh-folha']);
      qc.invalidateQueries(['rh-painel']);
    },
    onError: e => toast.error(e.error || 'Erro ao fechar'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const c = data?.cartoes || {};
  const enc = data?.encargos || {};
  const pendencias = (data?.checklist || []).filter(k => !k.ok);

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Folha e Benefícios</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Montada do cadastro, do ponto, das férias e das vendas entregues — nada é digitado aqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="input py-1.5 text-sm" value={comp} onChange={e => setComp(e.target.value)} />
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          {data?.fechada ? (
            <a href={`/api/rh/folha/contador?competencia=${comp}&formato=csv`} className="btn-secondary btn-sm">
              <Download size={14} /> Exportar para o contador
            </a>
          ) : (
            <button onClick={() => fechar.mutate()} disabled={fechar.isPending || !data?.linhas?.length}
              className="btn-primary btn-sm">
              {fechar.isPending ? <><Loader2 size={14} className="animate-spin" /> Fechando…</> : <><Lock size={14} /> Fechar folha</>}
            </button>
          )}
        </div>
      </div>

      {data?.fechada && (
        <div className="flex items-center gap-3 text-sm text-emerald-800 bg-emerald-50 rounded-xl p-3">
          <Check size={17} className="shrink-0" />
          <p>Competência <b>fechada</b>. Os valores estão congelados — corrigir o ponto agora já não altera o que foi pago.</p>
        </div>
      )}

      {!!pendencias.length && !data?.fechada && (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Antes de fechar, confira</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {pendencias.map((p, i) => <li key={i}>· {p.item}{p.detalhe ? ` — ${p.detalhe}` : ''}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={Users} cor="bg-blue-100 text-blue-600" titulo="Colaboradores" valor={c.colaboradores} rodape="na folha" />
        <Cartao icone={Wallet} cor="bg-emerald-100 text-emerald-600" titulo="Folha líquida" valor={fmt(c.folha_liquida)} rodape={`bruto ${fmt(c.folha_bruta)}`} />
        <Cartao icone={Receipt} cor="bg-rose-100 text-rose-600" titulo="Descontos" valor={fmt(c.descontos)} rodape={`INSS ${fmt(c.inss)}`} />
        <Cartao icone={TrendingUp} cor="bg-violet-100 text-violet-600" titulo="Comissões" valor={fmt(c.comissoes)} rodape="vendas entregues" />
        <Cartao icone={Coins} cor="bg-amber-100 text-amber-600" titulo="Benefícios" valor={fmt(c.beneficios)} rodape="VT, VR, saúde" />
        <Cartao icone={PiggyBank} cor="bg-sky-100 text-sky-600" titulo="FGTS" valor={fmt(c.fgts)} rodape="recolhimento do mês" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Bloco className="xl:col-span-8" titulo="Resumo por colaborador"
          descricao="Clique para ver o holerite com a origem de cada número.">
          {!(data?.linhas || []).length ? (
            <p className="text-sm text-gray-400 text-center py-8">Nenhum colaborador ativo nesta competência.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr>
                    <th>Colaborador</th><th className="text-right">Base</th><th className="text-right">Comissão</th>
                    <th className="text-right">Extras</th><th className="text-right">Faltas</th>
                    <th className="text-right">Descontos</th><th className="text-right">Líquido</th>
                  </tr>
                </thead>
                <tbody>
                  {data.linhas.map(l => (
                    <tr key={l.employee_id} className="cursor-pointer" onClick={() => setHolerite(l)}>
                      <td>
                        <span className="font-medium text-gray-800">{l.nome}</span>
                        <span className="block text-[11px] text-gray-400">{l.setor || '—'}</span>
                      </td>
                      <td className="text-right text-gray-600">{fmt(l.base_salary)}</td>
                      <td className="text-right text-gray-600">{l.comissao ? fmt(l.comissao) : '—'}</td>
                      <td className="text-right text-gray-600">{hhmm(l.horas_extras_min)}</td>
                      <td className={`text-right ${l.faltas ? 'text-amber-600' : 'text-gray-400'}`}>{l.faltas || '—'}</td>
                      <td className="text-right text-red-500">− {fmt(l.descontos_total)}</td>
                      <td className="text-right font-bold text-gray-900">{fmt(l.net_salary)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Bloco>

        <div className="xl:col-span-4 space-y-4">
          <Bloco titulo="Encargos e provisões" descricao="O custo que não aparece no holerite.">
            <ul className="space-y-1.5 text-sm">
              {[
                ['Base de cálculo', enc.base],
                ['INSS patronal (20%)', enc.inss_patronal],
                ['FGTS (8%)', enc.fgts],
                ['Provisão de 13º', enc.provisao_decimo],
                ['Provisão de férias + 1/3', enc.provisao_ferias],
              ].map(([k, v]) => (
                <li key={k} className="flex justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className="font-semibold text-gray-800">{fmt(v)}</span>
                </li>
              ))}
              <li className="flex justify-between pt-1.5 border-t border-gray-100">
                <span className="text-gray-600">RAT + terceiros</span>
                <span className="text-gray-400">—</span>
              </li>
            </ul>
            <p className="text-[11px] text-gray-400 mt-2">
              RAT e terceiros dependem do CNAE e do FAP da empresa. Enquanto a alíquota não estiver cadastrada,
              o campo fica vazio em vez de chutar um número que vai para o contador.
            </p>
          </Bloco>

          <Bloco titulo="Comissões do mês" descricao="Percentual do cadastro × vendas entregues.">
            {!(data?.comissoes || []).length ? (
              <p className="text-sm text-gray-400 py-2">
                Nenhum colaborador com percentual de comissão no cadastro.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.comissoes.map(c2 => (
                  <li key={c2.employee_id} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                    <div className="flex justify-between">
                      <span className="text-gray-700">{c2.nome}</span>
                      <span className="font-semibold">{fmt(c2.valor)}</span>
                    </div>
                    <p className="text-[11px] text-gray-400">
                      {c2.pct}% sobre {fmt(c2.faturado)} entregues
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Checklist do fechamento">
            <ul className="space-y-2">
              {(data?.checklist || []).map((k, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {k.ok ? <Check size={15} className="text-green-500 shrink-0 mt-0.5" />
                    : <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />}
                  <span>
                    <span className={k.ok ? 'text-gray-600' : 'text-amber-700 font-medium'}>{k.item}</span>
                    {k.detalhe && <span className="block text-[11px] text-gray-400">{k.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>
        </div>
      </div>

      <Holerite linha={holerite} aoFechar={() => setHolerite(null)} />
    </div>
  );
}
