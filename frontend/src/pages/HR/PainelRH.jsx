// ============================================================
// PAINEL RH — a tela aprovada, ligada em dado real.
//
// A composição é a da referência: oito indicadores no topo, dois
// gráficos, a faixa de três listas (pendências, vencimentos, monitor),
// a eficiência da operação, e a coluna da direita com resumo,
// checklist do mês e status da automação.
//
// O que a referência mostra como 92%, 95%, 100% aqui é CALCULADO. Um
// painel de automação que inventa a própria eficiência é pior que não
// existir: ele afirma que está tudo certo justamente quando ninguém
// olhou. Onde não há base para medir, sai um traço — e o traço é a
// informação honesta.
//
// Nada nesta tela é digitado em lugar nenhum: cada número vem de
// /rh/painel, que por sua vez conta do cadastro, do ponto, da folha,
// dos documentos e dos eventos.
// ============================================================
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement,
  BarElement, Tooltip, Legend, Filler,
} from 'chart.js';
import {
  Users, UserPlus, FileWarning, HeartPulse, Umbrella, Wallet, CloudUpload,
  AlertTriangle, Loader2, CalendarDays, SlidersHorizontal, Sparkles, Clock,
  CalendarClock, Stethoscope, FileCheck2, Activity,
} from 'lucide-react';
import api from '@/lib/api';
import {
  TOM, cor, Pagina, Cabecalho, Indicador, Indicadores, Bloco, Pilula,
  Medidor, ItemResumo, ItemLista, ItemCheck, Campo, LinkSeta,
} from '@/components/RH/kit';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler);

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const rotuloMes = m => `${MESES[Number(String(m).slice(5, 7)) - 1]}/${String(m).slice(2, 4)}`;
const compAtual = () => new Date().toISOString().slice(0, 7);
const brlCurto = v => (v == null ? '—'
  : Math.abs(v) >= 1000
    ? `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}K`
    : `R$ ${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`);
const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const pctTxt = v => (v == null ? '—' : `${v}%`);

const TOM_PRIORIDADE = { alta: 'vermelho', media: 'ambar', baixa: 'ciano' };

export default function PainelRH() {
  const nav = useNavigate();
  const [comp, setComp] = useState(compAtual());

  const { data, isLoading } = useQuery({
    queryKey: ['rh-painel', comp],
    queryFn: () => api.get(`/rh/painel?competencia=${comp}`),
  });

  /* ── Gráficos, no tom da referência ────────────────────── */
  const eixos = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: { boxWidth: 8, boxHeight: 8, usePointStyle: true, pointStyle: 'circle',
                  color: TOM.texto2, font: { size: 11 } },
        align: 'start',
      },
      tooltip: {
        backgroundColor: TOM.cartaoAlt, borderColor: TOM.borda, borderWidth: 1,
        titleColor: TOM.texto, bodyColor: TOM.texto2, padding: 10, displayColors: true,
      },
    },
    scales: {
      x: { grid: { color: TOM.bordaSuave, drawBorder: false }, ticks: { color: TOM.texto3, font: { size: 10 } } },
      y: { beginAtZero: true, grid: { color: TOM.bordaSuave, drawBorder: false },
           ticks: { color: TOM.texto3, font: { size: 10 }, precision: 0 } },
    },
  };

  const evolucao = useMemo(() => {
    const g = data?.graficos?.evolucao || [];
    return {
      labels: g.map(x => rotuloMes(x.mes)),
      datasets: [
        { label: 'Total de colaboradores', data: g.map(x => x.total),
          borderColor: TOM.azul, backgroundColor: 'rgba(77,141,246,.14)',
          fill: true, tension: .35, pointRadius: 2.5, pointBackgroundColor: TOM.azul, borderWidth: 2 },
        { label: 'Ativos', data: g.map(x => x.ativos),
          borderColor: TOM.verde, backgroundColor: 'transparent',
          tension: .35, pointRadius: 2.5, pointBackgroundColor: TOM.verde, borderWidth: 2 },
      ],
    };
  }, [data]);

  const admDes = useMemo(() => {
    const g = data?.graficos?.admissoes_x_desligamentos || [];
    return {
      labels: g.map(x => MESES[Number(String(x.mes).slice(5, 7)) - 1]),
      datasets: [
        { label: 'Admissões', data: g.map(x => x.admissoes), backgroundColor: TOM.verde, borderRadius: 3, barPercentage: .6 },
        { label: 'Desligamentos', data: g.map(x => x.desligamentos), backgroundColor: TOM.rosa, borderRadius: 3, barPercentage: .6 },
      ],
    };
  }, [data]);

  if (isLoading) {
    return (
      <Pagina>
        <div className="flex items-center justify-center h-64">
          <Loader2 size={26} className="animate-spin" style={{ color: TOM.texto3 }} />
        </div>
      </Pagina>
    );
  }

  const c = data?.cartoes || {};
  const r = data?.resumo || {};
  const m = data?.monitor_dia || {};
  const aut = data?.automacao || {};
  const serie = data?.graficos?.admissoes_x_desligamentos || [];
  const totalAdm = serie.reduce((s, x) => s + x.admissoes, 0);
  const totalDes = serie.reduce((s, x) => s + x.desligamentos, 0);
  const saldo = totalAdm - totalDes;

  return (
    <Pagina>
      <Cabecalho
        titulo="Painel RH"
        descricao="Central inteligente para gestão de pessoas com automações em tempo real."
        acoes={<>
          <Campo>
            <CalendarDays size={14} />
            <input type="month" value={comp} onChange={e => setComp(e.target.value)}
              className="bg-transparent outline-none" style={{ color: TOM.texto, colorScheme: 'dark' }} />
          </Campo>
          <Campo className="cursor-default"><SlidersHorizontal size={14} /> Filtros</Campo>
        </>}
      />

      {/* ── Oito indicadores ──────────────────────────────── */}
      <Indicadores colunas={8}>
        <Indicador icone={Users} tom="ciano" titulo="Colaboradores ativos" valor={c.colaboradores_ativos}
          rodape={`${c.admissoes_no_mes ?? 0} este mês`} />
        <Indicador icone={UserPlus} tom="violeta" titulo="Admissões pendentes" valor={c.admissoes_pendentes}
          rodape={c.admissoes_aguardando_aprovacao ? `${c.admissoes_aguardando_aprovacao} aguardando aprovação` : null}
          rodapeTom="violeta" />
        <Indicador icone={FileWarning} tom="ambar" titulo="Documentos pendentes" valor={c.documentos_pendentes}
          rodape={c.documentos_criticos ? `${c.documentos_criticos} críticos` : null} rodapeTom="vermelho" />
        <Indicador icone={HeartPulse} tom="rosa" titulo="Afastamentos ativos" valor={c.afastamentos_ativos}
          rodape={c.afastamentos_ate_15_dias ? `${c.afastamentos_ate_15_dias} até 15 dias` : null} />
        <Indicador icone={Umbrella} tom="verde" titulo="Férias programadas" valor={c.ferias_programadas}
          rodape={c.ferias_proximos_30 ? `${c.ferias_proximos_30} nos próximos 30 dias` : null} />
        <Indicador icone={Wallet} tom="verde" titulo="Folha do mês" valor={brlCurto(c.folha_prevista)}
          rodape={`Prevista · ${comp.split('-').reverse().join('/')}`} />
        <Indicador icone={CloudUpload} tom="azul" titulo="Eventos eSocial" valor={c.esocial_pendentes}
          rodape={c.esocial_total ? `${c.esocial_total} no total` : 'nenhum gerado'} />
        <Indicador icone={AlertTriangle} tom="vermelho" titulo="Ocorrências abertas" valor={c.ocorrencias_abertas}
          rodape={c.ocorrencias_urgentes ? `${c.ocorrencias_urgentes} urgentes` : null} rodapeTom="vermelho" />
      </Indicadores>

      <div className="grid xl:grid-cols-4 gap-3">
        {/* ── Coluna principal ────────────────────────────── */}
        <div className="xl:col-span-3 space-y-3">

          <div className="grid lg:grid-cols-2 gap-3">
            <Bloco titulo="Evolução do quadro de colaboradores"
              descricao="Últimos 12 meses, contando admissões e desligamentos reais.">
              <div style={{ height: 210 }}><Line data={evolucao} options={eixos} /></div>
            </Bloco>

            <Bloco titulo="Admissões × Desligamentos" descricao={`Ano de ${comp.slice(0, 4)}.`}>
              <div className="flex gap-3">
                <div className="flex-1 min-w-0" style={{ height: 210 }}>
                  <Bar data={admDes} options={eixos} />
                </div>
                <div className="w-24 shrink-0 flex flex-col justify-center gap-3 text-right">
                  <div>
                    <p className="text-[26px] font-semibold leading-none"
                      style={{ color: saldo >= 0 ? TOM.verde : TOM.vermelho }}>
                      {saldo >= 0 ? '+' : ''}{saldo}
                    </p>
                    <p className="text-[10.5px] leading-tight" style={{ color: TOM.texto3 }}>
                      Saldo de {comp.split('-').reverse().join('/')}
                    </p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold leading-none" style={{ color: TOM.verde }}>{totalAdm}</p>
                    <p className="text-[10.5px]" style={{ color: TOM.texto3 }}>Admissões</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold leading-none" style={{ color: TOM.rosa }}>{totalDes}</p>
                    <p className="text-[10.5px]" style={{ color: TOM.texto3 }}>Desligamentos</p>
                  </div>
                </div>
              </div>
            </Bloco>
          </div>

          <div className="grid lg:grid-cols-3 gap-3">
            <Bloco titulo="Pendências automáticas" icone={Sparkles} tomIcone="violeta"
              descricao="Nascem dos módulos — ninguém digita esta lista."
              rodape="Ver todas as pendências" aoClicarRodape={() => nav('/hr/ocorrencias')}>
              {!(data?.pendencias || []).length ? (
                <p className="text-[12.5px] py-6 text-center" style={{ color: TOM.texto3 }}>
                  Nada pendente no momento.
                </p>
              ) : data.pendencias.slice(0, 5).map((p, i) => (
                <ItemLista key={i} icone={FileCheck2} tom={TOM_PRIORIDADE[p.prioridade] || 'azul'}
                  titulo={p.titulo} aoClicar={() => p.destino && nav(p.destino)}
                  direita={<div className="flex items-center gap-2">
                    <span className="text-[13px] font-medium tabular-nums" style={{ color: TOM.texto }}>{p.qtd}</span>
                    <Pilula tom={TOM_PRIORIDADE[p.prioridade] || 'cinza'}>{p.prioridade}</Pilula>
                  </div>} />
              ))}
            </Bloco>

            <Bloco titulo="Próximos vencimentos" icone={CalendarClock} tomIcone="ciano"
              descricao="Só documentos COM validade — contrato indeterminado não vence."
              rodape="Ver todos os vencimentos" aoClicarRodape={() => nav('/hr/documentos')}>
              {!(data?.vencimentos || []).length ? (
                <p className="text-[12.5px] py-6 text-center" style={{ color: TOM.texto3 }}>
                  Nenhum vencimento à vista.
                </p>
              ) : data.vencimentos.slice(0, 5).map((v, i) => (
                <ItemLista key={i} icone={Stethoscope} tom={v.vencido ? 'vermelho' : 'ambar'}
                  titulo={v.titulo} sub={v.detalhe}
                  direita={<Pilula tom={v.vencido ? 'vermelho' : 'ambar'}>
                    {v.vencido ? `venceu ${dBR(v.data)}` : `até ${dBR(v.data)}`}
                  </Pilula>} />
              ))}
            </Bloco>

            <Bloco titulo="Monitor do dia" icone={Activity} tomIcone="verde"
              descricao={m.escalados ? `${m.escalados} pessoa(s) escalada(s) hoje.` : 'Ninguém escalado hoje.'}
              rodape="Acessar Jornada / Ponto" aoClicarRodape={() => nav('/hr/ponto')}>
              <ItemLista icone={Users} tom="ciano" titulo="Marcação de ponto" sub="hoje"
                direita={<span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium tabular-nums" style={{ color: TOM.texto }}>{m.presentes ?? 0}</span>
                  <span className="text-[11px]" style={{ color: TOM.verde }}>{pctTxt(m.presentes_pct)}</span>
                </span>} />
              <ItemLista icone={Clock} tom="ambar" titulo="Atrasos hoje"
                direita={<span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium tabular-nums" style={{ color: TOM.texto }}>{m.atrasos ?? 0}</span>
                  <span className="text-[11px]" style={{ color: TOM.ambar }}>{pctTxt(m.atrasos_pct)}</span>
                </span>} />
              <ItemLista icone={AlertTriangle} tom="vermelho" titulo="Faltas hoje"
                direita={<span className="flex items-center gap-2">
                  <span className="text-[13px] font-medium tabular-nums" style={{ color: TOM.texto }}>{m.faltas ?? 0}</span>
                  <span className="text-[11px]" style={{ color: TOM.vermelho }}>{pctTxt(m.faltas_pct)}</span>
                </span>} />
              <ItemLista icone={FileWarning} tom="violeta" titulo="Justificativas" sub="aguardando análise"
                direita={<span className="text-[13px] font-medium tabular-nums" style={{ color: TOM.texto }}>
                  {m.justificativas_pendentes ?? 0}
                </span>} />
            </Bloco>
          </div>

          {/* ── Eficiência da operação ───────────────────── */}
          <Bloco titulo="Eficiência da operação de RH" icone={Sparkles} tomIcone="violeta"
            descricao="A automação trabalhando por você — medida, não estimada.">
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 pt-1">
              {(aut.eficiencia || []).map((e, i) => (
                <div key={i}>
                  <p className="text-[11.5px] leading-tight mb-1" style={{ color: TOM.texto2 }}>{e.rotulo}</p>
                  <p className="text-[24px] font-semibold leading-none"
                    style={{ color: e.valor == null ? TOM.texto3 : TOM.verde }}>
                    {e.valor == null ? '—' : `${e.valor}%`}
                  </p>
                  <p className="text-[10.5px] mt-0.5" style={{ color: TOM.texto3 }}>{e.sub}</p>
                </div>
              ))}
            </div>
          </Bloco>

          {/* ── Faixa da automação ───────────────────────── */}
          <div className="rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3"
            style={{ background: TOM.cartao, border: `1px solid ${TOM.borda}` }}>
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: cor('violeta').bg, color: cor('violeta').fg }}>
                <Sparkles size={16} />
              </span>
              <p className="text-[13px]" style={{ color: TOM.texto2 }}>
                {(aut.status || []).some(x => x.ativo)
                  ? 'Automação ativa: validando, notificando e integrando em tempo real.'
                  : 'Nenhuma automação disparou ainda — configure ponto, WhatsApp e eSocial para ligá-las.'}
              </p>
            </div>
            <LinkSeta onClick={() => nav('/settings')}>Acessar configurações</LinkSeta>
          </div>
        </div>

        {/* ── Coluna da direita ───────────────────────────── */}
        <div className="space-y-3">
          <Bloco titulo="Resumo do RH" rodape="Ver estrutura completa" aoClicarRodape={() => nav('/hr/estrutura')}>
            <ItemResumo rotulo="Colaboradores ativos" valor={r.colaboradores_ativos} />
            <ItemResumo rotulo="Colaboradores totais" valor={r.colaboradores_totais} />
            <ItemResumo rotulo="Admissões (mês)" valor={r.admissoes_mes} />
            <ItemResumo rotulo="Desligamentos (mês)" valor={r.desligamentos_mes} />
            <ItemResumo rotulo="Turnover (12 meses)"
              valor={r.turnover_12m == null ? '—' : `${r.turnover_12m}%`} />
            <ItemResumo rotulo="Afastamentos ativos" valor={r.afastamentos_ativos} />
            <ItemResumo rotulo="Férias programadas" valor={r.ferias_programadas} />
          </Bloco>

          <Bloco titulo="Checklist do mês">
            <div className="flex items-center gap-4">
              <Medidor valor={aut.checklist_pct ?? 0} tamanho={86} espessura={8}
                tom={(aut.checklist_pct ?? 0) === 100 ? 'verde' : 'azul'} sub="concluído" />
              <div className="flex-1 min-w-0">
                {(aut.checklist || []).map((x, i) => (
                  <ItemCheck key={i} ok={x.ok} titulo={x.item} />
                ))}
              </div>
            </div>
            {!!(aut.checklist || []).some(x => !x.ok) && (
              <p className="text-[11px] mt-2" style={{ color: TOM.texto3 }}>
                {(aut.checklist || []).filter(x => !x.ok).map(x => x.detalhe).filter(Boolean).join(' · ')}
              </p>
            )}
          </Bloco>

          <Bloco titulo="Status da automação">
            <div className="flex items-center gap-4">
              <Medidor
                valor={Math.round(((aut.status || []).filter(x => x.ativo).length / ((aut.status || []).length || 1)) * 100)}
                tamanho={86} espessura={8} tom="verde" />
              <div className="flex-1 min-w-0">
                {(aut.status || []).map((x, i) => (
                  <div key={i} className="flex items-center gap-2 py-1">
                    <span className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: x.ativo ? TOM.verde : TOM.texto3 }} />
                    <span className="text-[11.5px] flex-1 truncate" style={{ color: TOM.texto2 }}>{x.rotulo}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-2 space-y-0.5">
              {(aut.status || []).map((x, i) => (
                <p key={i} className="text-[10.5px]" style={{ color: TOM.texto3 }}>
                  {x.rotulo}: {x.detalhe}
                </p>
              ))}
            </div>
          </Bloco>
        </div>
      </div>

      {!!(data?.avisos || []).length && (
        <div className="mt-3 rounded-xl px-4 py-3" style={{ background: TOM.cartao, border: `1px solid ${cor('ambar').bd}` }}>
          {data.avisos.map((a, i) => (
            <p key={i} className="text-[12px]" style={{ color: TOM.texto2 }}>{a}</p>
          ))}
        </div>
      )}
    </Pagina>
  );
}
