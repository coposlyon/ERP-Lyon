// ============================================================
// ESTRUTURA DA EMPRESA — O CADASTRO QUE SUSTENTA TODO O RH.
//
// Departamento, cargo, CBO, centro de custo, gestor e jornada. Parece
// burocracia; é o contrário. Enquanto isso não existiu como cadastro,
// cada tela tinha o próprio texto — "Comercial" digitado na ficha de
// um, "COMERCIAL" na de outro, "Vendas" na de um terceiro — e nenhum
// número batia entre o Painel, a Folha e o eSocial.
//
// A CONTAGEM DE PESSOAS É CONTADA, NUNCA DIGITADA. O número ao lado de
// cada setor sai do cadastro dos colaboradores. Não existe campo
// "quantidade" para alguém errar.
//
// O QUE ESTA TELA DENUNCIA. Quem está sem departamento ou sem escala
// aparece como pendência: é exatamente essa gente que faz o Painel RH
// divergir da realidade, e é melhor ver isso aqui do que descobrir no
// fechamento da folha.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Building2, Briefcase, Coins, CalendarClock, UserCog, Loader2,
  AlertTriangle, Users, ArrowRight,
} from 'lucide-react';
import api from '@/lib/api';

const hhmm = min => (min == null ? '—' : `${Math.floor(min / 60)}h${min % 60 ? String(min % 60).padStart(2, '0') : ''}`);
const semanal = e => {
  const dias = Array.isArray(e.weekdays) ? e.weekdays.length : 0;
  return dias && e.daily_minutes ? `${Math.round((dias * e.daily_minutes) / 60)}h semanais` : '—';
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

function Bloco({ titulo, descricao, children, className = '', acao }) {
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

export default function EstruturaEmpresa() {
  const { data, isLoading } = useQuery({
    queryKey: ['rh-estrutura'],
    queryFn: () => api.get('/rh/estrutura'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const deps = data?.departamentos || [];
  const cargos = data?.cargos || [];
  const centros = data?.centros_custo || [];
  const escalas = data?.escalas || [];
  const t = data?.totais || {};
  const gestores = new Set(deps.map(d => d.manager_id).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Estrutura da Empresa</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Setores, cargos, centros de custo e jornadas — a origem única que todo o RH lê.
          </p>
        </div>
        <Link to="/employees" className="btn-secondary btn-sm">
          <Users size={14} /> Colaboradores
        </Link>
      </div>

      {(data?.avisos || []).length > 0 && (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Parte da estrutura não pôde ser lida</p>
            <ul className="mt-1 space-y-0.5 text-xs">{data.avisos.map((a, i) => <li key={i}>· {a}</li>)}</ul>
            <p className="text-xs mt-1.5">Rode a migração <b>080_rh_estrutura.sql</b> para criar os cadastros.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={Building2} cor="bg-blue-100 text-blue-600" titulo="Departamentos" valor={t.departamentos} rodape="ativos" />
        <Cartao icone={Briefcase} cor="bg-violet-100 text-violet-600" titulo="Cargos" valor={t.cargos} rodape="com CBO" />
        <Cartao icone={Coins} cor="bg-amber-100 text-amber-600" titulo="Centros de custo" valor={t.centros_custo} />
        <Cartao icone={CalendarClock} cor="bg-teal-100 text-teal-600" titulo="Escalas" valor={t.escalas} rodape="jornadas vigentes" />
        <Cartao icone={UserCog} cor="bg-emerald-100 text-emerald-600" titulo="Gestores" valor={gestores} rodape="responsáveis definidos" />
        <Cartao icone={Users} cor="bg-sky-100 text-sky-600" titulo="Colaboradores" valor={t.colaboradores_ativos} rodape="ativos no cadastro" />
      </div>

      {/* Pendências de cadastro — quem está fora da estrutura */}
      {(t.sem_departamento > 0 || t.sem_escala > 0) && (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            {t.sem_departamento > 0 && <><b>{t.sem_departamento}</b> colaborador(es) sem departamento. </>}
            {t.sem_escala > 0 && <><b>{t.sem_escala}</b> sem escala de trabalho. </>}
            Enquanto isso não for corrigido no cadastro, o Painel RH, a Folha e o Ponto vão divergir.
            {' '}<Link to="/employees" className="underline font-semibold">Corrigir agora</Link>
          </p>
        </div>
      )}

      {/* Organograma */}
      <Bloco titulo="Organograma" descricao="A contagem de cada setor é lida do cadastro dos colaboradores.">
        {deps.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhum departamento cadastrado.</p>
        ) : (
          <>
            <div className="flex justify-center mb-4">
              <div className="rounded-xl border-2 border-primary-300 bg-primary-50 px-5 py-3 text-center">
                <p className="text-[11px] uppercase tracking-wide text-primary-500">Diretoria</p>
                <p className="font-bold text-gray-900">{t.colaboradores_ativos} colaboradores</p>
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
              {deps.map(d => (
                <div key={d.id} className="rounded-xl border border-gray-200 p-3">
                  <p className="text-[11px] text-gray-400">{d.code}</p>
                  <p className="font-semibold text-gray-900 text-sm truncate">{d.name}</p>
                  <p className="text-lg font-bold text-primary-600 mt-1">{d.colaboradores}</p>
                  <p className="text-[10px] text-gray-400">
                    {d.colaboradores === 1 ? 'colaborador' : 'colaboradores'}
                  </p>
                  {d.cargos?.length > 0 && (
                    <ul className="mt-2 space-y-0.5">
                      {d.cargos.slice(0, 4).map(c => (
                        <li key={c} className="text-[10px] text-gray-500 truncate">· {c}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </Bloco>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
        <Bloco titulo="Departamentos" descricao="Responsável, centro de custo e jornada padrão de cada setor.">
          {deps.length === 0 ? <p className="text-sm text-gray-400 py-4">—</p> : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr>
                    <th>Departamento</th><th>Centro de custo</th><th>Jornada padrão</th><th className="text-right">Pessoas</th>
                  </tr>
                </thead>
                <tbody>
                  {deps.map(d => {
                    const cc = centros.find(x => x.id === d.cost_center_id);
                    return (
                      <tr key={d.id}>
                        <td>
                          <span className="font-medium text-gray-800">{d.name}</span>
                          <span className="block text-[11px] text-gray-400">{d.code}</span>
                        </td>
                        <td className="text-gray-600">{cc ? `${cc.code} — ${cc.name}` : '—'}</td>
                        <td className="text-gray-600">{d.jornada_padrao || '—'}</td>
                        <td className="text-right font-semibold">{d.colaboradores}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Bloco>

        <Bloco titulo="Escalas e jornadas" descricao="A jornada vem daqui — inclusive a de estágio, que não é a CLT de 44h.">
          {escalas.length === 0 ? <p className="text-sm text-gray-400 py-4">—</p> : (
            <div className="overflow-x-auto">
              <table className="table-auto w-full text-sm">
                <thead>
                  <tr><th>Escala</th><th>Entrada / saída</th><th>Tolerância</th><th className="text-right">Pessoas</th></tr>
                </thead>
                <tbody>
                  {escalas.map(e => (
                    <tr key={e.id}>
                      <td>
                        <span className="font-medium text-gray-800">{e.name}</span>
                        <span className="block text-[11px] text-gray-400">{semanal(e)} · {hhmm(e.daily_minutes)}/dia</span>
                      </td>
                      <td className="text-gray-600">
                        {String(e.entry_time || '').slice(0, 5) || '—'} — {String(e.exit_time || '').slice(0, 5) || '—'}
                      </td>
                      <td className={e.tolerance_minutes === 5 ? 'text-gray-600' : 'text-amber-600'}>
                        {e.tolerance_minutes ?? '—'} min
                      </td>
                      <td className="text-right font-semibold">{e.colaboradores}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {escalas.some(e => e.tolerance_minutes !== 5) && (
                <p className="text-[11px] text-amber-600 mt-2">
                  A tolerância combinada é de 5 minutos — as escalas acima em destaque ainda estão diferentes.
                </p>
              )}
            </div>
          )}
        </Bloco>
      </div>

      <Bloco titulo="Cargos e CBO" descricao="O eSocial pede o CBO, não o nome bonito do cargo.">
        {cargos.length === 0 ? <p className="text-sm text-gray-400 py-4">Nenhum cargo cadastrado.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2">
            {cargos.map(c => (
              <div key={c.id} className="flex items-center gap-3 rounded-xl border border-gray-200 px-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-800 truncate">{c.name}</span>
                  <span className="block text-[11px] text-gray-400">CBO {c.cbo || '—'}</span>
                </span>
                <span className="text-sm font-bold text-gray-700">{c.colaboradores}</span>
              </div>
            ))}
          </div>
        )}
      </Bloco>

      <p className="text-[11px] text-gray-400 text-center">
        Todo número desta tela é contado do cadastro. Para mudar, edite o colaborador — não existe campo de quantidade.
        {' '}<Link to="/employees" className="text-primary-600 hover:underline inline-flex items-center gap-0.5">
          ir para Colaboradores <ArrowRight size={11} />
        </Link>
      </p>
    </div>
  );
}
