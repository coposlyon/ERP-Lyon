import { useEffect, useState } from 'react';
import { Save, Loader2, PiggyBank, Wallet, Coins, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Campo, Numero, Dinheiro, Leitura, fmtBRL, fmtData, fmtNum, erroMsg } from './comum';

/**
 * ABA DEPRECIAÇÃO E REPOSIÇÃO.
 *
 * Depreciação linear: (aquisição − residual) ÷ meses de vida útil. A
 * reposição olha para a frente: quanto falta juntar para a máquina nova,
 * descontando o que já está reservado e o que a usada deve render, e
 * quanto guardar por mês até a data da troca.
 */
export default function AbaDepreciacao({ maquina, onMudou }) {
  const c = maquina.calc;
  const [f, setF] = useState({});
  const [salvando, setSalvando] = useState(false);
  const [aporte, setAporte] = useState(null);

  useEffect(() => {
    setF({
      valor_aquisicao: maquina.valor_aquisicao, valor_residual: maquina.valor_residual,
      vida_util_anos: maquina.vida_util_anos, vida_util_unidades: maquina.vida_util_unidades,
      reserva_reposicao: maquina.reserva_reposicao, meta_reposicao: maquina.meta_reposicao,
      valor_venda_estimado: maquina.valor_venda_estimado, observacoes: maquina.observacoes || '',
    });
  }, [maquina]);
  const set = p => setF(x => ({ ...x, ...p }));

  // Prévia ao vivo do que muda antes de salvar.
  const meses = Math.max(1, (Number(f.vida_util_anos) || 0) * 12);
  const deprMensal = Math.max(0, (Number(f.valor_aquisicao) || 0) - (Number(f.valor_residual) || 0)) / meses;
  const diferenca = Math.max(0, (Number(f.meta_reposicao) || 0) - (Number(f.reserva_reposicao) || 0) - (Number(f.valor_venda_estimado) || 0));

  async function salvar() {
    setSalvando(true);
    try { await api.put(`/maquinas/${maquina.id}`, f); toast.success('Depreciação e reposição salvas'); onMudou(); } catch (err) { toast.error(erroMsg(err)); } finally { setSalvando(false); }
  }

  async function registrarAporte() {
    if (!(aporte > 0)) { toast.error('Informe o valor'); return; }
    try {
      await api.post(`/maquinas/${maquina.id}/eventos`, { tipo: 'reserva', valor: aporte, descricao: `Aporte de ${fmtBRL(aporte)} na reserva de reposição` });
      toast.success('Aporte somado à reserva'); setAporte(null); onMudou();
    } catch (err) { toast.error(erroMsg(err)); }
  }

  return (
    <div className="p-4 space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Campo label="Valor de aquisição (R$)"><Dinheiro value={f.valor_aquisicao} onChange={v => set({ valor_aquisicao: v })} /></Campo>
        <Campo label="Valor residual (R$)"><Dinheiro value={f.valor_residual} onChange={v => set({ valor_residual: v })} /></Campo>
        <Campo label="Vida útil em anos"><Numero value={f.vida_util_anos} onChange={v => set({ vida_util_anos: v })} /></Campo>
        <Campo label="Vida útil em unidades produzidas"><Numero value={f.vida_util_unidades} onChange={v => set({ vida_util_unidades: v })} /></Campo>
        <Campo label="Depreciação mensal (R$)" dica="calculada"><Leitura>{fmtBRL(deprMensal)}</Leitura></Campo>
        <Campo label="Depreciação acumulada (R$)" dica={`${fmtNum(c.meses_uso, 1)} meses de uso`}><Leitura>{fmtBRL(c.depreciacao_acumulada)}</Leitura></Campo>

        <Campo label="Reserva para reposição (R$)"><Dinheiro value={f.reserva_reposicao} onChange={v => set({ reserva_reposicao: v })} /></Campo>
        <Campo label="Meta de reposição (R$)" dica="preço da máquina nova"><Dinheiro value={f.meta_reposicao} onChange={v => set({ meta_reposicao: v })} /></Campo>
        <Campo label="Valor de venda estimado usado (R$)"><Dinheiro value={f.valor_venda_estimado} onChange={v => set({ valor_venda_estimado: v })} /></Campo>
        <Campo label="Reserva mensal sugerida (R$)" dica="para chegar na meta até a troca"><Leitura>{fmtBRL(c.reserva_mensal_sugerida)}</Leitura></Campo>
        <Campo label="Projeção de troca" dica={c.projecao_por === 'producao' ? 'pelo ritmo de produção' : c.projecao_por === 'tempo' ? 'pelo fim da vida útil' : ''}>
          <Leitura>{fmtData(c.projecao_troca)}</Leitura>
        </Campo>
        <Campo label="Observações"><input className="input" value={f.observacoes || ''} onChange={e => set({ observacoes: e.target.value })} /></Campo>
      </div>
      <div className="flex justify-between items-end gap-3 flex-wrap">
        <div className="flex items-end gap-2">
          <Campo label="Aporte na reserva (R$)"><Dinheiro value={aporte} onChange={setAporte} /></Campo>
          <button className="btn-secondary h-[38px]" onClick={registrarAporte}><PiggyBank size={14} /> Registrar aporte</button>
        </div>
        <button className="btn-primary" disabled={salvando} onClick={salvar}>
          {salvando ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-3">
        <div className="md:col-span-2 rounded-lg border border-gray-200 overflow-hidden">
          <p className="text-[13px] font-semibold text-gray-800 px-3 py-2 flex items-center gap-1.5"><BarChart3 size={14} /> Resumo financeiro e de reposição</p>
          <table className="w-full text-[12.5px]">
            <thead><tr className="text-left text-gray-500 bg-gray-50">
              <th className="px-3 py-1.5 font-medium">Descrição</th><th className="px-3 py-1.5 font-medium text-right">Valor (R$)</th><th className="px-3 py-1.5 font-medium">Observações</th>
            </tr></thead>
            <tbody>
              <Linha d="Aquisição inicial" v={maquina.valor_aquisicao} o="Valor pago na compra do equipamento" />
              <Linha d="Revisões acumuladas" v={c.revisoes_acumuladas} o="Total de revisões e manutenções registradas" />
              <Linha d="Peças trocadas" v={c.pecas_trocadas} o="Componentes e peças de reposição" />
              <Linha d="Valor investido total" v={c.investido_total} o="Aquisição + revisões + peças" forte />
              <Linha d="Depreciação acumulada" v={c.depreciacao_acumulada} o={`Desde ${fmtData(maquina.data_aquisicao)}`} />
              <Linha d="Valor contábil atual" v={c.valor_contabil} o="Aquisição − depreciação acumulada" forte />
              <Linha d="Custo mensal no rateio" v={c.custo_mensal} o={`Depreciação ${fmtBRL(c.depreciacao_do_mes)} + manutenção ${fmtBRL(c.manutencao_mensal)}${maquina.entra_no_rateio === false ? ' (fora do rateio)' : ''}`} />
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-gray-200 p-3 space-y-2.5 text-[13px]">
          <Resumo icone={PiggyBank} cor="text-amber-500" t="Saldo reservado para reposição" v={fmtBRL(f.reserva_reposicao)} />
          <Resumo icone={Wallet} cor="text-green-500" t="Valor previsto para nova máquina" v={fmtBRL(f.meta_reposicao)} />
          <Resumo icone={Coins} cor="text-blue-500" t="Venda estimada da usada" v={fmtBRL(f.valor_venda_estimado)} />
          <Resumo icone={Coins} cor="text-red-500" t="Diferença a complementar" v={fmtBRL(diferenca)} tom={diferenca > 0 ? 'text-red-600' : 'text-green-600'} />
        </div>
      </div>
    </div>
  );
}

function Linha({ d, v, o, forte }) {
  return (
    <tr className="border-t border-gray-100">
      <td className={`px-3 py-1.5 ${forte ? 'font-semibold text-gray-900' : ''}`}>{d}</td>
      <td className={`px-3 py-1.5 text-right ${forte ? 'font-semibold text-gray-900' : ''}`}>{fmtBRL(v)}</td>
      <td className="px-3 py-1.5 text-gray-500">{o}</td>
    </tr>
  );
}

function Resumo({ icone: I, cor, t, v, tom = 'text-gray-900' }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-gray-100 pb-2 last:border-0">
      <span className="flex items-center gap-2 text-gray-600"><I size={16} className={cor} /> {t}</span>
      <b className={tom}>{v}</b>
    </div>
  );
}
