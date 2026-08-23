// ============================================================
// eSOCIAL / FGTS DIGITAL.
//
// Esta tela não pede para ninguém digitar evento. Ela mostra o que os
// FATOS do RH já exigem: admitiu → S-2200, afastou por mais de 15 dias
// → S-2230, fechou a folha → S-1200, desligou → S-2299. A pendência é a
// diferença entre o que aconteceu e o que já foi transmitido.
//
// E ELA NÃO MENTE SOBRE ENVIO. Assinar e transmitir exige certificado
// digital e gateway homologado. Sem transmissor configurado, o evento
// fica "pronto para envio" — nunca "enviado". Prazo legal não se cumpre
// com otimismo de tela.
//
// FGTS DIGITAL (item 10). É o processo corrente: a guia sai dos eventos
// do eSocial. SEFIP/GFIP não aparece como fluxo padrão em nenhum lugar.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CloudUpload, Clock, ShieldAlert, Landmark, FileCheck, AlertTriangle,
  Loader2, Check, RefreshCw, Send, Info,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const fmt = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

const COR_EVENTO = {
  'S-2200': 'badge-green', 'S-2205': 'badge-blue', 'S-2206': 'badge-blue',
  'S-2230': 'badge-yellow', 'S-2299': 'badge-red', 'S-1200': 'badge-purple', 'S-1210': 'badge-purple',
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

export default function ESocial() {
  const qc = useQueryClient();
  const [comp, setComp] = useState(new Date().toISOString().slice(0, 7));

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-esocial', comp],
    queryFn: () => api.get(`/rh/esocial?competencia=${comp}`),
  });

  const preparar = useMutation({
    mutationFn: () => api.post('/rh/esocial/preparar', { competencia: comp }),
    onSuccess: r => {
      toast.success(`${r.preparados} evento(s) prontos`);
      if (r.aviso) toast(r.aviso, { icon: 'ℹ️', duration: 6000 });
      qc.invalidateQueries(['rh-esocial']);
      qc.invalidateQueries(['rh-painel']);
    },
    onError: e => toast.error(e.error || 'Erro ao preparar'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const c = data?.cartoes || {};
  const fgts = data?.fgts || {};

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">eSocial / FGTS Digital</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Os eventos nascem dos fatos do RH — admissão, afastamento, folha e desligamento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="input py-1.5 text-sm" value={comp} onChange={e => setComp(e.target.value)} />
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => preparar.mutate()} disabled={preparar.isPending || !c.prontos_para_envio}
            className="btn-primary btn-sm">
            {preparar.isPending ? <><Loader2 size={14} className="animate-spin" /> Preparando…</>
              : <><Send size={14} /> Preparar {c.prontos_para_envio || 0} evento(s)</>}
          </button>
        </div>
      </div>

      {!data?.transmissor_configurado && (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Sem transmissor configurado</p>
            <p className="text-xs mt-0.5">
              Os eventos são montados e ficam <b>prontos para envio</b>, mas a transmissão exige certificado digital e
              gateway homologado (Fiscal → Configuração). Enquanto isso, nada é dado como enviado — prazo legal não se
              cumpre com otimismo de tela.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={CloudUpload} cor="bg-emerald-100 text-emerald-600" titulo="Enviados" valor={c.enviados} rodape="no histórico" />
        <Cartao icone={Clock} cor="bg-amber-100 text-amber-600" titulo="Pendentes" valor={c.pendentes} rodape="exigidos pelos fatos" />
        <Cartao icone={FileCheck} cor="bg-blue-100 text-blue-600" titulo="Prontos" valor={c.prontos_para_envio} rodape="sem bloqueio" />
        <Cartao icone={ShieldAlert} cor="bg-rose-100 text-rose-600" titulo="Bloqueados" valor={c.bloqueados} rodape="falta dado no cadastro" />
        <Cartao icone={AlertTriangle} cor="bg-orange-100 text-orange-600" titulo="Rejeitados" valor={c.rejeitados} rodape="pelo governo" />
        <Cartao icone={Landmark} cor="bg-sky-100 text-sky-600" titulo="FGTS a recolher" valor={fmt(c.fgts_a_recolher)} rodape={`vence ${dBR(fgts.vencimento)}`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 space-y-4">
          <Bloco titulo="Eventos exigidos nesta competência"
            descricao="Calculados dos fatos do RH. O bloqueio aponta o dado que falta no cadastro.">
            {!(data?.pendentes || []).length ? (
              <p className="text-sm text-gray-400 text-center py-8">
                Nenhum evento pendente. Tudo o que aconteceu já foi transmitido — ou ainda não aconteceu nada nesta competência.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                  <thead>
                    <tr><th>Evento</th><th>Descrição</th><th>Colaborador</th><th>Competência</th><th>Situação</th></tr>
                  </thead>
                  <tbody>
                    {data.pendentes.map((p, i) => (
                      <tr key={i} className={p.bloqueios.length ? 'bg-amber-50/40' : ''}>
                        <td><span className={`badge ${COR_EVENTO[p.tipo] || 'badge-gray'}`}>{p.tipo}</span></td>
                        <td className="text-gray-700">
                          {p.descricao}
                          {p.detalhe && <span className="block text-[11px] text-gray-400">{p.detalhe}</span>}
                        </td>
                        <td>
                          <span className="text-gray-800">{p.colaborador}</span>
                          {p.cpf && <span className="block text-[11px] text-gray-400">{p.cpf}</span>}
                        </td>
                        <td className="text-gray-600">{p.per_apur}</td>
                        <td>
                          {p.bloqueios.length ? (
                            <span className="text-amber-700 text-xs">
                              {p.bloqueios.join(' · ')}
                            </span>
                          ) : (
                            <span className="badge badge-green">pronto</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>

          <Bloco titulo="Histórico de eventos" descricao="O que já saiu daqui, com protocolo.">
            {!(data?.historico || []).length ? (
              <p className="text-sm text-gray-400 text-center py-6">Nenhum evento transmitido ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-auto w-full text-sm">
                  <thead>
                    <tr><th>Evento</th><th>Descrição</th><th>Competência</th><th>Status</th><th>Protocolo</th></tr>
                  </thead>
                  <tbody>
                    {data.historico.map(h => (
                      <tr key={h.id}>
                        <td><span className={`badge ${COR_EVENTO[h.tipo] || 'badge-gray'}`}>{h.tipo}</span></td>
                        <td className="text-gray-700">{h.descricao}</td>
                        <td className="text-gray-600">{h.per_apur || '—'}</td>
                        <td>
                          <span className={`badge ${h.status === 'enviado' || h.status === 'processado' ? 'badge-green'
                            : h.status === 'rejeitado' || h.status === 'erro' ? 'badge-red' : 'badge-yellow'}`}>
                            {h.status}
                          </span>
                          {h.erro && <span className="block text-[10px] text-red-500 mt-0.5">{h.erro}</span>}
                        </td>
                        <td className="text-[11px] text-gray-400 font-mono">{h.protocolo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Bloco>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <Bloco titulo="FGTS Digital" descricao="A guia sai dos eventos do eSocial — não do SEFIP.">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-gray-500">Competência</span>
                <span className="font-semibold">{fgts.competencia}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Valor</span>
                <span className="font-semibold">{fmt(fgts.valor)}</span></div>
              <div className="flex justify-between"><span className="text-gray-500">Vencimento</span>
                <span className="font-semibold">{dBR(fgts.vencimento)}</span></div>
              <div className="pt-2 border-t border-gray-100">
                <p className="text-xs text-gray-500">Situação: <b>{fgts.situacao}</b></p>
              </div>
            </div>
          </Bloco>

          <Bloco titulo="Conformidade">
            <ul className="space-y-2">
              {(data?.conformidade || []).map((k, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  {k.ok ? <Check size={15} className="text-green-500 shrink-0 mt-0.5" />
                    : <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />}
                  <span>
                    <span className={k.ok ? 'text-gray-600' : 'text-amber-700 font-medium'}>{k.item}</span>
                    {k.detalhe && <span className="block text-[11px] text-gray-400">{k.detalhe}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </Bloco>

          <Bloco titulo="De onde nasce cada evento">
            <ul className="space-y-1.5 text-xs">
              {Object.entries(data?.eventos_suportados || {}).map(([tipo, e]) => (
                <li key={tipo} className="flex gap-2">
                  <span className={`badge ${COR_EVENTO[tipo] || 'badge-gray'} shrink-0`}>{tipo}</span>
                  <span className="text-gray-600">
                    {e.nome}
                    <span className="block text-[10px] text-gray-400">{e.origem}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-gray-400 mt-3 flex gap-1.5">
              <Info size={12} className="shrink-0 mt-0.5" />
              Nenhum deles é digitado aqui: o RH faz o fato acontecer na tela dele, e o evento aparece nesta lista.
            </p>
          </Bloco>
        </div>
      </div>
    </div>
  );
}
