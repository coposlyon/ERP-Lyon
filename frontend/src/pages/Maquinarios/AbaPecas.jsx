import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Pencil, Save, Loader2, RefreshCw, X, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { Campo, Numero, Dinheiro, Data, Pill, fmtData, fmtBRL, fmtNum, hoje, erroMsg } from './comum';

const CATEGORIAS = ['Pneumático', 'Elétrico', 'Eletrônico', 'Mecânico', 'Hidráulico', 'Consumível', 'Informática', 'Outro'];
const VIDAS = [[3, '3 meses'], [6, '6 meses'], [12, '1 ano'], [18, '18 meses'], [24, '2 anos'], [36, '3 anos'], [48, '4 anos'], [60, '5 anos']];

/**
 * ABA PEÇAS E COMPONENTES.
 *
 * O cadastro de peças é um só para todas as máquinas; `Compatibilidade`
 * diz em quais ela serve. Trocar a peça baixa o estoque, move a próxima
 * troca e lança o custo no histórico da máquina.
 */
export default function AbaPecas({ maquina, maquinas, onMudou }) {
  const qc = useQueryClient();
  const [todas, setTodas] = useState(false);
  const vazio = () => ({
    codigo: '', nome: '', categoria: CATEGORIAS[0], fabricante: '', fornecedor_nome: maquina.fornecedor_nome || '',
    fornecedor_telefone: maquina.fornecedor_telefone || '', valor_unitario: null, estoque: null, estoque_minimo: null,
    vida_util_meses: 24, ultima_troca: null, proxima_troca: null, maquinas: [maquina.id], observacao: '',
  });
  const [f, setF] = useState(vazio);
  const [salvando, setSalvando] = useState(false);
  const [trocando, setTrocando] = useState(null);

  const { data: pecas = [], isLoading } = useQuery({
    queryKey: ['maquina-pecas', todas ? 'todas' : maquina.id],
    queryFn: () => api.get(`/maquinas/pecas${todas ? '' : `?maquina_id=${maquina.id}`}`),
  });
  const { data: sugestao } = useQuery({
    queryKey: ['maquina-pecas-codigo', pecas.length],
    queryFn: () => api.get('/maquinas/pecas/proximo-codigo'),
  });

  useEffect(() => { setF(vazio()); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [maquina.id]);
  useEffect(() => { if (!f.id && !f.codigo && sugestao?.codigo) setF(p => ({ ...p, codigo: sugestao.codigo })); }, [sugestao, f.id, f.codigo]);

  const set = patch => setF(p => {
    const n = { ...p, ...patch };
    if ((patch.ultima_troca !== undefined || patch.vida_util_meses !== undefined) && n.ultima_troca && n.vida_util_meses) {
      const d = new Date(`${n.ultima_troca}T12:00:00Z`);
      d.setUTCMonth(d.getUTCMonth() + Number(n.vida_util_meses));
      n.proxima_troca = d.toISOString().slice(0, 10);
    }
    return n;
  });
  const recarregar = () => { qc.invalidateQueries({ queryKey: ['maquina-pecas'] }); qc.invalidateQueries({ queryKey: ['maquina-pecas-codigo'] }); };

  async function salvar() {
    if (!f.codigo || !f.nome || f.valor_unitario == null || f.estoque == null || f.estoque_minimo == null) {
      toast.error('Preencha código, nome, valor, estoque e estoque mínimo'); return;
    }
    setSalvando(true);
    try {
      if (f.id) await api.put(`/maquinas/pecas/${f.id}`, f);
      else await api.post('/maquinas/pecas', f);
      toast.success(f.id ? 'Peça atualizada' : 'Peça adicionada');
      setF({ ...vazio(), codigo: '' });
      recarregar();
    } catch (err) { toast.error(erroMsg(err)); } finally { setSalvando(false); }
  }

  async function excluir(p) {
    if (!confirm(`Excluir a peça ${p.codigo} ${p.nome}? Ela sai de todas as máquinas.`)) return;
    try { await api.delete(`/maquinas/pecas/${p.id}`); recarregar(); } catch (err) { toast.error(erroMsg(err)); }
  }

  async function confirmarTroca(forcar = false) {
    try {
      await api.post(`/maquinas/pecas/${trocando.id}/trocar`, { ...trocando.form, maquina_id: maquina.id, forcar });
      toast.success('Troca registrada no histórico');
      setTrocando(null); recarregar(); onMudou();
    } catch (err) {
      if (err?.precisa_confirmar && confirm(`${err.error} Registrar a troca mesmo assim?`)) return confirmarTroca(true);
      toast.error(erroMsg(err));
    }
    return null;
  }

  const nomeMaquina = useMemo(() => new Map(maquinas.map(m => [m.id, m.codigo])), [maquinas]);

  return (
    <div className="p-4 space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
        <Campo label="Código da peça" obrigatorio><input className="input uppercase" value={f.codigo} onChange={e => set({ codigo: e.target.value.toUpperCase() })} /></Campo>
        <Campo label="Nome da peça" obrigatorio><input className="input" value={f.nome} onChange={e => set({ nome: e.target.value })} /></Campo>
        <Campo label="Categoria" obrigatorio>
          <select className="input" value={f.categoria || ''} onChange={e => set({ categoria: e.target.value })}>
            {CATEGORIAS.map(c => <option key={c}>{c}</option>)}
          </select>
        </Campo>
        <Campo label="Fabricante"><input className="input" value={f.fabricante || ''} onChange={e => set({ fabricante: e.target.value })} /></Campo>
        <Campo label="Fornecedor"><input className="input" value={f.fornecedor_nome || ''} onChange={e => set({ fornecedor_nome: e.target.value })} /></Campo>
        <Campo label="Telefone do fornecedor"><input className="input" value={f.fornecedor_telefone || ''} onChange={e => set({ fornecedor_telefone: e.target.value })} /></Campo>

        <Campo label="Valor unitário (R$)" obrigatorio><Dinheiro value={f.valor_unitario} onChange={v => set({ valor_unitario: v })} /></Campo>
        <Campo label="Quantidade em estoque" obrigatorio><Numero value={f.estoque} onChange={v => set({ estoque: v })} /></Campo>
        <Campo label="Estoque mínimo" obrigatorio><Numero value={f.estoque_minimo} onChange={v => set({ estoque_minimo: v })} /></Campo>
        <Campo label="Vida útil estimada">
          <select className="input" value={f.vida_util_meses || ''} onChange={e => set({ vida_util_meses: e.target.value ? Number(e.target.value) : null })}>
            <option value="">—</option>
            {VIDAS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Campo>
        <Campo label="Última troca"><Data value={f.ultima_troca} onChange={v => set({ ultima_troca: v })} /></Campo>
        <Campo label="Próxima troca"><Data value={f.proxima_troca} onChange={v => setF(p => ({ ...p, proxima_troca: v }))} /></Campo>

        <Campo label="Observações" className="col-span-2 md:col-span-4">
          <input className="input" value={f.observacao || ''} onChange={e => set({ observacao: e.target.value })} />
        </Campo>
        <Campo label="Compatibilidade" className="col-span-2">
          <Compatibilidade maquinas={maquinas} valor={f.maquinas || []} onChange={v => set({ maquinas: v })} />
        </Campo>
      </div>
      <div className="flex justify-end gap-2">
        <button className="btn-secondary btn-sm" onClick={() => setF({ ...vazio(), codigo: '' })}>{f.id ? 'Cancelar edição' : 'Limpar'}</button>
        <button className="btn-primary btn-sm" disabled={salvando} onClick={salvar}>
          {salvando ? <Loader2 size={14} className="animate-spin" /> : f.id ? <Save size={14} /> : <Plus size={14} />}
          {f.id ? 'Salvar peça' : 'Adicionar peça'}
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-gray-800">{todas ? 'Todas as peças cadastradas' : `Peças compatíveis com ${maquina.codigo}`}</p>
        <label className="flex items-center gap-1.5 text-[12px] text-gray-600">
          <input type="checkbox" checked={todas} onChange={e => setTodas(e.target.checked)} /> Mostrar todas
        </label>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-gray-500 bg-gray-50">
              {['Código', 'Componente / Peça', 'Categoria', 'Fornecedor', 'Custo (R$)', 'Estoque', 'Última troca', 'Próxima troca', 'Máquinas', 'Status', 'Ações'].map(h =>
                <th key={h} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={11} className="px-3 py-6 text-center"><Loader2 size={16} className="animate-spin inline" /></td></tr>}
            {!isLoading && pecas.length === 0 && <tr><td colSpan={11} className="px-3 py-6 text-center text-gray-400">Nenhuma peça {todas ? 'cadastrada' : 'ligada a esta máquina'}.</td></tr>}
            {pecas.map(p => (
              <tr key={p.id} className={`border-t border-gray-100 ${f.id === p.id ? 'bg-blue-50/50' : ''}`}>
                <td className="px-3 py-1.5 font-mono">{p.codigo}</td>
                <td className="px-3 py-1.5">{p.nome}</td>
                <td className="px-3 py-1.5">{p.categoria || '—'}</td>
                <td className="px-3 py-1.5">{p.fornecedor_nome || '—'}</td>
                <td className="px-3 py-1.5 text-right">{fmtBRL(p.valor_unitario)}</td>
                <td className="px-3 py-1.5 text-right">{fmtNum(p.estoque)} <span className="text-gray-400">/ mín {fmtNum(p.estoque_minimo)}</span></td>
                <td className="px-3 py-1.5">{fmtData(p.ultima_troca)}</td>
                <td className="px-3 py-1.5">{fmtData(p.proxima_troca)}</td>
                <td className="px-3 py-1.5 text-[11.5px]">{(p.maquinas || []).map(id => nomeMaquina.get(id)).filter(Boolean).join(', ') || '—'}</td>
                <td className="px-3 py-1.5"><Pill valor={p.situacao} /></td>
                <td className="px-3 py-1.5 whitespace-nowrap">
                  <button className="btn-ghost p-1 text-green-600" title="Registrar troca nesta máquina"
                    onClick={() => setTrocando({ ...p, form: { data: hoje(), quantidade: 1, responsavel: '', observacao: '' } })}><RefreshCw size={13} /></button>
                  <button className="btn-ghost p-1 text-blue-600" title="Editar" onClick={() => setF({ ...p })}><Pencil size={13} /></button>
                  <button className="btn-ghost p-1 text-red-500" title="Excluir" onClick={() => excluir(p)}><Trash2 size={13} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {trocando && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setTrocando(null)}>
          <div className="card w-full max-w-md p-4 space-y-3" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <p className="font-semibold text-gray-900">Troca de {trocando.codigo} {trocando.nome} em {maquina.codigo}</p>
              <button className="btn-ghost p-1" onClick={() => setTrocando(null)}><X size={16} /></button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Campo label="Data"><Data value={trocando.form.data} onChange={v => setTrocando(x => ({ ...x, form: { ...x.form, data: v } }))} /></Campo>
              <Campo label="Quantidade"><Numero value={trocando.form.quantidade} onChange={v => setTrocando(x => ({ ...x, form: { ...x.form, quantidade: v } }))} /></Campo>
              <Campo label="Responsável"><input className="input" value={trocando.form.responsavel} onChange={e => setTrocando(x => ({ ...x, form: { ...x.form, responsavel: e.target.value } }))} /></Campo>
              <Campo label="Observação"><input className="input" value={trocando.form.observacao} onChange={e => setTrocando(x => ({ ...x, form: { ...x.form, observacao: e.target.value } }))} /></Campo>
            </div>
            <p className="text-[11.5px] text-gray-500">
              Custo: {fmtBRL((Number(trocando.valor_unitario) || 0) * (Number(trocando.form.quantidade) || 1))} · estoque passa de {fmtNum(trocando.estoque)} para {fmtNum(Math.max(0, trocando.estoque - (Number(trocando.form.quantidade) || 1)))}.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setTrocando(null)}>Cancelar</button>
              <button className="btn-primary" onClick={() => confirmarTroca(false)}><RefreshCw size={14} /> Registrar troca</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Compatibilidade({ maquinas, valor, onChange }) {
  const [aberto, setAberto] = useState(false);
  const rotulo = valor.length === 0 ? 'Nenhuma' : maquinas.filter(m => valor.includes(m.id)).map(m => m.codigo).join(', ');
  return (
    <div className="relative">
      <button type="button" className="input flex items-center justify-between text-left" onClick={() => setAberto(a => !a)}>
        <span className="truncate">{rotulo}</span><ChevronDown size={14} className="shrink-0" />
      </button>
      {aberto && (
        <div className="absolute z-30 mt-1 w-full max-h-56 overflow-auto bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {maquinas.map(m => (
            <label key={m.id} className="flex items-center gap-2 px-3 py-1.5 text-[12.5px] hover:bg-gray-100 cursor-pointer">
              <input type="checkbox" checked={valor.includes(m.id)}
                onChange={e => onChange(e.target.checked ? [...valor, m.id] : valor.filter(x => x !== m.id))} />
              <span className="font-mono">{m.codigo}</span> {m.nome}
            </label>
          ))}
          <button type="button" className="w-full text-[12px] text-primary-600 py-1.5 border-t border-gray-100" onClick={() => setAberto(false)}>Fechar</button>
        </div>
      )}
    </div>
  );
}
