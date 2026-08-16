// ============================================================
// Coluna Atenção — o pedido está no prazo ou tem problema?
//
// O nível NÃO fica guardado no banco: ele é a distância entre agora e o
// prazo previsto de saída, e um valor gravado nasceria velho no minuto
// seguinte. Aqui ele é calculado na leitura, sempre.
//
// A régua:
//
//   normal   verde     ninguém está segurando, ou ainda há folga
//   atenção  amarelo   ≤ 2 dias da saída E o pedido parado esperando alguém
//   crítico  vermelho  ≤ 1 dia (24h) E a pendência continua de pé
//
// "Parado esperando alguém" é o que os status "Aguardando ..." dizem:
// aguardando_estoque é o estoque que precisa responder, aguardando_arte
// é o designer. Status "em processo" significa que alguém está com a
// mão nele — não é pendência, é trabalho andando.
//
// Passado o prazo sem sair, é crítico independente de tudo.
// ============================================================

/**
 * O fluxo inteiro da fábrica. Cada status diz três coisas:
 *   label      o que o vendedor lê
 *   area       quem responde por ele (o alerta compartilhado usa isto)
 *   aguardando true = o pedido está parado esperando essa área
 *
 * Nem todo pedido passa por todas as etapas — o caminho depende do
 * produto e dos processos contratados.
 */
const STATUS = {
  iniciando_pedido:      { label: 'Iniciando pedido',            area: 'comercial',  aguardando: false, cor: 'cinza' },
  aguardando_financeiro: { label: 'Aguardando financeiro',       area: 'financeiro', aguardando: true,  cor: 'amarelo' },
  aguardando_estoque:    { label: 'Aguardando estoque',          area: 'estoque',    aguardando: true,  cor: 'laranja' },
  aguardando_arte:       { label: 'Aguardando anexo da arte',    area: 'arte',       aguardando: true,  cor: 'amarelo' },

  aguardando_vegetal:    { label: 'Aguardando impressão de vegetal', area: 'producao', aguardando: true,  cor: 'azul' },
  vegetal_impresso:      { label: 'Vegetal impresso',            area: 'producao',   aguardando: false, cor: 'azul' },

  aguardando_revelacao:  { label: 'Aguardando revelação',        area: 'producao',   aguardando: true,  cor: 'roxo' },
  revelacao_processo:    { label: 'Revelação em processo',       area: 'producao',   aguardando: false, cor: 'roxo' },
  revelacao_finalizada:  { label: 'Revelação finalizada',        area: 'producao',   aguardando: false, cor: 'roxo' },

  aguardando_pintura:    { label: 'Aguardando pintura',          area: 'producao',   aguardando: true,  cor: 'rosa' },
  pintura_processo:      { label: 'Pintura em processo',         area: 'producao',   aguardando: false, cor: 'rosa' },
  pintura_finalizada:    { label: 'Pintura finalizada',          area: 'producao',   aguardando: false, cor: 'rosa' },

  aguardando_borda:      { label: 'Aguardando borda',            area: 'producao',   aguardando: true,  cor: 'ciano' },
  borda_processo:        { label: 'Borda em processo',           area: 'producao',   aguardando: false, cor: 'ciano' },
  borda_finalizada:      { label: 'Borda finalizada',            area: 'producao',   aguardando: false, cor: 'ciano' },

  aguardando_gravacao:   { label: 'Aguardando gravação',         area: 'producao',   aguardando: true,  cor: 'ciano' },
  gravacao_processo:     { label: 'Gravação em processo',        area: 'producao',   aguardando: false, cor: 'ciano' },
  gravacao_finalizada:   { label: 'Gravação finalizada',         area: 'producao',   aguardando: false, cor: 'ciano' },

  aguardando_producao:   { label: 'Aguardando produção',         area: 'producao',   aguardando: true,  cor: 'azul' },
  producao_processo:     { label: 'Produção em processo',        area: 'producao',   aguardando: false, cor: 'azul' },
  producao_finalizada:   { label: 'Produção finalizada',         area: 'producao',   aguardando: false, cor: 'azul' },

  aguardando_embalagem:  { label: 'Aguardando embalagem',        area: 'producao',   aguardando: true,  cor: 'laranja' },
  embalando_pedido:      { label: 'Embalando pedido',            area: 'producao',   aguardando: false, cor: 'laranja' },
  embalagem_finalizada:  { label: 'Embalagem finalizada',        area: 'producao',   aguardando: false, cor: 'laranja' },

  aguardando_qualidade:  { label: 'Aguardando controle de qualidade', area: 'qualidade', aguardando: true,  cor: 'roxo' },
  conferencia_processo:  { label: 'Em processo de conferência',  area: 'qualidade',  aguardando: false, cor: 'roxo' },
  qualidade_finalizada:  { label: 'Controle de qualidade finalizado', area: 'qualidade', aguardando: false, cor: 'roxo' },

  aguardando_logistica:  { label: 'Aguardando logística',        area: 'logistica',  aguardando: true,  cor: 'verde' },
  aguardando_coleta:     { label: 'Aguardando coleta / retirada', area: 'logistica', aguardando: true,  cor: 'verde' },
  coleta_processo:       { label: 'Em processo de coleta / retirada', area: 'logistica', aguardando: false, cor: 'verde' },
  mercadoria_coletada:   { label: 'Mercadoria coletada',         area: 'logistica',  aguardando: false, cor: 'verde' },
  produto_retirado:      { label: 'Produto retirado',            area: 'logistica',  aguardando: false, cor: 'verde' },
  em_transito:           { label: 'Mercadoria em trânsito',      area: 'logistica',  aguardando: false, cor: 'ciano' },

  entregue:              { label: 'Entregue',                    area: 'logistica',  aguardando: false, cor: 'verde', final: true },
  pedido_finalizado:     { label: 'Pedido finalizado',           area: 'comercial',  aguardando: false, cor: 'verde', final: true },

  // Antigos — pedidos gravados antes do fluxo detalhado
  open:          { label: 'Aberto',       area: 'comercial', aguardando: true,  cor: 'amarelo' },
  confirmed:     { label: 'Confirmado',   area: 'comercial', aguardando: false, cor: 'verde' },
  in_production: { label: 'Em produção',  area: 'producao',  aguardando: false, cor: 'azul' },
  ready:         { label: 'Pronto',       area: 'logistica', aguardando: false, cor: 'roxo' },
  delivered:     { label: 'Entregue',     area: 'logistica', aguardando: false, cor: 'verde', final: true },
  completed:     { label: 'Concluído',    area: 'comercial', aguardando: false, cor: 'verde', final: true },
  cancelled:     { label: 'Cancelado',    area: 'comercial', aguardando: false, cor: 'vermelho', final: true },
};

// Nome legível de cada área, para a janelinha da Atenção dizer quem está
// segurando sem falar "producao" em minúsculo.
const AREAS = {
  comercial:  'Comercial',
  financeiro: 'Financeiro',
  estoque:    'Estoque',
  arte:       'Designer / Arte',
  producao:   'Produção',
  qualidade:  'Qualidade',
  logistica:  'Logística',
};

const infoStatus = s => STATUS[s] || { label: s || 'Sem status', area: 'comercial', aguardando: false, cor: 'cinza' };

// Os status que o filtro da tela oferece, na ordem do fluxo.
const listaStatus = () =>
  Object.entries(STATUS)
    .filter(([, v]) => !v.legacyOnly)
    .map(([key, v]) => ({ key, label: v.label, area: v.area, aguardando: v.aguardando, final: !!v.final }));

const finalizado = s => !!infoStatus(s).final;

/**
 * O prazo que vale para a Atenção: a data prevista de SAÍDA. ship_date é
 * a data que a produção combinou; sem ela, a entrega prometida é o que
 * existe. Sem nenhuma das duas, não há prazo a vigiar.
 */
function prazoSaida(venda) {
  return venda.ship_date || venda.delivery_date || venda.max_delivery_date || null;
}

/**
 * O nível de atenção de um pedido.
 *
 * @param venda  linha de VENDAS
 * @param agora  Date (injetável para teste)
 * @param alertaAberto  alerta levantado à mão e ainda não resolvido
 */
function calcularAtencao(venda, agora = new Date(), alertaAberto = null) {
  const info = infoStatus(venda.status);
  const prazo = prazoSaida(venda);

  const base = {
    level: 'normal',
    status: venda.status,
    stage: info.label,
    area: info.area,
    areaLabel: AREAS[info.area] || info.area,
    aguardando: info.aguardando,
    due_date: prazo,
    hours_left: null,
    days_left: null,
    reason: null,
    alerta_id: alertaAberto?.id || null,
  };

  // Pedido fechado não tem prazo a vigiar.
  if (info.final) return { ...base, reason: 'Pedido concluído' };

  if (prazo) {
    // 18h é a hora que a saída costuma fechar; serve para a contagem
    // regressiva em horas que a janelinha mostra.
    const saida = new Date(`${String(prazo).slice(0, 10)}T18:00:00`);
    base.hours_left = Math.round((saida - agora) / 36e5);

    // O NÍVEL, porém, sai de dias no calendário, não de horas. Quem diz
    // "faltam 2 dias" no dia 13 está falando do dia 15, não de 48 horas
    // cravadas — contar por hora deixaria o pedido verde numa segunda de
    // manhã para virar amarelo à tarde, sem nada ter mudado.
    const zero = d => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
    const [y, m, d] = String(prazo).slice(0, 10).split('-').map(Number);
    base.days_left = Math.round((Date.UTC(y, m - 1, d) - zero(agora)) / 864e5);
  }

  // Alerta levantado por alguém vale como pendência, mesmo que o status
  // diga "em processo": se o vendedor avisou que tem problema, tem.
  const pendencia = info.aguardando || !!alertaAberto;
  base.reason = alertaAberto?.reason
    || (info.aguardando ? `Parado em ${AREAS[info.area] || info.area}` : null);

  if (!pendencia) return base;
  if (base.days_left == null) {
    // Sem prazo cadastrado não dá para dizer que está atrasado — mas há
    // pendência, e esconder isso seria pior.
    return { ...base, level: 'atencao', reason: `${base.reason} · sem prazo de saída cadastrado` };
  }

  if (base.days_left <= 1) return { ...base, level: 'critico' };
  if (base.days_left <= 2) return { ...base, level: 'atencao' };
  return base;
}

module.exports = { STATUS, AREAS, infoStatus, listaStatus, finalizado, prazoSaida, calcularAtencao };
