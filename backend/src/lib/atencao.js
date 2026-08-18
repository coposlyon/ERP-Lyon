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
// `passo` é a posição na linha do tempo da tela de detalhes. Só as
// etapas do caminho oficial têm passo; as antigas e as de "em processo"
// ficam de fora da régua para não criar bolinha repetida — elas ainda
// são status válidos, só não desenham um balão próprio.
//
// `icone` é o nome do ícone lucide que a tela usa naquele balão.
const STATUS = {
  iniciando_pedido:      { label: 'Pedido realizado',            area: 'comercial',  aguardando: false, cor: 'verde',   passo: 1,  icone: 'CircleCheck' },
  aguardando_financeiro: { label: 'Aguardando financeiro',       area: 'financeiro', aguardando: true,  cor: 'amarelo', passo: 2,  icone: 'Wallet' },
  pagamento_confirmado:  { label: 'Pagamento confirmado',        area: 'financeiro', aguardando: false, cor: 'verde',   passo: 3,  icone: 'CircleCheck' },
  aguardando_estoque:    { label: 'Aguardando estoque',          area: 'estoque',    aguardando: true,  cor: 'laranja', passo: 4,  icone: 'Hourglass' },
  estoque_confirmado:    { label: 'Estoque confirmado',          area: 'estoque',    aguardando: false, cor: 'azul',    passo: 5,  icone: 'Package' },
  aguardando_arte:       { label: 'Aguardando anexo da arte',    area: 'arte',       aguardando: true,  cor: 'amarelo', passo: 6,  icone: 'Hourglass' },
  arte_aprovada:         { label: 'Arte anexada e aprovada',     area: 'arte',       aguardando: false, cor: 'roxo',    passo: 7,  icone: 'PenTool' },

  aguardando_vegetal:    { label: 'Aguardando impressão de vegetal', area: 'producao', aguardando: true,  cor: 'azul',  passo: 8,  icone: 'FileImage' },
  vegetal_impresso:      { label: 'Vegetal impresso',            area: 'producao',   aguardando: false, cor: 'azul',    passo: 9,  icone: 'FileCheck' },

  aguardando_revelacao:  { label: 'Aguardando revelação',        area: 'producao',   aguardando: true,  cor: 'roxo',    passo: 10, icone: 'FlaskConical' },
  revelacao_processo:    { label: 'Revelação em processo',       area: 'producao',   aguardando: false, cor: 'roxo' },
  revelacao_finalizada:  { label: 'Revelação finalizada',        area: 'producao',   aguardando: false, cor: 'roxo',    passo: 11, icone: 'FileCheck' },

  aguardando_pintura:    { label: 'Aguardando pintura',          area: 'producao',   aguardando: true,  cor: 'rosa',    passo: 12, icone: 'Brush' },
  pintura_processo:      { label: 'Pintura em processo',         area: 'producao',   aguardando: false, cor: 'rosa' },
  pintura_finalizada:    { label: 'Pintura finalizada',          area: 'producao',   aguardando: false, cor: 'rosa',    passo: 13, icone: 'CircleCheck' },

  aguardando_borda:      { label: 'Aguardando aplicação de borda', area: 'producao', aguardando: true,  cor: 'ciano',   passo: 14, icone: 'CircleDashed' },
  borda_processo:        { label: 'Borda em processo',           area: 'producao',   aguardando: false, cor: 'ciano' },
  borda_finalizada:      { label: 'Borda finalizada',            area: 'producao',   aguardando: false, cor: 'ciano',   passo: 15, icone: 'GlassWater' },

  aguardando_gravacao:   { label: 'Aguardando gravação',         area: 'producao',   aguardando: true,  cor: 'ciano' },
  gravacao_processo:     { label: 'Gravação em processo',        area: 'producao',   aguardando: false, cor: 'ciano' },
  gravacao_finalizada:   { label: 'Gravação finalizada',         area: 'producao',   aguardando: false, cor: 'ciano' },

  aguardando_producao:   { label: 'Aguardando produção',         area: 'producao',   aguardando: true,  cor: 'azul',    passo: 16, icone: 'Settings' },
  producao_processo:     { label: 'Produção em processo',        area: 'producao',   aguardando: false, cor: 'azul' },
  producao_finalizada:   { label: 'Produção finalizada',         area: 'producao',   aguardando: false, cor: 'azul',    passo: 17, icone: 'Settings' },

  aguardando_embalagem:  { label: 'Aguardando embalagem',        area: 'producao',   aguardando: true,  cor: 'laranja', passo: 18, icone: 'PackageOpen' },
  embalando_pedido:      { label: 'Embalando pedido',            area: 'producao',   aguardando: false, cor: 'laranja' },
  embalagem_finalizada:  { label: 'Embalagem finalizada',        area: 'producao',   aguardando: false, cor: 'laranja', passo: 19, icone: 'Package' },

  aguardando_qualidade:  { label: 'Aguardando controle de qualidade', area: 'qualidade', aguardando: true,  cor: 'roxo', passo: 20, icone: 'ShieldQuestion' },
  conferencia_processo:  { label: 'Em processo de conferência',  area: 'qualidade',  aguardando: false, cor: 'roxo' },
  qualidade_finalizada:  { label: 'Controle de qualidade finalizado', area: 'qualidade', aguardando: false, cor: 'roxo', passo: 21, icone: 'ShieldCheck' },

  // A foto do produto pronto vai ao cliente antes de o pedido sair —
  // é a última chance de pegar um erro enquanto a caixa ainda está aqui.
  aguardando_foto:       { label: 'Aguardando foto',             area: 'qualidade',  aguardando: true,  cor: 'roxo',    passo: 22, icone: 'Camera' },
  foto_enviada:          { label: 'Foto enviada',                area: 'comercial',  aguardando: false, cor: 'ciano',   passo: 23, icone: 'ImageUp' },

  aguardando_logistica:  { label: 'Aguardando logística',        area: 'logistica',  aguardando: true,  cor: 'verde' },
  aguardando_coleta:     { label: 'Aguardando coleta / retirada', area: 'logistica', aguardando: true,  cor: 'verde',   passo: 24, icone: 'Truck' },
  coleta_processo:       { label: 'Em processo de coleta / retirada', area: 'logistica', aguardando: false, cor: 'verde' },
  mercadoria_coletada:   { label: 'Coleta realizada',            area: 'logistica',  aguardando: false, cor: 'verde',   passo: 25, icone: 'PackageCheck' },
  produto_retirado:      { label: 'Produto retirado',            area: 'logistica',  aguardando: false, cor: 'verde' },
  em_transito:           { label: 'Em trânsito',                 area: 'logistica',  aguardando: false, cor: 'ciano',   passo: 26, icone: 'Truck' },
  aguardando_entrega:    { label: 'Aguardando entrega',          area: 'logistica',  aguardando: true,  cor: 'vermelho', passo: 27, icone: 'PackageSearch' },

  entregue:              { label: 'Pedido entregue',             area: 'logistica',  aguardando: false, cor: 'verde', final: true, passo: 28, icone: 'PackageCheck' },
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

/** As etapas que desenham balão na linha do tempo, na ordem do fluxo. */
const PASSOS = Object.entries(STATUS)
  .filter(([, v]) => v.passo)
  .map(([key, v]) => ({ key, ...v }))
  .sort((a, b) => a.passo - b.passo);

/**
 * A linha do tempo do pedido.
 *
 * O estado de cada balão sai de duas fontes que se completam: o
 * production_log, que diz por onde o pedido JÁ passou e quando, e o
 * status atual, que diz onde ele está agora. Só o status não bastaria
 * (não teria as datas), e só o log também não (um pedido recém-criado
 * ainda não tem log nenhum).
 *
 * Um pedido que pulou etapas — e a maioria pula, porque o caminho
 * depende do produto — deixa os balões não visitados como 'pendente'.
 * Não se inventa data para eles.
 *
 * @param venda   linha de VENDAS (status + production_log)
 * @returns [{ passo, key, label, icone, cor, estado, at, user }]
 *          estado: 'concluido' | 'atual' | 'pendente'
 */
function linhaDoTempo(venda) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];

  // Quando cada etapa aconteceu. Primeira ocorrência vence: se o pedido
  // voltou de etapa, a data que interessa é a de quando chegou lá.
  const quando = new Map();
  for (const e of log) {
    const k = e.action || e.status;
    if (k && !quando.has(k)) quando.set(k, { at: e.at || null, user: e.user || null });
  }
  // A criação do pedido é o passo 1 e nem sempre está no log.
  if (!quando.has('iniciando_pedido') && venda?.created_at) {
    quando.set('iniciando_pedido', { at: venda.created_at, user: null });
  }

  const atual = infoStatus(venda?.status);
  const passoAtual = atual.passo || 0;

  return PASSOS.map(p => {
    const visita = quando.get(p.key) || null;
    let estado;
    if (p.key === venda?.status) estado = 'atual';
    else if (visita) estado = 'concluido';
    // Passou do ponto sem registro no log: a etapa ficou para trás
    // (pulada ou registrada antes de o log existir).
    else if (passoAtual && p.passo < passoAtual) estado = 'concluido';
    else estado = 'pendente';

    return {
      passo: p.passo, key: p.key, label: p.label, icone: p.icone, cor: p.cor,
      area: p.area, estado,
      at: visita?.at || null,
      user: visita?.user || null,
    };
  });
}

/** O histórico em ordem cronológica, para a lista embaixo da tela. */
function historicoPedido(venda) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];
  const linhas = log
    .filter(e => e.action || e.status)
    .map(e => {
      const k = e.action || e.status;
      const info = infoStatus(k);
      return { key: k, label: info.label, cor: info.cor, at: e.at || null, user: e.user || null, stage: e.stage || null };
    });

  if (venda?.created_at && !linhas.some(l => l.key === 'iniciando_pedido')) {
    const info = infoStatus('iniciando_pedido');
    linhas.unshift({ key: 'iniciando_pedido', label: info.label, cor: info.cor, at: venda.created_at, user: null, stage: 'criacao' });
  }

  return linhas.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
}


/**
 * AS FASES DO PEDIDO — a linha do tempo como ela deve ser lida.
 *
 * O catálogo de STATUS tem duas entradas por etapa ("aguardando arte" e
 * "arte aprovada"), porque é assim que o chão de fábrica marca o
 * andamento. Desenhar isso como vinte e oito bolinhas fazia a tela
 * contar a mesma coisa duas vezes e o pedido parecer o dobro de longe
 * do fim do que está.
 *
 * Aqui cada etapa é UMA fase, e o estado dela é que muda:
 *
 *   pendente   ainda não chegou      (roxo/azul)
 *   atual      está acontecendo agora (amarelo/laranja)
 *   concluido  já passou              (verde)
 *
 * Nunca se pinta de verde uma fase que ainda não aconteceu.
 *
 * PINTURA e BORDA só entram quando o pedido passa por elas — quem
 * decide é o que foi contratado nos itens, não um palpite. Pedido
 * tradicional sem borda simplesmente não mostra as duas.
 */
const FASES = [
  { key: 'realizado',  label: 'Pedido Realizado',      icone: 'CircleCheck',    entrando: [],                        concluida: ['iniciando_pedido'] },
  { key: 'pagamento',  label: 'Pagamento',             icone: 'Wallet',         entrando: ['aguardando_financeiro'], concluida: ['pagamento_confirmado'] },
  { key: 'estoque',    label: 'Estoque',               icone: 'Package',        entrando: ['aguardando_estoque'],    concluida: ['estoque_confirmado'] },
  { key: 'arte',       label: 'Arte',                  icone: 'PenTool',        entrando: ['aguardando_arte'],       concluida: ['arte_aprovada'] },
  { key: 'vegetal',    label: 'Vegetal',               icone: 'FileImage',      entrando: ['aguardando_vegetal'],    concluida: ['vegetal_impresso'] },
  { key: 'revelacao',  label: 'Revelação',            icone: 'FlaskConical',   entrando: ['aguardando_revelacao'],  concluida: ['revelacao_finalizada'] },
  { key: 'pintura',    label: 'Pintura',               icone: 'Brush',          entrando: ['aguardando_pintura'],    concluida: ['pintura_finalizada'],   opcional: 'pintura' },
  { key: 'borda',      label: 'Borda',                 icone: 'CircleDashed',   entrando: ['aguardando_borda'],      concluida: ['borda_finalizada'],     opcional: 'borda' },
  { key: 'producao',   label: 'Produção',             icone: 'Settings',       entrando: ['aguardando_producao'],   concluida: ['producao_finalizada'] },
  { key: 'embalagem',  label: 'Embalagem',             icone: 'PackageOpen',    entrando: ['aguardando_embalagem'],  concluida: ['embalagem_finalizada'] },
  { key: 'qualidade',  label: 'Controle de Qualidade', icone: 'ShieldCheck',    entrando: ['aguardando_qualidade'],  concluida: ['qualidade_finalizada'] },
  { key: 'foto',       label: 'Foto',                  icone: 'Camera',         entrando: ['aguardando_foto'],       concluida: ['foto_enviada'] },
  { key: 'coleta',     label: 'Coleta',                icone: 'Truck',          entrando: ['aguardando_coleta'],     concluida: ['mercadoria_coletada', 'produto_retirado'] },
  { key: 'transito',   label: 'Em Trânsito',           icone: 'Truck',          entrando: ['em_transito'],           concluida: [] },
  // O fim da régua é "Pedido Entregue", nunca "Finalizado": finalizado é
  // controle interno, entregue é o que aconteceu com o cliente.
  { key: 'entrega',    label: 'Pedido Entregue',       icone: 'PackageCheck',   entrando: ['aguardando_entrega'],    concluida: ['entregue', 'pedido_finalizado'] },
];

/**
 * A linha do tempo por fases.
 *
 * O estado de cada fase sai de duas fontes que se completam: o
 * production_log, que diz por onde o pedido JÁ passou e quando, e o
 * status atual, que diz onde ele está agora. Só o status não bastaria
 * (não teria as datas), e só o log também não (pedido recém-criado
 * ainda não tem log nenhum).
 *
 * @param venda      linha de VENDAS (status + production_log)
 * @param aplicaveis { borda, pintura } — de etapasDosItens()
 */
function fasesDoPedido(venda, aplicaveis = {}) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];

  // Quando cada status aconteceu. Primeira ocorrência vence: se o pedido
  // voltou de etapa, a data que interessa é a de quando chegou lá.
  const quando = new Map();
  for (const e of log) {
    const k = e.action || e.status;
    if (k && !quando.has(k)) quando.set(k, { at: e.at || null, user: e.user || null });
  }
  if (!quando.has('iniciando_pedido') && venda?.created_at) {
    quando.set('iniciando_pedido', { at: venda.created_at, user: null });
  }

  const status = venda?.status || null;
  const passoAtual = infoStatus(status).passo || 0;

  const visiveis = FASES.filter(f => {
    if (!f.opcional) return true;
    // A fase opcional aparece quando os itens pedem OU quando o pedido
    // de fato passou por ela — histórico antigo manda mais que regra.
    if (aplicaveis[f.opcional]) return true;
    return [...f.entrando, ...f.concluida].some(k => quando.has(k) || k === status);
  });

  return visiveis.map((f, i) => {
    const chaves = [...f.entrando, ...f.concluida];
    const visita = chaves.map(k => quando.get(k)).find(Boolean) || null;
    const maiorPasso = chaves
      .map(k => STATUS[k]?.passo || 0)
      .reduce((a, b) => Math.max(a, b), 0);

    let estado;
    if (chaves.includes(status)) {
      // Está nesta fase. Só conta como concluída se o status é o de
      // saída dela e existe uma fase depois para onde ir.
      estado = f.concluida.includes(status) && f.key === 'entrega' ? 'concluido' : 'atual';
    } else if (maiorPasso && passoAtual > maiorPasso) {
      estado = 'concluido';
    } else if (visita) {
      estado = 'concluido';
    } else {
      estado = 'pendente';
    }

    return {
      ordem: i + 1,
      key: f.key,
      label: f.label,
      icone: f.icone,
      estado,
      at: visita?.at || null,
      user: visita?.user || null,
      // O rótulo miúdo embaixo da bolinha: o status exato dentro da fase.
      detalhe: chaves.includes(status) ? infoStatus(status).label : null,
    };
  });
}

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

module.exports = {
  STATUS, AREAS, PASSOS, FASES,
  infoStatus, listaStatus, finalizado, prazoSaida, calcularAtencao,
  linhaDoTempo, fasesDoPedido, historicoPedido,
};
