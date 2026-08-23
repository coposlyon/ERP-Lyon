// ============================================================
// FÉRIAS / AFASTAMENTOS.
//
// Duas coisas diferentes na mesma tela, de propósito: quem gerencia
// gente precisa ver junto quem VAI SAIR e quem JÁ ESTÁ FORA — é a
// mesma cadeira vazia na produção. Mas o sistema as trata como o
// negócio trata: férias são direito que se programa (tem saldo, tem
// aprovação); afastamento é fato que aconteceu (tem atestado, CID e
// prazo, e muda quem paga do 16º dia em diante).
//
// O SALDO NÃO É DIGITADO EM LUGAR NENHUM. Ele é calculado da admissão,
// dos períodos já gozados e das FALTAS DO PONTO (CLT art. 130) — a
// mesma conta que a Folha e a rescisão vão usar. Não existe campo para
// alguém "ajustar" saldo: se está errado, o erro está no fato, e é o
// fato que se corrige.
// ============================================================
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Umbrella, HeartPulse, ClipboardCheck, CalendarClock, AlertTriangle, Stethoscope,
  Loader2, Plus, Check, X, CalendarDays, FileText, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hoje = () => new Date().toISOString().slice(0, 10);

const CORES_STATUS = {
  vencido: 'badge-red', a_vencer: 'badge-yellow', disponivel: 'badge-green',
  em_curso: 'badge-blue', gozado: 'badge-gray',
};
const ROTULO_STATUS = {
  vencido: 'vencido', a_vencer: 'a vencer', disponivel: 'disponível',
  em_curso: 'em curso', gozado: 'gozado',
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

/** O calendário do mês: uma faixa por pessoa, um quadradinho por dia. */
function Calendario({ mes, eventos }) {
  const dias = new Date(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0).getDate();
  const porPessoa = useMemo(() => {
    const m = new Map();
    for (const e of eventos) {
      if (!m.has(e.employee_id)) m.set(e.employee_id, { nome: e.colaborador, eventos: [] });
      m.get(e.employee_id).eventos.push(e);
    }
    return [...m.values()];
  }, [eventos]);

  if (!porPessoa.length) {
    return <p className="text-sm text-gray-400 text-center py-6">Nada programado neste mês.</p>;
  }

  const noDia = (ev, dia) => {
    const d = `${mes}-${String(dia).padStart(2, '0')}`;
    return d >= String(ev.start_date).slice(0, 10) && d <= String(ev.end_date).slice(0, 10);
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[11px]">
        <thead>
          <tr>
            <th className="text-left font-medium text-gray-400 pb-1 pr-3 sticky left-0 bg-white">Colaborador</th>
            {Array.from({ length: dias }, (_, i) => (
              <th key={i} className="font-normal text-gray-300 pb-1 w-5">{i + 1}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {porPessoa.map((p, i) => (
            <tr key={i}>
              <td className="pr-3 py-0.5 text-gray-700 whitespace-nowrap sticky left-0 bg-white">{p.nome}</td>
              {Array.from({ length: dias }, (_, d) => {
                const ev = p.eventos.find(e => noDia(e, d + 1));
                const cor = !ev ? 'bg-gray-50'
                  : (!ev.kind || ev.kind === 'ferias') ? 'bg-emerald-400' : 'bg-rose-400';
                return (
                  <td key={d} className="py-0.5">
                    <div className={`h-4 rounded-sm ${cor}`} title={ev ? `${ev.kind || 'ferias'} · ${dBR(ev.start_date)} a ${dBR(ev.end_date)}` : ''} />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex gap-4 mt-2 text-[11px] text-gray-500">
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-emerald-400 inline-block" /> Férias</span>
        <span className="flex items-center gap-1.5"><i className="w-3 h-3 rounded-sm bg-rose-400 inline-block" /> Afastamento</span>
      </div>
    </div>
  );
}

/** Programar férias ou registrar afastamento. */
function NovaSolicitacao({ aberto, aoFechar, saldos, aoSalvar, salvando }) {
  const [f, setF] = useState({
    kind: 'ferias', employee_id: '', start_date: '', end_date: '',
    reason: '', cid: '', abono_pecuniario: false, abono_dias: '', adiantar_decimo: false, notes: '',
  });
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const pessoa = saldos.find(s => s.employee_id === f.employee_id);
  const dias = (f.start_date && f.end_date)
    ? Math.round((new Date(f.end_date) - new Date(f.start_date)) / 864e5) + 1 : 0;
  const ehFerias = f.kind === 'ferias';
  const excede = ehFerias && pessoa && (dias + (Number(f.abono_dias) || 0)) > pessoa.saldo_total;

  return (
    <Modal isOpen={aberto} onClose={aoFechar} title="Nova solicitação" size="lg">
      <div className="space-y-4">
        <div className="flex gap-2">
          {[['ferias', 'Férias', Umbrella], ['afastamento', 'Afastamento', HeartPulse]].map(([k, l, I]) => (
            <button key={k} type="button" onClick={() => set('kind', k)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                f.kind === k ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <I size={15} /> {l}
            </button>
          ))}
        </div>

        <div>
          <label className="label">Colaborador *</label>
          <select className="input" value={f.employee_id} onChange={e => set('employee_id', e.target.value)}>
            <option value="">— selecione —</option>
            {saldos.map(s => (
              <option key={s.employee_id} value={s.employee_id}>
                {s.nome}{ehFerias ? ` — saldo ${s.saldo_total} dia(s)` : ''}
              </option>
            ))}
          </select>
          {ehFerias && pessoa && (
            <p className={`text-[11px] mt-1 ${pessoa.tem_vencido ? 'text-red-500' : 'text-gray-400'}`}>
              Período aquisitivo {dBR(pessoa.periodo?.inicio)} a {dBR(pessoa.periodo?.fim)} ·
              vence em {dBR(pessoa.periodo?.vence_em)}
              {pessoa.periodo?.faltas ? ` · ${pessoa.periodo.faltas} falta(s) no período` : ''}
              {pessoa.tem_vencido && ' · ATENÇÃO: há período vencido (art. 137 — pagamento em dobro)'}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="label">Início *</label>
            <input type="date" className="input" value={f.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className="label">Fim *</label>
            <input type="date" className="input" value={f.end_date} onChange={e => set('end_date', e.target.value)} min={f.start_date} />
          </div>
        </div>

        {dias > 0 && (
          <p className={`text-sm ${excede ? 'text-red-600' : 'text-gray-600'}`}>
            {dias} dia(s){excede && ` — excede o saldo de ${pessoa.saldo_total}`}
            {!ehFerias && dias > 15 && ' · do 16º dia em diante o pagamento é do INSS (evento S-2230)'}
            {!ehFerias && dias > 30 && ' · retorno exige exame médico'}
          </p>
        )}

        {ehFerias ? (
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" className="rounded" checked={f.abono_pecuniario}
                onChange={e => set('abono_pecuniario', e.target.checked)} />
              Vender dias (abono)
            </label>
            {f.abono_pecuniario && (
              <div>
                <label className="label">Dias vendidos</label>
                <input type="number" className="input" value={f.abono_dias} onChange={e => set('abono_dias', e.target.value)} max={10} />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 col-span-2">
              <input type="checkbox" className="rounded" checked={f.adiantar_decimo}
                onChange={e => set('adiantar_decimo', e.target.checked)} />
              Adiantar a primeira parcela do 13º
            </label>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Motivo *</label>
              <input className="input" value={f.reason} onChange={e => set('reason', e.target.value)}
                placeholder="Auxílio-doença, acidente, gestação…" />
            </div>
            <div>
              <label className="label">CID</label>
              <input className="input" value={f.cid} onChange={e => set('cid', e.target.value.toUpperCase())}
                placeholder="M54.5" />
              <p className="text-[11px] text-gray-400 mt-1">O eSocial pede o CID no S-2230.</p>
            </div>
          </div>
        )}

        <div>
          <label className="label">Observações</label>
          <textarea className="input min-h-[64px]" value={f.notes} onChange={e => set('notes', e.target.value)} />
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={aoFechar} className="btn-secondary">Cancelar</button>
          <button onClick={() => aoSalvar(f)} disabled={salvando || !f.employee_id || !f.start_date || !f.end_date || excede}
            className="btn-primary">
            {salvando ? <><Loader2 size={15} className="animate-spin" /> Salvando…</> : <><Check size={15} /> Salvar</>}
          </button>
        </div>
      </div>
    </Modal>
  );
}

export default function FeriasAfastamentos() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [modal, setModal] = useState(false);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-ferias', mes],
    queryFn: () => api.get(`/rh/ferias?mes=${mes}`),
  });

  const criar = useMutation({
    mutationFn: corpo => api.post('/rh/ferias', corpo),
    onSuccess: () => { toast.success('Registrado'); setModal(false); qc.invalidateQueries(['rh-ferias']); qc.invalidateQueries(['rh-painel']); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const decidir = useMutation({
    mutationFn: ({ id, acao }) => api.patch(`/rh/ferias/${id}`, { acao }),
    onSuccess: () => { toast.success('Atualizado'); qc.invalidateQueries(['rh-ferias']); qc.invalidateQueries(['rh-painel']); },
    onError: e => toast.error(e.error || 'Erro'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const c = data?.cartoes || {};
  const ind = data?.indicadores || {};

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Férias / Afastamentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Saldo calculado da admissão, dos períodos gozados e das faltas do ponto — ninguém digita saldo aqui.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="input py-1.5 text-sm" value={mes} onChange={e => setMes(e.target.value)} />
          <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setModal(true)} className="btn-primary btn-sm">
            <Plus size={14} /> Nova solicitação
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={Umbrella} cor="bg-teal-100 text-teal-600" titulo="Férias programadas"
          valor={c.ferias_programadas} rodape={`${c.ferias_em_curso || 0} em curso hoje`} />
        <Cartao icone={ClipboardCheck} cor="bg-violet-100 text-violet-600" titulo="Solicitações pendentes"
          valor={c.solicitacoes_pendentes} rodape="aguardando aprovação" />
        <Cartao icone={HeartPulse} cor="bg-rose-100 text-rose-600" titulo="Afastamentos ativos"
          valor={c.afastamentos_ativos} rodape="hoje" />
        <Cartao icone={CalendarClock} cor="bg-blue-100 text-blue-600" titulo="Retornos previstos"
          valor={c.retornos_previstos} rodape="próximos 15 dias" />
        <Cartao icone={AlertTriangle} cor="bg-amber-100 text-amber-600" titulo="Saldos a vencer"
          valor={c.saldos_a_vencer} rodape="colaboradores" />
        <Cartao icone={Stethoscope} cor="bg-sky-100 text-sky-600" titulo="Exames de retorno"
          valor={c.exames_retorno} rodape="pendentes" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 space-y-4">
          <Bloco titulo={`Calendário — ${dBR(`${mes}-01`).slice(3)}`}
            descricao="Cada faixa é uma pessoa; cada quadradinho, um dia.">
            <Calendario mes={mes} eventos={data?.calendario || []} />
          </Bloco>

          <Bloco titulo="Saldo de férias" descricao="Direito, gozados e vencimento — calculados, nunca digitados.">
            {!(data?.saldos || []).length ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum colaborador ativo.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                  <thead>
                    <tr>
                      <th>Colaborador</th><th>Admissão</th><th>Período aquisitivo</th>
                      <th>Faltas</th><th className="text-right">Saldo</th><th>Situação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.saldos.map(s => (
                      <tr key={s.employee_id}>
                        <td>
                          <span className="font-medium text-gray-800">{s.nome}</span>
                          {s.setor && <span className="block text-[11px] text-gray-400">{s.setor}</span>}
                        </td>
                        <td className="text-gray-600">{dBR(s.admissao)}</td>
                        <td className="text-gray-600">
                          {s.periodo ? `${dBR(s.periodo.inicio)} — ${dBR(s.periodo.fim)}` : '—'}
                          {s.periodo && (
                            <span className="block text-[11px] text-gray-400">vence {dBR(s.periodo.vence_em)}</span>
                          )}
                        </td>
                        <td className={s.periodo?.faltas ? 'text-amber-600' : 'text-gray-400'}>
                          {s.periodo?.faltas ?? 0}
                        </td>
                        <td className="text-right font-bold">{s.saldo_total}</td>
                        <td>
                          <span className={`badge ${CORES_STATUS[s.periodo?.status] || 'badge-gray'}`}>
                            {ROTULO_STATUS[s.periodo?.status] || '—'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>

          <Bloco titulo="Afastamentos ativos" descricao="Do 16º dia em diante quem paga é o INSS.">
            {!(data?.afastamentos_ativos || []).length ? (
              <p className="text-sm text-gray-400 text-center py-6">Ninguém afastado hoje.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                  <thead>
                    <tr><th>Colaborador</th><th>Motivo / CID</th><th>Início</th><th>Retorno previsto</th><th>Atestado</th><th>INSS</th></tr>
                  </thead>
                  <tbody>
                    {data.afastamentos_ativos.map(a => (
                      <tr key={a.id}>
                        <td className="font-medium text-gray-800">{a.colaborador}</td>
                        <td className="text-gray-600">{a.reason || '—'}{a.cid ? ` · ${a.cid}` : ''}</td>
                        <td className="text-gray-600">{dBR(a.start_date)}</td>
                        <td className="text-gray-600">{dBR(a.end_date)}</td>
                        <td>
                          {a.doc_url
                            ? <a href={a.doc_url} target="_blank" rel="noreferrer" className="text-primary-600"><FileText size={15} /></a>
                            : <span className="badge badge-yellow">falta</span>}
                        </td>
                        <td>{a.inss_apos_15 ? <span className="badge badge-blue">sim</span> : <span className="text-gray-400">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>

          <Bloco titulo="Fila de aprovações" descricao="Decisão é humana: fica gravado quem aprovou e quando.">
            {!(data?.aprovacoes || []).length ? (
              <p className="text-sm text-gray-400 text-center py-6">Nada aguardando decisão.</p>
            ) : (
              <ul className="space-y-2">
                {data.aprovacoes.map(a => (
                  <li key={a.id} className="flex items-center gap-3 border border-gray-200 rounded-xl px-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-800 truncate">
                        {a.colaborador} · {(!a.kind || a.kind === 'ferias') ? 'Férias' : 'Afastamento'}
                      </span>
                      <span className="block text-[11px] text-gray-400">
                        {dBR(a.start_date)} a {dBR(a.end_date)} · {a.dias} dia(s)
                        {a.origin === 'portal' && ' · pedido pelo portal'}
                      </span>
                    </span>
                    <button onClick={() => decidir.mutate({ id: a.id, acao: 'aprovar' })}
                      className="btn-ghost btn-sm text-green-600" title="Aprovar"><Check size={16} /></button>
                    <button onClick={() => decidir.mutate({ id: a.id, acao: 'recusar' })}
                      className="btn-ghost btn-sm text-red-500" title="Recusar"><X size={16} /></button>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>
        </div>

        {/* Coluna da direita */}
        <div className="xl:col-span-4 space-y-4">
          <Bloco titulo="Próximos retornos" descricao="Quem volta nos próximos 15 dias.">
            {!(data?.proximos_retornos || []).length ? (
              <p className="text-sm text-gray-400 py-2">Nenhum retorno previsto.</p>
            ) : (
              <ul className="space-y-2">
                {data.proximos_retornos.map(r => (
                  <li key={r.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-gray-700">{r.colaborador}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">
                      {dBR(r.end_date)} · {r.em_dias}d
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Pendências">
            {!(data?.pendencias || []).length ? (
              <p className="text-sm text-gray-400 py-2">Nenhuma pendência.</p>
            ) : (
              <ul className="space-y-2">
                {data.pendencias.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    {p.texto}
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Conformidade" descricao="Cada linha é uma verificação de verdade.">
            <ul className="space-y-2">
              {(data?.conformidade || []).map((k, i) => (
                <li key={i} className="flex items-center gap-2 text-sm">
                  {k.ok
                    ? <Check size={15} className="text-green-500 shrink-0" />
                    : <AlertTriangle size={15} className="text-amber-500 shrink-0" />}
                  <span className={k.ok ? 'text-gray-600' : 'text-amber-700 font-medium'}>{k.item}</span>
                </li>
              ))}
            </ul>
          </Bloco>

          <Bloco titulo="Indicadores do mês">
            <div className="space-y-2 text-sm">
              <div className="flex items-baseline justify-between">
                <span className="text-gray-400 text-xs">Absenteísmo</span>
                <span className="font-semibold text-gray-800">
                  {ind.absenteismo_pct != null ? `${ind.absenteismo_pct}%` : '—'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-gray-400 text-xs">Faltas no mês</span>
                <span className="font-semibold text-gray-800">{ind.faltas_mes ?? '—'}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-gray-400 text-xs">Dias afastados</span>
                <span className="font-semibold text-gray-800">{ind.dias_afastados ?? '—'}</span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className="text-gray-400 text-xs">Custo dos afastamentos</span>
                <span className="font-semibold text-gray-400">—</span>
              </div>
              <p className="text-[11px] text-gray-400 pt-1 border-t border-gray-100">
                O custo depende da folha do mês; enquanto ela não for gerada, o campo fica vazio em vez de inventar valor.
              </p>
            </div>
          </Bloco>
        </div>
      </div>

      <NovaSolicitacao aberto={modal} aoFechar={() => setModal(false)} saldos={data?.saldos || []}
        aoSalvar={corpo => criar.mutate(corpo)} salvando={criar.isPending} />
    </div>
  );
}
