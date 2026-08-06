import { useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Loader2, AlertTriangle, CheckCircle2, ShieldCheck } from 'lucide-react';
import api from '@/lib/api';
import Modal from './Modal';

// Consulta de score/crédito a partir de uma linha da lista.
// Mesma tela usada em Clientes, Fornecedores e Transportadoras — muda só o
// endpoint (`path`, ex.: '/suppliers') e o rótulo do documento.
export default function CreditCheckModal({ target, onClose, path, docKey = 'cpf_cnpj', docLabel = 'sem documento' }) {
  const mut = useMutation({
    mutationFn: (id) => api.post(`${path}/${id}/credit-check`),
  });

  // Dispara a consulta assim que abre (e a cada registro diferente)
  useEffect(() => {
    if (!target?.id) return;
    mut.reset();
    mut.mutate(target.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id]);

  const data = mut.data;

  return (
    <Modal isOpen={!!target} onClose={onClose} title="Consulta de crédito" size="sm">
      <div className="space-y-3">
        <p className="text-sm">
          <b>{target?.name}</b>{' '}
          <span className="text-gray-400">· {target?.[docKey] || docLabel}</span>
        </p>

        {mut.isPending ? (
          <div className="flex items-center justify-center gap-2 py-6 text-gray-500">
            <Loader2 size={18} className="animate-spin" /> Consultando...
          </div>
        ) : mut.isError ? (
          <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3">
            {mut.error?.error || 'Não foi possível consultar.'}
          </p>
        ) : data ? (
          <div className="border border-gray-200 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-400">Score</p>
                <p className="text-2xl font-bold">
                  {data.score ?? '—'}
                  {data.score_faixa && <span className="text-sm text-gray-500 ml-2">{data.score_faixa}</span>}
                </p>
              </div>
              {data.negativado == null ? null : data.negativado ? (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 bg-red-50 rounded-lg px-3 py-1.5">
                  <AlertTriangle size={15} /> Negativado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 bg-green-50 rounded-lg px-3 py-1.5">
                  <CheckCircle2 size={15} /> Sem restrições
                </span>
              )}
            </div>
          </div>
        ) : null}

        <div className="flex justify-end pt-2 border-t border-gray-100">
          <button onClick={() => mut.mutate(target.id)} disabled={mut.isPending} className="btn-secondary text-sm">
            <ShieldCheck size={14} /> Consultar de novo
          </button>
        </div>
      </div>
    </Modal>
  );
}
