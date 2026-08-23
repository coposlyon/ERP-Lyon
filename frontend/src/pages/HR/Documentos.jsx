// ============================================================
// DOCUMENTOS — A CENTRAL ÚNICA.
//
// A pergunta que esta tela responde não é "o que foi anexado?", e sim
// "O QUE ESTÁ FALTANDO?". Por isso a pendência é calculada: o que o
// catálogo exige daquela pessoa, menos o que ela já entregou. Uma lista
// de pendências guardada no banco envelheceria — o documento chega e a
// pendência continua lá.
//
// FILTRO INDIVIDUAL DIZ QUE É INDIVIDUAL (item 9). Quando se escolhe um
// colaborador, o cabeçalho vira "Resumo do colaborador". Sem isso, o
// gestor lê "6 pendentes" achando que é a empresa inteira quando é só
// uma pessoa.
//
// E DOCUMENTO SEM VALIDADE NÃO VENCE. Contrato indeterminado, RG e CPF
// não entram na lista de vencimentos — a etiqueta "não vence" é
// escolha explícita do catálogo, não campo de data vazio.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FileCheck, FileWarning, CalendarClock, PenLine, ShieldCheck, FileX,
  Loader2, Check, AlertTriangle, Download, User, RefreshCw, FileText,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

const COR_STATUS = {
  anexado: 'badge-green', assinado: 'badge-green', pendente: 'badge-yellow',
  vencido: 'badge-red', aguardando_assinatura: 'badge-purple', recusado: 'badge-red',
};
const ROTULO = {
  anexado: 'anexado', assinado: 'assinado', pendente: 'pendente',
  vencido: 'vencido', aguardando_assinatura: 'aguardando assinatura', recusado: 'recusado',
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

export default function Documentos() {
  const qc = useQueryClient();
  const [alvo, setAlvo] = useState('');
  const [aberto, setAberto] = useState(null);   // prontuário expandido

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['rh-documentos', alvo],
    queryFn: () => api.get(`/rh/documentos${alvo ? `?employee_id=${alvo}` : ''}`),
  });

  const gerarTermo = useMutation({
    mutationFn: id => api.post(`/rh/documentos/termo-ciencia/${id}`),
    onSuccess: () => { toast.success('Termo de ciência arquivado'); qc.invalidateQueries(['rh-documentos']); },
    onError: e => toast.error(e.error || 'Erro ao gerar o termo'),
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><Loader2 size={24} className="animate-spin text-primary-600" /></div>;
  }

  const c = data?.cartoes || {};
  const individual = data?.escopo === 'colaborador';
  const prontuarios = data?.prontuarios || [];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Documentos</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Central única de anexos do RH — as outras telas só mostram status e o botão de visualizar.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select className="input py-1.5 text-sm" value={alvo} onChange={e => setAlvo(e.target.value)}>
            <option value="">Todos os colaboradores</option>
            {prontuarios.concat(alvo && data?.colaborador ? [] : []).map(p => (
              <option key={p.employee_id} value={p.employee_id}>{p.nome}</option>
            ))}
          </select>
          <button onClick={() => refetch()} className="btn-secondary btn-sm">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* O escopo dito em voz alta — item 9 */}
      <div className={`flex items-center gap-2 text-sm rounded-xl px-4 py-2 ${individual ? 'bg-primary-50 text-primary-800' : 'bg-gray-50 text-gray-600'}`}>
        {individual ? <User size={15} /> : <FileCheck size={15} />}
        <span>
          {individual
            ? <>Mostrando o <b>Resumo do colaborador</b>: {data?.colaborador?.nome}. Os números abaixo são só dele.</>
            : <>Mostrando <b>todos os colaboradores</b> ({data?.colaboradores}). Os números são da empresa inteira.</>}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Cartao icone={FileCheck} cor="bg-emerald-100 text-emerald-600" titulo="Documentos válidos" valor={c.documentos_validos} rodape="anexados e no prazo" />
        <Cartao icone={FileWarning} cor="bg-amber-100 text-amber-600" titulo="Pendentes" valor={c.pendentes} rodape={`${c.obrigatorios_pendentes || 0} obrigatório(s)`} />
        <Cartao icone={CalendarClock} cor="bg-blue-100 text-blue-600" titulo="Vencendo (30 dias)" valor={c.vencendo_30_dias} rodape="só o que tem validade" />
        <Cartao icone={FileX} cor="bg-rose-100 text-rose-600" titulo="Vencidos" valor={c.vencidos} rodape="ação imediata" />
        <Cartao icone={PenLine} cor="bg-violet-100 text-violet-600" titulo="Aguardando assinatura" valor={c.aguardando_assinatura} />
        <Cartao icone={ShieldCheck} cor="bg-sky-100 text-sky-600" titulo="Conformidade"
          valor={c.conformidade_pct != null ? `${c.conformidade_pct}%` : '—'} rodape="colaboradores em dia" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-start">
        <div className="xl:col-span-8 space-y-4">
          <Bloco titulo="Prontuário por colaborador"
            descricao="A pendência é calculada: o exigido para aquela pessoa menos o que ela entregou.">
            {!prontuarios.length ? (
              <p className="text-sm text-gray-400 text-center py-8">Nenhum colaborador ativo.</p>
            ) : (
              <div className="space-y-2">
                {prontuarios.map(p => (
                  <div key={p.employee_id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button onClick={() => setAberto(aberto === p.employee_id ? null : p.employee_id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-gray-50 transition-colors text-left">
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-gray-800 truncate">{p.nome}</span>
                        <span className="block text-[11px] text-gray-400">
                          {p.setor || '—'} · {p.contrato || '—'} · {p.anexados} de {p.total} entregues
                        </span>
                      </span>
                      <span className="w-24 shrink-0">
                        <span className="block h-1.5 rounded-full bg-gray-100 overflow-hidden">
                          <span className={`block h-full ${p.conforme ? 'bg-green-500' : 'bg-amber-400'}`} style={{ width: `${p.pct}%` }} />
                        </span>
                        <span className="block text-[10px] text-gray-400 mt-0.5 text-right">{p.pct}% obrigatórios</span>
                      </span>
                      {p.obrigatorios_pendentes > 0 && (
                        <span className="badge badge-yellow shrink-0">{p.obrigatorios_pendentes} faltando</span>
                      )}
                      {p.vencidos > 0 && <span className="badge badge-red shrink-0">{p.vencidos} vencido</span>}
                    </button>

                    {aberto === p.employee_id && (
                      <div className="border-t border-gray-100 p-3 space-y-3">
                        <div className="flex justify-end">
                          <button onClick={() => gerarTermo.mutate(p.employee_id)} disabled={gerarTermo.isPending}
                            className="btn-secondary btn-sm">
                            <FileText size={13} /> Gerar termo de ciência dos aceites
                          </button>
                        </div>
                        {Object.entries(data.categorias).map(([cat, rotulo]) => {
                          const itens = p.itens.filter(i => i.categoria === cat);
                          if (!itens.length) return null;
                          return (
                            <div key={cat}>
                              <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{rotulo}</p>
                              <ul className="space-y-1">
                                {itens.map(i => (
                                  <li key={i.doc_key} className="flex items-center gap-2 text-sm">
                                    <span className="min-w-0 flex-1">
                                      <span className="text-gray-700">{i.titulo}</span>
                                      {i.obrigatorio && <span className="text-red-400 ml-1">*</span>}
                                      {i.ajuda && <span className="block text-[10px] text-gray-400">{i.ajuda}</span>}
                                    </span>
                                    {i.documento?.expires_at && (
                                      <span className="text-[11px] text-gray-400">vence {dBR(i.documento.expires_at)}</span>
                                    )}
                                    {i.sem_validade && i.documento && (
                                      <span className="text-[11px] text-gray-300">não vence</span>
                                    )}
                                    <span className={`badge ${COR_STATUS[i.status]} shrink-0`}>{ROTULO[i.status]}</span>
                                    {i.documento?.url && (
                                      <a href={i.documento.url} target="_blank" rel="noreferrer"
                                        className="btn-ghost btn-sm text-primary-600"><Download size={13} /></a>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          );
                        })}
                        <p className="text-[11px] text-gray-400 border-t border-gray-100 pt-2">
                          Os anexos são enviados no cadastro do colaborador (etapa Documentação). Esta tela é a central
                          que enxerga tudo — inclusive o que ninguém mandou ainda.
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Bloco>
        </div>

        <div className="xl:col-span-4 space-y-4">
          <Bloco titulo="Políticas internas" descricao="Uma versão para todos; o aceite é de cada um.">
            {!(data?.politicas || []).length ? (
              <p className="text-sm text-gray-400 py-2">Nenhuma política cadastrada.</p>
            ) : (
              <ul className="space-y-2">
                {data.politicas.map(p => (
                  <li key={p.id} className="text-sm border-b border-gray-100 pb-2 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-gray-700 truncate">{p.titulo}</span>
                      <span className="text-[11px] text-gray-400">v{p.versao}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                        <span className="block h-full bg-primary-500" style={{ width: `${p.pct}%` }} />
                      </span>
                      <span className="text-[11px] text-gray-500">{p.aceites} aceite(s)</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          <Bloco titulo="Próximos vencimentos" descricao="Só documentos com data — contrato indeterminado não aparece.">
            {!(data?.vencimentos || []).length ? (
              <p className="text-sm text-gray-400 py-2">Nada vencendo nos próximos 30 dias.</p>
            ) : (
              <ul className="space-y-2">
                {data.vencimentos.map(v => (
                  <li key={v.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="block text-gray-700 truncate">{v.documento}</span>
                      <span className="block text-[11px] text-gray-400">{v.colaborador}</span>
                    </span>
                    <span className={`text-xs whitespace-nowrap ${v.vencido ? 'text-red-500 font-semibold' : 'text-amber-600'}`}>
                      {v.vencido ? 'vencido' : `${v.dias}d`} · {dBR(v.expires_at)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Bloco>

          {!!(data?.exames_retorno_pendentes || []).length && (
            <Bloco titulo="Exames de retorno pendentes" descricao="Afastamento acima de 30 dias exige ASO de retorno.">
              <ul className="space-y-1.5 text-sm">
                {data.exames_retorno_pendentes.map((e, i) => (
                  <li key={i} className="flex items-center justify-between">
                    <span className="text-gray-700">{e.colaborador}</span>
                    <span className="text-[11px] text-gray-400">retorno {dBR(e.retorno)}</span>
                  </li>
                ))}
              </ul>
            </Bloco>
          )}
        </div>
      </div>
    </div>
  );
}
