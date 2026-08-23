// ============================================================
// PORTAL DO GESTOR — A FILA DELE, NÃO UMA CÓPIA DO PAINEL RH.
//
// O gestor não precisa dos indicadores da empresa: precisa saber o que
// está parado esperando a decisão DELE, e como está a equipe DELE.
// Por isso a tela abre nas aprovações pendentes.
//
// A triagem da IA aparece como OPINIÃO, com a nota visível — nunca como
// decisão tomada. Quem aprova é gente, e o sistema grava quem foi
// (item 6). Uma justificativa aprovada apaga a falta do ponto no mesmo
// movimento: senão o dia perdoado continuaria descontando na folha.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, ClipboardCheck, AlertTriangle, Umbrella, Loader2, Check, X, RefreshCw, Bot,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hm = min => {
  if (!min) return '0h00';
  const s = min < 0 ? '−' : '';
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
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

export default function PortalGestor() {
  const qc = useQueryClient();
  const [recusa, setRecusa] = useState(null);
  const [motivo, setMotivo] = useState('');

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['portal-gestor'],
    queryFn: () => api.get('/portal/gestor').then(r => r.data),
  });

  const decidir = useMutation({
    mutationFn: p => api.post('/portal/gestor/decidir', p).then(r => r.data),
    onSuccess: (_, v) => {
      toast.success(v.decisao === 'aprovar' ? 'Aprovado.' : 'Recusado.');
      setRecusa(null); setMotivo('');
      qc.invalidateQueries({ queryKey: ['portal-gestor'] });
    },
    onError: e => toast.error(e.response?.data?.error || 'Não foi possível decidir.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-400" size={28} /></div>;
  }

  const c = data?.cartoes || {};

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portal do Gestor</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {data?.departamentos?.length
              ? `Equipe de ${data.departamentos.map(d => d.name).join(', ')}.`
              : 'O que depende da sua decisão.'}
          </p>
        </div>
        <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
          <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
        </button>
      </div>

      {data?.aviso && (
        <div className="card"><div className="card-body flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <p className="text-sm text-gray-700">{data.aviso}</p>
        </div></div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icone={ClipboardCheck} cor="bg-amber-50 text-amber-600" titulo="Aguardando você"
          valor={c.aguardando_decisao} rodape="justificativas e férias" />
        <Cartao icone={Users} cor="bg-blue-50 text-blue-600" titulo="Equipe" valor={c.equipe}
          rodape={`${c.em_ferias_hoje ?? 0} fora hoje`} />
        <Cartao icone={AlertTriangle} cor="bg-red-50 text-red-600" titulo="Ocorrências abertas"
          valor={c.ocorrencias_abertas} rodape="ainda sem justificativa" />
        <Cartao icone={Umbrella} cor="bg-emerald-50 text-emerald-600" titulo="Faltas no mês"
          valor={c.faltas_no_mes} rodape="apuradas do ponto" />
      </div>

      <Bloco
        titulo="Aguardando sua decisão"
        descricao="A IA dá uma opinião; quem decide é você — e o sistema grava que foi você."
      >
        {!(data?.aprovacoes || []).length ? (
          <p className="text-sm text-gray-400 text-center py-6">Nada pendente. Sua fila está limpa.</p>
        ) : (
          <div className="space-y-2">
            {data.aprovacoes.map(a => (
              <div key={`${a.tipo}-${a.id}`} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900">
                      {a.colaborador}
                      <span className={`badge ml-2 ${a.tipo === 'ferias' ? 'badge-blue' : 'badge-yellow'}`}>
                        {a.tipo === 'ferias' ? 'férias' : 'justificativa'}
                      </span>
                    </p>
                    <p className="text-[11px] text-gray-500">{a.resumo}</p>
                    {a.detalhe && <p className="text-sm text-gray-700 mt-1 whitespace-pre-line">{a.detalhe}</p>}
                    {a.documento && (
                      <a href={a.documento} target="_blank" rel="noreferrer"
                        className="text-[11px] text-blue-600 hover:underline">ver comprovante</a>
                    )}
                    {a.ai_score != null && (
                      <p className="text-[11px] text-violet-700 mt-1 flex items-start gap-1">
                        <Bot size={12} className="mt-0.5 shrink-0" />
                        <span>Triagem da IA: {a.ai_score}/100{a.ai_note ? ` — ${a.ai_note}` : ''} (opinião, não decisão)</span>
                      </p>
                    )}
                    {a.prazo && <p className="text-[11px] text-gray-400 mt-0.5">prazo {dBR(a.prazo)}</p>}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button className="btn-secondary btn-sm"
                      onClick={() => { setRecusa(a); setMotivo(''); }}>
                      <X size={13} /> Recusar
                    </button>
                    <button className="btn-primary btn-sm"
                      disabled={decidir.isPending}
                      onClick={() => decidir.mutate({ tipo: a.tipo, id: a.id, decisao: 'aprovar' })}>
                      <Check size={13} /> Aprovar
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco titulo="Minha equipe" descricao="Situação de hoje e o que se acumulou no mês.">
        {!(data?.equipe || []).length ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum colaborador vinculado a você.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2">Colaborador</th><th className="pb-2">Situação</th>
                  <th className="pb-2">Faltas</th><th className="pb-2">Atrasos</th><th className="pb-2">Pendências</th>
                </tr>
              </thead>
              <tbody>
                {data.equipe.map(p => (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="py-2 font-medium text-gray-900">
                      {p.nome}
                      {p.cargo && <span className="block text-[11px] text-gray-400 font-normal">{p.cargo}</span>}
                    </td>
                    <td className="py-2">
                      <span className={`badge ${p.situacao === 'Ativo' ? 'badge-green' : 'badge-blue'}`}>{p.situacao}</span>
                    </td>
                    <td className="py-2 text-gray-600">{p.faltas}</td>
                    <td className="py-2 text-gray-600">{hm(p.atrasos_min)}</td>
                    <td className="py-2 text-gray-600">{p.pendencias || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      <Modal isOpen={!!recusa} onClose={() => setRecusa(null)} title="Recusar">
        {recusa && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {recusa.colaborador} · {recusa.resumo}
            </p>
            <div>
              <label className="label">Motivo da recusa</label>
              <textarea className="input" rows={3} value={motivo} onChange={e => setMotivo(e.target.value)} />
              <p className="text-[11px] text-gray-400 mt-0.5">
                O colaborador vê este motivo. Explique — recusa sem razão vira conversa depois.
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setRecusa(null)}>Cancelar</button>
              <button className="btn-primary btn-sm" disabled={!motivo.trim() || decidir.isPending}
                onClick={() => decidir.mutate({ tipo: recusa.tipo, id: recusa.id, decisao: 'recusar', motivo })}>
                {decidir.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Recusar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
