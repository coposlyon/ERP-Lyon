// ============================================================
// PORTAL DO COLABORADOR — A MINHA VIDA NA EMPRESA.
//
// Não é uma versão reduzida do RH: é outra pergunta. O RH pergunta
// "como está a equipe"; aqui a pergunta é "o que está esperando de
// mim, e o que é meu por direito".
//
// Por isso PENDÊNCIAS vêm primeiro, antes de qualquer indicador: um
// atraso de terça com prazo de 48h para justificar é a única coisa
// que muda se a pessoa abrir esta tela hoje em vez de semana que vem.
//
// Nada aqui é calculado no navegador. O saldo de férias e o holerite
// saem das MESMAS funções que o RH usa — se um dia discordassem, quem
// descobriria seria o colaborador, com o holerite na mão.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Umbrella, FileText, Receipt, AlertTriangle, Loader2, Send, CalendarPlus,
  ChevronRight, LogOut, Download,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hoje = () => new Date().toISOString().slice(0, 10);
const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const hm = min => {
  if (min == null) return '—';
  const s = min < 0 ? '−' : '';
  const a = Math.abs(min);
  return `${s}${Math.floor(a / 60)}h${String(a % 60).padStart(2, '0')}`;
};
const hora = t => (t ? new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—');

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

export default function PortalColaborador() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(hoje().slice(0, 7));
  const [just, setJust] = useState(null);
  const [texto, setTexto] = useState('');
  const [pedirFerias, setPedirFerias] = useState(false);
  const [ferias, setFerias] = useState({ start_date: '', end_date: '', abono_dias: '' });
  const [demissao, setDemissao] = useState(false);
  const [pedido, setPedido] = useState({ exit_date: hoje(), notice: 'trabalhado', motivo: '' });
  const [holerite, setHolerite] = useState(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal-eu', mes],
    queryFn: () => api.get('/portal/eu', { params: { competencia: mes } }),
    retry: false,
  });

  const enviarJust = useMutation({
    mutationFn: () => api.post('/portal/eu/justificativa', {
      occurred_on: just.data, texto,
    }),
    onSuccess: () => {
      toast.success('Justificativa enviada. Seu gestor vai analisar.');
      setJust(null); setTexto('');
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível enviar.'),
  });

  const solicitarFerias = useMutation({
    mutationFn: () => api.post('/portal/eu/ferias', {
      ...ferias, abono_dias: ferias.abono_dias ? Number(ferias.abono_dias) : undefined,
      abono_pecuniario: !!ferias.abono_dias,
    }),
    onSuccess: () => {
      toast.success('Pedido enviado para aprovação.');
      setPedirFerias(false); setFerias({ start_date: '', end_date: '', abono_dias: '' });
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível solicitar.'),
  });

  const pedirDemissao = useMutation({
    mutationFn: () => api.post('/portal/eu/demissao', pedido),
    onSuccess: r => {
      toast.success(r.aviso || 'Pedido registrado.');
      setDemissao(false);
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível registrar.'),
  });

  const verHolerite = useMutation({
    mutationFn: comp => api.get('/portal/eu/holerite', { params: { competencia: comp } }),
    onSuccess: setHolerite,
    onError: e => toast.error(e.error || 'Holerite indisponível.'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-400" size={28} /></div>;
  }
  if (error) {
    return (
      <div className="card"><div className="card-body text-center py-10">
        <AlertTriangle className="mx-auto text-amber-500 mb-2" size={28} />
        <p className="text-sm text-gray-700">{error.error || 'Não foi possível abrir o portal.'}</p>
        {error.dica && <p className="text-xs text-gray-500 mt-1">{error.dica}</p>}
      </div></div>
    );
  }

  const eu = data.colaborador;
  const m = data.mes;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          {eu.foto
            ? <img src={eu.foto} alt="" className="w-11 h-11 rounded-full object-cover" />
            : <span className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-semibold">
                {String(eu.nome || '?').slice(0, 2).toUpperCase()}
              </span>}
          <div>
            <h1 className="page-title">{eu.nome}</h1>
            <p className="text-sm text-gray-500">
              {[eu.cargo, eu.departamento].filter(Boolean).join(' · ') || '—'}
              {eu.admissao && ` · desde ${dBR(eu.admissao)}`}
            </p>
          </div>
        </div>
        <input type="month" className="input py-1.5 text-sm" value={mes} onChange={e => setMes(e.target.value)} />
      </div>

      {/* O que espera por mim vem antes de tudo. */}
      {!!data.pendencias.length && (
        <Bloco
          titulo="Precisa de você"
          descricao="Ocorrências abertas aguardando a sua justificativa."
          className="border-amber-200"
        >
          <div className="space-y-2">
            {data.pendencias.map(p => (
              <div key={p.id} className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${
                p.vencida ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/40'
              }`}>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {p.tipo === 'atraso' ? `Atraso de ${p.minutos} min` : 'Falta'} em {dBR(p.data)}
                  </p>
                  <p className="text-[11px] text-gray-500">
                    {p.vencida ? 'Prazo vencido' : `Justifique até ${dBR(p.prazo)}`} · gravidade {p.gravidade}
                  </p>
                </div>
                <button className="btn-primary btn-sm" onClick={() => { setJust(p); setTexto(''); }}>
                  <Send size={13} /> Justificar
                </button>
              </div>
            ))}
          </div>
        </Bloco>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icone={Clock} cor="bg-blue-50 text-blue-600" titulo="Dias trabalhados" valor={m.dias_trabalhados}
          rodape={`${m.faltas} falta(s) no mês`} />
        <Cartao icone={Clock} cor="bg-violet-50 text-violet-600" titulo="Saldo de horas" valor={hm(m.saldo_min)}
          rodape={`${hm(m.extras_min)} extras · ${hm(m.atrasos_min)} atrasos`} />
        <Cartao icone={Umbrella} cor="bg-emerald-50 text-emerald-600" titulo="Férias disponíveis"
          valor={`${data.ferias.saldo} dias`} rodape="calculado da sua admissão" />
        <Cartao icone={FileText} cor="bg-slate-50 text-slate-600" titulo="Documentos"
          valor={data.documentos.length} rodape="no seu prontuário" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Meu ponto" descricao={`Marcações de ${dBR(`${mes}-01`)} em diante.`}>
          {!data.marcacoes.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma marcação neste mês.</p>
          ) : (
            <div className="space-y-1">
              {data.marcacoes.map(x => (
                <div key={x.id} className="flex items-center justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700">{dBR(x.quando)}</span>
                  <span className="font-medium text-gray-900">{hora(x.quando)}</span>
                  <span className="text-[11px] text-gray-400">{x.tipo || x.origem || '—'}</span>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco
          titulo="Minhas férias"
          descricao="O saldo sai da sua admissão, dos períodos já gozados e das faltas — ninguém digita."
          acao={
            <button className="btn-primary btn-sm" onClick={() => setPedirFerias(true)}>
              <CalendarPlus size={13} /> Solicitar
            </button>
          }
        >
          <div className="space-y-2">
            {data.ferias.periodos.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-sm rounded-lg bg-gray-50 px-3 py-2">
                <span className="text-gray-700">{dBR(p.inicio)} — {dBR(p.fim)}</span>
                <span className="font-medium text-gray-900">{p.saldo} dias</span>
                <span className={`badge ${
                  p.status === 'vencido' ? 'badge-red' : p.status === 'a_vencer' ? 'badge-yellow'
                    : p.status === 'disponivel' ? 'badge-green' : 'badge-gray'
                }`}>{String(p.status).replace('_', ' ')}</span>
              </div>
            ))}
            {!!data.ferias.proximas.length && (
              <div className="pt-1">
                <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">Programadas</p>
                {data.ferias.proximas.map(f => (
                  <p key={f.id} className="text-sm text-gray-700">
                    {dBR(f.start_date)} a {dBR(f.end_date)} · {f.days} dias
                    <span className={`badge ml-2 ${f.status === 'pending' ? 'badge-yellow' : 'badge-blue'}`}>
                      {f.status === 'pending' ? 'aguardando aprovação' : f.status}
                    </span>
                  </p>
                ))}
              </div>
            )}
          </div>
        </Bloco>

        <Bloco titulo="Meus holerites" descricao="A competência aberta aparece como prévia — ainda pode mudar até o fechamento.">
          {!data.holerites.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum holerite fechado ainda.</p>
          ) : (
            <div className="space-y-1">
              {data.holerites.map(h => (
                <button key={h.competencia}
                  onClick={() => verHolerite.mutate(h.competencia)}
                  className="w-full flex items-center justify-between text-sm py-2 px-2 rounded-lg hover:bg-gray-50">
                  <span className="text-gray-700">{h.competencia.split('-').reverse().join('/')}</span>
                  <span className="font-medium text-gray-900">{brl(h.liquido)}</span>
                  <ChevronRight size={14} className="text-gray-300" />
                </button>
              ))}
            </div>
          )}
          <button className="btn-secondary btn-sm w-full mt-2" onClick={() => verHolerite.mutate(mes)}>
            {verHolerite.isPending ? <Loader2 size={13} className="animate-spin" /> : <Receipt size={13} />}
            Ver prévia de {mes.split('-').reverse().join('/')}
          </button>
        </Bloco>

        <Bloco titulo="Meus documentos" descricao="O que a empresa tem arquivado em seu nome.">
          {!data.documentos.length ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum documento anexado.</p>
          ) : (
            <div className="space-y-1">
              {data.documentos.map(d => (
                <div key={d.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700">{d.nome}</span>
                  <span className="text-[11px] text-gray-400">
                    {d.validade ? `vence ${dBR(d.validade)}` : 'sem validade'}
                  </span>
                  {d.url && (
                    <a href={d.url} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                      <Download size={13} />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Bloco>
      </div>

      <div className="card">
        <div className="card-body flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-gray-900">Pedir demissão</p>
            <p className="text-xs text-gray-500">
              Abre o mesmo processo que o RH acompanha. Pedir não é ser desligado — o RH ainda vai confirmar as condições com você.
            </p>
          </div>
          <button className="btn-secondary btn-sm" onClick={() => setDemissao(true)}>
            <LogOut size={13} /> Iniciar pedido
          </button>
        </div>
      </div>

      {/* ── Modais ── */}
      <Modal isOpen={!!just} onClose={() => setJust(null)} title="Justificar ocorrência">
        {just && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {just.tipo === 'atraso' ? `Atraso de ${just.minutos} min` : 'Falta'} em <strong>{dBR(just.data)}</strong>.
            </p>
            <div>
              <label className="label">O que aconteceu</label>
              <textarea className="input" rows={4} value={texto} onChange={e => setTexto(e.target.value)} />
            </div>
            <p className="text-[11px] text-gray-400">
              A justificativa vai para o seu gestor. Quem decide é ele — o sistema só organiza o pedido.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setJust(null)}>Cancelar</button>
              <button className="btn-primary btn-sm" disabled={!texto.trim() || enviarJust.isPending}
                onClick={() => enviarJust.mutate()}>
                {enviarJust.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Enviar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={pedirFerias} onClose={() => setPedirFerias(false)} title="Solicitar férias">
        <div className="space-y-3">
          <p className="text-sm text-gray-600">
            Você tem <strong>{data.ferias.saldo} dia(s)</strong> de saldo. Pedidos acima disso são recusados na hora.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Início</label>
              <input type="date" className="input" value={ferias.start_date}
                onChange={e => setFerias({ ...ferias, start_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Fim</label>
              <input type="date" className="input" value={ferias.end_date}
                onChange={e => setFerias({ ...ferias, end_date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Vender dias (abono pecuniário)</label>
            <input type="number" min="0" max="10" className="input" placeholder="0"
              value={ferias.abono_dias} onChange={e => setFerias({ ...ferias, abono_dias: e.target.value })} />
            <p className="text-[11px] text-gray-400 mt-0.5">Até 1/3 do período, conforme o art. 143 da CLT.</p>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setPedirFerias(false)}>Cancelar</button>
            <button className="btn-primary btn-sm"
              disabled={!ferias.start_date || !ferias.end_date || solicitarFerias.isPending}
              onClick={() => solicitarFerias.mutate()}>
              {solicitarFerias.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Solicitar'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={demissao} onClose={() => setDemissao(false)} title="Pedido de demissão">
        <div className="space-y-3">
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800">
            No pedido de demissão não há multa de FGTS, não há saque e não há seguro-desemprego.
            Se o aviso não for cumprido, ele é descontado da rescisão.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Último dia pretendido</label>
              <input type="date" className="input" value={pedido.exit_date}
                onChange={e => setPedido({ ...pedido, exit_date: e.target.value })} />
            </div>
            <div>
              <label className="label">Aviso prévio</label>
              <select className="input" value={pedido.notice}
                onChange={e => setPedido({ ...pedido, notice: e.target.value })}>
                <option value="trabalhado">Vou cumprir</option>
                <option value="indenizado">Não vou cumprir</option>
              </select>
            </div>
          </div>
          <div>
            <label className="label">Motivo (opcional)</label>
            <textarea className="input" rows={3} value={pedido.motivo}
              onChange={e => setPedido({ ...pedido, motivo: e.target.value })} />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setDemissao(false)}>Cancelar</button>
            <button className="btn-primary btn-sm" disabled={pedirDemissao.isPending}
              onClick={() => pedirDemissao.mutate()}>
              {pedirDemissao.isPending ? <Loader2 size={14} className="animate-spin" /> : 'Registrar pedido'}
            </button>
          </div>
        </div>
      </Modal>

      <Modal isOpen={!!holerite} onClose={() => setHolerite(null)}
        title={`Holerite ${holerite?.competencia?.split('-').reverse().join('/') || ''}`} size="lg">
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
