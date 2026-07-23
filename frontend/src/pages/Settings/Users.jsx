import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users as UsersIcon, Plus, Shield, KeyRound, Eye, EyeOff, Pencil } from 'lucide-react';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';

const MODULOS = [
  { key: 'dashboard',      label: 'Dashboard' },
  { key: 'products',       label: 'Produtos' },
  { key: 'customers',      label: 'Clientes' },
  { key: 'suppliers',      label: 'Fornecedores' },
  { key: 'employees',      label: 'Colaboradores' },
  { key: 'logistics',      label: 'Logística' },
  { key: 'price-tables',   label: 'Tabelas de Preço' },
  { key: 'sales',          label: 'Vendas' },
  { key: 'pdv',            label: 'PDV' },
  { key: 'quotes',         label: 'Orçamentos' },
  { key: 'customizations', label: 'Personalizações' },
  { key: 'purchases',      label: 'Compras' },
  { key: 'stock',          label: 'Estoque' },
  { key: 'financial',      label: 'Financeiro' },
  { key: 'fiscal',         label: 'Fiscal' },
  { key: 'reports',        label: 'Relatórios' },
  { key: 'settings',       label: 'Configurações' },
  { key: 'returns',        label: 'Devoluções' },
  { key: 'quality',        label: 'Qualidade' },
  { key: 'crm',            label: 'CRM' },
  { key: 'marketing',      label: 'Marketing' },
  { key: 'production',     label: 'Produção' },
  { key: 'hr',             label: 'RH' },
];

const ROLES = {
  admin:    { label: 'Administrador', cls: 'bg-violet-100 text-violet-700' },
  manager:  { label: 'Gerente',       cls: 'bg-blue-100   text-blue-700'   },
  operator: { label: 'Operador',      cls: 'bg-gray-100   text-gray-600'   },
};

const emptyForm = { name:'', email:'', password:'', role:'operator', allowed_modules: [] };

function ModuleGrid({ value, onChange, disabled }) {
  function toggle(key) {
    onChange(value.includes(key) ? value.filter(m => m !== key) : [...value, key]);
  }
  return (
    <div className={`grid grid-cols-3 gap-2 ${disabled ? 'opacity-40 pointer-events-none' : ''}`}>
      {MODULOS.map(mod => (
        <label key={mod.key}
          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border cursor-pointer transition-colors text-xs ${
            value.includes(mod.key)
              ? 'bg-violet-100 border-violet-300 text-violet-800 font-medium'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          <input type="checkbox" className="w-3 h-3 accent-violet-600"
            checked={value.includes(mod.key)} onChange={() => toggle(mod.key)} />
          {mod.label}
        </label>
      ))}
    </div>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const qc = useQueryClient();
  const [modal, setModal]       = useState(null); // 'new' | 'edit' | 'password'
  const [target, setTarget]     = useState(null);
  const [form, setForm]         = useState(emptyForm);
  const [newPass, setNewPass]   = useState('');
  const [showPass, setShowPass] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get('/users'),
  });

  const createMut = useMutation({
    mutationFn: d => api.post('/users', d),
    onSuccess: () => { toast.success('Usuário criado!'); close(); qc.invalidateQueries(['users']); },
    onError: e => toast.error(e.error || 'Erro ao criar usuário'),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, ...d }) => api.patch(`/users/${id}`, d),
    onSuccess: () => { toast.success('Usuário atualizado!'); close(); qc.invalidateQueries(['users']); },
    onError: e => toast.error(e.error || 'Erro ao atualizar'),
  });
  const passMut = useMutation({
    mutationFn: ({ id, password }) => api.post(`/users/${id}/password`, { password }),
    onSuccess: () => { toast.success('Senha redefinida!'); close(); },
    onError: e => toast.error(e.error || 'Erro ao redefinir senha'),
  });

  function close() {
    setModal(null); setTarget(null); setForm(emptyForm); setNewPass(''); setShowPass(false);
  }

  function openNew() { setForm(emptyForm); setModal('new'); }
  function openEdit(u) {
    setTarget(u);
    setForm({
      name: u.name || '', email: u.email || '', password: '',
      role: u.role || 'operator',
      allowed_modules: Array.isArray(u.allowed_modules) ? u.allowed_modules : [],
    });
    setModal('edit');
  }
  function openPassword(u) { setTarget(u); setNewPass(''); setModal('password'); }

  function submitNew(e) {
    e.preventDefault();
    if (!form.name || !form.email || !form.password) { toast.error('Preencha nome, e-mail e senha'); return; }
    createMut.mutate({
      ...form,
      allowed_modules: form.role === 'admin' ? null : form.allowed_modules,
    });
  }

  function submitEdit(e) {
    e.preventDefault();
    updateMut.mutate({
      id: target.id,
      name: form.name,
      role: form.role,
      allowed_modules: form.role === 'admin' ? null : form.allowed_modules,
    });
  }

  return (
    <div className="space-y-5">
      <div className="page-header flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <Shield size={18} className="text-violet-600"/>
          </div>
          <div>
            <h1 className="page-title">Usuários do Sistema</h1>
            <p className="text-sm text-gray-500 mt-0.5">{users.length} usuários · controle de papéis e módulos</p>
          </div>
        </div>
        <button onClick={openNew} className="btn-primary"><Plus size={15}/> Novo Usuário</button>
      </div>

      <div className="card overflow-x-auto">
        <table className="table-auto">
          <thead>
            <tr><th>Usuário</th><th>Papel</th><th>Módulos</th><th>Status</th><th className="text-right">Ações</th></tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Carregando...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="text-center py-10 text-gray-400">Nenhum usuário</td></tr>
            ) : users.map(u => {
              const R = ROLES[u.role] || ROLES.operator;
              const mods = u.role === 'admin' ? null : u.allowed_modules;
              return (
                <tr key={u.id} className={u.is_active === false ? 'opacity-50' : ''}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-violet-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                        {u.name?.charAt(0) || '?'}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{u.name} {u.id === me?.id && <span className="text-xs text-violet-500">(você)</span>}</p>
                        <p className="text-xs text-gray-400">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td><span className={`badge text-xs ${R.cls}`}>{R.label}</span></td>
                  <td>
                    {mods == null ? (
                      <span className="text-xs text-gray-400">Todos os módulos</span>
                    ) : mods.length === 0 ? (
                      <span className="text-xs text-amber-600">Apenas Dashboard</span>
                    ) : (
                      <span className="text-xs text-gray-600">{mods.length} módulos</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge text-xs ${u.is_active !== false ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                      {u.is_active !== false ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(u)} title="Editar"
                        className="p-1.5 text-gray-400 hover:text-violet-600 transition-colors"><Pencil size={14}/></button>
                      <button onClick={() => openPassword(u)} title="Redefinir senha"
                        className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"><KeyRound size={14}/></button>
                      {u.id !== me?.id && (
                        <button
                          onClick={() => updateMut.mutate({ id: u.id, is_active: u.is_active === false })}
                          className={`text-xs font-medium px-2 py-1 rounded-lg transition-colors ${
                            u.is_active !== false ? 'text-red-500 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'
                          }`}>
                          {u.is_active !== false ? 'Desativar' : 'Ativar'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Novo / Editar ── */}
      <Modal isOpen={modal === 'new' || modal === 'edit'} onClose={close}
        title={modal === 'new' ? 'Novo Usuário' : `Editar — ${target?.name}`} size="lg">
        <form onSubmit={modal === 'new' ? submitNew : submitEdit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label">Nome *</label>
              <input className="input" value={form.name}
                onChange={e => setForm(p => ({...p, name: e.target.value}))} autoFocus />
            </div>
            <div>
              <label className="label">E-mail *</label>
              <input type="email" className="input" value={form.email} disabled={modal === 'edit'}
                onChange={e => setForm(p => ({...p, email: e.target.value}))} />
            </div>
            {modal === 'new' && (
              <div>
                <label className="label">Senha *</label>
                <div className="relative">
                  <input type={showPass ? 'text' : 'password'} className="input pr-10" value={form.password}
                    onChange={e => setForm(p => ({...p, password: e.target.value}))} />
                  <button type="button" onClick={() => setShowPass(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
                  </button>
                </div>
              </div>
            )}
            <div>
              <label className="label">Papel *</label>
              <select className="input" value={form.role}
                disabled={modal === 'edit' && target?.id === me?.id}
                onChange={e => setForm(p => ({...p, role: e.target.value}))}>
                <option value="operator">Operador</option>
                <option value="manager">Gerente</option>
                <option value="admin">Administrador</option>
              </select>
            </div>
          </div>

          <div>
            <label className="label mb-2 flex items-center gap-2">
              Módulos permitidos
              {form.role === 'admin' && <span className="text-xs text-violet-500">(administrador tem acesso total)</span>}
            </label>
            <ModuleGrid
              value={form.allowed_modules}
              onChange={mods => setForm(p => ({...p, allowed_modules: mods}))}
              disabled={form.role === 'admin'}
            />
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={close} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending} className="btn-primary flex-1">
              {createMut.isPending || updateMut.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Redefinir senha ── */}
      <Modal isOpen={modal === 'password'} onClose={close} title={`Redefinir senha — ${target?.name}`} size="sm">
        <form onSubmit={e => { e.preventDefault(); passMut.mutate({ id: target.id, password: newPass }); }} className="space-y-4">
          <div>
            <label className="label">Nova senha (mín. 6 caracteres) *</label>
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} className="input pr-10" value={newPass}
                onChange={e => setNewPass(e.target.value)} minLength={6} required autoFocus />
              <button type="button" onClick={() => setShowPass(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPass ? <EyeOff size={15}/> : <Eye size={15}/>}
              </button>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={close} className="btn-secondary flex-1">Cancelar</button>
            <button type="submit" disabled={passMut.isPending} className="btn-primary flex-1">
              {passMut.isPending ? 'Salvando...' : 'Redefinir'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
