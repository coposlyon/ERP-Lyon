import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Doughnut, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale,
  Tooltip as ChartTooltip, Legend as ChartLegend,
} from 'chart.js';
import {
  Loader2, Plus, Pencil, Building2, Landmark, Scale, FileText,
  TrendingUp, TrendingDown, Wallet, ShoppingCart, Package, Boxes,
  BarChart3, Receipt, Users, Printer, FileDown, AlertTriangle, X, Save, Ban,
  Paperclip, Trash2, ExternalLink,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import { Exportacao, Malote, Margem } from './Contador';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, ChartTooltip, ChartLegend);

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtQty = v => new Intl.NumberFormat('pt-BR').format(v || 0);
const dBR = iso => { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : '—'; };
const thisMonth = () => new Date().toISOString().slice(0, 7);
const MONTHS_SHORT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const REGIMES = { mei: 'MEI', simples: 'Simples Nacional', presumido: 'Lucro Presumido', real: 'Lucro Real' };

const SEVERITY = {
  urgente: { label: 'Urgente', cls: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
  atencao: { label: 'Atenção', cls: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400' },
  info:    { label: 'Informação', cls: 'bg-blue-100 text-blue-700', border: 'border-l-blue-400' },
};

function VsBadge({ v }) {
  if (v == null) return null;
  const up = v >= 0;
  return (
    <span className={`text-[11px] font-semibold flex items-center gap-0.5 ${up ? 'text-green-600' : 'text-red-500'}`}>
      {up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
      {up ? '+' : ''}{String(v).replace('.', ',')}% vs mês anterior
    </span>
  );
}

// ═══════════════ VISÃO GERAL ═══════════════
// A empresa que a Visão Geral está mostrando. Lembrada por navegador —
// é preferência de quem olha, não regra do sistema.
const CHAVE_VISUALIZACAO = 'contabil_visualizar_empresa';
const lerVisualizacao = () => { try { return localStorage.getItem(CHAVE_VISUALIZACAO) || ''; } catch { return ''; } };

function VisaoGeral({ month, setTab }) {
  const [empresaVis, setEmpresaVis] = useState(lerVisualizacao);
  const escolherEmpresa = id => {
    setEmpresaVis(id);
    try { id ? localStorage.setItem(CHAVE_VISUALIZACAO, id) : localStorage.removeItem(CHAVE_VISUALIZACAO); } catch { /* sem storage */ }
  };
  const { data: ov, isLoading } = useQuery({
    queryKey: ['contabil-overview', month, empresaVis],
    queryFn: () => api.get(`/contabil/overview?month=${month}${empresaVis ? `&company_id=${empresaVis}` : ''}`),
    placeholderData: anterior => anterior,
  });
  // Empresa guardada que foi desativada: volta para o consolidado.
  useEffect(() => {
    const lista = ov?.companies || [];
    if (empresaVis && lista.length && !lista.some(c => c.id === empresaVis)) escolherEmpresa('');
  }, [ov, empresaVis]); // eslint-disable-line react-hooks/exhaustive-deps
  const { data: alerts } = useQuery({
    queryKey: ['contabil-alerts'],
    queryFn: () => api.get('/contabil/alerts'),
  });

  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  const k = ov?.kpis || {};
  const dre = ov?.dre || {};
  const companies = ov?.companies || [];
  const main = companies.find(c => c.is_default) || companies[0];

  const kpiCards = [
    ['Faturamento Bruto', fmt(k.faturamento_mes), k.vs?.faturamento, 'text-gray-900'],
    ['Receita Líquida', fmt(k.receita_liquida), k.vs?.receita, 'text-indigo-700'],
    ['Lucro Estimado', fmt(k.lucro_estimado), k.vs?.lucro, k.lucro_estimado >= 0 ? 'text-green-600' : 'text-red-600'],
    ['Impostos a Pagar', fmt(k.impostos_projetados), k.vs?.impostos, 'text-amber-700'],
    ['Saldo Bancário', fmt(k.saldo_bancario), null, 'text-gray-900'],
    ['Ticket Médio', fmt(k.ticket_medio), k.vs?.ticket, 'text-gray-900'],
  ];
  const secondary = [
    ['Faturamento do Dia', fmt(k.faturamento_dia)],
    ['Faturamento do Ano', fmt(k.faturamento_ano)],
    ['Pedidos no Mês', fmtQty(k.pedidos_mes)],
    ['Contas a Receber', `${fmt(k.contas_receber)} · ${k.contas_receber_qtd} títulos`],
    ['Contas a Pagar', `${fmt(k.contas_pagar)} · ${k.contas_pagar_qtd} títulos`],
    ['Estoque Financeiro', fmt(k.estoque_financeiro)],
  ];

  const quick = [
    ['Faturamento', BarChart3, '/reports'],
    ['Impostos', Receipt, () => setTab('tributario')],
    ['Fluxo de Caixa', Wallet, '/contas'],
    ['Clientes', Users, '/customers'],
    ['Produtos', Package, '/products'],
    ['Estoque', Boxes, '/stock'],
    ['Compras', ShoppingCart, '/purchases'],
    ['Bancos', Landmark, () => setTab('bancos')],
    ['DRE', FileText, () => setTab('dre')],
    ['Margem', TrendingUp, () => setTab('margem')],
    ['Malote', Receipt, () => setTab('malote')],
    ['Contador', FileDown, () => setTab('contador')],
  ];


  return (
    <div className="space-y-4">
      {/* Qual empresa a tela mostra — e qual é a padrão das novas vendas */}
      <div className="card p-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Building2 size={18} className="text-primary-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500">Empresa padrão das novas vendas</p>
            <p className="text-sm font-semibold text-gray-900 truncate">
              {main ? `${main.razao_social} · ${main.cnpj || 'sem CNPJ'} · ${REGIMES[main.regime] || main.regime}` : 'Nenhuma empresa cadastrada'}
            </p>
          </div>
        </div>
        <div className="md:w-80">
          <label className="text-[11px] text-gray-500 block mb-0.5">Visualizar dados de</label>
          <select className="input" value={empresaVis} onChange={e => escolherEmpresa(e.target.value)}>
            <option value="">Todas as empresas (consolidado)</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.razao_social}{c.cnpj ? ` — ${c.cnpj}` : ''}</option>
            ))}
          </select>
        </div>
      </div>
      {ov?.visualizando && (
        <p className="text-xs text-gray-500 -mt-2">
          Mostrando somente <b>{ov.visualizando.razao_social}</b>: vendas faturadas por esse CNPJ, lançamentos das vendas e das contas bancárias dele.
          Registros sem empresa definida contam para a empresa padrão.
        </p>
      )}

      {/* KPIs principais */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {kpiCards.map(([label, value, vs, cls]) => (
          <div key={label} className="card p-3">
            <p className="text-[11px] text-gray-500 uppercase tracking-wide">{label}</p>
            <p className={`text-lg font-bold mt-0.5 ${cls}`}>{value}</p>
            <VsBadge v={vs} />
          </div>
        ))}
      </div>
      {/* KPIs secundários */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
        {secondary.map(([label, value]) => (
          <div key={label} className="rounded-xl bg-gray-50 border border-gray-200 px-3 py-2">
            <p className="text-[11px] text-gray-500">{label}</p>
            <p className="text-sm font-semibold text-gray-800">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* Controle de Empresas */}
        <div className="card overflow-hidden">
          <div className="card-header flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 text-sm">Controle de Empresas</h2>
            <button className="btn-primary btn-sm text-xs" onClick={() => setTab('empresas')}>
              <Plus size={13} /> Adicionar Empresa
            </button>
          </div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {companies.map(c => (
              <div key={c.id} className={`px-4 py-3 ${c.is_default ? 'bg-primary-50/50' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="font-semibold text-sm text-gray-900 truncate">{c.razao_social}</p>
                  <span className={`badge ${c.is_default ? 'badge-green' : 'badge-gray'}`} title={c.is_default ? 'Empresa padrão das novas vendas' : 'Cadastro ativo; não é a empresa padrão'}>
                    {c.is_default ? 'Padrão' : 'Cadastrada'}
                  </span>
                </div>
                <p className="text-xs text-gray-400">{c.cnpj || 'sem CNPJ'} · {REGIMES[c.regime] || c.regime}</p>
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-gray-500">Faturado: <b className="text-gray-800">{fmt(c.faturado)}</b></span>
                  <span className="text-gray-500">Limite: {fmt(c.annual_limit)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1.5 rounded-full bg-gray-100 flex-1">
                    <div className={`h-1.5 rounded-full ${c.pct >= 90 ? 'bg-red-500' : c.pct >= 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                      style={{ width: `${Math.min(100, c.pct)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700">{String(c.pct).replace('.', ',')}%</span>
                </div>
              </div>
            ))}
            {companies.length === 0 && <p className="p-6 text-center text-sm text-gray-400">Cadastre a primeira empresa na aba Empresas.</p>}
          </div>
        </div>

        {/* Faturamento x Limite (anual) */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-3">Faturamento × Limite (Anual)</h2>
          {main ? (
            <div className="flex items-center gap-4">
              <div className="w-36 h-36 relative shrink-0">
                <Doughnut
                  data={{
                    labels: ['Faturado', 'Disponível'],
                    datasets: [{
                      data: [main.faturado, Math.max(0, main.annual_limit - main.faturado)],
                      backgroundColor: [main.pct >= 90 ? '#ef4444' : main.pct >= 70 ? '#f59e0b' : '#22c55e', '#e5e7eb'],
                      borderWidth: 0,
                    }],
                  }}
                  options={{ plugins: { legend: { display: false } }, cutout: '72%', maintainAspectRatio: false }}
                />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <p className={`text-xl font-extrabold ${main.pct >= 90 ? 'text-red-600' : main.pct >= 70 ? 'text-amber-600' : 'text-green-600'}`}>
                    {String(main.pct).replace('.', ',')}%
                  </p>
                  <p className="text-[10px] text-gray-400">Utilizado</p>
                </div>
              </div>
              <div className="space-y-2 text-sm flex-1">
                <div><p className="text-xs text-gray-400">Faturado</p><p className="font-bold">{fmt(main.faturado)}</p></div>
                <div><p className="text-xs text-gray-400">Limite Anual</p><p className="font-bold">{fmt(main.annual_limit)}</p></div>
                <div><p className="text-xs text-gray-400">Disponível</p><p className="font-bold text-green-600">{fmt(main.restante)}</p></div>
              </div>
            </div>
          ) : <p className="text-sm text-gray-400">Sem empresa cadastrada.</p>}
          {main && (
            <p className="mt-3 text-xs rounded-lg bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle size={13} className="shrink-0" />
              Atenção: você atingiu {String(main.pct).replace('.', ',')}% do limite do {REGIMES[main.regime] || 'regime'}
            </p>
          )}
        </div>

        {/* Alertas e Avisos */}
        <div className="card overflow-hidden">
          <div className="card-header"><h2 className="font-semibold text-gray-900 text-sm">Alertas e Avisos</h2></div>
          <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
            {(alerts || []).map((a, i) => {
              const s = SEVERITY[a.severity] || SEVERITY.info;
              return (
                <div key={i} className={`px-4 py-2.5 border-l-4 ${s.border}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">{a.text}</p>
                </div>
              );
            })}
            {(alerts || []).length === 0 && <p className="p-6 text-center text-sm text-gray-400">Nenhum alerta no momento. 🎉</p>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        {/* DRE mensal */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-2">DRE — Demonstrativo de Resultado (Mensal)</h2>
          <div className="space-y-1.5 text-sm">
            {[
              ['Receita Bruta', dre.receita_bruta, 'text-green-600'],
              ['(-) Impostos', dre.impostos, 'text-red-500'],
              ['(-) Custos', dre.custos, 'text-red-500'],
              ['(-) Despesas', dre.despesas, 'text-red-500'],
            ].map(([label, v, cls]) => (
              <div key={label} className="flex justify-between border-b border-gray-50 pb-1">
                <span className="text-gray-500">{label}</span>
                <span className={`font-semibold ${cls}`}>{fmt(v)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-1">
              <span className="font-bold text-gray-900">(=) Lucro Líquido</span>
              <span className={`font-bold ${dre.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(dre.lucro)}</span>
            </div>
          </div>
          <button className="w-full mt-3 text-xs text-primary-600 hover:underline text-center" onClick={() => setTab('dre')}>
            Ver DRE Completo
          </button>
        </div>

        {/* Fluxo de Caixa */}
        <div className="card p-4">
          <h2 className="font-semibold text-gray-900 text-sm mb-2">Fluxo de Caixa (Mensal)</h2>
          {(ov?.fluxo || []).length ? (
            <div className="h-48">
              <Bar
                data={{
                  labels: ov.fluxo.map(f => MONTHS_SHORT[Number(f.month.slice(5, 7)) - 1]),
                  datasets: [
                    { label: 'Entradas', data: ov.fluxo.map(f => f.entradas), backgroundColor: '#22c55e' },
                    { label: 'Saídas', data: ov.fluxo.map(f => f.saidas), backgroundColor: '#ef4444' },
                    { label: 'Saldo', data: ov.fluxo.map(f => f.saldo), backgroundColor: '#3b82f6' },
                  ],
                }}
                options={{ maintainAspectRatio: false, plugins: { legend: { position: 'top', labels: { boxWidth: 10, font: { size: 10 } } } } }}
              />
            </div>
          ) : <p className="text-sm text-gray-400 py-8 text-center">Sem pagamentos registrados nos últimos meses.</p>}
          <Link to="/contas" className="block mt-2 text-xs text-primary-600 hover:underline text-center">Ver Fluxo Completo</Link>
        </div>

        {/* Contas a Receber / Pagar */}
        <div className="card p-4 space-y-3">
          <h2 className="font-semibold text-gray-900 text-sm">Contas a Receber / Pagar</h2>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-green-50 border border-green-200 p-3">
              <p className="text-[11px] text-green-700 font-semibold">A Receber</p>
              <p className="text-lg font-bold text-green-700">{fmt(k.contas_receber)}</p>
              <p className="text-[11px] text-green-600">{k.contas_receber_qtd} títulos</p>
            </div>
            <div className="rounded-xl bg-red-50 border border-red-200 p-3">
              <p className="text-[11px] text-red-700 font-semibold">A Pagar</p>
              <p className="text-lg font-bold text-red-700">{fmt(k.contas_pagar)}</p>
              <p className="text-[11px] text-red-600">{k.contas_pagar_qtd} títulos</p>
            </div>
          </div>
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-1">Vencimentos Próximos</p>
            <div className="space-y-1">
              {(ov?.upcoming || []).map(u => (
                <div key={u.id} className="flex justify-between text-xs">
                  <span className="text-gray-500 truncate mr-2">
                    {u.type === 'receivable' ? 'Receber' : 'Pagar'} — {u.who || u.description || '—'}
                  </span>
                  <span className="whitespace-nowrap font-medium">{fmt(u.amount)} <span className="text-gray-400">{dBR(u.due_date)}</span></span>
                </div>
              ))}
              {(ov?.upcoming || []).length === 0 && <p className="text-xs text-gray-400">Nada vencendo em breve.</p>}
            </div>
          </div>
          <Link to="/contas" className="block text-xs text-primary-600 hover:underline text-center">Ver todas as contas</Link>
        </div>
      </div>

      {/* Relatórios Rápidos */}
      <div className="card p-4">
        <h2 className="font-semibold text-gray-900 text-sm mb-3">Relatórios Rápidos</h2>
        <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-9 gap-2">
          {quick.map(([label, Icon, to]) => typeof to === 'string' ? (
            <Link key={label} to={to} className="rounded-xl border border-gray-200 hover:border-primary-400 hover:bg-primary-50/40 p-3 text-center transition-colors">
              <Icon size={18} className="mx-auto text-primary-600" />
              <p className="text-xs text-gray-600 mt-1.5">{label}</p>
            </Link>
          ) : (
            <button key={label} onClick={to} className="rounded-xl border border-gray-200 hover:border-primary-400 hover:bg-primary-50/40 p-3 text-center transition-colors">
              <Icon size={18} className="mx-auto text-primary-600" />
              <p className="text-xs text-gray-600 mt-1.5">{label}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════ EMPRESAS ═══════════════
function EmpresaModal({ open, initial, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const f = form || {
    razao_social: initial?.razao_social || '', nome_fantasia: initial?.nome_fantasia || '',
    cnpj: initial?.cnpj || '', regime: initial?.regime || 'simples',
    inscricao_estadual: initial?.inscricao_estadual || '', inscricao_municipal: initial?.inscricao_municipal || '',
    annual_limit: initial?.annual_limit != null ? String(initial.annual_limit) : '4800000',
    aliquota: initial?.aliquota != null ? String(initial.aliquota) : '4',
    cert_expiry: initial?.cert_expiry || '', is_default: !!initial?.is_default,
  };
  const set = p => setForm({ ...f, ...p });

  async function save() {
    if (!f.razao_social.trim()) { toast.error('Informe a razão social'); return; }
    setSaving(true);
    try {
      const payload = {
        ...f,
        annual_limit: parseFloat(String(f.annual_limit).replace(/\./g, '').replace(',', '.')) || 0,
        aliquota: parseFloat(String(f.aliquota).replace(',', '.')) || 0,
      };
      if (isEdit) await api.put(`/contabil/companies/${initial.id}`, payload);
      else await api.post('/contabil/companies', payload);
      toast.success('Empresa salva!');
      setForm(null); onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  return (
    <Modal isOpen={open} onClose={() => { setForm(null); onClose(); }} title={isEdit ? 'Editar empresa' : 'Adicionar empresa'} size="md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="md:col-span-2">
          <label className="label">Razão Social</label>
          <input className="input" value={f.razao_social} onChange={e => set({ razao_social: e.target.value })} />
        </div>
        <div>
          <label className="label">Nome Fantasia</label>
          <input className="input" value={f.nome_fantasia} onChange={e => set({ nome_fantasia: e.target.value })} />
        </div>
        <div>
          <label className="label">CNPJ</label>
          <input className="input" value={f.cnpj} placeholder="00.000.000/0001-00" onChange={e => set({ cnpj: e.target.value })} />
        </div>
        <div>
          <label className="label">Inscrição Estadual (IE)</label>
          <input className="input" value={f.inscricao_estadual} placeholder="Isento, se não tiver"
            onChange={e => set({ inscricao_estadual: e.target.value })} />
        </div>
        <div>
          <label className="label">Inscrição Municipal (IM)</label>
          <input className="input" value={f.inscricao_municipal} onChange={e => set({ inscricao_municipal: e.target.value })} />
        </div>
        <div>
          <label className="label">Regime Tributário</label>
          <select className="input" value={f.regime} onChange={e => set({ regime: e.target.value })}>
            {Object.entries(REGIMES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Alíquota efetiva (%)</label>
          <input className="input" inputMode="decimal" value={f.aliquota} onChange={e => set({ aliquota: e.target.value })} />
        </div>
        <div>
          <label className="label">Limite anual (R$)</label>
          <input className="input" inputMode="decimal" value={f.annual_limit} onChange={e => set({ annual_limit: e.target.value })} />
        </div>
        <div>
          <label className="label">Certificado digital — vencimento</label>
          <input type="date" className="input" value={f.cert_expiry || ''} onChange={e => set({ cert_expiry: e.target.value })} />
        </div>
        <label className="md:col-span-2 flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={f.is_default} onChange={e => set({ is_default: e.target.checked })} />
          Empresa padrão dos pedidos (vendas sem empresa definida contam para ela)
        </label>
      </div>
      {isEdit
        ? <Certidoes companyId={initial.id} />
        : <p className="text-xs text-gray-400 mt-3">Salve a empresa para anexar as certidões.</p>}
      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        <button className="btn-secondary" onClick={() => { setForm(null); onClose(); }}><X size={14} /> Cancelar</button>
        <button className="btn-primary" disabled={saving} onClick={save}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
        </button>
      </div>
    </Modal>
  );
}

// ── Certidões da empresa ────────────────────────────────────
// CND Federal, Estadual, Municipal, FGTS e Trabalhista, com validade. O
// arquivo abre por link temporário: certidão traz a situação fiscal do
// CNPJ e não pode circular por link permanente.
const TIPOS_CERTIDAO = {
  federal: 'CND Federal (Receita/PGFN)',
  estadual: 'CND Estadual',
  municipal: 'CND Municipal',
  fgts: 'CRF — FGTS',
  trabalhista: 'CNDT — Trabalhista',
  outra: 'Outra',
};
const SITUACAO_CERTIDAO = {
  valida: ['Válida', 'bg-green-100 text-green-700'],
  vencendo: ['Vence em breve', 'bg-amber-100 text-amber-700'],
  vencida: ['Vencida', 'bg-red-100 text-red-700'],
  sem_validade: ['Sem validade', 'bg-gray-100 text-gray-600'],
};

function Certidoes({ companyId }) {
  const vazio = { tipo: 'federal', descricao: '', numero: '', emissao: '', validade: '', arquivo: null, arquivo_nome: '' };
  const [novo, setNovo] = useState(vazio);
  const [enviando, setEnviando] = useState(false);
  const { data: lista = [], isLoading, error, refetch } = useQuery({
    queryKey: ['contabil-certidoes', companyId],
    queryFn: () => api.get(`/contabil/companies/${companyId}/certidoes`),
    retry: false,
  });

  function escolherArquivo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error('Arquivo acima de 8 MB'); e.target.value = ''; return; }
    const r = new FileReader();
    r.onload = () => setNovo(n => ({ ...n, arquivo: r.result, arquivo_nome: file.name }));
    r.readAsDataURL(file);
  }

  async function salvar() {
    if (!novo.arquivo) { toast.error('Anexe o arquivo da certidão'); return; }
    setEnviando(true);
    try {
      await api.post(`/contabil/companies/${companyId}/certidoes`, novo);
      toast.success('Certidão anexada');
      setNovo(vazio);
      refetch();
    } catch (err) { toast.error(err.error || 'Erro ao anexar'); }
    finally { setEnviando(false); }
  }

  async function apagar(c) {
    if (!confirm(`Apagar a certidão "${TIPOS_CERTIDAO[c.tipo] || c.tipo}"?`)) return;
    try { await api.delete(`/contabil/certidoes/${c.id}`); toast.success('Certidão apagada'); refetch(); }
    catch (err) { toast.error(err.error || 'Erro ao apagar'); }
  }

  return (
    <div className="border-t mt-4 pt-4 space-y-3">
      <p className="font-semibold text-gray-900 text-sm flex items-center gap-1.5"><Paperclip size={14} /> Certidões da empresa</p>

      {error ? (
        <p className="text-xs text-amber-700">{error.error || 'Não foi possível carregar as certidões.'}</p>
      ) : isLoading ? (
        <Loader2 size={16} className="animate-spin text-primary-500" />
      ) : lista.length === 0 ? (
        <p className="text-xs text-gray-400">Nenhuma certidão anexada.</p>
      ) : (
        <div className="space-y-1.5">
          {lista.map(c => {
            const [rotulo, cls] = SITUACAO_CERTIDAO[c.situacao] || SITUACAO_CERTIDAO.sem_validade;
            return (
              <div key={c.id} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-gray-800 truncate">{TIPOS_CERTIDAO[c.tipo] || c.tipo}{c.descricao ? ` — ${c.descricao}` : ''}</p>
                  <p className="text-[11px] text-gray-400">
                    {c.numero ? `Nº ${c.numero} · ` : ''}emitida {dBR(c.emissao)} · validade {dBR(c.validade)}
                  </p>
                </div>
                <span className={`text-[11px] font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${cls}`}>{rotulo}</span>
                {c.link && (
                  <a href={c.link} target="_blank" rel="noreferrer" className="btn-ghost p-1.5 text-blue-600" title="Abrir arquivo">
                    <ExternalLink size={14} />
                  </a>
                )}
                <button className="btn-ghost p-1.5 text-red-500" title="Apagar" onClick={() => apagar(c)}><Trash2 size={14} /></button>
              </div>
            );
          })}
        </div>
      )}

      <div className="rounded-lg bg-gray-50 p-3 grid grid-cols-1 md:grid-cols-2 gap-2">
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={novo.tipo} onChange={e => setNovo(n => ({ ...n, tipo: e.target.value }))}>
            {Object.entries(TIPOS_CERTIDAO).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Número / código (opcional)</label>
          <input className="input" value={novo.numero} onChange={e => setNovo(n => ({ ...n, numero: e.target.value }))} />
        </div>
        <div>
          <label className="label">Emissão</label>
          <input type="date" className="input" value={novo.emissao} onChange={e => setNovo(n => ({ ...n, emissao: e.target.value }))} />
        </div>
        <div>
          <label className="label">Validade</label>
          <input type="date" className="input" value={novo.validade} onChange={e => setNovo(n => ({ ...n, validade: e.target.value }))} />
        </div>
        {novo.tipo === 'outra' && (
          <div className="md:col-span-2">
            <label className="label">Descrição</label>
            <input className="input" value={novo.descricao} onChange={e => setNovo(n => ({ ...n, descricao: e.target.value }))} />
          </div>
        )}
        <div className="md:col-span-2 flex flex-wrap items-center gap-2">
          <label className="btn-secondary cursor-pointer">
            <Paperclip size={14} /> {novo.arquivo_nome || 'Escolher arquivo (PDF ou imagem)'}
            <input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" className="hidden" onChange={escolherArquivo} />
          </label>
          <button className="btn-primary ml-auto" disabled={enviando || !novo.arquivo} onClick={salvar}>
            {enviando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Anexar certidão
          </button>
        </div>
      </div>
    </div>
  );
}

function Empresas() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const { data: companies, isLoading, refetch } = useQuery({
    queryKey: ['contabil-companies'],
    queryFn: () => api.get('/contabil/companies'),
  });

  async function deactivate(c) {
    if (!confirm(`Desativar a empresa "${c.razao_social}"?\n(Registros fiscais não são apagados — apenas desativados.)`)) return;
    try {
      await api.delete(`/contabil/companies/${c.id}`);
      toast.success('Empresa desativada');
      refetch(); qc.invalidateQueries({ queryKey: ['contabil-overview'] });
    } catch (err) { toast.error(err.error || 'Erro'); }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button className="btn-primary" onClick={() => setModal({})}><Plus size={15} /> Adicionar Empresa</button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {(companies || []).map(c => (
          <div key={c.id} className="card p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-bold text-gray-900 truncate">{c.razao_social}</p>
                <p className="text-xs text-gray-400">{c.nome_fantasia ? `${c.nome_fantasia} · ` : ''}{c.cnpj || 'sem CNPJ'}</p>
                {(c.inscricao_estadual || c.inscricao_municipal) && (
                  <p className="text-xs text-gray-400">
                    {[c.inscricao_estadual && `IE ${c.inscricao_estadual}`, c.inscricao_municipal && `IM ${c.inscricao_municipal}`].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1">
                {c.is_default && <span className="badge badge-blue">Padrão</span>}
                <button className="btn-ghost p-1.5 text-blue-600" onClick={() => setModal(c)}><Pencil size={14} /></button>
                <button className="btn-ghost p-1.5 text-red-500" title="Desativar" onClick={() => deactivate(c)}><Ban size={14} /></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><p className="text-[11px] text-gray-400">Regime</p><p className="font-medium">{REGIMES[c.regime] || c.regime} · {String(c.aliquota).replace('.', ',')}%</p></div>
              <div><p className="text-[11px] text-gray-400">Certificado digital</p><p className="font-medium">{c.cert_expiry ? `vence ${dBR(c.cert_expiry)}` : '—'}</p></div>
              <div><p className="text-[11px] text-gray-400">Faturamento acumulado</p><p className="font-bold">{fmt(c.faturado)}</p></div>
              <div><p className="text-[11px] text-gray-400">Projeção anual</p><p className="font-medium">{fmt(c.projecao)}</p></div>
            </div>
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-0.5">
                <span>Limite: {fmt(c.annual_limit)}</span>
                <span className="font-semibold">{String(c.pct).replace('.', ',')}% utilizado</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className={`h-2 rounded-full ${c.pct >= 90 ? 'bg-red-500' : c.pct >= 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                  style={{ width: `${Math.min(100, c.pct)}%` }} />
              </div>
              {c.pct >= 70 && (
                <p className="text-xs text-amber-700 mt-1 flex items-center gap-1">
                  <AlertTriangle size={12} /> Próximo do limite configurado
                </p>
              )}
            </div>
            {(c.accounts || []).length > 0 && (
              <p className="text-xs text-gray-500">
                🏦 {c.accounts.map(a => a.name).join(' · ')}
              </p>
            )}
          </div>
        ))}
        {(companies || []).length === 0 && (
          <div className="card p-10 text-center text-gray-400 md:col-span-2">
            <Building2 size={28} className="mx-auto mb-2 opacity-40" />
            <p className="text-sm">Nenhuma empresa cadastrada — adicione o primeiro CNPJ.</p>
          </div>
        )}
      </div>
      <EmpresaModal open={!!modal} initial={modal || {}} onClose={() => setModal(null)}
        onSaved={() => { setModal(null); refetch(); qc.invalidateQueries({ queryKey: ['contabil-overview'] }); }} />
    </div>
  );
}

// ═══════════════ BANCOS ═══════════════
function BancoModal({ open, initial, companies, onClose, onSaved }) {
  const isEdit = !!initial?.id;
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const f = form || {
    name: initial?.name || '', bank_name: initial?.bank_name || '',
    company_id: initial?.company_id || '', agency: initial?.agency || '',
    account_number: initial?.account_number || '', pix_key: initial?.pix_key || '',
    balance: initial?.balance != null ? String(initial.balance) : '0',
    type: initial?.type || 'checking',
  };
  const set = p => setForm({ ...f, ...p });

  async function save() {
    if (!f.name.trim()) { toast.error('Informe o nome da conta (ex.: Nubank Lyon)'); return; }
    setSaving(true);
    try {
      const payload = { ...f, balance: parseFloat(String(f.balance).replace(/\./g, '').replace(',', '.')) || 0 };
      if (isEdit) await api.put(`/contabil/accounts/${initial.id}`, payload);
      else await api.post('/contabil/accounts', payload);
      toast.success('Conta salva!');
      setForm(null); onSaved();
    } catch (err) { toast.error(err.error || 'Erro ao salvar'); }
    finally { setSaving(false); }
  }

  return (
    <Modal isOpen={open} onClose={() => { setForm(null); onClose(); }} title={isEdit ? 'Editar conta bancária' : 'Adicionar conta bancária'} size="md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="label">Nome da conta</label>
          <input className="input" value={f.name} placeholder="Nubank Lyon" onChange={e => set({ name: e.target.value })} />
        </div>
        <div>
          <label className="label">Banco</label>
          <input className="input" list="ct-banks" value={f.bank_name} placeholder="Nubank" onChange={e => set({ bank_name: e.target.value })} />
          <datalist id="ct-banks">
            {['Nubank', 'Cresol', 'Sicredi', 'Caixa', 'Banco do Brasil', 'Itaú', 'Bradesco', 'Santander', 'Inter', 'C6 Bank'].map(b => <option key={b} value={b} />)}
          </datalist>
        </div>
        <div>
          <label className="label">Empresa vinculada</label>
          <select className="input" value={f.company_id} onChange={e => set({ company_id: e.target.value })}>
            <option value="">— Todas as empresas —</option>
            {(companies || []).map(c => <option key={c.id} value={c.id}>{c.nome_fantasia || c.razao_social}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tipo</label>
          <select className="input" value={f.type} onChange={e => set({ type: e.target.value })}>
            <option value="checking">Conta corrente</option>
            <option value="savings">Poupança</option>
            <option value="cash">Caixa (dinheiro)</option>
            <option value="other">Outra</option>
          </select>
        </div>
        <div>
          <label className="label">Agência</label>
          <input className="input" value={f.agency} onChange={e => set({ agency: e.target.value })} />
        </div>
        <div>
          <label className="label">Conta</label>
          <input className="input" value={f.account_number} onChange={e => set({ account_number: e.target.value })} />
        </div>
        <div>
          <label className="label">Chave PIX</label>
          <input className="input" value={f.pix_key} onChange={e => set({ pix_key: e.target.value })} />
        </div>
        <div>
          <label className="label">Saldo atual (R$)</label>
          <input className="input" inputMode="decimal" value={f.balance} onChange={e => set({ balance: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t mt-4">
        <button className="btn-secondary" onClick={() => { setForm(null); onClose(); }}><X size={14} /> Cancelar</button>
        <button className="btn-primary" disabled={saving} onClick={save}>
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Salvar
        </button>
      </div>
    </Modal>
  );
}

function Bancos() {
  const qc = useQueryClient();
  const [modal, setModal] = useState(null);
  const { data: accounts, isLoading, refetch } = useQuery({
    queryKey: ['contabil-accounts'],
    queryFn: () => api.get('/contabil/accounts'),
  });
  const { data: companies } = useQuery({
    queryKey: ['contabil-companies'],
    queryFn: () => api.get('/contabil/companies'),
  });

  async function deactivate(a) {
    if (!confirm(`Desativar a conta "${a.name}"?`)) return;
    try { await api.delete(`/contabil/accounts/${a.id}`); toast.success('Conta desativada'); refetch(); }
    catch (err) { toast.error(err.error || 'Erro'); }
  }

  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  const actives = (accounts || []).filter(a => a.is_active !== false);
  const total = actives.reduce((s, a) => s + (Number(a.balance) || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="card px-4 py-2">
          <span className="text-xs text-gray-500">Saldo total: </span>
          <span className="font-bold text-gray-900">{fmt(total)}</span>
        </div>
        <button className="btn-primary" onClick={() => setModal({})}><Plus size={15} /> Adicionar Conta</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
              <th className="px-4 py-2">Conta</th>
              <th className="px-4 py-2">Banco</th>
              <th className="px-4 py-2">Empresa</th>
              <th className="px-4 py-2">Agência / Conta</th>
              <th className="px-4 py-2">PIX</th>
              <th className="px-4 py-2 text-right">Saldo</th>
              <th className="px-4 py-2 text-center">Ações</th>
            </tr>
          </thead>
          <tbody>
            {actives.map(a => (
              <tr key={a.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="px-4 py-2.5 font-medium text-gray-900">{a.name}</td>
                <td className="px-4 py-2.5 text-gray-500">{a.bank_name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500">{a.CONTABIL_EMPRESAS?.nome_fantasia || a.CONTABIL_EMPRESAS?.razao_social || 'Todas'}</td>
                <td className="px-4 py-2.5 text-gray-500">{[a.agency, a.account_number].filter(Boolean).join(' / ') || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 truncate max-w-[160px]">{a.pix_key || '—'}</td>
                <td className="px-4 py-2.5 text-right font-semibold">{fmt(a.balance)}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-center gap-1">
                    <button className="btn-ghost p-1.5 text-blue-600" onClick={() => setModal(a)}><Pencil size={14} /></button>
                    <button className="btn-ghost p-1.5 text-red-500" title="Desativar" onClick={() => deactivate(a)}><Ban size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {actives.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-sm text-gray-400">
                Nenhuma conta cadastrada — adicione Nubank, Cresol e as demais contas de cada empresa.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        As contas aparecem no PDV como "Conta de Destino" (somente as da empresa faturadora selecionada).
      </p>
      <BancoModal open={!!modal} initial={modal || {}} companies={companies}
        onClose={() => setModal(null)}
        onSaved={() => { setModal(null); refetch(); qc.invalidateQueries({ queryKey: ['contabil-overview'] }); }} />
    </div>
  );
}

// ═══════════════ CONCILIAÇÃO ═══════════════
const RECON_STATUS = {
  conciliado: { label: 'Conciliado', cls: 'badge-green' },
  parcial: { label: 'Parcial', cls: 'badge-yellow' },
  pendente: { label: 'Pendente', cls: 'badge-blue' },
  divergente: { label: '⚠️ Divergente', cls: 'badge-red' },
  sem_lancamento: { label: 'Sem lançamento', cls: 'badge-gray' },
};

function Conciliacao() {
  const [month, setMonth] = useState(thisMonth());
  const { data, isLoading } = useQuery({
    queryKey: ['contabil-recon', month],
    queryFn: () => api.get(`/contabil/reconciliation?month=${month}`),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <input type="month" className="input max-w-[170px]" value={month} onChange={e => setMonth(e.target.value)} />
        {data?.summary && (
          <div className="flex gap-2 flex-wrap text-xs">
            {Object.entries(RECON_STATUS).map(([k, s]) => (
              <span key={k} className={`badge ${s.cls}`}>{s.label}: {data.summary[
                k === 'conciliado' ? 'conciliados' : k === 'parcial' ? 'parciais' : k === 'pendente' ? 'pendentes' : k === 'divergente' ? 'divergentes' : 'sem_lancamento'
              ] ?? 0}</span>
            ))}
          </div>
        )}
      </div>
      {isLoading ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                <th className="px-4 py-2">Pedido</th>
                <th className="px-4 py-2">Cliente</th>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2 text-right">Valor do Pedido</th>
                <th className="px-4 py-2 text-right" title="Total lançado no contas a receber">Lançado</th>
                <th className="px-4 py-2 text-right">Recebido</th>
                <th className="px-4 py-2 text-right">Diferença</th>
                <th className="px-4 py-2 text-center">NF-e</th>
                <th className="px-4 py-2 text-center">Situação</th>
              </tr>
            </thead>
            <tbody>
              {(data?.rows || []).map(r => {
                const st = RECON_STATUS[r.status] || RECON_STATUS.pendente;
                return (
                  <tr key={r.id} className={`border-b border-gray-50 ${r.status === 'divergente' ? 'bg-red-50/50' : ''}`}>
                    <td className="px-4 py-2 font-mono font-semibold">#{String(r.number).padStart(4, '0')}</td>
                    <td className="px-4 py-2">{r.customer || <span className="text-gray-400">—</span>}</td>
                    <td className="px-4 py-2 text-gray-500">{dBR(r.date)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(r.total)}</td>
                    <td className="px-4 py-2 text-right text-gray-500">{r.lancado > 0 ? fmt(r.lancado) : '—'}</td>
                    <td className="px-4 py-2 text-right">{r.recebido > 0 ? fmt(r.recebido) : '—'}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${Math.abs(r.diferenca) > 0.01 ? 'text-red-600' : 'text-gray-400'}`}>
                      {r.lancado > 0 ? fmt(r.diferenca) : '—'}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {r.nf_status === 'authorized' ? <span className="badge badge-green">Autorizada</span>
                        : r.nf_status ? <span className="badge badge-yellow">{r.nf_status}</span>
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-2 text-center"><span className={`badge ${st.cls}`}>{st.label}</span></td>
                  </tr>
                );
              })}
              {(data?.rows || []).length === 0 && (
                <tr><td colSpan={9} className="text-center py-12 text-sm text-gray-400">Nenhum pedido neste mês.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Compara Pedido × Contas a Receber × NF-e. Divergência = valor lançado diferente do pedido — confira o recebimento no banco.
      </p>
    </div>
  );
}

// ═══════════════ DRE ═══════════════
function DRE() {
  const [granularity, setGranularity] = useState('month');
  const [month, setMonth] = useState(thisMonth());
  const { data: dre, isLoading } = useQuery({
    queryKey: ['contabil-dre', granularity, month],
    queryFn: () => api.get(`/contabil/dre?granularity=${granularity}&date=${month}`),
  });

  function exportPdf() {
    if (!dre) return;
    const rows = [
      ['Receita Bruta', dre.receita_bruta], ['(-) Impostos', -dre.impostos],
      ['(-) Custos', -dre.custos], ['(-) Despesas', -dre.despesas], ['(=) Lucro Líquido', dre.lucro],
    ];
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>DRE — ${dre.label}</title>
      <style>@page{margin:14mm}body{font-family:Arial;padding:24px;font-size:13px}h1{font-size:19px;color:#1e1b4b}
      table{width:100%;border-collapse:collapse;margin-top:14px}td{padding:9px 10px;border-bottom:1px solid #eee}
      .r{text-align:right;font-weight:700}.total td{background:#ecfdf5;font-weight:800;font-size:15px}
      .no-print{position:fixed;top:12px;right:12px;background:#4f46e5;color:#fff;border:none;border-radius:8px;padding:9px 16px;font-weight:700;cursor:pointer}
      @media print{.no-print{display:none}}</style></head><body>
      <button class="no-print" onclick="window.print()">🖨️ Imprimir / PDF</button>
      <h1>DRE — Demonstrativo de Resultado</h1>
      <p style="color:#6b7280">Período: ${dre.label} · Alíquota: ${dre.aliquota}% · LYON COPOS</p>
      <table>${rows.map(([l, v], i) => `<tr class="${i === 4 ? 'total' : ''}"><td>${l}</td><td class="r" style="color:${v >= 0 ? '#047857' : '#dc2626'}">${fmt(v)}</td></tr>`).join('')}</table>
      <p style="color:#9ca3af;margin-top:10px;font-size:11px">Margem líquida: ${String(dre.margem_pct).replace('.', ',')}% · Gerado pelo Dator ERP</p>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Libere as janelas pop-up'); return; }
    w.document.write(html); w.document.close();
  }

  async function exportExcel() {
    if (!dre) return;
    const XLSX = await import('xlsx');
    const ws = XLSX.utils.json_to_sheet([
      { Linha: 'Receita Bruta', Valor: dre.receita_bruta },
      { Linha: '(-) Impostos', Valor: -dre.impostos },
      { Linha: '(-) Custos', Valor: -dre.custos },
      { Linha: '(-) Despesas', Valor: -dre.despesas },
      { Linha: '(=) Lucro Líquido', Valor: dre.lucro },
      { Linha: 'Margem líquida (%)', Valor: dre.margem_pct },
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'DRE');
    XLSX.writeFile(wb, `dre-${dre.label.replace(/[^\w-]/g, '_')}.xlsx`);
    toast.success('DRE exportada!');
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-2 flex-wrap">
        {[['month', 'Mensal'], ['quarter', 'Trimestral'], ['year', 'Anual']].map(([v, l]) => (
          <button key={v} onClick={() => setGranularity(v)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              granularity === v ? 'bg-primary-600 text-white border-primary-600' : 'bg-white text-gray-600 border-gray-200'}`}>
            {l}
          </button>
        ))}
        <input type="month" className="input max-w-[170px]" value={month} onChange={e => setMonth(e.target.value)} />
        <div className="ml-auto flex gap-2">
          <button className="btn-secondary btn-sm" onClick={exportPdf}><Printer size={14} /> PDF</button>
          <button className="btn-secondary btn-sm" onClick={exportExcel}><FileDown size={14} /> Excel</button>
        </div>
      </div>
      {isLoading ? (
        <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>
      ) : dre && (
        <div className="card overflow-hidden">
          <div className="bg-gray-900 text-white px-4 py-2.5">
            <span className="font-semibold text-sm">DRE — {dre.label}</span>
            <span className="text-xs text-gray-300 ml-2">alíquota {String(dre.aliquota).replace('.', ',')}%</span>
          </div>
          <div className="p-5 space-y-2 text-[15px]">
            {[
              ['Receita Bruta', dre.receita_bruta, 'text-green-600'],
              ['(-) Impostos', dre.impostos, 'text-red-500'],
              ['(-) Custos (CMV)', dre.custos, 'text-red-500'],
              ['(-) Despesas', dre.despesas, 'text-red-500'],
            ].map(([l, v, cls]) => (
              <div key={l} className="flex justify-between border-b border-gray-100 pb-2">
                <span className="text-gray-600">{l}</span>
                <span className={`font-semibold ${cls}`}>{fmt(v)}</span>
              </div>
            ))}
            <div className="flex justify-between pt-2">
              <span className="font-extrabold text-gray-900">(=) Lucro Líquido</span>
              <span className={`font-extrabold text-lg ${dre.lucro >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(dre.lucro)}</span>
            </div>
            <p className="text-xs text-gray-400 text-right">Margem líquida: {String(dre.margem_pct).replace('.', ',')}%</p>
          </div>
        </div>
      )}
      <p className="text-xs text-gray-400">
        Receita = pedidos do período · Impostos = alíquota da empresa padrão · Custos = custo dos produtos vendidos
        (fichas de precificação) · Despesas = contas a pagar do período (exceto compras de mercadoria).
      </p>
    </div>
  );
}

// ═══════════════ TRIBUTÁRIO ═══════════════
function Tributario() {
  const { data: companies, isLoading } = useQuery({
    queryKey: ['contabil-companies'],
    queryFn: () => api.get('/contabil/companies'),
  });
  const LEVELS = [70, 80, 90, 95, 100];

  if (isLoading) return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;

  return (
    <div className="space-y-4 max-w-4xl">
      {(companies || []).map(c => (
        <div key={c.id} className="card p-4 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="font-bold text-gray-900">{c.razao_social}</p>
              <p className="text-xs text-gray-400">{c.cnpj || 'sem CNPJ'} · {REGIMES[c.regime] || c.regime} · alíquota {String(c.aliquota).replace('.', ',')}%</p>
            </div>
            <span className={`text-2xl font-extrabold ${c.pct >= 90 ? 'text-red-600' : c.pct >= 70 ? 'text-amber-600' : 'text-green-600'}`}>
              {String(c.pct).replace('.', ',')}%
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
            <div className="rounded-xl bg-gray-50 p-2.5"><p className="text-[11px] text-gray-500">Limite anual</p><p className="font-bold">{fmt(c.annual_limit)}</p></div>
            <div className="rounded-xl bg-gray-50 p-2.5"><p className="text-[11px] text-gray-500">Valor faturado</p><p className="font-bold">{fmt(c.faturado)}</p></div>
            <div className="rounded-xl bg-gray-50 p-2.5"><p className="text-[11px] text-gray-500">Valor restante</p><p className="font-bold text-green-600">{fmt(c.restante)}</p></div>
            <div className="rounded-xl bg-gray-50 p-2.5"><p className="text-[11px] text-gray-500">Projeção anual</p>
              <p className={`font-bold ${c.projecao > c.annual_limit ? 'text-red-600' : ''}`}>{fmt(c.projecao)}</p></div>
          </div>
          {/* Barra com os marcos de alerta 70/80/90/95/100 */}
          <div className="relative pt-4">
            {LEVELS.map(l => (
              <span key={l} className={`absolute top-0 text-[10px] -translate-x-1/2 ${c.pct >= l ? 'font-bold text-red-500' : 'text-gray-400'}`}
                style={{ left: `${l}%` }}>{l}%</span>
            ))}
            <div className="h-3 rounded-full bg-gray-100 relative overflow-hidden">
              <div className={`h-3 ${c.pct >= 90 ? 'bg-red-500' : c.pct >= 70 ? 'bg-amber-400' : 'bg-green-500'}`}
                style={{ width: `${Math.min(100, c.pct)}%` }} />
              {LEVELS.map(l => (
                <span key={l} className="absolute top-0 h-3 w-px bg-white/80" style={{ left: `${l}%` }} />
              ))}
            </div>
          </div>
          {c.projecao > c.annual_limit && (
            <p className="text-xs rounded-lg bg-red-50 border border-red-200 text-red-700 px-3 py-2 flex items-center gap-1.5">
              <AlertTriangle size={13} /> No ritmo atual, a projeção anual ({fmt(c.projecao)}) ultrapassa o limite — planeje a distribuição entre empresas.
            </p>
          )}
        </div>
      ))}
      {(companies || []).length === 0 && (
        <div className="card p-10 text-center text-gray-400">
          <Scale size={28} className="mx-auto mb-2 opacity-40" />
          <p className="text-sm">Cadastre as empresas na aba Empresas para acompanhar o limite tributário.</p>
        </div>
      )}
    </div>
  );
}

// ═══════════════ PÁGINA ═══════════════
const TABS = [
  ['visao', 'Visão Geral'],
  ['empresas', 'Empresas'],
  ['bancos', 'Bancos'],
  ['conciliacao', 'Conciliação'],
  ['dre', 'DRE'],
  ['margem', 'Margem Consolidada'],
  ['tributario', 'Tributário'],
  ['malote', 'Malote de Pagamentos'],
  ['contador', 'Exportação p/ Contador'],
];

export default function Contabil() {
  const [tab, setTab] = useState('visao');
  const [month, setMonth] = useState(thisMonth());

  return (
    <div className="space-y-4">
      <div className="page-header flex-wrap gap-3">
        <div>
          <h1 className="page-title">Contábil / Fiscal</h1>
          <p className="text-sm text-gray-500 mt-1">Módulo Contábil e Fiscal — Visão Geral</p>
        </div>
        {tab === 'visao' && (
          <input type="month" className="input max-w-[170px]" value={month} onChange={e => setMonth(e.target.value)} />
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap border-b border-gray-200 pb-2">
        {TABS.map(([v, l]) => (
          <button key={v} onClick={() => setTab(v)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              tab === v ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'visao' && <VisaoGeral month={month} setTab={setTab} />}
      {tab === 'empresas' && <Empresas />}
      {tab === 'bancos' && <Bancos />}
      {tab === 'conciliacao' && <Conciliacao />}
      {tab === 'dre' && <DRE />}
      {tab === 'tributario' && <Tributario />}
      {tab === 'margem' && <Margem />}
      {tab === 'malote' && <Malote />}
      {tab === 'contador' && <Exportacao />}
    </div>
  );
}
