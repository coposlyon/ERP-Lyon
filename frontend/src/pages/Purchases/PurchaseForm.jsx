import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function PurchaseForm() {
  const navigate = useNavigate();
  return (
    <div className="max-w-3xl mx-auto">
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/purchases')} className="btn-ghost p-2"><ArrowLeft size={18} /></button>
          <h1 className="page-title">Nova Compra</h1>
        </div>
      </div>
      <div className="card p-8 text-center text-gray-400">
        <p className="text-lg font-medium mb-2">Formulário de Compra</p>
        <p className="text-sm">Em desenvolvimento — funcionalidade completa na próxima versão</p>
      </div>
    </div>
  );
}
