import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, ShoppingCart, Wand2, Box, LayoutTemplate } from 'lucide-react';
import toast from 'react-hot-toast';
import Studio3D from '@/studio3d/Studio3D';
import LabelEditor from './LabelEditor';
import { MODELS } from '@/pages/Studio/scene';
import { useCart } from './CartContext';
import storeApi from './storeApi';

export default function StoreStudio() {
  const navigate = useNavigate();
  const { add } = useCart();
  const [mode, setMode] = useState('2d'); // '2d' editor plano | '3d' clássico

  // Adiciona ao carrinho a partir do design + preview já montados
  function cartAdd({ design, preview, model }) {
    const label = MODELS.find(m => m.key === (model || design.model))?.label || 'Copo';
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
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2">
          <Wand2 size={22} className="text-orange-500" />
          <h1 className="text-2xl sm:text-3xl font-black">Personalize seu copo</h1>
        </div>
        <div className="flex gap-1.5 bg-gray-100 rounded-xl p-1">
          <button onClick={() => setMode('2d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === '2d' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            <LayoutTemplate size={15} /> Editor
          </button>
          <button onClick={() => setMode('3d')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${mode === '3d' ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}>
            <Box size={15} /> Prévia 3D
          </button>
        </div>
      </div>
      <p className="text-gray-500 mb-6">Monte a arte do seu copo: texto, imagens e cores. Depois é só pedir o orçamento.</p>

      {mode === '2d' ? (
        <LabelEditor onAddToCart={cartAdd} />
      ) : (
        <Studio3D aiSuggest={(brief) => storeApi.post('/ai-design', { brief })} actions={(a) => (
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { const u = a.getPNG(); Object.assign(document.createElement('a'), { href: u, download: 'meu-copo.png' }).click(); }}
              className="btn-secondary"><Download size={14} /> Baixar imagem</button>
            <button onClick={() => cartAdd({ design: a.getDesign(), preview: a.getThumb() })}
              className="bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl px-4 py-2.5 flex items-center justify-center gap-2 transition-colors">
              <ShoppingCart size={16} /> Adicionar ao carrinho
            </button>
          </div>
        )} />
      )}
    </div>
  );
}
