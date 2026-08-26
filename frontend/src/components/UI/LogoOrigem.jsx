// ============================================================
// A marca do canal de onde o pedido veio.
//
// Emoji não servia: 🛍️ e 🏬 são a mesma bolsinha cinza de relance, e
// numa coluna de trinta linhas o operador precisa distinguir Shopee de
// Magalu sem parar para ler. Cor da marca resolve isso antes do texto —
// laranja é Shopee, amarelo é Mercado Livre, verde é WhatsApp.
//
// GLIFO GENÉRICO TAMBÉM NÃO SERVE. A primeira versão usou o que o
// lucide tinha à mão: uma nota musical qualquer no lugar do TikTok, uma
// sacola qualquer no lugar da Shopee, uma caixa de papelão no lugar da
// Amazon. De longe, com a cor certa, quase passa; de perto é o mesmo
// problema do emoji — o desenho não é da marca, é de uma categoria.
// Agora cada marca tem o SEU símbolo desenhado aqui: a nota dupla do
// TikTok, a sacola com alça da Shopee, o sorriso da Amazon.
//
// SOBRE OS DESENHOS: são reproduções simplificadas, feitas aqui em SVG,
// nas cores de cada marca. Não são os arquivos oficiais das empresas, e
// não devem ser usados em material de divulgação — servem para
// identificar o canal dentro do ERP, que é uso legítimo de identificação.
// Se um dia a Lyon precisar da arte oficial, é só trocar o desenho por
// um <img> aqui: nenhuma tela precisa saber.
//
// Fica num lugar só porque quatro telas mostram a mesma coisa — Vendas,
// a carteira do vendedor, os detalhes do pedido e o campo onde a origem
// é escolhida (SeletorOrigem.jsx). O mapa já esteve copiado em dois
// arquivos, e origem nova entrava num e não no outro.
// ============================================================
import { Globe, Instagram, Facebook, Handshake, Store, Phone,
         UserPlus, MoreHorizontal } from 'lucide-react';

// ── Símbolos que o lucide não tem (ou tem só a categoria) ────

/**
 * WhatsApp: o balão com o telefone dentro. Sobre o verde da marca,
 * ninguém confunde com outro aplicativo de mensagem.
 */
function GlifoWhatsApp({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm5.1 14.1c-.2.6-1.2 1.2-1.7 1.2-.4 0-1 .1-3.2-.9-2.7-1.2-4.4-4-4.5-4.2-.1-.2-1-1.4-1-2.6s.6-1.8.9-2.1c.2-.2.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.3.3c-.1.1-.3.3-.1.6.1.3.7 1.2 1.5 1.9 1 .9 1.8 1.2 2.1 1.3.2.1.4.1.6-.1l.8-1c.2-.2.3-.2.6-.1l1.9.9c.3.1.5.2.6.3.1.2.1.7-.1 1.3z" />
    </svg>
  );
}

/**
 * TikTok: a nota dupla com o rabo curvo. Uma nota musical comum (a que
 * o lucide oferece) serve para Spotify, Deezer e rádio — não identifica
 * ninguém.
 */
function GlifoTikTok({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M16.5 5.8A4.3 4.3 0 0 1 15.4 3h-3.1v12.4a2.6 2.6 0 1 1-1.9-2.5V9.7a5.7 5.7 0 1 0 5 5.6V9a7.3 7.3 0 0 0 4.3 1.4V7.3a4.3 4.3 0 0 1-3.2-1.5z" />
    </svg>
  );
}

/**
 * Shopee: a sacola de alça arqueada com o S dentro. É a silhueta — não
 * "uma sacola de compras", que é o que a Amazon, a Magalu e a loja
 * física também seriam.
 */
function GlifoShopee({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8.8 8.2V6.6a3.2 3.2 0 0 1 6.4 0v1.6" />
      <path d="M4.4 8.2h15.2l-1 11.4a1.9 1.9 0 0 1-1.9 1.7H7.3a1.9 1.9 0 0 1-1.9-1.7L4.4 8.2z" />
      <path d="M13.9 12.6a2.9 2.9 0 0 0-1.9-.6c-1 0-1.8.5-1.8 1.3 0 .8.7 1.1 1.8 1.5 1.3.5 2.1 1 2.1 2.1 0 1.1-.9 1.8-2.2 1.8-.8 0-1.6-.2-2.2-.7" />
    </svg>
  );
}

/**
 * Amazon: o sorriso que vai do "a" ao "z", com a ponta de seta. É o que
 * a marca é — uma caixa de papelão é qualquer transportadora.
 */
function GlifoAmazon({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 14.6c2.7 2.3 6.3 3.6 10.1 3.6 2.3 0 4.6-.5 6.7-1.4" />
      <path d="M16.9 15.4l3.6 1.2-.7 3.6" />
      <path d="M6.5 9.4a2.6 2.6 0 0 1 5 1v1.9" />
    </svg>
  );
}

/**
 * Magalu: o "M" chapado sobre o azul da marca. A identidade da Magazine
 * Luiza é a palavra escrita; a inicial é a redução honesta dela para um
 * selo de 22 pixels.
 */
function GlifoMagalu({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.6 19.4V4.6h3.5l4.9 7.9 4.9-7.9h3.5v14.8h-3.2v-9.1l-4.2 6.6h-.1l-4.1-6.6v9.1H3.6z" />
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
  'TikTok':        { fundo: '#010101', tinta: '#25F4EE', Glifo: GlifoTikTok },
  'Shopee':        { fundo: '#EE4D2D', tinta: '#ffffff', Glifo: GlifoShopee },
  // O amarelo do Mercado Livre é claro demais para glifo branco: o
  // contraste ficaria em 1,3:1 e a mãozinha sumiria. Vai o azul da marca.
  'Mercado Livre': { fundo: '#FFE600', tinta: '#2D3277', Glifo: Handshake },
  'Amazon':        { fundo: '#232F3E', tinta: '#FF9900', Glifo: GlifoAmazon },
  'Magalu':        { fundo: '#0086FF', tinta: '#ffffff', Glifo: GlifoMagalu },
  // Daqui para baixo não são marcas, são jeitos de vender — e aí o
  // desenho genérico é o certo: a loja, o telefone, quem indicou.
  'Presencial':    { fundo: '#64748b', tinta: '#ffffff', Glifo: Store },
  'Telefone':      { fundo: '#0ea5e9', tinta: '#ffffff', Glifo: Phone },
  // Estrela não dava: a mesma estrela já é a nota do cliente no PDV, e
  // duas coisas diferentes com o mesmo desenho na mesma tela confundem.
  'Indicação':     { fundo: '#f59e0b', tinta: '#ffffff', Glifo: UserPlus },
  'Outro':         { fundo: '#475569', tinta: '#cbd5e1', Glifo: MoreHorizontal },
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
