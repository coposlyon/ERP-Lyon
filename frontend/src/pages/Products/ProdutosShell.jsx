// ============================================================
// TUDO O QUE COMPÕE UM PRODUTO, NUMA TELA SÓ.
//
// Cores, acessórios, bordas, tintas, itens e insumos eram seis entradas
// soltas no menu Cadastros, do lado de Produtos — e nenhuma delas é um
// cadastro que vive por conta própria: são as PEÇAS do produto. A cor
// existe porque o copo tem cor; a tinta existe porque a arte é impressa
// nele. Separadas no menu, obrigavam a sair de Produtos para cadastrar
// o que só serve a Produtos, e a voltar depois.
//
// Agora são seções da mesma tela. O menu Cadastros ficou com o que de
// fato é cadastro independente: produtos, clientes, fornecedores.
//
// AS ROTAS ANTIGAS CONTINUAM VIVAS. `/cadastros/cores` e as outras
// respondem como sempre — link salvo, favorito do navegador e a lista
// de telas que o copiloto de IA conhece não podem quebrar porque um
// item mudou de lugar no menu.
// ============================================================
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Palette, Sparkles, Layers, Droplet, Box, FlaskConical, Loader2 } from 'lucide-react';

import Products from './Products';

// Carregadas sob demanda: quem abre Produtos para ver produtos não
// precisa baixar a tela de insumos junto.
const Itens = lazy(() => import('@/pages/Itens/Itens'));
const Insumos = lazy(() => import('@/pages/Insumos/Insumos'));

// A ordem é a do uso, não a do alfabeto: produto primeiro, depois o que
// se aplica nele, e insumo por último — que é o que o custo consome e
// quase nunca muda.
const SECOES = [
  { key: 'produtos',   rotulo: 'Produtos',   Icone: Package },
  { key: 'cores',      rotulo: 'Cores',      Icone: Palette },
  { key: 'acessorios', rotulo: 'Acessórios', Icone: Sparkles },
  { key: 'bordas',     rotulo: 'Bordas',     Icone: Layers },
  { key: 'tintas',     rotulo: 'Tintas',     Icone: Droplet },
  { key: 'itens',      rotulo: 'Itens',      Icone: Box },
  { key: 'insumos',    rotulo: 'Insumos',    Icone: FlaskConical },
];

export default function ProdutosShell() {
  // A seção mora no ENDEREÇO (?secao=cores), e não num useState: assim
  // dá para mandar o link direto da aba de tintas para alguém, e o
  // botão voltar do navegador faz o que a pessoa espera.
  const [params, setParams] = useSearchParams();
  const atual = SECOES.some(s => s.key === params.get('secao'))
    ? params.get('secao')
    : 'produtos';

  function irPara(key) {
    const p = new URLSearchParams(params);
    if (key === 'produtos') p.delete('secao'); else p.set('secao', key);
    // A paginação e os filtros são da seção que está saindo.
    p.delete('page');
    setParams(p);
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-1 rounded-lg bg-gray-100 w-fit overflow-x-auto max-w-full">
        {SECOES.map(s => (
          <button key={s.key} type="button" onClick={() => irPara(s.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
              atual === s.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}>
            <s.Icone size={14} /> {s.rotulo}
          </button>
        ))}
      </div>

      {atual === 'produtos' ? <Products /> : (
        <Suspense fallback={
          <div className="flex justify-center py-12"><Loader2 className="animate-spin text-gray-300" /></div>
        }>
          {atual === 'cores'      && <Itens kind="cor" />}
          {atual === 'acessorios' && <Itens kind="acessorio" />}
          {atual === 'bordas'     && <Itens kind="borda" />}
          {atual === 'tintas'     && <Itens kind="tinta" />}
          {atual === 'itens'      && <Itens />}
          {atual === 'insumos'    && <Insumos />}
        </Suspense>
      )}
    </div>
  );
}
