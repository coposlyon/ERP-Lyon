// ============================================================
// Editar um pedido que já está fechado.
//
// O caso de todo dia: a cliente fechou 100 copos e ligou pedindo mais
// 20. Sem esta tela, a saída era cancelar e refazer — outro número de
// pedido, outro PV mandado para ela, e a produção já andada perdida.
//
// A CONTA APARECE ENQUANTO SE DIGITA. Mexer na quantidade de um pedido
// fechado é mexer no que o cliente deve, e quem está com ele no telefone
// precisa poder dizer o valor na hora — não descobrir depois de salvar.
// Por isso o rodapé mostra o total de antes, o de agora e a diferença, e
// se recalcula a cada tecla.
//
// SÓ A DIFERENÇA É COBRADA. Os 20 copos a mais viram um lançamento novo
// no contas a receber; o que já foi pago fica onde está. Quem faz essa
// conta é o servidor — aqui só se mostra qual vai ser.
//
// PEDE A SENHA, e não a sessão aberta. É a mesma trava da exclusão e da
// troca de arte: tela destravada em cima do balcão não autoriza mudar
// valor de pedido.
// ============================================================
import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Loader2, ShieldCheck, Plus, Trash2, Undo2, Search,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import Modal from '@/components/UI/Modal';
import api from '@/lib/api';

const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function EditarPedidoModal({ pedido, onClose, onConfirmar, salvando }) {
  // `quantidades` guarda só o que foi DIGITADO; o que não foi mexido não
  // entra no que vai para o servidor. Mandar as linhas intactas junto
  // faria o servidor reescrever item que ninguém tocou.
  const [quantidades, setQuantidades] = useState({});
  const [removidos, setRemovidos] = useState({});
  const [novos, setNovos] = useState([]);
  const [busca, setBusca] = useState('');
  const [motivo, setMotivo] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');

  const aberto = !!pedido;

  useEffect(() => {
    if (!aberto) {
      setQuantidades({}); setRemovidos({}); setNovos([]);
      setBusca(''); setMotivo(''); setEmail(''); setSenha('');
    }
  }, [aberto]);

  // A busca de produto só sai quando alguém digita: abrir o modal não é
  // motivo para puxar o catálogo inteiro.
  const { data: achados, isFetching } = useQuery({
    queryKey: ['editar-pedido-produtos', busca],
    queryFn: () => api.get(`/products?limit=20&is_active=true&search=${encodeURIComponent(busca)}`),
    enabled: aberto && busca.trim().length >= 2,
  });

  const itens = pedido?.itens || [];

  const conta = useMemo(() => {
    const totalAntes = Number(pedido?.total) || 0;
    const frete = Number(pedido?.freight) || 0;
    const desconto = Number(pedido?.discount) || 0;

    let produtos = 0;
    for (const i of itens) {
      if (removidos[i.id]) continue;
      const qtd = quantidades[i.id] != null ? Number(quantidades[i.id]) || 0 : Number(i.quantidade) || 0;
      produtos += qtd * (Number(i.valor_unitario) || 0);
    }
    for (const n of novos) produtos += (Number(n.quantidade) || 0) * (Number(n.preco) || 0);

    const total = Math.round(Math.max(0, produtos - desconto + frete) * 100) / 100;
    return { totalAntes, total, diferenca: Math.round((total - totalAntes) * 100) / 100 };
  }, [pedido, itens, quantidades, removidos, novos]);

  const mudou = useMemo(() => (
    novos.some(n => n.quantidade > 0)
    || Object.keys(removidos).some(k => removidos[k])
    || itens.some(i => quantidades[i.id] != null
      && Number(quantidades[i.id]) !== Number(i.quantidade)),
  ), [itens, quantidades, removidos, novos]);

  const sobraram = itens.filter(i => !removidos[i.id]).length + novos.filter(n => n.quantidade > 0).length;
  const pode = mudou && sobraram > 0 && email.trim() && senha.trim() && !salvando;

  if (!aberto) return null;

  function acrescentar(prod) {
    setNovos(l => (
      l.some(n => n.product_id === prod.id)
        ? l
        : [...l, {
            product_id: prod.id,
            nome: prod.name,
            codigo: prod.code || null,
            preco: Number(prod.sale_price) || 0,
            quantidade: 1,
          }]
    ));
    setBusca('');
  }

  function enviar() {
    onConfirmar?.({
      alteracoes: itens
        .filter(i => !removidos[i.id]
          && quantidades[i.id] != null
          && Number(quantidades[i.id]) > 0
          && Number(quantidades[i.id]) !== Number(i.quantidade))
        .map(i => ({ item_id: i.id, quantity: Number(quantidades[i.id]) })),
      remover: Object.keys(removidos).filter(k => removidos[k]),
      novos: novos.filter(n => n.quantidade > 0).map(n => ({
        product_id: n.product_id, quantity: Number(n.quantidade), unit_price: Number(n.preco),
      })),
      motivo, email, senha,
    });
  }

  const Seta = conta.diferenca > 0 ? TrendingUp : conta.diferenca < 0 ? TrendingDown : Minus;
  const corDif = conta.diferenca > 0 ? '#16a34a' : conta.diferenca < 0 ? '#dc2626' : '#6b7280';

  return (
    <Modal isOpen onClose={() => !salvando && onClose?.()}
      title={`Editar o pedido ${pedido.codigo || ''}`} size="lg" closeOnBackdrop={false}>
      <div className="space-y-4">

        {/* ── Os itens que já estão no pedido ─────────────────── */}
        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
                <th className="text-left font-semibold px-3 py-2">Produto</th>
                <th className="text-right font-semibold px-3 py-2 w-24">Unitário</th>
                <th className="text-center font-semibold px-3 py-2 w-28">Qtd.</th>
                <th className="text-right font-semibold px-3 py-2 w-28">Total</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {itens.map(i => {
                const fora = !!removidos[i.id];
                const qtd = quantidades[i.id] != null ? quantidades[i.id] : i.quantidade;
                return (
                  <tr key={i.id} className={`border-t border-gray-100 ${fora ? 'opacity-45' : ''}`}>
                    <td className="px-3 py-2">
                      <span className={`block ${fora ? 'line-through' : ''}`}>{i.produto}</span>
                      {i.codigo && <span className="block text-[11px] text-gray-400">{i.codigo}</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{brl(i.valor_unitario)}</td>
                    <td className="px-3 py-2">
                      <input type="number" min="1" disabled={fora} value={qtd}
                        onChange={e => setQuantidades(q => ({ ...q, [i.id]: e.target.value }))}
                        className="input text-center tabular-nums w-full disabled:opacity-50" />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {brl(fora ? 0 : (Number(qtd) || 0) * (Number(i.valor_unitario) || 0))}
                    </td>
                    <td className="px-3 py-2">
                      {/* Tirar item é reversível até salvar: a linha fica
                          riscada na tela em vez de sumir, para quem
                          clicou errado poder voltar atrás. */}
                      <button type="button" title={fora ? 'Manter no pedido' : 'Tirar do pedido'}
                        onClick={() => setRemovidos(r => ({ ...r, [i.id]: !r[i.id] }))}
                        className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100">
                        {fora ? <Undo2 size={14} className="text-gray-500" />
                              : <Trash2 size={14} className="text-red-500" />}
                      </button>
                    </td>
                  </tr>
                );
              })}

              {novos.map((n, k) => (
                <tr key={n.product_id} className="border-t border-gray-100 bg-emerald-50/60">
                  <td className="px-3 py-2">
                    <span className="block">{n.nome}</span>
                    <span className="block text-[11px] text-emerald-700">Acrescentado agora</span>
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="0" step="0.01" value={n.preco}
                      onChange={e => setNovos(l => l.map((x, j) => j === k ? { ...x, preco: e.target.value } : x))}
                      className="input text-right tabular-nums w-full" />
                  </td>
                  <td className="px-3 py-2">
                    <input type="number" min="1" value={n.quantidade}
                      onChange={e => setNovos(l => l.map((x, j) => j === k ? { ...x, quantidade: e.target.value } : x))}
                      className="input text-center tabular-nums w-full" />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {brl((Number(n.quantidade) || 0) * (Number(n.preco) || 0))}
                  </td>
                  <td className="px-3 py-2">
                    <button type="button" title="Tirar"
                      onClick={() => setNovos(l => l.filter((_, j) => j !== k))}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100">
                      <Trash2 size={14} className="text-red-500" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Acrescentar produto ─────────────────────────────── */}
        <div>
          <label className="label">Acrescentar produto</label>
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input className="input pl-9" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Digite o nome ou o código do produto…" />
          </div>
          {busca.trim().length >= 2 && (
            <div className="mt-1.5 max-h-44 overflow-y-auto rounded-xl border border-gray-200 divide-y divide-gray-100">
              {isFetching && (
                <p className="px-3 py-2 text-sm text-gray-400 flex items-center gap-2">
                  <Loader2 size={13} className="animate-spin" /> Procurando…
                </p>
              )}
              {!isFetching && !(achados?.data || []).length && (
                <p className="px-3 py-2 text-sm text-gray-400">Nenhum produto com esse nome.</p>
              )}
              {(achados?.data || []).map(prod => (
                <button key={prod.id} type="button" onClick={() => acrescentar(prod)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50">
                  <Plus size={13} className="text-primary-600 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{prod.name}</span>
                  <span className="tabular-nums text-gray-500 shrink-0">{brl(prod.sale_price)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── A conta ─────────────────────────────────────────── */}
        <div className="rounded-xl border border-gray-200 p-3 grid grid-cols-3 gap-3 text-center">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Total antes</p>
            <p className="text-base tabular-nums text-gray-500 line-through">{brl(conta.totalAntes)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">Total agora</p>
            <p className="text-base font-semibold tabular-nums">{brl(conta.total)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-500">
              {conta.diferenca >= 0 ? 'O cliente paga a mais' : 'Fica a menos'}
            </p>
            <p className="text-base font-semibold tabular-nums flex items-center justify-center gap-1"
              style={{ color: corDif }}>
              <Seta size={14} /> {brl(Math.abs(conta.diferenca))}
            </p>
          </div>
        </div>

        {conta.diferenca > 0 && (
          <p className="text-[12px] text-gray-500">
            Entra <b>{brl(conta.diferenca)}</b> no contas a receber deste pedido. O que já
            foi pago fica como está — só a diferença é cobrada.
          </p>
        )}
        {conta.diferenca < 0 && (
          <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
            O pedido ficou <b>{brl(Math.abs(conta.diferenca))}</b> mais barato. Se esse valor
            já tiver sido pago, o acerto com o cliente é feito em <b>Devoluções</b> — nenhum
            lançamento negativo é criado aqui.
          </p>
        )}

        <div>
          <label className="label">Motivo (fica no histórico)</label>
          <input className="input" value={motivo} maxLength={300}
            onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: cliente pediu mais 20 copos por telefone" />
        </div>

        <div className="rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
            <ShieldCheck size={14} className="text-primary-600" /> Autorização
          </p>
          <p className="text-[11px] text-gray-500">
            Editar um pedido fechado muda o valor que o cliente deve. A senha é conferida na
            hora, e o nome de quem autorizou fica no histórico.
          </p>
          <div>
            <label className="label">E-mail</label>
            <input type="email" className="input" autoComplete="off" value={email}
              onChange={e => setEmail(e.target.value)} placeholder="gerente@empresa.com.br" />
          </div>
          <div>
            <label className="label">Senha</label>
            <input type="password" className="input" autoComplete="off" value={senha}
              onChange={e => setSenha(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && pode && enviar()} />
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} disabled={salvando} className="btn-secondary">Cancelar</button>
          <button onClick={enviar} disabled={!pode} className="btn-primary disabled:opacity-50">
            {salvando ? <Loader2 size={15} className="animate-spin" /> : <ShieldCheck size={15} />}
            Salvar alterações
          </button>
        </div>
      </div>
    </Modal>
  );
}
