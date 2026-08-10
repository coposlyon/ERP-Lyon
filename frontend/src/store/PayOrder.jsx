import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import storeApi from './storeApi';
import PixPayment from './PixPayment';

/**
 * Retomar o pagamento de um pedido (o cliente fechou a aba, voltou pelo
 * "meus pedidos" ou pelo link). Remonta a tela do PIX a partir do pedido.
 */
export default function PayOrder() {
  const { id } = useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ['store-pedido', id],
    queryFn: () => storeApi.get(`/pedido/${id}`),
    retry: false,
  });

  if (isLoading) return <div className="max-w-2xl mx-auto px-4 py-20 text-center text-gray-400">Carregando pedido...</div>;

  if (error || !data) return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-gray-500">Pedido não encontrado.</p>
      <Link to="/loja/pedidos" className="text-orange-600 font-semibold mt-2 inline-block">Ver meus pedidos</Link>
    </div>
  );

  if (data.status !== 'aguardando_pagamento') return (
    <div className="max-w-2xl mx-auto px-4 py-20 text-center">
      <p className="text-gray-700 font-bold text-lg">
        {data.status === 'pago'
          ? (data.number ? `Pedido nº ${data.number} já está pago 🎉` : 'Este pedido já está pago 🎉')
          : 'Este pedido não está mais aguardando pagamento.'}
      </p>
      <Link to="/loja/pedidos" className="text-orange-600 font-semibold mt-3 inline-block">Acompanhar meus pedidos</Link>
    </div>
  );

  return (
    <PixPayment order={{
      order_id: data.id,
      total: data.total,
      expires_at: data.expires_at,
      items: 0,
      pix: { copy_paste: data.pix_copy_paste, qr_base64: data.pix_qr_base64, merchant: null },
    }} />
  );
}
