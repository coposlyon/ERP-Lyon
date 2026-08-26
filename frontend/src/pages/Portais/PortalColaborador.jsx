// ============================================================
// PORTAL DO COLABORADOR — A MINHA VIDA NA EMPRESA.
//
// Não é uma versão reduzida do RH: é outra pergunta. O RH pergunta
// "como está a equipe"; aqui a pergunta é "o que estão esperando de
// mim, e o que é meu por direito".
//
// Por isso a ordem da tela é esta:
//
//   1. PENDÊNCIAS   — um atraso de terça com 48h para justificar é a
//                     única coisa que muda se a pessoa abrir o portal
//                     hoje em vez de semana que vem;
//   2. HOJE         — entrada prevista, o que já foi batido, quanto
//                     falta para voltar do intervalo, hora de sair;
//   3. o resto      — ponto, férias, folha, documentos, pedidos,
//                     contrato e perfil, um por aba.
//
// Nada aqui é calculado no navegador. Saldo de férias, holerite e
// espelho de ponto saem das MESMAS funções que o RH usa — se um dia
// discordassem, quem descobriria seria o colaborador, com o holerite
// na mão.
//
// E o portal NÃO ESCREVE NO CADASTRO. Ele consulta, ou pede. Trocar o
// banco daqui faria a folha pagar numa conta que ninguém conferiu.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Clock, Umbrella, FileText, Receipt, AlertTriangle, Loader2, Send, LogOut,
  Fingerprint, CalendarDays, ClipboardList, ShieldCheck, User, Coffee, CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { dBR, brl, hm, espera, iniciais, Cartao, Bloco, Vazio } from './pecas';
import {
  AbaPonto, AbaOcorrencias, AbaFerias, AbaFolha, AbaDocumentos,
  AbaSolicitacoes, AbaPoliticas, AbaPerfil,
} from './colaboradorAbas';

const hojeISO = () => new Date().toISOString().slice(0, 10);

const ABAS = [
  { key: 'hoje', label: 'Hoje', Icon: Clock },
  { key: 'ponto', label: 'Jornada', Icon: CalendarDays },
  { key: 'ocorrencias', label: 'Ocorrências', Icon: AlertTriangle },
  { key: 'ferias', label: 'Férias', Icon: Umbrella },
  { key: 'folha', label: 'Folha', Icon: Receipt },
  { key: 'documentos', label: 'Documentos', Icon: FileText },
  { key: 'solicitacoes', label: 'Solicitações', Icon: ClipboardList },
  { key: 'politicas', label: 'Contrato', Icon: ShieldCheck },
  { key: 'perfil', label: 'Meu perfil', Icon: User },
];

const ROTULO_STATUS = {
  aguardando: { texto: 'Ainda não bateu', cor: 'bg-gray-100 text-gray-700' },
  presente: { texto: 'Trabalhando', cor: 'bg-emerald-100 text-emerald-800' },
  intervalo: { texto: 'Em intervalo', cor: 'bg-amber-100 text-amber-800' },
  atraso: { texto: 'Atrasado', cor: 'bg-red-100 text-red-800' },
  falta: { texto: 'Sem marcação hoje', cor: 'bg-red-100 text-red-800' },
  encerrado: { texto: 'Jornada encerrada', cor: 'bg-blue-100 text-blue-800' },
  folga: { texto: 'Folga', cor: 'bg-gray-100 text-gray-600' },
  trabalhando_na_folga: { texto: 'Trabalhando em dia de folga', cor: 'bg-violet-100 text-violet-800' },
};

const PROXIMO = {
  entrada: 'Registrar entrada',
  intervalo: 'Sair para o intervalo',
  retorno: 'Voltar do intervalo',
  saida: 'Registrar saída',
};

export default function PortalColaborador() {
  const qc = useQueryClient();
  const [aba, setAba] = useState('hoje');
  const [mes, setMes] = useState(hojeISO().slice(0, 7));
  const [just, setJust] = useState(null);
  const [texto, setTexto] = useState('');
  const [demissao, setDemissao] = useState(false);
  const [pedido, setPedido] = useState({ exit_date: hojeISO(), notice: 'trabalhado', motivo: '' });

  const { data, isLoading, error } = useQuery({
    queryKey: ['portal-eu', mes],
    queryFn: () => api.get('/portal/eu', { params: { competencia: mes } }),
    retry: false,
  });

  const enviarJust = useMutation({
    mutationFn: () => api.post('/portal/eu/justificativa', {
      occurred_on: just.data || just.occurred_on, texto,
    }),
    onSuccess: () => {
      toast.success('Justificativa enviada. Seu gestor vai analisar.');
      setJust(null); setTexto('');
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível enviar.'),
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
  const docsPendentes = data.documentos.filter(d => d.pode_enviar);
  const politicasPendentes = data.politicas.filter(p => p.pendente);
  const totalPendencias = data.pendencias.length + docsPendentes.length + politicasPendentes.length;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          {eu.foto
            ? <img src={eu.foto} alt="" className="w-11 h-11 rounded-full object-cover" />
            : <span className="w-11 h-11 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center font-semibold">
                {iniciais(eu.nome)}
              </span>}
          <div>
            <h1 className="page-title">{eu.nome}</h1>
            <p className="text-sm text-gray-500">
              {[eu.cargo, eu.departamento].filter(Boolean).join(' · ') || '—'}
              {eu.admissao && ` · desde ${dBR(eu.admissao)}`}
            </p>
          </div>
        </div>
        {['ponto', 'folha'].includes(aba) && (
          <input type="month" className="input py-1.5 text-sm" value={mes} onChange={e => setMes(e.target.value)} />
        )}
      </div>

      {/* O que espera por mim vem antes de tudo, em qualquer aba. */}
      {!!totalPendencias && (
        <PainelPendencias
          pendencias={data.pendencias}
          documentos={docsPendentes}
          politicas={politicasPendentes}
          onJustificar={p => { setJust(p); setTexto(''); }}
          irPara={setAba}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium flex items-center gap-2 border transition-colors ${
              aba === a.key
                ? 'bg-primary-600 text-white border-primary-600'
                : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            <a.Icon size={15} /> {a.label}
          </button>
        ))}
      </div>

      {aba === 'hoje' && <AbaHoje data={data} />}
      {aba === 'ponto' && <AbaPonto data={data} />}
      {aba === 'ocorrencias' && <AbaOcorrencias data={data} onJustificar={o => { setJust(o); setTexto(''); }} />}
      {aba === 'ferias' && <AbaFerias data={data} />}
      {aba === 'folha' && <AbaFolha data={data} competencia={mes} />}
      {aba === 'documentos' && <AbaDocumentos data={data} />}
      {aba === 'solicitacoes' && <AbaSolicitacoes data={data} />}
      {aba === 'politicas' && <AbaPoliticas data={data} />}
      {aba === 'perfil' && (
        <div className="space-y-4">
          <AbaPerfil data={data} />
          <div className="card"><div className="card-body flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">Pedir demissão</p>
              <p className="text-xs text-gray-500">
                Abre o mesmo processo que o RH acompanha. Pedir não é ser desligado — o RH ainda
                vai confirmar as condições com você.
              </p>
            </div>
            <button className="btn-secondary btn-sm" onClick={() => setDemissao(true)}>
              <LogOut size={13} /> Iniciar pedido
            </button>
          </div></div>
        </div>
      )}

      {/* ── Modais que valem para a tela inteira ── */}
      <Modal isOpen={!!just} onClose={() => setJust(null)} title="Justificar ocorrência">
        {just && (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              {(just.tipo || just.kind) === 'atraso'
                ? `Atraso de ${just.minutos ?? just.minutes ?? 0} min`
                : 'Falta'} em <strong>{dBR(just.data || just.occurred_on)}</strong>.
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
    </div>
  );
}

// ── PRECISA DE VOCÊ ──────────────────────────────────────────

/**
 * As três coisas que só a própria pessoa resolve, juntas e antes de
 * qualquer indicador. Separadas em três abas, cada uma seria descoberta
 * por acaso — e o prazo de justificar vence sozinho.
 */
function PainelPendencias({ pendencias, documentos, politicas, onJustificar, irPara }) {
  return (
    <Bloco titulo="Precisa de você"
      descricao="O que está esperando uma ação sua — e nada disso anda sem você."
      className="border-amber-200">
      <div className="space-y-2">
        {pendencias.map(p => (
          <div key={p.id} className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${
            p.vencida ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/40'}`}>
            <div>
              <p className="text-sm font-medium text-gray-900">
                {p.tipo === 'atraso' ? `Atraso de ${p.minutos} min` : 'Falta'} em {dBR(p.data)}
              </p>
              <p className="text-[11px] text-gray-500">
                {p.vencida ? 'Prazo vencido' : `Justifique até ${dBR(p.prazo)}`}
                {p.gravidade ? ` · gravidade ${p.gravidade}` : ''}
              </p>
            </div>
            <button className="btn-primary btn-sm" onClick={() => onJustificar(p)}>
              <Send size={13} /> Justificar
            </button>
          </div>
        ))}

        {!!documentos.length && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {documentos.length} documento(s) solicitado(s) pelo RH
              </p>
              <p className="text-[11px] text-gray-500">{documentos.map(d => d.nome).join(' · ')}</p>
            </div>
            <button className="btn-primary btn-sm" onClick={() => irPara('documentos')}>
              <FileText size={13} /> Enviar
            </button>
          </div>
        )}

        {!!politicas.length && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-gray-900">
                {politicas.length} política(s) aguardando sua ciência
              </p>
              <p className="text-[11px] text-gray-500">{politicas.map(p => p.titulo).join(' · ')}</p>
            </div>
            <button className="btn-primary btn-sm" onClick={() => irPara('politicas')}>
              <ShieldCheck size={13} /> Ler agora
            </button>
          </div>
        )}
      </div>
    </Bloco>
  );
}

// ── HOJE ─────────────────────────────────────────────────────

/**
 * O DIA EM ANDAMENTO.
 *
 * O relógio corre no navegador, mas a HORA DA BATIDA é a do servidor,
 * no fuso da empresa. Se a contagem regressiva mandasse o horário, um
 * celular com relógio adiantado registraria retorno antes da hora — e
 * o espelho de ponto teria um minuto que nunca existiu.
 */
function AbaHoje({ data }) {
  const qc = useQueryClient();
  const h = data.hoje;
  const [agora, setAgora] = useState(() => new Date());

  // 20 segundos: o suficiente para a contagem regressiva não parecer
  // travada, e raro o bastante para não custar nada.
  useEffect(() => {
    const t = setInterval(() => setAgora(new Date()), 20000);
    return () => clearInterval(t);
  }, []);

  const marcar = useMutation({
    mutationFn: () => new Promise(resolve => {
      // A geolocalização é um EXTRA, não uma condição: negar o GPS não
      // pode impedir alguém de bater o próprio ponto.
      if (!navigator.geolocation) return resolve({});
      navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude }),
        () => resolve({}),
        { timeout: 5000 },
      );
    }).then(geo => api.post('/portal/eu/ponto', geo)),
    onSuccess: r => {
      toast.success(`Ponto registrado às ${r.hora}.`);
      qc.invalidateQueries({ queryKey: ['portal-eu'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível registrar.'),
  });

  const status = ROTULO_STATUS[h.status] || ROTULO_STATUS.aguardando;
  const faltamMin = minutosAte(h.proximo?.previsto, agora);

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-body">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-wide text-gray-400">
                {dBR(h.data)} {h.escala?.nome ? `· ${h.escala.nome}` : ''}
              </p>
              <div className="flex items-center gap-3 mt-1">
                <p className="text-4xl font-bold text-gray-900 leading-none tabular-nums">
                  {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </p>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${status.cor}`}>{status.texto}</span>
              </div>
              {h.feriado && <p className="text-xs text-gray-500 mt-1">Feriado: {h.feriado}</p>}
              {h.afastamento && (
                <p className="text-xs text-gray-500 mt-1">
                  {h.afastamento.tipo === 'ferias' ? 'Você está de férias' : 'Você está afastado'} até {dBR(h.afastamento.ate)}.
                </p>
              )}
            </div>

            {h.proximo && h.dia_util && (
              <div className="text-right">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Próximo passo</p>
                <p className="text-sm font-medium text-gray-900">{PROXIMO[h.proximo.acao]}</p>
                {h.proximo.previsto && (
                  <p className={`text-xs mt-0.5 ${faltamMin != null && faltamMin < 0 ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                    previsto {h.proximo.previsto}
                    {faltamMin != null && (faltamMin >= 0
                      ? ` · faltam ${espera(faltamMin)}`
                      : ` · ${espera(faltamMin)} de atraso`)}
                  </p>
                )}
                <button className="btn-primary btn-sm mt-2" disabled={marcar.isPending}
                  onClick={() => marcar.mutate()}>
                  {marcar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Fingerprint size={14} />}
                  Bater ponto
                </button>
              </div>
            )}

            {h.status === 'encerrado' && (
              <div className="text-right">
                <p className="text-sm font-medium text-emerald-700 flex items-center gap-1.5 justify-end">
                  <CheckCircle2 size={16} /> Jornada cumprida
                </p>
                <p className="text-xs text-gray-500">{hm(h.trabalhado_min)} trabalhados hoje</p>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-gray-100">
            <Momento rotulo="Entrada prevista" valor={h.escala?.entrada || '—'} feito={h.entrada_real} />
            <Momento rotulo="Saída p/ intervalo" valor="—" feito={h.saida_intervalo} />
            <Momento rotulo="Retorno" valor={h.retorno_previsto || '—'} feito={h.retorno_intervalo}
              icone={h.status === 'intervalo' ? Coffee : null} />
            <Momento rotulo="Saída prevista" valor={h.escala?.saida || '—'} feito={h.saida_real} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icone={Clock} cor="bg-blue-50 text-blue-600" titulo="Trabalhado hoje"
          valor={hm(h.trabalhado_min)}
          rodape={h.dia_util ? `faltam ${hm(h.falta_para_jornada_min)} para a jornada` : 'dia sem jornada prevista'} />
        <Cartao icone={Clock} cor="bg-violet-50 text-violet-600" titulo="Saldo do mês"
          valor={hm(data.mes.saldo_min)} rodape={`${hm(data.mes.extras_min)} extras · ${hm(data.mes.atrasos_min)} atrasos`} />
        <Cartao icone={Umbrella} cor="bg-emerald-50 text-emerald-600" titulo="Férias disponíveis"
          valor={`${data.ferias.saldo} dias`} rodape="calculado da sua admissão" />
        <Cartao icone={Receipt} cor="bg-slate-50 text-slate-600" titulo="Último holerite"
          valor={brl(data.holerites[0]?.liquido)} rodape={data.holerites[0]?.competencia || 'nenhum fechado'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Minhas batidas de hoje" descricao="O que já foi registrado, na ordem.">
          {!h.marcacoes?.length ? <Vazio>Nenhuma batida hoje.</Vazio> : (
            <div className="flex flex-wrap gap-2">
              {h.marcacoes.map((m, i) => (
                <span key={i} className="px-3 py-1.5 rounded-lg bg-gray-50 text-sm font-medium text-gray-800 tabular-nums">
                  {m}
                </span>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Meus pedidos em aberto" descricao="O que está na mão de alguém decidir.">
          {(() => {
            const abertas = data.solicitacoes.filter(s => s.status === 'aberta');
            if (!abertas.length) return <Vazio>Nada aguardando decisão.</Vazio>;
            return (
              <div className="space-y-1.5">
                {abertas.slice(0, 5).map(s => (
                  <div key={`${s.fonte}-${s.id}`} className="flex items-center justify-between text-sm">
                    <span className="text-gray-700">{s.titulo}</span>
                    <span className="text-[11px] text-gray-400">pedido em {dBR(s.criado_em)}</span>
                  </div>
                ))}
              </div>
            );
          })()}
        </Bloco>
      </div>
    </div>
  );
}

function Momento({ rotulo, valor, feito, icone: Icone }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wide text-gray-400 flex items-center gap-1">
        {Icone && <Icone size={12} />} {rotulo}
      </p>
      <p className={`text-lg font-semibold tabular-nums ${feito ? 'text-gray-900' : 'text-gray-400'}`}>
        {feito || valor}
      </p>
      {feito && valor !== '—' && feito !== valor && (
        <p className="text-[11px] text-gray-400">previsto {valor}</p>
      )}
    </div>
  );
}

/** Minutos entre agora e um 'HH:MM' de hoje. Negativo = já passou. */
function minutosAte(hhmm, agora) {
  if (!hhmm) return null;
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return (h * 60 + m) - (agora.getHours() * 60 + agora.getMinutes());
}
