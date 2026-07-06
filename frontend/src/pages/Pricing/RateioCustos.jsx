import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Landmark, Plus, Trash2, Loader2, Check, Info, Factory } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { fmtBRL, fmtBRL4, fmtQty } from '@/lib/pricingCalc';
import { iconFor } from './fixedCostIcons';

// Sugestões da especificação (item 8) — um clique pré-preenche o formulário
const SUGGESTIONS = [
  'Aluguel', 'Energia', 'Água', 'Internet', 'Telefone', 'Contador',
  'Marketing', 'Sistema', 'Pró-labore', 'Funcionários',
];

export default function RateioCustos() {
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', amount: '', due_day: 5 });
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null); // { id, amount }

  const { data: fixed, isLoading, refetch } = useQuery({
    queryKey: ['pricing-fixed-summary'],
    queryFn: () => api.get('/pricing/fixed-summary'),
  });
  const { data: allExpenses } = useQuery({
    queryKey: ['fixed-expenses'],
    queryFn: () => api.get('/contas/fixed-expenses'),
  });

  const actives = (allExpenses || []).filter(e => e.is_active);
  const inactive = (allExpenses || []).filter(e => !e.is_active);
  const existingNames = new Set(actives.map(e => e.name.toLowerCase()));

  function invalidate() {
    refetch();
    qc.invalidateQueries({ queryKey: ['fixed-expenses'] });
    qc.invalidateQueries({ queryKey: ['pricing-overview'] });
  }

  async function add() {
    if (!form.name.trim()) { toast.error('Informe o nome da despesa'); return; }
    const amount = parseFloat(String(form.amount).replace(',', '.'));
    if (!(amount >= 0)) { toast.error('Informe um valor válido'); return; }
    setSaving(true);
    try {
      await api.post('/contas/fixed-expenses', { name: form.name.trim(), amount, due_day: form.due_day });
      toast.success(`${form.name.trim()} adicionada!`);
      setForm({ name: '', amount: '', due_day: 5 });
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao adicionar despesa'); }
    finally { setSaving(false); }
  }

  async function saveAmount(exp) {
    const amount = parseFloat(String(editing.amount).replace(',', '.'));
    if (!(amount >= 0)) { toast.error('Valor inválido'); return; }
    try {
      await api.put(`/contas/fixed-expenses/${exp.id}`, { amount });
      toast.success(`${exp.name} atualizada`);
      setEditing(null);
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao atualizar'); }
  }

  async function remove(exp) {
    if (!confirm(`Remover a despesa "${exp.name}" do rateio?\n(Ela é desativada — o histórico de contas geradas é mantido.)`)) return;
    try {
      await api.delete(`/contas/fixed-expenses/${exp.id}`);
      toast.success('Despesa removida do rateio');
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao remover'); }
  }

  async function reactivate(exp) {
    try {
      await api.put(`/contas/fixed-expenses/${exp.id}`, { is_active: true });
      toast.success(`${exp.name} reativada`);
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao reativar'); }
  }

  async function saveMonthlyUnits(v) {
    const units = v === '' ? null : Math.max(0, parseInt(v) || 0);
    try {
      await api.put('/pricing/config', { monthly_units: units });
      toast.success('Meta de produção salva — rateio recalculado');
      invalidate();
    } catch (err) { toast.error(err.error || 'Erro ao salvar a meta'); }
  }

  if (isLoading) {
    return <div className="flex justify-center p-16"><Loader2 className="animate-spin text-primary-500" size={28} /></div>;
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rateio de Custos Fixos</h1>
          <p className="text-sm text-gray-500 mt-1">
            Despesas mensais divididas pela produção — o resultado entra automaticamente na Formação de Preço
          </p>
        </div>
      </div>

      {/* Totais (como no mockup: total, meta de produção, rateio) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="card p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide">Total Mensal</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{fmtBRL(fixed?.total)}</p>
          <p className="text-xs text-gray-400">{actives.length} despesa(s) ativa(s)</p>
        </div>
        <div className="card p-4">
          <p className="text-[11px] text-gray-500 uppercase tracking-wide flex items-center gap-1">
            <Factory size={12} /> Produção Mensal Estimada
          </p>
          <div className="flex items-center gap-2 mt-1">
            <input type="number" min="0" className="input max-w-[150px]"
              key={`mu-${fixed?.monthly_units}-${fixed?.monthly_units_source}`}
              defaultValue={fixed?.monthly_units_source === 'manual' ? fixed?.monthly_units : ''}
              placeholder={`Auto: ${fmtQty(fixed?.auto_monthly_units)}`}
              onBlur={e => { const v = e.target.value; if (v !== (fixed?.monthly_units_source === 'manual' ? String(fixed?.monthly_units) : '')) saveMonthlyUnits(v); }} />
            <span className="text-sm text-gray-400">unidades</span>
          </div>
          <p className="text-xs text-gray-400 mt-1">
            {fixed?.monthly_units_source === 'auto'
              ? 'Usando a média de vendas dos últimos 90 dias. Digite a meta para fixar.'
              : 'Meta manual. Apague para voltar à média automática de vendas.'}
          </p>
        </div>
        <div className="card p-4 bg-gray-900 text-white border-gray-900">
          <p className="text-[11px] text-gray-300 uppercase tracking-wide">Rateio por Unidade</p>
          <p className="text-2xl font-bold mt-1">{fmtBRL4(fixed?.overhead_unit)}</p>
          <p className="text-xs text-gray-400">{fmtBRL(fixed?.total)} ÷ {fmtQty(fixed?.monthly_units)} un</p>
        </div>
      </div>

      {/* Adicionar despesa */}
      <div className="card p-4 space-y-3">
        <h2 className="font-semibold text-gray-900 flex items-center gap-2">
          <Plus size={17} className="text-primary-600" /> Adicionar despesa fixa
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTIONS.filter(s => !existingNames.has(s.toLowerCase())).map(s => (
            <button key={s} onClick={() => setForm(f => ({ ...f, name: s }))}
              className="px-2.5 py-1 rounded-full text-xs border border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors">
              + {s}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="label">Nome</label>
            <input className="input" placeholder="Aluguel" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div className="w-36">
            <label className="label">Valor mensal (R$)</label>
            <input className="input" inputMode="decimal" placeholder="600,00" value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              onKeyDown={e => e.key === 'Enter' && add()} />
          </div>
          <div className="w-28">
            <label className="label">Dia venc.</label>
            <input type="number" min="1" max="31" className="input" value={form.due_day}
              onChange={e => setForm(f => ({ ...f, due_day: e.target.value }))} />
          </div>
          <button className="btn-primary" disabled={saving} onClick={add}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Adicionar
          </button>
        </div>
      </div>

      {/* Lista */}
      <div className="card">
        <div className="card-header">
          <h2 className="font-semibold text-gray-900 flex items-center gap-2">
            <Landmark size={17} className="text-primary-600" /> Despesas no rateio
          </h2>
        </div>
        <div className="divide-y divide-gray-100">
          {actives.length === 0 && (
            <p className="p-8 text-center text-sm text-gray-400">Nenhuma despesa fixa cadastrada ainda.</p>
          )}
          {actives.map(exp => {
            const Icon = iconFor(exp.name);
            const pct = fixed?.total > 0 ? (Number(exp.amount) / fixed.total) * 100 : 0;
            return (
              <div key={exp.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon size={16} className="text-gray-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{exp.name}</p>
                  <div className="h-1 rounded-full bg-gray-100 mt-1 max-w-[240px]">
                    <div className="h-1 rounded-full bg-primary-500" style={{ width: `${Math.min(100, pct)}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-400 w-12 text-right">{pct.toFixed(1)}%</span>
                {editing?.id === exp.id ? (
                  <span className="flex items-center gap-1">
                    <input autoFocus className="input text-sm py-1 w-28 text-right" inputMode="decimal"
                      value={editing.amount}
                      onChange={e => setEditing({ id: exp.id, amount: e.target.value })}
                      onKeyDown={e => { if (e.key === 'Enter') saveAmount(exp); if (e.key === 'Escape') setEditing(null); }} />
                    <button className="btn-ghost p-1 text-green-600" onClick={() => saveAmount(exp)}><Check size={15} /></button>
                  </span>
                ) : (
                  <button className="font-semibold text-sm text-gray-900 hover:text-primary-600 w-28 text-right"
                    title="Clique para editar o valor"
                    onClick={() => setEditing({ id: exp.id, amount: String(exp.amount).replace('.', ',') })}>
                    {fmtBRL(exp.amount)}
                  </button>
                )}
                <button className="btn-ghost p-1.5 text-red-400 hover:text-red-600" title="Remover do rateio"
                  onClick={() => remove(exp)}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        {inactive.length > 0 && (
          <div className="border-t border-gray-100 px-4 py-2 flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-400">Desativadas:</span>
            {inactive.map(exp => (
              <button key={exp.id} onClick={() => reactivate(exp)}
                className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700"
                title="Clique para reativar">
                {exp.name} · {fmtBRL(exp.amount)}
              </button>
            ))}
          </div>
        )}
      </div>

      <p className="text-xs text-gray-400 flex items-start gap-1.5">
        <Info size={13} className="mt-0.5 shrink-0" />
        <span>
          Estas são as mesmas despesas fixas da <b>Central de Contas</b> (Financeiro): lá elas geram as contas a pagar
          do mês; aqui elas formam o rateio por unidade usado na Formação de Preço e no Simulador.
        </span>
      </p>
    </div>
  );
}
