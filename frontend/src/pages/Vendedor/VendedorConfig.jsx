// ============================================================
// Administrativo do Painel do Vendedor.
//
// É aqui que o gestor mexe no que o vendedor só lê: o plano de metas
// (faixa, meta em unidades, bônus, comissão), o território de cada
// vendedor e as promoções que ele pode ofertar. Nada disso mora no
// código — a promessa do painel é justamente essa.
// ============================================================
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Target, Users, Tag, Plus, Trash2, Save, ArrowLeft, MapPin, Loader2, AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, Panel, MigracaoPendente, fmtUn, fmtBRL, fmtDate, MESES } from './ui';
import { UF_LIST } from './BrasilMap';

const ABAS = [
  { key: 'planos',    label: 'Plano de metas', Icon: Target },
  { key: 'vendedores',label: 'Vendedores',     Icon: Users  },
  { key: 'promocoes', label: 'Promoções',      Icon: Tag    },
];

export default function VendedorConfig() {
  const v = useVend();
  const [aba, setAba] = useState('planos');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: v.textPrimary }}>Administrar Painel do Vendedor</h1>
          <p className="text-sm mt-0.5" style={{ color: v.textSubtle }}>
            Meta, bônus, território e promoções — o vendedor apenas cumpre o que for definido aqui.
          </p>
        </div>
        <Link to="/vendedor" className="btn-secondary btn-sm"><ArrowLeft size={14} /> Voltar ao painel</Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {ABAS.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className="px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
            style={aba === a.key
              ? { background: '#2563eb', color: 'white' }
              : { background: v.surface, color: v.textMuted, border: `1px solid ${v.divider}` }}>
            <a.Icon size={15} /> {a.label}
          </button>
        ))}
      </div>

      {aba === 'planos'     && <AbaPlanos />}
      {aba === 'vendedores' && <AbaVendedores />}
      {aba === 'promocoes'  && <AbaPromocoes />}
    </div>
  );
}

// ── Plano de metas ───────────────────────────────────────────
function AbaPlanos() {
  const v = useVend();
  const qc = useQueryClient();
  const [faixas, setFaixas] = useState([]);

  const { data, isLoading } = useQuery({
    queryKey: ['vendedor-planos'],
    queryFn: () => api.get('/vendedor/planos?plan_group=padrao'),
  });
  useEffect(() => { if (data?.faixas) setFaixas(data.faixas.map(normalizar)); }, [data]);

  const salvar = useMutation({
    mutationFn: () => api.put('/vendedor/planos', { plan_group: 'padrao', faixas }),
    onSuccess: () => { toast.success('Plano de metas salvo'); qc.invalidateQueries(['vendedor-planos']); qc.invalidateQueries(['vendedor-dashboard']); },
    onError: e => toast.error(e.error || 'Erro ao salvar o plano'),
  });

  function setF(i, campo, valor) {
    setFaixas(f => f.map((x, idx) => idx === i ? { ...x, [campo]: valor } : x));
  }
  function toggleMes(i, mes) {
    setFaixas(f => f.map((x, idx) => idx !== i ? x : {
      ...x,
      months: x.months.includes(mes) ? x.months.filter(m => m !== mes) : [...x.months, mes].sort((a, b) => a - b),
    }));
  }

  // Um mês sem faixa deixa o vendedor sem meta naquele mês — avisa antes
  // de o painel mostrar "sem plano configurado".
  const cobertos = new Set(faixas.flatMap(f => f.months));
  const descobertos = MESES.map((_, i) => i + 1).filter(m => !cobertos.has(m));

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-3">
      {data?.setup_pending && <MigracaoPendente />}

      {descobertos.length > 0 && (
        <div className="rounded-lg px-3 py-2 text-sm flex items-start gap-2"
          style={{ background: 'rgba(245,158,11,0.12)', color: '#f59e0b' }}>
          <AlertTriangle size={15} className="shrink-0 mt-0.5" />
          Sem faixa nos meses: {descobertos.map(m => MESES[m - 1]).join(', ')}. O painel do vendedor
          fica sem meta nesses meses.
        </div>
      )}

      {faixas.map((f, i) => (
        <Panel key={i} title={f.name || `Faixa ${i + 1}`}
          right={
            <button onClick={() => setFaixas(fs => fs.filter((_, idx) => idx !== i))}
              className="text-red-400 hover:text-red-500 p-1" title="Remover faixa">
              <Trash2 size={15} />
            </button>
          }>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
            <Campo v={v} label="Nome da faixa">
              <input value={f.name} onChange={e => setF(i, 'name', e.target.value)}
                style={{ ...v.control, width: '100%' }} />
            </Campo>
            <Campo v={v} label="Meta mensal (unidades)">
              <input type="number" min="0" value={f.monthly_goal}
                onChange={e => setF(i, 'monthly_goal', e.target.value)} style={{ ...v.control, width: '100%' }} />
            </Campo>
            <Campo v={v} label="Bônus do ciclo (R$)">
              <input type="number" min="0" step="0.01" value={f.cycle_bonus}
                onChange={e => setF(i, 'cycle_bonus', e.target.value)} style={{ ...v.control, width: '100%' }} />
            </Campo>
            <Campo v={v} label="Meses do ciclo">
              <input type="number" min="1" max="12" value={f.cycle_months}
                onChange={e => setF(i, 'cycle_months', e.target.value)} style={{ ...v.control, width: '100%' }} />
            </Campo>
            <Campo v={v} label="Comissão sobre excedente (%)">
              <input type="number" min="0" step="0.1" value={f.commission_pct}
                onChange={e => setF(i, 'commission_pct', e.target.value)} style={{ ...v.control, width: '100%' }} />
            </Campo>
          </div>

          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: v.textSubtle }}>
              Meses cobertos por esta faixa
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MESES.map((m, idx) => {
                const mes = idx + 1;
                const on = f.months.includes(mes);
                return (
                  <button key={mes} onClick={() => toggleMes(i, mes)}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-medium"
                    style={on
                      ? { background: '#2563eb', color: 'white' }
                      : { background: v.surface, color: v.textMuted, border: `1px solid ${v.divider}` }}>
                    {m.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          </div>
        </Panel>
      ))}

      <div className="flex flex-wrap gap-2">
        <button onClick={() => setFaixas(f => [...f, novaFaixa(f.length)])} className="btn-secondary">
          <Plus size={15} /> Adicionar faixa
        </button>
        <button onClick={() => salvar.mutate()} disabled={salvar.isPending} className="btn-primary">
          {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar plano
        </button>
      </div>
    </div>
  );
}

const normalizar = f => ({
  name: f.name || '',
  seq: f.seq || 1,
  months: Array.isArray(f.months) ? [...f.months].sort((a, b) => a - b) : [],
  monthly_goal: f.monthly_goal ?? 0,
  cycle_bonus: f.cycle_bonus ?? 0,
  cycle_months: f.cycle_months ?? 3,
  commission_pct: f.commission_pct ?? 2,
  is_active: f.is_active !== false,
});

const novaFaixa = n => ({
  name: `Meta ${n + 1}`, seq: n + 1, months: [],
  monthly_goal: 0, cycle_bonus: 0, cycle_months: 3, commission_pct: 2, is_active: true,
});

// ── Vendedores ───────────────────────────────────────────────
function AbaVendedores() {
  const v = useVend();
  const qc = useQueryClient();
  const [editando, setEditando] = useState(null);   // { user_id, name, ... }

  const { data: lista, isLoading } = useQuery({
    queryKey: ['vendedor-lista-admin'],
    queryFn: () => api.get('/vendedor/vendedores'),
  });

  const salvar = useMutation({
    mutationFn: c => api.put(`/vendedor/config/${c.user_id}`, c),
    onSuccess: () => {
      toast.success('Vendedor atualizado');
      setEditando(null);
      qc.invalidateQueries(['vendedor-lista-admin']);
      qc.invalidateQueries(['vendedor-dashboard']);
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  if (isLoading) return <Carregando />;

  return (
    <div className="space-y-3">
      <Panel title="Quem tem painel de vendedor"
        hint="O território e o plano definidos aqui aparecem no painel do vendedor como somente leitura.">
        <div className="space-y-2">
          {(lista || []).map(u => {
            const c = u.config;
            return (
              <div key={u.user_id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: v.surface }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: v.textPrimary }}>{u.name}</p>
                  <p className="text-[11px] truncate" style={{ color: v.textSubtle }}>{u.email}</p>
                </div>
                <span className="text-xs flex items-center gap-1.5" style={{ color: v.textMuted }}>
                  <MapPin size={12} />
                  {c?.territory?.length ? c.territory.join(', ') : 'sem território'}
                  {c?.region_label ? ` · ${c.region_label}` : ''}
                </span>
                <span className="text-xs" style={{ color: v.textMuted }}>Top {c?.top_clients || 10}</span>
                <button onClick={() => setEditando({
                  user_id: u.user_id, name: u.name,
                  region_label: c?.region_label || '',
                  territory: c?.territory || [],
                  plan_group: c?.plan_group || 'padrao',
                  top_clients: c?.top_clients || 10,
                  is_active: c?.is_active !== false,
                })} className="btn-secondary btn-sm">Configurar</button>
              </div>
            );
          })}
        </div>
      </Panel>

      {editando && (
        <Panel title={`Território de ${editando.name}`}>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Campo v={v} label="Nome da região (rótulo do painel)">
              <input value={editando.region_label} placeholder="Ex.: Sul"
                onChange={e => setEditando(x => ({ ...x, region_label: e.target.value }))}
                style={{ ...v.control, width: '100%' }} />
            </Campo>
            <Campo v={v} label="Grupo do plano de metas">
              <input value={editando.plan_group}
                onChange={e => setEditando(x => ({ ...x, plan_group: e.target.value }))}
                style={{ ...v.control, width: '100%' }} />
            </Campo>
            <Campo v={v} label="Tamanho da carteira (Top N)">
              <select value={editando.top_clients}
                onChange={e => setEditando(x => ({ ...x, top_clients: Number(e.target.value) }))}
                style={{ ...v.control, width: '100%' }}>
                {[10, 20, 30, 50].map(n => <option key={n} value={n}>Top {n}</option>)}
              </select>
            </Campo>
          </div>

          <div className="mt-3">
            <p className="text-[10px] uppercase tracking-wider font-semibold mb-1.5" style={{ color: v.textSubtle }}>
              UFs atendidas
            </p>
            <div className="flex flex-wrap gap-1.5">
              {UF_LIST.map(uf => {
                const on = editando.territory.includes(uf);
                return (
                  <button key={uf}
                    onClick={() => setEditando(x => ({
                      ...x,
                      territory: on ? x.territory.filter(u => u !== uf) : [...x.territory, uf].sort(),
                    }))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold"
                    style={on
                      ? { background: '#2563eb', color: 'white' }
                      : { background: v.surface, color: v.textMuted, border: `1px solid ${v.divider}` }}>
                    {uf}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button onClick={() => setEditando(null)} className="btn-secondary">Cancelar</button>
            <button onClick={() => salvar.mutate(editando)} disabled={salvar.isPending} className="btn-primary">
              {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}

// ── Promoções ────────────────────────────────────────────────
function AbaPromocoes() {
  const v = useVend();
  const qc = useQueryClient();
  const vazio = { product_id: '', title: '', suggested_qty: '', valid_until: '', promo_price: '', discount_pct: '', message_template: '', is_active: true };
  const [form, setForm] = useState(vazio);
  const [editId, setEditId] = useState(null);

  const { data: promos, isLoading } = useQuery({
    queryKey: ['vendedor-promos-admin'],
    queryFn: () => api.get('/vendedor/promocoes-admin'),
  });
  const { data: produtos } = useQuery({
    queryKey: ['produtos-promocao'],
    queryFn: () => api.get('/products?limit=500&is_active=true'),
  });
  const listaProdutos = produtos?.data || produtos || [];

  const invalidar = () => {
    qc.invalidateQueries(['vendedor-promos-admin']);
    qc.invalidateQueries(['vendedor-promocoes']);
  };

  const salvar = useMutation({
    mutationFn: () => editId
      ? api.put(`/vendedor/promocoes-admin/${editId}`, form)
      : api.post('/vendedor/promocoes-admin', form),
    onSuccess: () => { toast.success(editId ? 'Promoção atualizada' : 'Promoção liberada'); setForm(vazio); setEditId(null); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao salvar a promoção'),
  });

  const remover = useMutation({
    mutationFn: id => api.delete(`/vendedor/promocoes-admin/${id}`),
    onSuccess: () => { toast.success('Promoção removida'); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  const set = (k, val) => setForm(f => ({ ...f, [k]: val }));

  return (
    <div className="space-y-3">
      <Panel title={editId ? 'Editar promoção' : 'Liberar nova promoção'}
        hint="Só o que estiver aqui aparece para o vendedor na tela de oferta. Sem promoção liberada, ele não tem preço promocional para oferecer.">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          <Campo v={v} label="Produto *">
            <select value={form.product_id} onChange={e => set('product_id', e.target.value)}
              style={{ ...v.control, width: '100%' }}>
              <option value="">Selecione...</option>
              {listaProdutos.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Campo>
          <Campo v={v} label="Título da oferta">
            <input value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Ex.: Condição especial Long Drink" style={{ ...v.control, width: '100%' }} />
          </Campo>
          <Campo v={v} label="Validade da oferta">
            <input type="date" value={form.valid_until} onChange={e => set('valid_until', e.target.value)}
              style={{ ...v.control, width: '100%' }} />
          </Campo>
          <Campo v={v} label="Quantidade sugerida (un)">
            <input type="number" min="0" value={form.suggested_qty} onChange={e => set('suggested_qty', e.target.value)}
              style={{ ...v.control, width: '100%' }} />
          </Campo>
          <Campo v={v} label="Preço promocional (R$)">
            <input type="number" min="0" step="0.01" value={form.promo_price} onChange={e => set('promo_price', e.target.value)}
              style={{ ...v.control, width: '100%' }} />
          </Campo>
          <Campo v={v} label="Desconto (%)">
            <input type="number" min="0" step="0.1" value={form.discount_pct} onChange={e => set('discount_pct', e.target.value)}
              style={{ ...v.control, width: '100%' }} />
          </Campo>
        </div>

        <Campo v={v} label="Mensagem sugerida (o vendedor pode editar)" className="mt-3">
          <textarea rows={3} value={form.message_template} onChange={e => set('message_template', e.target.value)}
            placeholder="Use {Nome do cliente} para personalizar."
            style={{ ...v.control, width: '100%', resize: 'vertical' }} />
        </Campo>

        <div className="flex flex-wrap gap-2 mt-3">
          {editId && <button onClick={() => { setForm(vazio); setEditId(null); }} className="btn-secondary">Cancelar edição</button>}
          <button onClick={() => salvar.mutate()} disabled={!form.product_id || salvar.isPending} className="btn-primary">
            {salvar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {editId ? 'Salvar alterações' : 'Liberar promoção'}
          </button>
        </div>
      </Panel>

      <Panel title="Promoções cadastradas">
        {isLoading ? <Carregando /> : (promos || []).length === 0 ? (
          <p className="text-sm py-6 text-center" style={{ color: v.empty }}>Nenhuma promoção cadastrada ainda.</p>
        ) : (
          <div className="space-y-2">
            {promos.map(p => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5"
                style={{ background: v.surface }}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate" style={{ color: v.textPrimary }}>
                    {p.title || p.PRODUTOS?.name}
                  </p>
                  <p className="text-[11px] truncate" style={{ color: v.textSubtle }}>
                    {p.PRODUTOS?.name}
                    {p.suggested_qty ? ` · ${fmtUn(p.suggested_qty)} un sugeridas` : ''}
                    {p.promo_price != null ? ` · ${fmtBRL(p.promo_price)}` : ''}
                    {p.discount_pct != null ? ` · ${p.discount_pct}% off` : ''}
                    {p.valid_until ? ` · até ${fmtDate(p.valid_until)}` : ''}
                  </p>
                </div>
                <span className="text-[11px] px-2 py-0.5 rounded-full"
                  style={p.is_active
                    ? { background: 'rgba(34,197,94,0.15)', color: '#4ade80' }
                    : { background: 'rgba(148,163,184,0.15)', color: '#94a3b8' }}>
                  {p.is_active ? 'liberada' : 'inativa'}
                </span>
                <button onClick={() => {
                  setEditId(p.id);
                  setForm({
                    product_id: p.product_id || '', title: p.title || '',
                    suggested_qty: p.suggested_qty ?? '', valid_until: p.valid_until || '',
                    promo_price: p.promo_price ?? '', discount_pct: p.discount_pct ?? '',
                    message_template: p.message_template || '', is_active: p.is_active !== false,
                  });
                }} className="btn-secondary btn-sm">Editar</button>
                <button onClick={() => remover.mutate(p.id)} className="text-red-400 hover:text-red-500 p-1" title="Remover">
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}

// ── Peças pequenas ───────────────────────────────────────────
function Campo({ v, label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase tracking-wider font-semibold block mb-1" style={{ color: v.textSubtle }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function Carregando() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
    </div>
  );
}
