// A tela da fábrica: da revelação à embalagem (status 10–23 da régua).
// A tela em si mora em components/Fluxo/FilaDeEtapas — é a mesma do
// Designer e da Logística, lendo a fatia da produção.
import { Factory } from 'lucide-react';
import FilaDeEtapas from '@/components/Fluxo/FilaDeEtapas';
// O painel "Serigrafia — Telas / Matrizes" saiu daqui a pedido da Lyon
// em 24/09/2026: esta tela mostra a FILA DE PEDIDOS, e a durabilidade
// das telas era leitura de outro assunto no meio dela. O componente
// (SerigrafiaPanel) e os dados continuam no sistema, prontos para
// voltar em tela própria se a serigrafia voltar a precisar deles.

// O que aparece embaixo do título: os status 10 a 21 da régua, pelo
// número e nome (os mesmos de backend/src/lib/atencao.js).
const STATUS_DA_PRODUCAO = [
  '10 Aguardando revelação', '11 Revelação finalizada',
  '12 Aguardando pintura', '13 Pintura finalizada',
  '14 Aguardando aplicação de borda', '15 Borda finalizada',
  '16 Aguardando produção', '17 Produção finalizada',
  '18 Aguardando controle de qualidade', '19 Controle de qualidade finalizado',
  '20 Aguardando foto', '21 Foto enviada',
];

export default function Production() {
  return (
    <FilaDeEtapas
      modulo="producao"
      api="/production"
      titulo="Produção"
      subtitulo={STATUS_DA_PRODUCAO.join(' · ')}
      Icone={Factory}
      cor="orange"
    />
  );
}
