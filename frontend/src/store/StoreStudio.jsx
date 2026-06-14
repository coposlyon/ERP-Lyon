import { useNavigate } from 'react-router-dom';
import { Download, ShoppingCart, Wand2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Studio3D from '@/studio3d/Studio3D';
import { MODELS } from '@/pages/Studio/scene';
import { useCart } from './CartContext';

export default function StoreStudio() {
  const navigate = useNavigate();
  const { add } = useCart();

  function addToCart(a) {
    const design = a.getDesign();
    const preview = a.getThumb();
    const label = MODELS.find(m => m.key === design.model)?.label || 'Copo';
    add({
      product_id: null,
      product_name: `Personalizado — ${label}`,
      color: null, unit_price: 0, quantity: 1,
      design, preview,
    });
    toast.success('Personalização adicionada ao carrinho!');
    navigate('/loja/carrinho');
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2 mb-1">
        <Wand2 size={22} className="text-orange-500" />
        <h1 className="text-2xl sm:text-3xl font-black">Personalize em 3D</h1>
      </div>
      <p className="text-gray-500 mb-6">Escolha o modelo, as cores, o acabamento e coloque sua arte (frente e verso). Depois é só pedir o orçamento.</p>

      <Studio3D actions={(a) => (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { const u = a.getPNG(); Object.assign(document.createElement('a'), { href: u, download: 'meu-copo.png' }).click(); }}
            className="btn-secondary"><Download size={14} /> Baixar imagem</button>
          <button onClick={() => addToCart(a)}
            className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-colors">
            <ShoppingCart size={16} /> Adicionar ao carrinho
          </button>
        </div>
      )} />
    </div>
  );
}
