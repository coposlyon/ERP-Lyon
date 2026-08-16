// ============================================================
// Configurações → Permissões por setor.
//
// A matriz setor × módulo. Antes, dar acesso a alguém era marcar 20
// caixinhas na ficha da pessoa e torcer para não esquecer nenhuma —
// esquecer uma no lugar errado deixava um vendedor vendo o custo do
// produto. Agora o setor carrega o acesso e a pessoa só aponta para ele.
//
// O campo Layout não é decoração: 'Área do vendedor' troca o ERP inteiro
// pela tela enxuta de cinco itens. É o que garante que o vendedor não
// esbarre em Estoque nem sem querer.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Plus, Save, Trash2, Loader2, Users, LayoutGrid, Check, X, AlertTriangle,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

const LAYOUTS = [
  { key: 'erp',      label: 'ERP completo',      desc: 'Menu com todos os grupos, filtrado pelos módulos marcados' },
  { key: 'vendedor', label: 'Área do vendedor',  desc: 'Só Dashboard, Pedidos, Catálogo, Agenda e Comunicação' },
];

export default function Permissoes() {
  const qc = useQueryClient();
  const { isAdmin } = useAuth();
  const [rascunho, setRascunho] = useState({});   // { setorId: {...} }
  const [novo, setNovo] = useState(null);

  const { data: modulos = [] } = useQuery({
    queryKey: ['setores-modulos'],
    queryFn: () => api.get('/setores/modulos'),
    staleTime: Infinity,
  });
  const { data, isLoading } = useQuery({
    queryKey: ['setores'],
    queryFn: () => api.get('/setores'),
  });
  const { data: usuarios = [] } = useQuery({
    queryKey: ['setores-usuarios'],
    queryFn: () => api.get('/setores/usuarios'),
  });

  const setores = data?.setores || [];

  // O rascunho começa igual ao que veio do banco; o botão Salvar só
  // aparece no setor que foi mexido.
  useEffect(() => {
    setRascunho(Object.fromEntries(setores.map(s => [s.id, {
      name: s.name, modules: s.modules || [], layout: s.layout, home_path: s.home_path, sort: s.sort,
    }])));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidar = () => {
    qc.invalidateQueries(['setores']);
    qc.invalidateQueries(['setores-usuarios']);
  };

  const salvar = useMutation({
    mutationFn: ({ id, patch }) => api.put(`/setores/${id}`, patch),
    onSuccess: () => { toast.success('Setor salvo'); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });
  const criar = useMutation({
    mutationFn: () => api.post('/setores', novo),
    onSuccess: () => { toast.success('Setor criado'); setNovo(null); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao criar'),
  });
  const remover = useMutation({
    mutationFn: id => api.delete(`/setores/${id}`),
    onSuccess: () => { toast.success('Setor removido'); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });
  const mover = useMutation({
    mutationFn: ({ id, sector_key }) => api.put(`/setores/usuarios/${id}`, { sector_key }),
    onSuccess: () => { toast.success('Usuário movido'); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao mover'),
  });

  const grupos = useMemo(() => {
    const g = {};
    modulos.forEach(m => { (g[m.grupo] = g[m.grupo] || []).push(m); });
    return g;
  }, [modulos]);

  const mudou = s => JSON.stringify(rascunho[s.id]) !== JSON.stringify({
    name: s.name, modules: s.modules || [], layout: s.layout, home_path: s.home_path, sort: s.sort,
  });

  function toggle(setorId, moduloKey) {
    setRascunho(r => {
      const atual = r[setorId];
      if (!atual) return r;
      const on = atual.modules.includes(moduloKey);
      return { ...r, [setorId]: {
        ...atual,
        modules: on ? atual.modules.filter(m => m !== moduloKey) : [...atual.modules, moduloKey],
      } };
    });
  }

  const porSetor = key => usuarios.filter(u => u.sector_key === key);
  const semSetor = usuarios.filter(u => !u.sector_key);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <ShieldCheck size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="page-title">Permissões por setor</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Defina o que cada área da empresa enxerga do ERP
            </p>
          </div>
        </div>
        {isAdmin && (
          <button onClick={() => setNovo({ key: '', name: '', modules: [], layout: 'erp', home_path: '/', sort: 99 })}
            className="btn-primary btn-sm">
            <Plus size={15} /> Novo setor
          </button>
        )}
      </div>

      {!isAdmin && (
        <div className="card p-3 flex items-start gap-2 text-sm text-amber-700 bg-amber-50 border-amber-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          Você está vendo as permissões, mas só um administrador pode alterá-las.
        </div>
      )}

      {data?.setup_pending && (
        <div className="card p-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border-red-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          A tabela de setores ainda não existe no banco. Reinicie o servidor para as migrações rodarem,
          ou aplique <b>migrations/067_setores_area_vendedor.sql</b>.
        </div>
      )}

      {/* Novo setor */}
      {novo && (
        <div className="card p-4 space-y-3">
          <p className="font-semibold text-gray-900">Novo setor</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Chave (sem espaços)</label>
              <input className="input" value={novo.key} placeholder="ex.: comercial"
                onChange={e => setNovo(n => ({ ...n, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
            </div>
            <div>
              <label className="label">Nome</label>
              <input className="input" value={novo.name} placeholder="ex.: Comercial"
                onChange={e => setNovo(n => ({ ...n, name: e.target.value }))} />
            </div>
            <div>
              <label className="label">Tela inicial</label>
              <input className="input" value={novo.home_path} placeholder="/"
                onChange={e => setNovo(n => ({ ...n, home_path: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setNovo(null)} className="btn-secondary">Cancelar</button>
            <button onClick={() => criar.mutate()} disabled={!novo.key || !novo.name || criar.isPending}
              className="btn-primary">
              {criar.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Criar
            </button>
          </div>
          <p className="text-xs text-gray-400">
            O setor nasce sem nenhum módulo. Marque os acessos no cartão dele logo abaixo.
          </p>
        </div>
      )}

      {/* Um cartão por setor */}
      {setores.map(s => {
        const r = rascunho[s.id];
        if (!r) return null;
        const pessoas = porSetor(s.key);
        return (
          <div key={s.id} className="card p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <input className="input font-semibold" style={{ width: 200 }} value={r.name} disabled={!isAdmin}
                  onChange={e => setRascunho(x => ({ ...x, [s.id]: { ...r, name: e.target.value } }))} />
                <span className="text-xs font-mono text-gray-400">{s.key}</span>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Users size={12} /> {pessoas.length} pessoa(s)
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-xs text-gray-500 flex items-center gap-1.5">
                  <LayoutGrid size={13} /> Layout
                  <select className="input w-auto text-xs" value={r.layout} disabled={!isAdmin}
                    title={LAYOUTS.find(l => l.key === r.layout)?.desc}
                    onChange={e => setRascunho(x => ({ ...x, [s.id]: { ...r, layout: e.target.value } }))}>
                    {LAYOUTS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                  </select>
                </label>
                <label className="text-xs text-gray-500 flex items-center gap-1.5">
                  Tela inicial
                  <input className="input w-28 text-xs" value={r.home_path} disabled={!isAdmin}
                    onChange={e => setRascunho(x => ({ ...x, [s.id]: { ...r, home_path: e.target.value } }))} />
                </label>
                {isAdmin && mudou(s) && (
                  <button onClick={() => salvar.mutate({ id: s.id, patch: r })} disabled={salvar.isPending}
                    className="btn-primary btn-sm">
                    {salvar.isPending ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Salvar
                  </button>
                )}
                {isAdmin && !s.is_system && (
                  <button onClick={() => remover.mutate(s.id)} className="btn-ghost text-red-500 p-1.5" title="Excluir setor">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {r.layout === 'vendedor' && (
              <p className="text-xs text-violet-600 bg-violet-50 rounded-lg px-3 py-2">
                Este setor vê a área enxuta do vendedor. Os módulos abaixo continuam valendo para a API,
                mas o menu lateral mostra apenas os cinco itens da área.
              </p>
            )}

            {/* A matriz */}
            <div className="space-y-2">
              {Object.entries(grupos).map(([grupo, mods]) => (
                <div key={grupo}>
                  <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-400 mb-1">{grupo}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {mods.map(m => {
                      const on = r.modules.includes(m.key);
                      return (
                        <button key={m.key} onClick={() => isAdmin && toggle(s.id, m.key)} disabled={!isAdmin}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                            on ? 'bg-violet-100 border-violet-300 text-violet-800'
                               : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
                          } ${isAdmin ? '' : 'cursor-default opacity-70'}`}>
                          {on ? <Check size={11} /> : <X size={11} className="opacity-40" />}
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* Quem está aqui */}
            {pessoas.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1 border-t border-gray-100">
                {pessoas.map(u => (
                  <span key={u.id} className="text-[11px] px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {u.name}
                    {u.role === 'admin' && ' (admin)'}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {/* Quem ainda não tem setor */}
      <div className="card p-4">
        <p className="font-semibold text-gray-900 flex items-center gap-2">
          <Users size={16} /> Usuários e setores
        </p>
        <p className="text-xs text-gray-500 mt-0.5 mb-3">
          Quem está sem setor continua na regra antiga (módulos marcados na ficha do usuário).
          {semSetor.length > 0 && ` ${semSetor.length} usuário(s) nessa situação.`}
        </p>
        <div className="space-y-1.5">
          {usuarios.map(u => (
            <div key={u.id} className="flex flex-wrap items-center gap-3 px-3 py-2 rounded-lg bg-gray-50">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-900 truncate">{u.name}</p>
                <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
              </div>
              {u.role === 'admin' ? (
                <span className="text-xs text-violet-600">Administrador — acesso total</span>
              ) : (
                <select className="input w-auto text-xs" value={u.sector_key || ''} disabled={!isAdmin}
                  onChange={e => mover.mutate({ id: u.id, sector_key: e.target.value || null })}>
                  <option value="">Sem setor (regra antiga)</option>
                  {setores.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                </select>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
