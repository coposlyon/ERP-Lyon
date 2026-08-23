// ============================================================
// DESLIGAMENTOS — UM PROCESSO SÓ.
//
// Dispensa, pedido de demissão, justa causa, acordo e término de
// contrato não são cinco fluxos: são o MESMO processo com regras
// diferentes. Por isso existe uma tela, com um checklist que se monta
// sozinho conforme o tipo.
//
// Duas coisas que costumam sair erradas e aqui não saem:
//
//  • HOMOLOGAÇÃO não é obrigatória desde 2017. Só entra no checklist
//    quando a convenção coletiva exige. Deixá-la fixa cria tarefa que
//    ninguém precisa cumprir — e some a diferença entre pendência real
//    e ruído.
//
//  • EXAME DEMISSIONAL é dispensado quando existe ASO recente dentro
//    do prazo da NR-7. Também é condicional.
//
// E a conta aparece ANTES de decidir: o gestor vê quanto custa cada
// caminho enquanto ainda dá para escolher.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  UserMinus, ClipboardCheck, ShieldOff, CircleDollarSign, Loader2, Plus, RefreshCw,
  AlertTriangle, Check, Calculator,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hoje = () => new Date().toISOString().slice(0, 10);
const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

const TIPOS = [
  { v: 'sem_justa_causa', t: 'Dispensa sem justa causa' },
  { v: 'pedido_demissao', t: 'Pedido de demissão' },
  { v: 'acordo', t: 'Acordo (art. 484-A)' },
  { v: 'justa_causa', t: 'Dispensa por justa causa' },
  { v: 'termino_contrato', t: 'Término de contrato' },
];
const AVISOS = [
  { v: 'indenizado', t: 'Indenizado' },
  { v: 'trabalhado', t: 'Trabalhado' },
  { v: 'dispensado', t: 'Dispensado' },
];

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

/** O demonstrativo: cada verba com a origem dela, nada digitado. */
function Demonstrativo({ calculo }) {
  if (!calculo) return null;
  return (
    <div className="rounded-lg border border-gray-100 overflow-hidden">
      <table className="w-full text-sm">
        <tbody>
          {calculo.verbas.map((v, i) => (
            <tr key={i} className="border-b border-gray-50">
              <td className="py-1.5 px-3 text-gray-700">
                {v.rubrica}
                {v.ref && <span className="block text-[11px] text-gray-400">{v.ref}</span>}
              </td>
              <td className="py-1.5 px-3 text-right font-medium text-emerald-700">{brl(v.valor)}</td>
            </tr>
          ))}
          {calculo.descontos.map((v, i) => (
            <tr key={`d${i}`} className="border-b border-gray-50">
              <td className="py-1.5 px-3 text-gray-700">
                {v.rubrica}
                {v.ref && <span className="block text-[11px] text-gray-400">{v.ref}</span>}
              </td>
              <td className="py-1.5 px-3 text-right font-medium text-red-600">− {brl(v.valor)}</td>
            </tr>
          ))}
          <tr className="bg-gray-50">
            <td className="py-2 px-3 font-semibold text-gray-900">Líquido da rescisão</td>
            <td className="py-2 px-3 text-right font-bold text-gray-900">{brl(calculo.liquido)}</td>
          </tr>
        </tbody>
      </table>
      {calculo.fgts && (
        <div className="px-3 py-2 bg-blue-50/60 text-[11px] text-blue-800 flex items-start gap-1.5">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span>
            FGTS: multa de {calculo.fgts.multa_pct}% = {brl(calculo.fgts.multa)}
            {calculo.fgts.saldo_estimado
              ? ' — saldo ESTIMADO em 8% ao mês. Confira o extrato no FGTS Digital antes de pagar.'
              : ' — sobre o saldo informado.'}
            {calculo.fgts.pode_sacar === false && ' O colaborador não saca o FGTS neste tipo de desligamento.'}
          </span>
        </div>
      )}
    </div>
  );
}

export default function Desligamentos() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({
    employee_id: '', kind: 'sem_justa_causa', exit_date: hoje(),
    notice: 'indenizado', fgts_saldo: '', cct_exige_homologacao: false,
  });
  const [sim, setSim] = useState(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-desligamentos'],
    queryFn: () => api.get('/rh/desligamentos').then(r => r.data),
  });
  const { data: pessoas } = useQuery({
    queryKey: ['colaboradores-ativos'],
    queryFn: () => api.get('/customers', { params: { type: 'CO', limit: 500 } }).then(r => r.data),
  });

  const simular = useMutation({
    mutationFn: () => api.post('/rh/desligamentos/simular', {
      ...form, fgts_saldo: form.fgts_saldo ? Number(form.fgts_saldo) : undefined,
    }).then(r => r.data),
    onSuccess: setSim,
    onError: e => toast.error(e.response?.data?.error || 'Não foi possível calcular.'),
  });

  const abrir = useMutation({
    mutationFn: () => api.post('/rh/desligamentos', {
      ...form, fgts_saldo: form.fgts_saldo ? Number(form.fgts_saldo) : undefined,
    }).then(r => r.data),
    onSuccess: () => {
      toast.success('Processo de desligamento aberto.');
      setModal(false); setSim(null);
      qc.invalidateQueries({ queryKey: ['rh-desligamentos'] });
    },
    onError: e => toast.error(e.response?.data?.error || 'Não foi possível abrir.'),
  });

  const avancar = useMutation({
    mutationFn: ({ id, ...p }) => api.patch(`/rh/desligamentos/${id}`, p).then(r => r.data),
    onSuccess: () => {
      toast.success('Processo atualizado.');
      qc.invalidateQueries({ queryKey: ['rh-desligamentos'] });
    },
    onError: e => toast.error(e.response?.data?.error || 'Falhou.'),
  });

  const c = data?.cartoes || {};
  const lista = data?.desligamentos || [];
  const listaPessoas = (pessoas?.data || pessoas || []).filter?.(p => p.is_active !== false) || [];

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-400" size={28} /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Desligamentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Um processo só, com checklist que se monta conforme o tipo — homologação e exame entram apenas quando exigidos.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => { setSim(null); setModal(true); }} className="btn-primary btn-sm">
            <Plus size={14} /> Novo desligamento
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icone={UserMinus} cor="bg-red-50 text-red-600" titulo="Em andamento" valor={c.em_andamento}
          rodape={`${c.no_mes ?? 0} no mês`} />
        <Cartao icone={ClipboardCheck} cor="bg-amber-50 text-amber-600" titulo="Aguardando homologação"
          valor={c.aguardando_homologacao} rodape="só quando a CCT exige" />
        <Cartao icone={ShieldOff} cor="bg-slate-50 text-slate-600" titulo="Acessos revogados"
          valor={c.acessos_revogados} rodape="login desligado de verdade" />
        <Cartao icone={CircleDollarSign} cor="bg-emerald-50 text-emerald-600" titulo="Verbas rescisórias"
          valor={brl(c.verbas)} rodape="total calculado" />
      </div>

      <Bloco titulo="Processos" descricao="O prazo do art. 477 é de 10 dias corridos da saída para pagar as verbas.">
        {!lista.length ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum desligamento registrado.</p>
        ) : (
          <div className="space-y-2">
            {lista.map(d => (
              <div key={d.id} className="rounded-lg border border-gray-100 p-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {d.colaborador}
                      {d.requested_by === 'colaborador' && (
                        <span className="badge badge-violet ml-2">pedido pelo portal</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {TIPOS.find(t => t.v === d.kind)?.t || d.kind} · saída {dBR(d.exit_date)} ·
                      {' '}aviso {d.notice || '—'} · pagar até <strong>{dBR(d.prazo_pagamento)}</strong>
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900">{brl(d.rescission_total)}</span>
                    <span className={`badge ${d.status === 'concluido' ? 'badge-green' : d.status === 'cancelado' ? 'badge-gray' : 'badge-blue'}`}>
                      {d.status}
                    </span>
                  </div>
                </div>

                {!!d.pendencias.length && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.pendencias.map(p => (
                      <span key={p} className="badge badge-yellow text-[10px]">{p}</span>
                    ))}
                  </div>
                )}

                {d.status !== 'concluido' && d.status !== 'cancelado' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {d.exam_required && !d.exam_done_on && (
                      <button className="btn-secondary btn-sm"
                        onClick={() => avancar.mutate({ id: d.id, exam_done_on: hoje() })}>
                        <Check size={13} /> Exame demissional feito
                      </button>
                    )}
                    {d.homolog_required && !d.homolog_on && (
                      <button className="btn-secondary btn-sm"
                        onClick={() => avancar.mutate({ id: d.id, homolog_on: hoje() })}>
                        <Check size={13} /> Homologação realizada
                      </button>
                    )}
                    {!d.access_revoked_at && (
                      <button className="btn-secondary btn-sm"
                        onClick={() => avancar.mutate({ id: d.id, acao: 'revogar_acesso' })}>
                        <ShieldOff size={13} /> Revogar acesso
                      </button>
                    )}
                    <button className="btn-primary btn-sm"
                      onClick={() => avancar.mutate({ id: d.id, acao: 'concluir' })}>
                      Concluir processo
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Desligamento" size="lg">
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Colaborador</label>
              <select className="input" value={form.employee_id}
                onChange={e => { setForm({ ...form, employee_id: e.target.value }); setSim(null); }}>
                <option value="">Selecione…</option>
                {listaPessoas.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={form.kind}
                onChange={e => { setForm({ ...form, kind: e.target.value }); setSim(null); }}>
                {TIPOS.map(t => <option key={t.v} value={t.v}>{t.t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Data da saída</label>
              <input type="date" className="input" value={form.exit_date}
                onChange={e => { setForm({ ...form, exit_date: e.target.value }); setSim(null); }} />
            </div>
            <div>
              <label className="label">Aviso prévio</label>
              <select className="input" value={form.notice}
                onChange={e => { setForm({ ...form, notice: e.target.value }); setSim(null); }}>
                {AVISOS.map(a => <option key={a.v} value={a.v}>{a.t}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Saldo do FGTS (opcional)</label>
              <input type="number" step="0.01" className="input" placeholder="do extrato do FGTS Digital"
                value={form.fgts_saldo}
                onChange={e => { setForm({ ...form, fgts_saldo: e.target.value }); setSim(null); }} />
              <p className="text-[11px] text-gray-400 mt-0.5">
                Sem isso a multa é calculada sobre uma estimativa de 8% ao mês.
              </p>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-gray-700 pb-2">
                <input type="checkbox" checked={form.cct_exige_homologacao}
                  onChange={e => { setForm({ ...form, cct_exige_homologacao: e.target.checked }); setSim(null); }} />
                A convenção coletiva exige homologação
              </label>
            </div>
          </div>

          <button
            className="btn-secondary btn-sm w-full"
            disabled={!form.employee_id || simular.isPending}
            onClick={() => simular.mutate()}
          >
            {simular.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />}
            Calcular antes de decidir
          </button>

          {sim && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">
                {sim.colaborador.nome} · admitido em {dBR(sim.colaborador.admissao)} ·
                {' '}aviso de {sim.calculo.aviso_dias} dia(s)
              </p>
              <Demonstrativo calculo={sim.calculo} />

              {!!(sim.calculo.observacoes || []).length && (
                <ul className="text-[11px] text-gray-500 space-y-0.5 list-disc pl-4">
                  {sim.calculo.observacoes.map((o, i) => <li key={i}>{o}</li>)}
                </ul>
              )}

              <div className="rounded-lg border border-gray-100 p-3 space-y-1.5">
                <p className="text-xs font-medium text-gray-700">O que este desligamento exige</p>
                {[
                  ['Exame demissional', sim.exigencias.exame_demissional.exigido, sim.exigencias.exame_demissional.motivo],
                  ['Homologação', sim.exigencias.homologacao.exigida, sim.exigencias.homologacao.motivo],
                ].map(([rotulo, exigido, motivo]) => (
                  <p key={rotulo} className="text-[11px] text-gray-600 flex items-start gap-1.5">
                    <span className={`badge ${exigido ? 'badge-yellow' : 'badge-gray'} text-[10px] shrink-0`}>
                      {exigido ? 'exigido' : 'dispensado'}
                    </span>
                    <span><strong>{rotulo}</strong> — {motivo}</span>
                  </p>
                ))}
                <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                  <span className="badge badge-blue text-[10px] shrink-0">prazo</span>
                  <span><strong>Pagamento</strong> — {sim.exigencias.prazo_pagamento.motivo}</span>
                </p>
                <p className="text-[11px] text-gray-600 flex items-start gap-1.5">
                  <span className="badge badge-gray text-[10px] shrink-0">direitos</span>
                  <span>
                    Seguro-desemprego: <strong>{sim.exigencias.seguro_desemprego ? 'sim' : 'não'}</strong>
                    {' '}· Saque do FGTS: <strong>{sim.exigencias.saque_fgts ? 'sim' : 'não'}</strong>
                    {' '}· {sim.exigencias.meses_de_casa} mês(es) de casa
                  </span>
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button className="btn-secondary btn-sm" onClick={() => setModal(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={!form.employee_id || abrir.isPending}
              onClick={() => abrir.mutate()}>
              {abrir.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Abrir processo'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
