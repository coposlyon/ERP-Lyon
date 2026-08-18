// ============================================================
// A marca do canal de onde o pedido veio.
//
// Emoji não servia: 🛍️ e 🏬 são a mesma bolsinha cinza de relance, e
// numa coluna de trinta linhas o operador precisa distinguir Shopee de
// Magalu sem parar para ler. Cor da marca resolve isso antes do texto —
// laranja é Shopee, amarelo é Mercado Livre, verde é WhatsApp.
//
// SOBRE OS DESENHOS: são reproduções simplificadas, feitas aqui em SVG,
// nas cores de cada marca. Não são os arquivos oficiais das empresas, e
// não devem ser usados em material de divulgação — servem para
// identificar o canal dentro do ERP, que é uso legítimo de identificação.
// Se um dia a Lyon precisar da arte oficial, é só trocar o desenho por
// um <img> aqui: nenhuma tela precisa saber.
//
// Fica num lugar só porque três telas mostram a mesma coisa — Vendas, a
// carteira do vendedor e os detalhes do pedido. O mapa já esteve
// copiado em dois arquivos, e origem nova entrava num e não no outro.
// ============================================================
import { Globe, Instagram, Facebook, ShoppingBag, Handshake, Package,
         Store, Phone, Star, Music2, Circle } from 'lucide-react';

/**
 * WhatsApp não existe no lucide. O balão com o telefone dentro é o que
 * o olho reconhece; sobre o verde da marca, ninguém confunde com outro
 * aplicativo de mensagem.
 */
function GlifoWhatsApp({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.1 14.1c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.9-2.7-1.2-4.4-4-4.5-4.2-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.6.1.3.7 1.2 1.5 1.9 1 .9 1.8 1.2 2.1 1.3.2.1.4.1.6-.1l.8-1c.2-.2.3-.2.6-.1l1.9.9c.3.1.5.2.6.3.1.2.1.7-.1 1.3z" />
    </svg>
  );
}

/**
 * Cada canal: cor de fundo, cor do glifo e o glifo.
 *
 * `gradiente` só para o Instagram, que é a única marca cuja identidade É
 * o degradê — em cor chapada ele vira um quadrado rosa qualquer.
 */
const MARCAS = {
  'Site':          { fundo: '#2563eb', tinta: '#ffffff', Glifo: Globe },
  'WhatsApp':      { fundo: '#25D366', tinta: '#ffffff', Glifo: GlifoWhatsApp },
  'Instagram':     { tinta: '#ffffff', Glifo: Instagram,
                     gradiente: 'linear-gradient(45deg,#FEDA75 0%,#FA7E1E 25%,#D62976 55%,#962FBF 80%,#4F5BD5 100%)' },
  'Facebook':      { fundo: '#1877F2', tinta: '#ffffff', Glifo: Facebook },
  'TikTok':        { fundo: '#010101', tinta: '#25F4EE', Glifo: Music2 },
  'Shopee':        { fundo: '#EE4D2D', tinta: '#ffffff', Glifo: ShoppingBag },
  // O amarelo do Mercado Livre é claro demais para glifo branco: o
  // contraste ficaria em 1,3:1 e a mãozinha sumiria. Vai o azul da marca.
  'Mercado Livre': { fundo: '#FFE600', tinta: '#2D3277', Glifo: Handshake },
  'Amazon':        { fundo: '#FF9900', tinta: '#232F3E', Glifo: Package },
  'Magalu':        { fundo: '#0086FF', tinta: '#ffffff', Glifo: Store },
  'Presencial':    { fundo: '#64748b', tinta: '#ffffff', Glifo: Store },
  'Telefone':      { fundo: '#0ea5e9', tinta: '#ffffff', Glifo: Phone },
  'Indicação':     { fundo: '#f59e0b', tinta: '#ffffff', Glifo: Star },
  'Outro':         { fundo: '#475569', tinta: '#cbd5e1', Glifo: Circle },
};

const PADRAO = MARCAS['Outro'];

/**
 * @param origem  o texto gravado em VENDAS.origin
 * @param size    lado do selo em px
 * @param nome    true mostra o nome do canal ao lado
 */
export default function LogoOrigem({ origem, size = 22, nome = false, className = '' }) {
  const m = MARCAS[origem] || PADRAO;
  const { Glifo } = m;

  const selo = (
    <span
      className="inline-flex items-center justify-center shrink-0"
      title={origem || 'Origem não informada'}
      style={{
        width: size, height: size,
        borderRadius: Math.round(size * 0.28),
        background: m.gradiente || m.fundo,
        color: m.tinta,
      }}>
      <Glifo size={Math.round(size * 0.62)} strokeWidth={2.2} />
    </span>
  );

  if (!nome) return selo;

  return (
    <span className={`inline-flex items-center gap-2 min-w-0 ${className}`}>
      {selo}
      <span className="truncate">{origem || '—'}</span>
    </span>
  );
}
