// ============================================================
// OCORRÊNCIAS.
//
// Nenhuma linha desta tela é digitada aqui. Atraso e falta nascem do
// ponto; justificativa e documento nascem do portal do colaborador.
// Esta tela é onde se DECIDE — e decidir é ato de gente.
//
// A IA APONTA, NÃO JULGA. O `score` ordena o que olhar primeiro e a nota
// diz quantas vezes aquilo já aconteceu em 90 dias. Ela não aplica
// advertência, não recusa atestado e não desconta salário: cada decisão
// grava quem decidiu e quando.
//
// TODOS OS NÚMEROS SAEM DA MESMA LEITURA. Era assim que aparecia "0
// críticas" no cartão com uma crítica vencida na tabela ao lado.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle, Clock, UserX, FileCheck, ShieldAlert, Repeat, Loader2,
  Check, X, Gavel, Eye, FileText, Filter, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const dBR = d => String(d || '').slice(0, 10).split('-').reverse().join('/');

const ROTULO_TIPO = {
  atraso: 'Atraso', falta: 'Falta', justificativa: 'Justificativa',
  advertencia: 'Advertência', suspensao: 'Suspensão', outro: 'Outro',
};
const COR_GRAVIDADE = { alta: 'badge-red', media: 'badge-yellow', baixa: 'badge-gray' };
const COR_STATUS = {
  aberta: 'badge-yellow', em_analise: 'badge-blue', justificada: 'badge-green',
  aprovada: 'badge-green', recusada: 'badge-red', encaminhada: 'badge-purple',
};

function Cartao({ icone: Icone, cor, titulo, valor, rodape }) {
  return (
    <div className="card">
      <div className="card-body">
        <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${cor}`}><Icone size={17} /></span>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-3">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{valor ?? '—'}</p>
        {rodape && <p className="text-[11px] text-gray-500 mt-0.5">{rodape}</p>}
      </div>
    </div>
  );
}

function Bloco({ titulo, descricao, children, className = '', acao }) {
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

export default function Ocorrencias() {
  const qc = useQueryClient();
  const [dias, setDias] = useState(30);
  const [tipo, setTipo] = useState('');
  const [status, setStatus] = useState('');
  const [aberta, setAberta] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-ocorrencias', dias],
    queryFn: () => api.get(`/rh/ocorrencias?dias=${dias}`),
  });

  const decidir = useMutation({
    mutationFn: ({ id, acao, nota }) => api.patch(`/rh/ocorrencias/${id}`, { acao, nota }),
    onSuccess: () => {
      toast.success('Decisão registrada');
      qc.invalidateQueries(['rh-ocorrencias']);
      qc.invalidateQueries(['rh-painel']);
      setAberta(null);
    },
    onError: e => toast.error(e.error || 'Erro'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const c = data?.cartoes || {};
  const cat = data?.por_categoria || {};
  const lista = (data?.ocorrencias || []).filter(o =>
    (!tipo || o.kind === tipo) && (!status || o.status === status));

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Ocorrências</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Atrasos, faltas, justificativas e advertências — nascem dos outros módulos; aqui se decide.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input py-1.5 text-sm" value={dias} onChange={e => setDias(Number(e.target.value))}>
            <option value={7}>Últimos 7 dias</option>
            <option value={30}>Últimos 30 dias</option>
            <option value={90}>Últimos 90 dias</option>
          </select>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={AlertTriangle} cor="bg-amber-100 text-amber-600" titulo="Abertas" valor={c.abertas} rodape="aguardando tratamento" />
        <Cartao icone={Clock} cor="bg-blue-100 text-blue-600" titulo="Em análise" valor={c.em_analise} rodape="com justificativa recebida" />
        <Cartao icone={FileCheck} cor="bg-emerald-100 text-emerald-600" titulo="Justificadas" valor={c.justificadas} rodape="resolvidas" />
        <Cartao icone={Gavel} cor="bg-violet-100 text-violet-600" titulo="Advertências" valor={c.advertencias} rodape="no período" />
        <Cartao icone={Repeat} cor="bg-orange-100 text-orange-600" titulo="Reincidentes" valor={c.reincidentes} rodape="3+ no período" />
        <Cartao icone={ShieldAlert} cor="bg-rose-100 text-rose-600" titulo="Críticas" valor={c.criticas} rodape="prazo de análise vencido" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Bloco className="xl:col-span-8" titulo="Ocorrências recentes"
          descricao="Ordenadas pela data do fato. A coluna de risco é triagem — a decisão é sua."
          acao={
            <div className="flex gap-2">
              <select className="input py-1 text-xs" value={tipo} onChange={e => setTipo(e.target.value)}>
                <option value="">Todos os tipos</option>
                {Object.entries(ROTULO_TIPO).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <select className="input py-1 text-xs" value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Todos os status</option>
                {Object.keys(COR_STATUS).map(k => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
              </select>
            </div>
          }>
          {!lista.length ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma ocorrência no período. Elas aparecem sozinhas quando o ponto detecta atraso ou falta.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr>
                    <th>Colaborador</th><th>Tipo</th><th>Data</th><th>Gravidade</th>
                    <th>Origem</th><th>Status</th><th>Risco</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {lista.map(o => (
                    <tr key={o.id} className={o.vencida ? 'bg-red-50/40' : ''}>
                      <td>
                        <span className="font-medium text-gray-800">{o.colaborador}</span>
                        {o.setor && <span className="block text-[11px] text-gray-400">{o.setor}</span>}
                      </td>
                      <td className="text-gray-700">
                        {ROTULO_TIPO[o.kind] || o.kind}
                        {o.minutes ? <span className="block text-[11px] text-gray-400">{o.minutes} min</span> : null}
                      </td>
                      <td className="text-gray-600">{dBR(o.occurred_on)}</td>
                      <td><span className={`badge ${COR_GRAVIDADE[o.severity] || 'badge-gray'}`}>{o.severity}</span></td>
                      <td className="text-gray-500 text-xs">{o.origin}</td>
                      <td>
                        <span className={`badge ${COR_STATUS[o.status] || 'badge-gray'}`}>{String(o.status).replace('_', ' ')}</span>
                        {o.vencida && <span className="block text-[10px] text-red-500 mt-0.5">prazo vencido</span>}
                      </td>
                      <td>
                        <span className={`text-sm font-bold ${o.ai_score >= 60 ? 'text-red-500' : o.ai_score >= 40 ? 'text-amber-500' : 'text-gray-400'}`}>
                          {o.ai_score ?? '—'}
                        </span>
                      </td>
                      <td className="text-right whitespace-nowrap">
                        {o.tem_documento && (
                          <a href={o.document_url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm text-primary-600" title="Ver documento">
                            <FileText size={14} />
                          </a>
                        )}
                        <button onClick={() => setAberta(o)} className="btn-ghost btn-sm text-gray-400" title="Detalhes">
                          <Eye size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Bloco>

        <div className="xl:col-span-4 space-y-4">
          <Bloco titulo="Totais por categoria">
            <ul className="space-y-1.5 text-sm">
              {[
                ['Atrasos', cat.atrasos], ['Faltas', cat.faltas], ['Justificativas', cat.justificativas],
                ['Advertências', cat.advertencias], ['Suspensões', cat.suspensoes], ['Outros', cat.outros],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className="font-semibold text-gray-800">{v ?? 0}</span>
                </li>
              ))}
            </ul>
          </Bloco>

          <Bloco titulo="Prazo de análise" descricao="Quanto mais grave, menos tempo para olhar.">
            <div className="flex items-center gap-3">
              <div className="text-2xl font-bold text-primary-600">
                {data?.sla?.no_prazo_pct != null ? `${data.sla.no_prazo_pct}%` : '—'}
              </div>
              <p className="text-xs text-gray-500">
                analisadas dentro do prazo
                <span className="block">{data?.sla?.vencidas || 0} vencida(s) agora</span>
              </p>
            </div>
          </Bloco>

          <Bloco titulo="Como isto se enche sozinho">
            <ul className="space-y-2 text-xs text-gray-600">
              <li className="flex gap-2"><Clock size={13} className="text-gray-300 shrink-0 mt-0.5" />
                Passou da tolerância da escala → vira <b>atraso</b> e pede justificativa por WhatsApp.</li>
              <li className="flex gap-2"><UserX size={13} className="text-gray-300 shrink-0 mt-0.5" />
                Dia escalado sem marcação → vira <b>falta</b>.</li>
              <li className="flex gap-2"><FileCheck size={13} className="text-gray-300 shrink-0 mt-0.5" />
                A resposta do colaborador (texto e documento) cai na <b>mesma</b> ocorrência.</li>
              <li className="flex gap-2"><Gavel size={13} className="text-gray-300 shrink-0 mt-0.5" />
                Aprovar, recusar ou advertir grava <b>quem decidiu</b> e quando.</li>
            </ul>
          </Bloco>
        </div>
      </div>

      {/* Detalhe e decisão */}
      {aberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setAberta(null)}>
          <div className="card max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <div className="card-header flex items-start justify-between">
              <div>
                <h2 className="font-semibold text-gray-900">{aberta.colaborador}</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  {ROTULO_TIPO[aberta.kind]} em {dBR(aberta.occurred_on)} · origem {aberta.origin}
                </p>
              </div>
              <button onClick={() => setAberta(null)} className="btn-ghost btn-sm text-gray-400"><X size={16} /></button>
            </div>
            <div className="card-body space-y-3">
              <p className="text-sm text-gray-700 whitespace-pre-line">{aberta.description || '—'}</p>
              {aberta.ai_note && (
                <p className="text-xs text-gray-500 bg-gray-50 rounded-lg p-2.5">
                  <b>Triagem:</b> {aberta.ai_note} (risco {aberta.ai_score})
                  <span className="block mt-1 text-[11px] text-gray-400">
                    Isto é leitura automática do histórico. A decisão abaixo é sua e fica registrada em seu nome.
                  </span>
                </p>
              )}
              {aberta.document_url && (
                <a href={aberta.document_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                  <FileText size={14} /> Abrir documento
                </a>
              )}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100">
                <button onClick={() => decidir.mutate({ id: aberta.id, acao: 'aprovar' })}
                  disabled={decidir.isPending} className="btn-primary btn-sm">
                  <Check size={14} /> Aceitar justificativa
                </button>
                <button onClick={() => decidir.mutate({ id: aberta.id, acao: 'recusar' })}
                  disabled={decidir.isPending} className="btn-secondary btn-sm text-red-600">
                  <X size={14} /> Recusar
                </button>
                <button onClick={() => decidir.mutate({ id: aberta.id, acao: 'advertir' })}
                  disabled={decidir.isPending} className="btn-secondary btn-sm">
                  <Gavel size={14} /> Encaminhar advertência
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
