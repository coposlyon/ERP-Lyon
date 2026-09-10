// A tela da fábrica: da revelação à embalagem (status 10–23 da régua).
// A tela em si mora em components/Fluxo/FilaDeEtapas — é a mesma do
// Designer e da Logística, lendo a fatia da produção.
import { Factory } from 'lucide-react';
import FilaDeEtapas from '@/components/Fluxo/FilaDeEtapas';
import SerigrafiaPanel from './SerigrafiaPanel';

export default function Production() {
  return (
    <FilaDeEtapas
      modulo="producao"
      api="/production"
      titulo="Produção"
      subtitulo="Revelação · Pintura · Borda · Produção · Qualidade · Foto · Embalagem"
      Icone={Factory}
      cor="orange"
      extras={<SerigrafiaPanel />}
    />
  );
}
