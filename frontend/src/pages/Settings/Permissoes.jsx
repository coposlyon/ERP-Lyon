// ============================================================
// Configurações → Permissões.
//
// Duas perguntas diferentes, duas abas:
//
//   SETOR    — o que a área da empresa enxerga. É o padrão, e é onde
//              99% da configuração acontece: contratou um vendedor,
//              aponta para o setor e acabou.
//   PESSOA   — o ajuste individual. Herda do setor por padrão; quem
//              precisa de uma tela a mais ganha só ela, sem inventar
//              um setor de uma pessoa só.
//
// Nas duas, o que se edita é o PRÓPRIO MENU LATERAL, com os mesmos
// ícones e a mesma ordem, uma flag por rota. Ninguém traduz "módulo
// financial" para "Contas a Pagar" de cabeça.
//
// Herdar é o padrão de propósito. Se abrir a ficha de alguém já
// copiasse as telas do setor para dentro dela, o setor viraria
// decoração no primeiro ajuste — mudar o setor depois não mudaria
// ninguém, e o administrador só descobriria isso muito mais tarde.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck, Plus, Save, Trash2, Loader2, Users, Building2, AlertTriangle,
  RotateCcw, Check, X, Link2,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import ArvorePermissoes from '@/components/Permissoes/ArvorePermissoes';

const LAYOUTS = [
  { key: 'erp',      label: 'ERP completo',     desc: 'O menu inteiro, filtrado pelas telas liberadas' },
  { key: 'vendedor', label: 'Área do vendedor', desc: 'Só os cinco itens da área enxuta do vendedor' },
];

const mesmaLista = (a, b) => JSON.stringify([...(a || [])].sort()) === JSON.stringify([...(b || [])].sort());

/* ══ Aba: Setores ═══════════════════════════════════════════ */
function AbaSetores({ setores, usuarios, isAdmin, semTela, modulos }) {
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [novo, setNovo] = useState(null);

  const setor = setores.find(s => s.id === selecionado) || setores[0] || null;

  useEffect(() => {
    if (!setor) { setRascunho(null); return; }
    setRascunho({
      name: setor.name,
      layout: setor.layout,
      home_path: setor.home_path,
      sort: setor.sort,
      screens: Array.isArray(setor.screens) ? setor.screens : null,
      modules: setor.modules || [],
    });
  }, [setor?.id, setor?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps

  const invalidar = () => { qc.invalidateQueries({ queryKey: ['setores'] }); qc.invalidateQueries({ queryKey: ['setores-usuarios'] }); };

  const salvar = useMutation({
    mutationFn: () => api.put(`/setores/${setor.id}`, { ...rascunho, screens: rascunho.screens || [] }),
    onSuccess: () => { toast.success('Setor salvo'); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });
  const criar = useMutation({
    mutationFn: () => api.post('/setores', { ...novo, screens: [], modules: [] }),
    onSuccess: s => { toast.success('Setor criado'); setNovo(null); setSelecionado(s.id); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao criar'),
  });
  const remover = useMutation({
    mutationFn: id => api.delete(`/setores/${id}`),
    onSuccess: () => { toast.success('Setor removido'); setSelecionado(null); invalidar(); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });

  const sujo = setor && rascunho && (
    rascunho.name !== setor.name ||
    rascunho.layout !== setor.layout ||
    rascunho.home_path !== setor.home_path ||
    !mesmaLista(rascunho.screens, setor.screens) ||
    !mesmaLista(rascunho.modules, setor.modules)
  );

  const gente = key => usuarios.filter(u => u.sector_key === key);

  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-4">
      {/* Lista de setores */}
      <div className="space-y-2">
        {isAdmin && (
          <button className="btn-secondary btn-sm w-full"
            onClick={() => setNovo({ key: '', name: '', layout: 'erp', home_path: '/', sort: 99 })}>
            <Plus size={14} /> Novo setor
          </button>
        )}
        <div className="card divide-y divide-gray-100 overflow-hidden">
          {setores.map(s => {
            const ativo = setor?.id === s.id;
            const semLista = !Array.isArray(s.screens);
            return (
              <button key={s.id} onClick={() => setSelecionado(s.id)}
                className={`w-full text-left px-3 py-2.5 transition-colors ${
                  ativo ? 'bg-primary-50 border-l-2 border-primary-600' : 'hover:bg-gray-50 border-l-2 border-transparent'
                }`}>
                <p className={`text-sm truncate ${ativo ? 'font-semibold text-primary-900' : 'text-gray-800'}`}>{s.name}</p>
                <p className="text-[11px] text-gray-400 flex items-center gap-2">
                  <span className="font-mono">{s.key}</span>
                  <span>· {gente(s.key).length} pessoa(s)</span>
                </p>
                {semLista && (
                  <p className="text-[10px] text-amber-600 mt-0.5">sem lista de telas</p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Editor do setor selecionado */}
      <div className="space-y-3">
        {novo && (
          <div className="card p-4 space-y-3">
            <p className="font-semibold text-gray-900">Novo setor</p>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <label className="label">Chave</label>
                <input className="input" value={novo.key} placeholder="comercial"
                  onChange={e => setNovo(n => ({ ...n, key: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} />
              </div>
              <div>
                <label className="label">Nome</label>
                <input className="input" value={novo.name} placeholder="Comercial"
                  onChange={e => setNovo(n => ({ ...n, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">Tela inicial</label>
                <input className="input" value={novo.home_path}
                  onChange={e => setNovo(n => ({ ...n, home_path: e.target.value }))} />
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setNovo(null)}>Cancelar</button>
              <button className="btn-primary btn-sm" disabled={!novo.key || !novo.name || criar.isPending}
                onClick={() => criar.mutate()}>
                {criar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Criar
              </button>
            </div>
            <p className="text-xs text-gray-400">O setor nasce sem nenhuma tela. Marque no menu abaixo.</p>
          </div>
        )}

        {!setor && !novo && (
          <div className="card p-8 text-center text-sm text-gray-400">Nenhum setor cadastrado.</div>
        )}

        {setor && rascunho && (
          <>
            <div className="card p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap gap-3">
                  <div>
                    <label className="label">Nome do setor</label>
                    <input className="input w-48" value={rascunho.name} disabled={!isAdmin}
                      onChange={e => setRascunho(r => ({ ...r, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="label">Layout</label>
                    <select className="input w-44" value={rascunho.layout} disabled={!isAdmin}
                      title={LAYOUTS.find(l => l.key === rascunho.layout)?.desc}
                      onChange={e => setRascunho(r => ({ ...r, layout: e.target.value }))}>
                      {LAYOUTS.map(l => <option key={l.key} value={l.key}>{l.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="label">Tela inicial</label>
                    <input className="input w-32" value={rascunho.home_path} disabled={!isAdmin}
                      onChange={e => setRascunho(r => ({ ...r, home_path: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && !setor.is_system && (
                    <button onClick={() => remover.mutate(setor.id)} className="btn-ghost text-red-500 p-2" title="Excluir setor">
                      <Trash2 size={15} />
                    </button>
                  )}
                  {isAdmin && (
                    <button className="btn-primary btn-sm" disabled={!sujo || salvar.isPending}
                      onClick={() => salvar.mutate()}>
                      {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {sujo ? 'Salvar' : 'Salvo'}
                    </button>
                  )}
                </div>
              </div>

              {rascunho.layout === 'vendedor' && (
                <p className="text-xs text-violet-700 bg-violet-50 rounded-lg px-3 py-2">
                  Este setor abre a área do vendedor: o menu lateral mostra só os cinco itens dela,
                  independentemente do que estiver marcado nos grupos do ERP.
                </p>
              )}

              {!Array.isArray(setor.screens) && (
                <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  Este setor ainda usa a regra antiga, só de módulos. Marque as telas abaixo e salve —
                  a partir daí o menu passa a ser exatamente o que estiver marcado.
                </p>
              )}
            </div>

            <ArvorePermissoes
              telas={rascunho.screens || []}
              somenteLeitura={!isAdmin}
              aoMudar={({ screens, modules }) => setRascunho(r => ({
                ...r, screens,
                // Os módulos avulsos que o admin marcou à mão não podem
                // sumir só porque uma tela foi desmarcada.
                modules: [...new Set([...modules, ...r.modules.filter(m => semTela.includes(m))])],
              }))}
              rodape={`Quem está aqui: ${gente(setor.key).map(u => u.name).join(', ') || 'ninguém ainda'}`}
            />

            <ModulosAvulsos
              semTela={semTela} modulos={modulos} valor={rascunho.modules} isAdmin={isAdmin}
              aoMudar={mods => setRascunho(r => ({ ...r, modules: mods }))}
            />
          </>
        )}
      </div>
    </div>
  );
}

/* ══ Aba: Usuários ══════════════════════════════════════════ */
function AbaUsuarios({ setores, usuarios, isAdmin, semTela, modulos }) {
  const qc = useQueryClient();
  const [selecionado, setSelecionado] = useState(null);
  const [rascunho, setRascunho] = useState(null);

  const usuario = usuarios.find(u => u.id === selecionado) || usuarios[0] || null;
  const setorDe = u => setores.find(s => s.key === u?.sector_key) || null;
  const setor = setorDe(usuario);
  const telasDoSetor = Array.isArray(setor?.screens) ? setor.screens : null;

  useEffect(() => {
    if (!usuario) { setRascunho(null); return; }
    setRascunho({
      sector_key: usuario.sector_key || '',
      screens: Array.isArray(usuario.allowed_screens) ? usuario.allowed_screens : null,
      modules: usuario.allowed_modules || [],
    });
  }, [usuario?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const salvar = useMutation({
    mutationFn: () => api.put(`/setores/usuarios/${usuario.id}`, {
      sector_key: rascunho.sector_key || null,
      allowed_screens: rascunho.screens,          // null = herda do setor
      allowed_modules: rascunho.modules,
    }),
    onSuccess: () => {
      toast.success('Acesso salvo');
      qc.invalidateQueries({ queryKey: ['setores-usuarios'] });
    },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  const herda = rascunho && rascunho.screens === null;
  const sujo = usuario && rascunho && (
    (rascunho.sector_key || null) !== (usuario.sector_key || null) ||
    !mesmaLista(rascunho.screens, usuario.allowed_screens) ||
    (rascunho.screens === null) !== !Array.isArray(usuario.allowed_screens) ||
    !mesmaLista(rascunho.modules, usuario.allowed_modules)
  );

  // O quanto esta pessoa se afastou do setor — a informação que
  // justifica existir um ajuste individual.
  const diferenca = useMemo(() => {
    if (!rascunho || herda || !telasDoSetor) return null;
    const minhas = rascunho.screens || [];
    return {
      a_mais: minhas.filter(t => !telasDoSetor.includes(t)).length,
      a_menos: telasDoSetor.filter(t => !minhas.includes(t)).length,
    };
  }, [rascunho, herda, telasDoSetor]);

  return (
    <div className="grid lg:grid-cols-[16rem_1fr] gap-4">
      <div className="card divide-y divide-gray-100 overflow-hidden self-start">
        {usuarios.map(u => {
          const ativo = usuario?.id === u.id;
          const proprio = Array.isArray(u.allowed_screens);
          return (
            <button key={u.id} onClick={() => setSelecionado(u.id)}
              className={`w-full text-left px-3 py-2.5 transition-colors ${
                ativo ? 'bg-primary-50 border-l-2 border-primary-600' : 'hover:bg-gray-50 border-l-2 border-transparent'
              }`}>
              <p className={`text-sm truncate ${ativo ? 'font-semibold text-primary-900' : 'text-gray-800'}`}>{u.name}</p>
              <p className="text-[11px] text-gray-400 truncate">{u.email}</p>
              <p className="text-[10px] mt-0.5">
                {u.role === 'admin'
                  ? <span className="text-violet-600">administrador</span>
                  : proprio
                    ? <span className="text-sky-600">acesso próprio</span>
                    : <span className="text-gray-400">{setorDe(u)?.name || 'sem setor'}</span>}
              </p>
            </button>
          );
        })}
      </div>

      <div className="space-y-3">
        {!usuario && <div className="card p-8 text-center text-sm text-gray-400">Nenhum usuário.</div>}

        {usuario && rascunho && (
          <>
            <div className="card p-4 space-y-3">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{usuario.name}</p>
                  <p className="text-xs text-gray-500">{usuario.email}</p>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div>
                    <label className="label">Setor</label>
                    <select className="input w-44" value={rascunho.sector_key} disabled={!isAdmin || usuario.role === 'admin'}
                      onChange={e => setRascunho(r => ({ ...r, sector_key: e.target.value }))}>
                      <option value="">Sem setor</option>
                      {setores.map(s => <option key={s.key} value={s.key}>{s.name}</option>)}
                    </select>
                  </div>
                  {isAdmin && usuario.role !== 'admin' && (
                    <button className="btn-primary btn-sm" disabled={!sujo || salvar.isPending}
                      onClick={() => salvar.mutate()}>
                      {salvar.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      {sujo ? 'Salvar' : 'Salvo'}
                    </button>
                  )}
                </div>
              </div>

              {usuario.role === 'admin' ? (
                <p className="text-xs text-violet-800 bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
                  Administrador enxerga o sistema inteiro, e isso não se ajusta por tela. Para limitar
                  o acesso desta pessoa, troque o papel dela em Configurações → Usuários.
                </p>
              ) : herda ? (
                <div className="flex flex-wrap items-center gap-3 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  <Link2 size={14} className="shrink-0" />
                  <span className="flex-1">
                    Herda de <b>{setor?.name || 'nenhum setor'}</b>.
                    {telasDoSetor
                      ? ` Mudou o setor, muda esta pessoa junto.`
                      : ` Esse setor ainda não tem lista de telas — hoje vale só o módulo.`}
                  </span>
                  {isAdmin && (
                    <button className="btn-secondary btn-sm"
                      onClick={() => setRascunho(r => ({ ...r, screens: telasDoSetor || [] }))}>
                      Dar acesso próprio
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-xs text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2">
                  <span className="flex-1">
                    <b>Acesso próprio.</b> Esta pessoa não segue mais o setor
                    {diferenca && (diferenca.a_mais || diferenca.a_menos)
                      ? ` — ${diferenca.a_mais} tela(s) a mais e ${diferenca.a_menos} a menos que ${setor?.name}.`
                      : '.'}
                  </span>
                  {isAdmin && (
                    <button className="btn-secondary btn-sm"
                      onClick={() => setRascunho(r => ({ ...r, screens: null }))}>
                      <RotateCcw size={13} /> Voltar a herdar
                    </button>
                  )}
                </div>
              )}
            </div>

            {usuario.role !== 'admin' && (
              <>
                <ArvorePermissoes
                  telas={rascunho.screens}
                  referencia={herda ? null : telasDoSetor}
                  somenteLeitura={!isAdmin}
                  aoMudar={({ screens, modules }) => setRascunho(r => ({
                    ...r, screens,
                    modules: [...new Set([...modules, ...r.modules.filter(m => semTela.includes(m))])],
                  }))}
                  rodape={herda
                    ? 'Marcar qualquer tela aqui cria um acesso próprio para esta pessoa.'
                    : <span className="flex flex-wrap items-center gap-3">
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-sky-500 inline-block" /> a mais que o setor</span>
                        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-rose-500 inline-block" /> retirada do setor</span>
                      </span>}
                />

                <ModulosAvulsos
                  semTela={semTela} modulos={modulos} valor={rascunho.modules} isAdmin={isAdmin}
                  aoMudar={mods => setRascunho(r => ({ ...r, modules: mods }))}
                />
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ══ Os módulos que nenhuma tela do menu alcança ════════════ */
function ModulosAvulsos({ semTela, modulos, valor, aoMudar, isAdmin }) {
  const lista = modulos.filter(m => semTela.includes(m.key));
  if (!lista.length) return null;

  return (
    <div className="card p-4">
      <p className="text-sm font-semibold text-gray-900">Acessos sem tela no menu</p>
      <p className="text-xs text-gray-500 mt-0.5 mb-3">
        Estes existem só na API ou em outro layout — nenhum item do menu lateral chega até eles, então
        marcar páginas acima jamais os libera. Ficam aqui em vez de sumirem: acesso que não aparece em
        lugar nenhum é acesso que ninguém revisa.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {lista.map(m => {
          const on = (valor || []).includes(m.key);
          return (
            <button key={m.key} type="button" disabled={!isAdmin}
              onClick={() => aoMudar(on ? valor.filter(x => x !== m.key) : [...valor, m.key])}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border flex items-center gap-1 transition-colors ${
                on ? 'bg-primary-100 border-primary-300 text-primary-800'
                   : 'bg-white border-gray-200 text-gray-500 hover:bg-gray-50'
              } ${isAdmin ? '' : 'cursor-default opacity-70'}`}>
              {on ? <Check size={11} /> : <X size={11} className="opacity-40" />}
              {m.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ══ A página ═══════════════════════════════════════════════ */
export default function Permissoes() {
  const { isAdmin } = useAuth();
  const [aba, setAba] = useState('setores');

  const { data: modulos = [] } = useQuery({
    queryKey: ['setores-modulos'], queryFn: () => api.get('/setores/modulos'), staleTime: Infinity,
  });
  const { data: semTela = [] } = useQuery({
    queryKey: ['modulos-sem-tela'], queryFn: () => api.get('/setores/modulos-sem-tela'), staleTime: Infinity,
  });
  const { data, isLoading } = useQuery({ queryKey: ['setores'], queryFn: () => api.get('/setores') });
  const { data: usuarios = [] } = useQuery({
    queryKey: ['setores-usuarios'], queryFn: () => api.get('/setores/usuarios'),
  });

  const setores = data?.setores || [];

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">
      <Loader2 className="animate-spin text-gray-400" size={28} />
    </div>;
  }

  const abas = [
    { key: 'setores',  label: 'Por setor',   icone: Building2, n: setores.length },
    { key: 'usuarios', label: 'Por pessoa',  icone: Users,     n: usuarios.length },
  ];

  return (
    <div className="space-y-4">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-violet-100 rounded-lg flex items-center justify-center">
            <ShieldCheck size={18} className="text-violet-600" />
          </div>
          <div>
            <h1 className="page-title">Permissões</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              O menu que cada um enxerga, tela por tela — do jeito que ele aparece na barra lateral.
            </p>
          </div>
        </div>
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
          {abas.map(a => (
            <button key={a.key} onClick={() => setAba(a.key)}
              className={`px-3 py-1.5 rounded-md text-sm font-medium flex items-center gap-2 transition-colors ${
                aba === a.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
              }`}>
              <a.icone size={14} /> {a.label}
              <span className="text-[10px] font-mono tabular-nums opacity-60">{a.n}</span>
            </button>
          ))}
        </div>
      </div>

      {!isAdmin && (
        <div className="card p-3 flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border-amber-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          Você está vendo as permissões, mas só um administrador pode alterá-las.
        </div>
      )}

      {data?.setup_pending && (
        <div className="card p-3 flex items-start gap-2 text-sm text-red-700 bg-red-50 border-red-200">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          A tabela de setores ainda não existe no banco. Aplique <b>migrations/067_setores_area_vendedor.sql</b>.
        </div>
      )}

      {aba === 'setores'
        ? <AbaSetores setores={setores} usuarios={usuarios} isAdmin={isAdmin} semTela={semTela} modulos={modulos} />
        : <AbaUsuarios setores={setores} usuarios={usuarios} isAdmin={isAdmin} semTela={semTela} modulos={modulos} />}
    </div>
  );
}
