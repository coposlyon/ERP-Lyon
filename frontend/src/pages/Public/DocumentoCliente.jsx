// ============================================================
// O PEDIDO EM PDF, DO LADO DO CLIENTE.
//
// É a MESMA folha do ERP (DocumentoPedidoView), com os mesmos dados.
// O "Baixar Pedido em PDF" do portal imprimia a tela de acompanhamento
// inteira, e o cliente saía com um papel diferente do que o vendedor
// tinha na mão. Aqui só muda a casca: fundo da página pública e a seta
// voltando para o acompanhamento.
//
// A trava é a do portal: o token do acompanhamento, e a rota confere
// que o pedido é do cliente antes de devolver qualquer dado.
// ============================================================
import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader2, ArrowLeft } from 'lucide-react';
import api from '@/lib/api';
import DocumentoPedidoView from '@/components/Pedido/DocumentoPedidoView';

export default function DocumentoCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const token = sessionStorage.getItem('acompanhar_token');

  useEffect(() => { if (!token) navigate('/acompanhar', { replace: true }); }, [token, navigate]);

  const { data: p, isLoading, error } = useQuery({
    queryKey: ['acompanhar-documento', id],
    queryFn: () => api.get(`/acompanhar/pedido/${id}/documento-pedido`,
      { headers: { Authorization: `Bearer ${token}` } }),
    enabled: !!token,
    retry: false,
  });

  useEffect(() => {
    if (error?.error && /sess/i.test(error.error)) {
      sessionStorage.removeItem('acompanhar_token');
      navigate('/acompanhar', { replace: true });
    }
  }, [error, navigate]);

  const voltar = () => navigate(`/acompanhar/pedido/${id}`);

  if (!token) return null;

  return (
    <div className="doc-pagina-publica min-h-screen px-3 sm:px-6 py-6" style={{ background: '#060a1f' }}>
      <div className="max-w-6xl mx-auto">
        {isLoading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin" style={{ color: '#22d3ee' }} />
          </div>
        )}
        {error && !isLoading && (
          <div className="text-center py-16">
            <p className="text-red-400">{error.error || 'Não foi possível abrir este pedido'}</p>
            <button onClick={voltar} className="btn-secondary mt-4 mx-auto"><ArrowLeft size={14} /> Voltar</button>
          </div>
        )}
        {p && <DocumentoPedidoView p={p} onVoltar={voltar} />}
      </div>
    </div>
  );
}
