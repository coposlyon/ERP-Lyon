// ============================================================
// ADMISSÕES — O ANDAMENTO, NÃO UM SEGUNDO CADASTRO.
//
// O cadastro do colaborador continua sendo as CINCO etapas aprovadas
// (Dados Pessoais → Dados Trabalhistas → Contrato e Políticas →
// Documentação → Revisão). Esta tela não pede nada de novo: ela mostra
// em que etapa cada processo parou e leva você para o mesmo formulário
// de sempre.
//
// CAPTAÇÃO é a fase ANTERIOR — candidato que ainda não virou cadastro.
// Por isso aparece separada do funil, antes dele, e não como uma sexta
// etapa.
//
// E o andamento não é marcado à mão: o servidor olha o que já foi
// preenchido no cadastro e nos documentos. Assim a barra de progresso
// não mente quando alguém volta atrás e apaga um campo.
// ============================================================
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus, Users, FileClock, CheckCircle2, Loader2, Plus, RefreshCw, ArrowRight, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

const CORES = {
  concluida: 'badge-green', em_andamento: 'badge-blue', aguardando_docs: 'badge-yellow',
};
const ROTULO = {
  concluida: 'concluída', em_andamento: 'em andamento', aguardando_docs: 'aguardando documentos',
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

/** As cinco etapas em linha, com a atual destacada. */
function Trilha({ etapas }) {
  return (
    <div className="flex items-center gap-1">
      {etapas.map((e, i) => (
        <span key={e.key} className="flex items-center gap-1">
          <span
            title={e.titulo}
            className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center ${
              e.concluida ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}
          >
            {e.n}
          </span>
          {i < etapas.length - 1 && (
            <span className={`w-3 h-px ${e.concluida ? 'bg-emerald-400' : 'bg-gray-200'}`} />
          )}
        </span>
      ))}
    </div>
  );
}

export default function Admissoes() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [modal, setModal] = useState(false);
  const [cand, setCand] = useState({ candidate_name: '', expected_date: '', cargo_id: '' });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-admissoes'],
    queryFn: () => api.get('/rh/admissoes'),
  });

  const criar = useMutation({
    mutationFn: p => api.post('/rh/admissoes/captacao', p),
    onSuccess: () => {
      toast.success('Candidato registrado na captação.');
      setModal(false);
      setCand({ candidate_name: '', expected_date: '', cargo_id: '' });
      qc.invalidateQueries({ queryKey: ['rh-admissoes'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível registrar.'),
  });

  const c = data?.cartoes || {};
  const processos = (data?.processos || []).filter(p =>
    !busca || String(p.nome).toLowerCase().includes(busca.toLowerCase()));

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-400" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Admissões</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            O andamento das cinco etapas do cadastro — lido do que já foi preenchido, não marcado à mão.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setModal(true)} className="btn-secondary btn-sm">
            <Plus size={14} /> Captação
          </button>
          <button onClick={() => nav('/employees/novo')} className="btn-primary btn-sm">
            <UserPlus size={14} /> Nova admissão
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icone={Users} cor="bg-blue-50 text-blue-600" titulo="Em andamento" valor={c.em_andamento}
          rodape="cadastros ainda abertos" />
        <Cartao icone={Search} cor="bg-violet-50 text-violet-600" titulo="Captação" valor={c.captacao}
          rodape="antes de virar cadastro" />
        <Cartao icone={FileClock} cor="bg-amber-50 text-amber-600" titulo="Aguardando documentos"
          valor={c.aguardando_documentos} rodape="nenhum documento anexado" />
        <Cartao icone={CheckCircle2} cor="bg-emerald-50 text-emerald-600" titulo="Concluídas no mês"
          valor={c.concluidas_no_mes} rodape="cadastro completo" />
      </div>

      <Bloco
        titulo="Funil"
        descricao="Captação vem antes das cinco etapas do cadastro — é fase anterior, não uma sexta etapa."
      >
        <div className="flex flex-wrap items-stretch gap-2">
          {(data?.funil || []).map((f, i) => (
            <div key={f.fase} className="flex items-center gap-2">
              <div className={`rounded-lg px-3 py-2 min-w-[7.5rem] ${
                f.anterior ? 'bg-violet-50 border border-dashed border-violet-200' : 'bg-gray-50 border border-gray-100'
              }`}>
                <p className="text-[10px] uppercase tracking-wide text-gray-400">
                  {f.anterior ? 'fase anterior' : `etapa ${i}`}
                </p>
                <p className="text-sm font-medium text-gray-800 leading-tight">{f.fase}</p>
                <p className="text-lg font-bold text-gray-900 leading-tight">{f.quantidade}</p>
              </div>
              {i < (data.funil.length - 1) && <ArrowRight size={14} className="text-gray-300 shrink-0" />}
            </div>
          ))}
        </div>
      </Bloco>

      <Bloco
        titulo="Processos em curso"
        descricao="Clique para abrir o cadastro na etapa em que parou."
        acao={
          <input
            className="input py-1.5 text-sm w-48"
            placeholder="Buscar colaborador…"
            value={busca}
            onChange={e => setBusca(e.target.value)}
          />
        }
      >
        {!processos.length ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma admissão em curso.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2">Colaborador</th>
                  <th className="pb-2">Departamento</th>
                  <th className="pb-2">Admissão</th>
                  <th className="pb-2">Etapas</th>
                  <th className="pb-2">Etapa atual</th>
                  <th className="pb-2">Docs</th>
                  <th className="pb-2">Situação</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {processos.map(p => (
                  <tr key={p.employee_id} className="border-t border-gray-100">
                    <td className="py-2 font-medium text-gray-900">
                      {p.nome}
                      {p.cargo && <span className="block text-[11px] text-gray-400 font-normal">{p.cargo}</span>}
                    </td>
                    <td className="py-2 text-gray-600">{p.departamento || '—'}</td>
                    <td className="py-2 text-gray-600">{dBR(p.admissao_prevista)}</td>
                    <td className="py-2"><Trilha etapas={p.etapas} /></td>
                    <td className="py-2 text-gray-600">
                      {p.etapa_atual_titulo}
                      <span className="block text-[11px] text-gray-400">{p.concluidas}/{p.total} · {p.pct}%</span>
                      {!!(p.faltando || []).length && (
                        <span className="block text-[11px] text-amber-700 mt-0.5">
                          falta: {p.faltando.map(x => x.rotulo).join(', ')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-gray-600">{p.documentos}</td>
                    <td className="py-2"><span className={`badge ${CORES[p.status]}`}>{ROTULO[p.status]}</span></td>
                    <td className="py-2 text-right">
                      <button
                        onClick={() => nav(`/employees/${p.employee_id}`)}
                        className="btn-ghost btn-sm"
                      >
                        Abrir <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      {!!(data?.captacao || []).length && (
        <Bloco titulo="Captação" descricao="Candidatos ainda sem cadastro. Ao aprovar, abra a admissão pelas cinco etapas.">
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2">Candidato</th><th className="pb-2">Previsto</th>
                  <th className="pb-2">Situação</th><th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {data.captacao.map(k => (
                  <tr key={k.id} className="border-t border-gray-100">
                    <td className="py-2 font-medium text-gray-900">{k.nome}</td>
                    <td className="py-2 text-gray-600">{dBR(k.previsto)}</td>
                    <td className="py-2"><span className="badge badge-gray">{k.status}</span></td>
                    <td className="py-2 text-right">
                      <button onClick={() => nav('/employees/novo')} className="btn-ghost btn-sm">
                        Iniciar admissão <ArrowRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloco>
      )}

      {!!(data?.avisos || []).length && (
        <div className="card"><div className="card-body">
          <p className="text-xs font-medium text-amber-700 mb-1">Avisos</p>
          {data.avisos.map((a, i) => <p key={i} className="text-xs text-gray-500">{a}</p>)}
        </div></div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Registrar candidato (captação)">
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Captação é a fase anterior à admissão. O cadastro completo — as cinco etapas — começa quando o candidato é aprovado.
          </p>
          <div>
            <label className="label">Nome do candidato</label>
            <input className="input" value={cand.candidate_name}
              onChange={e => setCand({ ...cand, candidate_name: e.target.value })} />
          </div>
          <div>
            <label className="label">Admissão prevista</label>
            <input type="date" className="input" value={cand.expected_date}
              onChange={e => setCand({ ...cand, expected_date: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-secondary btn-sm" onClick={() => setModal(false)}>Cancelar</button>
            <button
              className="btn-primary btn-sm"
              disabled={!cand.candidate_name || criar.isPending}
              onClick={() => criar.mutate(cand)}
            >
              {criar.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Registrar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
