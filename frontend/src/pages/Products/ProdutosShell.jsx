// ============================================================
// TUDO O QUE COMPÕE UM PRODUTO, NUMA TELA SÓ.
//
// Produtos, sub-produtos, cores, bordas e insumos. Nenhum deles vive por
// conta própria: são as PEÇAS do produto — a cor existe porque o copo
// tem cor, o canudo existe porque vai junto com o copo.
//
// FICOU MAIS SIMPLES DE PROPÓSITO. Havia sete abas: Tintas (sem nenhum
// cadastro, e que brigava com Cores pelo mesmo papel), Itens (as mesmas
// linhas das outras abas, todas juntas — parecia cadastro duplicado) e
// Acessórios, que na prática era tampa e canudo. Agora são cinco, e
// Acessórios virou Sub-Produtos, ao lado de Produtos.
//
// OS ENDEREÇOS ANTIGOS CONTINUAM ABRINDO. `?secao=acessorios` cai em
// Sub-Produtos; `tintas` e `itens` caem em Produtos. Link salvo não pode
// quebrar porque uma aba mudou de nome.
// ============================================================
import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Package, Puzzle, Palette, Layers, FlaskConical, Loader2 } from 'lucide-react';

import Products from './Products';

// Carregadas sob demanda: quem abre Produtos para ver produtos não
// precisa baixar a tela de insumos junto.
const Itens = lazy(() => import('@/pages/Itens/Itens'));
const Insumos = lazy(() => import('@/pages/Insumos/Insumos'));

const SECOES = [
  { key: 'produtos',    rotulo: 'Produtos',     Icone: Package },
  { key: 'subprodutos', rotulo: 'Sub-Produtos', Icone: Puzzle },
  { key: 'cores',       rotulo: 'Cores',        Icone: Palette },
  { key: 'bordas',      rotulo: 'Bordas',       Icone: Layers },
  { key: 'insumos',     rotulo: 'Insumos',      Icone: FlaskConical },
];

// Nome antigo → aba de hoje.
const APELIDOS = { acessorios: 'subprodutos' };

export default function ProdutosShell() {
  // A seção mora no ENDEREÇO (?secao=cores), e não num useState: assim
  // dá para mandar o link direto de uma aba para alguém, e o botão
  // voltar do navegador faz o que a pessoa espera.
  const [params, setParams] = useSearchParams();
  const pedida = APELIDOS[params.get('secao')] || params.get('secao');
  const atual = SECOES.some(s => s.key === pedida) ? pedida : 'produtos';

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
          {/* Sub-produto é o tipo `acessorio` no banco: o nome mudou na
              tela, os cadastros (Tampa, Canudo) são os mesmos. */}
          {atual === 'subprodutos' && <Itens kind="acessorio" />}
          {atual === 'cores'       && <Itens kind="cor" />}
          {atual === 'bordas'      && <Itens kind="borda" />}
          {atual === 'insumos'     && <Insumos />}
        </Suspense>
      )}
    </div>
  );
}
