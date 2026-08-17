// ============================================================
// Confirmação de exclusão de pedido de venda.
//
// Dois modos, o mesmo componente:
//
//   modo="proprio"   quem está logado é gestor e confirma com a própria
//                    senha (tela do Administrativo).
//   modo="gerente"   quem está logado é vendedor: ele chama o gerente,
//                    que digita o e-mail e a senha DELE ali na hora
//                    (tela do vendedor).
//
// A senha não é burocracia: excluir apaga o pedido, os itens, o
// financeiro vinculado e devolve o estoque. É o tipo de coisa que não
// pode acontecer por um clique errado numa tela deixada aberta.
// ============================================================
import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2, Loader2, AlertTriangle, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import Modal from '@/components/UI/Modal';

export default function ExcluirPedidoModal({ pedido, modo = 'proprio', onClose, onExcluido }) {
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (!pedido) { setEmail(''); setSenha(''); setMotivo(''); }
  }, [pedido]);

  const excluir = useMutation({
    mutationFn: () => modo === 'gerente'
      ? api.post(`/area-vendedor/pedidos/${pedido.id}/excluir`, { email, password: senha, motivo })
      : api.post(`/sales/${pedido.id}/delete`, { password: senha, motivo }),
    onSuccess: r => {
      toast.success(r.message || 'Pedido excluído');
      onExcluido?.();
      onClose?.();
    },
    onError: e => toast.error(e.error || 'Não foi possível excluir'),
  });

  if (!pedido) return null;

  const codigo = `PV-${String(pedido.number ?? '').padStart(4, '0')}`;
  const podeEnviar = senha.trim() && (modo !== 'gerente' || email.trim());

  return (
    <Modal isOpen onClose={() => !excluir.isPending && onClose?.()}
      title={`Excluir pedido ${codigo}`} size="sm" closeOnBackdrop={false}>
      <div className="space-y-4">

        <div className="flex gap-2.5 bg-red-50 border border-red-100 rounded-xl p-3">
          <AlertTriangle size={18} className="text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm text-gray-700">
            <p>
              Você vai <b>excluir permanentemente</b> o pedido <b>{codigo}</b>
              {pedido.CLIENTES?.name ? <> de <b>{pedido.CLIENTES.name}</b></> : ''}.
            </p>
            {/* Dizer o que mais vai junto: o estoque voltando é o efeito
                que ninguém espera e o que mais assusta depois do fato. */}
            <p className="mt-1.5 text-xs">
              Saem junto os itens e o financeiro do pedido. O que tiver baixado do
              estoque <b>volta para a prateleira</b>. Não dá para desfazer.
            </p>
          </div>
        </div>

        {modo === 'gerente' && (
          <div className="flex gap-2.5 bg-amber-50 border border-amber-100 rounded-xl p-3">
            <ShieldCheck size={18} className="text-amber-500 mt-0.5 shrink-0" />
            <p className="text-sm text-gray-700">
              Esta exclusão precisa da autorização de um <b>gerente</b>. Chame quem responde
              pelo time para digitar o acesso dele aqui — fica registrado quem autorizou.
            </p>
          </div>
        )}

        {modo === 'gerente' && (
          <div>
            <label className="label">E-mail do gerente</label>
            <input type="email" className="input" autoFocus value={email}
              onChange={e => setEmail(e.target.value)} placeholder="gerente@empresa.com.br" />
          </div>
        )}

        <div>
          <label className="label">
            {modo === 'gerente' ? 'Senha do gerente' : 'Confirme com a sua senha'}
          </label>
          <input type="password" className="input" autoFocus={modo !== 'gerente'} value={senha}
            onChange={e => setSenha(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && podeEnviar && excluir.mutate()}
            placeholder="Senha" />
        </div>

        <div>
          <label className="label">Motivo (opcional)</label>
          <input className="input" value={motivo} onChange={e => setMotivo(e.target.value)}
            placeholder="Ex.: cliente desistiu, lançado em duplicidade" />
          <p className="text-xs text-gray-400 mt-1">
            Fica na auditoria junto com quem autorizou.
          </p>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
          <button onClick={() => onClose?.()} disabled={excluir.isPending} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={() => excluir.mutate()} disabled={excluir.isPending || !podeEnviar}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50">
            {excluir.isPending ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
            Excluir pedido
          </button>
        </div>
      </div>
    </Modal>
  );
}
