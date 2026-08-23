// ============================================================
// JORNADA / PONTO.
//
// O QUE ESTA TELA NÃO FAZ: pedir para alguém digitar atraso. O atraso
// já está no ponto — hora de entrada, jornada esperada e tolerância da
// escala. Quem digita de novo cria a segunda versão do mesmo fato, e
// uma delas fica errada para sempre.
//
// O PERCENTUAL É SOBRE QUEM ESTAVA ESCALADO. "90% de presença" calculado
// sobre o quadro inteiro mente todo sábado, quando metade da empresa
// não trabalha — e mente de novo quando alguém está de férias. Aqui o
// denominador é quem tinha jornada naquele dia, segundo a escala do
// cadastro, menos quem está afastado.
// ============================================================
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import {
  UserCheck, Clock, UserX, Coffee, FileWarning, Timer, Loader2, RefreshCw,
  AlertTriangle, MessageCircle, ArrowRight, Fingerprint,
} from 'lucide-react';
import api from '@/lib/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

const dBR = d => String(d || '').slice(0, 10).split('-').reverse().join('/');
const hhmm = min => (min == null ? '—' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

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

export default function JornadaPonto() {
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));

  const { data: d, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-ponto', data],
    queryFn: () => api.get(`/rh/ponto?data=${data}`),
    refetchInterval: 60000,        // é um monitor do dia: se atualiza sozinho
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const c = d?.cartoes || {};
  const inc = d?.resumo?.inconsistencias || {};

  const grafico = {
    labels: (d?.semana || []).map(s => `${DIAS[new Date(`${s.data}T12:00`).getDay()]} ${s.data.slice(8)}`),
    datasets: [
      { label: 'Presentes', data: (d?.semana || []).map(s => s.presentes), backgroundColor: '#34d399', borderRadius: 4 },
      { label: 'Atrasos', data: (d?.semana || []).map(s => s.atrasos), backgroundColor: '#fbbf24', borderRadius: 4 },
      { label: 'Faltas', data: (d?.semana || []).map(s => s.faltas), backgroundColor: '#f87171', borderRadius: 4 },
    ],
  };

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Jornada / Ponto</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Reconhecimento facial, tolerância da escala e ocorrência automática — sem digitar atraso.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="input py-1.5 text-sm" value={data} onChange={e => setData(e.target.value)} />
          <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {(d?.avisos || []).length > 0 && (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <ul className="space-y-0.5 text-xs">{d.avisos.map((a, i) => <li key={i}>· {a}</li>)}</ul>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={UserCheck} cor="bg-emerald-100 text-emerald-600" titulo="Presentes hoje"
          valor={c.presentes} rodape={c.presentes_pct != null ? `${c.presentes_pct}% dos ${c.escalados} escalados` : 'ninguém escalado'} />
        <Cartao icone={Clock} cor="bg-amber-100 text-amber-600" titulo="Atrasos"
          valor={c.atrasos} rodape={c.atrasos_pct != null ? `${c.atrasos_pct}% dos escalados` : '—'} />
        <Cartao icone={UserX} cor="bg-rose-100 text-rose-600" titulo="Faltas"
          valor={c.faltas} rodape={c.faltas_pct != null ? `${c.faltas_pct}% dos escalados` : '—'} />
        <Cartao icone={Coffee} cor="bg-orange-100 text-orange-600" titulo="Intervalos em aberto"
          valor={c.intervalos_abertos} rodape="saíram e não voltaram" />
        <Cartao icone={FileWarning} cor="bg-violet-100 text-violet-600" titulo="Justificativas"
          valor={c.justificativas_pendentes} rodape="aguardando análise" />
        <Cartao icone={Timer} cor="bg-blue-100 text-blue-600" titulo="Horas extras"
          valor={hhmm(c.horas_extras_min)} rodape="no dia" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-7 space-y-4">
          <Bloco titulo="Marcações do dia" descricao={`${(d?.marcacoes || []).length} batida(s) em ${dBR(data)}.`}>
            {!(d?.marcacoes || []).length ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma marcação registrada.</p>
            ) : (
              <ul className="space-y-1.5">
                {d.marcacoes.map(m => (
                  <li key={m.id} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-1.5 last:border-0">
                    <Fingerprint size={14} className="text-gray-300 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium text-gray-800 truncate">{m.colaborador}</span>
                      {m.setor && <span className="block text-[11px] text-gray-400">{m.setor}</span>}
                    </span>
                    <span className="text-xs text-gray-400">{m.source === 'facial' ? 'facial' : m.source}</span>
                    <span className="font-mono font-semibold text-gray-800">{m.hora}</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Atrasos e faltas" descricao="Cada linha já virou ocorrência e já pediu justificativa por WhatsApp.">
            {!(d?.atrasos_e_faltas || []).length ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum atraso nem falta hoje.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                  <thead>
                    <tr><th>Colaborador</th><th>Previsto</th><th>Entrada</th><th>Atraso</th><th>Avisado</th><th>Justificativa</th></tr>
                  </thead>
                  <tbody>
                    {d.atrasos_e_faltas.map((a, i) => (
                      <tr key={i}>
                        <td>
                          <span className="font-medium text-gray-800">{a.colaborador}</span>
                          <span className="block text-[11px] text-gray-400">
                            {a.setor}{a.tolerancia != null ? ` · tolerância ${a.tolerancia} min` : ''}
                          </span>
                        </td>
                        <td className="text-gray-500">{a.previsto || '—'}</td>
                        <td className="text-gray-700">{a.tipo === 'falta' ? '—' : (a.entrada || '—')}</td>
                        <td>
                          {a.tipo === 'falta'
                            ? <span className="badge badge-red">falta</span>
                            : <span className="badge badge-yellow">{a.minutos} min</span>}
                        </td>
                        <td>
                          {a.notificado
                            ? <span className="text-green-600 inline-flex items-center gap-1 text-xs"><MessageCircle size={12} /> enviado</span>
                            : <span className="text-gray-400 text-xs">na fila</span>}
                        </td>
                        <td>
                          {a.justificativa
                            ? <span className="badge badge-blue">recebida</span>
                            : <span className="text-gray-400 text-xs">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link to="/hr/ocorrencias" className="btn-secondary btn-sm mt-3">
                  Tratar em Ocorrências <ArrowRight size={13} />
                </Link>
              </div>
            )}
          </Bloco>

          <Bloco titulo="Presença da semana" descricao="Sempre sobre quem estava escalado em cada dia.">
            <div style={{ height: 220 }}>
              <Bar data={grafico} options={{
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { labels: { boxWidth: 10, font: { size: 11 } } } },
                scales: { x: { stacked: false }, y: { beginAtZero: true, ticks: { precision: 0 } } },
              }} />
            </div>
          </Bloco>
        </div>

        <div className="xl:col-span-5 space-y-4">
          <Bloco titulo="Intervalo em andamento" descricao="Quem saiu para o almoço e ainda não voltou.">
            {!(d?.intervalos_abertos || []).length ? (
              <p className="text-sm text-gray-400 py-2">Nenhum intervalo em aberto.</p>
            ) : (
              <ul className="space-y-2">
                {d.intervalos_abertos.map(i => (
                  <li key={i.employee_id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-gray-700">{i.colaborador}</span>
                    <span className="text-xs text-gray-400">saiu {i.saiu} · {hhmm(i.minutos_fora)} fora</span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Regras de jornada" descricao="Vêm da escala do cadastro — mudou lá, muda aqui.">
            <ul className="space-y-2">
              {(d?.regras || []).map(r => (
                <li key={r.id} className="border-b border-gray-100 pb-2 last:border-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-gray-800">{r.nome}</span>
                    <span className="text-xs text-gray-400">{r.colaboradores} pessoa(s)</span>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {r.entrada}–{r.saida} · intervalo {r.intervalo_min} min ·
                    <span className={r.tolerancia_min === 5 ? '' : ' text-amber-600'}> tolerância {r.tolerancia_min} min</span>
                  </p>
                </li>
              ))}
            </ul>
          </Bloco>

          <Bloco titulo="Fechamento do dia">
            <div className="flex items-center gap-3 mb-3">
              <div className="text-2xl font-bold text-primary-600">
                {d?.resumo?.fechamento_pct != null ? `${d.resumo.fechamento_pct}%` : '—'}
              </div>
              <p className="text-xs text-gray-500">
                {d?.resumo?.fechados || 0} de {d?.resumo?.escalados || 0} pontos apurados
              </p>
            </div>
            <ul className="space-y-1.5 text-sm">
              {[
                ['Atrasos sem justificativa', inc.atrasos_sem_justificativa],
                ['Intervalos em aberto', inc.intervalos_abertos],
                ['Marcações ímpares', inc.marcacoes_impares],
                ['Sem escala no cadastro', inc.sem_escala],
              ].map(([k, v]) => (
                <li key={k} className="flex items-center justify-between">
                  <span className="text-gray-600">{k}</span>
                  <span className={`font-semibold ${v ? 'text-amber-600' : 'text-gray-300'}`}>{v ?? '—'}</span>
                </li>
              ))}
            </ul>
          </Bloco>
        </div>
      </div>
    </div>
  );
}
