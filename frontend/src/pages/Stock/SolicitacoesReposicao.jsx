// ============================================================
// AS SOLICITAÇÕES DE REPOSIÇÃO, E O QUE O FORNECEDOR RESPONDEU.
//
// A reposição era um monólogo: montava-se a lista, mandava no WhatsApp
// e esperava. Quando a mercadoria chegava, alguém dava baixa da lista
// INTEIRA — inclusive do que o fornecedor não tinha e nunca mandou. O
// estoque passava a acreditar em caixas que não existem.
//
// Esta tela é o outro lado. Cada solicitação tem um endereço próprio
// para mandar ao fornecedor; ele confirma quem é, diz de cada item o
// que TEM, anexa a cotação. Aí a linha muda para "Fornecedor
// respondeu", e a baixa passa a ser do que ele confirmou.
//
// A ORDEM DA LISTA É A ORDEM DA ATENÇÃO: o que ele respondeu vem
// primeiro, porque é o que espera alguém daqui. Depois o que ainda está
// com ele, e por último o que já acabou.
// ============================================================
import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Link2, Copy, CheckCircle2, Loader2, Paperclip, Clock, PackageCheck, Inbox, MessageCircle,
  Pencil, Trash2, X, Ban,
} from 'lucide-react';
import api from '@/lib/api';

const dataBr = v => (v ? new Date(v).toLocaleDateString('pt-BR') : '—');

// A régua de estados. Cada um diz de quem é a vez — que é a única coisa
// que alguém olhando esta tela precisa saber.
const ESTADOS = {
  respondido: { ordem: 0, rotulo: 'Fornecedor respondeu', cor: 'text-green-600',  Icone: PackageCheck, dica: 'Confira e dê baixa' },
  pending:    { ordem: 1, rotulo: 'Aguardando fornecedor', cor: 'text-amber-600', Icone: Clock,        dica: 'Mande o link para ele' },
  completed:  { ordem: 2, rotulo: 'Concluída',             cor: 'text-gray-400',  Icone: CheckCircle2, dica: 'Estoque já atualizado' },
  cancelled:  { ordem: 3, rotulo: 'Cancelada',             cor: 'text-gray-400',  Icone: Ban,          dica: 'O link parou de funcionar' },
};

export default function SolicitacoesReposicao() {
  const qc = useQueryClient();
  const [linkDe, setLinkDe] = useState(null);   // { id, url }
  // Edição de UMA solicitação por vez: { id, qtds: { linha: texto } }.
  // Abrir várias ao mesmo tempo é convite para salvar a errada.
  const [editando, setEditando] = useState(null);

  const { data, isLoading } = useQuery({
    queryKey: ['reposicao-solicitacoes'],
    queryFn: () => api.get('/stock/replenishment-orders'),
  });

  const lista = useMemo(() => {
    const arr = data?.data || [];
    return [...arr].sort((a, b) => {
      const pa = ESTADOS[a.status]?.ordem ?? 9;
      const pb = ESTADOS[b.status]?.ordem ?? 9;
      if (pa !== pb) return pa - pb;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }, [data]);

  /**
   * O ENDEREÇO DO FORNECEDOR — o mesmo, sempre.
   *
   * O botão dizia "Novo link" e era exatamente isso: cada clique
   * trocava o token e MATAVA o endereço já enviado. Quem mandava o link
   * e depois abria a tela para conferir derrubava o próprio envio, e o
   * fornecedor lia "Link não encontrado". Agora o servidor devolve o
   * link vivo; trocar de verdade só com `renovar`, que é o que se faz
   * quando o endereço vazou.
   */
  const gerarLink = useMutation({
    mutationFn: ({ id, renovar }) =>
      api.post(`/stock/replenishment-orders/${id}/link`, { renovar: !!renovar }),
    onSuccess: (r, { id, renovar }) => {
      setLinkDe({ id, url: r.url, whatsapp: r.whatsapp, temTelefone: r.tem_telefone });
      qc.invalidateQueries({ queryKey: ['reposicao-solicitacoes'] });
      navigator.clipboard?.writeText(r.url)
        .then(() => toast.success(renovar ? 'Link trocado e copiado' : 'Link copiado'))
        .catch(() => toast('Link abaixo — copie à mão', { icon: '🔗' }));
    },
    onError: e => toast.error(e.error || 'Não consegui gerar o link'),
  });

  const salvarEdicao = useMutation({
    mutationFn: ({ id, itens }) => api.put(`/stock/replenishment-orders/${id}`, { itens }),
    onSuccess: () => {
      toast.success('Solicitação atualizada');
      setEditando(null);
      qc.invalidateQueries({ queryKey: ['reposicao-solicitacoes'] });
      qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
    },
    onError: e => toast.error(e.error || 'Não consegui salvar'),
  });

  const cancelar = useMutation({
    mutationFn: id => api.post(`/stock/replenishment-orders/${id}/cancel`),
    onSuccess: () => {
      toast.success('Solicitação cancelada — o link do fornecedor parou de funcionar');
      qc.invalidateQueries({ queryKey: ['reposicao-solicitacoes'] });
      qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
    },
    onError: e => toast.error(e.error || 'Não consegui cancelar'),
  });

  /**
   * Abrir a edição já com as quantidades atuais dentro.
   *
   * O caso comum é mexer em UM número; começar com os campos vazios
   * obrigaria a redigitar a lista inteira para mudar uma linha.
   */
  function abrirEdicao(p) {
    const qtds = {};
    (p.products || []).forEach((x, i) => {
      qtds[i] = String(Math.abs(Number(x.qty_to_replenish ?? 0)) || 0);
    });
    setEditando({ id: p.id, qtds });
  }

  function confirmarCancelamento(p) {
    const aviso = p.respondido_em
      ? `Cancelar a solicitação para ${p.supplier_name}?\n\nO fornecedor JÁ RESPONDEU esta solicitação. `
        + 'Cancelar descarta a resposta dele e mata o link.'
      : `Cancelar a solicitação para ${p.supplier_name}?\n\n`
        + 'O link que você mandou para ele para de funcionar.';
    // eslint-disable-next-line no-alert
    if (window.confirm(aviso)) cancelar.mutate(p.id);
  }

  const darBaixa = useMutation({
    mutationFn: id => api.post(`/stock/replenishment-orders/${id}/complete`),
    onSuccess: () => {
      toast.success('Estoque atualizado com o que o fornecedor confirmou');
      qc.invalidateQueries({ queryKey: ['reposicao-solicitacoes'] });
      qc.invalidateQueries({ queryKey: ['replenishment-orders-pending'] });
      qc.invalidateQueries({ queryKey: ['stock-report'] });
    },
    onError: e => toast.error(e.error || 'Não consegui dar baixa'),
  });

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" /></div>;
  }

  if (!lista.length) {
    return (
      <div className="text-center py-12">
        <Inbox size={32} className="mx-auto text-gray-300 mb-3" />
        <p className="text-sm text-gray-500">Nenhuma solicitação de reposição ainda.</p>
        <p className="text-xs text-gray-400 mt-1">
          Elas nascem na aba <b>Reposição</b>, quando você solicita a um fornecedor.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {lista.map(p => {
        const est = ESTADOS[p.status] || ESTADOS.pending;
        const respondeu = Array.isArray(p.resposta) && p.resposta.length > 0;
        // O que vai entrar no estoque: o que ele confirmou ter.
        const linhas = respondeu
          ? p.resposta
          : (p.products || []).map((x, i) => ({
              linha: i, nome: x.name || x.nome, codigo: x.code || x.codigo,
              pedido: Math.abs(Number(x.qty_to_replenish ?? 0)) || 0, tem: null,
            }));
        const totalTem = respondeu ? p.resposta.reduce((s, r) => s + (Number(r.tem) || 0), 0) : null;

        return (
          <div key={p.id} className="rounded-xl border border-gray-200 overflow-hidden">

            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
              <div className="min-w-0">
                <p className="font-semibold text-gray-800 text-sm break-words">{p.supplier_name}</p>
                <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1.5">
                  <est.Icone size={13} className={est.cor} />
                  <span className={est.cor}>{est.rotulo}</span>
                  <span className="text-gray-300">·</span>
                  <span>{est.dica}</span>
                  {p.protocol_number && (
                    <><span className="text-gray-300">·</span><span>controle {p.protocol_number}</span></>
                  )}
                  <span className="text-gray-300">·</span>
                  <span>{dataBr(p.created_at)}</span>
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {p.cotacao_url && (
                  <a href={p.cotacao_url} target="_blank" rel="noreferrer"
                    className="btn-secondary text-xs">
                    <Paperclip size={13} /> Cotação
                  </a>
                )}
                {/* Concluída e cancelada não se editam: numa o estoque
                    já entrou, na outra o link já morreu. */}
                {p.status !== 'completed' && p.status !== 'cancelled' && (
                  <>
                    {/* MANDAR NO WHATSAPP É O BOTÃO PRINCIPAL — é o que
                        a pessoa veio fazer. O link já existe desde que a
                        solicitação nasceu; copiar endereço à mão, abrir
                        o WhatsApp, achar o contato e escrever o recado
                        eram quatro passos para cada reposição, e é aí
                        que o pedido ficava parado um dia. */}
                    <button type="button"
                      onClick={() => gerarLink.mutate({ id: p.id }, {
                        onSuccess: r => window.open(r.whatsapp, '_blank', 'noopener'),
                      })}
                      disabled={gerarLink.isPending}
                      title="Abre o WhatsApp do fornecedor com o recado e o link prontos"
                      className="btn-primary text-xs">
                      {gerarLink.isPending
                        ? <Loader2 size={13} className="animate-spin" />
                        : <MessageCircle size={13} />}
                      Mandar no WhatsApp
                    </button>
                    <button type="button" onClick={() => gerarLink.mutate({ id: p.id })}
                      disabled={gerarLink.isPending}
                      title="Mostra e copia o mesmo endereço, sem trocá-lo"
                      className="btn-secondary text-xs">
                      <Link2 size={13} /> Copiar link
                    </button>
                    <button type="button"
                      onClick={() => (editando?.id === p.id ? setEditando(null) : abrirEdicao(p))}
                      title="Mudar as quantidades ou tirar itens"
                      className="btn-secondary text-xs">
                      {editando?.id === p.id ? <X size={13} /> : <Pencil size={13} />}
                      {editando?.id === p.id ? 'Fechar' : 'Editar'}
                    </button>
                    <button type="button" onClick={() => confirmarCancelamento(p)}
                      disabled={cancelar.isPending}
                      title="Cancela a solicitação e derruba o link do fornecedor"
                      className="btn-secondary text-xs text-red-500 hover:border-red-300">
                      <Ban size={13} /> Cancelar
                    </button>
                  </>
                )}
                {respondeu && p.status !== 'completed' && (
                  <button type="button" onClick={() => darBaixa.mutate(p.id)}
                    disabled={darBaixa.isPending}
                    className="btn-primary text-xs">
                    {darBaixa.isPending
                      ? <Loader2 size={13} className="animate-spin" />
                      : <CheckCircle2 size={13} />}
                    Confirmar e dar baixa
                  </button>
                )}
              </div>
            </div>

            {/* O link recém-gerado fica visível: o `clipboard` falha em
                navegador sem permissão, e aí a pessoa precisa do texto
                para copiar à mão. */}
            {linkDe?.id === p.id && (
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input readOnly value={linkDe.url} onFocus={e => e.target.select()}
                    className="flex-1 bg-transparent text-xs font-mono text-gray-600 outline-none" />
                  <button type="button" title="Copiar"
                    onClick={() => navigator.clipboard?.writeText(linkDe.url)
                      .then(() => toast.success('Copiado'))
                      .catch(() => toast.error('Copie à mão'))}
                    className="text-gray-400 hover:text-primary-600">
                    <Copy size={14} />
                  </button>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-[11px] text-gray-500">
                  {!linkDe.temTelefone && (
                    <span className="text-amber-600">
                      Fornecedor sem telefone no cadastro — o WhatsApp abre para você escolher o contato.
                    </span>
                  )}
                  {/* TROCAR O LINK É DESTRUTIVO e por isso fica escondido
                      aqui embaixo, dito por inteiro: quem clica precisa
                      saber que derruba o endereço que já mandou. */}
                  <button type="button"
                    onClick={() => {
                      if (!window.confirm('Trocar o link derruba o endereço que você já enviou ao fornecedor. Continuar?')) return;
                      gerarLink.mutate({ id: p.id, renovar: true });
                    }}
                    className="underline hover:text-red-600">
                    trocar o link (derruba o que já foi enviado)
                  </button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 uppercase">Produto</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-24">Pedimos</th>
                    <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 uppercase w-28">Ele tem</th>
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-4 py-2">
                        <p className="text-sm text-gray-800 break-words">{l.nome}</p>
                        {l.codigo && <p className="text-[11px] text-gray-400">{l.codigo}</p>}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {editando?.id === p.id ? (
                          <input type="number" min="0" inputMode="numeric"
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-center text-sm focus:border-primary-400 focus:outline-none"
                            value={editando.qtds[i] ?? ''}
                            onChange={e => setEditando(ed => ({
                              ...ed, qtds: { ...ed.qtds, [i]: e.target.value },
                            }))} />
                        ) : (
                          <span className="text-sm text-gray-500">{l.pedido}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {/* Em edição, o lugar do "ele tem" é o botão de
                            tirar a linha: zerar a quantidade some com o
                            item, e o lixo diz isso sem precisar
                            adivinhar. */}
                        {editando?.id === p.id
                          ? (
                            <button type="button" title="Tirar este item da solicitação"
                              onClick={() => setEditando(ed => ({
                                ...ed, qtds: { ...ed.qtds, [i]: '0' },
                              }))}
                              className="text-gray-300 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          )
                          : l.tem == null
                          ? <span className="text-gray-300">—</span>
                          /* ZERO EM VERMELHO. "Não tenho" é a informação
                             mais importante desta tela: é ela que impede
                             a baixa de uma caixa que não vem. */
                          : <span className={`text-sm font-semibold ${Number(l.tem) === 0 ? 'text-red-500' : 'text-green-600'}`}>
                              {l.tem}
                            </span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                {totalTem != null && (
                  <tfoot>
                    <tr className="border-t border-gray-100">
                      <td className="px-4 py-2 text-xs text-gray-500" colSpan={2}>
                        Vai entrar no estoque
                      </td>
                      <td className="px-4 py-2 text-center text-sm font-bold text-gray-800">
                        {totalTem} un
                      </td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {editando?.id === p.id && (
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-gray-100 bg-gray-50">
                <p className="text-xs text-gray-500">
                  Item com quantidade <b>0</b> sai da solicitação.
                  {p.respondido_em && (
                    <> O fornecedor já respondeu — salvar <b>descarta a resposta</b> e
                      volta o pedido para “aguardando”.</>
                  )}
                </p>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" onClick={() => setEditando(null)} className="btn-secondary text-xs">
                    <X size={13} /> Descartar
                  </button>
                  <button type="button" disabled={salvarEdicao.isPending}
                    onClick={() => salvarEdicao.mutate({
                      id: p.id,
                      itens: Object.entries(editando.qtds).map(([linha, qtd]) => ({
                        linha: Number(linha), qtd: Number(qtd) || 0,
                      })),
                    })}
                    className="btn-primary text-xs">
                    {salvarEdicao.isPending
                      ? <Loader2 size={13} className="animate-spin" />
                      : <CheckCircle2 size={13} />}
                    Salvar
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
