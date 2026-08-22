// ============================================================
// PERMISSÕES DE ACESSO DE UM COLABORADOR.
//
// Duas travas, e elas fazem coisas diferentes:
//
//   MÓDULO  — é o que o SERVIDOR cobra. Sem o módulo, a API não
//             entrega o dado, dê o caminho que der.
//   TELA    — é o que a pessoa VÊ. Decide o menu e a navegação.
//
// Por que as duas juntas nesta tela: dar só a tela sem o módulo faz o
// item aparecer e a página abrir vazia; tirar só a tela deixando o
// módulo esconde o caminho e mantém o direito. Quem administra precisa
// enxergar as duas coisas no mesmo lugar para não descobrir a diferença
// no susto — por isso a lista de telas mostra, em cada uma, quando o
// módulo dela está desligado.
//
// A LISTA DE TELAS NÃO É ESCRITA AQUI. Ela vem de lib/menu.js, que é o
// mesmo arquivo que desenha o menu: tela nova no sistema aparece aqui
// sozinha, e nunca existe uma tela que dá para abrir e não dá para
// liberar.
// ============================================================
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, ShieldCheck, ShieldOff, Lock, AlertTriangle, Check } from 'lucide-react';
import api from '@/lib/api';
import { telasPorGrupo, TELAS } from '@/lib/menu';

const PAPEIS = [
  { key: 'operator', label: 'Operador', desc: 'Vê só o que estiver marcado abaixo.' },
  { key: 'manager',  label: 'Gerente',  desc: 'Operador + metas e território do vendedor.' },
  { key: 'admin',    label: 'Administrador', desc: 'Vê e faz tudo. Nenhuma marcação limita um admin.' },
];

export default function PermissoesTelas({ valor, aoMudar, semAcesso }) {
  const [busca, setBusca] = useState('');
  const grupos = useMemo(() => telasPorGrupo(), []);

  // Os módulos existentes vêm do servidor — é a mesma lista que a
  // matriz por setor usa.
  const { data: modulos = [] } = useQuery({
    queryKey: ['setores-modulos'],
    queryFn: () => api.get('/setores/modulos'),
    staleTime: Infinity,
  });

  const papel = valor.role || 'operator';
  const ehAdmin = papel === 'admin';
  const mods = valor.allowed_modules || [];
  // null = sem restrição por tela (regra antiga). A tela mostra isso e
  // deixa o admin decidir marcar uma a uma.
  const telas = valor.allowed_screens;
  const semRestricao = telas == null;

  const marcada = path => ehAdmin || semRestricao || telas.includes(path);
  const moduloLigado = m => ehAdmin || !m || mods.includes(m);

  // UMA MUDANÇA, UMA CHAMADA. Marcar uma tela mexe em duas listas
  // (telas e módulos), e chamar aoMudar duas vezes seguidas fazia a
  // segunda escrever por cima da primeira — o módulo entrava e a tela
  // se perdia, com a caixinha piscando marcada e voltando. Tudo o que
  // muda junto viaja no mesmo objeto.
  const mudar = patch => aoMudar({ ...valor, ...patch });

  function setTelas(novas) { mudar({ allowed_screens: novas }); }
  function setMods(novos) { mudar({ allowed_modules: novos }); }

  function alternarTela(tela) {
    if (ehAdmin) return;
    const base = semRestricao ? TELAS.map(t => t.path) : telas;
    const ligando = !base.includes(tela.path);
    const patch = {
      allowed_screens: ligando ? [...base, tela.path] : base.filter(p => p !== tela.path),
    };
    // Marcar a tela sem o módulo dela seria entregar um item de menu que
    // abre vazio. Liga o módulo junto — dá para tirar depois, à mão.
    if (ligando && tela.module && !mods.includes(tela.module)) {
      patch.allowed_modules = [...mods, tela.module];
    }
    mudar(patch);
  }

  function alternarGrupo(grupo, ligar) {
    if (ehAdmin) return;
    const base = semRestricao ? TELAS.map(t => t.path) : telas;
    const doGrupo = grupo.telas.map(t => t.path);
    const patch = {
      allowed_screens: ligar
        ? [...new Set([...base, ...doGrupo])]
        : base.filter(p => !doGrupo.includes(p)),
    };
    if (ligar) {
      patch.allowed_modules = [...new Set([...mods, ...grupo.telas.map(t => t.module).filter(Boolean)])];
    }
    mudar(patch);
  }

  function alternarModulo(key) {
    if (ehAdmin) return;
    setMods(mods.includes(key) ? mods.filter(m => m !== key) : [...mods, key]);
  }

  const filtro = busca.trim().toLowerCase();
  const gruposVisiveis = grupos
    .map(g => ({ ...g, telas: g.telas.filter(t => !filtro || t.label.toLowerCase().includes(filtro) || t.path.includes(filtro)) }))
    .filter(g => g.telas.length);

  const totalMarcadas = ehAdmin ? TELAS.length : (semRestricao ? TELAS.length : telas.length);

  if (semAcesso) {
    return (
      <div className="flex items-start gap-3 text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
        <Lock size={18} className="shrink-0 mt-0.5 text-gray-400" />
        <p>
          Este colaborador está <b>sem acesso ao sistema</b>. Ligue o acesso em
          <b> Dados Pessoais → Informações do Sistema</b> para escolher o que ele enxerga.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ── Papel ────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-gray-800 mb-2">Perfil de acesso</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {PAPEIS.map(p => (
            <button key={p.key} type="button" onClick={() => aoMudar({ ...valor, role: p.key })}
              className={`text-left p-3 rounded-xl border transition-colors ${papel === p.key ? 'border-primary-400 bg-primary-50' : 'border-gray-200 hover:border-gray-300'}`}>
              <span className="block text-sm font-semibold text-gray-800">{p.label}</span>
              <span className="block text-[11px] text-gray-500 mt-0.5">{p.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {ehAdmin ? (
        <div className="flex items-start gap-3 text-sm text-amber-800 bg-amber-50 rounded-xl p-4">
          <AlertTriangle size={18} className="shrink-0 mt-0.5" />
          <p>
            Administrador enxerga <b>todas as telas e todos os módulos</b>, hoje e os que forem
            criados amanhã. Para limitar o que esta pessoa vê, escolha <b>Operador</b> ou <b>Gerente</b>.
          </p>
        </div>
      ) : (
        <>
          {/* ── Telas ──────────────────────────────────── */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h3 className="text-sm font-semibold text-gray-800">Telas que esta pessoa enxerga</h3>
              <p className="text-xs text-gray-500 mt-0.5">
                {totalMarcadas} de {TELAS.length} telas
                {semRestricao && ' · nenhuma escolha feita ainda (vê tudo o que o módulo permitir)'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input className="input py-1.5 pl-8 text-sm w-44" placeholder="Procurar tela"
                  value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
              <button type="button" onClick={() => setTelas(TELAS.map(t => t.path))}
                className="btn-secondary btn-sm" title="Marcar todas">
                <ShieldCheck size={14} /> Tudo
              </button>
              <button type="button" onClick={() => setTelas([])}
                className="btn-secondary btn-sm" title="Desmarcar todas">
                <ShieldOff size={14} /> Nada
              </button>
            </div>
          </div>

          <div className="space-y-3">
            {gruposVisiveis.map(g => {
              const ligadas = g.telas.filter(t => marcada(t.path)).length;
              return (
                <div key={g.grupo} className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gray-50">
                    <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">{g.grupo}</span>
                    <span className="text-[11px] text-gray-400 ml-auto">{ligadas}/{g.telas.length}</span>
                    <button type="button" onClick={() => alternarGrupo(g, ligadas < g.telas.length)}
                      className="text-[11px] font-semibold text-primary-600 hover:underline">
                      {ligadas < g.telas.length ? 'marcar grupo' : 'desmarcar grupo'}
                    </button>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-3 gap-y-1 p-2">
                    {g.telas.map(t => {
                      const on = marcada(t.path);
                      const semModulo = on && !moduloLigado(t.module);
                      return (
                        <label key={t.path}
                          className={`flex items-start gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${on ? 'bg-primary-50' : 'hover:bg-gray-50'}`}>
                          <input type="checkbox" className="mt-0.5 rounded shrink-0" checked={on}
                            onChange={() => alternarTela(t)} />
                          <span className="min-w-0">
                            <span className="block text-[13px] text-gray-800 truncate">{t.label}</span>
                            <span className="block text-[10px] text-gray-400 truncate">{t.path}</span>
                            {semModulo && (
                              <span className="block text-[10px] text-amber-600 mt-0.5">
                                módulo “{t.module}” desligado — a tela abre vazia
                              </span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {!gruposVisiveis.length && (
              <p className="text-sm text-gray-400 text-center py-6">Nenhuma tela com “{busca}”.</p>
            )}
          </div>

          {/* ── Módulos (o que o servidor entrega) ─────── */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800">Módulos liberados no servidor</h3>
            <p className="text-xs text-gray-500 mt-0.5 mb-2">
              Esta é a trava de verdade: sem o módulo, a API não entrega o dado nem por link direto.
              Marcar uma tela acima já liga o módulo dela.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {modulos.map(m => {
                const on = mods.includes(m.key);
                return (
                  <button key={m.key} type="button" onClick={() => alternarModulo(m.key)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      on ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                    {on && <Check size={11} />} {m.label}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
