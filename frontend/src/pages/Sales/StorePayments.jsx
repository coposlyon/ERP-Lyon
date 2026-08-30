import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Wallet, CheckCircle2, XCircle, Clock, ExternalLink, Copy, FileImage, AlertTriangle, RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import Modal from '@/components/UI/Modal';
import Quotes from '@/pages/Quotes/Quotes';
import { useAuth } from '@/contexts/AuthContext';

const fmt = v => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const dt = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

// ORÇAMENTOS ENTROU AQUI, depois de Cancelados.
//
// As quatro abas respondem a mesma pergunta em quatro tempos: o que
// esperamos receber, o que recebemos, o que não vai vir, e o que ainda
// nem virou pedido. Orçamento era um item de menu à parte, e como item
// à parte obrigava a escolher entre duas telas antes de saber qual das
// duas tinha a resposta.
//
// A aba não pede status ao servidor de pagamentos: ela é a própria tela
// de Orçamentos morando aqui dentro.
const ABAS = [
  { key: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { key: 'pago',                 label: 'Confirmados' },
  { key: 'cancelado',            label: 'Cancelados' },
  { key: 'orcamentos',           label: 'Orçamentos' },
];

const ehOrcamentos = a => a === 'orcamentos';

export default function StorePayments() {
  const qc = useQueryClient();
  const { hasModule, isAdmin } = useAuth();
  // Quem não tem o módulo de orçamentos não ganha a aba: ela abriria uma
  // lista que o servidor recusa, e recusa em silêncio parece defeito.
  const podeOrcamentos = isAdmin || hasModule('quotes');
  const abas = ABAS.filter(a => !ehOrcamentos(a.key) || podeOrcamentos);
  const [aba, setAba] = useState('aguardando_pagamento');
  const [aberto, setAberto] = useState(null);     // pedido no modal de detalhe
  const [cancelando, setCancelando] = useState(null);   // reprovar
  const [confirmando, setConfirmando] = useState(null); // confirmar
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState(false);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['store-payments', aba],
    queryFn: () => api.get(`/store-payments?status=${aba}`),
    // Orçamento não é status de pagamento: naquela aba não há o que
    // perguntar a esta rota.
    enabled: !ehOrcamentos(aba),
    refetchInterval: aba === 'aguardando_pagamento' ? 60000 : false,
  });
  const pedidos = data?.data || [];

  async function confirmar(p) {
    setBusy(true);
    try {
      const r = await api.post(`/store-payments/${p.id}/confirmar`);
      toast.success(r.number ? `Pedido nº ${r.number} liberado para o Comercial!` : 'Pedido liberado para o Comercial!');
      if (r.lancamento === 'falhou') {
        toast('O recebimento não entrou no Financeiro — lance a mão.', { icon: '⚠️' });
      }
      setAberto(null); setConfirmando(null);
      qc.invalidateQueries({ queryKey: ['store-payments'] });
    } catch (e) {
      toast.error(e.error || 'Não foi possível confirmar');
    } finally { setBusy(false); }
  }

  async function cancelar() {
    setBusy(true);
    try {
      await api.post(`/store-payments/${cancelando.id}/cancelar`, { reason: motivo.trim() || null });
      toast.success('Pedido reprovado');
      setCancelando(null); setMotivo(''); setAberto(null);
      qc.invalidateQueries({ queryKey: ['store-payments'] });
    } catch (e) {
      toast.error(e.error || 'Não foi possível reprovar');
    } finally { setBusy(false); }
  }

  function copiarPix(p) {
    navigator.clipboard.writeText(p.pix_copy_paste || '')
      .then(() => toast.success('Código PIX copiado'))
      .catch(() => toast.error('Não consegui copiar'));
  }

  return (
    <div className="space-y-4">
      <div className="page-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-lg flex items-center justify-center">
            <Wallet size={18} className="text-emerald-600" />
          </div>
          <div>
            <h1 className="page-title">Pagamentos da Loja</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {ehOrcamentos(aba)
                ? 'Os orçamentos abertos — o que ainda nem virou pedido.'
                : 'O PIX cai direto na conta. Confirme aqui e o pedido entra em Pedidos de Venda.'}
            </p>
          </div>
        </div>
        {!ehOrcamentos(aba) && (
          <button onClick={() => refetch()} className="btn-secondary">
            <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} /> Atualizar
          </button>
        )}
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {abas.map(a => (
          <button key={a.key} onClick={() => setAba(a.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${aba === a.key ? 'bg-gray-900 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-gray-300'}`}>
            {a.label}
          </button>
        ))}
      </div>

      {ehOrcamentos(aba) ? (
        <Quotes embutido />
      ) : isLoading ? (
        <div className="card p-10 text-center text-gray-400">Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div className="card p-10 text-center">
          <Wallet size={36} className="text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">
            {aba === 'aguardando_pagamento' ? 'Nenhum pedido esperando pagamento.' : 'Nada por aqui.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {pedidos.map(p => {
            const itens = Array.isArray(p.items) ? p.items : [];
            return (
              <div key={p.id} className="card p-4 flex flex-wrap items-center gap-4">
                <div className="w-14 h-16 bg-gray-50 rounded-xl flex items-center justify-center overflow-hidden shrink-0">
                  {itens[0]?.preview
                    ? <img src={itens[0].preview} alt="" className="w-full h-full object-contain" />
                    : <Wallet size={18} className="text-gray-300" />}
                </div>

                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-bold text-gray-900">{p.CLIENTES?.name || p.customer?.name || 'Cliente'}</p>
                    {/* ANEXOU COMPROVANTE É OUTRA COISA de avisou que
                        pagou: um é documento para conferir, o outro é
                        recado. Quem está na fila precisa saber de
                        relance qual dos dois tem na mão. */}
                    {p.tem_comprovante && p.status === 'aguardando_pagamento' ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <FileImage size={11} /> cliente anexou comprovante
                      </span>
                    ) : p.paid_notified_at && p.status === 'aguardando_pagamento' ? (
                      <span className="text-[11px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                        cliente avisou que pagou
                      </span>
                    ) : null}
                    {p.expirado && (
                      <span className="text-[11px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <AlertTriangle size={11} /> prazo vencido
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500">
                    {itens.length} {itens.length === 1 ? 'item' : 'itens'} · {p.customer?.phone || p.CLIENTES?.phone || 'sem telefone'}
                  </p>
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Clock size={11} /> pedido em {dt(p.created_at)}
                    {p.confirmed_at && ` · confirmado por ${p.confirmed_by_name || 'equipe'} em ${dt(p.confirmed_at)}`}
                  </p>
                </div>

                <div className="text-right">
                  <p className="text-xl font-extrabold text-gray-900">{fmt(p.total)}</p>
                  {p.freight > 0 && <p className="text-xs text-gray-400">frete {fmt(p.freight)}</p>}
                </div>

                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setAberto(p)} className="btn-secondary text-sm">Detalhes</button>
                  {p.status === 'aguardando_pagamento' && (
                    <>
                      {/* OS DOIS PEDEM CONFIRMAÇÃO. Confirmar cria a
                          venda e o recebimento; reprovar diz "não" a um
                          documento que alguém mandou. Nenhum dos dois é
                          coisa para um toque errado resolver. */}
                      <button onClick={() => setConfirmando(p)} disabled={busy}
                        className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors">
                        <CheckCircle2 size={15} /> Confirmar pedido
                      </button>
                      <button onClick={() => { setCancelando(p); setMotivo(''); }}
                        className="border border-red-200 text-red-600 hover:bg-red-50 font-semibold text-sm px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors"
                        title="Reprovar o pedido — sai da fila e não vira venda">
                        <XCircle size={15} /> Reprovar pedido
                      </button>
                    </>
                  )}
                  {p.sale_id && (
                    <Link to={`/sales/${p.sale_id}`} className="btn-secondary text-sm">
                      <ExternalLink size={14} /> Ver venda
                    </Link>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detalhe */}
      <Modal isOpen={!!aberto} onClose={() => setAberto(null)} title="Pedido do site" size="lg">
        {aberto && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <Info label="Cliente" value={aberto.CLIENTES?.name || aberto.customer?.name} />
              <Info label="Telefone" value={aberto.customer?.phone || aberto.CLIENTES?.phone} />
              <Info label="E-mail" value={aberto.customer?.email || aberto.CLIENTES?.email} />
              <Info label="Data do evento" value={aberto.event_date ? String(aberto.event_date).split('-').reverse().join('/') : null} />
            </div>

            <div className="border border-gray-100 rounded-xl divide-y divide-gray-100">
              {(aberto.items || []).map((i, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3">
                  <div className="w-12 h-14 bg-gray-50 rounded-lg flex items-center justify-center overflow-hidden shrink-0">
                    {i.preview ? <img src={i.preview} alt="" className="w-full h-full object-contain" /> : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-gray-800 text-sm leading-tight">{i.product_name}</p>
                    <p className="text-xs text-gray-400">{i.quantity} × {fmt(i.unit_price)}</p>
                  </div>
                  <p className="font-bold text-gray-900 text-sm">{fmt(i.quantity * i.unit_price)}</p>
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center">
              <span className="font-bold text-gray-700">Total</span>
              <span className="text-2xl font-extrabold text-gray-900">{fmt(aberto.total)}</span>
            </div>

            {aberto.notes && <p className="text-xs text-gray-500 whitespace-pre-line bg-gray-50 rounded-xl p-3">{aberto.notes}</p>}

            {/* O LINK É ASSINADO E EXPIRA. O comprovante mora no bucket
                privado — traz nome do pagador, banco e valor — e o que
                chega aqui é um endereço com hora para acabar. */}
            {aberto.receipt_link && (
              <a href={aberto.receipt_link} target="_blank" rel="noreferrer"
                className="btn-secondary w-full justify-center"><FileImage size={15} /> Ver comprovante enviado</a>
            )}

            {aberto.status === 'aguardando_pagamento' && (
              <>
                <button onClick={() => copiarPix(aberto)} className="btn-secondary w-full justify-center">
                  <Copy size={15} /> Copiar o PIX deste pedido
                </button>
                <div className="bg-amber-50 border border-amber-100 rounded-xl p-3 text-xs text-amber-800">
                  Confira no extrato da conta se entrou <b>{fmt(aberto.total)}</b> de <b>{aberto.customer?.name}</b>.
                  Só confirme depois de ver o dinheiro na conta — confirmar cria a venda e o recebimento.
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button onClick={() => setConfirmando(aberto)} disabled={busy}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    <CheckCircle2 size={16} /> Confirmar pedido
                  </button>
                  <button onClick={() => { setCancelando(aberto); setMotivo(''); }} disabled={busy}
                    className="flex-1 border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60 font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors">
                    <XCircle size={16} /> Reprovar pedido
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      {/* ── CONFIRMAR ────────────────────────────────────────
          Confirmar não é marcar uma caixinha: cria a VENDA, cria o
          RECEBIMENTO no Financeiro e solta o pedido para a produção.
          Desfazer isso depois é trabalho de três telas. Por isso a
          pergunta vem com o valor e o nome do pagador escritos — é
          exatamente o que a pessoa tem que ter achado no extrato. */}
      <Modal isOpen={!!confirmando} onClose={() => !busy && setConfirmando(null)}
        title="Confirmar pedido" size="sm">
        {confirmando && (
          <div className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-gray-700">
              Confirme só depois de <b>ver o dinheiro na conta</b>. Confirmar cria a venda,
              lança o recebimento no Financeiro e libera o pedido para a produção.
            </div>
            <div className="rounded-xl border border-gray-200 p-3 space-y-1 text-sm">
              <p className="flex justify-between gap-3">
                <span className="text-gray-500">Cliente</span>
                <b className="text-gray-900 text-right">{confirmando.CLIENTES?.name || confirmando.customer?.name || '—'}</b>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-gray-500">Valor</span>
                <b className="text-gray-900">{fmt(confirmando.total)}</b>
              </p>
              <p className="flex justify-between gap-3">
                <span className="text-gray-500">Comprovante</span>
                <b className={confirmando.tem_comprovante ? 'text-emerald-600' : 'text-gray-400'}>
                  {confirmando.tem_comprovante ? 'anexado pelo cliente' : 'não anexado'}
                </b>
              </p>
            </div>
            {confirmando.receipt_link && (
              <a href={confirmando.receipt_link} target="_blank" rel="noreferrer"
                className="btn-secondary w-full justify-center">
                <FileImage size={15} /> Ver o comprovante antes de confirmar
              </a>
            )}
            <div className="flex gap-2">
              <button onClick={() => setConfirmando(null)} disabled={busy} className="btn-secondary flex-1">
                Voltar
              </button>
              <button onClick={() => confirmar(confirmando)} disabled={busy}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-semibold py-2 rounded-xl transition-colors">
                {busy ? 'Liberando…' : 'Sim, confirmar'}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── REPROVAR ─────────────────────────────────────────
          Com comprovante anexado o motivo é OBRIGATÓRIO (o servidor
          também exige): o cliente mandou um documento e vai levar um
          "não" — sem o porquê, quem atender o telefone dele não tem o
          que dizer, e ele não sabe o que corrigir. */}
      <Modal isOpen={!!cancelando} onClose={() => !busy && setCancelando(null)}
        title="Reprovar pedido" size="sm">
        {cancelando && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              O pedido sai da fila e <b>não vira venda</b>. Use quando o cliente desistiu, o PIX
              não chegou ou o comprovante não confere.
            </p>
            {cancelando.tem_comprovante && (
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-gray-700">
                Este cliente <b>anexou um comprovante</b>. Diga por que ele não confere — é o que
                o atendimento vai repetir para ele.
              </div>
            )}
            <div>
              <label className="label">
                Motivo {cancelando.tem_comprovante ? '(obrigatório)' : '(opcional)'}
              </label>
              <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)}
                placeholder={cancelando.tem_comprovante
                  ? 'Ex.: o valor do comprovante não bate com o pedido'
                  : 'Ex.: cliente desistiu'} autoFocus />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setCancelando(null)} disabled={busy} className="btn-secondary flex-1">
                Voltar
              </button>
              <button onClick={cancelar}
                disabled={busy || (cancelando.tem_comprovante && !motivo.trim())}
                className="flex-1 bg-red-600 hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold py-2 rounded-xl transition-colors">
                {busy ? 'Reprovando…' : 'Sim, reprovar'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-gray-700">{value || '—'}</p>
    </div>
  );
}
