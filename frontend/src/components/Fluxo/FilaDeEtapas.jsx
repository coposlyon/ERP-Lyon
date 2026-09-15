// ============================================================
// A FILA DE ETAPAS — UMA TELA, TRÊS MÓDULOS.
//
// Designer, Produção e Logística fazem o mesmo trabalho com fatias
// diferentes da régua do pedido: uma fila, uma régua de etapas com o
// pedido aceso onde está, iniciar/finalizar com dupla confirmação, e o
// histórico de quem fez o quê. Este componente é essa tela. As três
// páginas são dez linhas cada, dizendo só qual módulo e qual API.
//
// Quem diz de quem é cada etapa é o servidor (MODULOS_DO_FLUXO). Aqui
// nada é escrito sobre "a produção tem revelação": a tela pergunta ao
// endpoint do módulo e desenha o que recebe. Três cópias desta tela
// seriam três para divergir no dia em que a dupla confirmação mudasse.
// ============================================================
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Factory, Play, Check, Search, RefreshCw, Loader2, Save, Image as ImageIcon, AlertTriangle, Clock, Plus,
  Camera, Trash2, ShieldCheck, ArrowLeft, Lock, Eye, CircleCheck, Circle, CalendarClock, Siren,
  // Os ícones dos balões — os mesmos nomes do catálogo (lib/atencao.js).
  Wallet, Package, PenTool, FileImage, FlaskConical, Brush, CircleDashed, Settings,
  PackageOpen, ShieldQuestion, ImageUp, PackageSearch, PackageCheck, Truck, Hourglass, FileCheck, GlassWater,
} from 'lucide-react';

const ICONES = {
  CircleCheck, Wallet, Hourglass, Package, PenTool, FileImage, FileCheck, FlaskConical, Brush,
  CircleDashed, GlassWater, Settings, PackageOpen, ShieldQuestion, ShieldCheck, Camera, ImageUp,
  Truck, PackageCheck, PackageSearch,
};
import api from '@/lib/api';
import { id4 } from '@/lib/ids';
import Modal from '@/components/UI/Modal';
import toast from 'react-hot-toast';

const fmtMoney = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const fmtDT = s => s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const STEP_LABEL = {
  revelacao: 'Revelação', pintura: 'Pintura', borda: 'Borda', metalizacao: 'Metalização',
  producao: 'Produção', qualidade: 'Controle de qualidade', foto: 'Foto', embalagem: 'Embalagem',
  perda: 'Perda', status: 'Status',
};

/**
 * O QUE CADA MARCO DO HISTÓRICO REGISTROU, em português.
 *
 * O histórico dizia só "Produção — finalizou". O que interessa no dia
 * em que mil copos saem errados é OUTRA COISA: em que matriz, em que
 * máquina, com quantas perdas. Isso passou a ser gravado; aqui ele é
 * lido de volta.
 */
const CAMPO_LABEL = {
  matriz: 'matriz', quadro: 'matriz', maquina: 'máquina', perda: 'perda',
  avariadas: 'avariadas', resultado: 'resultado', quantidade: 'quantidade',
  fotos: 'fotos', artes: 'artes', motivo: 'motivo',
};
const CAMPO_SIM = {
  matriz_conferida: 'matriz conferida', fotos_conferidas: 'fotos conferidas',
  etiqueta_fragil: 'etiqueta de frágil', caixa_identificada: 'caixa identificada',
  conferiu_etiqueta: 'conferiu com a etiqueta', conferido: 'conferido',
};
function resumoDoMarco(h) {
  const partes = [];
  for (const [k, label] of Object.entries(CAMPO_LABEL)) {
    const v = h[k];
    if (v === undefined || v === null || v === '' || v === 0) continue;
    partes.push(`${label} ${v}`);
  }
  const marcados = Object.entries(CAMPO_SIM).filter(([k]) => h[k]).map(([, l]) => l);
  if (marcados.length) partes.push(marcados.join(', '));
  return partes.join(' · ');
}
const ACT_LABEL = { start: 'iniciou', finish: 'finalizou', registro: 'registrou' };

const STAGES = {
  aguardando_arte:     { label: 'Aguardando Arte',     cls: 'bg-gray-100 text-gray-600' },
  aguardando_producao: { label: 'Aguardando Produção', cls: 'bg-blue-100 text-blue-700' },
  revelacao:           { label: 'Em processo de gravação', cls: 'bg-yellow-100 text-yellow-700' },
  pintura:             { label: 'Em Pintura',          cls: 'bg-pink-100 text-pink-700' },
  metalizacao:         { label: 'Em Metalização',      cls: 'bg-slate-200 text-slate-700' },
  producao:            { label: 'Em Produção',         cls: 'bg-orange-100 text-orange-700' },
  embalagem:           { label: 'Em Embalagem',        cls: 'bg-violet-100 text-violet-700' },
  finalizado:          { label: 'Finalizado',          cls: 'bg-green-100 text-green-700' },
};
/**
 * A COR DA TELA É A COR DO MÓDULO. Laranja é a fábrica, roxo o designer,
 * verde a logística — as mesmas cores dos balões na régua do cliente.
 * Quem abre três abas sabe em qual está sem ler o título.
 */
const PALETA = {
  orange: { fundoIcone: 'bg-orange-100', icone: 'text-orange-600', linha: 'bg-orange-50', ponto: 'bg-orange-400' },
  violet: { fundoIcone: 'bg-violet-100', icone: 'text-violet-600', linha: 'bg-violet-50', ponto: 'bg-violet-400' },
  green:  { fundoIcone: 'bg-green-100',  icone: 'text-green-600',  linha: 'bg-green-50',  ponto: 'bg-green-400' },
};

const fmtDate = d => d ? new Date(d + 'T00:00:00').toLocaleDateString('pt-BR') : '—';

/**
 * QUEM DIZ O QUE DÁ PARA FAZER É O SERVIDOR.
 *
 * Havia aqui uma função `canDo` com uma corrente escrita à mão —
 * "pintura libera depois da revelação, produção depois da pintura...".
 * Era uma SEGUNDA RÉGUA, paralela à do pedido, e por isso não conhecia
 * borda nem controle de qualidade: um pedido em "Aguardando aplicação
 * de borda" não tinha botão nenhum, e quem estava na bancada aplicava a
 * borda sem ter onde registrar.
 *
 * Agora a lista de ações vem pronta em `pedido.acoes`, calculada pelo
 * status real e pelas etapas que ESTE pedido contratou. A tela desenha
 * o que recebe.
 */
const TITULO_ACAO = (stage, action) =>
  `${action === 'finish' ? 'Finalizar' : 'Iniciar'} ${STEP_LABEL[stage] || stage}`;

/**
 * A CONFIRMAÇÃO EM DUAS PORTAS.
 *
 * Porta 1: os dados da etapa e a senha.
 * Porta 2: tudo relido, e a senha DE NOVO.
 *
 * A segunda não é zelo excessivo — é o único momento em que a pessoa
 * relê o que escreveu. Entre digitar "matriz 74" e ver escrito "matriz
 * 74" no resumo existe a chance de perceber que era 47. Uma confirmação
 * que não custa nada não faz ninguém reler.
 *
 * As duas senhas vão para o servidor e são conferidas de verdade, as
 * duas. Comparar uma com a outra aqui no navegador seria teatro.
 */
function ConfirmacaoDeEtapa({ etapa, acao, matriz, artes, fotos, onCancelar, onConfirmar, enviando }) {
  const [passo, setPasso] = useState(1);
  const [quem, setQuem] = useState('');
  const [senha, setSenha] = useState('');
  const [senha2, setSenha2] = useState('');
  const [dados, setDados] = useState({});

  const campos = etapa?.campos?.[acao] || [];
  const set = (k, v) => setDados(d => ({ ...d, [k]: v }));

  const faltando = campos.filter(c => {
    if (!c.obrigatorio) return false;
    if (c.tipo === 'sim') return !dados[c.key];
    if (c.tipo === 'numero') return !Number(dados[c.key] || 0);
    return !String(dados[c.key] || '').trim();
  });
  const podeSeguir = quem.trim() && senha && !faltando.length;

  return (
    <div className="space-y-3">
      {/* ── PORTA 1 ─────────────────────────────────────── */}
      {passo === 1 && (
        <>
          {etapa?.mostraMatriz && (
            <p className="text-[12.5px] rounded-xl px-3 py-2 bg-slate-50 border border-slate-200 text-slate-700">
              Matriz gravada na revelação deste pedido:{' '}
              <b className="font-mono">{matriz || 'ainda não informada'}</b>
            </p>
          )}
          {etapa?.exigeFoto && (
            <p className={`text-[12.5px] rounded-xl px-3 py-2 border ${fotos >= artes
              ? 'bg-green-50 border-green-200 text-green-800'
              : 'bg-amber-50 border-amber-200 text-amber-900'}`}>
              Este pedido tem <b>{artes} arte(s)</b> e <b>{fotos} foto(s)</b> anexada(s).
              {fotos < artes && ' Anexe as que faltam antes de fechar a etapa — é o que o cliente vê no portal.'}
            </p>
          )}

          <div>
            <label className="label">Usuário *</label>
            <input className="input" autoFocus value={quem}
              onChange={e => setQuem(e.target.value.toUpperCase())}
              placeholder="Quem está fazendo esta etapa" />
          </div>

          {campos.map(c => (
            <div key={c.key}>
              {c.tipo === 'sim' ? (
                <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={!!dados[c.key]}
                    onChange={e => set(c.key, e.target.checked)}
                    className="w-4 h-4 accent-primary-600 mt-0.5" />
                  <span>{c.label} {c.obrigatorio && <span className="text-red-500">*</span>}</span>
                </label>
              ) : c.tipo === 'opcao' ? (
                <>
                  <label className="label">{c.label} {c.obrigatorio && '*'}</label>
                  <div className="flex gap-2">
                    {c.opcoes.map(o => (
                      <button key={o.valor} type="button" onClick={() => set(c.key, o.valor)}
                        className={`flex-1 text-sm py-2 rounded-lg border font-medium ${dados[c.key] === o.valor
                          ? (o.valor === 'reprovado'
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-green-600 text-white border-green-600')
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <>
                  <label className="label">{c.label} {c.obrigatorio && '*'}</label>
                  <input className={`input ${c.tipo === 'texto' ? 'font-mono' : ''}`}
                    type={c.tipo === 'numero' ? 'number' : 'text'}
                    min={c.tipo === 'numero' ? 0 : undefined}
                    value={dados[c.key] ?? (c.tipo === 'numero' ? 0 : '')}
                    onChange={e => set(c.key, e.target.value)} />
                </>
              )}
              {c.dica && <p className="text-[11px] text-gray-400 mt-1">{c.dica}</p>}
            </div>
          ))}

          <div className="border-t border-gray-100 pt-3">
            <label className="label">Confirme com a sua senha *</label>
            <input type="password" className="input" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && podeSeguir && setPasso(2)}
              placeholder="Sua senha" />
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <button onClick={onCancelar} className="btn-secondary">Cancelar</button>
            <button onClick={() => setPasso(2)} disabled={!podeSeguir} className="btn-primary disabled:opacity-40">
              Continuar
            </button>
          </div>
        </>
      )}

      {/* ── PORTA 2: releia, e confirme de novo ─────────── */}
      {passo === 2 && (
        <>
          <p className="text-[13px] font-semibold text-gray-800">
            Tem certeza que as informações estão corretas?
          </p>

          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] space-y-1">
            <p className="text-gray-600">Quem: <b className="text-gray-900">{quem.trim()}</b></p>
            {campos.map(c => {
              const v = dados[c.key];
              const texto = c.tipo === 'sim' ? (v ? 'Sim' : 'Não')
                : c.tipo === 'opcao' ? (c.opcoes.find(o => o.valor === v)?.label || '—')
                : (v === '' || v === undefined || v === null ? '—' : String(v));
              return (
                <p key={c.key} className="text-gray-600">
                  {c.label} <b className={`${c.tipo === 'opcao' && v === 'reprovado' ? 'text-red-700' : 'text-gray-900'}`}>{texto}</b>
                </p>
              );
            })}
          </div>

          {dados.resultado === 'reprovado' && (
            <p className="text-[12.5px] rounded-xl px-3 py-2 bg-red-50 border border-red-200 text-red-800">
              Reprovado registra a conferência e <b>mantém o pedido aqui</b> para ser refeito.
              O pedido não segue para a próxima etapa.
            </p>
          )}

          <div>
            <label className="label flex items-center gap-1.5"><Lock size={12} /> Digite a senha novamente *</label>
            <input type="password" className="input" autoFocus value={senha2}
              onChange={e => setSenha2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && senha2 && !enviando
                && onConfirmar({ actor_user: quem.trim(), password: senha, password_confirma: senha2, dados })}
              placeholder="Sua senha, de novo" />
            <p className="text-[11px] text-gray-400 mt-1">
              As duas senhas são conferidas no servidor. Fica registrado no histórico quem passou a etapa.
            </p>
          </div>

          <div className="flex gap-2 justify-end pt-2 border-t border-gray-100">
            <button onClick={() => setPasso(1)} disabled={enviando} className="btn-secondary">
              <ArrowLeft size={14} /> Voltar e corrigir
            </button>
            <button disabled={!senha2 || enviando} className="btn-primary disabled:opacity-40"
              onClick={() => onConfirmar({ actor_user: quem.trim(), password: senha, password_confirma: senha2, dados })}>
              {enviando ? <><Loader2 size={15} className="animate-spin" /> Confirmando…</> : <><ShieldCheck size={15} /> Confirmar</>}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * A RÉGUA DO PEDIDO — TODAS AS ETAPAS, E ONDE ELE ESTÁ AGORA.
 *
 * Isto já foi dez botões fixos (oito sempre apagados) e depois uma
 * lista magra só do que dava para fazer agora. O primeiro entulhava a
 * tela; o segundo perdeu o mapa — sem ver o caminho inteiro, quem olha
 * não sabe se o pedido está no começo ou no fim, nem por onde ele já
 * passou.
 *
 * Agora são as duas coisas ao mesmo tempo: o caminho inteiro desenhado,
 * a etapa de agora acesa, e os botões SÓ nela. Cada etapa concluída
 * mostra quando e por quem — e o que ela registrou (matriz, máquina,
 * perda), porque é isso que se procura quando o copo sai errado.
 */
function ReguaDeProcessos({ regua, statusDoModulo, acoes, onAgir, pendente, aviso }) {
  if (!regua?.length && !statusDoModulo?.length) {
    return (
      <div className="card p-3 flex flex-wrap items-center gap-2">
        <span className="text-xs flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
          <AlertTriangle size={13} className="shrink-0" />
          {aviso || 'Este pedido não passa pelas etapas deste módulo.'}
        </span>
      </div>
    );
  }

  /**
   * OS MESMOS BALÕES DA LINHA DO TEMPO — só a fatia deste módulo.
   *
   * A produção via "fichas de etapa" (Revelação, Pintura…) enquanto o
   * cliente e o vendedor viam "status numerados" (10 Aguardando
   * revelação, 11 Revelação finalizada…). Duas linguagens para a mesma
   * coisa: o vendedor dizia "está no 16" e a fábrica não sabia o que
   * era 16. Agora é o mesmo desenho, o mesmo número, em toda tela —
   * aqui aparecem só os deste módulo, e o pedido acende onde está.
   */
  /**
   * CORES POR CLASSE, NUNCA POR HEX. O tema escuro do ERP remapeia as
   * classes do Tailwind (bg-green-100 vira verde-escuro, text-gray-500
   * vira cinza-claro); um `style={{ background: '#dcfce7' }}` passa
   * batido e vira uma mancha clara no meio do marinho — foi assim que a
   * régua nasceu ilegível. E o ERP inteiro roda com zoom 0,8: 10px de
   * texto viram 8. Tudo aqui é maior por isso.
   */
  const ESTILO = {
    concluido: {
      anel: 'border-green-500 bg-green-100 dark:bg-green-900/50',
      icone: 'text-green-700 dark:text-green-300',
      badge: 'bg-green-500 text-white',
      texto: 'text-green-800 dark:text-green-200',
    },
    atual: {
      anel: 'border-blue-500 bg-blue-100 dark:bg-blue-900/60 ring-4 ring-blue-500/25',
      icone: 'text-blue-700 dark:text-blue-200',
      badge: 'bg-blue-600 text-white',
      texto: 'text-blue-800 dark:text-blue-100 font-semibold',
    },
    pendente: {
      anel: 'border-gray-300 dark:border-slate-600 bg-gray-50 dark:bg-slate-800/60',
      icone: 'text-gray-400 dark:text-slate-400',
      badge: 'bg-gray-300 dark:bg-slate-600 text-gray-700 dark:text-slate-100',
      texto: 'text-gray-500 dark:text-slate-300',
    },
    nao_se_aplica: {
      anel: 'border-dashed border-gray-200 dark:border-slate-700 bg-transparent',
      icone: 'text-gray-300 dark:text-slate-600',
      badge: 'bg-gray-200 dark:bg-slate-700 text-gray-400 dark:text-slate-500',
      texto: 'text-gray-400 dark:text-slate-500 line-through',
    },
  };
  const dataCurta = iso => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');

  return (
    <div className="card p-4 space-y-4">
      <div className="flex flex-wrap gap-x-3 gap-y-5">
        {(statusDoModulo || []).map(p => {
          const Icon = ICONES[p.icone] || Circle;
          const e = ESTILO[p.estado] || ESTILO.pendente;
          const fora = p.estado === 'nao_se_aplica';
          const rotulo = p.em_processo ? (p.em_processo_label || p.label) : p.label;
          return (
            <div key={p.key} className={`flex flex-col items-center text-center gap-1.5 ${fora ? 'opacity-60' : ''}`}
              style={{ width: 118 }}
              title={`${p.passo}. ${p.label}${fora ? ' — não se aplica a este pedido' : ''}${p.at ? ` — ${dataCurta(p.at)}` : ''}${p.user ? ` · ${p.user}` : ''}`}>
              <div className="relative">
                <div className={`w-14 h-14 rounded-full flex items-center justify-center border-2 ${e.anel}`}>
                  <Icon size={24} className={e.icone} />
                </div>
                <span className={`absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold ${e.badge}`}>
                  {p.passo}
                </span>
              </div>
              <span className={`text-[12px] leading-tight ${e.texto}`}>{rotulo}</span>
              {p.em_processo && (
                <span className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">em andamento</span>
              )}
              {p.at && !p.em_processo && (
                <span className="text-[10px] text-gray-400 dark:text-slate-400">{dataCurta(p.at)}</span>
              )}
            </div>
          );
        })}
      </div>

      {/* OS BOTÕES SÓ DA ETAPA DE AGORA. Iniciar leva o "aguardando" para
          "em andamento"; finalizar leva ao "finalizada" e acende o
          próximo balão. Um botão para uma etapa que o pedido já passou
          (ou ainda não alcançou) é um convite a registrar trabalho que
          não aconteceu. */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-gray-100 dark:border-slate-700">
        {acoes?.length ? acoes.map(a => (
          <button key={`${a.stage}-${a.action}`} onClick={() => onAgir(a)} disabled={pendente}
            className={`text-sm font-semibold px-4 py-2.5 rounded-lg text-white disabled:opacity-30 inline-flex items-center gap-1.5 ${
              a.action === 'finish' ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
            {a.action === 'finish' ? <Check size={16} /> : <Play size={16} />} {TITULO_ACAO(a.stage, a.action)}
          </button>
        )) : (
          <span className="text-sm text-gray-500 dark:text-slate-300">
            Nada para fazer neste pedido agora — ele está com outro módulo.
          </span>
        )}
        {aviso && (
          <span className="text-xs flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
            <AlertTriangle size={13} className="shrink-0" /> {aviso}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * O CAMINHO INTEIRO DO PEDIDO — os 28 status, em blocos por módulo.
 *
 * A régua de cima é a fatia deste módulo, com os botões. Esta é o mapa
 * completo: de onde o pedido veio e para onde vai, com o bloco deste
 * módulo destacado. Quem está na fábrica e vê o pedido "com a
 * logística" não precisa ligar para saber por que ele sumiu da fila.
 *
 * Etapa riscada não se aplica a este pedido — o número dela fica no
 * lugar para a contagem ser a mesma em todo pedido e em toda tela.
 */
function CaminhoGlobal({ linha, moduloAqui }) {
  if (!linha?.length) return null;
  const blocos = [];
  for (const p of linha) {
    const u = blocos[blocos.length - 1];
    if (u && u.modulo === p.modulo) u.passos.push(p);
    else blocos.push({ modulo: p.modulo, label: p.modulo_label || '', passos: [p] });
  }
  const COR = {
    concluido: 'bg-green-100 dark:bg-green-900/50 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700',
    atual: 'bg-blue-600 text-white border-blue-600 ring-2 ring-blue-300/60',
    pendente: 'bg-white dark:bg-slate-800 text-gray-500 dark:text-slate-300 border-gray-200 dark:border-slate-600',
    nao_se_aplica: 'bg-gray-50 dark:bg-transparent text-gray-300 dark:text-slate-600 border-gray-100 dark:border-slate-700 line-through',
  };
  return (
    <div className="card p-3">
      <p className="text-[12px] font-semibold text-gray-500 dark:text-slate-300 uppercase tracking-wide mb-2.5">
        Caminho completo do pedido
      </p>
      <div className="flex flex-wrap gap-3">
        {blocos.map(b => (
          <div key={b.modulo || 'x'}
            className={`rounded-lg px-2.5 py-2 border ${b.modulo === moduloAqui ? 'border-blue-400 bg-blue-50/40 dark:bg-blue-900/30' : 'border-gray-100 dark:border-slate-700'}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-wide mb-1.5 ${
              b.modulo === moduloAqui ? 'text-blue-700 dark:text-blue-300' : 'text-gray-400 dark:text-slate-400'}`}>
              {b.label}{b.modulo === moduloAqui ? ' · aqui' : ''}
            </p>
            <div className="flex flex-wrap gap-1">
              {b.passos.map(p => (
                <span key={p.key} title={`${p.passo}. ${p.label}${p.estado === 'nao_se_aplica' ? ' — não se aplica' : ''}`}
                  className={`text-[12px] px-2 py-1 rounded border font-semibold ${COR[p.estado] || COR.pendente}`}>
                  {p.passo}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * O PRAZO, CONTADO DO EVENTO PARA TRÁS.
 *
 * A data que decide não é a de saída — é a DO EVENTO. O cliente casa
 * dia 2 de outubro; se o copo chegar dia 3, ele não chegou.
 *
 * A conta (evento − dias da transportadora − margem) era feita de
 * cabeça, uma vez, no dia da venda, e nunca mais refeita. O pedido
 * ficava três dias parado esperando a arte, ninguém recalculava nada, e
 * a descoberta vinha quando não havia mais o que fazer.
 *
 * Aqui ela é refeita a cada abertura da tela, e a conta aparece escrita
 * — "02/10 menos 7 dias úteis menos 2 de margem" — porque um prazo que
 * não explica de onde saiu é um prazo que ninguém confia.
 */
function PrazoDoPedido({ prazo, compacto }) {
  if (!prazo) return null;

  // Classes, não hex — o tema escuro remapeia classes (ver ESTILO acima).
  const CORES = {
    vermelho: { caixa: 'bg-red-50 dark:bg-red-950/60 border-red-300 dark:border-red-700', titulo: 'text-red-800 dark:text-red-200', texto: 'text-red-900 dark:text-red-100', sub: 'text-red-700 dark:text-red-300' },
    amarelo:  { caixa: 'bg-amber-50 dark:bg-amber-950/60 border-amber-300 dark:border-amber-700', titulo: 'text-amber-800 dark:text-amber-200', texto: 'text-amber-900 dark:text-amber-100', sub: 'text-amber-700 dark:text-amber-300' },
    verde:    { caixa: 'bg-green-50 dark:bg-green-950/50 border-green-300 dark:border-green-700', titulo: 'text-green-800 dark:text-green-200', texto: 'text-green-900 dark:text-green-100', sub: 'text-green-700 dark:text-green-300' },
    cinza:    { caixa: 'bg-gray-50 dark:bg-slate-800/60 border-gray-200 dark:border-slate-600', titulo: 'text-gray-700 dark:text-slate-200', texto: 'text-gray-600 dark:text-slate-300', sub: 'text-gray-500 dark:text-slate-400' },
  };
  const c = CORES[prazo.cor] || CORES.cinza;
  const urgente = prazo.alerta_24h;

  return (
    <div className={`rounded-xl border px-4 py-3.5 ${c.caixa} ${urgente ? 'ring-2 ring-red-400/60' : ''}`}>
      <p className={`text-[15px] font-bold flex items-center gap-2 ${c.titulo}`}>
        {urgente ? <Siren size={18} /> : <CalendarClock size={17} />}
        {prazo.label}
      </p>
      <p className={`text-[13.5px] mt-1.5 leading-relaxed ${c.texto}`}>{prazo.recado}</p>

      {/* A CONTA, ESCRITA. "Por que 21 e não 23?" só se responde
          perguntando a alguém — a menos que esteja aqui. */}
      {prazo.evento && !compacto && (
        <p className={`text-[12.5px] mt-2 ${c.sub}`}>
          Evento {dataBR(prazo.evento)} − {prazo.transporte} dia(s) útil(eis) de transporte
          {prazo.transporte_origem !== 'pedido' ? ` (${prazo.transporte_origem})` : ''}
          {' '}= {dataBR(prazo.limite_sem_margem)} − {prazo.margem} de margem
          {' '}= <b className={c.titulo}>sair até {dataBR(prazo.limite_saida)}</b>
        </p>
      )}

      {prazo.saida_depois_do_limite && (
        <p className={`text-[12.5px] mt-2 font-semibold ${c.titulo}`}>
          A data de saída no pedido é {dataBR(prazo.saida_prevista)} — depois do limite. Corrija no pedido.
        </p>
      )}
    </div>
  );
}

const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

/**
 * @param modulo     'designer' | 'producao' | 'logistica' — a chave em MODULOS_DO_FLUXO
 * @param api        prefixo das rotas: '/designer', '/production', '/logistica'
 * @param titulo     o nome no cabeçalho
 * @param subtitulo  a fatia, em palavras: "Revelação · Produção · Embalagem"
 * @param Icone      ícone lucide do cabeçalho
 * @param cor        'orange' | 'violet' | 'green' — a família de cor da tela
 * @param extras     nós React desenhados abaixo da fila (o painel de serigrafia, por ex.)
 * @param detalheExtra  função (pedido, detail) => nós, desenhados dentro da ficha do pedido
 */
export default function FilaDeEtapas({
  modulo, api: apiBase, titulo, subtitulo, Icone = Factory, cor = 'orange',
  extras = null, detalheExtra = null,
}) {
  const qc = useQueryClient();
  const [filters, setFilters] = useState({ start_date: '', end_date: '', search: '' });
  const [query, setQuery] = useState({ start_date: '', end_date: '', search: '' });
  const [selId, setSelId] = useState(null);

  const { data, isLoading, isFetching, error, refetch } = useQuery({
    queryKey: [apiBase, query],
    queryFn: () => api.get(`${apiBase}?${new URLSearchParams(Object.fromEntries(Object.entries(query).filter(([, v]) => v)))}`),
  });
  const rows = data?.data || [];
  // Quantos ainda esperam o comercial mandar. Fila vazia com pedidos
  // represados é uma resposta; fila vazia e mais nada é um mistério.
  const selected = rows.find(r => r.id === selId) || null;

  const { data: detail } = useQuery({
    queryKey: [apiBase, 'detail', selId],
    queryFn: () => api.get(`${apiBase}/${selId}`),
    enabled: !!selId,
  });

  /**
   * O CATÁLOGO DE ETAPAS VEM DO SERVIDOR.
   *
   * Que etapas existem e que campos cada uma pede era conhecimento
   * duplicado — escrito aqui e lá. Duas cópias da mesma lista é uma
   * cópia que fica para trás: foi assim que borda e controle de
   * qualidade existiram no fluxo do pedido sem existir nesta tela.
   */
  const { data: catalogo } = useQuery({
    queryKey: [apiBase, 'etapas'],
    queryFn: () => api.get(`${apiBase}/etapas`),
    staleTime: 60 * 60 * 1000,
  });
  const etapaDe = k => (catalogo?.etapas || []).find(e => e.key === k);

  const stageMut = useMutation({
    mutationFn: (payload) => api.post(`${apiBase}/${selId}/stage`, payload),
    onSuccess: r => {
      qc.invalidateQueries({ queryKey: [apiBase] });
      qc.invalidateQueries({ queryKey: [apiBase, 'detail', selId] });
      setConfirmando(null);
      if (r?.reprovado) {
        toast('Conferência registrada como REPROVADA — o pedido continua aqui para ser refeito.',
          { icon: '⚠️', duration: 8000 });
      } else if (r?.saiu_do_modulo) {
        // O pedido saiu da fatia deste módulo — vai sumir da fila, e quem
        // clicou precisa saber para onde foi, senão parece que perdeu.
        toast.success(`Etapa registrada — o pedido seguiu para ${r.modulo_agora_label || 'o próximo módulo'} (${r.status_label}).`,
          { duration: 7000 });
      } else {
        toast.success(`Etapa registrada — pedido em "${r?.status_label || 'próxima etapa'}"`);
      }
      /**
       * RETIRADA NAO ESPERA A LOGISTICA.
       *
       * Fechada a embalagem de um pedido que o cliente vem buscar, nao
       * ha coleta nem transportadora: o unico passo que falta e a
       * pessoa aparecer. O servidor ja montou o recado; aqui a conversa
       * abre na hora, com quem acabou de fechar a caixa.
       */
      if (r?.aviso_cliente) setAvisoRetirada(r.aviso_cliente);
      // A perda não encolhe o pedido: quem informou precisa ver, agora,
      // quanto a linha tem de repor.
      if (r?.repor) toast(r.repor.recado, { icon: '🔁', duration: 9000 });
      if (r?.matriz_perdida?.precisa_troca) {
        toast(`Quadro ${r.matriz_perdida.quadro} já tem ${r.matriz_perdida.recuperacoes} recuperações — pode precisar trocar a tela.`,
          { icon: '⚠️', duration: 9000 });
      }
    },
    onError: e => toast.error(e.dica ? `${e.error} ${e.dica}` : (e.error || 'Erro ao registrar etapa')),
  });

  // A etapa que está sendo confirmada agora: { stage, action } | null
  const [confirmando, setConfirmando] = useState(null);
  // O recado de "pronto para retirada", montado pelo servidor ao fechar
  // a embalagem de um pedido que o cliente vem buscar.
  const [avisoRetirada, setAvisoRetirada] = useState(null);
  // O pedido aberto pelo olho. Separado do `selId` de propósito: clicar
  // na linha escolhe o pedido (e muda a régua do topo); o olho é que
  // abre a ficha inteira.
  const [verAberto, setVerAberto] = useState(false);

  const [edit, setEdit] = useState({});
  const saveFields = useMutation({
    mutationFn: () => api.patch(`${apiBase}/${selId}`, edit),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [apiBase] }); qc.invalidateQueries({ queryKey: [apiBase, 'detail', selId] }); toast.success('Salvo!'); },
    onError: e => toast.error(e.error || 'Erro ao salvar'),
  });

  /**
   * NÃO EXISTE MAIS "REGISTRAR PERDA" AVULSO.
   *
   * Havia aqui um botão para lançar perda a qualquer momento. Ele
   * competia com o campo de perda do fecho de cada etapa, e duas portas
   * para o mesmo fato dão dois números: a mesma quebra lançada nas duas
   * vira o dobro no estoque, e a lançada em nenhuma some.
   *
   * Perda acontece DENTRO de uma etapa, e é lá que ela é perguntada — a
   * quem estava com a peça na mão.
   */

  // Foto do produto (visível ao cliente no site)
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const photoMut = useMutation({
    mutationFn: (image) => api.post(`${apiBase}/${selId}/photo`, { image }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [apiBase, 'detail', selId] }); qc.invalidateQueries({ queryKey: [apiBase] }); toast.success('Foto anexada — já aparece para o cliente!'); },
    onError: e => toast.error(e.error || 'Erro ao anexar foto (rodou a migration 024?)'),
  });
  const delPhotoMut = useMutation({
    mutationFn: (url) => api.delete(`${apiBase}/${selId}/photo?url=${encodeURIComponent(url)}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [apiBase, 'detail', selId] }); toast.success('Foto removida'); },
    onError: e => toast.error(e.error || 'Erro ao remover'),
  });
  function onPickPhoto(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('Selecione uma imagem'); return; }
    if (file.size > 8 * 1024 * 1024) { toast.error('Imagem muito grande (máx. 8MB)'); return; }
    setUploadingPhoto(true);
    const reader = new FileReader();
    reader.onload = () => photoMut.mutate(reader.result, { onSettled: () => setUploadingPhoto(false) });
    reader.onerror = () => { setUploadingPhoto(false); toast.error('Não consegui ler a imagem'); };
    reader.readAsDataURL(file);
  }

  // sincroniza campos editáveis quando troca de pedido
  const d = detail || {};
  const ef = (k, fallback = '') => (k in edit ? edit[k] : (d[k] ?? fallback));

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${PALETA[cor].fundoIcone}`}>
            <Icone size={18} className={PALETA[cor].icone} />
          </div>
          <div>
            <h1 className="page-title">{titulo}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{subtitulo}</p>
          </div>
        </div>
        <button onClick={() => refetch()} className="btn-secondary"><RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Atualizar</button>
      </div>

      {/* A RÉGUA DO PEDIDO SELECIONADO — o caminho inteiro, e onde ele está.
          Virou uma lista magra de "o que dá para fazer agora" e nisso
          perdeu o mapa: quem olha precisa ver TODAS as etapas e a
          bolinha acesa no lugar certo, senão não sabe se o pedido está
          no começo ou no fim. */}
      {selected ? (
        <div className="space-y-3">
          <PrazoDoPedido prazo={selected.prazo} />
          <ReguaDeProcessos regua={selected.regua} statusDoModulo={selected.regua_status} acoes={selected.acoes}
            onAgir={setConfirmando} pendente={stageMut.isPending}
            aviso={!selected.interagivel
              ? 'Pedido sem personalização — não passa pela serigrafia. Ele segue pela tela do pedido de venda.'
              : null} />
        </div>
      ) : (
        <div className="card p-3 text-xs text-gray-400">
          Selecione um pedido na lista para ver as etapas dele.
        </div>
      )}

      {/* Filtros */}
      <div className="card p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="label">Saída de</label>
          <input type="date" className="input" value={filters.start_date} onChange={e => setFilters(f => ({ ...f, start_date: e.target.value }))} />
        </div>
        <div>
          <label className="label">até</label>
          <input type="date" className="input" value={filters.end_date} onChange={e => setFilters(f => ({ ...f, end_date: e.target.value }))} />
        </div>
        <div className="flex-1 min-w-48">
          <label className="label">Procurar (pedido ou cliente)</label>
          <input className="input" value={filters.search} onChange={e => setFilters(f => ({ ...f, search: e.target.value }))}
            onKeyDown={e => e.key === 'Enter' && setQuery(filters)} placeholder="Nº do pedido ou nome..." />
        </div>
        <button onClick={() => setQuery(filters)} className="btn-primary"><Search size={15} /> Filtrar</button>
      </div>

      {/* Board */}
      <div className="card overflow-hidden">
        {/* NO CELULAR A TABELA NÃO ABRE.
            Onze colunas num aparelho de 360 pontos viram arrastar de lado
            para ler cada pedido — e a coluna que decide (o prazo) é
            justamente a do meio, a que nunca está na tela. Abaixo de `lg`
            a mesma lista vira um cartão por pedido. Os dois leem os
            MESMOS `rows`: não existe segunda consulta nem segunda regra. */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 uppercase border-b border-gray-100 bg-gray-50 align-bottom">
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">Nº</span>PEDIDO</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">DATA DO</span>PEDIDO</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">DATA DO</span>EVENTO</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">DATA DE</span>SAÍDA</th>
                <th className="px-3 py-2 leading-tight"><span className="block text-[9px] text-gray-400">PRAZO MÁX.</span>ENTREGA</th>
                <th className="px-3 py-2 text-center leading-tight"><span className="block text-[9px] text-gray-400">SAIR ATÉ</span>P/ O EVENTO</th>
                <th className="px-3 py-2">Transportadora</th>
                <th className="px-3 py-2">Cidade/UF</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Vendedor</th>
                <th className="px-3 py-2 text-center">Ver</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && <tr><td colSpan={12} className="p-8 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></td></tr>}
              {!isLoading && error && <tr><td colSpan={12} className="p-0"><FalhouAoCarregar erro={error} onTentar={refetch} /></td></tr>}
              {!isLoading && !error && rows.length === 0 && <tr><td colSpan={12} className="p-0"><FilaVazia /></td></tr>}
              {rows.map(r => {
                const st = STAGES[r.stage] || STAGES.aguardando_producao;
                const dd = r.diff_deadline ?? r.diff_days;
                const late = dd != null && dd < 0;
                const soon = dd != null && dd >= 0 && dd <= 3;
                return (
                  <tr key={r.id} onClick={() => { setSelId(r.id); setEdit({}); }}
                    className={`border-b border-gray-50 cursor-pointer ${selId === r.id ? PALETA[cor].linha : 'hover:bg-gray-50/60'} ${r.interagivel ? '' : 'opacity-60'}`}>
                    <td className="px-3 py-2 font-mono font-semibold whitespace-nowrap">
                      #{String(r.number || '').padStart(4, '0')}
                      {!r.personalizado && (
                        <span className="block text-[9px] font-sans font-semibold text-amber-600 uppercase tracking-wide">liso</span>
                      )}
                    </td>
                    <td className="px-3 py-2">{r.customer}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.order_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.event_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.ship_date)}</td>
                    <td className="px-3 py-2 text-gray-500">{fmtDate(r.max_delivery_date)}</td>
                    {/* O PRAZO REAL, e não os dias até a data digitada.
                        `diff_days` conta até a saída que alguém digitou;
                        `prazo` conta do EVENTO para trás, que é o que
                        decide se o copo chega na festa. */}
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {r.prazo?.limite_saida ? (
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1 ${
                          r.prazo.cor === 'vermelho' ? 'bg-red-100 text-red-700'
                            : r.prazo.cor === 'amarelo' ? 'bg-amber-100 text-amber-700'
                            : r.prazo.cor === 'verde' ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-500'}`}
                          title={r.prazo.recado}>
                          {r.prazo.alerta_24h && <Siren size={11} />}
                          {r.prazo.nivel === 'estourado' ? 'estourado'
                            : r.prazo.dias_ate_limite != null ? `${r.prazo.dias_ate_limite}d` : '—'}
                        </span>
                      ) : (
                        <span className={`text-xs font-semibold ${late ? 'text-red-600' : soon ? 'text-orange-500' : 'text-gray-600'}`}>
                          {dd == null ? '—' : late ? `${Math.abs(dd)}d atraso` : `${dd}d`}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-gray-500 truncate max-w-[140px]">{r.carrier || '—'}</td>
                    <td className="px-3 py-2 text-gray-500">{r.city ? `${r.city}/${r.uf || ''}` : '—'}</td>
                    <td className="px-3 py-2"><span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span></td>
                    <td className="px-3 py-2 text-gray-500">{r.seller || '—'}</td>
                    <td className="px-3 py-2 text-center">
                      <button title="Ver o pedido inteiro"
                        onClick={ev => { ev.stopPropagation(); setSelId(r.id); setEdit({}); setVerAberto(true); }}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 hover:text-gray-800">
                        <Eye size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── A MESMA LISTA, EM CARTÕES (celular) ─────────────── */}
        <div className="lg:hidden divide-y divide-gray-200">
          {isLoading && (
            <div className="p-8 text-center text-gray-400"><Loader2 className="animate-spin mx-auto" /></div>
          )}
          {!isLoading && error && <FalhouAoCarregar erro={error} onTentar={refetch} />}
          {!isLoading && !error && rows.length === 0 && <FilaVazia />}
          {rows.map(r => (
            <CartaoProducao key={r.id} r={r} selecionado={selId === r.id}
              onSelecionar={() => { setSelId(r.id); setEdit({}); }} />
          ))}
        </div>
      </div>

      {/* O que cada módulo pendura embaixo da fila (a produção traz o
          painel de serigrafia; os outros, nada). */}
      {extras}

      {/* O PEDIDO INTEIRO, ABERTO PELO OLHO.
          Tudo o que se sabe do pedido morava solto no rodapé da tela,
          embaixo da lista e do painel de serigrafia: para ver os itens
          de um pedido era preciso clicar na linha e rolar até o fim da
          página, e o que aparecia lá embaixo não dizia de qual pedido
          era. Agora abre pelo olho da linha, com o número no título. */}
      <Modal isOpen={!!selected && verAberto} onClose={() => setVerAberto(false)}
        title={selected ? `Pedido #${String(selected.number || '').padStart(4, '0')} — ${selected.customer}` : ''}
        size="full">
        {selected && (
          <div className="space-y-4">
            <PrazoDoPedido prazo={detail?.prazo || selected.prazo} />
            <ReguaDeProcessos regua={detail?.regua || selected.regua}
              statusDoModulo={detail?.regua_status || selected.regua_status} acoes={selected.acoes}
              onAgir={a => { setVerAberto(false); setConfirmando(a); }} />
            <CaminhoGlobal linha={detail?.linha_do_tempo} moduloAqui={modulo} />
        <div className="grid lg:grid-cols-2 gap-4">
          {/* Itens + dados */}
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3">Pedido #{String(selected.number || '').padStart(4, '0')} — itens</p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-xs text-gray-400 border-b border-gray-100">
                    <th className="py-1.5 pr-2">Cód</th><th className="py-1.5 pr-2">Produto</th>
                    <th className="py-1.5 pr-2 text-right">Qtd</th><th className="py-1.5 pr-2">Cor</th><th className="py-1.5">Impressão</th>
                  </tr></thead>
                  <tbody>
                    {(detail?.items || []).map((it, i) => (
                      <tr key={i} className="border-b border-gray-50">
                        <td className="py-1.5 pr-2 font-mono text-xs text-gray-400">{it.product_code ? id4(it.product_code) : '—'}</td>
                        <td className="py-1.5 pr-2 font-medium">{it.product_name}</td>
                        <td className="py-1.5 pr-2 text-right">{it.quantity}</td>
                        <td className="py-1.5 pr-2">{it.color || '—'}</td>
                        <td className="py-1.5 text-gray-500">{it.impressao || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="card p-4 space-y-3">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Logística & datas</p>
              {/* Data do pedido (automática) + diffs calculados */}
              <div className="bg-gray-50 rounded-xl p-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Pedido em</p>
                  <p className="text-sm font-semibold text-gray-800">{fmtDate(detail?.order_date)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dias p/ evento</p>
                  <p className="text-sm font-semibold text-gray-800">{selected?.diff_event == null ? '—' : `${selected.diff_event}d`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dias p/ saída</p>
                  <p className="text-sm font-semibold text-gray-800">{selected?.diff_ship == null ? '—' : `${selected.diff_ship}d`}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-gray-400 font-semibold">Dias p/ prazo</p>
                  <p className={`text-sm font-bold ${selected?.diff_deadline != null && selected.diff_deadline < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {selected?.diff_deadline == null ? '—' : selected.diff_deadline < 0 ? `${Math.abs(selected.diff_deadline)}d atraso` : `${selected.diff_deadline}d`}
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="label">Data do evento</label><input type="date" className="input" value={ef('event_date') || ''} onChange={e => setEdit(s => ({ ...s, event_date: e.target.value }))} /></div>
                <div><label className="label">Prazo máx. entrega</label><input type="date" className="input" value={ef('max_delivery_date') || ''} onChange={e => setEdit(s => ({ ...s, max_delivery_date: e.target.value }))} /></div>
                <div><label className="label">Data de saída</label><input type="date" className="input" value={ef('ship_date') || ''} onChange={e => setEdit(s => ({ ...s, ship_date: e.target.value }))} /></div>
                <div><label className="label">Horário</label><input className="input" value={ef('ship_time') || ''} onChange={e => setEdit(s => ({ ...s, ship_time: e.target.value }))} placeholder="10:00" /></div>
                <div><label className="label">Transportadora</label><input className="input" value={ef('carrier') || ''} onChange={e => setEdit(s => ({ ...s, carrier: e.target.value }))} /></div>
                <div><label className="label">Frete (R$)</label><input type="number" step="0.01" className="input" value={ef('freight') ?? ''} onChange={e => setEdit(s => ({ ...s, freight: e.target.value }))} placeholder="0,00" /></div>
              </div>
              <div><label className="label">Observações de produção</label><textarea rows={2} className="input resize-none" value={ef('production_obs') || ''} onChange={e => setEdit(s => ({ ...s, production_obs: e.target.value }))} /></div>
              <button onClick={() => saveFields.mutate()} disabled={saveFields.isPending || !Object.keys(edit).length} className="btn-primary disabled:opacity-50">
                <Save size={15} /> Salvar dados
              </button>
            </div>
          </div>

          {/* Arte + Perdas + Histórico */}
          <div className="space-y-4">
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><ImageIcon size={13} /> Arte / Layout</p>
              {(detail?.items || []).some(it => it.art) ? (
                <div className="space-y-3">
                  {(detail?.items || []).filter(it => it.art).map((it, i) => (
                    <div key={i}>
                      <img src={it.art} alt="" className="w-full rounded-xl border border-gray-200" />
                      <p className="text-xs text-gray-400 mt-1">{it.product_name} · {it.color || ''}{it.art_file ? ` · ${it.art_file}` : ''}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-sm text-gray-400 text-center py-10">Sem arte anexada neste pedido.</div>
              )}
            </div>

            {/* O que o módulo quer mostrar dentro da ficha (a logística
                traz os botões de expedição). */}
            {detalheExtra && detalheExtra(selected, detail)}

            {/* Foto do produto personalizado (vai para o cliente no site).
                Só na fábrica: é ela que tem a peça pronta na mão. */}
            {modulo === 'producao' && <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><Camera size={13} /> Foto do produto</p>
                <label className={`btn-secondary text-xs cursor-pointer ${uploadingPhoto ? 'opacity-50 pointer-events-none' : ''}`}>
                  {uploadingPhoto ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />} Anexar foto
                  <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPickPhoto} disabled={uploadingPhoto} />
                </label>
              </div>
              <p className="text-[11px] text-gray-400 mb-2">Aparece no acompanhamento do pedido do cliente no site. 📸</p>
              {(detail?.photos || []).length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma foto anexada.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {(detail.photos).map((p, i) => (
                    <div key={i} className="relative group">
                      <img src={p.url} alt="" className="w-full h-24 object-cover rounded-lg border border-gray-200" />
                      <button onClick={() => delPhotoMut.mutate(p.url)}
                        className="absolute top-1 right-1 bg-white/90 hover:bg-red-500 hover:text-white text-red-500 rounded-full p-1 shadow opacity-0 group-hover:opacity-100 transition-opacity" title="Remover">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>}

            {/* Perdas na produção — só na fábrica. */}
            {modulo === 'producao' && <div className="card p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wide flex items-center gap-1.5"><AlertTriangle size={13} /> Perdas na produção</p>
                <span className="text-[11px] text-gray-400">informada ao finalizar cada etapa</span>
              </div>
              {/* A CONTA DA FÁBRICA, escrita.
                  "Não existe perda para o cliente": pediu 200, recebe
                  200 — se quebrarem 50, saem 250 da linha. Sem isto
                  escrito, a soma fica na cabeça de quem está na máquina,
                  e ninguém a refaz quando a quebra é às cinco de sexta. */}
              {detail?.producao?.perdido > 0 && (
                <div className="mb-3 rounded-xl px-3 py-2.5 bg-amber-50 border border-amber-200">
                  <p className="text-[13px] font-semibold text-amber-900">
                    Produzir {detail.producao.a_produzir} unidades
                  </p>
                  <p className="text-[12px] text-amber-800 mt-0.5">
                    {detail.producao.vendido} vendidas + {detail.producao.perdido} perdidas.
                    O cliente recebe as {detail.producao.vendido} que pediu — a fábrica repõe o resto.
                  </p>
                  <p className="text-[11.5px] text-amber-700 mt-1">
                    {detail.producao.por_etapa.map(e => `${e.label}: ${e.unidades}`).join(' · ')}
                  </p>
                </div>
              )}

              {(detail?.perdas || []).length === 0 ? (
                <p className="text-sm text-gray-400">Nenhuma perda registrada.</p>
              ) : (
                <div className="space-y-1.5">
                  {(detail.perdas).map(p => (
                    <div key={p.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-1.5">
                      <span className="truncate">{p.product_name || 'Produto'}</span>
                      <span className="text-red-600 font-semibold shrink-0 ml-2">-{Number(p.quantity)} un</span>
                      <span className="text-xs text-gray-400 shrink-0 ml-2">{p.user_name} · {fmtDT(p.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}

            </div>}

            {/* Histórico / timeline */}
            <div className="card p-4">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5"><Clock size={13} /> Histórico</p>
              {(detail?.history || []).length === 0 ? (
                <p className="text-sm text-gray-400">Sem movimentações ainda.</p>
              ) : (
                <ol className="space-y-2">
                  {[...(detail.history)].reverse().map((h, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className={`w-1.5 h-1.5 rounded-full ${PALETA[cor].ponto} mt-1.5 shrink-0`} />
                      <div>
                        <span className="font-medium">{STEP_LABEL[h.stage] || h.stage}</span>
                        <span className="text-gray-500"> — {ACT_LABEL[h.action] || h.action}{h.detail ? ` (${h.detail})` : ''}</span>
                        {/* O QUE FOI REGISTRADO NAQUELE MOMENTO: matriz,
                            máquina, perda, resultado da conferência. É
                            o que se procura quando o copo sai errado. */}
                        {resumoDoMarco(h) && (
                          <div className="text-xs text-gray-600">{resumoDoMarco(h)}</div>
                        )}
                        <div className="text-xs text-gray-400 flex items-center gap-1">
                          {h.user || '—'} · {fmtDT(h.at)}
                          {h.confirmado_duas_vezes && (
                            <span title="Confirmado duas vezes, com senha nas duas"
                              className="inline-flex items-center gap-0.5 text-green-600">
                              <ShieldCheck size={11} />
                            </span>
                          )}
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
          </div>
        )}
      </Modal>



      {/* O recado de "pronto para retirada", pronto para enviar. */}
      <Modal isOpen={!!avisoRetirada} onClose={() => setAvisoRetirada(null)}
        title="Pedido pronto — avise o cliente" size="sm">
        {avisoRetirada && (
          <div className="space-y-3">
            <p className="text-[13px] rounded-xl px-3 py-2 bg-blue-50 border border-blue-200 text-blue-900">
              Este pedido é para <b>retirada</b> — não passa pela logística. A mensagem está
              pronta; é só abrir a conversa e enviar.
            </p>
            <pre className="text-[12.5px] whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 font-sans text-gray-700">
              {avisoRetirada.mensagem}
            </pre>
            {avisoRetirada.envio?.modo === 'sem_telefone' && (
              <p className="text-[12.5px] rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-900">
                {avisoRetirada.envio.motivo}. Copie o texto e mande pelo canal de sempre.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button className="btn-secondary" onClick={() => {
                navigator.clipboard?.writeText(avisoRetirada.mensagem);
                toast.success('Mensagem copiada');
              }}>Copiar</button>
              {avisoRetirada.wa_link && (
                <a className="btn-primary" href={avisoRetirada.wa_link} target="_blank" rel="noopener noreferrer">
                  Abrir o WhatsApp
                </a>
              )}
              <button className="btn-secondary" onClick={() => setAvisoRetirada(null)}>Fechar</button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmação da etapa — duas portas, senha nas duas. */}
      <Modal isOpen={!!confirmando} onClose={() => !stageMut.isPending && setConfirmando(null)}
        title={confirmando ? TITULO_ACAO(confirmando.stage, confirmando.action) : ''} size="sm">
        {confirmando && (
          <ConfirmacaoDeEtapa
            key={`${confirmando.stage}-${confirmando.action}`}
            etapa={etapaDe(confirmando.stage)}
            acao={confirmando.action}
            matriz={detail?.matriz}
            artes={Math.max(1, detail?.artes || 1)}
            fotos={(detail?.photos || []).length}
            enviando={stageMut.isPending}
            onCancelar={() => setConfirmando(null)}
            onConfirmar={payload => stageMut.mutate({ ...payload, stage: confirmando.stage, action: confirmando.action })}
          />
        )}
      </Modal>
    </div>
  );
}

/**
 * UM PEDIDO, UM CARTÃO — a fila da produção no celular.
 *
 * A tabela responde "qual está mais apertado?" de relance porque as
 * datas estão alinhadas em coluna. Num aparelho de 360 pontos nada está
 * alinhado: sobra arrastar de lado, e arrastar de lado não responde
 * nada.
 *
 * O cartão inverte a ordem de leitura: primeiro o prazo — que é o que
 * a produção decide por —, depois quem é o pedido, e por último o
 * resto. Cidade, transportadora e vendedor só aparecem quando existem:
 * no computador um campo vazio é uma célula com traço; aqui é uma linha
 * inteira gasta para dizer "nada".
 */
function CartaoProducao({ r, selecionado, onSelecionar }) {
  const st = STAGES[r.stage] || STAGES.aguardando_producao;
  const dd = r.diff_deadline ?? r.diff_days;
  const atrasado = dd != null && dd < 0;
  const perto = dd != null && dd >= 0 && dd <= 3;
  const rodape = [r.city ? `${r.city}/${r.uf || ''}` : null, r.carrier, r.seller].filter(Boolean).join(' · ');

  return (
    <div role="button" tabIndex={0} onClick={onSelecionar}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelecionar(); } }}
      className={`px-4 py-3.5 cursor-pointer ${selecionado ? 'bg-orange-50' : ''} ${r.interagivel ? '' : 'opacity-70'}`}>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-mono font-bold text-gray-900">#{String(r.number || '').padStart(4, '0')}</span>
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
        {/* O selo do liso vem antes de qualquer número: ele muda o que
            dá para fazer com o pedido, e isso se lê primeiro. */}
        {!r.personalizado && (
          <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            sem personalização
          </span>
        )}
        <span className={`ml-auto text-[13px] font-bold whitespace-nowrap ${atrasado ? 'text-red-600' : perto ? 'text-orange-500' : 'text-gray-500'}`}>
          {dd == null ? '—' : atrasado ? `${Math.abs(dd)}d atraso` : `${dd}d p/ prazo`}
        </span>
      </div>

      <p className="font-semibold text-gray-800 mt-1 truncate">{r.customer}</p>

      <div className="grid grid-cols-3 gap-2 mt-2">
        <Prazo rotulo="Evento"  valor={fmtDate(r.event_date)} />
        <Prazo rotulo="Saída"   valor={fmtDate(r.ship_date)} />
        <Prazo rotulo="Entrega" valor={fmtDate(r.max_delivery_date)} />
      </div>

      {rodape && <p className="text-[11px] text-gray-400 mt-2 truncate">{rodape}</p>}
    </div>
  );
}

function Prazo({ rotulo, valor }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-gray-400">{rotulo}</p>
      <p className="text-[12.5px] text-gray-600 truncate">{valor}</p>
    </div>
  );
}

/**
 * CARREGANDO PARA SEMPRE NÃO É UM ESTADO — É UM ERRO SEM NOME.
 *
 * A tela mostrava o mesmo rodopiando quer a resposta estivesse a
 * caminho, quer o servidor tivesse recusado. Quem ficou olhando dez
 * minutos não tinha como saber que não ia chegar nunca, e a única
 * saída era recarregar a página no escuro.
 */
function FalhouAoCarregar({ erro, onTentar }) {
  return (
    <div className="p-8 text-center">
      <AlertTriangle size={28} className="text-amber-500 mx-auto mb-2" />
      <p className="text-sm font-semibold text-gray-700">Não consegui carregar a fila da produção.</p>
      <p className="text-xs text-gray-400 mt-1 mb-3">{erro?.error || erro?.message || 'O servidor não respondeu.'}</p>
      <button onClick={() => onTentar()} className="btn-secondary text-sm mx-auto">
        <RefreshCw size={14} /> Tentar de novo
      </button>
    </div>
  );
}

/**
 * Fila vazia é só fila vazia.
 *
 * Aqui havia o recado "há N pedidos esperando o comercial clicar em
 * Enviar para produção" — e ele saiu junto com a trava que o criava. A
 * fila agora é o STATUS: pedido em "Aguardando produção" está nesta
 * tela, sem depender de clique de terceiro.
 */
function FilaVazia() {
  return (
    <div className="p-8 text-center">
      <p className="text-sm text-gray-500">Nenhum pedido na fila da produção.</p>
      <p className="text-xs text-gray-400 mt-1.5">
        Os pedidos aparecem aqui assim que chegam em “Aguardando produção”.
      </p>
    </div>
  );
}
