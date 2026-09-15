// ============================================================
// O PEDIDO DE VENDA — DOCUMENTO (lado do ERP).
//
// A folha em si mora em DocumentoPedidoView, que é o MESMO componente
// que o cliente abre no portal ("Baixar Pedido em PDF"). Aqui fica só o
// que é do ERP: buscar o pedido na rota do vendedor e voltar para a
// tela certa.
//
// OS DADOS DA EMPRESA VÊM COM O PEDIDO (rota /area-vendedor/pedidos/:id),
// e não do login guardado no navegador: este documento circula fora do
// ERP, e o CNPJ nele precisa ser o de agora.
// ============================================================
import { useQuery } from '@tanstack/react-query';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import DocumentoPedidoView from '@/components/Pedido/DocumentoPedidoView';

export default function DocumentoPedido() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [params] = useSearchParams();

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['pedido-vendedor', id],
    queryFn: () => api.get(`/area-vendedor/pedidos/${id}`),
  });

  const voltar = () => navigate(pathname.startsWith('/sales')
    ? `/sales/${id}/detalhe`
    : `/vendedor/pedidos/${id}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-primary-600" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400">{error.error || 'Não foi possível abrir este pedido'}</p>
        <button onClick={voltar} className="btn-secondary mt-4 mx-auto"><ArrowLeft size={14} /> Voltar</button>
      </div>
    );
  }

  // "Imprimir em preto e branco" chega aqui com ?imprimir=1.
  return <DocumentoPedidoView p={p} onVoltar={voltar} autoImprimir={params.get('imprimir') === '1'} />;
}
