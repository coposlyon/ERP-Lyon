// Textos e opções do site (loja). O lojista pode sobrescrever em Configurações → Site.
// O backend devolve EMPRESAS.settings.site; aqui ficam os valores padrão.
export const SITE_DEFAULTS = {
  show_3d: true,                                   // mostra o botão/estúdio "Personalizar em 3D"
  hero_badge: '✦ COPOS & GARRAFAS PERSONALIZADOS',
  hero_title: 'A SUA FESTA COM MUITO MAIS ESTILO!',
  hero_subtitle: 'Dezenas de cores, degradês e impressão de alta definição. Monte seu pedido e receba o orçamento na hora — sem complicação.',
  btn_3d: 'Personalizar em 3D',
  btn_catalog: 'Ver catálogo',
  pillars_title: 'Por que a sua marca merece',
  pillars_subtitle: 'Produto premium + personalização de verdade. É a sua identidade na mão do cliente todo dia.',
  colors_title: 'Escolha a sua cor',
  colors_subtitle: 'Opacas, translúcidas e degradês. Tem cor pra toda identidade visual.',
  studio_title: 'Crie seu copo em 3D',
  studio_subtitle: 'Escolha o modelo, pinte cada parte, aplique sua logo e veja girando em tempo real. Depois é só pedir o orçamento.',
  catalog_badge: 'NOSSOS PRODUTOS',
  catalog_title: 'Monte seu pedido',
  benefit_1_title: 'Parcelamento',
  benefit_1_text: 'Em até 10X',
  benefit_2_title: 'Pagamento à Vista',
  benefit_2_text: '10% de desconto no PIX',
  benefit_3_title: 'Enviamos',
  benefit_3_text: 'para todo o Brasil',
  cta_title: 'Pronto pra estampar a sua marca?',
  cta_subtitle: 'Monte o pedido em minutos e receba seu orçamento sem compromisso.',
  cta_button: 'Começar agora',
  // Redes sociais na loja (sem API):
  //  - facebook_page_url: endereço da Página → vira o plugin oficial do Facebook.
  //  - instagram_embed: código do widget do Instagram (SnapWidget/LightWidget/etc.).
  facebook_page_url: '',
  instagram_embed: '',
  // Rodapé da loja. Vazio = usa o padrão (texto abaixo) ou os dados da empresa
  // (telefone/e-mail cadastrados em EMPRESAS). Os links viram ícones clicáveis.
  footer_about: 'Copos e garrafas personalizados. Personalize do seu jeito, com a cara da sua marca.',
  footer_phone: '',      // vazio → usa o telefone da empresa
  footer_email: '',      // vazio → usa o e-mail da empresa
  footer_instagram: '',  // @handle ou URL; vazio → não mostra a linha do Instagram
  footer_whatsapp: '',   // só dígitos ou com DDI; vira link wa.me
  footer_facebook: '',   // URL da Página; vazio → usa o facebook_page_url (redes)
};

// Campos do rodapé editáveis em Configurações → Site → Rodapé
export const FOOTER_FIELDS = [
  ['footer_about', 'Texto "sobre" (ao lado do logo)', 'textarea', ''],
  ['footer_phone', 'Telefone', 'text', 'usa o telefone da empresa'],
  ['footer_email', 'E-mail', 'text', 'usa o e-mail da empresa'],
  ['footer_instagram', 'Instagram (@ ou link)', 'text', '@sualoja'],
  ['footer_whatsapp', 'WhatsApp (com DDD)', 'text', 'ex.: 43 99952-3972'],
  ['footer_facebook', 'Facebook (link da Página)', 'text', 'usa o Facebook das Redes'],
];

// ── Conteúdo editável da home (com fallback = comportamento atual) ──
// Cada garrafa do hero: { image_url } (foto enviada) OU { color, gradient } (SVG).
export const DEFAULT_HERO_BOTTLES = [
  { color: '#FFD400', gradient: true },
  { color: '#EC1C8E', gradient: true },
  { color: '#1E4FD8', gradient: true },
  { color: '#2BB7B3', gradient: true },
  { color: '#F26522', gradient: true },
];

export const DEFAULT_MARQUEE = ['PERSONALIZADO', '20 CORES', 'DEGRADÊ', 'ALTA DEFINIÇÃO', 'BPA FREE', '500ML', 'SUA MARCA'];

export const DEFAULT_BENEFITS = [
  { icon: 'card',  title: 'Parcelamento',       text: 'Em até 10X' },
  { icon: 'pix',   title: 'Pagamento à Vista',  text: '10% de desconto no PIX' },
  { icon: 'truck', title: 'Enviamos',           text: 'para todo o Brasil' },
];

export const DEFAULT_PILLARS = [
  { icon: 'shield', title: 'Qualidade Premium',     text: 'Material resistente, BPA free e tampa rosqueável com bico flip.', color: '#F26522' },
  { icon: 'print',  title: 'Alta Definição',        text: 'Impressão nítida da sua logo, em cores vibrantes que não desbotam.', color: '#1E4FD8' },
  { icon: 'wand',   title: 'Personalização Total',  text: 'Você escolhe cor, quantidade e arte. Do seu jeito, com a sua cara.', color: '#EC1C8E' },
];

export const DEFAULT_STATS = [
  { value: '40+',   label: 'Cores disponíveis' },
  { value: '500ml', label: 'Capacidade' },
  { value: '100%',  label: 'BPA Free' },
  { value: '48h',   label: 'Resposta rápida' },
];

// Seções reordenáveis/ocultáveis (o HERO fica fixo no topo, sempre visível).
export const SECTION_LABELS = {
  marquee:  'Faixa de diferenciais',
  benefits: 'Benefícios (parcelamento / PIX / envio)',
  stats:    'Números (estatísticas)',
  pillars:  'Pilares (por que comprar)',
  colors:   'Mural de cores',
  studio:   'Banner do Estúdio 3D',
  catalog:  'Catálogo de produtos',
  social:   'Redes sociais',
  cta:      'Chamada final (CTA)',
};
export const SECTION_ORDER = ['marquee', 'benefits', 'stats', 'pillars', 'colors', 'studio', 'catalog', 'social', 'cta'];
export const DEFAULT_SECTIONS = SECTION_ORDER.map(key => ({ key, visible: true }));

// Normaliza a config de seções: mantém a ordem salva e garante que toda seção
// conhecida apareça (novas seções entram no fim), ignorando chaves desconhecidas.
export function resolveSections(saved) {
  const known = new Set(SECTION_ORDER);
  const seen = new Set();
  const out = [];
  for (const s of (Array.isArray(saved) ? saved : [])) {
    if (s && known.has(s.key) && !seen.has(s.key)) { out.push({ key: s.key, visible: s.visible !== false }); seen.add(s.key); }
  }
  for (const key of SECTION_ORDER) if (!seen.has(key)) out.push({ key, visible: true });
  return out;
}

// Campos editáveis na tela de Configurações (label + tipo)
export const SITE_FIELDS = [
  ['hero_badge', 'Selo do topo (badge)', 'text'],
  ['hero_title', 'Título principal (hero)', 'text'],
  ['hero_subtitle', 'Subtítulo do hero', 'textarea'],
  ['btn_3d', 'Texto do botão 3D', 'text'],
  ['btn_catalog', 'Texto do botão "Ver catálogo"', 'text'],
  ['pillars_title', 'Título da seção de pilares', 'text'],
  ['pillars_subtitle', 'Descrição dos pilares', 'textarea'],
  ['colors_title', 'Título da seção de cores', 'text'],
  ['colors_subtitle', 'Descrição das cores', 'textarea'],
  ['studio_title', 'Título do banner 3D', 'text'],
  ['studio_subtitle', 'Descrição do banner 3D', 'textarea'],
  ['catalog_badge', 'Selo do catálogo', 'text'],
  ['catalog_title', 'Título do catálogo', 'text'],
  ['benefit_1_title', 'Benefício 1 — título', 'text'],
  ['benefit_1_text', 'Benefício 1 — descrição', 'text'],
  ['benefit_2_title', 'Benefício 2 — título', 'text'],
  ['benefit_2_text', 'Benefício 2 — descrição', 'text'],
  ['benefit_3_title', 'Benefício 3 — título', 'text'],
  ['benefit_3_text', 'Benefício 3 — descrição', 'text'],
  ['cta_title', 'Título do CTA final', 'text'],
  ['cta_subtitle', 'Descrição do CTA final', 'textarea'],
  ['cta_button', 'Texto do botão do CTA', 'text'],
];
