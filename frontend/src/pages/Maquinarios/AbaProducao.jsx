import { useEffect, useState } from 'react';
import { Plus, Trash2, Loader2, Save, Factory } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Campo, Numero, Data, Tile, Barra, fmtNum, fmtPct, fmtData, hoje, erroMsg } from './comum';

/**
 * ABA PRODUÇÃO E DESGASTE.
 *
 * O desgaste é produção acumulada ÷ vida útil em unidades. A produção
 * chega de dois jeitos: sozinha, quando a etapa Produção de um pedido é
 * finalizada com o código da máquina, e à mão, pelo formulário abaixo.
 */
export default function AbaProducao({ maquina, onMudou }) {
  const c = maquina.calc;
  const [nova, setNova] = useState({ data: hoje(), produto: '', quantidade: null, perdas: null, horas: null, operador: '' });
  const [param, setParam] = useState({});
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    setParam({
      capacidade_hora: maquina.capacidade_hora, producao_inicial: maquina.producao_inicial,
      horas_iniciais: maquina.horas_iniciais, intervalo_revisao_unidades: maquina.intervalo_revisao_unidades,
      vida_util_unidades: maquina.vida_util_unidades,
    });
  }, [maquina]);

  async function lancar(e) {
    e.preventDefault();
    if (!(nova.quantidade > 0)) { toast.error('Informe a quantidade produzida'); return; }
    setEnviando(true);
    try {
      await api.post(`/maquinas/${maquina.id}/producoes`, nova);
      toast.success('Produção lançada');
      setNova(p => ({ ...p, produto: '', quantidade: null, perdas: null, horas: null }));
      onMudou();
    } catch (err) { toast.error(erroMsg(err)); } finally { setEnviando(false); }
  }

  async function excluir(p) {
    if (!confirm(`Excluir o lançamento de ${fmtNum(p.quantidade)} unidades de ${fmtData(p.data)}?`)) return;
    try { await api.delete(`/maquinas/${maquina.id}/producoes/${p.id}`); onMudou(); } catch (err) { toast.error(erroMsg(err)); }
  }

  async function salvarParametros() {
    try { await api.put(`/maquinas/${maquina.id}`, param); toast.success('Parâmetros salvos'); onMudou(); } catch (err) { toast.error(erroMsg(err)); }
  }

  const vidaUn = Number(maquina.vida_util_unidades) || 0;
  const observacao = c.desgaste_pct >= 100 ? 'Vida útil esgotada — planeje a troca.'
    : c.revisao === 'vencido' ? 'Revisão vencida. Registre a revisão na aba Manutenção.'
      : c.revisao === 'proximo' ? `Próximo da revisão (${fmtPct(c.progresso_revisao_pct)}).`
        : c.desgaste_pct >= 85 ? 'Desgaste alto. Acompanhe a reserva de reposição.'
          : 'Desgaste dentro do planejado.';

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-9 gap-2">
        <Tile titulo="Produção acumulada" valor={fmtNum(c.producao_acumulada)} sub="unidades" />
        <Tile titulo="Produção no ano" valor={fmtNum(c.producao_ano)} sub="unidades" />
        <Tile titulo="Média por hora" valor={fmtNum(c.media_hora)} sub="unidades/hora" />
        <Tile titulo="Horas de operação" valor={fmtNum(c.horas_operacao)} sub="horas" />
        <Tile titulo="Vida útil em unidades" valor={vidaUn ? fmtNum(vidaUn) : '—'} sub={vidaUn ? 'unidades' : 'desgaste pelo tempo'} />
        <Tile titulo="% de desgaste atual" valor={fmtPct(c.desgaste_pct)}><Barra pct={c.desgaste_pct} limiteAviso={70} limiteErro={90} /></Tile>
        <Tile titulo="Progresso até a revisão" valor={c.progresso_revisao_pct == null ? '—' : fmtPct(c.progresso_revisao_pct)}>
          {c.progresso_revisao_pct != null && <Barra pct={c.progresso_revisao_pct} limiteAviso={75} limiteErro={90} />}
        </Tile>
        <Tile titulo="Última medição" valor={fmtData(c.ultima_medicao)} sub={c.eficiencia_pct != null ? `eficiência ${fmtPct(c.eficiencia_pct)}` : null} />
        <Tile titulo="Próxima revisão por produção" valor={c.proxima_revisao_producao ? fmtNum(c.proxima_revisao_producao) : '—'}
          sub={c.custo_por_unidade != null ? `custo ${c.custo_por_unidade.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 4 })}/un` : null} />
      </div>
      <p className={`text-[12.5px] ${c.desgaste_pct >= 90 || c.revisao === 'vencido' ? 'text-red-600' : 'text-gray-600'}`}>
        <b>Observação:</b> {observacao}
      </p>

      <form onSubmit={lancar} className="rounded-lg border border-gray-200 p-3">
        <p className="text-[13px] font-semibold text-gray-800 mb-2 flex items-center gap-1.5"><Factory size={14} /> Lançar produção</p>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-2 items-end">
          <Campo label="Data"><Data value={nova.data} onChange={v => setNova(p => ({ ...p, data: v }))} /></Campo>
          <Campo label="Produto produzido" className="col-span-2">
            <input className="input" value={nova.produto} placeholder="Copo Long Drink" onChange={e => setNova(p => ({ ...p, produto: e.target.value }))} />
          </Campo>
          <Campo label="Quantidade" obrigatorio><Numero value={nova.quantidade} onChange={v => setNova(p => ({ ...p, quantidade: v }))} /></Campo>
          <Campo label="Perdas"><Numero value={nova.perdas} onChange={v => setNova(p => ({ ...p, perdas: v }))} /></Campo>
          <Campo label="Horas trabalhadas"><Numero value={nova.horas} casas={1} onChange={v => setNova(p => ({ ...p, horas: v }))} /></Campo>
          <Campo label="Operador"><input className="input" value={nova.operador} onChange={e => setNova(p => ({ ...p, operador: e.target.value }))} /></Campo>
        </div>
        <div className="flex justify-end mt-2">
          <button className="btn-primary btn-sm" disabled={enviando}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Lançar produção
          </button>
        </div>
      </form>

      <div>
        <p className="text-[13px] font-semibold text-gray-800 mb-1.5">Últimas produções</p>
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-gray-500 bg-gray-50">
                {['Data', 'Produto produzido', 'Quantidade', 'Horas', 'Eficiência', 'Desgaste gerado', 'Operador', 'Origem', ''].map(h =>
                  <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {maquina.producoes.length === 0 && (
                <tr><td colSpan={9} className="px-3 py-6 text-center text-gray-400">
                  Nenhuma produção ainda. Ela entra sozinha quando a etapa Produção de um pedido é finalizada com o código {maquina.codigo}.
                </td></tr>
              )}
              {maquina.producoes.slice(0, 50).map(p => {
                const q = Number(p.quantidade) || 0, perdas = Number(p.perdas) || 0;
                const efic = q + perdas > 0 ? (q / (q + perdas)) * 100 : null;
                return (
                  <tr key={p.id} className="border-t border-gray-100">
                    <td className="px-3 py-1.5 whitespace-nowrap">{fmtData(p.data)}</td>
                    <td className="px-3 py-1.5">{p.produto || '—'}</td>
                    <td className="px-3 py-1.5 text-right">{fmtNum(q)}</td>
                    <td className="px-3 py-1.5 text-right">{fmtNum(p.horas, 1)}</td>
                    <td className="px-3 py-1.5 text-right">{efic == null ? '—' : fmtPct(efic)}</td>
                    <td className="px-3 py-1.5 text-right">{vidaUn ? `${(q / vidaUn * 100).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%` : '—'}</td>
                    <td className="px-3 py-1.5">{p.operador || '—'}</td>
                    <td className="px-3 py-1.5">{p.origem === 'producao' ? 'Pedido' : 'Manual'}</td>
                    <td className="px-3 py-1.5 text-right">
                      <button className="btn-ghost p-1 text-red-500" title="Excluir" onClick={() => excluir(p)}><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <p className="text-[13px] font-semibold text-gray-800 mb-2">Parâmetros de desgaste</p>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 items-end">
          <Campo label="Capacidade (un/hora)"><Numero value={param.capacidade_hora} onChange={v => setParam(p => ({ ...p, capacidade_hora: v }))} /></Campo>
          <Campo label="Vida útil (unidades)"><Numero value={param.vida_util_unidades} onChange={v => setParam(p => ({ ...p, vida_util_unidades: v }))} /></Campo>
          <Campo label="Revisar a cada (un)"><Numero value={param.intervalo_revisao_unidades} onChange={v => setParam(p => ({ ...p, intervalo_revisao_unidades: v }))} /></Campo>
          <Campo label="Produção anterior ao sistema" dica="unidades já rodadas"><Numero value={param.producao_inicial} onChange={v => setParam(p => ({ ...p, producao_inicial: v }))} /></Campo>
          <Campo label="Horas anteriores ao sistema"><Numero value={param.horas_iniciais} casas={1} onChange={v => setParam(p => ({ ...p, horas_iniciais: v }))} /></Campo>
          <button type="button" className="btn-secondary h-[38px]" onClick={salvarParametros}><Save size={14} /> Salvar parâmetros</button>
        </div>
      </div>
    </div>
  );
}
