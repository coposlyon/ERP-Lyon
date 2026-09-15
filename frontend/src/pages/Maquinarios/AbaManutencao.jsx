import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, CheckCircle2, Pencil, X, Save, Wrench } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  Campo, Numero, Dinheiro, Data, Pill, PERIODICIDADES, rotuloPeriodicidade, fmtData, fmtBRL, hoje, erroMsg,
} from './comum';

const DIAS = { diaria: 1, semanal: 7, quinzenal: 15, mensal: 30, bimestral: 60, trimestral: 91, semestral: 182, anual: 365 };
const somaDias = (iso, d) => { const x = new Date(`${iso || hoje()}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };

/**
 * ABA MANUTENÇÃO.
 *
 * Em cima, o registro da revisão (vira evento no histórico com o custo
 * realizado, e move a última/próxima revisão da máquina). Embaixo, o
 * checklist: cada item com a sua periodicidade e o botão de marcar como
 * executado, que empurra a próxima data.
 */
export default function AbaManutencao({ maquina, onMudou }) {
  const c = maquina.calc;
  const inicial = () => ({
    tipo: 'preventiva', periodicidade: 'semestral',
    ultima_revisao: hoje(), proxima_revisao: somaDias(hoje(), DIAS.semestral),
    intervalo_revisao_unidades: maquina.intervalo_revisao_unidades,
    status: 'concluido', responsavel: maquina.responsavel || '', fornecedor: maquina.fornecedor_nome || '',
    custo_previsto: null, custo_realizado: null, horas_parada: null, observacao: '',
  });
  const [rev, setRev] = useState(inicial);
  const [enviando, setEnviando] = useState(false);
  const [novoItem, setNovoItem] = useState(null);
  const [editando, setEditando] = useState(null);
  const [executando, setExecutando] = useState(null);

  useEffect(() => { setRev(inicial()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [maquina.id]);
  const setR = patch => setRev(p => {
    const n = { ...p, ...patch };
    if (patch.periodicidade || patch.ultima_revisao) n.proxima_revisao = somaDias(n.ultima_revisao, DIAS[n.periodicidade] || 30);
    return n;
  });

  async function registrarRevisao(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      await api.post(`/maquinas/${maquina.id}/revisoes`, rev);
      toast.success(rev.status === 'concluido' ? 'Revisão registrada' : 'Revisão agendada');
      setRev(inicial());
      onMudou();
    } catch (err) { toast.error(erroMsg(err)); } finally { setEnviando(false); }
  }

  async function salvarItem(item) {
    if (!item.item?.trim()) { toast.error('Descreva o item'); return; }
    try {
      if (item.id) await api.put(`/maquinas/${maquina.id}/manutencoes/${item.id}`, item);
      else await api.post(`/maquinas/${maquina.id}/manutencoes`, item);
      setNovoItem(null); setEditando(null); onMudou();
    } catch (err) { toast.error(erroMsg(err)); }
  }

  async function excluirItem(item) {
    if (!confirm(`Excluir "${item.item}" do checklist?`)) return;
    try { await api.delete(`/maquinas/${maquina.id}/manutencoes/${item.id}`); onMudou(); } catch (err) { toast.error(erroMsg(err)); }
  }

  async function executar() {
    try {
      await api.post(`/maquinas/${maquina.id}/manutencoes/${executando.id}/executar`, executando.form);
      toast.success('Marcado como executado');
      setExecutando(null); onMudou();
    } catch (err) { toast.error(erroMsg(err)); }
  }

  const situacaoRevisao = { vencido: 'Vencida', proximo: 'Próxima', em_dia: 'Em dia', sem_plano: 'Sem plano', sem_data: 'Sem data' }[c.revisao];

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 flex-wrap text-[12.5px] text-gray-600">
        <span>Última revisão: <b className="text-gray-900">{fmtData(maquina.ultima_revisao)}</b></span>
        <span>Próxima: <b className="text-gray-900">{fmtData(maquina.proxima_revisao)}</b></span>
        <span className="flex items-center gap-1">Situação: <Pill valor={c.revisao === 'proximo' ? 'proximo' : c.revisao}>{situacaoRevisao}</Pill></span>
        <span>Manutenção no custo mensal: <b className="text-gray-900">{fmtBRL(c.manutencao_mensal)}</b>
          {c.manutencao_fonte && <span className="text-gray-400"> ({c.manutencao_fonte === 'realizado' ? 'média realizada 12 meses' : 'previsto no checklist'})</span>}
        </span>
      </div>

      <form onSubmit={registrarRevisao} className="rounded-lg border border-gray-200 p-3">
        <p className="text-[13px] font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Wrench size={14} /> Registrar revisão</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          <Campo label="Tipo de revisão" obrigatorio>
            <select className="input" value={rev.tipo} onChange={e => setR({ tipo: e.target.value })}>
              <option value="preventiva">Preventiva</option><option value="preditiva">Preditiva</option><option value="corretiva">Corretiva</option>
            </select>
          </Campo>
          <Campo label="Periodicidade" obrigatorio>
            <select className="input" value={rev.periodicidade} onChange={e => setR({ periodicidade: e.target.value })}>
              {PERIODICIDADES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </Campo>
          <Campo label={rev.status === 'concluido' ? 'Data da revisão' : 'Data prevista'}>
            <Data value={rev.ultima_revisao} onChange={v => setR({ ultima_revisao: v })} />
          </Campo>
          <Campo label="Próxima revisão"><Data value={rev.proxima_revisao} onChange={v => setRev(p => ({ ...p, proxima_revisao: v }))} /></Campo>
          <Campo label="Produção para revisão" obrigatorio dica="unidades entre revisões">
            <Numero value={rev.intervalo_revisao_unidades} onChange={v => setRev(p => ({ ...p, intervalo_revisao_unidades: v }))} />
          </Campo>
          <Campo label="Status" obrigatorio>
            <select className="input" value={rev.status} onChange={e => setRev(p => ({ ...p, status: e.target.value }))}>
              <option value="concluido">Concluída</option><option value="agendado">Agendada</option><option value="pendente">Pendente</option>
            </select>
          </Campo>
          <Campo label="Responsável" obrigatorio><input className="input" value={rev.responsavel} onChange={e => setRev(p => ({ ...p, responsavel: e.target.value }))} required /></Campo>
          <Campo label="Fornecedor de manutenção"><input className="input" value={rev.fornecedor} onChange={e => setRev(p => ({ ...p, fornecedor: e.target.value }))} /></Campo>
          <Campo label="Custo previsto (R$)"><Dinheiro value={rev.custo_previsto} onChange={v => setRev(p => ({ ...p, custo_previsto: v }))} /></Campo>
          <Campo label="Custo realizado (R$)"><Dinheiro value={rev.custo_realizado} disabled={rev.status !== 'concluido'} onChange={v => setRev(p => ({ ...p, custo_realizado: v }))} /></Campo>
          <Campo label="Tempo de parada"><Numero value={rev.horas_parada} casas={1} sufixo="horas" onChange={v => setRev(p => ({ ...p, horas_parada: v }))} /></Campo>
          <Campo label="Observações"><input className="input" value={rev.observacao} onChange={e => setRev(p => ({ ...p, observacao: e.target.value }))} /></Campo>
        </div>
        <div className="flex justify-between items-center mt-2 gap-2 flex-wrap">
          <p className="text-[11.5px] text-gray-500">Concluída zera o contador de produção da revisão e, se a máquina estava em manutenção, volta para operação.</p>
          <button className="btn-primary btn-sm" disabled={enviando}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Registrar revisão
          </button>
        </div>
      </form>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[13px] font-semibold text-gray-800">Checklist de manutenção</p>
          <button className="btn-secondary btn-sm" onClick={() => setNovoItem({ item: '', periodicidade: 'mensal', tipo: 'preventiva', ultima_execucao: null, responsavel: '', custo_previsto: null })}>
            <Plus size={13} /> Adicionar item
          </button>
        </div>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50">
                {['Item', 'Periodicidade', 'Última execução', 'Próxima execução', 'Responsável', 'Custo previsto', 'Status', 'Ação', ''].map(h =>
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {novoItem && <LinhaItemEdicao item={novoItem} onChange={setNovoItem} onSalvar={() => salvarItem(novoItem)} onCancelar={() => setNovoItem(null)} />}
              {maquina.checklist.length === 0 && !novoItem && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">Sem itens. Adicione limpeza, lubrificação, troca de mangueira… cada um com a sua periodicidade.</td></tr>
              )}
              {maquina.checklist.map(item => (editando?.id === item.id
                ? <LinhaItemEdicao key={item.id} item={editando} onChange={setEditando} onSalvar={() => salvarItem(editando)} onCancelar={() => setEditando(null)} />
                : (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5">{item.item}</td>
                    <td className="px-3 py-1.5">{rotuloPeriodicidade(item.periodicidade)}</td>
                    <td className="px-3 py-1.5">{fmtData(item.ultima_execucao)}</td>
                    <td className="px-3 py-1.5">{fmtData(item.proxima_execucao)}</td>
                    <td className="px-3 py-1.5">{item.responsavel || '—'}</td>
                    <td className="px-3 py-1.5 text-right">{fmtBRL(item.custo_previsto)}</td>
                    <td className="px-3 py-1.5"><Pill valor={item.situacao} /></td>
                    <td className="px-3 py-1.5">
                      <button className="btn-secondary btn-sm py-0.5 whitespace-nowrap"
                        onClick={() => setExecutando({ ...item, form: { data: hoje(), custo: item.custo_previsto, responsavel: item.responsavel || '', horas_parada: null, observacao: '' } })}>
                        <CheckCircle2 size={13} /> Marcar como executado
                      </button>
                    </td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-right">
                      <button className="btn-ghost p-1 text-blue-600" title="Editar" onClick={() => setEditando({ ...item })}><Pencil size={13} /></button>
                      <button className="btn-ghost p-1 text-red-500" title="Excluir" onClick={() => excluirItem(item)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                )))}
            </tbody>
          </table>
        </div>
      </div>

      {executando && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setExecutando(null)}>
          <div className="card w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">Executado: {executando.item}</p>
              <button className="btn-ghost p-1" onClick={() => setExecutando(null)}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Data"><Data value={executando.form.data} onChange={v => setExecutando(x => ({ ...x, form: { ...x.form, data: v } }))} /></Campo>
              <Campo label="Custo (R$)"><Dinheiro value={executando.form.custo} onChange={v => setExecutando(x => ({ ...x, form: { ...x.form, custo: v } }))} /></Campo>
              <Campo label="Responsável"><input className="input" value={executando.form.responsavel} onChange={e => setExecutando(x => ({ ...x, form: { ...x.form, responsavel: e.target.value } }))} /></Campo>
              <Campo label="Tempo de parada"><Numero value={executando.form.horas_parada} casas={1} sufixo="h" onChange={v => setExecutando(x => ({ ...x, form: { ...x.form, horas_parada: v } }))} /></Campo>
              <Campo label="Observação" className="col-span-2"><input className="input" value={executando.form.observacao} onChange={e => setExecutando(x => ({ ...x, form: { ...x.form, observacao: e.target.value } }))} /></Campo>
            </div>
            <p className="text-[11.5px] text-gray-500">A próxima execução passa para {fmtData(somaDias(executando.form.data, DIAS[executando.periodicidade] || 30))}. O custo entra no histórico e na manutenção do rateio.</p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setExecutando(null)}>Cancelar</button>
              <button className="btn-primary" onClick={executar}><CheckCircle2 size={15} /> Confirmar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LinhaItemEdicao({ item, onChange, onSalvar, onCancelar }) {
  const set = p => onChange({ ...item, ...p });
  return (
    <tr className="border-t border-gray-100 bg-blue-50/40">
      <td className="px-2 py-1.5"><input className="input py-1" autoFocus value={item.item} placeholder="Limpeza geral" onChange={e => set({ item: e.target.value })} /></td>
      <td className="px-2 py-1.5">
        <select className="input py-1" value={item.periodicidade} onChange={e => set({ periodicidade: e.target.value, proxima_execucao: undefined })}>
          {PERIODICIDADES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </td>
      <td className="px-2 py-1.5"><Data value={item.ultima_execucao} onChange={v => set({ ultima_execucao: v, proxima_execucao: undefined })} /></td>
      <td className="px-2 py-1.5 text-[11.5px] text-gray-500">calculada</td>
      <td className="px-2 py-1.5"><input className="input py-1" value={item.responsavel || ''} onChange={e => set({ responsavel: e.target.value })} /></td>
      <td className="px-2 py-1.5"><Dinheiro value={item.custo_previsto} onChange={v => set({ custo_previsto: v })} /></td>
      <td className="px-2 py-1.5" colSpan={2} />
      <td className="px-2 py-1.5 whitespace-nowrap text-right">
        <button className="btn-ghost p-1 text-green-600" title="Salvar" onClick={onSalvar}><Save size={14} /></button>
        <button className="btn-ghost p-1" title="Cancelar" onClick={onCancelar}><X size={14} /></button>
      </td>
    </tr>
  );
}
