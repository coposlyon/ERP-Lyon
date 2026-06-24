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
  cta_title: 'Pronto pra estampar a sua marca?',
  cta_subtitle: 'Monte o pedido em minutos e receba seu orçamento sem compromisso.',
  cta_button: 'Começar agora',
};

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
  ['cta_title', 'Título do CTA final', 'text'],
  ['cta_subtitle', 'Descrição do CTA final', 'textarea'],
  ['cta_button', 'Texto do botão do CTA', 'text'],
];
