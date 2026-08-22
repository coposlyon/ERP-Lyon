// ============================================================
// PAINEL RH — O RETRATO DA OPERAÇÃO DE PESSOAS.
//
// A regra número um: NENHUM NÚMERO ESCRITO AQUI. Cada cartão, cada
// barra e cada linha desta tela vem de /api/rh/painel, que faz a conta
// sobre o cadastro mestre e sobre os fatos registrados — ponto, férias,
// folha, documentos, ocorrências. Mudou a jornada de alguém no
// cadastro? Muda aqui no próximo carregamento, sem ninguém editar.
//
// FUNCIONA COM 5 OU COM 500 PESSOAS. Não existe "20" em lugar nenhum:
// o quadro é o que o banco devolver.
//
// O QUE NÃO TEM ORIGEM, NÃO INVENTA. Enquanto uma tabela não existir
// (migração 080) ou uma integração não estiver ligada, o cartão mostra
// travessão e a tela diz o que não conseguiu ler. Número bonito e falso
// é pior do que campo vazio: ele vira decisão errada.
// ============================================================
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler,
} from 'chart.js';
import {
  Users, UserPlus, FileWarning, HeartPulse, Umbrella, Wallet, CloudUpload,
  AlertTriangle, Loader2, ChevronRight, CalendarDays, Filter, Clock, RefreshCw,
} from 'lucide-react';
import api from '@/lib/api';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const fmtMoeda = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }));
const fmtMil = v => (v == null ? '—' : (Math.abs(v) >= 1000 ? `R$ ${(v / 1000).toFixed(1).replace('.', ',')}K` : fmtMoeda(v)));
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotuloMes = comp => `${MESES[Number(comp.slice(5, 7)) - 1]}/${comp.slice(2, 4)}`;

/** Um cartão do topo. `valor` nulo vira travessão — nunca zero fingido. */
function Cartao({ icone: Icone, cor, titulo, valor, rodape, destino }) {
  const corpo = (
    <div className="card h-full">
      <div className="card-body">
        <div className="flex items-start justify-between gap-2">
          <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${cor}`}>
            <Icone size={17} />
          </span>
          {destino && <ChevronRight size={15} className="text-gray-300" />}
        </div>
        <p className="text-[11px] uppercase tracking-wide text-gray-400 mt-3">{titulo}</p>
        <p className="text-2xl font-bold text-gray-900 leading-tight">{valor ?? '—'}</p>
        {rodape && <p className="text-[11px] text-gray-500 mt-0.5">{rodape}</p>}
      </div>
    </div>
  );
  return destino ? <Link to={destino} className="block hover:opacity-90 transition-opacity">{corpo}</Link> : corpo;
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

function Vazio({ children }) {
  return <p className="text-sm text-gray-400 text-center py-6">{children}</p>;
}

export default function PainelRH() {
  const agora = new Date();
  const [comp, setComp] = useState(agora.toISOString().slice(0, 7));

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-painel', comp],
    queryFn: () => api.get(`/rh/painel?competencia=${comp}`),
    refetchInterval: 120000,          // o painel é um monitor: se atualiza sozinho
  });

  const c = data?.cartoes || {};
  const r = data?.resumo || {};
  const m = data?.monitor_dia || {};

  const evolucao = useMemo(() => {
    const g = data?.graficos?.evolucao || [];
    return {
      labels: g.map(x => rotuloMes(x.mes)),
      datasets: [
        { label: 'Total de colaboradores', data: g.map(x => x.total), borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,.12)', fill: true, tension: .35, pointRadius: 3 },
        { label: 'Ativos', data: g.map(x => x.ativos), borderColor: '#34d399', backgroundColor: 'transparent', tension: .35, pointRadius: 3 },
      ],
    };
  }, [data]);

  const admDes = useMemo(() => {
    const g = data?.graficos?.admissoes_x_desligamentos || [];
    return {
      labels: g.map(x => MESES[Number(x.mes.slice(5, 7)) - 1]),
      datasets: [
        { label: 'Admissões', data: g.map(x => x.admissoes), backgroundColor: '#34d399', borderRadius: 4 },
        { label: 'Desligamentos', data: g.map(x => x.desligamentos), backgroundColor: '#f472b6', borderRadius: 4 },
      ],
    };
  }, [data]);

  const opcoes = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { boxWidth: 10, font: { size: 11 } } } },
    scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
  };

  const totalAdm = (data?.graficos?.admissoes_x_desligamentos || []).reduce((s, x) => s + x.admissoes, 0);
  const totalDes = (data?.graficos?.admissoes_x_desligamentos || []).reduce((s, x) => s + x.desligamentos, 0);

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Painel RH</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Central de gestão de pessoas — todos os números calculados do cadastro e dos fatos do sistema.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 text-sm">
            <CalendarDays size={15} className="text-gray-400" />
            <input type="month" className="input py-1.5 text-sm" value={comp} onChange={e => setComp(e.target.value)} />
          </div>
          <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* O que o painel não conseguiu ler — antes dos números, para
          ninguém tomar decisão em cima de meia base. */}
      {(data?.avisos || []).length > 0 && (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Parte do painel não pôde ser calculada</p>
            <ul className="mt-1 space-y-0.5 text-xs">
              {data.avisos.map((a, i) => <li key={i}>· {a}</li>)}
            </ul>
            <p className="text-xs mt-1.5">
              Os cartões afetados mostram <b>travessão</b>, e não zero: o sistema não sabe o número,
              e fingir que sabe é o que faz o RH parar de olhar o painel.
            </p>
          </div>
        </div>
      )}

      {/* Cartões */}
      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-3">
        <Cartao icone={Users} cor="bg-blue-100 text-blue-600" titulo="Colaboradores ativos"
          valor={c.colaboradores_ativos} rodape={`${c.admissoes_no_mes || 0} admitido(s) neste mês`} destino="/employees" />
        <Cartao icone={UserPlus} cor="bg-violet-100 text-violet-600" titulo="Admissões pendentes"
          valor={c.admissoes_pendentes} rodape={`${c.admissoes_aguardando_aprovacao || 0} aguardando aprovação`} destino="/hr/admissoes" />
        <Cartao icone={FileWarning} cor="bg-amber-100 text-amber-600" titulo="Documentos pendentes"
          valor={c.documentos_pendentes} rodape={`${c.documentos_criticos || 0} obrigatório(s)`} destino="/hr/documentos" />
        <Cartao icone={HeartPulse} cor="bg-rose-100 text-rose-600" titulo="Afastamentos ativos"
          valor={c.afastamentos_ativos} rodape={`${c.afastamentos_ate_15_dias || 0} com retorno em 15 dias`} destino="/hr/ferias" />
        <Cartao icone={Umbrella} cor="bg-teal-100 text-teal-600" titulo="Férias programadas"
          valor={c.ferias_programadas} rodape={`${c.ferias_proximos_30 || 0} nos próximos 30 dias`} destino="/hr/ferias" />
        <Cartao icone={Wallet} cor="bg-emerald-100 text-emerald-600" titulo="Folha do mês"
          valor={c.folha_lancamentos ? fmtMil(c.folha_prevista) : '—'}
          rodape={c.folha_lancamentos ? `${c.folha_lancamentos} lançamento(s)` : 'folha ainda não gerada'} destino="/hr/folha" />
        <Cartao icone={CloudUpload} cor="bg-sky-100 text-sky-600" titulo="eSocial pendentes"
          valor={c.esocial_pendentes} rodape="eventos aguardando envio" destino="/hr/esocial" />
        <Cartao icone={AlertTriangle} cor="bg-orange-100 text-orange-600" titulo="Ocorrências abertas"
          valor={c.ocorrencias_abertas} rodape={`${c.ocorrencias_urgentes || 0} com prazo vencido`} destino="/hr/ocorrencias" />
      </div>

      {/* Gráficos + resumo */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <Bloco className="xl:col-span-5" titulo="Evolução do quadro"
          descricao="Últimos 12 meses, contando admissões e desligamentos reais.">
          <div style={{ height: 240 }}><Line data={evolucao} options={opcoes} /></div>
        </Bloco>

        <Bloco className="xl:col-span-4" titulo="Admissões × Desligamentos" descricao={`Ano de ${comp.slice(0, 4)}.`}>
          <div style={{ height: 240 }}><Bar data={admDes} options={opcoes} /></div>
          <div className="flex justify-center gap-6 mt-2 text-xs">
            <span className="text-emerald-600 font-semibold">{totalAdm} admissões</span>
            <span className="text-pink-600 font-semibold">{totalDes} desligamentos</span>
            <span className="text-gray-500">saldo {totalAdm - totalDes >= 0 ? '+' : ''}{totalAdm - totalDes}</span>
          </div>
        </Bloco>

        <Bloco className="xl:col-span-3" titulo="Resumo do RH">
          <dl className="space-y-2 text-sm">
            {[
              ['Colaboradores ativos', r.colaboradores_ativos],
              ['Colaboradores totais', r.colaboradores_totais],
              ['Admissões (mês)', r.admissoes_mes],
              ['Desligamentos (mês)', r.desligamentos_mes],
              ['Turnover (12 meses)', r.turnover_12m != null ? `${r.turnover_12m}%` : null],
              ['Afastamentos ativos', r.afastamentos_ativos],
              ['Férias programadas', r.ferias_programadas],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-2">
                <dt className="text-gray-400 text-xs">{k}</dt>
                <dd className="font-semibold text-gray-800">{v ?? '—'}</dd>
              </div>
            ))}
          </dl>
        </Bloco>
      </div>

      {/* Pendências, vencimentos e o dia */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <Bloco titulo="Pendências automáticas" descricao="Nascem dos módulos — ninguém digita esta lista.">
          {(data?.pendencias || []).length === 0 ? (
            <Vazio>Nada pendente. O RH está em dia.</Vazio>
          ) : (
            <ul className="space-y-2">
              {data.pendencias.map((p, i) => (
                <li key={i}>
                  <Link to={p.destino} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2 hover:border-gray-300 transition-colors">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-800 truncate">{p.titulo}</span>
                      <span className="block text-[11px] text-gray-400">{p.qtd} item(ns)</span>
                    </span>
                    <span className={`badge ${p.prioridade === 'alta' ? 'badge-red' : p.prioridade === 'media' ? 'badge-yellow' : 'badge-gray'}`}>
                      {p.prioridade}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Próximos vencimentos" descricao="Só documentos COM validade — contrato indeterminado não vence.">
          {(data?.vencimentos || []).length === 0 ? (
            <Vazio>Nenhum documento vence nos próximos 30 dias.</Vazio>
          ) : (
            <ul className="space-y-2">
              {data.vencimentos.map(v => (
                <li key={v.id} className="flex items-center justify-between gap-2 text-sm border-b border-gray-100 pb-2 last:border-0">
                  <span className="truncate text-gray-700">{v.documento}</span>
                  <span className="text-xs text-amber-600 whitespace-nowrap">
                    {v.vence_em.split('-').reverse().join('/')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Bloco>

        <Bloco titulo="Monitor do dia"
          descricao={`Percentuais sobre quem estava escalado hoje${m.escalados ? ` (${m.escalados})` : ''}.`}>
          {!m.escalados ? (
            <Vazio>Ninguém escalado hoje — ou o ponto do dia ainda não foi apurado.</Vazio>
          ) : (
            <div className="space-y-2.5">
              {[
                ['Presentes', m.presentes, m.presentes_pct, 'text-emerald-600'],
                ['Atrasos', m.atrasos, m.atrasos_pct, 'text-amber-600'],
                ['Faltas', m.faltas, m.faltas_pct, 'text-rose-600'],
              ].map(([k, qtd, pct, cor]) => (
                <div key={k} className="flex items-center gap-3">
                  <Clock size={14} className="text-gray-300 shrink-0" />
                  <span className="text-sm text-gray-600 flex-1">{k}</span>
                  <span className="text-sm font-bold text-gray-800">{qtd}</span>
                  <span className={`text-xs ${cor} w-12 text-right`}>{pct != null ? `${pct}%` : '—'}</span>
                </div>
              ))}
              <div className="flex items-center gap-3 border-t border-gray-100 pt-2.5">
                <Clock size={14} className="text-gray-300 shrink-0" />
                <span className="text-sm text-gray-600 flex-1">Justificativas pendentes</span>
                <span className="text-sm font-bold text-gray-800">{m.justificativas_pendentes ?? '—'}</span>
              </div>
              <Link to="/hr/ponto" className="btn-secondary btn-sm w-full justify-center mt-1">
                Abrir Jornada / Ponto
              </Link>
            </div>
          )}
        </Bloco>
      </div>

      <p className="text-[11px] text-gray-400 text-center">
        Competência {comp.split('-').reverse().join('/')} · atualizado {data?.gerado_em ? new Date(data.gerado_em).toLocaleTimeString('pt-BR') : '—'}
      </p>
    </div>
  );
}
