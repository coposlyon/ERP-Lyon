// A tela do Designer: a impressão do vegetal (status 8–9 da régua).
//
// O vegetal é o filme que a serigrafia vai usar para gravar a tela. Quem
// imprime é quem desenha — por isso é um módulo, e não um canto da
// produção. A tela é a mesma da fábrica (components/Fluxo/FilaDeEtapas),
// lendo só a fatia do designer: o pedido chega aqui com a arte aprovada
// pelo cliente e sai daqui com o filme na mão da revelação.
import { PenTool } from 'lucide-react';
import FilaDeEtapas from '@/components/Fluxo/FilaDeEtapas';

export default function Designer() {
  return (
    <FilaDeEtapas
      modulo="designer"
      api="/designer"
      titulo="Designer"
      subtitulo="Impressão do vegetal — da arte aprovada ao filme pronto para a revelação"
      Icone={PenTool}
      cor="violet"
    />
  );
}
