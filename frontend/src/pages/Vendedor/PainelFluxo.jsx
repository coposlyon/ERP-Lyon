// ============================================================
// O PAINEL QUE MOVE O PEDIDO.
//
// A linha do tempo desenhava quinze fases e não oferecia UMA forma de
// passar de uma para a outra. Era um cartaz: bonito, correto e inútil no
// dia a dia — o pedido chegava em "Aguardando financeiro" e morava lá,
// porque o único botão que existia no sistema sabia mexer em nove status
// antigos e travava no primeiro copo que precisava de revelação.
//
// Este painel é o outro lado da mesma linha do tempo. Ele responde três
// perguntas, nesta ordem, que é a ordem em que quem trabalha pergunta:
//
//   ONDE ESTÁ      a fase atual e de quem ela é
//   O QUE FALTA    os requisitos, com o que já está pronto e o que não
//   O QUE FAÇO     um botão só, dizendo o que vai acontecer
//
// QUEM DECIDE É O SERVIDOR. Nada aqui calcula se o pedido pode andar: a
// ficha chega pronta de /sales/:id/fluxo, com `pode`, os motivos e o
// destino. Uma tela que decidisse por conta própria seria uma tela
// oferecendo um botão que o servidor recusa — e a pessoa clicando de
// novo achando que travou.
//
// O BOTÃO DESABILITADO CONTINUA DIZENDO POR QUÊ. Requisito não cumprido
// aparece com o caminho para resolvê-lo ("anexe a arte no card Arte").
// Botão cinza sem explicação é o que faz alguém ligar para o TI.
// ============================================================
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2, Circle, ArrowRight, Undo2, Wallet, Loader2,
  ShieldAlert, Lock, Landmark, ChevronRight, Factory, Hourglass, Info,
} from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import ParcelasDoPedido from './ParcelasDoPedido';

const dataHora = iso => (iso
  ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
  : '—');

export default function PainelFluxo({ v, id, fluxo }) {
  const qc = useQueryClient();
  const [caixa, setCaixa] = useState(null);   // 'pagamento' | 'voltar' | null
  const [texto, setTexto] = useState('');

  // As três telas que leem este pedido têm que concordar depois do passo:
  // a do vendedor, a do ERP e a lista de pedidos.
  const recarregar = () => {
    qc.invalidateQueries({ queryKey: ['pedido-vendedor', id] });
    qc.invalidateQueries({ queryKey: ['sale', id] });
    qc.invalidateQueries({ queryKey: ['sales'] });
    qc.invalidateQueries({ queryKey: ['pedidos-vendedor'] });
  };

  const fechar = () => { setCaixa(null); setTexto(''); };

  const avancar = useMutation({
    mutationFn: () => api.post(`/sales/${id}/fluxo/avancar`, {}),
    onSuccess: r => {
      toast.success(`Pedido em: ${r.fluxo?.status_label || 'próxima etapa'}`);
      recarregar();
    },
    onError: e => toast.error(e.error || 'Não foi possível avançar a etapa'),
  });

  /**
   * ENVIAR PARA A PRODUÇÃO.
   *
   * Não move o pedido de etapa: ele fica exatamente onde está. O que
   * muda é que a fábrica passa a vê-lo na fila dela e as etapas do chão
   * de fábrica destravam. É o momento em que alguém do comercial diz
   * "pode começar" — e ele fica no histórico com nome e hora.
   */
  const enviarProducao = useMutation({
    mutationFn: () => api.post(`/sales/${id}/producao/enviar`, {}),
    onSuccess: () => {
      toast.success('Pedido enviado para a produção — já aparece na fila da fábrica.');
      recarregar();
    },
    onError: e => toast.error(e.error || 'Não foi possível enviar para a produção'),
  });

  const voltar = useMutation({
    mutationFn: motivo => api.post(`/sales/${id}/fluxo/voltar`, { motivo }),
    onSuccess: r => {
      toast.success(`Etapa desfeita — o pedido voltou para ${r.fluxo?.status_label || 'a etapa anterior'}`);
      fechar(); recarregar();
    },
    onError: e => toast.error(e.error || 'Não foi possível voltar a etapa'),
  });

  if (!fluxo) return null;

  const { fase_atual: fase, acao, requisitos = [], pagamento, voltar: recuo } = fluxo;
  const producao = fluxo.producao || {};
  const ocupado = avancar.isPending || voltar.isPending || enviarProducao.isPending;

  /**
   * QUAL BOTÃO A SETA CHAMA.
   *
   * Ela não mora num botão: mora na AÇÃO DO MOMENTO.
   *
   * Na fase de Pagamento ela some enquanto o comprovante não estiver
   * anexado — e isso é o certo: o próximo passo ali não é um botão
   * deste painel, é subir o comprovante na parcela, logo acima.
   *
   * "Voltar etapa" nunca recebe a seta. Ele está sempre disponível e
   * nunca é o caminho para a frente — chamar para ele seria convidar a
   * desfazer.
   *
   * `null` quando nada aqui é clicável: falta a arte, falta a foto, ou a
   * etapa é de outra área. Aí a resposta não está neste painel, está na
   * lista de requisitos logo acima — e é para lá que o olho deve ir.
   */
  const chamada = (ocupado || caixa) ? null
    : producao.pode_enviar ? 'producao'
    : acao?.pode ? 'avancar'
    : null;

  // Pedido encerrado não tem próximo passo — só o registro de que chegou.
  if (fluxo.finalizado) {
    return (
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3"
        style={{ borderTop: `1px solid ${v.divider}` }}>
        <span className="flex items-center gap-2 text-sm font-semibold" style={{ color: '#4ade80' }}>
          <CheckCircle2 size={16} /> {fluxo.status_label}
        </span>
        {recuo?.pode && (
          <BotaoRecuo v={v} recuo={recuo} onAbrir={() => setCaixa('voltar')} />
        )}
        {caixa === 'voltar' && (
          <CaixaDeMotivo
            v={v} texto={texto} setTexto={setTexto} ocupado={ocupado}
            titulo={`Voltar o pedido para "${recuo?.para_label}"`}
            dica="O motivo fica no histórico do pedido, com o seu nome e a hora."
            rotulo="Voltar etapa"
            onCancelar={fechar}
            onConfirmar={() => voltar.mutate(texto)}
          />
        )}
      </div>
    );
  }

  return (
    <div style={{ borderTop: `1px solid ${v.divider}` }}>
      <div className="px-4 py-3 space-y-3">

        {/* ── Onde está ───────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[11px] uppercase tracking-wide" style={{ color: v.textSubtle }}>
            Etapa atual
          </span>
          <span className="text-sm font-semibold" style={{ color: v.textPrimary }}>
            {fase?.label || fluxo.status_label}
          </span>
          {fase?.area_label && (
            <span className="text-[11px] px-2 py-0.5 rounded-full"
              style={{ background: 'rgba(96,165,250,0.16)', color: '#93c5fd' }}>
              {fase.area_label}
            </span>
          )}
        </div>

        {fluxo.erro && (
          <p className="text-[12px] flex items-start gap-1.5" style={{ color: '#fbbf24' }}>
            <ShieldAlert size={13} className="shrink-0 mt-0.5" /> {fluxo.erro}
          </p>
        )}

        {/* ── ONDE ESTE PEDIDO ESTÁ EM RELAÇÃO À FÁBRICA ──────
            As três frases que faltavam. Um pedido parado numa fase da
            produção parecia pedido travado, e o comercial ligava para a
            fábrica perguntando o que tinha quebrado — nada tinha
            quebrado: ou ninguém tinha mandado, ou era a vez deles. */}
        {producao.precisa && (
          <div className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed flex items-start gap-2"
            style={{ background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.35)', color: v.textMuted }}>
            <Factory size={14} className="shrink-0 mt-0.5" style={{ color: '#60a5fa' }} />
            <span>
              <b style={{ color: v.textPrimary }}>Este pedido ainda não foi enviado para a produção.</b>{' '}
              Enquanto não for, ele não aparece na fila da fábrica e a etapa não anda.
            </span>
          </div>
        )}

        {producao.aguardando && (
          <div className="rounded-lg px-3 py-2.5 text-[12px] leading-relaxed flex items-start gap-2"
            style={{ background: 'rgba(251,191,36,0.10)', border: '1px solid rgba(251,191,36,0.35)', color: v.textMuted }}>
            <Hourglass size={14} className="shrink-0 mt-0.5" style={{ color: '#fbbf24' }} />
            <span>
              <b style={{ color: v.textPrimary }}>{producao.aguardando}</b>
              {/* Pedido anterior à regra não foi enviado por ninguém —
                  ele já estava na fábrica. Dizer "enviado em <data do
                  cadastro>" seria inventar um ato que não houve. */}
              {producao.em && !producao.legado && (
                <span className="block mt-0.5" style={{ color: v.textSubtle }}>
                  Enviado à produção {producao.por ? `por ${producao.por} ` : ''}em {dataHora(producao.em)}.
                </span>
              )}
            </span>
          </div>
        )}

        {/* Liso não passa pela serigrafia, e dizer isso evita a pergunta
            "cadê a revelação deste pedido?". */}
        {fluxo.personalizado === false && (
          <p className="text-[11.5px] flex items-start gap-1.5" style={{ color: v.textSubtle }}>
            <Info size={12} className="shrink-0 mt-0.5" />
            Pedido sem personalização — não passa por arte, vegetal nem revelação.
          </p>
        )}

        {/* ── O que falta ─────────────────────────────────── */}
        {requisitos.length > 0 && (
          <ul className="space-y-1.5">
            {requisitos.map(r => (
              <li key={r.chave} className="flex items-start gap-2 text-[13px]">
                {r.ok
                  ? <CheckCircle2 size={14} className="shrink-0 mt-0.5" style={{ color: '#4ade80' }} />
                  : <Circle size={14} className="shrink-0 mt-0.5"
                      style={{ color: r.obrigatorio === false ? '#fbbf24' : '#f87171' }} />}
                <span className="min-w-0">
                  <span style={{ color: r.ok ? v.textMuted : v.textPrimary }}>{r.label}</span>
                  {r.obrigatorio === false && !r.ok && (
                    <span className="text-[10px] ml-1.5 px-1.5 py-0.5 rounded-full"
                      style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>não trava</span>
                  )}
                  {!r.ok && r.como && (
                    <span className="block text-[11px] mt-0.5" style={{ color: v.textSubtle }}>{r.como}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* ── A liberação do pagamento ────────────────────── */}
        {pagamento?.liberado && pagamento.modo !== 'historico' && (
          <p className="text-[12px] flex items-center gap-1.5" style={{ color: '#4ade80' }}>
            {pagamento.modo === 'banco' ? <Landmark size={13} /> : <Wallet size={13} />}
            Pagamento liberado {pagamento.modo === 'banco' ? 'pelo banco' : 'manualmente'}
            {pagamento.user ? ` por ${pagamento.user}` : ''} · {dataHora(pagamento.at)}
            {pagamento.motivo ? ` · ${pagamento.motivo}` : ''}
          </p>
        )}

        {/* AS PARCELAS, com o comprovante de cada uma.
            Só na fase de pagamento: nas outras o dinheiro não é a
            pergunta, e a lista viraria ruído em treze telas. */}
        {naFaseDoPagamento && <ParcelasDoPedido id={id} v={v} />}

        {/* ── O que fazer ─────────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2">
          {/* NAO EXISTE MAIS "LIBERAR SEM COMPROVANTE". Ele era a
              saida para quando o dinheiro caiu e ninguem tinha o papel
              — e virou o caminho normal, porque era o unico botao
              aceso na fase. O que libera o pagamento agora e o
              comprovante da parcela, ali em cima. */}

          {producao.precisa && (
            <span className="inline-flex items-center gap-1">
              {chamada === 'producao' && <Seta cor={v.isDark ? '#60a5fa' : '#2563eb'} />}
              <button
                onClick={() => enviarProducao.mutate()}
                disabled={!producao.pode_enviar || ocupado}
                title={producao.pode_enviar
                  ? 'A fábrica passa a ver este pedido na fila dela'
                  : 'Enviar para a produção é do comercial (ou de um gerente).'}
                className="btn btn-sm disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ background: producao.pode_enviar ? '#2563eb' : 'transparent',
                         color: producao.pode_enviar ? 'white' : v.textSubtle,
                         border: producao.pode_enviar ? 'none' : `1px solid ${v.divider}` }}>
                {enviarProducao.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : producao.pode_enviar ? <Factory size={14} /> : <Lock size={14} />}
                Enviar para produção
              </button>
            </span>
          )}

          {acao && (
            <span className="inline-flex items-center gap-1">
              {chamada === 'avancar' && <Seta cor={v.isDark ? '#60a5fa' : '#2563eb'} />}
              <button
                onClick={() => avancar.mutate()}
                disabled={!acao.pode || ocupado}
                title={acao.pode ? `O pedido vai para: ${acao.destino_label}` : acao.motivos.join(' ')}
                className="btn btn-sm disabled:opacity-45 disabled:cursor-not-allowed"
                style={{ background: acao.pode ? '#2563eb' : 'transparent',
                         color: acao.pode ? 'white' : v.textSubtle,
                         border: acao.pode ? 'none' : `1px solid ${v.divider}` }}>
                {avancar.isPending
                  ? <Loader2 size={14} className="animate-spin" />
                  : acao.autorizado ? <ArrowRight size={14} /> : <Lock size={14} />}
                {acao.label}
              </button>
            </span>
          )}

          {recuo?.pode && <BotaoRecuo v={v} recuo={recuo} onAbrir={() => setCaixa('voltar')} />}
        </div>

        {/* Para onde o pedido vai — dito antes de clicar, não depois. */}
        {acao && (
          <p className="text-[11px]" style={{ color: v.textSubtle }}>
            {acao.pode
              ? <>Ao confirmar, o pedido passa para <b style={{ color: v.textMuted }}>{acao.destino_label}</b>
                  {acao.proxima_fase ? ` (fase ${acao.proxima_fase})` : ''}.</>
              : acao.motivos.join(' ')}
          </p>
        )}
      </div>

      {/* ── As duas caixas que pedem justificativa ───────── */}
      {caixa === 'voltar' && (
        <CaixaDeMotivo
          v={v} texto={texto} setTexto={setTexto} ocupado={ocupado}
          titulo={`Voltar o pedido para "${recuo?.para_label}"`}
          dica="O motivo fica no histórico do pedido, com o seu nome e a hora."
          exemplo="Ex.: arte aprovada por engano, cliente pediu troca"
          rotulo="Voltar etapa"
          onCancelar={fechar}
          onConfirmar={() => voltar.mutate(texto)}
        />
      )}
    </div>
  );
}

/**
 * As três setas que chamam para o botão.
 *
 * Ficam à ESQUERDA dele, apontando para ele — à direita estariam
 * apontando para o vazio. A cor é a do botão que elas chamam: verde
 * para liberar o pagamento, azul para avançar a etapa. É o que amarra
 * uma coisa na outra quando os dois botões estão na mesma linha.
 */
function Seta({ cor }) {
  return (
    <span className="fluxo-chamada" aria-hidden="true" style={{ color: cor }}>
      <ChevronRight size={15} strokeWidth={3} />
      <ChevronRight size={15} strokeWidth={3} />
      <ChevronRight size={15} strokeWidth={3} />
    </span>
  );
}

function BotaoRecuo({ v, recuo, onAbrir }) {
  return (
    <button onClick={onAbrir} className="btn btn-sm"
      title={`Devolve o pedido para "${recuo.para_label}" — com motivo, no histórico`}
      style={{ background: 'transparent', color: v.textMuted, border: `1px solid ${v.divider}` }}>
      <Undo2 size={14} /> Voltar etapa
    </button>
  );
}

/**
 * A caixa que pede o porquê.
 *
 * Ela não é enfeite: liberar dinheiro sem extrato e desfazer etapa já
 * marcada são as duas decisões deste painel que alguém vai precisar
 * explicar depois. Sem o campo, o histórico registraria QUE aconteceu e
 * perderia justamente o POR QUE — que é o que se procura no dia em que
 * um pedido entrou em produção sem o pagamento ter caído.
 */
function CaixaDeMotivo({ v, titulo, dica, exemplo, rotulo, texto, setTexto, ocupado, onCancelar, onConfirmar }) {
  return (
    <div className="px-4 py-3 space-y-2" style={{ borderTop: `1px solid ${v.divider}`, background: v.surface }}>
      <p className="text-sm font-semibold" style={{ color: v.textPrimary }}>{titulo}</p>
      <p className="text-[11px]" style={{ color: v.textSubtle }}>{dica}</p>
      <textarea
        value={texto} onChange={e => setTexto(e.target.value)} rows={2} autoFocus
        placeholder={exemplo}
        style={{ ...v.control, width: '100%', resize: 'vertical' }} />
      <div className="flex flex-wrap gap-2">
        <button onClick={onConfirmar} disabled={ocupado || !texto.trim()}
          className="btn btn-sm disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ background: '#2563eb', color: 'white' }}>
          {ocupado ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} {rotulo}
        </button>
        <button onClick={onCancelar} className="btn btn-sm"
          style={{ background: 'transparent', color: v.textMuted, border: `1px solid ${v.divider}` }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
