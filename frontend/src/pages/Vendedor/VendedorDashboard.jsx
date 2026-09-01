// ============================================================
// TELA 1 — Dashboard do Vendedor
//
// Painel de desempenho de quem vende: quanto falta para a meta, o que
// já virou comissão, quem compra, o que sai e para quem ligar hoje.
// Tudo em UNIDADES (a meta é "15.000 copos"), com reais aparecendo só
// no faturamento, no preço médio e na comissão.
//
// As três outras telas saem daqui: "Ver ranking 1º ao 8º" abre a Tela 2,
// o olhinho da carteira abre a Tela 3 e ambas levam à Tela 4 (oferta).
// ============================================================
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend,
} from 'chart.js';
import {
  Target, ShoppingCart, DollarSign, TrendingUp, Minus, ArrowUp, CircleDollarSign,
  MapPin, Calendar, Eye, ChevronRight, Star, Lock, Unlock, RefreshCw, Settings,
  ClipboardList,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useVend, Panel, Kpi, MigracaoPendente, corUf, coresDosVendedores, Trofeu, fmtBRL, fmtUn, fmtPct, MESES, UF_NOME, regioesDasUfs } from './ui';
import BrasilMap, { UF_LIST } from './BrasilMap';
import RankingProdutosModal from './RankingProdutosModal';
import CarteiraClientesModal from './CarteiraClientesModal';
import CriarOfertaModal from './CriarOfertaModal';
import EnviosModal from './EnviosModal';
import CidadesUfModal from './CidadesUfModal';
import DistribuirEstadosModal from './DistribuirEstadosModal';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);


// Cor conhecida → bolinha correspondente. O que não estiver aqui vira
// cinza: melhor uma bolinha neutra do que adivinhar errado.
const COR_HEX = {
  'BRANCO':'#ffffff', 'PRETO':'#111111', 'DOURADO':'#d4af37', 'PRATA':'#c0c0c0',
  'AZUL':'#2563eb', 'VERMELHO':'#dc2626', 'VERDE':'#16a34a', 'AMARELO':'#facc15',
  'ROSA':'#ec4899', 'ROXO':'#7c3aed', 'LARANJA':'#f97316', 'MARROM':'#78350f',
  'CINZA':'#9ca3af', 'BEGE':'#e7d8b1', 'TRANSPARENTE':'#e5e7eb', 'CRISTAL':'#e5e7eb',
};
const corHex = nome => COR_HEX[String(nome || '').toUpperCase().trim()] || '#9ca3af';

// Últimos 24 meses para o seletor de período
function mesesDisponiveis() {
  const out = [];
  const d = new Date();
  for (let i = 0; i < 24; i++) {
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
               label: `${MESES[d.getMonth()]} de ${d.getFullYear()}` });
    d.setMonth(d.getMonth() - 1);
  }
  return out;
}

export default function VendedorDashboard() {
  const v = useVend();
  const { user } = useAuth();
  const gestor = ['admin', 'manager'].includes(user?.role);

  const meses = useMemo(mesesDisponiveis, []);
  const [mes, setMes] = useState(meses[0].key);
  const [sellerId, setSellerId] = useState('');

  const [ranking, setRanking]   = useState(false);
  const [carteira, setCarteira] = useState(false);
  const [oferta, setOferta]     = useState(null);  // { customers, product }
  const [envios, setEnvios]     = useState(false);

  const qs = `month=${mes}${sellerId ? `&user_id=${sellerId}` : ''}`;

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['vendedor-dashboard', mes, sellerId],
    queryFn: () => api.get(`/vendedor/dashboard?${qs}`),
    refetchInterval: 120000,
  });

  // Lista de vendedores — só o gestor troca de painel
  const { data: vendedores } = useQuery({
    queryKey: ['vendedor-lista'],
    queryFn: () => api.get('/vendedor/vendedores'),
    enabled: gestor,
  });

  const k        = data?.kpis || {};
  const plano    = data?.plan;
  const ciclo    = data?.cycle || { streak: 0, total: 3, unlocked: false };
  const estados  = data?.states || [];
  const lider    = data?.leader_state;
  const semanas  = data?.weekly || [];
  const topProd  = data?.top_product;
  const cores    = data?.colors || [];
  const carteiraPrev = data?.carteira || [];
  const territorio = data?.seller?.territory || [];

  // A COBERTURA DA EQUIPE. So vem preenchida no "Meu painel" de gestor -
  // escolher um vendedor no seletor devolve o mapa ao territorio dele,
  // que e o que se quer olhar quando se esta olhando UMA pessoa.
  const cobertura = data?.seller?.cobertura || null;

  // QUEM ESTA SENDO OLHADO AGORA. Sem isto a legenda do territorio
  // mostrava o PRIMEIRO responsavel do estado — abrindo o painel da
  // Renata, o Rio Grande do Sul aparecia com o rosto e o nome do
  // Administrador, que tambem atende RS. A pessoa procurava a si mesma
  // na propria tela e achava outro.
  const focoId = sellerId || user?.id || null;

  // O QUE O CHIP DE REGIAO DIZ.
  //
  // No "Meu painel" de um gestor, o painel ja mostra o pais inteiro
  // dividido entre a equipe — e o chip continuava anunciando "Regiao
  // atendida: REGIAO SUL", que e o territorio pessoal de quem esta
  // logado. Duas afirmacoes contraditorias na mesma tela, e a de cima
  // e a errada: olhando o painel do gestor, a regiao atendida e a da
  // EQUIPE, nao a dele.
  //
  // Com um vendedor escolhido no seletor, volta a ser o territorio
  // daquela pessoa — que e o que se quer ler ao olhar para ela.
  const regiaoDoTopo = useMemo(() => {
    // O CHIP FALA EM REGIAO, NAO EM SIGLA NEM EM CONTAGEM.
    //
    // Ja disse "Regiao atendida: RIO GRANDE DO SUL" e ja disse "Regioes
    // da equipe: 4 estados — PR RS SE TO". A segunda ainda fazia o
    // leitor contar as etiquetas do painel ao lado e achar CINCO: RS
    // aparece duas vezes la, uma por vendedor que atende. Dois numeros
    // certos contando coisas diferentes e a pior especie de numero
    // errado.
    //
    // Quem atende Rio Grande do Sul e Bahia atende "Sul e Nordeste", e
    // e assim que se fala disso na empresa. Sigla e contagem vivem no
    // painel de cobertura logo abaixo, que e o lugar delas.
    if (cobertura) {
      const ufs = Object.keys(cobertura).filter(uf => (cobertura[uf] || []).length);
      const regioes = regioesDasUfs(ufs);
      return regioes.length
        ? `Regiões da equipe: ${regioes.join(' · ')}`
        : 'Nenhum estado com vendedor';
    }
    const regioes = regioesDasUfs(territorio);
    // `region_label` e escrito a mao no cadastro e so vale quando nao ha
    // territorio de onde deduzir — dado digitado envelhece, o territorio
    // nao.
    const propria = regioes.length ? regioes.join(' / ') : data?.seller?.region_label;
    return `Região atendida: ${propria || 'não definida'}`;
  }, [cobertura, data?.seller?.region_label, territorio]);
  const coresVend = useMemo(() => coresDosVendedores(cobertura), [cobertura]);

  // A legenda que o mapa colorido exige para ser lido: quem e cada cor e
  // ate onde ela vai. Um mapa de catorze tons sem legenda e decoracao.
  const equipe = useMemo(() => {
    if (!cobertura) return [];
    const por = new Map();
    for (const [uf, donos] of Object.entries(cobertura)) {
      for (const d of donos || []) {
        if (!por.has(d.user_id)) por.set(d.user_id, { ...d, ufs: [] });
        por.get(d.user_id).ufs.push(uf);
      }
    }
    return [...por.values()]
      .map(x => ({ ...x, ufs: x.ufs.sort() }))
      .sort((a, b) => b.ufs.length - a.ufs.length || a.name.localeCompare(b.name, 'pt-BR'));
  }, [cobertura]);

  const semDono = cobertura ? UF_LIST.filter(uf => !(cobertura[uf] || []).length) : [];
  const [distribuir, setDistribuir] = useState(false);

  // { PR: 12, SC: 0 } — quantos compradores únicos por UF. O mapa e a
  // lista leem daqui: é o que decide se o estado sai preenchido ou só
  // contornado, e os dois nunca discordarem entre si depende de a conta
  // ser feita num lugar só.
  const compradores = useMemo(
    () => Object.fromEntries(estados.map(e => [e.uf, e.buyers])),
    [estados],
  );

  // Qual UF está com a tela de cidades aberta.
  const [cidadesUf, setCidadesUf] = useState(null);

  const batida = k.goal > 0 && k.units >= k.goal;

  const barData = {
    labels: semanas.map(s => s.label),
    datasets: [{
      label: 'Unidades vendidas',
      data: semanas.map(s => s.units),
      backgroundColor: '#2563eb',
      borderRadius: 3,
      maxBarThickness: 46,
    }],
  };
  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'bottom',
        labels: { boxWidth: 10, font: { size: 10 }, color: v.textMuted } },
      tooltip: { callbacks: { label: c => `${fmtUn(c.raw)} un` } },
    },
    scales: {
      y: { beginAtZero: true, ticks: { font: { size: 10 }, color: v.textSubtle, callback: fmtUn },
           grid: { color: v.divider }, border: { display: false } },
      x: { ticks: { font: { size: 10 }, color: v.textSubtle }, grid: { display: false },
           border: { display: false } },
    },
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ ...v.card, padding: '2rem' }} className="text-center">
        <p className="font-semibold" style={{ color: v.textPrimary }}>Não foi possível carregar o painel</p>
        <p className="text-sm mt-1" style={{ color: v.textMuted }}>{error.error || error.message}</p>
        <button onClick={() => refetch()} className="btn-secondary mt-4 mx-auto"><RefreshCw size={14} /> Tentar de novo</button>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Cabeçalho ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Dashboard do Vendedor</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            {plano ? `${plano.name} — meta de ${fmtUn(plano.monthly_goal)} un` : 'Sem plano de meta configurado'}
            {' | '}{data?.seller?.name}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {gestor && (
            <select value={sellerId} onChange={e => setSellerId(e.target.value)} style={v.control} title="Vendedor">
              <option value="">Meu painel</option>
              {(vendedores || []).map(s => (
                <option key={s.user_id} value={s.user_id}>{s.name}</option>
              ))}
            </select>
          )}
          <div className="flex items-center gap-2 px-3 py-2 rounded-[0.6rem]"
            style={{ background: v.control.background, border: v.control.border }}>
            <MapPin size={14} style={{ color: v.textMuted }} />
            <span className="text-sm" style={{ color: v.textPrimary }}>
              {regiaoDoTopo}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar size={14} style={{ color: v.textMuted }} className="hidden sm:block" />
            <select value={mes} onChange={e => setMes(e.target.value)} style={v.control} title="Mês de referência">
              {meses.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          </div>
          {/* "Envios" e "Administrar" saíram daqui. Este painel é do
              VENDEDOR olhando o próprio mês — configuração de meta não
              mora na tela de quem é medido por ela. A meta e a comissão
              agora saem do cadastro do colaborador, que já é de onde a
              folha as lê: um lugar só, e não dois que podem discordar. */}
        </div>
      </div>

      {data?.setup_pending && <MigracaoPendente />}

      {/* ── Indicadores ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Meta do mês (unidades)" Icon={Target} color="#3b82f6" iconBg="rgba(59,130,246,0.15)"
          value={fmtUn(k.goal)} unit="un"
          hint="Definida pelo Administrativo no plano de metas do vendedor. O vendedor não digita este número." />
        <Kpi title="Vendido no mês" Icon={ShoppingCart} color="#22c55e" iconBg="rgba(34,197,94,0.15)"
          value={fmtUn(k.units)} unit="un"
          hint="Soma das unidades dos pedidos válidos do vendedor no mês. Orçamento que ainda não virou venda não entra." />
        <Kpi title="Preço médio (un.)" Icon={DollarSign} color="#22d3ee" iconBg="rgba(34,211,238,0.15)"
          value={fmtBRL(k.avg_price)}
          hint="Faturamento dos produtos ÷ unidades vendidas. O frete fica de fora para não distorcer o preço do produto." />
        <Kpi title="Faturamento do mês" Icon={TrendingUp} color="#22d3ee" iconBg="rgba(34,211,238,0.15)"
          value={fmtBRL(k.revenue)}
          hint="Valor dos produtos dos pedidos válidos. O frete é guardado à parte no pedido e não entra aqui." />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <Kpi title="Atingimento da meta" Icon={TrendingUp} color="#a78bfa" iconBg="rgba(167,139,250,0.15)"
          value={k.achievement == null ? '—' : fmtPct(k.achievement)}
          hint="Vendido ÷ meta × 100. Pode passar de 100%." />
        <Kpi title="Faltam para a meta" Icon={Minus} color="#f59e0b" iconBg="rgba(245,158,11,0.15)"
          value={fmtUn(k.missing)} unit="un"
          hint="Meta − vendido. Bateu ou passou da meta, mostra 0." />
        <Kpi title="Excedente do mês" Icon={ArrowUp} color="#4ade80" iconBg="rgba(74,222,128,0.15)"
          value={fmtUn(k.surplus)} unit="un"
          hint="Vendido − meta, só quando o vendido passou da meta." />
        <Kpi title="Comissão sobre excedente" Icon={CircleDollarSign} color="#c084fc" iconBg="rgba(192,132,252,0.15)"
          value={fmtBRL(k.commission_value)}
          hint={`${fmtPct(k.commission_pct)} sobre os pedidos que entraram DEPOIS de a meta ser batida — não sobre todo o faturamento. Nenhum pedido depois da meta, comissão zero.`} />
      </div>

      {/* ── Estados / Plano / Território ───────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">

        <Panel title="Estados que mais compram"
          hint="Conta CLIENTES DIFERENTES que compraram no período, não unidades: cinco pedidos do mesmo cliente continuam sendo 1 comprador. Cada estado tem a sua cor, a mesma do mapa. Estado do seu território que ainda não vendeu aparece com a barra vazia — é onde há o que fazer. O olho abre as cidades do estado.">
          {estados.length === 0 ? (
            <p className="text-sm py-6 text-center" style={{ color: v.empty }}>
              Nenhuma compra no mês e nenhum estado no território.
            </p>
          ) : (
            <>
              <div className="space-y-3 overflow-auto" style={{ maxHeight: 268 }}>
                {estados.map(e => {
                  // A barra é proporcional ao líder, não ao total: com um
                  // estado forte e cinco fracos, dividir pelo total deixaria
                  // os cinco em fiapos indistintos.
                  const max = estados[0].buyers || 1;
                  const comprou = e.buyers > 0;
                  const cor = corUf(e.uf, comprou);
                  return (
                    <div key={e.uf} className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0"
                        style={comprou
                          ? { background: cor.base, color: '#0b1020' }
                          : { border: `1px solid ${cor.stroke}`, color: cor.text }}>
                        {e.position ?? '–'}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm truncate" style={{ color: comprou ? v.textPrimary : v.textMuted }}>
                            {UF_NOME[e.uf] || e.uf}
                          </p>
                          <button onClick={() => setCidadesUf(e.uf)}
                            title={`Ver as cidades de ${UF_NOME[e.uf] || e.uf}`}
                            className="p-0.5 rounded hover:opacity-70 shrink-0" style={{ color: cor.text }}>
                            <Eye size={13} />
                          </button>
                        </div>
                        <div className="h-1.5 rounded-full mt-1"
                          style={{ background: v.divider, border: comprou ? 'none' : `1px solid ${cor.stroke}` }}>
                          {comprou && (
                            <div className="h-full rounded-full"
                              style={{ width: `${(e.buyers / max) * 100}%`, background: cor.base }} />
                          )}
                        </div>
                      </div>

                      <span className="text-xs shrink-0 text-right" style={{ color: cor.text }}>
                        {comprou ? `${fmtUn(e.buyers)} compradores` : 'sem compras'}
                      </span>
                    </div>
                  );
                })}
              </div>
              {lider && (
                <div className="mt-4 py-2 rounded-lg flex items-center justify-center gap-2 text-sm font-bold"
                  style={{ border: `1px solid ${corUf(lider).stroke}`, color: corUf(lider).text }}>
                  <Star size={15} /> ESTADO LÍDER: {(UF_NOME[lider] || lider).toUpperCase()}
                </div>
              )}
            </>
          )}
        </Panel>

        <Panel title="Plano de meta atual"
          hint="A regra que o vendedor está cumprindo neste mês, vinda do plano cadastrado pelo Administrativo.">
          {!plano ? (
            <p className="text-sm py-6 text-center" style={{ color: v.empty }}>
              Nenhuma faixa cobre este mês. A meta é configurada no cadastro do colaborador.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              <Linha label="Faixa atual"            valor={plano.name} cor="#a78bfa" />
              <Linha label="Meta vigente"           valor={`${fmtUn(plano.monthly_goal)} un`} cor={v.textPrimary} />
              <Linha label="Comissão sobre excedente" valor={fmtPct(plano.commission_pct)} cor="#22d3ee" />
              <Linha label="Bônus por ciclo"        valor={fmtBRL(plano.cycle_bonus)} cor="#f472b6" />
              <Linha label="Situação do bônus"      valor={ciclo.unlocked ? 'Desbloqueado' : 'Bloqueado'}
                cor={ciclo.unlocked ? '#4ade80' : '#f87171'} />
              <Linha label="Progresso do ciclo"     valor={`${ciclo.streak}/${ciclo.total} meses`} cor="#f472b6" />

              <div className="mt-3 px-3 py-2 rounded-lg flex items-center gap-2 text-[11px] font-semibold"
                style={ciclo.unlocked
                  ? { border: '1px solid rgba(34,197,94,0.5)', color: '#4ade80' }
                  : { border: '1px solid rgba(248,113,113,0.5)', color: '#f87171' }}>
                {ciclo.unlocked ? <Unlock size={13} /> : <Lock size={13} />}
                {ciclo.unlocked
                  ? `CICLO COMPLETO — BÔNUS DE ${fmtBRL(plano.cycle_bonus).toUpperCase()} LIBERADO`
                  : batida
                    ? `META BATIDA — FALTAM ${ciclo.total - ciclo.streak} MÊS(ES) PARA DESBLOQUEAR O BÔNUS`
                    : 'META DO MÊS AINDA NÃO BATIDA — O CICLO SÓ ANDA COM A META CUMPRIDA'}
              </div>
              <p className="text-[10px] leading-relaxed" style={{ color: v.textSubtle }}>
                Falhar um mês zera o ciclo: ele não fica guardado e recomeça em 1/{ciclo.total}.
              </p>
            </div>
          )}
        </Panel>

        {/* DOIS MAPAS, UM LUGAR.
            No "Meu painel" de gestor ele mostra a COBERTURA: o pais
            dividido entre os vendedores, uma cor por pessoa, e o estado
            sem ninguem apagado - buraco de cobertura nao aparece numa
            lista, aparece no vazio entre as manchas.
            Escolhendo um vendedor no seletor, volta a ser o territorio
            DELE, com o preenchido marcando onde houve compra. */}
        <Panel title={cobertura ? 'Cobertura da equipe' : 'Território atendido'}
          hint={cobertura
            ? 'O pais dividido entre os vendedores: cada cor e uma pessoa, e o estado apagado nao tem ninguem atendendo. Escolha um vendedor no seletor do topo para ver o territorio dele com as compras do periodo. Clique no estado ou no olho para ver as cidades.'
            : 'Definido pelo Administrativo no cadastro do vendedor — o vendedor não altera. Cada estado tem a sua cor, a mesma da lista ao lado; o estado preenchido é o que teve compra no período, o só contornado é o que está zerado. Clique no estado ou no olho para ver as cidades.'}>
          <div className="grid grid-cols-2 gap-3 items-center">
            <BrasilMap territory={territorio} buyers={compradores} height={190}
              cobertura={cobertura} cores={coresVend} onSelect={setCidadesUf} />
            <div className="space-y-2 overflow-auto" style={{ maxHeight: 190 }}>
              {cobertura ? (
                <>
                  {equipe.map(pes => (
                    <LinhaDoVendedor key={pes.user_id} p={pes} v={v} cor={coresVend[pes.user_id]}
                      onVerCidades={setCidadesUf} />
                  ))}
                  {equipe.length === 0 && (
                    <p className="text-xs" style={{ color: v.empty }}>
                      Nenhum vendedor com territorio definido.
                    </p>
                  )}
                  {/* MOSTRAR O BURACO E NAO OFERECER A PA E MEIO CAMINHO:
                      a linha que conta os estados orfaos e o botao que
                      resolve. */}
                  <button onClick={() => setDistribuir(true)}
                    className="w-full text-left text-[11px] pt-1 rounded px-1.5 py-1 hover:opacity-80"
                    style={{ background: semDono.length ? 'rgba(251,191,36,0.10)' : 'transparent',
                             color: v.textSubtle }}>
                    {semDono.length > 0 ? (
                      <>
                        <b style={{ color: '#fbbf24' }}>{semDono.length}</b> estado(s) sem vendedor:{' '}
                        {semDono.join(' ')} — <b style={{ color: '#60a5fa' }}>distribuir</b>
                      </>
                    ) : (
                      <b style={{ color: '#60a5fa' }}>Rever a distribuicao dos estados</b>
                    )}
                  </button>
                </>
              ) : territorio.length === 0 ? (
                <p className="text-xs" style={{ color: v.empty }}>
                  Nenhuma UF definida. O território é configurado no cadastro do colaborador.
                </p>
              ) : territorio.map(uf => (
                <LinhaDoEstado key={uf} uf={uf} v={v}
                  comprou={(compradores[uf] || 0) > 0}
                  compradores={compradores[uf] || 0}
                  responsaveis={data?.seller?.responsaveis?.[uf] || []}
                  focoId={focoId}
                  onVerCidades={() => setCidadesUf(uf)} />
              ))}
            </div>
          </div>
        </Panel>
      </div>

      {/* ── Semana / Produto líder / Cores / Carteira ──────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">

        <Panel title="Vendas por semana (unidades)"
          hint="As barras somam exatamente o vendido no mês. A semana vai de segunda a domingo, recortada nas bordas do mês.">
          <div style={{ height: 190 }}>
            {semanas.some(s => s.units > 0)
              ? <Bar data={barData} options={barOptions} />
              : <div className="flex items-center justify-center h-full text-sm" style={{ color: v.empty }}>Sem vendas no mês</div>}
          </div>
        </Panel>

        <Panel title="Produto líder do mês"
          hint="A linha de produto com maior quantidade vendida no mês: categoria e volume juntos, do jeito que quem vende fala — twister 550, long drink 350 — somando todas as cores.">
          {!topProd ? (
            <p className="text-sm py-8 text-center" style={{ color: v.empty }}>Nenhum produto vendido</p>
          ) : (
            <div className="flex flex-col items-center text-center gap-1">
              <Trofeu size={46} />
              <p className="text-base font-bold mt-1" style={{ color: '#f59e0b' }}>{topProd.name}</p>
              <p className="text-xl font-bold" style={{ color: '#60a5fa' }}>
                {fmtUn(topProd.units)} <span className="text-xs font-semibold">un vendidas</span>
              </p>
              <p className="text-xs" style={{ color: v.textMuted }}>
                {fmtPct(topProd.share)} de participação · ticket {fmtBRL(topProd.units > 0 ? topProd.revenue / topProd.units : 0)}
              </p>
              <button onClick={() => setRanking(true)}
                className="btn-primary btn-sm w-full mt-3 justify-between">
                Ver ranking 1º ao 8º <ChevronRight size={14} />
              </button>
            </div>
          )}
        </Panel>

        <Panel title="Cores de personalização mais vendidas"
          hint="Unidades por cor, com a linha de tinta (PP e PS) contada separadamente — uma nunca soma na outra.">
          {cores.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: v.empty }}>Nenhuma cor registrada nos pedidos</p>
          ) : (
            <div className="space-y-3">
              {cores.map(linha => (
                <div key={linha.line}>
                  <p className="text-xs font-semibold mb-1.5" style={{ color: '#60a5fa' }}>
                    {linha.line === 'OUTRAS' ? 'Sem linha definida' : `Linha ${linha.line}`}
                  </p>
                  <div className="space-y-1.5">
                    {linha.colors.slice(0, 3).map(c => (
                      <div key={c.color} className="flex items-center gap-2">
                        <span className="w-4 h-4 rounded-full shrink-0"
                          style={{ background: corHex(c.color), border: '1px solid rgba(255,255,255,0.35)' }} />
                        <span className="text-xs truncate flex-1" style={{ color: v.textPrimary }}>{c.color}</span>
                        <span className="text-[11px] shrink-0" style={{ color: v.textMuted }}>{fmtUn(c.units)} un</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Carteira de clientes"
          hint="Os clientes que mais compraram com este vendedor. O olho abre a lista completa, com filtros e criação de oferta."
          right={
            <button onClick={() => setCarteira(true)} title="Abrir carteira de clientes"
              className="shrink-0 p-1 rounded-lg hover:opacity-80" style={{ color: '#60a5fa' }}>
              <Eye size={17} />
            </button>
          }>
          {carteiraPrev.length === 0 ? (
            <p className="text-sm py-8 text-center" style={{ color: v.empty }}>Nenhum cliente comprou no mês</p>
          ) : (
            <>
              <ol className="space-y-1.5">
                {carteiraPrev.slice(0, 5).map((c, i) => (
                  <li key={c.customer_id} className="flex items-center gap-2 text-sm">
                    <span className="w-4 text-right shrink-0" style={{ color: v.textSubtle }}>{i + 1}</span>
                    <span className="truncate flex-1" style={{ color: v.textPrimary }}>{c.name}</span>
                    <span className="text-[11px] shrink-0" style={{ color: v.textMuted }}>{fmtUn(c.units)} un</span>
                  </li>
                ))}
              </ol>
              <p className="text-[10px] mt-3 leading-relaxed" style={{ color: v.textSubtle }}>
                Clique no olho para visualizar os principais clientes e criar oferta.
              </p>
            </>
          )}
        </Panel>
      </div>

      {/* ── Rodapé ────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-3 text-[11px] pt-1" style={{ color: v.textSubtle }}>
        <span>Última atualização: {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
        <button onClick={() => refetch()} title="Atualizar agora" className="hover:opacity-70">
          <RefreshCw size={12} className={isFetching ? 'animate-spin' : ''} />
        </button>
        <span style={{ opacity: 0.5 }}>|</span>
        <span>Os dados são atualizados automaticamente.</span>
      </div>

      {/* ── Telas 2, 3 e 4 ────────────────────────────────────── */}
      <RankingProdutosModal
        open={ranking} onClose={() => setRanking(false)}
        month={mes} sellerId={sellerId}
        onCriarOferta={p => { setRanking(false); setCarteira(true); setOferta({ product: p, customers: [] }); }}
      />

      <CarteiraClientesModal
        open={carteira} onClose={() => { setCarteira(false); setOferta(null); }}
        month={mes} sellerId={sellerId}
        produtoInicial={oferta?.product || null}
        onCriarOferta={(clientes, produto) => { setCarteira(false); setOferta({ customers: clientes, product: produto }); }}
      />

      <CriarOfertaModal
        open={!!oferta?.customers?.length}
        onClose={() => setOferta(null)}
        customers={oferta?.customers || []}
        produtoSugerido={oferta?.product || null}
        sellerName={data?.seller?.name}
        onVerEnvios={() => { setOferta(null); setEnvios(true); }}
      />

      <EnviosModal open={envios} onClose={() => setEnvios(false)} sellerId={sellerId} />

      <CidadesUfModal uf={cidadesUf} onClose={() => setCidadesUf(null)} />
      <DistribuirEstadosModal aberto={distribuir} cobertura={cobertura}
        onClose={() => setDistribuir(false)} />
    </div>
  );
}

// Linha "rótulo ................ valor" do quadro do plano
// ── UMA LINHA DO TERRITÓRIO ──────────────────────────────────
//
// A bolinha era a sigla do estado. Quem abre o próprio painel já sabe
// que PR é Paraná — a sigla ali não contava nada. A pergunta que o
// gestor faz ao abrir o território é OUTRA: quem atende aqui. Agora é o
// rosto de quem atende que ocupa o círculo, e a sigla desce para um
// selo pequeno no canto, na cor do estado, para o mapa ao lado
// continuar tendo par na lista.
//
// Enquanto a foto não existe — e hoje nenhum colaborador tirou a dele —
// o círculo mostra as iniciais na cor do estado. Não é um vazio à
// espera: já é a identificação, e ela vira retrato sozinha no dia em que
// a facial for capturada na admissão.
//
// Estado sem ninguém configurado volta ao selo antigo com a sigla, e diz
// "sem responsável" em vez de fingir um rosto.
/**
 * Uma linha da legenda do mapa de cobertura: a pessoa, a cor dela e os
 * estados que ela atende.
 *
 * As siglas sao clicaveis uma a uma - e o mesmo caminho do olho, e a
 * pergunta que se faz olhando um mapa de cobertura costuma ser sobre um
 * estado especifico ("quais cidades tem no MS?"), nao sobre a pessoa.
 */
function LinhaDoVendedor({ p, v, cor, onVerCidades }) {
  return (
    <div className="flex items-start gap-2.5" title={`${p.name} atende ${p.ufs.join(', ')}`}>
      {p.avatar_url ? (
        <img src={p.avatar_url} alt={p.name} className="w-7 h-7 rounded-full object-cover shrink-0"
          style={{ border: `2px solid ${cor}` }} />
      ) : (
        <span className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
          style={{ background: `${cor}2a`, color: cor, border: `2px solid ${cor}` }}>
          {p.iniciais}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold truncate" style={{ color: v.textPrimary }}>{p.name}</p>
        <div className="flex flex-wrap gap-1 mt-0.5">
          {p.ufs.map(uf => (
            <button key={uf} onClick={() => onVerCidades(uf)}
              title={`Ver as cidades de ${uf}`}
              className="px-1.5 rounded text-[10px] font-bold leading-[15px]"
              style={{ background: `${cor}2a`, color: cor }}>
              {uf}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function LinhaDoEstado({ uf, v, comprou, compradores, responsaveis, focoId, onVerCidades }) {
  const cor = corUf(uf, comprou);
  const nome = UF_NOME[uf] || uf;

  // Quem voce esta olhando vem primeiro. Um estado pode ter mais de um
  // responsavel, e mostrar o rosto do outro no painel de alguem e
  // dizer que o territorio nao e dela.
  const lista = focoId
    ? [...responsaveis].sort((a, b) => (b.user_id === focoId) - (a.user_id === focoId))
    : responsaveis;
  const dono = lista[0] || null;
  const outros = lista.length - 1;

  const legenda = comprou ? `${compradores} comprador(es) no período` : 'sem compras no período';
  const quem = lista.length
    ? lista.map(r => r.name).join(' · ')
    : 'sem responsável definido';

  return (
    <div className="flex items-center gap-2.5" title={`${nome} — ${legenda}
Atende: ${quem}`}>
      <div className="relative shrink-0">
        {dono ? (
          dono.avatar_url ? (
            <img src={dono.avatar_url} alt={dono.name}
              className="w-8 h-8 rounded-full object-cover"
              style={{ border: `2px solid ${cor.stroke}` }} />
          ) : (
            <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
              style={{ background: cor.chip, color: cor.text, border: `2px solid ${cor.stroke}` }}>
              {dono.iniciais}
            </span>
          )
        ) : (
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{ background: cor.chip, color: cor.text, border: `1px dashed ${cor.stroke}` }}>
            {uf}
          </span>
        )}

        {/* A sigla só aparece quando o círculo virou rosto — senão ela
            estaria escrita duas vezes no mesmo lugar. */}
        {dono && (
          <span className="absolute -bottom-0.5 -right-1 px-1 rounded text-[8px] font-bold leading-[13px]"
            style={{ background: cor.base, color: '#04102e' }}>{uf}</span>
        )}

        {/* Território dividido: o segundo rosto não cabe, o número cabe. */}
        {outros > 0 && (
          <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold"
            style={{ background: v.isDark ? '#101a3d' : '#ffffff', color: v.textMuted, border: `1px solid ${v.divider}` }}>
            +{outros}
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1 leading-tight">
        <p className="text-sm truncate" style={{ color: comprou ? v.textPrimary : v.textMuted }}>{nome}</p>
        <p className="text-[11px] truncate" style={{ color: dono ? v.textSubtle : v.empty }}>
          {dono ? dono.name : 'sem responsável'}
        </p>
      </div>

      <button onClick={onVerCidades} title={`Ver as cidades de ${nome}`}
        className="p-1 rounded hover:opacity-70 shrink-0" style={{ color: cor.text }}>
        <Eye size={14} />
      </button>
    </div>
  );
}

function Linha({ label, valor, cor }) {
  const { textMuted } = useVend();
  return (
    <div className="flex items-center justify-between gap-2">
      <span style={{ color: textMuted }}>{label}:</span>
      <span className="font-semibold text-right" style={{ color: cor }}>{valor}</span>
    </div>
  );
}
