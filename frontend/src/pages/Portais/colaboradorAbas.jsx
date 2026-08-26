// ============================================================
// AS SEÇÕES DO PORTAL DO COLABORADOR.
//
// Cada aba responde UMA pergunta da pessoa, e nenhuma delas calcula
// nada: o saldo de férias, o holerite e o espelho de ponto chegam
// prontos do mesmo lugar de onde o RH lê. Se um dia discordassem,
// quem descobriria seria o colaborador — com o holerite na mão.
//
// A regra que atravessa o arquivo inteiro: PORTAL NÃO ALTERA CADASTRO.
// A aba Meu Perfil mostra os dados e abre PEDIDO de correção; quem
// move o cadastro mestre é o RH, depois de aprovar.
// ============================================================
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2, Send, Download, Upload, CalendarPlus, ChevronRight, Check, FileText,
  XCircle, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { dBR, compBR, brl, hm, Bloco, Vazio, Selo } from './pecas';

const hoje = () => new Date().toISOString().slice(0, 10);

// ── PONTO ────────────────────────────────────────────────────

/**
 * O espelho do mês, do jeito que a fiscalização pede: dia a dia, com o
 * previsto ao lado do realizado. As batidas soltas vêm depois, porque
 * a pergunta comum é "faltou alguma coisa no meu dia?", e não "que
 * horas eu bati na terça".
 */
export function AbaPonto({ data }) {
  const dias = data.mes.dias || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Resumo titulo="Dias trabalhados" valor={data.mes.dias_trabalhados} rodape={`${data.mes.faltas} falta(s)`} />
        <Resumo titulo="Horas extras" valor={hm(data.mes.extras_min)} />
        <Resumo titulo="Atrasos" valor={hm(data.mes.atrasos_min)} />
        <Resumo titulo="Saldo do mês" valor={hm(data.mes.saldo_min)} rodape="extras menos atrasos" />
      </div>

      <Bloco titulo={`Espelho de ${compBR(data.mes.competencia)}`}
        descricao="O mesmo apurado que o RH enxerga — nada é recalculado aqui.">
        {!dias.length ? <Vazio>Nenhum dia apurado neste mês.</Vazio> : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full">
              <thead>
                <tr>
                  <th className="text-left">Dia</th>
                  <th className="text-left">Entrada</th>
                  <th className="text-left">Saída</th>
                  <th className="text-left">Volta</th>
                  <th className="text-left">Saída</th>
                  <th className="text-right">Trabalhado</th>
                  <th className="text-right">Extras</th>
                  <th className="text-right">Atraso</th>
                  <th className="text-left">Situação</th>
                </tr>
              </thead>
              <tbody>
                {dias.map(d => (
                  <tr key={d.data} className={d.falta ? 'bg-red-50/40' : ''}>
                    <td>{dBR(d.data)}</td>
                    <td>{hora(d.entrada)}</td>
                    <td>{hora(d.saida)}</td>
                    <td>{hora(d.entrada2)}</td>
                    <td>{hora(d.saida2)}</td>
                    <td className="text-right">{hm(d.trabalhado_min)}</td>
                    <td className="text-right text-emerald-700">{d.extras_min ? hm(d.extras_min) : '—'}</td>
                    <td className="text-right text-red-600">{d.atraso_min ? hm(d.atraso_min) : '—'}</td>
                    <td>
                      {d.falta ? <Selo status="recusada">falta</Selo>
                        : d.atraso_min ? <Selo status="pendente">atraso</Selo>
                        : <Selo status="aprovada">ok</Selo>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      <Bloco titulo="Minhas batidas" descricao="Cada registro, com a origem de onde ele veio.">
        {!data.marcacoes.length ? <Vazio>Nenhuma batida neste mês.</Vazio> : (
          <div className="space-y-1">
            {data.marcacoes.map(m => (
              <div key={m.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                <span className="text-gray-700">{dBR(m.data)}</span>
                <span className="font-medium text-gray-900">{m.hora}</span>
                <span className="text-[11px] text-gray-400">{m.origem || '—'}</span>
              </div>
            ))}
          </div>
        )}
      </Bloco>
    </div>
  );
}

const hora = t => (t ? String(t).slice(0, 5) : '—');

function Resumo({ titulo, valor, rodape }) {
  return (
    <div className="card"><div className="card-body">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{titulo}</p>
      <p className="text-2xl font-bold text-gray-900 leading-tight">{valor ?? '—'}</p>
      {rodape && <p className="text-[11px] text-gray-500 mt-0.5">{rodape}</p>}
    </div></div>
  );
}

// ── OCORRÊNCIAS E JUSTIFICATIVAS ─────────────────────────────

export function AbaOcorrencias({ data, onJustificar }) {
  return (
    <Bloco titulo="Minhas ocorrências"
      descricao="Atrasos e faltas que o ponto registrou, e o que aconteceu com cada justificativa.">
      {!data.ocorrencias.length ? <Vazio>Nenhuma ocorrência registrada. Nada a justificar.</Vazio> : (
        <div className="space-y-2">
          {data.ocorrencias.map(o => (
            <div key={o.id} className="rounded-lg border border-gray-100 p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900">
                  {o.kind === 'atraso' ? `Atraso de ${o.minutes || 0} min` : o.kind === 'falta' ? 'Falta' : o.kind}
                  {' '}em {dBR(o.occurred_on)}
                </p>
                {o.description && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{o.description}</p>}
                {o.decided_at && (
                  <p className="text-[11px] text-gray-400 mt-0.5">Decidida em {dBR(o.decided_at)}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Selo status={o.status === 'aberta' ? 'pendente' : o.status} />
                {o.status === 'aberta' && (
                  <button className="btn-primary btn-sm" onClick={() => onJustificar(o)}>
                    <Send size={13} /> Justificar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Bloco>
  );
}

// ── FÉRIAS E AFASTAMENTOS ────────────────────────────────────

export function AbaFerias({ data }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ start_date: '', end_date: '', abono_dias: '' });

  const solicitar = useMutation({
    mutationFn: () => api.post('/portal/eu/ferias', {
      ...form,
      abono_dias: form.abono_dias ? Number(form.abono_dias) : undefined,
      abono_pecuniario: !!form.abono_dias,
    }),
    onSuccess: () => {
      toast.success('Pedido enviado para aprovação.');
      setAberto(false); setForm({ start_date: '', end_date: '', abono_dias: '' });
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível solicitar.'),
  });

  return (
    <div className="space-y-4">
      <Bloco
        titulo="Meus períodos"
        descricao="O saldo sai da sua admissão, dos períodos já gozados e das faltas do ponto — ninguém digita."
        acao={<button className="btn-primary btn-sm" onClick={() => setAberto(true)}>
          <CalendarPlus size={13} /> Solicitar férias
        </button>}
      >
        <div className="space-y-2">
          {!data.ferias.periodos.length ? <Vazio>Nenhum período aquisitivo completo ainda.</Vazio>
            : data.ferias.periodos.map((p, i) => (
              <div key={i} className="flex flex-wrap items-center justify-between gap-2 text-sm rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-gray-700">{dBR(p.inicio)} — {dBR(p.fim)}</span>
                <span className="font-medium text-gray-900">{p.saldo} dias</span>
                <span className={`badge ${
                  p.status === 'vencido' ? 'badge-red' : p.status === 'a_vencer' ? 'badge-yellow'
                    : p.status === 'disponivel' ? 'badge-green' : 'badge-gray'
                }`}>{String(p.status).replace(/_/g, ' ')}</span>
              </div>
            ))}
        </div>
      </Bloco>

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Programadas" descricao="O que já está pedido ou marcado daqui para a frente.">
          {!data.ferias.proximas.length ? <Vazio>Nada programado.</Vazio> : (
            <div className="space-y-2">
              {data.ferias.proximas.map(f => (
                <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700">{dBR(f.start_date)} a {dBR(f.end_date)} · {f.days} dias</span>
                  <Selo status={f.status === 'pending' ? 'aberta' : 'aprovada'}>
                    {f.status === 'pending' ? 'aguardando aprovação' : 'aprovada'}
                  </Selo>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Afastamentos" descricao="Atestados e licenças registrados no seu prontuário.">
          {!data.afastamentos.length ? <Vazio>Nenhum afastamento registrado.</Vazio> : (
            <div className="space-y-2">
              {data.afastamentos.map(a => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="text-gray-700">{dBR(a.start_date)} a {dBR(a.end_date)} · {a.kind}</span>
                  <span className="text-[11px] text-gray-400">
                    {a.end_date >= hoje() ? `retorno previsto ${dBR(a.end_date)}` : 'encerrado'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Bloco>
      </div>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Solicitar férias">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Você tem <strong>{data.ferias.saldo} dia(s)</strong> de saldo. Pedido acima disso é recusado na hora.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início</label>
              <input type="date" className="input" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Fim</label>
              <input type="date" className="input" value={form.end_date}
                onChange={e => setForm({ ...form, end_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Vender dias (abono pecuniário)</label>
            <input type="number" min="0" max="10" className="input" placeholder="0"
              value={form.abono_dias} onChange={e => setForm({ ...form, abono_dias: e.target.value })} />
            <p className="text-[11px] text-gray-400 mt-0.5">Até 1/3 do período, conforme o art. 143 da CLT.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="btn-primary btn-sm"
              disabled={!form.start_date || !form.end_date || solicitar.isPending}
              onClick={() => solicitar.mutate()}>
              {solicitar.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Solicitar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// ── FOLHA E BENEFÍCIOS ───────────────────────────────────────

export function AbaFolha({ data, competencia }) {
  const [holerite, setHolerite] = useState(null);

  const ver = useMutation({
    mutationFn: comp => api.get('/portal/eu/holerite', { params: { competencia: comp } }),
    onSuccess: setHolerite,
    onError: e => toast.error(e.error || 'Holerite indisponível.'),
  });

  const b = data.remuneracao.beneficios;
  const temBeneficio = Object.values(b).some(v => v != null && v !== '' && Number(v) !== 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Resumo titulo="Salário base" valor={brl(data.remuneracao.salario)} rodape="do seu contrato" />
        <Resumo titulo="Comissão" valor={data.remuneracao.comissao_pct ? `${data.remuneracao.comissao_pct}%` : '—'}
          rodape="sobre vendas entregues" />
        <Resumo titulo="Horas extras no mês" valor={hm(data.mes.extras_min)} />
        <Resumo titulo="Holerites disponíveis" valor={data.holerites.length} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Meus holerites"
          descricao="A competência aberta aparece como prévia — ainda pode mudar até o fechamento.">
          {!data.holerites.length ? <Vazio>Nenhum holerite fechado ainda.</Vazio> : (
            <div className="space-y-1">
              {data.holerites.map(h => (
                <button key={h.competencia} onClick={() => ver.mutate(h.competencia)}
                  className="w-full flex items-center justify-between text-sm py-2 px-2 rounded-lg hover:bg-gray-50">
                  <span className="text-gray-700">{compBR(h.competencia)}</span>
                  <span className="font-medium text-gray-900">{brl(h.liquido)}</span>
                  <ChevronRight size={14} className="text-gray-300" />
                </button>
              ))}
            </div>
          )}
          <button className="btn-secondary btn-sm w-full mt-2" onClick={() => ver.mutate(competencia)}>
            {ver.isPending ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
            Ver prévia de {compBR(competencia)}
          </button>
        </Bloco>

        <Bloco titulo="Meus benefícios" descricao="O que está no seu contrato — a folha lê daqui.">
          {!temBeneficio ? <Vazio>Nenhum benefício cadastrado no seu contrato.</Vazio> : (
            <div className="space-y-1 text-sm">
              <Linha rotulo="Vale-transporte" valor={brl(b.vt)} />
              <Linha rotulo="Vale-refeição / alimentação" valor={brl(b.vr)} />
              <Linha rotulo="Plano de saúde" valor={brl(b.saude)} />
              <Linha rotulo="Outros" valor={brl(b.outros)} />
              <p className="text-[11px] text-gray-400 pt-2">
                O vale-transporte é descontado em até 6% do salário base, como manda a lei —
                o valor aparece no holerite, não aqui.
              </p>
            </div>
          )}
        </Bloco>
      </div>

      <Modal isOpen={!!holerite} onClose={() => setHolerite(null)}
        title={`Holerite ${compBR(holerite?.competencia)}`} size="lg">
        {holerite && (
          <div className="space-y-3">
            {holerite.previa && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-xs text-blue-800">
                Prévia — esta competência ainda não foi fechada pelo RH e os valores podem mudar.
              </div>
            )}
            <div className="rounded-lg border border-gray-100 overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {(holerite.holerite.rubricas || []).map((r, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-1.5 px-3 text-gray-700">
                        {r.rubrica}
                        {r.ref && <span className="block text-[11px] text-gray-400">{r.ref}</span>}
                      </td>
                      <td className={`py-1.5 px-3 text-right font-medium ${
                        r.tipo === 'desconto' ? 'text-red-600' : 'text-emerald-700'}`}>
                        {r.tipo === 'desconto' ? '− ' : ''}{brl(r.valor)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-gray-50">
                    <td className="py-2 px-3 font-semibold text-gray-900">Líquido</td>
                    <td className="py-2 px-3 text-right font-bold text-gray-900">
                      {brl(holerite.holerite.net_salary)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Linha({ rotulo, valor }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-gray-600">{rotulo}</span>
      <span className="font-medium text-gray-900">{valor}</span>
    </div>
  );
}

// ── DOCUMENTOS ───────────────────────────────────────────────

export function AbaDocumentos({ data }) {
  const qc = useQueryClient();
  const [enviando, setEnviando] = useState(null);

  async function enviar(doc, e) {
    const arquivo = e.target.files?.[0];
    if (!arquivo) return;
    setEnviando(doc.id);
    try {
      const fd = new FormData();
      fd.append('file', arquivo);
      fd.append('documento_id', doc.id);
      await api.post('/portal/eu/documento', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      toast.success('Documento enviado. O RH vai conferir.');
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    } catch (err) {
      toast.error(err.error || 'Não foi possível enviar.');
    } finally { setEnviando(null); e.target.value = ''; }
  }

  const pendentes = data.documentos.filter(d => d.pode_enviar);
  const arquivados = data.documentos.filter(d => !d.pode_enviar);

  return (
    <div className="space-y-4">
      <Bloco titulo="O RH está pedindo"
        descricao="O envio pelo portal só abre para o que foi solicitado — o resto o RH anexa por dentro."
        className={pendentes.length ? 'border-amber-200' : ''}>
        {!pendentes.length ? <Vazio>Nada pendente. Ninguém está esperando documento seu.</Vazio> : (
          <div className="space-y-2">
            {pendentes.map(d => (
              <div key={d.id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">{d.nome}</p>
                  <p className="text-[11px] text-gray-500">
                    {d.obrigatorio ? 'Obrigatório' : 'Solicitado'}
                    {d.categoria ? ` · ${d.categoria}` : ''}
                  </p>
                </div>
                <label className="btn-primary btn-sm cursor-pointer">
                  {enviando === d.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  Enviar arquivo
                  <input type="file" className="hidden" disabled={enviando === d.id}
                    onChange={e => enviar(d, e)} />
                </label>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco titulo="Meu prontuário" descricao="O que a empresa tem arquivado em seu nome.">
        {!arquivados.length ? <Vazio>Nenhum documento anexado.</Vazio> : (
          <div className="space-y-1">
            {arquivados.map(d => (
              <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-700 min-w-0 truncate">{d.nome}</span>
                <div className="flex items-center gap-3">
                  <span className={`text-[11px] ${d.vencido ? 'text-red-600 font-medium' : 'text-gray-400'}`}>
                    {d.sem_validade ? 'não vence' : d.validade ? `${d.vencido ? 'venceu' : 'vence'} ${dBR(d.validade)}` : 'sem validade informada'}
                  </span>
                  <Selo status={d.vencido ? 'vencido' : d.status} />
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm" title="Baixar">
                      <Download size={13} />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloco>
    </div>
  );
}

// ── SOLICITAÇÕES ─────────────────────────────────────────────

const TIPOS = [
  { key: 'cadastral', label: 'Alteração cadastral', dica: 'Banco, endereço, telefone, estado civil…' },
  { key: 'documento', label: 'Documento', dica: 'Declaração, cópia de contrato, comprovante…' },
  { key: 'beneficio', label: 'Benefício', dica: 'Inclusão, mudança ou cancelamento de benefício.' },
  { key: 'ponto', label: 'Correção de ponto', dica: 'Batida esquecida ou marcada errado.' },
  { key: 'outro', label: 'Outra solicitação', dica: '' },
];

export function AbaSolicitacoes({ data }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [form, setForm] = useState({ kind: 'cadastral', titulo: '', descricao: '' });

  const criar = useMutation({
    mutationFn: () => api.post('/portal/eu/solicitacao', form),
    onSuccess: () => {
      toast.success('Solicitação enviada. O RH vai analisar.');
      setAberto(false); setForm({ kind: 'cadastral', titulo: '', descricao: '' });
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível enviar.'),
  });

  const cancelar = useMutation({
    mutationFn: id => api.post(`/portal/eu/solicitacao/${id}/cancelar`),
    onSuccess: () => {
      toast.success('Solicitação cancelada.');
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível cancelar.'),
  });

  const tipo = TIPOS.find(t => t.key === form.kind);

  return (
    <>
      <Bloco
        titulo="Tudo que eu pedi"
        descricao="Férias, justificativas e pedidos ao RH na mesma lista — cada um continua guardado no seu lugar de origem."
        acao={<button className="btn-primary btn-sm" onClick={() => setAberto(true)}>
          <Plus size={13} /> Nova solicitação
        </button>}
      >
        {!data.solicitacoes.length ? <Vazio>Você ainda não pediu nada.</Vazio> : (
          <div className="space-y-2">
            {data.solicitacoes.map(s => (
              <div key={`${s.fonte}-${s.id}`}
                className="rounded-lg border border-gray-100 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900">{s.titulo}</p>
                  {s.resumo && <p className="text-xs text-gray-500 mt-0.5 whitespace-pre-line">{s.resumo}</p>}
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Pedido em {dBR(s.criado_em)}
                    {s.decidido_em ? ` · decidido em ${dBR(s.decidido_em)}` : ''}
                    {s.nota ? ` · ${s.nota}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Selo status={s.status} />
                  {s.cancelavel && (
                    <button className="btn-ghost btn-sm text-red-600" title="Cancelar"
                      disabled={cancelar.isPending}
                      onClick={() => cancelar.mutate(s.id)}>
                      <XCircle size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Nova solicitação">
        <div className="space-y-3">
          <div>
            <label className="label">O que você precisa</label>
            <select className="input" value={form.kind} onChange={e => setForm({ ...form, kind: e.target.value })}>
              {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
            {tipo?.dica && <p className="text-[11px] text-gray-400 mt-0.5">{tipo.dica}</p>}
          </div>
          <div>
            <label className="label">Assunto (opcional)</label>
            <input className="input" value={form.titulo} placeholder={tipo?.label}
              onChange={e => setForm({ ...form, titulo: e.target.value })} />
          </div>
          <div>
            <label className="label">Detalhe do pedido</label>
            <textarea className="input" rows={4} value={form.descricao}
              onChange={e => setForm({ ...form, descricao: e.target.value })} />
          </div>
          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3 text-[11px] text-gray-600">
            O pedido não muda o seu cadastro sozinho. Ele vai para o RH; se for aprovado, é o RH
            que altera o cadastro — e a folha passa a enxergar o dado novo a partir dali.
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={!form.descricao.trim() || criar.isPending}
              onClick={() => criar.mutate()}>
              {criar.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Enviar'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── CONTRATO E POLÍTICAS ─────────────────────────────────────

export function AbaPoliticas({ data }) {
  const qc = useQueryClient();
  const [lendo, setLendo] = useState(null);

  const aceitar = useMutation({
    mutationFn: id => api.post(`/portal/eu/politicas/${id}/aceite`),
    onSuccess: () => {
      toast.success('Ciência registrada.');
      setLendo(null);
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível registrar.'),
  });

  const contratos = data.documentos.filter(d =>
    /contrato|aditivo|termo/i.test(`${d.doc_key || ''} ${d.nome || ''}`));

  return (
    <div className="space-y-4">
      <Bloco titulo="Meu contrato" descricao="O que foi assinado entre você e a empresa.">
        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <Resumo titulo="Tipo de contrato" valor={data.colaborador.contrato || '—'} />
          <Resumo titulo="Admissão" valor={dBR(data.colaborador.admissao)} />
          <Resumo titulo="Jornada" valor={data.colaborador.jornada || '—'} />
        </div>
        {!contratos.length ? <Vazio>Nenhum documento contratual anexado ainda.</Vazio> : (
          <div className="space-y-1">
            {contratos.map(d => (
              <div key={d.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                <span className="text-gray-700">{d.nome}</span>
                <div className="flex items-center gap-3">
                  <Selo status={d.status} />
                  {d.url && <a href={d.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm"><Download size={13} /></a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Bloco titulo="Políticas da empresa"
        descricao="A ciência é sobre a versão do texto: política revisada volta a pedir leitura.">
        {!data.politicas.length ? <Vazio>Nenhuma política publicada.</Vazio> : (
          <div className="space-y-2">
            {data.politicas.map(p => (
              <div key={p.id} className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${
                p.pendente ? 'border-amber-200 bg-amber-50/40' : 'border-gray-100'}`}>
                <div>
                  <p className="text-sm font-medium text-gray-900">{p.titulo}</p>
                  <p className="text-[11px] text-gray-500">
                    versão {p.versao}
                    {p.vigente_desde ? ` · vigente desde ${dBR(p.vigente_desde)}` : ''}
                    {p.aceito_em ? ` · ciência em ${dBR(p.aceito_em)}` : ''}
                  </p>
                </div>
                {p.pendente
                  ? <button className="btn-primary btn-sm" onClick={() => setLendo(p)}>Ler e dar ciência</button>
                  : <span className="badge badge-green flex items-center gap-1"><Check size={12} /> ciente</span>}
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <Modal isOpen={!!lendo} onClose={() => setLendo(null)} title={lendo?.titulo} size="lg">
        {lendo && (
          <div className="space-y-3">
            <p className="text-[11px] text-gray-400">Versão {lendo.versao}</p>
            {lendo.conteudo
              ? <div className="text-sm text-gray-700 whitespace-pre-line max-h-96 overflow-y-auto">{lendo.conteudo}</div>
              : lendo.arquivo_url
                ? <a href={lendo.arquivo_url} target="_blank" rel="noreferrer" className="btn-secondary btn-sm">
                    <Download size={13} /> Abrir o documento
                  </a>
                : <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
                    O RH ainda não publicou o texto desta política. Dar ciência agora registraria
                    concordância com um documento que você não teve como ler — peça o texto ao RH antes.
                  </div>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setLendo(null)}>Fechar</button>
              <button className="btn-primary btn-sm"
                disabled={aceitar.isPending || (!lendo.conteudo && !lendo.arquivo_url)}
                onClick={() => aceitar.mutate(lendo.id)}>
                {aceitar.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Li e estou ciente'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

// ── MEU PERFIL ───────────────────────────────────────────────

/**
 * Os dados são de leitura, e o botão pede correção. Deixar o portal
 * gravar o banco direto faria a folha pagar numa conta que ninguém
 * conferiu — e é justamente essa conferência que o RH faz.
 */
export function AbaPerfil({ data }) {
  const qc = useQueryClient();
  const [aberto, setAberto] = useState(false);
  const [texto, setTexto] = useState('');

  const pedir = useMutation({
    mutationFn: () => api.post('/portal/eu/solicitacao', {
      kind: 'cadastral', titulo: 'Correção de dados cadastrais', descricao: texto,
    }),
    onSuccess: () => {
      toast.success('Pedido enviado ao RH.');
      setAberto(false); setTexto('');
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível enviar.'),
  });

  const p = data.perfil;
  const banco = p.banco || {};
  const end = p.endereco || {};

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Dados pessoais">
          <div className="space-y-1 text-sm">
            <Linha rotulo="Nome" valor={p.nome || '—'} />
            <Linha rotulo="CPF" valor={p.cpf || '—'} />
            <Linha rotulo="Nascimento" valor={dBR(p.nascimento)} />
            <Linha rotulo="Telefone" valor={p.telefone || '—'} />
            <Linha rotulo="E-mail" valor={p.email || '—'} />
            <Linha rotulo="E-mail de acesso" valor={p.email_acesso || '—'} />
          </div>
        </Bloco>

        <Bloco titulo="Endereço">
          {!end.street && !end.city ? <Vazio>Nenhum endereço cadastrado.</Vazio> : (
            <div className="space-y-1 text-sm">
              <Linha rotulo="Logradouro" valor={[end.street, end.number].filter(Boolean).join(', ') || '—'} />
              <Linha rotulo="Complemento" valor={end.complement || '—'} />
              <Linha rotulo="Bairro" valor={end.district || end.neighborhood || '—'} />
              <Linha rotulo="Cidade / UF" valor={[end.city, end.state].filter(Boolean).join(' / ') || '—'} />
              <Linha rotulo="CEP" valor={end.zip_code || end.cep || '—'} />
            </div>
          )}
        </Bloco>

        <Bloco titulo="Dados bancários" descricao="É para esta conta que a folha paga.">
          {!banco.bank && !banco.account && !p.pix ? <Vazio>Nenhuma conta cadastrada.</Vazio> : (
            <div className="space-y-1 text-sm">
              <Linha rotulo="Banco" valor={banco.bank || banco.name || '—'} />
              <Linha rotulo="Agência" valor={banco.agency || banco.branch || '—'} />
              <Linha rotulo="Conta" valor={banco.account || '—'} />
              <Linha rotulo="Tipo" valor={banco.type || '—'} />
              <Linha rotulo="Chave PIX" valor={p.pix || '—'} />
            </div>
          )}
        </Bloco>

        <Bloco titulo="Meu vínculo">
          <div className="space-y-1 text-sm">
            <Linha rotulo="Cargo" valor={data.colaborador.cargo || '—'} />
            <Linha rotulo="Departamento" valor={data.colaborador.departamento || '—'} />
            <Linha rotulo="Gestor" valor={data.colaborador.gestor || '—'} />
            <Linha rotulo="Matrícula" valor={data.colaborador.matricula || '—'} />
            <Linha rotulo="Admissão" valor={dBR(data.colaborador.admissao)} />
          </div>
        </Bloco>
      </div>

      <div className="card"><div className="card-body flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-900">Algum dado está errado?</p>
          <p className="text-xs text-gray-500">
            O portal não altera o seu cadastro. Descreva a correção e o RH atualiza o cadastro mestre —
            é ele que a folha, o ponto e o eSocial leem.
          </p>
        </div>
        <button className="btn-secondary btn-sm" onClick={() => setAberto(true)}>
          <Send size={13} /> Pedir correção
        </button>
      </div></div>

      <Modal isOpen={aberto} onClose={() => setAberto(false)} title="Pedir correção cadastral">
        <div className="space-y-3">
          <div>
            <label className="label">O que precisa ser corrigido</label>
            <textarea className="input" rows={4} value={texto} onChange={e => setTexto(e.target.value)}
              placeholder="Ex.: mudei de banco — Nubank, agência 0001, conta 12345678-9." />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setAberto(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={!texto.trim() || pedir.isPending}
              onClick={() => pedir.mutate()}>
              {pedir.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Enviar ao RH'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
