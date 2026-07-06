// Ícone por nome da despesa fixa (Aluguel → casa, Energia → raio...)
import {
  Home, Zap, Droplets, Wifi, Phone, FileSpreadsheet, Megaphone,
  Monitor, UserRound, Users, Receipt,
} from 'lucide-react';

const MAP = [
  [/alug/i, Home],
  [/energ|luz|eletric/i, Zap],
  [/[áa]gua/i, Droplets],
  [/internet|wi-?fi|banda/i, Wifi],
  [/telefone|celular|fone/i, Phone],
  [/contador|contab/i, FileSpreadsheet],
  [/marketing|an[úu]ncio|ads|tr[áa]fego/i, Megaphone],
  [/sistema|software|erp|licen/i, Monitor],
  [/pr[óo][ -]?labore/i, UserRound],
  [/funcion[áa]rio|sal[áa]rio|folha|colaborador/i, Users],
];

export function iconFor(name) {
  for (const [re, Icon] of MAP) if (re.test(name || '')) return Icon;
  return Receipt;
}
