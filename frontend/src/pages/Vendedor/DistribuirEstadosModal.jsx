// ============================================================
// DISTRIBUIR OS ESTADOS ENTRE OS VENDEDORES.
//
// O mapa de cobertura passou a mostrar, sem ninguém procurar, que 21 dos
// 27 estados não têm vendedor. Mostrar o buraco e não oferecer a pá é
// meio caminho: para tapá-lo era preciso abrir o cadastro de cada
// vendedor, um por vez, e digitar as siglas na mão.
//
// Aqui os 27 estados ficam numa lista só, os SEM DONO primeiro — que é a
// ordem do trabalho a fazer, e não a ordem do alfabeto. Cada linha diz
// quem atende e oferece o próximo passo no mesmo lugar.
//
// ATRIBUIR ACRESCENTA, e não substitui. Estado dividido entre dois é
// caso legítimo e já existe (o RS é do Administrador e da Renata). Para
// deixar um dono só, tira-se o outro — que é uma decisão, e por isso um
// clique próprio, com o nome de quem sai visível antes do clique.
//
// A COR É A MESMA DO MAPA. Quem distribui está olhando o mapa ao lado;
// duas paletas para as mesmas pessoas fariam a tela e o mapa parecerem
// dois assuntos.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, MapPin, Loader2, Check } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { useVend, UF_NOME, coresDosVendedores } from './ui';
import { UF_LIST } from './BrasilMap';

export default function DistribuirEstadosModal({ aberto, onClose, cobertura }) {
  const v = useVend();
  const qc = useQueryClient();

  const { data: vendedores = [] } = useQuery({
    queryKey: ['vendedor-lista'],
    queryFn: () => api.get('/vendedor/vendedores'),
    enabled: aberto,
  });

  const cores = coresDosVendedores(cobertura);

  const mexer = useMutation({
    // `ufs` (lista) e nao `uf`: atribuir vinte estados como vinte
    // requisicoes fazia as vinte lerem o mesmo territorio antigo e
    // gravarem por cima umas das outras — sobrava um.
    mutationFn: ({ ufs, user_id, acao }) => api.post('/vendedor/territorio', { ufs, user_id, acao }),
    onSuccess: (_, vars) => {
      const n = vars.ufs.length;
      toast.success(vars.acao === 'remover'
        ? `${vars.ufs.join(' ')} devolvido — sem vendedor`
        : n === 1 ? `${vars.ufs[0]} atribuído` : `${n} estados atribuídos`);
      qc.invalidateQueries({ queryKey: ['vendedor-dashboard'] });
      qc.invalidateQueries({ queryKey: ['vendedor-lista'] });
    },
    onError: e => toast.error(e.error || 'Não foi possível salvar'),
  });

  if (!aberto) return null;

  // Sem dono primeiro: é a ordem do trabalho a fazer.
  const linhas = [...UF_LIST].sort((a, b) => {
    const va = (cobertura?.[a] || []).length ? 1 : 0;
    const vb = (cobertura?.[b] || []).length ? 1 : 0;
    return va - vb || a.localeCompare(b);
  });
  const semDono = linhas.filter(uf => !(cobertura?.[uf] || []).length).length;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-2xl max-h-[92vh] sm:max-h-[88vh] flex flex-col rounded-t-2xl sm:rounded-xl"
        style={{ background: v.isDark ? '#0a1130' : '#ffffff', border: `1px solid ${v.divider}` }}>

        <div className="flex items-center justify-between gap-3 px-5 py-3.5"
          style={{ borderBottom: `1px solid ${v.divider}` }}>
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2" style={{ color: v.textPrimary }}>
              <MapPin size={17} style={{ color: '#60a5fa' }} /> Distribuir estados
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: v.textSubtle }}>
              {semDono > 0
                ? `${semDono} estado(s) ainda sem vendedor — eles vêm primeiro na lista.`
                : 'Todos os estados têm vendedor.'}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5" title="Fechar">
            <X size={18} style={{ color: v.textMuted }} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-1.5">
          {linhas.map(uf => {
            const donos = cobertura?.[uf] || [];
            const livres = vendedores.filter(s => !donos.some(d => d.user_id === s.user_id));
            const ocupado = mexer.isPending && mexer.variables?.uf === uf;

            return (
              <div key={uf} className="flex flex-wrap items-center gap-2 py-1.5"
                style={{ borderBottom: `1px solid ${v.divider}` }}>
                <span className="w-9 shrink-0 text-xs font-bold" style={{ color: v.textPrimary }}>{uf}</span>
                <span className="w-40 shrink-0 truncate text-[12px]" style={{ color: v.textMuted }}>
                  {UF_NOME[uf] || uf}
                </span>

                {/* Quem atende hoje. O X ao lado do nome é a única forma
                    de tirar — e ele mostra de quem está tirando. */}
                <span className="flex flex-wrap items-center gap-1 flex-1 min-w-[120px]">
                  {donos.length === 0 ? (
                    <span className="text-[11px] px-1.5 py-0.5 rounded"
                      style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>sem vendedor</span>
                  ) : donos.map(d => {
                    const cor = cores[d.user_id] || '#94a3b8';
                    return (
                      <span key={d.user_id}
                        className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded"
                        style={{ background: `${cor}26`, color: cor }}>
                        {d.name}
                        <button
                          onClick={() => mexer.mutate({ ufs: [uf], user_id: d.user_id, acao: 'remover' })}
                          disabled={mexer.isPending}
                          title={`Tirar ${uf} de ${d.name}`}
                          className="opacity-70 hover:opacity-100 disabled:opacity-30">
                          <X size={11} />
                        </button>
                      </span>
                    );
                  })}
                </span>

                {/* ESCOLHER JA SALVA.
                    Antes o seletor so guardava a escolha na memoria da
                    tela e era preciso clicar num botao azul de 20px ao
                    lado para gravar. Quem escolhia o vendedor de varios
                    estados e clicava em "Concluir" — que tem um ✓ e
                    parece Salvar, mas so fechava a janela — perdia tudo
                    e via a tela igualzinha. O X ao lado do nome ja
                    removia na hora; escolher agora atribui na hora,
                    pela mesma logica. */}
                <span className="flex items-center gap-1.5 shrink-0">
                  {ocupado && <Loader2 size={13} className="animate-spin" style={{ color: '#60a5fa' }} />}
                  <select
                    value=""
                    onChange={e => {
                      const id = e.target.value;
                      if (id) mexer.mutate({ ufs: [uf], user_id: id, acao: 'atribuir' });
                    }}
                    style={{ ...v.control, padding: '0.3rem 0.5rem', fontSize: '0.75rem', maxWidth: 170 }}
                    disabled={!livres.length || mexer.isPending}>
                    <option value="">{livres.length ? '— atribuir a —' : 'todos já atendem'}</option>
                    {livres.map(s => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
                  </select>
                </span>
              </div>
            );
          })}
        </div>

        <div className="px-5 py-3 space-y-2" style={{ borderTop: `1px solid ${v.divider}` }}>
          {/* DAR TODOS DE UMA VEZ.
              Era o que se estava tentando fazer estado por estado, e a
              rota aceita a lista inteira numa requisicao so. */}
          {semDono > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs" style={{ color: v.textPrimary }}>
                Atribuir os <b style={{ color: '#fbbf24' }}>{semDono}</b> sem vendedor a:
              </span>
              <select
                value=""
                onChange={e => {
                  const id = e.target.value;
                  if (!id) return;
                  const orfaos = UF_LIST.filter(uf => !(cobertura?.[uf] || []).length);
                  if (orfaos.length) mexer.mutate({ ufs: orfaos, user_id: id, acao: 'atribuir' });
                }}
                style={{ ...v.control, padding: '0.3rem 0.5rem', fontSize: '0.75rem', maxWidth: 200 }}
                disabled={mexer.isPending}>
                <option value="">— escolher vendedor —</option>
                {(vendedores || []).map(s => <option key={s.user_id} value={s.user_id}>{s.name}</option>)}
              </select>
              {mexer.isPending && <Loader2 size={14} className="animate-spin" style={{ color: '#60a5fa' }} />}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px]" style={{ color: v.textSubtle }}>
              Escolher o vendedor <b>já salva</b>. Atribuir <b>acrescenta</b>: um estado pode ter mais
              de um vendedor. Para deixar um só, tire o outro no X ao lado do nome.
            </p>
            <button onClick={onClose} className="btn-secondary btn-sm">
              <Check size={14} /> Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
