// ============================================================
// PORTAL DO CONTADOR — SÓ O QUE É FISCAL.
//
// O contador não é um usuário de RH com menos botões: é outro papel.
// Ele precisa de competência fechada, encargo, evento de eSocial e
// prazo — e NÃO precisa (nem deve) ver ocorrência disciplinar,
// justificativa de falta ou documento pessoal do colaborador.
//
// O vencimento do FGTS é o dia 20 do mês seguinte, no FGTS Digital —
// não mais a GFIP/SEFIP (item 10).
// ============================================================
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarCheck, FileSpreadsheet, AlertTriangle, UserMinus, Loader2, RefreshCw, Download,
} from 'lucide-react';
import api from '@/lib/api';

const dBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const cBR = c => (c ? c.split('-').reverse().join('/') : '—');
const brl = v => (v == null ? '—' : Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));

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

function Bloco({ titulo, descricao, acao, children }) {
  return (
    <section className="card">
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

/** Exporta o que está na tela — sem uma segunda consulta que poderia divergir. */
function baixarCSV(nome, linhas) {
  if (!linhas.length) return;
  const cols = Object.keys(linhas[0]);
  const csv = [
    cols.join(';'),
    ...linhas.map(l => cols.map(c => String(l[c] ?? '').replace(/;/g, ',')).join(';')),
  ].join('\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = nome;
  a.click();
  URL.revokeObjectURL(url);
}

export default function PortalContador() {
  const [mes, setMes] = useState(new Date().toISOString().slice(0, 7));

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['portal-contador', mes],
    queryFn: () => api.get('/portal/contador', { params: { competencia: mes } }),
  });

  if (isLoading) {
    return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-gray-400" size={28} /></div>;
  }

  const c = data?.cartoes || {};
  const atual = data?.atual;

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div>
          <h1 className="page-title">Portal do Contador</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Competências, encargos, eventos e prazos. Sem dado pessoal ou disciplinar do colaborador.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" className="input py-1.5 text-sm" value={mes} onChange={e => setMes(e.target.value)} />
          <button onClick={() => refetch()} className="btn-secondary btn-sm" title="Atualizar">
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Cartao icone={CalendarCheck} cor="bg-emerald-50 text-emerald-600" titulo="Competências fechadas"
          valor={c.competencias_fechadas} rodape={`última: ${cBR(c.ultima)}`} />
        <Cartao icone={FileSpreadsheet} cor="bg-blue-50 text-blue-600" titulo="Folha da competência"
          valor={brl(atual?.bruto)} rodape={atual?.previa ? 'prévia — ainda não fechada' : 'fechada'} />
        <Cartao icone={AlertTriangle} cor="bg-amber-50 text-amber-600" titulo="Eventos pendentes"
          valor={c.eventos_pendentes} rodape="eSocial sem retorno" />
        <Cartao icone={UserMinus} cor="bg-slate-50 text-slate-600" titulo="Desligamentos no mês"
          valor={c.desligamentos_no_mes} rodape="prazo de 10 dias (art. 477)" />
      </div>

      {!!(data?.avisos || []).length && (
        <div className="card"><div className="card-body flex items-start gap-2">
          <AlertTriangle size={16} className="text-amber-500 mt-0.5 shrink-0" />
          <div>{data.avisos.map((a, i) => <p key={i} className="text-sm text-gray-700">{a}</p>)}</div>
        </div></div>
      )}

      <Bloco
        titulo="Competências"
        descricao="FGTS Digital vence no dia 20 do mês seguinte à competência."
        acao={
          <button className="btn-secondary btn-sm" onClick={() => baixarCSV(`competencias.csv`, data.competencias)}>
            <Download size={13} /> CSV
          </button>
        }
      >
        {!(data?.competencias || []).length ? (
          <p className="text-sm text-gray-400 text-center py-6">Nenhuma competência fechada ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="pb-2">Competência</th><th className="pb-2">Colab.</th>
                  <th className="pb-2 text-right">Bruto</th><th className="pb-2 text-right">Líquido</th>
                  <th className="pb-2 text-right">INSS</th><th className="pb-2 text-right">IRRF</th>
                  <th className="pb-2 text-right">FGTS</th><th className="pb-2">Vence FGTS</th>
                </tr>
              </thead>
              <tbody>
                {data.competencias.map(x => (
                  <tr key={x.competencia} className={`border-t border-gray-100 ${x.competencia === mes ? 'bg-blue-50/40' : ''}`}>
                    <td className="py-2 font-medium text-gray-900">{cBR(x.competencia)}</td>
                    <td className="py-2 text-gray-600">{x.colaboradores}</td>
                    <td className="py-2 text-right text-gray-700">{brl(x.bruto)}</td>
                    <td className="py-2 text-right text-gray-700">{brl(x.liquido)}</td>
                    <td className="py-2 text-right text-gray-700">{brl(x.inss)}</td>
                    <td className="py-2 text-right text-gray-700">{brl(x.irrf)}</td>
                    <td className="py-2 text-right text-gray-700">{brl(x.fgts)}</td>
                    <td className="py-2 text-gray-600">{dBR(x.fgts_vencimento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Bloco>

      {data?.encargos && (
        <Bloco titulo="Encargos da empresa" descricao="O custo que não aparece no holerite do colaborador.">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {Object.entries(data.encargos).map(([k, v]) => (
              <div key={k} className="rounded-lg bg-gray-50 px-3 py-2">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{k.replace(/_/g, ' ')}</p>
                <p className="text-sm font-semibold text-gray-900">
                  {v == null ? '—' : brl(v)}
                </p>
                {v == null && <p className="text-[10px] text-gray-400">depende do CNAE/FAP</p>}
              </div>
            ))}
          </div>
        </Bloco>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Bloco titulo="Eventos do eSocial" descricao="O que já foi enviado e o que ainda espera retorno.">
          {!(data?.eventos || []).length ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhum evento gerado.</p>
          ) : (
            <div className="space-y-1">
              {data.eventos.slice(0, 20).map(e => (
                <div key={e.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="font-medium text-gray-900">{e.tipo}</span>
                  <span className="text-[11px] text-gray-400">{cBR(e.referencia)}</span>
                  <span className={`badge ${
                    ['aceito', 'processado'].includes(String(e.status)) ? 'badge-green' : 'badge-yellow'
                  }`}>{e.status || 'pendente'}</span>
                </div>
              ))}
            </div>
          )}
        </Bloco>

        <Bloco titulo="Rescisões concluídas" descricao="Com o prazo do art. 477 para pagamento.">
          {!(data?.rescisoes || []).length ? (
            <p className="text-sm text-gray-400 text-center py-6">Nenhuma rescisão concluída.</p>
          ) : (
            <div className="space-y-1">
              {data.rescisoes.map(r => (
                <div key={r.id} className="flex items-center justify-between text-sm py-1.5 border-b border-gray-50 last:border-0">
                  <span className="text-gray-700">{dBR(r.saida)}</span>
                  <span className="text-[11px] text-gray-400">{String(r.tipo).replace(/_/g, ' ')}</span>
                  <span className="font-medium text-gray-900">{brl(r.total)}</span>
                  <span className="text-[11px] text-gray-500">até {dBR(r.prazo_pagamento)}</span>
                </div>
              ))}
            </div>
          )}
        </Bloco>
      </div>
    </div>
  );
}
