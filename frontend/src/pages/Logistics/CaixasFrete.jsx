// ============================================================
// LOGÍSTICA → CAIXAS E FRETE
//
// O frete da Total Express sai do peso da caixa, e a caixa depende do
// pedido. Esta tela é onde a Lyon ajusta isso ao longo do tempo:
//
//   Regras gerais     o acréscimo sobre o frete quando a caixa vai
//                     cheia, e se o valor da caixa entra no pedido.
//   Regras por produto a caixa padrão, quantas unidades cabem, e a caixa
//                     menor para pedido pequeno.
//   Caixas            as caixas físicas: medidas, peso cheia, valor.
//   Simulador         o pedido de teste, com a conta aberta — é assim
//                     que se confere um ajuste antes de ele valer.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, Loader2, Save, Calculator, Package, AlertTriangle, CircleCheck } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

const brl = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v) || 0);
const kg = v => `${(Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} kg`;
const cubado = c => (Number(c.largura_cm) * Number(c.altura_cm) * Number(c.comprimento_cm) / 1e6) * 167;

export default function CaixasFrete() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['logistica-caixas'],
    queryFn: () => api.get('/logistica-caixas'),
  });
  const [caixaEdit, setCaixaEdit] = useState(null);
  const [regraEdit, setRegraEdit] = useState(null);
  const recarregar = () => qc.invalidateQueries({ queryKey: ['logistica-caixas'] });

  if (isLoading) {
    return <p className="text-sm text-gray-500 flex items-center gap-2 py-10 justify-center"><Loader2 size={15} className="animate-spin" /> Carregando…</p>;
  }
  if (data?.migracao_pendente) {
    return <div className="card p-6 text-sm text-amber-800 bg-amber-50">O cadastro de caixas ainda não existe neste banco (migração 121).</div>;
  }

  const { caixas = [], regras = [], categorias = [], pode_editar: pode } = data || {};
  const nomeCaixa = id => caixas.find(c => c.id === id)?.nome || null;
  const nomeCategoria = id => categorias.find(c => c.id === id)?.name || '(categoria sem produto)';

  const apagar = async (tipo, item) => {
    if (!window.confirm(`Apagar ${tipo === 'caixas' ? `a caixa "${item.nome}"` : 'esta regra'}?`)) return;
    try { await api.delete(`/logistica-caixas/${tipo}/${item.id}`); toast.success('Apagado'); recarregar(); }
    catch (e) { toast.error(e.error || 'Não foi possível apagar'); }
  };

  return (
    <div className="space-y-4">
      <RegrasGerais config={data.config} texEnabled={data.tex_enabled} pode={pode} onSalvo={recarregar} />

      {/* REGRAS POR PRODUTO */}
      <div className="card">
        <div className="card-header flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-900">Regras por produto</h3>
            <p className="text-xs text-gray-500">Em que caixa cada produto viaja, quantas unidades cabem e a caixa menor para pedido pequeno.</p>
          </div>
          {pode && <button className="btn-primary btn-sm" onClick={() => setRegraEdit({})}><Plus size={14} /> Nova regra</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Produto</th>
                <th className="text-left px-3 py-2">Caixa padrão</th>
                <th className="text-right px-3 py-2">Unid./caixa</th>
                <th className="text-left px-3 py-2">Pedido pequeno</th>
                <th className="text-left px-3 py-2">Situação</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {regras.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Nenhuma regra cadastrada.</td></tr>
              )}
              {regras.map(r => {
                const faltas = [!r.caixa_id && 'sem caixa', !r.unidades_por_caixa && 'sem unidades por caixa'].filter(Boolean);
                return (
                  <tr key={r.id} className={r.ativo === false ? 'opacity-50' : ''}>
                    <td className="px-3 py-2 font-medium text-gray-800">
                      {nomeCategoria(r.category_id)}{r.capacidade_ml ? ` · ${r.capacidade_ml} ml` : ' · todos os tamanhos'}
                    </td>
                    <td className="px-3 py-2">{nomeCaixa(r.caixa_id) || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2 text-right">{r.unidades_por_caixa || <span className="text-gray-400">—</span>}</td>
                    <td className="px-3 py-2 text-gray-600">
                      {r.caixa_pequena_id ? `até ${r.unidades_caixa_pequena} un. na ${nomeCaixa(r.caixa_pequena_id)}` : <span className="text-gray-400">sem caixa menor</span>}
                    </td>
                    <td className="px-3 py-2">
                      {faltas.length
                        ? <span className="text-amber-700 inline-flex items-center gap-1"><AlertTriangle size={13} /> {faltas.join(', ')}</span>
                        : <span className="text-green-700 inline-flex items-center gap-1"><CircleCheck size={13} /> completa</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {pode && <>
                        <button className="btn-ghost p-1.5" onClick={() => setRegraEdit(r)} title="Editar"><Edit2 size={14} /></button>
                        <button className="btn-ghost p-1.5 text-red-500" onClick={() => apagar('regras', r)} title="Apagar"><Trash2 size={14} /></button>
                      </>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* CAIXAS */}
      <div className="card">
        <div className="card-header flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-semibold text-gray-900">Caixas</h3>
            <p className="text-xs text-gray-500">Medidas em centímetros, peso da caixa cheia e o valor da caixa. Cubado = L × A × C (m) × 167.</p>
          </div>
          {pode && <button className="btn-primary btn-sm" onClick={() => setCaixaEdit({})}><Plus size={14} /> Nova caixa</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
              <tr>
                <th className="text-left px-3 py-2">Caixa</th>
                <th className="text-right px-3 py-2">L × A × C (cm)</th>
                <th className="text-right px-3 py-2">Peso cheia</th>
                <th className="text-right px-3 py-2">Peso cubado</th>
                <th className="text-right px-3 py-2">Valor</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {caixas.length === 0 && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-gray-400">Nenhuma caixa cadastrada.</td></tr>
              )}
              {caixas.map(c => (
                <tr key={c.id} className={c.ativo === false ? 'opacity-50' : ''}>
                  <td className="px-3 py-2 font-medium text-gray-800">{c.nome}</td>
                  <td className="px-3 py-2 text-right">{Number(c.largura_cm)} × {Number(c.altura_cm)} × {Number(c.comprimento_cm)}</td>
                  <td className="px-3 py-2 text-right">{c.peso_cheia_kg ? kg(c.peso_cheia_kg) : '—'}</td>
                  <td className="px-3 py-2 text-right">{kg(cubado(c))}</td>
                  <td className="px-3 py-2 text-right">{brl(c.valor)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {pode && <>
                      <button className="btn-ghost p-1.5" onClick={() => setCaixaEdit(c)} title="Editar"><Edit2 size={14} /></button>
                      <button className="btn-ghost p-1.5 text-red-500" onClick={() => apagar('caixas', c)} title="Apagar"><Trash2 size={14} /></button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Simulador categorias={categorias} />

      <Modal isOpen={!!caixaEdit} onClose={() => setCaixaEdit(null)} title={caixaEdit?.id ? 'Editar caixa' : 'Nova caixa'} size="md">
        {caixaEdit && <FormCaixa caixa={caixaEdit} onFechar={() => setCaixaEdit(null)} onSalvo={() => { setCaixaEdit(null); recarregar(); }} />}
      </Modal>
      <Modal isOpen={!!regraEdit} onClose={() => setRegraEdit(null)} title={regraEdit?.id ? 'Editar regra' : 'Nova regra'} size="md">
        {regraEdit && <FormRegra regra={regraEdit} caixas={caixas} categorias={categorias}
          onFechar={() => setRegraEdit(null)} onSalvo={() => { setRegraEdit(null); recarregar(); }} />}
      </Modal>
    </div>
  );
}

// ── regras gerais ───────────────────────────────────────────
function RegrasGerais({ config, texEnabled, pode, onSalvo }) {
  const [f, setF] = useState({ ...config, tex_enabled: texEnabled });
  useEffect(() => { setF({ ...config, tex_enabled: texEnabled }); }, [config, texEnabled]);
  const salvar = useMutation({
    mutationFn: () => api.put('/logistica-caixas/config', f),
    onSuccess: () => { toast.success('Regras gerais salvas'); onSalvo(); },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });
  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-gray-900">Regras gerais de cobrança</h3>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="label">Acréscimo sobre o frete (%)</label>
          <input type="number" min="0" step="0.5" className="input" value={f.acrescimo_pct}
            onChange={e => setF(o => ({ ...o, acrescimo_pct: e.target.value }))} disabled={!pode} />
        </div>
        <div>
          <label className="label">Quando a ocupação passar de (%)</label>
          <input type="number" min="0" max="100" className="input" value={f.ocupacao_limite_pct}
            onChange={e => setF(o => ({ ...o, ocupacao_limite_pct: e.target.value }))} disabled={!pode} />
        </div>
        <label className="flex items-center gap-2 text-sm mt-6">
          <input type="checkbox" checked={!!f.cobrar_caixa} disabled={!pode}
            onChange={e => setF(o => ({ ...o, cobrar_caixa: e.target.checked }))} />
          Cobrar o valor da caixa no pedido
        </label>
      </div>
      <p className="text-xs text-gray-500">
        Exemplo: caixa de 100 copos com 80 copos = 80% de ocupação → frete + {f.acrescimo_pct || 0}%.
        Com 70 copos (70%) não há acréscimo quando o limite é 70%.
      </p>
      <label className={`flex items-start gap-3 p-3 rounded-xl border ${f.tex_enabled ? 'border-primary-300 bg-primary-50' : 'border-gray-200'}`}>
        <input type="checkbox" className="mt-1" checked={!!f.tex_enabled} disabled={!pode}
          onChange={e => setF(o => ({ ...o, tex_enabled: e.target.checked }))} />
        <span className="text-sm">
          <b>Calcular o frete pela Total Express</b> (peso real × cubado, tabela negociada, acréscimo e caixas).
          <span className="block text-xs text-gray-500">Desligado, o site e o pedido usam a tabela de frete por estado. Só ligue depois de conferir no simulador.</span>
        </span>
      </label>
      {pode && (
        <div className="flex justify-end">
          <button className="btn-primary" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
          </button>
        </div>
      )}
    </div>
  );
}

// ── formulário de caixa ─────────────────────────────────────
function FormCaixa({ caixa, onFechar, onSalvo }) {
  const [f, setF] = useState({
    nome: caixa.nome || '', largura_cm: caixa.largura_cm ?? '', altura_cm: caixa.altura_cm ?? '',
    comprimento_cm: caixa.comprimento_cm ?? '', peso_cheia_kg: caixa.peso_cheia_kg ?? '', valor: caixa.valor ?? '',
    ativo: caixa.ativo !== false, observacao: caixa.observacao || '',
  });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const salvar = useMutation({
    mutationFn: () => (caixa.id ? api.put(`/logistica-caixas/caixas/${caixa.id}`, f) : api.post('/logistica-caixas/caixas', f)),
    onSuccess: () => { toast.success('Caixa salva'); onSalvo(); },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });
  const cub = f.largura_cm && f.altura_cm && f.comprimento_cm ? cubado(f) : 0;
  return (
    <div className="space-y-3">
      <div><label className="label">Nome</label><input className="input" value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Copo Long Drink 350ml" /></div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="label">Largura (cm)</label><input type="number" step="0.1" className="input" value={f.largura_cm} onChange={e => set('largura_cm', e.target.value)} /></div>
        <div><label className="label">Altura (cm)</label><input type="number" step="0.1" className="input" value={f.altura_cm} onChange={e => set('altura_cm', e.target.value)} /></div>
        <div><label className="label">Comprimento (cm)</label><input type="number" step="0.1" className="input" value={f.comprimento_cm} onChange={e => set('comprimento_cm', e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">Peso da caixa cheia (kg)</label><input type="number" step="0.01" className="input" value={f.peso_cheia_kg} onChange={e => set('peso_cheia_kg', e.target.value)} /></div>
        <div><label className="label">Valor da caixa (R$)</label><input type="number" step="0.01" className="input" value={f.valor} onChange={e => set('valor', e.target.value)} /></div>
      </div>
      {cub > 0 && <p className="text-xs text-gray-500">Peso cubado desta caixa: <b>{kg(cub)}</b></p>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} /> Ativa</label>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button className="btn-primary" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
        </button>
      </div>
    </div>
  );
}

// ── formulário de regra ─────────────────────────────────────
function FormRegra({ regra, caixas, categorias, onFechar, onSalvo }) {
  const [f, setF] = useState({
    category_id: regra.category_id || '', capacidade_ml: regra.capacidade_ml ?? '',
    caixa_id: regra.caixa_id || '', unidades_por_caixa: regra.unidades_por_caixa ?? '',
    caixa_pequena_id: regra.caixa_pequena_id || '', unidades_caixa_pequena: regra.unidades_caixa_pequena ?? '',
    ativo: regra.ativo !== false,
  });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const cat = categorias.find(c => c.id === f.category_id);
  const caixa = caixas.find(c => c.id === f.caixa_id);
  const salvar = useMutation({
    mutationFn: () => (regra.id ? api.put(`/logistica-caixas/regras/${regra.id}`, f) : api.post('/logistica-caixas/regras', f)),
    onSuccess: () => { toast.success('Regra salva'); onSalvo(); },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });
  const pesoCopo = caixa?.peso_cheia_kg && Number(f.unidades_por_caixa) > 0
    ? (Number(caixa.peso_cheia_kg) / Number(f.unidades_por_caixa)) * 1000 : null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Categoria</label>
          <select className="input" value={f.category_id} onChange={e => { set('category_id', e.target.value); set('capacidade_ml', ''); }}>
            <option value="">Escolha…</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tamanho</label>
          <select className="input" value={f.capacidade_ml} onChange={e => set('capacidade_ml', e.target.value)}>
            <option value="">Todos os tamanhos</option>
            {(cat?.capacidades || []).map(v => <option key={v} value={v}>{v} ml</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Caixa padrão</label>
          <select className="input" value={f.caixa_id} onChange={e => set('caixa_id', e.target.value)}>
            <option value="">Escolha…</option>
            {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Unidades por caixa</label>
          <input type="number" min="1" className="input" value={f.unidades_por_caixa} onChange={e => set('unidades_por_caixa', e.target.value)} />
          {pesoCopo && <p className="text-[11px] text-gray-500 mt-1">≈ {pesoCopo.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} g por unidade</p>}
        </div>
      </div>
      <div className="rounded-xl border border-gray-200 p-3 space-y-2">
        <p className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><Package size={14} /> Pedido pequeno (opcional)</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Caixa menor</label>
            <select className="input" value={f.caixa_pequena_id} onChange={e => set('caixa_pequena_id', e.target.value)}>
              <option value="">Sem caixa menor</option>
              {caixas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Até quantas unidades</label>
            <input type="number" min="1" className="input" value={f.unidades_caixa_pequena} disabled={!f.caixa_pequena_id}
              onChange={e => set('unidades_caixa_pequena', e.target.value)} />
          </div>
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.ativo} onChange={e => set('ativo', e.target.checked)} /> Ativa</label>
      <div className="flex justify-end gap-2 pt-1">
        <button className="btn-secondary" onClick={onFechar}>Cancelar</button>
        <button className="btn-primary" onClick={() => salvar.mutate()} disabled={salvar.isPending}>
          {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
        </button>
      </div>
    </div>
  );
}

// ── simulador ───────────────────────────────────────────────
function Simulador({ categorias }) {
  const [f, setF] = useState({ category_id: '', capacidade_ml: '', quantidade: 100, cep: '', valor_nota: '' });
  const set = (k, v) => setF(o => ({ ...o, [k]: v }));
  const cat = categorias.find(c => c.id === f.category_id);
  const simular = useMutation({
    mutationFn: () => api.post('/logistica-caixas/simular', f),
    onError: e => toast.error(e.error || 'Não foi possível simular'),
  });
  const r = simular.data;
  const envio = r?.envio;
  const frete = r?.frete;
  const m = frete?.memoria;

  return (
    <div className="card p-4 space-y-3">
      <h3 className="font-semibold text-gray-900 flex items-center gap-2"><Calculator size={16} /> Simulador de frete</h3>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="sm:col-span-2">
          <label className="label">Categoria</label>
          <select className="input" value={f.category_id} onChange={e => { set('category_id', e.target.value); set('capacidade_ml', ''); }}>
            <option value="">Escolha…</option>
            {categorias.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tamanho</label>
          <select className="input" value={f.capacidade_ml} onChange={e => set('capacidade_ml', e.target.value)}>
            <option value="">Qualquer</option>
            {(cat?.capacidades || []).map(v => <option key={v} value={v}>{v} ml</option>)}
          </select>
        </div>
        <div><label className="label">Quantidade</label><input type="number" min="1" className="input" value={f.quantidade} onChange={e => set('quantidade', e.target.value)} /></div>
        <div><label className="label">CEP de destino</label><input className="input" value={f.cep} onChange={e => set('cep', e.target.value)} placeholder="00000-000" /></div>
        <div><label className="label">Valor da nota (R$)</label><input type="number" step="0.01" className="input" value={f.valor_nota} onChange={e => set('valor_nota', e.target.value)} /></div>
        <div className="flex items-end">
          <button className="btn-primary w-full" onClick={() => simular.mutate()} disabled={simular.isPending || !f.category_id}>
            {simular.isPending ? <Loader2 size={14} className="animate-spin" /> : <Calculator size={14} />} Simular
          </button>
        </div>
      </div>

      {envio && !envio.ok && (
        <div className="text-sm rounded-lg px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900">
          <b>Falta cadastro para calcular:</b>
          <ul className="list-disc ml-5 mt-1">{envio.faltas.map((x, i) => <li key={i}>{x}</li>)}</ul>
        </div>
      )}

      {envio?.ok && (
        <div className="grid sm:grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl border border-gray-200 p-3 space-y-1">
            <p className="font-medium text-gray-800">{r.produto}</p>
            {envio.detalhe.map((d, i) => (
              <p key={i} className="text-gray-600">
                {d.unidades} un. → {d.volumes} × {d.caixa.nome}{d.caixa_pequena ? ' (caixa menor)' : ''}
              </p>
            ))}
            <p>Peso real: <b>{kg(envio.peso_real)}</b> · Peso cubado: <b>{kg(envio.peso_cubado)}</b></p>
            <p>Cobrado pelo maior: <b>{kg(Math.max(envio.peso_real, envio.peso_cubado))}</b></p>
            <p>Ocupação: <b>{envio.ocupacao_pct}%</b> {envio.aplica_acrescimo ? `→ acréscimo de ${envio.acrescimo_pct}%` : '→ sem acréscimo'}</p>
            <p>Caixas: <b>{brl(envio.valor_caixas)}</b>{envio.valor_caixas_bruto && !envio.valor_caixas ? ' (cobrança desligada)' : ''}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-3 space-y-1">
            {!frete && <p className="text-gray-500">Informe um CEP para calcular o frete.</p>}
            {frete && frete.source === 'total_express' && m && (
              <>
                <p className="font-medium text-gray-800">Total Express · {m.localidade}/{m.uf} · {frete.days ? `${frete.days} dia(s)` : 'prazo —'}</p>
                <p>Frete da tabela (com GRIS, Ad Valorem e {m.imposto}): <b>{brl(m.frete_total_express)}</b></p>
                <p>Acréscimo: <b>{brl(m.acrescimo_valor)}</b></p>
                <p>Caixas: <b>{brl(m.valor_caixas)}</b></p>
                <p className="text-base pt-1 border-t border-gray-100">Total cobrado: <b>{brl(frete.price)}</b></p>
                {(frete.avisos || []).map((a, i) => <p key={i} className="text-xs text-amber-700">{a}</p>)}
              </>
            )}
            {frete && frete.source !== 'total_express' && (
              <p className="text-amber-800">
                Não calculou pela Total Express: {frete.tex_pendencia?.motivo || 'CEP fora da abrangência ou tabela não carregada'}.
                O cliente veria o frete por estado ({brl(frete.price)}).
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
