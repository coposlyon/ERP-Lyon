import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import PDV from '@/pages/Sales/PDV';

// Tela COMPLETA de novo orçamento (rota /quotes/new) — mesma tela do
// pedido de venda, mas salva no histórico e gera a foto PNG padronizada.
export default function NewQuote() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // ?customer_id= — chega assim da carteira de clientes do vendedor
  const [params] = useSearchParams();

  function close() {
    qc.invalidateQueries(['quotes']);
    navigate('/quotes');
  }

  // ESC fecha a tela (se não estiver digitando num campo)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        const a = document.activeElement;
        if (!a || !/INPUT|SELECT|TEXTAREA/.test(a.tagName)) close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-gray-50">
      <div className="flex items-center justify-between px-4 sm:px-6 py-3 bg-white border-b border-gray-200 shrink-0">
        <h1 className="text-lg font-semibold text-gray-900">Novo Orçamento</h1>
        <button onClick={close} className="btn-ghost p-1.5" title="Fechar (ESC)"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PDV mode="quote" customerId={params.get('customer_id')} onDone={close} />
      </div>
    </div>
  );
}
