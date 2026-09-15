/**
 * O QUE SAI DO ERP PARA O CONTADOR.
 *
 *   <Exportacao />  um período → uma planilha com seis abas (resumo,
 *                   lançamentos, notas fiscais, vendas, compras, folha)
 *   <Malote />      as despesas de um mês reunidas, agrupadas e com
 *                   comprovante — o "malote de pagamentos"; registra o
 *                   envio (quem, quando, para quem) e guarda a foto
 *   <Margem />      a margem de lucro consolidada do ano, mês a mês,
 *                   por empresa faturadora e por canal
 *
 * Os três vivem como abas do Contábil; o Malote aparece também no
 * Financeiro, que é onde o cliente pediu. Nada aqui é digitado — é
 * leitura do que os módulos já registraram.
 */
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bar } from 'react-chartjs-2';
import {
  Loader2, FileDown, FileSpreadsheet, Send, History, CheckCircle2, AlertTriangle, Paperclip,
  TrendingUp, TrendingDown, Info, ChevronDown, ChevronRight, ExternalLink, Printer,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const pct = v => `${(Number(v) || 0).toFixed(1).replace('.', ',')}%`;
const dBR = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const dhBR = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const mesBR = m => { const [y, mm] = String(m || '').split('-'); return mm ? `${['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'][Number(mm) - 1]}/${y}` : '—'; };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const urlDoArquivo = p => (!p ? '' : /^https?:/.test(p) ? p : `${supabaseUrl}/storage/v1/object/public/${p}`);

/** Cabeçalhos em português, na ordem em que o contador lê. */
const COLUNAS = {
  resumo: { linha: 'Linha', valor: 'Valor' },
  lancamentos: {
    tipo: 'Tipo', descricao: 'Descrição', origem: 'Origem', documento: 'Documento', parceiro: 'Cliente / Fornecedor',
    cpf_cnpj: 'CPF / CNPJ', categoria: 'Conta contábil', centro_custo: 'Centro de custo', competencia: 'Competência',
    vencimento: 'Vencimento', valor: 'Valor', status: 'Situação', pago_em: 'Pago em', valor_pago: 'Valor pago',
    forma_pagamento: 'Forma de pagamento', conta: 'Conta bancária', parcela: 'Parcela', comprovante: 'Comprovante', boleto: 'Boleto', observacao: 'Observação',
  },
  notas_fiscais: {
    numero: 'Número', serie: 'Série', tipo: 'Tipo', ambiente: 'Ambiente', status: 'Situação', chave: 'Chave de acesso', emitida_em: 'Emitida em',
    destinatario: 'Destinatário', pedido: 'Pedido', total: 'Total', protocolo: 'Protocolo', danfe: 'DANFE', xml: 'XML', cancelada_em: 'Cancelada em', motivo: 'Motivo',
  },
  vendas: {
    pedido: 'Pedido', data: 'Data', cliente: 'Cliente', cpf_cnpj: 'CPF / CNPJ', total: 'Total', frete: 'Frete', desconto: 'Desconto',
    status: 'Situação', forma_pagamento: 'Forma de pagamento', canal: 'Canal', empresa_faturadora: 'Empresa faturadora',
  },
  compras: { compra: 'Compra', data: 'Data', fornecedor: 'Fornecedor', cnpj: 'CNPJ', total: 'Total', frete: 'Frete', status: 'Situação', nota_fiscal: 'Nota fiscal', chave: 'Chave' },
  folha: {
    colaborador: 'Colaborador', cpf: 'CPF', competencia: 'Competência', tipo: 'Tipo', salario_base: 'Salário base', adicionais: 'Adicionais',
    bruto: 'Bruto', inss: 'INSS', irrf: 'IRRF', outros_descontos: 'Outros descontos', fgts: 'FGTS', liquido: 'Líquido', status: 'Situação', pago_em: 'Pago em',
  },
};
const NOME_ABA = { resumo: 'Resumo', lancamentos: 'Lançamentos', notas_fiscais: 'Notas fiscais', vendas: 'Vendas', compras: 'Compras', folha: 'Folha' };

function linhasComCabecalho(aba, linhas) {
  const cols = COLUNAS[aba];
  return (linhas || []).map(l => Object.fromEntries(Object.entries(cols).map(([k, rotulo]) => {
    let v = l[k];
    if ((k === 'comprovante' || k === 'boleto' || k === 'danfe' || k === 'xml') && v) v = urlDoArquivo(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) v = dBR(v);
    return [rotulo, v ?? ''];
  })));
}

async function baixarExcel(nome, abas) {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  for (const [aba, linhas] of abas) {
    const ws = XLSX.utils.json_to_sheet(linhas.length ? linhas : [{ '(vazio)': 'Nenhum registro no período' }]);
    XLSX.utils.book_append_sheet(wb, ws, NOME_ABA[aba] || aba);
  }
  XLSX.writeFile(wb, `${nome}.xlsx`);
}

function baixarCsv(nome, linhas) {
  if (!linhas.length) { toast('Nada para exportar nesta aba'); return; }
  const cab = Object.keys(linhas[0]);
  const esc = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = '﻿' + [cab.join(';'), ...linhas.map(l => cab.map(c => esc(l[c])).join(';'))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `${nome}.csv`; a.click(); URL.revokeObjectURL(a.href);
}

// ═══════════════ EXPORTAÇÃO PARA O CONTADOR ═══════════════
export function Exportacao() {
  const [modo, setModo] = useState('mes');
  const [mes, setMes] = useState(thisMonth());
  const [de, setDe] = useState(`${thisMonth()}-01`);
  const [ate, setAte] = useState(new Date().toISOString().slice(0, 10));
  const [aba, setAba] = useState('resumo');
  const qs = modo === 'mes' ? `mes=${mes}` : `de=${de}&ate=${ate}`;
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['contador-exportacao', qs],
    queryFn: () => api.get(`/contador/exportacao?${qs}`),
  });
  const abas = data?.abas || {};
  const nomeArquivo = `contador_${modo === 'mes' ? mes : `${de}_a_${ate}`}`;

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex rounded-lg border border-gray-200 overflow-hidden">
          {[['mes', 'Mês'], ['periodo', 'Período']].map(([v, l]) => (
            <button key={v} onClick={() => setModo(v)}
              className={`px-3 py-1.5 text-sm font-medium ${modo === v ? 'bg-primary-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>{l}</button>
          ))}
        </div>
        {modo === 'mes' ? (
          <input type="month" className="input max-w-[170px]" value={mes} onChange={e => setMes(e.target.value)} />
        ) : (
          <>
            <label className="text-xs text-gray-500">De <input type="date" className="input mt-0.5" value={de} onChange={e => setDe(e.target.value)} /></label>
            <label className="text-xs text-gray-500">Até <input type="date" className="input mt-0.5" value={ate} onChange={e => setAte(e.target.value)} /></label>
          </>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-primary btn-sm" disabled={!data}
            onClick={() => baixarExcel(nomeArquivo, Object.keys(COLUNAS).map(k => [k, linhasComCabecalho(k, abas[k])])).then(() => toast.success('Planilha do contador gerada'))}>
            <FileSpreadsheet size={14} /> Excel completo (6 abas)
          </button>
          <button className="btn-secondary btn-sm" disabled={!data}
            onClick={() => baixarCsv(`${nomeArquivo}_${aba}`, linhasComCabecalho(aba, abas[aba]))}>
            <FileDown size={14} /> CSV da aba
          </button>
        </div>
      </div>

      {data?.empresa && (
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Info size={13} /> {data.empresa.razao_social} · CNPJ {data.empresa.cnpj || '—'} · {data.empresa.regime === 'simples' ? 'Simples Nacional' : data.empresa.regime} · alíquota {String(data.empresa.aliquota).replace('.', ',')}%
          · período {dBR(data.periodo.de)} a {dBR(data.periodo.ate)} {isFetching && <Loader2 size={12} className="animate-spin" />}
        </p>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {Object.keys(COLUNAS).map(k => (
          <button key={k} onClick={() => setAba(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${aba === k ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
            {NOME_ABA[k]} <span className={`ml-1 text-[11px] ${aba === k ? 'text-gray-300' : 'text-gray-400'}`}>{(abas[k] || []).length}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <TabelaGenerica linhas={linhasComCabecalho(aba, abas[aba])} vazio="Nenhum registro no período." />
      )}
      <p className="text-xs text-gray-400">
        Leiaute genérico: uma linha por registro, cabeçalhos em português. Se o escritório contábil usar um leiaute próprio (Domínio, Alterdata…), as colunas daqui são a base para o mapeamento.
      </p>
    </div>
  );
}

function TabelaGenerica({ linhas, vazio }) {
  const cab = linhas.length ? Object.keys(linhas[0]) : [];
  const ehLink = v => /^https?:\/\//.test(String(v || ''));
  return (
    <div className="card overflow-x-auto">
      <table className="w-full text-sm whitespace-nowrap">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            {cab.map(c => <th key={c} className="px-3 py-2 font-medium">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map((l, i) => (
            <tr key={i} className="border-b border-gray-50">
              {cab.map(c => (
                <td key={c} className={`px-3 py-1.5 ${typeof l[c] === 'number' ? 'text-right font-medium tabular-nums' : ''}`}>
                  {typeof l[c] === 'number' ? (c === 'Valor' && /Pedidos|Notas fiscais autorizadas$/.test(l.Linha || '') ? l[c] : fmt(l[c]))
                    : ehLink(l[c]) ? <a href={l[c]} target="_blank" rel="noreferrer" className="text-primary-600 inline-flex items-center gap-1">abrir <ExternalLink size={11} /></a>
                    : (l[c] || <span className="text-gray-300">—</span>)}
                </td>
              ))}
            </tr>
          ))}
          {!linhas.length && <tr><td className="text-center py-12 text-sm text-gray-400">{vazio}</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

// ═══════════════ MALOTE DE PAGAMENTOS ═══════════════
const COR_STATUS = {
  Pago: 'badge-green', Pendente: 'badge-yellow', Vencido: 'badge-red', Parcial: 'badge-blue',
  Previsto: 'badge-gray', Projetado: 'badge-gray',
};

export function Malote() {
  const qc = useQueryClient();
  const [mes, setMes] = useState(thisMonth());
  const [abertos, setAbertos] = useState({});
  const [enviar, setEnviar] = useState(false);
  const [destinatario, setDestinatario] = useState(() => localStorage.getItem('malote_destinatario') || '');
  const [observacao, setObservacao] = useState('');
  const [verEnvio, setVerEnvio] = useState(null);

  const { data, isLoading } = useQuery({ queryKey: ['contador-malote', mes], queryFn: () => api.get(`/contador/malote?mes=${mes}`) });
  const { data: historico } = useQuery({ queryKey: ['contador-malote-historico', mes.slice(0, 4)], queryFn: () => api.get(`/contador/malote/historico?ano=${mes.slice(0, 4)}`) });
  const envioAberto = useQuery({ queryKey: ['contador-malote-envio', verEnvio], queryFn: () => api.get(`/contador/malote/${verEnvio}`), enabled: !!verEnvio });

  const registrar = useMutation({
    mutationFn: () => api.post('/contador/malote/enviar', { mes, destinatario, observacao }),
    onSuccess: () => {
      try { localStorage.setItem('malote_destinatario', destinatario); } catch { /* sem storage */ }
      toast.success(`Malote de ${mesBR(mes)} registrado como enviado`);
      setEnviar(false); setObservacao('');
      qc.invalidateQueries({ queryKey: ['contador-malote'] });
      qc.invalidateQueries({ queryKey: ['contador-malote-historico'] });
    },
    onError: e => toast.error(e?.response?.data?.error || 'Não foi possível registrar o envio'),
  });

  const r = data?.resumo;
  const linhasExport = useMemo(() => linhasComCabecalho('lancamentos', (data?.itens || []).map(i => ({ ...i, tipo: i.previsto ? 'Pagar (previsto)' : i.projetado ? 'Pagar (projeção)' : 'Pagar' }))), [data]);

  function exportar() {
    const grupos = (data?.por_grupo || []).map(g => ({ Grupo: g.grupo, Contas: g.itens.length, Lançado: g.total, Pago: g.pago, Pendente: g.pendente, Previsto: g.previsto }));
    const resumo = [
      { Linha: 'Faturamento do mês', Valor: r.faturamento }, { Linha: 'Despesas lançadas', Valor: r.lancado }, { Linha: 'Pagas', Valor: r.pago },
      { Linha: 'Pendentes', Valor: r.pendente }, { Linha: 'Vencidas', Valor: r.vencido }, { Linha: 'Previstas (fixas sem lançamento)', Valor: r.previsto },
      { Linha: `Imposto projetado (${String(r.aliquota).replace('.', ',')}%)`, Valor: r.imposto_projetado }, { Linha: 'TOTAL DO MÊS', Valor: r.total_do_mes },
    ];
    baixarExcel(`malote_${mes}`, [['resumo', resumo], ['grupos', grupos], ['lancamentos', linhasExport]]).then(() => toast.success('Malote exportado'));
  }

  function imprimir() {
    if (!data) return;
    const linhas = data.por_grupo.map(g => `
      <tr class="g"><td colspan="5">${g.grupo}</td><td class="r">${fmt(g.total + g.previsto)}</td></tr>
      ${g.itens.map(i => `<tr><td>${dBR(i.vencimento)}</td><td>${i.descricao}</td><td>${i.parceiro || ''}</td><td>${i.documento || ''}</td><td>${i.status}${i.pago_em ? ' em ' + dBR(i.pago_em) : ''}${i.comprovante ? ' 📎' : ''}</td><td class="r">${fmt(i.valor)}</td></tr>`).join('')}`).join('');
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Malote de pagamentos — ${mesBR(mes)}</title>
      <style>@page{margin:12mm}body{font-family:Arial;font-size:12px;padding:20px;color:#111}h1{font-size:18px;margin:0}p.sub{color:#666;margin:4px 0 14px}
      table{width:100%;border-collapse:collapse}td,th{padding:6px 8px;border-bottom:1px solid #eee;text-align:left}th{font-size:11px;color:#666}.r{text-align:right;white-space:nowrap}
      tr.g td{background:#f3f4f6;font-weight:700;padding-top:10px}.tot{margin-top:14px;display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.tot div{border:1px solid #e5e7eb;border-radius:8px;padding:8px}.tot b{display:block;font-size:15px}
      .no-print{position:fixed;top:12px;right:12px;background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer}@media print{.no-print{display:none}}</style></head><body>
      <button class="no-print" onclick="window.print()">🖨️ Imprimir / PDF</button>
      <h1>Malote de pagamentos — ${mesBR(mes)}</h1>
      <p class="sub">${data.empresa?.razao_social || ''} · CNPJ ${data.empresa?.cnpj || '—'} · gerado em ${dhBR(data.gerado_em)}</p>
      <div class="tot"><div>Despesas lançadas<b>${fmt(r.lancado)}</b></div><div>Pagas<b>${fmt(r.pago)}</b></div><div>Pendentes / vencidas<b>${fmt(r.pendente)} / ${fmt(r.vencido)}</b></div><div>Total do mês (c/ previstas e imposto)<b>${fmt(r.total_do_mes)}</b></div></div>
      <table style="margin-top:14px"><thead><tr><th>Vencimento</th><th>Descrição</th><th>Fornecedor</th><th>Documento</th><th>Situação</th><th class="r">Valor</th></tr></thead><tbody>${linhas}</tbody></table>
      <p style="color:#9ca3af;margin-top:10px;font-size:10px">📎 = comprovante anexado no ERP · Gerado pelo Dator ERP</p></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Libere as janelas pop-up'); return; }
    w.document.write(html); w.document.close();
  }

  const ultimoEnvio = data?.envios?.[0];

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <input type="month" className="input max-w-[170px]" value={mes} onChange={e => setMes(e.target.value)} />
        {ultimoEnvio ? (
          <span className="text-xs inline-flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 rounded-lg px-2.5 py-1.5">
            <CheckCircle2 size={14} /> Enviado ao contador em {dhBR(ultimoEnvio.enviado_em)} por {ultimoEnvio.enviado_por || '—'}{ultimoEnvio.destinatario ? ` → ${ultimoEnvio.destinatario}` : ''}
            {data.envios.length > 1 && <span className="text-green-600/70">· {data.envios.length} envios</span>}
          </span>
        ) : data && (
          <span className="text-xs inline-flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={14} /> Este mês ainda não foi enviado ao contador
          </span>
        )}
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn-secondary btn-sm" onClick={imprimir} disabled={!data}><Printer size={14} /> PDF</button>
          <button className="btn-secondary btn-sm" onClick={exportar} disabled={!data}><FileSpreadsheet size={14} /> Excel</button>
          <button className="btn-primary btn-sm" onClick={() => setEnviar(true)} disabled={!data}><Send size={14} /> Registrar envio ao contador</button>
        </div>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              ['Despesas lançadas', fmt(r.lancado), `${r.contas} contas`, 'text-gray-900'],
              ['Pagas', fmt(r.pago), r.sem_comprovante ? `${r.sem_comprovante} sem comprovante` : `${r.com_comprovante} com comprovante`, 'text-green-600'],
              ['Pendentes', fmt(r.pendente), null, 'text-amber-700'],
              ['Vencidas', fmt(r.vencido), null, r.vencido > 0 ? 'text-red-600' : 'text-gray-400'],
              ['Fixas ainda sem lançamento', fmt(r.previsto), 'previstas', 'text-gray-500'],
              [`Imposto projetado (${String(r.aliquota).replace('.', ',')}%)`, fmt(r.imposto_projetado), `sobre ${fmt(r.faturamento)}`, 'text-indigo-700'],
            ].map(([l, v, sub, cls]) => (
              <div key={l} className="card p-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{l}</p>
                <p className={`text-lg font-bold mt-0.5 ${cls}`}>{v}</p>
                {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
              </div>
            ))}
          </div>

          <div className="card overflow-hidden">
            <div className="bg-gray-900 text-white px-4 py-2.5 flex items-center justify-between">
              <span className="font-semibold text-sm">Despesas de {mesBR(mes)} por grupo</span>
              <span className="text-sm font-bold">{fmt(r.total_do_mes)} <span className="text-xs font-normal text-gray-300">total do mês</span></span>
            </div>
            <div className="divide-y divide-gray-100">
              {data.por_grupo.map(g => {
                const aberto = abertos[g.grupo] ?? true;
                return (
                  <div key={g.grupo}>
                    <button onClick={() => setAbertos(a => ({ ...a, [g.grupo]: !aberto }))}
                      className="w-full flex items-center gap-2 px-4 py-2.5 bg-gray-50 hover:bg-gray-100 text-left">
                      {aberto ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                      <span className="font-semibold text-sm text-gray-900">{g.grupo}</span>
                      <span className="text-xs text-gray-400">{g.itens.length} conta(s)</span>
                      <span className="ml-auto text-xs text-gray-500">pago {fmt(g.pago)} · pendente {fmt(g.pendente)}{g.previsto ? ` · previsto ${fmt(g.previsto)}` : ''}</span>
                      <span className="font-bold text-sm text-gray-900 w-28 text-right">{fmt(g.total + g.previsto)}</span>
                    </button>
                    {aberto && (
                      <table className="w-full text-sm">
                        <tbody>
                          {g.itens.map(i => (
                            <tr key={i.id} className={`border-t border-gray-50 ${i.previsto || i.projetado ? 'text-gray-400 italic' : ''}`}>
                              <td className="pl-10 pr-3 py-1.5 text-gray-500 whitespace-nowrap w-28">{dBR(i.vencimento)}</td>
                              <td className="px-3 py-1.5">
                                <span className="text-gray-900">{i.descricao}</span>
                                <span className="block text-[11px] text-gray-400">{i.origem}{i.parceiro ? ` · ${i.parceiro}` : ''}{i.documento ? ` · doc ${i.documento}` : ''}{i.conta ? ` · ${i.conta}` : ''}</span>
                              </td>
                              <td className="px-3 py-1.5 whitespace-nowrap">
                                <span className={`badge ${COR_STATUS[i.status] || 'badge-gray'}`}>{i.status}</span>
                                {i.pago_em && <span className="text-[11px] text-gray-400 ml-1.5">{dBR(i.pago_em)}</span>}
                              </td>
                              <td className="px-3 py-1.5 w-10 text-center">
                                {i.comprovante ? (
                                  <a href={urlDoArquivo(i.comprovante)} target="_blank" rel="noreferrer" title="Abrir comprovante" className="text-primary-600"><Paperclip size={14} /></a>
                                ) : i.status === 'Pago' ? <span title="Pago sem comprovante anexado" className="text-red-400"><AlertTriangle size={14} /></span> : null}
                              </td>
                              <td className="px-4 py-1.5 text-right font-medium tabular-nums whitespace-nowrap w-32">{fmt(i.valor)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
              {!data.por_grupo.length && <p className="text-center py-12 text-sm text-gray-400">Nenhuma despesa neste mês.</p>}
            </div>
          </div>

          <div className="card">
            <div className="card-header flex items-center gap-2"><History size={15} className="text-gray-400" /><h2 className="font-semibold text-gray-900 text-sm">Envios ao contador em {mes.slice(0, 4)}</h2></div>
            <div className="divide-y divide-gray-50">
              {(historico?.envios || []).map(e => (
                <button key={e.id} onClick={() => setVerEnvio(e.id)} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="font-semibold w-20">{mesBR(String(e.competencia).slice(0, 7))}</span>
                  <span className="text-gray-500">{dhBR(e.enviado_em)}</span>
                  <span className="text-gray-700">{e.enviado_por || '—'}</span>
                  {e.destinatario && <span className="text-gray-500">→ {e.destinatario}</span>}
                  <span className="ml-auto font-medium">{fmt(e.resumo?.total_do_mes)}</span>
                  <span className="text-xs text-gray-400">{e.resumo?.contas} contas</span>
                </button>
              ))}
              {!(historico?.envios || []).length && <p className="text-center py-8 text-sm text-gray-400">Nenhum envio registrado neste ano.</p>}
            </div>
          </div>
        </>
      )}

      {enviar && (
        <Modal title={`Registrar envio do malote de ${mesBR(mes)}`} onClose={() => setEnviar(false)} size="md">
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Fica registrado quem enviou, quando, para quem e uma cópia exata das {r?.contas} contas e dos totais — se algo mudar depois, o que o contador recebeu continua conferível.
            </p>
            <label className="block text-sm">
              <span className="text-gray-700 font-medium">Para quem (contador / escritório / e-mail)</span>
              <input className="input mt-1" value={destinatario} onChange={e => setDestinatario(e.target.value)} placeholder="Ex.: Escritório Contábil XYZ — contato@xyz.com.br" />
            </label>
            <label className="block text-sm">
              <span className="text-gray-700 font-medium">Observação</span>
              <textarea className="input mt-1" rows={3} value={observacao} onChange={e => setObservacao(e.target.value)} placeholder="Ex.: reenvio com a nota do aluguel corrigida" />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-secondary" onClick={() => setEnviar(false)}>Cancelar</button>
              <button className="btn-primary" onClick={() => registrar.mutate()} disabled={registrar.isPending}>
                {registrar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Registrar envio
              </button>
            </div>
          </div>
        </Modal>
      )}

      {verEnvio && (
        <Modal title="Malote enviado — foto do momento" onClose={() => setVerEnvio(null)} size="xl">
          {envioAberto.isLoading || !envioAberto.data ? (
            <div className="flex justify-center p-10"><Loader2 className="animate-spin text-primary-500" size={24} /></div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {mesBR(String(envioAberto.data.competencia).slice(0, 7))} · enviado em {dhBR(envioAberto.data.enviado_em)} por {envioAberto.data.enviado_por || '—'}
                {envioAberto.data.destinatario ? ` → ${envioAberto.data.destinatario}` : ''}
                {envioAberto.data.observacao ? <span className="block text-gray-500 italic">{envioAberto.data.observacao}</span> : null}
              </p>
              <div className="flex justify-end">
                <button className="btn-secondary btn-sm" onClick={() => baixarExcel(`malote_${String(envioAberto.data.competencia).slice(0, 7)}_enviado`, [['lancamentos', linhasComCabecalho('lancamentos', envioAberto.data.itens)]])}>
                  <FileSpreadsheet size={14} /> Excel desta foto
                </button>
              </div>
              <TabelaGenerica linhas={linhasComCabecalho('lancamentos', envioAberto.data.itens)} vazio="Sem itens." />
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

// ═══════════════ MARGEM CONSOLIDADA ═══════════════
export function Margem() {
  const [ano, setAno] = useState(new Date().getFullYear());
  const { data, isLoading } = useQuery({ queryKey: ['contador-margem', ano], queryFn: () => api.get(`/contador/margem?ano=${ano}`) });
  const t = data?.total;

  const grafico = useMemo(() => {
    if (!data) return null;
    const ms = data.meses;
    return {
      labels: ms.map(m => mesBR(m.mes).slice(0, 3)),
      datasets: [
        { label: 'Receita', data: ms.map(m => m.receita), backgroundColor: 'rgba(99,102,241,0.75)', borderRadius: 4 },
        { label: 'Custos + despesas + impostos', data: ms.map(m => m.custos + m.despesas + m.impostos), backgroundColor: 'rgba(248,113,113,0.7)', borderRadius: 4 },
        { label: 'Lucro', data: ms.map(m => m.lucro), backgroundColor: ms.map(m => (m.lucro >= 0 ? 'rgba(34,197,94,0.8)' : 'rgba(239,68,68,0.9)')), borderRadius: 4 },
      ],
    };
  }, [data]);

  function exportar() {
    if (!data) return;
    const meses = data.meses.map(m => ({ Mês: mesBR(m.mes), Pedidos: m.pedidos, Receita: m.receita, Impostos: m.impostos, 'Custos (CMV)': m.custos, Despesas: m.despesas, Lucro: m.lucro, 'Margem líquida %': m.margem_pct, 'Margem bruta %': m.margem_bruta_pct }));
    meses.push({ Mês: 'TOTAL', Pedidos: t.pedidos, Receita: t.receita, Impostos: t.impostos, 'Custos (CMV)': t.custos, Despesas: t.despesas, Lucro: t.lucro, 'Margem líquida %': t.margem_pct, 'Margem bruta %': t.margem_bruta_pct });
    const dim = arr => arr.map(g => ({ Nome: g.label, Pedidos: g.pedidos, Receita: g.receita, Impostos: g.impostos, 'Custos (CMV)': g.custos, 'Lucro bruto': g.lucro_bruto, 'Margem %': g.margem_pct, 'Participação %': g.participacao_pct }));
    baixarExcel(`margem_consolidada_${ano}`, [['meses', meses], ['empresas', dim(data.por_empresa)], ['canais', dim(data.por_canal)]]).then(() => toast.success('Margem exportada'));
  }

  const anos = [0, 1, 2].map(i => new Date().getFullYear() - i);

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center gap-3">
        <select className="input max-w-[120px]" value={ano} onChange={e => setAno(Number(e.target.value))}>
          {anos.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {data && (
          <span className="text-xs text-gray-500">
            {data.empresa?.razao_social} · alíquota {String(data.aliquota).replace('.', ',')}% · meta de margem {pct(data.meta_margem_pct)}
          </span>
        )}
        <button className="btn-secondary btn-sm ml-auto" onClick={exportar} disabled={!data}><FileSpreadsheet size={14} /> Excel</button>
      </div>

      {isLoading || !data ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            {[
              ['Receita do ano', fmt(t.receita), `${t.pedidos} pedidos`, 'text-gray-900'],
              ['Custos (CMV)', fmt(t.custos), null, 'text-red-500'],
              ['Despesas', fmt(t.despesas), null, 'text-red-500'],
              ['Impostos', fmt(t.impostos), null, 'text-amber-700'],
              ['Lucro consolidado', fmt(t.lucro), `média ${fmt(t.media_mensal_lucro)}/mês`, t.lucro >= 0 ? 'text-green-600' : 'text-red-600'],
              ['Margem líquida', pct(t.margem_pct), `bruta ${pct(t.margem_bruta_pct)}`, t.margem_pct >= data.meta_margem_pct ? 'text-green-600' : 'text-amber-700'],
            ].map(([l, v, sub, cls]) => (
              <div key={l} className="card p-3">
                <p className="text-[11px] text-gray-500 uppercase tracking-wide">{l}</p>
                <p className={`text-lg font-bold mt-0.5 ${cls}`}>{v}</p>
                {sub && <p className="text-[11px] text-gray-400">{sub}</p>}
              </div>
            ))}
          </div>

          {(data.melhor_mes || data.pior_mes) && (
            <div className="flex flex-wrap gap-3 text-sm">
              {data.melhor_mes && <span className="inline-flex items-center gap-1.5 text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-1.5"><TrendingUp size={14} /> Melhor mês: {mesBR(data.melhor_mes.mes)} · {pct(data.melhor_mes.margem_pct)} · {fmt(data.melhor_mes.lucro)}</span>}
              {data.pior_mes && data.pior_mes.mes !== data.melhor_mes?.mes && <span className="inline-flex items-center gap-1.5 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5"><TrendingDown size={14} /> Pior mês: {mesBR(data.pior_mes.mes)} · {pct(data.pior_mes.margem_pct)} · {fmt(data.pior_mes.lucro)}</span>}
            </div>
          )}

          <div className="card p-4">
            <h2 className="font-semibold text-gray-900 text-sm mb-3">Receita × custos × lucro, mês a mês</h2>
            <div style={{ height: 260 }}>
              <Bar data={grafico} options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } } }, scales: { y: { ticks: { callback: v => fmt(v).replace(',00', '') } } } }} />
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                  <th className="px-4 py-2">Mês</th><th className="px-3 py-2 text-right">Pedidos</th><th className="px-3 py-2 text-right">Receita</th>
                  <th className="px-3 py-2 text-right">Impostos</th><th className="px-3 py-2 text-right">Custos (CMV)</th><th className="px-3 py-2 text-right">Despesas</th>
                  <th className="px-3 py-2 text-right">Lucro</th><th className="px-3 py-2 text-right">Margem bruta</th><th className="px-4 py-2 text-right">Margem líquida</th>
                </tr>
              </thead>
              <tbody>
                {data.meses.map(m => (
                  <tr key={m.mes} className={`border-b border-gray-50 ${m.futuro ? 'text-gray-300' : ''} ${m.abaixo_meta ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-4 py-2 font-medium">{mesBR(m.mes)}</td>
                    <td className="px-3 py-2 text-right">{m.pedidos || '—'}</td>
                    <td className="px-3 py-2 text-right">{m.receita ? fmt(m.receita) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.impostos ? fmt(m.impostos) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.custos ? fmt(m.custos) : '—'}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{m.despesas ? fmt(m.despesas) : '—'}</td>
                    <td className={`px-3 py-2 text-right font-semibold ${m.lucro > 0 ? 'text-green-600' : m.lucro < 0 ? 'text-red-600' : ''}`}>{m.receita || m.despesas ? fmt(m.lucro) : '—'}</td>
                    <td className="px-3 py-2 text-right">{m.receita ? pct(m.margem_bruta_pct) : '—'}</td>
                    <td className={`px-4 py-2 text-right font-bold ${m.abaixo_meta ? 'text-amber-700' : m.receita ? 'text-green-700' : ''}`}>{m.receita ? pct(m.margem_pct) : '—'}</td>
                  </tr>
                ))}
                <tr className="bg-gray-900 text-white font-bold">
                  <td className="px-4 py-2.5">TOTAL {ano}</td><td className="px-3 py-2.5 text-right">{t.pedidos}</td><td className="px-3 py-2.5 text-right">{fmt(t.receita)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(t.impostos)}</td><td className="px-3 py-2.5 text-right">{fmt(t.custos)}</td><td className="px-3 py-2.5 text-right">{fmt(t.despesas)}</td>
                  <td className="px-3 py-2.5 text-right">{fmt(t.lucro)}</td><td className="px-3 py-2.5 text-right">{pct(t.margem_bruta_pct)}</td><td className="px-4 py-2.5 text-right">{pct(t.margem_pct)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {[['Por empresa faturadora', data.por_empresa], ['Por canal de venda', data.por_canal]].map(([titulo, linhas]) => (
              <div key={titulo} className="card overflow-x-auto">
                <div className="card-header"><h2 className="font-semibold text-gray-900 text-sm">{titulo}</h2></div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                    <th className="px-4 py-2">Nome</th><th className="px-3 py-2 text-right">Pedidos</th><th className="px-3 py-2 text-right">Receita</th><th className="px-3 py-2 text-right">Lucro bruto</th><th className="px-3 py-2 text-right">Margem</th><th className="px-4 py-2 text-right">Participação</th>
                  </tr></thead>
                  <tbody>
                    {linhas.map(g => (
                      <tr key={g.key} className="border-b border-gray-50">
                        <td className="px-4 py-2 font-medium">{g.label}</td><td className="px-3 py-2 text-right">{g.pedidos}</td><td className="px-3 py-2 text-right">{fmt(g.receita)}</td>
                        <td className={`px-3 py-2 text-right font-semibold ${g.lucro_bruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(g.lucro_bruto)}</td>
                        <td className="px-3 py-2 text-right">{pct(g.margem_pct)}</td><td className="px-4 py-2 text-right text-gray-500">{pct(g.participacao_pct)}</td>
                      </tr>
                    ))}
                    {!linhas.length && <tr><td colSpan={6} className="text-center py-8 text-sm text-gray-400">Sem vendas em {ano}.</td></tr>}
                  </tbody>
                </table>
                <p className="px-4 py-2 text-[11px] text-gray-400">Margem após custo do produto e imposto — as despesas fixas não se dividem por {titulo === 'Por canal de venda' ? 'canal' : 'empresa'}.</p>
              </div>
            ))}
          </div>

          <div className="text-xs text-gray-400 flex flex-wrap gap-x-4 gap-y-1">
            {data.origens.map(o => <span key={o.label}><b className="text-gray-500">{o.label}:</b> {o.origem}</span>)}
          </div>
        </>
      )}
    </div>
  );
}
