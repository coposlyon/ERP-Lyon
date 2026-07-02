import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import PDV from './PDV';

// Tela COMPLETA de novo pedido de venda (rota /sales/new) —
// substitui o antigo card/modal. Cliente em cima, produtos à direita (PDV).
export default function NewSale() {
  const navigate = useNavigate();
  const qc = useQueryClient();

  function close() {
    qc.invalidateQueries(['sales']);
    navigate('/sales');
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
        <h1 className="text-lg font-semibold text-gray-900">Novo Pedido de Venda</h1>
        <button onClick={close} className="btn-ghost p-1.5" title="Fechar (ESC)"><X size={20} /></button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 sm:p-6">
        <PDV onDone={close} />
      </div>
    </div>
  );
}
