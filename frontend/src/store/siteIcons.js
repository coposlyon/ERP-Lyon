// Ícones disponíveis para as seções editáveis do site (benefícios/pilares).
// Chave (string) → componente lucide. Usado na loja (render) e no editor (picker).
import {
  CreditCard, QrCode, Truck, ShieldCheck, Printer, Wand2, Star, Zap, Heart,
  Gift, Clock, Package, Droplet, Sparkles, Palette, Award, ThumbsUp, Rocket,
} from 'lucide-react';

export const SITE_ICONS = {
  card: CreditCard, pix: QrCode, truck: Truck, shield: ShieldCheck, print: Printer,
  wand: Wand2, star: Star, zap: Zap, heart: Heart, gift: Gift, clock: Clock,
  package: Package, droplet: Droplet, sparkles: Sparkles, palette: Palette,
  award: Award, thumbsup: ThumbsUp, rocket: Rocket,
};
export const SITE_ICON_KEYS = Object.keys(SITE_ICONS);
export function siteIcon(key, fallback = 'star') {
  return SITE_ICONS[key] || SITE_ICONS[fallback];
}
