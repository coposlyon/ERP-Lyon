// ============================================================
// O CATÁLOGO DE PRODUTOS PERSONALIZADOS — a porta de fora.
//
// Seis telas, um caminho só (§34):
//
//   /catalogo                     famílias
//   /catalogo/:familia            modelos daquela família
//   /catalogo/configurar/:chave   acabamento, cores, personalização
//   /catalogo/arte/:chave         o editor da arte
//   /catalogo/carrinho            orçamento ou pagamento
//   /catalogo/pagamento/:id       a cobrança
//
// UMA TELA POR ETAPA, NUNCA UMA POR PRODUTO. Canecas, Long Drink e o
// que entrar amanhã passam por estas mesmas seis. Família nova é linha
// no banco.
//
// FORA DO ERP. Sem AuthProvider, sem Layout, sem sidebar, sem token: quem
// abre o link que o vendedor mandou é um visitante, e visitante não tem
// nem por que ver a existência de uma tela de login.
//
// O CARRINHO ENVOLVE TUDO. Ele precisa sobreviver à ida ao editor de
// arte e à volta — por isso o provider mora aqui e não dentro de uma
// tela.
// ============================================================
import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { CarrinhoProvider } from './carrinhoContexto';
import { NEON } from './ui';
import Familias from './Familias';
import Modelos from './Modelos';

// O configurador, o editor e o pagamento só carregam quando o cliente
// chega neles. O peso do editor (gabarito, artes, IA) não pode atrasar a
// primeira tela — que é a que decide se a pessoa continua.
const Configurador = lazy(() => import('./Configurador'));
const CriarArte    = lazy(() => import('./CriarArte'));
const Carrinho     = lazy(() => import('./Carrinho'));
const Pagamento    = lazy(() => import('./Pagamento'));

function Carregando() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: NEON.fundo }}>
      <Loader2 size={30} className="animate-spin" style={{ color: NEON.azul }} />
    </div>
  );
}

export default function CatalogoApp() {
  return (
    <CarrinhoProvider>
      <Suspense fallback={<Carregando />}>
        <Routes>
          <Route index element={<Familias />} />
          <Route path="carrinho" element={<Carrinho />} />
          <Route path="configurar/:chave" element={<Configurador />} />
          <Route path="arte/:chave" element={<CriarArte />} />
          <Route path="pagamento/:id" element={<Pagamento />} />
          {/* A família fica por ÚLTIMO: `:familia` casaria com
              "carrinho" e "arte" se viesse antes, e o cliente cairia
              numa vitrine vazia chamada "carrinho". */}
          <Route path=":familia" element={<Modelos />} />
          <Route path="*" element={<Navigate to="/catalogo" replace />} />
        </Routes>
      </Suspense>
    </CarrinhoProvider>
  );
}
