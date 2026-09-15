import { useMemo, useState } from 'react';
import { Filter, Plus, Trash2, X, Eye, Download } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import {
  Campo, Numero, Dinheiro, Data, Pill, Menu, TIPOS_EVENTO, fmtData, fmtBRL, fmtNum, hoje, erroMsg, baixarCSV,
} from './comum';

const NOVOS = { parada: 'Parada', retomada: 'Retomada', manutencao: 'Manutenção avulsa', marco: 'Anotação / marco' };

/**
 * ABA HISTÓRICO — tudo o que aconteceu com a máquina, com filtro.
 *
 * Parada põe a máquina em manutenção; retomada devolve à operação. O
 * custo de um evento é custo realizado e entra na manutenção do rateio.
 */
export default function AbaHistorico({ maquina, onMudou }) {
  const [filtro, setFiltro] = useState({ de: '', ate: '', tipo: '', responsavel: '', status: '' });
  const [novo, setNovo] = useState(null);
  const [vendo, setVendo] = useState(null);

  const responsaveis = useMemo(() => [...new Set(maquina.eventos.map(e => e.responsavel).filter(Boolean))].sort(), [maquina.eventos]);
  const lista = maquina.eventos.filter(e =>
    (!filtro.de || e.data >= filtro.de) && (!filtro.ate || e.data <= filtro.ate)
    && (!filtro.tipo || e.tipo === filtro.tipo) && (!filtro.responsavel || e.responsavel === filtro.responsavel)
    && (!filtro.status || e.status === filtro.status));
  const totalCusto = lista.reduce((s, e) => s + (e.status !== 'cancelado' ? Number(e.custo) || 0 : 0), 0);

  async function salvarNovo() {
    try {
      await api.post(`/maquinas/${maquina.id}/eventos`, novo);
      toast.success('Evento registrado'); setNovo(null); onMudou();
    } catch (err) { toast.error(erroMsg(err)); }
  }
  async function mudarStatus(e, status) {
    try { await api.put(`/maquinas/${maquina.id}/eventos/${e.id}`, { status }); onMudou(); } catch (err) { toast.error(erroMsg(err)); }
  }
  async function excluir(e) {
    if (!confirm('Excluir este evento do histórico? O custo dele sai das contas.')) return;
    try { await api.delete(`/maquinas/${maquina.id}/eventos/${e.id}`); onMudou(); } catch (err) { toast.error(erroMsg(err)); }
  }
  function exportar() {
    baixarCSV(`historico_${maquina.codigo}.csv`,
      ['Data', 'Evento', 'Descrição', 'Responsável', 'Fornecedor', 'Custo', 'Produção impactada', 'Horas parada', 'Status'],
      lista.map(e => [fmtData(e.data), TIPOS_EVENTO[e.tipo] || e.tipo, e.descricao, e.responsavel, e.fornecedor,
        String(Number(e.custo) || 0).replace('.', ','), e.producao_impactada, e.horas_parada, e.status]));
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-end gap-2 flex-wrap">
        <Campo label="Período — de"><Data value={filtro.de} onChange={v => setFiltro(f => ({ ...f, de: v || '' }))} /></Campo>
        <Campo label="até"><Data value={filtro.ate} onChange={v => setFiltro(f => ({ ...f, ate: v || '' }))} /></Campo>
        <Campo label="Tipo de evento">
          <select className="input" value={filtro.tipo} onChange={e => setFiltro(f => ({ ...f, tipo: e.target.value }))}>
            <option value="">Todos</option>
            {Object.entries(TIPOS_EVENTO).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Campo>
        <Campo label="Responsável">
          <select className="input" value={filtro.responsavel} onChange={e => setFiltro(f => ({ ...f, responsavel: e.target.value }))}>
            <option value="">Todos</option>
            {responsaveis.map(r => <option key={r}>{r}</option>)}
          </select>
        </Campo>
        <Campo label="Status">
          <select className="input" value={filtro.status} onChange={e => setFiltro(f => ({ ...f, status: e.target.value }))}>
            <option value="">Todos</option>
            <option value="concluido">Concluído</option><option value="agendado">Agendado</option>
            <option value="pendente">Pendente</option><option value="cancelado">Cancelado</option>
          </select>
        </Campo>
        <button className="btn-secondary h-[38px]" onClick={() => setFiltro({ de: '', ate: '', tipo: '', responsavel: '', status: '' })}><Filter size={14} /> Limpar filtros</button>
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary h-[38px]" onClick={exportar}><Download size={14} /> Exportar</button>
          <Menu className="btn-primary h-[38px]" icone={Plus} rotulo="Novo evento"
            itens={Object.entries(NOVOS).map(([tipo, label]) => ({
              label, onClick: () => setNovo({ tipo, data: hoje(), descricao: '', responsavel: '', custo: null, horas_parada: null, producao_impactada: null, status: 'concluido' }),
            }))} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50">
              {['Data', 'Evento', 'Descrição', 'Responsável', 'Custo (R$)', 'Produção impactada', 'Status', 'Ações'].map(h =>
                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-gray-400">Nenhum evento no filtro.</td></tr>}
            {lista.map(e => (
              <tr key={e.id} className="border-t border-gray-100">
                <td className="px-3 py-1.5 whitespace-nowrap">{fmtData(e.data)}</td>
                <td className="px-3 py-1.5 whitespace-nowrap">{TIPOS_EVENTO[e.tipo] || e.tipo}</td>
                <td className="px-3 py-1.5 max-w-[420px] truncate" title={e.descricao}>{e.descricao || '—'}</td>
                <td className="px-3 py-1.5">{e.responsavel || '—'}</td>
                <td className="px-3 py-1.5 text-right">{fmtBRL(e.custo)}</td>
                <td className="px-3 py-1.5 text-right">{e.producao_impactada == null ? '—' : fmtNum(e.producao_impactada)}</td>
                <td className="px-3 py-1.5"><Pill valor={e.status} /></td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <button className="btn-ghost p-1" title="Ver" onClick={() => setVendo(e)}><Eye size={14} /></button>
                  <Menu itens={[
                    e.status !== 'concluido' && { label: 'Marcar como concluído', onClick: () => mudarStatus(e, 'concluido') },
                    e.status !== 'cancelado' && { label: 'Cancelar evento', onClick: () => mudarStatus(e, 'cancelado') },
                    e.tipo !== 'cadastro' && { label: 'Excluir', icone: Trash2, perigo: true, onClick: () => excluir(e) },
                  ]} />
                </td>
              </tr>
            ))}
          </tbody>
          {lista.length > 0 && (
            <tfoot><tr className="border-t border-gray-200 font-semibold">
              <td className="px-3 py-1.5" colSpan={4}>{lista.length} evento(s)</td>
              <td className="px-3 py-1.5 text-right">{fmtBRL(totalCusto)}</td><td colSpan={3} />
            </tr></tfoot>
          )}
        </table>
      </div>

      {novo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setNovo(null)}>
          <div className="card w-full max-w-lg p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">{NOVOS[novo.tipo]} — {maquina.codigo}</p>
              <button className="btn-ghost p-1" onClick={() => setNovo(null)}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Data"><Data value={novo.data} onChange={v => setNovo(x => ({ ...x, data: v }))} /></Campo>
              <Campo label="Responsável"><input className="input" value={novo.responsavel} onChange={e => setNovo(x => ({ ...x, responsavel: e.target.value }))} /></Campo>
              <Campo label="Descrição" className="col-span-2"><input className="input" autoFocus value={novo.descricao} onChange={e => setNovo(x => ({ ...x, descricao: e.target.value }))} /></Campo>
              {novo.tipo !== 'retomada' && <Campo label="Custo (R$)"><Dinheiro value={novo.custo} onChange={v => setNovo(x => ({ ...x, custo: v }))} /></Campo>}
              {['parada', 'manutencao'].includes(novo.tipo) && <Campo label="Horas parada"><Numero value={novo.horas_parada} casas={1} onChange={v => setNovo(x => ({ ...x, horas_parada: v }))} /></Campo>}
              <Campo label="Produção impactada (un)"><Numero value={novo.producao_impactada} onChange={v => setNovo(x => ({ ...x, producao_impactada: v }))} /></Campo>
            </div>
            {novo.tipo === 'parada' && maquina.status === 'operacao' && <p className="text-[11.5px] text-amber-600">A máquina passa para “Em manutenção”.</p>}
            {novo.tipo === 'retomada' && maquina.status === 'manutencao' && <p className="text-[11.5px] text-green-600">A máquina volta para “Em operação”.</p>}
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="btn-primary" onClick={salvarNovo}>Registrar</button>
            </div>
          </div>
        </div>
      )}

      {vendo && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setVendo(null)}>
          <div className="card w-full max-w-lg p-4 space-y-2 text-[13px]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">{TIPOS_EVENTO[vendo.tipo] || vendo.tipo} — {fmtData(vendo.data)}</p>
              <button className="btn-ghost p-1" onClick={() => setVendo(null)}><X size={16} /></button>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{vendo.descricao || '—'}</p>
            <div className="grid grid-cols-2 gap-1 text-gray-600">
              <span>Responsável: <b>{vendo.responsavel || '—'}</b></span>
              <span>Fornecedor: <b>{vendo.fornecedor || '—'}</b></span>
              <span>Custo: <b>{fmtBRL(vendo.custo)}</b></span>
              <span>Horas parada: <b>{vendo.horas_parada ?? '—'}</b></span>
              <span>Produção impactada: <b>{vendo.producao_impactada == null ? '—' : fmtNum(vendo.producao_impactada)}</b></span>
              <span className="flex items-center gap-1">Status: <Pill valor={vendo.status} /></span>
              <span className="col-span-2 text-[11.5px] text-gray-400">Registrado em {new Date(vendo.created_at).toLocaleString('pt-BR')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
