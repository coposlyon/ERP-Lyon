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

  // O VEGETAL É DO DESIGNER, e não da produção: é o filme impresso que
  // a serigrafia vai usar para gravar a tela. Quem imprime é quem
  // desenha. `vegetal_processo` é o "estou imprimindo agora" — sem ele
  // o Designer não teria iniciar/finalizar como as outras etapas.
  aguardando_vegetal:    { label: 'Aguardando impressão de vegetal', area: 'designer', aguardando: true,  cor: 'azul',  passo: 8,  icone: 'FileImage' },
  vegetal_processo:      { label: 'Imprimindo vegetal',          area: 'designer',   aguardando: false, cor: 'azul' },
  vegetal_impresso:      { label: 'Vegetal impresso',            area: 'designer',   aguardando: false, cor: 'azul',    passo: 9,  icone: 'FileCheck' },

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

  // METALIZACAO E ACABAMENTO DENTRO DA PRODUCAO.
  //
  // Ela e uma das cinco etapas do quadro da fabrica, mas nao e uma fase
  // da regua do pedido - por isso nao tem `passo`. Existe aqui so para
  // o pedido PODER DIZER "em metalizacao" enquanto esta nela: antes, a
  // fabrica via "Em Metalizacao" no quadro e o comercial e o cliente
  // continuavam lendo "Aguardando producao", que ja nao era verdade.
  metalizacao_processo:  { label: 'Em metalização',              area: 'producao',   aguardando: false, cor: 'ciano' },

  aguardando_producao:   { label: 'Aguardando produção',         area: 'producao',   aguardando: true,  cor: 'azul',    passo: 16, icone: 'Settings' },
  producao_processo:     { label: 'Produção em processo',        area: 'producao',   aguardando: false, cor: 'azul' },
  producao_finalizada:   { label: 'Produção finalizada',         area: 'producao',   aguardando: false, cor: 'azul',    passo: 17, icone: 'Settings' },

  aguardando_embalagem:  { label: 'Aguardando embalagem',        area: 'producao',   aguardando: true,  cor: 'laranja', passo: 22, icone: 'PackageOpen' },
  embalando_pedido:      { label: 'Embalando pedido',            area: 'producao',   aguardando: false, cor: 'laranja' },
  embalagem_finalizada:  { label: 'Embalagem finalizada',        area: 'producao',   aguardando: false, cor: 'laranja', passo: 23, icone: 'Package' },

  aguardando_qualidade:  { label: 'Aguardando controle de qualidade', area: 'qualidade', aguardando: true,  cor: 'roxo', passo: 18, icone: 'ShieldQuestion' },
  conferencia_processo:  { label: 'Em processo de conferência',  area: 'qualidade',  aguardando: false, cor: 'roxo' },
  qualidade_finalizada:  { label: 'Controle de qualidade finalizado', area: 'qualidade', aguardando: false, cor: 'roxo', passo: 19, icone: 'ShieldCheck' },

  // A foto do produto pronto vai ao cliente antes de o pedido sair —
  // é a última chance de pegar um erro enquanto a caixa ainda está aqui.
  aguardando_foto:       { label: 'Aguardando foto',             area: 'qualidade',  aguardando: true,  cor: 'roxo',    passo: 20, icone: 'Camera' },
  foto_enviada:          { label: 'Foto enviada',                area: 'comercial',  aguardando: false, cor: 'ciano',   passo: 21, icone: 'ImageUp' },

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
  designer:   'Designer',
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
/**
 * O pedido é para RETIRAR, e não para entregar?
 *
 * A coluna `delivery_mode` (migração 090) é a resposta declarada. O
 * texto em `notes` é a resposta de todos os pedidos gravados antes de
 * a coluna existir — o catálogo escrevia "Retirada no local" ali desde
 * sempre. Ler os dois evita reescrever o passado para ganhar o futuro.
 */
function ehRetirada(venda) {
  const modo = String(venda?.delivery_mode || '').toLowerCase();
  if (modo) return modo === 'retirada';
  return /retirada no local/i.test(String(venda?.notes || ''));
}

// O QUE NÃO ACONTECE QUANDO O CLIENTE VEM BUSCAR.
//
// Não há coleta, não há caminhão e não há entrega no endereço: o
// pedido fica pronto, o cliente vem, e acabou. Deixar as três na tela
// faz o cliente esperar um caminhão que não vai sair.
const SO_NA_ENTREGA = ['mercadoria_coletada', 'em_transito', 'aguardando_entrega'];

// Na retirada, duas etapas mudam de nome — a mesma etapa, dita do jeito
// que aconteceu com ELE.
const ROTULO_RETIRADA = {
  aguardando_coleta: 'Aguardando retirada',
  entregue: 'Pedido entregue',
};

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
 * Esta é a régua DETALHADA, com "aguardando X" e "X finalizado" como
 * balões separados — é a que a tela do cliente usa. Quem acompanha a
 * própria compra quer ver cada movimentação; quem trabalha o dia
 * inteiro na tela quer o resumo, e para esse existe fasesDoPedido().
 *
 * @param venda      linha de VENDAS (status + production_log)
 * @param aplicaveis { borda, pintura, personalizado } — de etapasDosItens()
 * @param opcoes     { doItem } — a régua de UM item, e não a do pedido
 * @returns [{ passo, key, label, icone, cor, estado, at, user }]
 *          estado: 'concluido' | 'atual' | 'pendente'
 */
function linhaDoTempo(venda, aplicaveis = {}, opcoes = {}) {
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

  /**
   * "EM PROCESSO" ACENDE O BALÃO DA ETAPA — e não nenhum.
   *
   * Os status de meio ("Revelação em processo", "Embalando pedido") não
   * têm número na régua: são a mesma etapa, dita de outro jeito. Só que
   * a régua comparava `p.key === venda.status` e, com o pedido em
   * `revelacao_processo`, NENHUM balão acendia — a fábrica estava com a
   * mão no copo e a tela do cliente mostrava tudo apagado, como se o
   * pedido tivesse sumido entre duas etapas.
   *
   * Agora o "em processo" acende o balão do "aguardando" da mesma fase,
   * com a marca `em_processo` para a tela dizer "em andamento" em vez de
   * "aguardando".
   */
  const emProcessoDe = PROCESSO_DA_FASE[venda?.status]
    ? (FASES.find(f => f.key === PROCESSO_DA_FASE[venda?.status])?.entrando || [])[0] || null
    : null;
  const statusNaRegua = emProcessoDe || venda?.status;
  const atual = infoStatus(statusNaRegua);
  const passoAtual = atual.passo || 0;

  // Pintura e borda só entram quando o pedido passa por elas. Um pedido
  // tradicional sem borda que mostrasse as duas apagadas faria o cliente
  // esperar por uma etapa que nunca vai acontecer.
  //
  // A SERIGRAFIA ENTRA NA MESMA REGRA — e faltava aqui.
  //
  // `fasesVisiveis` (a régua resumida, do vendedor) já sabia que arte,
  // vegetal e revelação só existem onde há o que gravar. Esta, a régua
  // detalhada que o CLIENTE lê, não sabia: ela só conhecia pintura e
  // borda, e por isso um copo liso mostrava "Aguardando anexo da arte",
  // "Vegetal impresso" e "Revelação finalizada" na linha do tempo dele.
  // O cliente de cem copos lisos ficava esperando uma arte que ninguém
  // ia pedir. Duas réguas, duas respostas para a mesma pergunta — e a
  // que o cliente via era a errada.
  const OPCIONAIS = {
    aguardando_arte:      'personalizado', arte_aprovada:        'personalizado',
    aguardando_vegetal:   'personalizado', vegetal_impresso:     'personalizado',
    aguardando_revelacao: 'personalizado', revelacao_finalizada: 'personalizado',
    aguardando_pintura:   'pintura',       pintura_finalizada:   'pintura',
    aguardando_borda:     'borda',         borda_finalizada:     'borda',
  };
  const retirada = ehRetirada(venda);

  /**
   * A RÉGUA É GLOBAL: TODO PEDIDO TEM TODOS OS STATUS, NOS MESMOS NÚMEROS.
   *
   * Até aqui a linha do tempo ESCONDIA as etapas que o pedido não tinha
   * (pintura, borda, serigrafia no copo liso) e renumerava o resto de
   * 1 até N. O efeito: "estou na etapa 8" queria dizer coisas diferentes
   * em pedidos diferentes, e o número que o cliente lia no portal não
   * era o que a fábrica lia na fila. Um código de status que muda de
   * pedido para pedido não é um código.
   *
   * Agora a numeração é a do catálogo, fixa: revelação é 10 em todo
   * pedido do sistema. As etapas que este pedido não tem CONTINUAM na
   * régua, marcadas "não se aplica" — presentes, no lugar delas,
   * apagadas. O copo liso não fica esperando arte (isso foi reclamado e
   * continua resolvido): ele mostra a arte como algo que não é dele.
   *
   * `aplica` diz se a etapa é deste pedido. É o que o motor de fluxo já
   * usava para pular a fase; aqui ele só passa a ser dito, e não
   * escondido.
   */
  const seAplica = p => {
    if (retirada && SO_NA_ENTREGA.includes(p.key) && !quando.has(p.key) && p.key !== venda?.status) return false;
    const grupo = OPCIONAIS[p.key];
    if (!grupo) return true;
    if (aplicaveis[grupo]) return true;
    // A régua de um ITEM é o contrato dele, e só: o pedido misto está
    // em "aguardando arte" por causa dos personalizados, e o liso não
    // passa pela serigrafia porque o pedido passa.
    if (opcoes.doItem) return false;
    // No pedido inteiro, o histórico manda mais que a regra: passou por
    // uma etapa, ela é dele.
    return quando.has(p.key) || p.key === venda?.status;
  };

  const visiveis = PASSOS.map(p => ({ ...p, aplica: seAplica(p) }));

  return visiveis.map((p, i) => {
    // Na retirada, "produto retirado" é o fim da linha: o pedido chegou
    // às mãos do cliente, que é exatamente o que "entregue" quer dizer.
    const visita = quando.get(p.key)
      || (retirada && p.key === 'entregue' ? quando.get('produto_retirado') : null)
      || null;
    let estado;
    if (!p.aplica) estado = 'nao_se_aplica';
    else if (p.key === statusNaRegua) estado = 'atual';
    else if (retirada && p.key === 'entregue' && venda?.status === 'produto_retirado') estado = 'atual';
    else if (visita) estado = 'concluido';
    // Passou do ponto sem registro no log: a etapa ficou para trás
    // (pulada ou registrada antes de o log existir).
    else if (passoAtual && p.passo < passoAtual) estado = 'concluido';
    else estado = 'pendente';

    return {
      // `passo` é o NÚMERO GLOBAL do catálogo — o mesmo em todo pedido
      // e em toda tela. `ordem` continua saindo por compatibilidade,
      // mas hoje é igual ao passo: nada mais é escondido.
      ordem: p.passo,
      passo: p.passo, key: p.key,
      label: (retirada && ROTULO_RETIRADA[p.key]) || p.label,
      icone: p.icone, cor: p.cor,
      area: p.area, estado,
      // De quem é esta etapa — a tela pinta o balão com a cor do módulo
      // e agrupa a régua por dono.
      modulo: p.modulo || null,
      modulo_label: p.modulo ? MODULOS_DO_FLUXO[p.modulo]?.label : null,
      aplica: p.aplica,
      // O pedido está com a mão nesta etapa agora (status "em processo").
      em_processo: !!(emProcessoDe && p.key === emProcessoDe),
      em_processo_label: emProcessoDe && p.key === emProcessoDe ? infoStatus(venda?.status).label : null,
      at: visita?.at || null,
      user: visita?.user || null,
    };
  });
}

/** O histórico em ordem cronológica, para a lista embaixo da tela. */
// EVENTOS QUE NAO SAO STATUS DO FLUXO.
//
// O production_log guarda mais do que a caminhada do pedido: guarda
// tambem atos administrativos, como a liberacao do pagamento. Esses nao
// existem no catalogo STATUS - e `infoStatus` devolve a propria CHAVE
// como label para o que nao conhece.
//
// O resultado aparecia na tela do cliente: no meio de "Pagamento
// confirmado" e "Aguardando estoque", uma linha escrita
// "pagamento_liberado". Nome de variavel vazando para quem comprou um
// copo.
const EVENTOS_DO_LOG = {
  pagamento_liberado:  { label: 'Pagamento liberado',  cor: 'verde' },
  pagamento_cancelado: { label: 'Liberacao cancelada', cor: 'vermelho' },
  arte_aprovada:       { label: 'Arte anexada e aprovada', cor: 'roxo' },
  // Chave que este catalogo nao conhece SOME da tela (o filtro abaixo
  // descarta o que nao tem info). Editar o pedido e designar vendedor
  // gravam no mesmo log, e sem estas duas linhas a edicao que mudou o
  // valor do pedido nao aparecia em lugar nenhum.
  pedido_editado:      { label: 'Pedido editado',      cor: 'amarelo' },
  vendedor_designado:  { label: 'Vendedor designado',  cor: 'azul' },
};

const emReais = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A frase que explica a linha do historico, quando ela sozinha nao basta.
 *
 * "Pedido editado" nao diz nada — editado como? Aqui sai o de/para do
 * valor, que e o que qualquer um procura ao ver essa linha.
 *
 * SO O QUE O CLIENTE JA VE. O motivo digitado por quem editou fica de
 * fora de proposito: `historicoPedido` alimenta tambem o portal, e
 * recado interno ("cliente reclamou do prazo") nao e para os olhos de
 * quem comprou. Valor total ele ja tem na propria tela.
 */
function detalheDoEvento(e) {
  const k = e.action || e.status;
  if (k === 'pedido_editado' && e.total_antes != null && e.total_agora != null) {
    return `${emReais(e.total_antes)} → ${emReais(e.total_agora)}`;
  }
  return null;
}

function historicoPedido(venda) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];
  const linhas = log
    .filter(e => e.action || e.status)
    .map(e => {
      const k = e.action || e.status;
      // O catalogo do fluxo primeiro; os atos administrativos depois. Se
      // nem um nem outro souber, some da lista em vez de virar chave
      // crua na tela do cliente.
      const info = STATUS[k] || EVENTOS_DO_LOG[k] || null;
      if (!info) return null;
      return {
        key: k, label: info.label, cor: info.cor, at: e.at || null,
        user: e.user || null, stage: e.stage || null,
        detalhe: detalheDoEvento(e),
      };
    })
    .filter(Boolean);

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
 * A QUALIDADE VEM ANTES DA EMBALAGEM. Confere-se o copo e depois se
 * embala: achar o defeito com a caixa já fechada custa abrir tudo de
 * novo. As duas réguas — esta e a detalhada da tela do cliente — leem a
 * mesma numeração, e por isso a ordem mudou nas duas de uma vez.
 *
 * PINTURA e BORDA só entram quando o pedido passa por elas — quem
 * decide é o que foi contratado nos itens, não um palpite. Pedido
 * tradicional sem borda simplesmente não mostra as duas.
 */
/**
 * OS CINCO MÓDULOS DO FLUXO, E A FATIA DE CADA UM.
 *
 * O pedido percorre uma régua só, de "Pedido realizado" a "Pedido
 * entregue". Mas ninguém trabalha na régua inteira: o financeiro cuida
 * do dinheiro, o comercial do estoque e da arte, o designer do vegetal,
 * a fábrica da serigrafia à embalagem, e a logística do que sai da
 * porta. Cada um abre a SUA tela e vê a SUA fatia — com os mesmos
 * números, os mesmos nomes e os mesmos status de todo mundo.
 *
 * ISTO É A ÚNICA DEFINIÇÃO de quem é dono de quê. As telas de Designer,
 * Produção e Logística são a mesma tela lendo fatias diferentes daqui;
 * o menu lateral segue esta ordem; a linha do tempo do cliente pinta
 * cada balão com a cor do módulo. Um segundo lugar dizendo "vegetal é
 * da produção" seria o dia em que o designer não acha o pedido dele.
 *
 * A ORDEM DESTE OBJETO É A ORDEM DO FLUXO E DO MENU — não mexa nela
 * sem mexer na régua.
 */
const MODULOS_DO_FLUXO = {
  financeiro: { label: 'Financeiro',      modulo: 'financial',  cor: 'amarelo', fases: ['realizado', 'pagamento'] },
  vendas:     { label: 'Pedido de Venda', modulo: 'sales',      cor: 'laranja', fases: ['estoque', 'arte'] },
  designer:   { label: 'Designer',        modulo: 'designer',   cor: 'roxo',    fases: ['vegetal'] },
  producao:   { label: 'Produção',        modulo: 'production', cor: 'azul',    fases: ['revelacao', 'pintura', 'borda', 'producao', 'qualidade', 'foto', 'embalagem'] },
  logistica:  { label: 'Logística',       modulo: 'logistics',  cor: 'verde',   fases: ['coleta', 'transito', 'entrega'] },
};

/** O módulo dono de uma fase ('producao', 'designer'…), ou null. */
function moduloDaFase(faseKey) {
  for (const [k, m] of Object.entries(MODULOS_DO_FLUXO)) {
    if (m.fases.includes(faseKey)) return k;
  }
  return null;
}

const FASES = [
  { key: 'realizado',  label: 'Pedido Realizado',      icone: 'CircleCheck',    entrando: [],                        concluida: ['iniciando_pedido'] },
  { key: 'pagamento',  label: 'Pagamento',             icone: 'Wallet',         entrando: ['aguardando_financeiro'], concluida: ['pagamento_confirmado'] },
  { key: 'estoque',    label: 'Estoque',               icone: 'Package',        entrando: ['aguardando_estoque'],    concluida: ['estoque_confirmado'] },
  // ARTE, VEGETAL E REVELAÇÃO SÃO A SERIGRAFIA — e serigrafia só existe
  // onde há o que gravar. O copo liso não tem arte para aprovar, nem
  // vegetal para imprimir, nem tela para revelar: as três fases ficavam
  // na linha do tempo dele esperando para sempre, e a produção via na
  // fila um pedido que não tinha nada para fazer. `opcional:
  // 'personalizado'` tira as três do trilho do liso — e a mesma regra
  // vale para a tela do cliente, a do vendedor e o motor que move o
  // pedido, porque todos leem daqui.
  { key: 'arte',       label: 'Arte',                  icone: 'PenTool',        entrando: ['aguardando_arte'],       concluida: ['arte_aprovada'],        opcional: 'personalizado' },
  { key: 'vegetal',    label: 'Vegetal',               icone: 'FileImage',      entrando: ['aguardando_vegetal'],    concluida: ['vegetal_impresso'],     opcional: 'personalizado' },
  { key: 'revelacao',  label: 'Revelação',            icone: 'FlaskConical',   entrando: ['aguardando_revelacao'],  concluida: ['revelacao_finalizada'], opcional: 'personalizado' },
  { key: 'pintura',    label: 'Pintura',               icone: 'Brush',          entrando: ['aguardando_pintura'],    concluida: ['pintura_finalizada'],   opcional: 'pintura' },
  { key: 'borda',      label: 'Borda',                 icone: 'CircleDashed',   entrando: ['aguardando_borda'],      concluida: ['borda_finalizada'],     opcional: 'borda' },
  { key: 'producao',   label: 'Produção',             icone: 'Settings',       entrando: ['aguardando_producao'],   concluida: ['producao_finalizada'] },
  { key: 'qualidade',  label: 'Controle de Qualidade', icone: 'ShieldCheck',    entrando: ['aguardando_qualidade'],  concluida: ['qualidade_finalizada'] },
  // A FOTO VEM ANTES DA EMBALAGEM, e não depois.
  //
  // Estava ao contrário: embalar e só então fotografar. A foto é a
  // última conferência antes de a caixa sair — e é o que o cliente vê
  // no portal. Tirá-la depois da embalagem significa, na prática, uma
  // de duas coisas: abrir a caixa de novo, ou fotografar a caixa
  // fechada. As duas acontecem, e as duas são erradas.
  { key: 'foto',       label: 'Foto',                  icone: 'Camera',         entrando: ['aguardando_foto'],       concluida: ['foto_enviada'] },
  { key: 'embalagem',  label: 'Embalagem',             icone: 'PackageOpen',    entrando: ['aguardando_embalagem'],  concluida: ['embalagem_finalizada'] },
  { key: 'coleta',     label: 'Coleta',                icone: 'Truck',          entrando: ['aguardando_coleta'],     concluida: ['mercadoria_coletada', 'produto_retirado'] },
  { key: 'transito',   label: 'Em Trânsito',           icone: 'Truck',          entrando: ['em_transito'],           concluida: [] },
  // O fim da régua é "Pedido Entregue", nunca "Finalizado": finalizado é
  // controle interno, entregue é o que aconteceu com o cliente.
  { key: 'entrega',    label: 'Pedido Entregue',       icone: 'PackageCheck',   entrando: ['aguardando_entrega'],    concluida: ['entregue', 'pedido_finalizado'] },
];

// CADA FASE SABE DE QUEM É — e cada status também, pela fase em que
// mora. `infoStatus(s).modulo` responde "quem trabalha nisto agora?"
// sem ninguém ter de consultar duas tabelas.
for (const f of FASES) f.modulo = moduloDaFase(f.key);
for (const f of FASES) {
  for (const k of [...(f.entrando || []), ...(f.concluida || [])]) {
    if (STATUS[k]) STATUS[k].modulo = f.modulo;
  }
}
// Os "em processo" moram na mesma fase que o seu "aguardando".
const PROCESSO_DA_FASE = {
  vegetal_processo: 'vegetal', revelacao_processo: 'revelacao', pintura_processo: 'pintura',
  borda_processo: 'borda', producao_processo: 'producao', metalizacao_processo: 'producao',
  conferencia_processo: 'qualidade', embalando_pedido: 'embalagem', coleta_processo: 'coleta',
  aguardando_logistica: 'coleta',
};
for (const [k, fase] of Object.entries(PROCESSO_DA_FASE)) {
  if (STATUS[k]) STATUS[k].modulo = moduloDaFase(fase);
}
// PASSOS é uma CÓPIA dos status, montada antes deste ponto — e uma
// cópia não vê o que se escreve no original depois. Anota nela também.
for (const p of PASSOS) p.modulo = STATUS[p.key]?.modulo || null;
// O que a régua ainda não conhece (status antigos) fica sem módulo, e
// `moduloDoStatus` devolve null — que a tela lê como "sem dono".
const moduloDoStatus = st => STATUS[st]?.modulo || null;

/**
 * OS STATUS DE UM MÓDULO, para as filas filtrarem.
 *
 * "A tela da produção mostra o que está na produção" — e o que está na
 * produção é o que tem status de uma fase da produção, incluindo os "em
 * processo". Devolve as chaves de status, prontas para um `.in()`.
 */
function statusDoModulo(moduloKey) {
  const fases = MODULOS_DO_FLUXO[moduloKey]?.fases || [];
  const chaves = new Set();
  for (const f of FASES) {
    if (!fases.includes(f.key)) continue;
    for (const k of f.entrando || []) chaves.add(k);
    // O "concluído" de uma fase ainda é trabalho do módulo até o
    // pedido entrar na fase seguinte — por isso entra também.
    for (const k of f.concluida || []) chaves.add(k);
  }
  for (const [k, fase] of Object.entries(PROCESSO_DA_FASE)) {
    if (fases.includes(fase)) chaves.add(k);
  }
  return [...chaves];
}

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
/**
 * QUANDO cada status deste pedido aconteceu, lido do production_log.
 *
 * Primeira ocorrência vence: se o pedido voltou de etapa para corrigir
 * alguma coisa, a data que interessa é a de quando ele CHEGOU lá, não a
 * da segunda passada.
 */
function visitasDoPedido(venda) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];
  const quando = new Map();
  for (const e of log) {
    const k = e.action || e.status;
    if (k && !quando.has(k)) quando.set(k, { at: e.at || null, user: e.user || null });
  }
  // A criação do pedido é a primeira fase e nem sempre está no log.
  if (!quando.has('iniciando_pedido') && venda?.created_at) {
    quando.set('iniciando_pedido', { at: venda.created_at, user: null });
  }
  return quando;
}

/**
 * O TRILHO DESTE PEDIDO — as fases que ele percorre, nesta ordem.
 *
 * Nem todo pedido passa por todas: pintura e borda dependem do que foi
 * contratado nos itens, e quem vem buscar não tem trânsito. Esta função
 * é a ÚNICA que decide isso. A tela do cliente, a do vendedor e o motor
 * que move o pedido de etapa (lib/fluxoPedido.js) leem todas daqui — um
 * segundo lugar decidindo o mesmo seria o dia em que o botão "avançar"
 * oferece uma etapa que a linha do tempo não mostra.
 */
function fasesVisiveis(venda, aplicaveis = {}, quando = visitasDoPedido(venda)) {
  const status = venda?.status || null;
  const retirada = ehRetirada(venda);
  return FASES.filter(f => {
    // Quem vem buscar não tem trânsito: não sai caminhão nenhum.
    if (retirada && f.key === 'transito'
        && !f.entrando.some(k => quando.has(k) || k === status)) return false;
    if (!f.opcional) return true;
    // A fase opcional aparece quando os itens pedem OU quando o pedido
    // de fato passou por ela — histórico antigo manda mais que regra.
    if (aplicaveis[f.opcional]) return true;
    return [...f.entrando, ...f.concluida].some(k => quando.has(k) || k === status);
  });
}

function fasesDoPedido(venda, aplicaveis = {}) {
  const quando = visitasDoPedido(venda);

  const status = venda?.status || null;
  const passoAtual = infoStatus(status).passo || 0;

  const retirada = ehRetirada(venda);
  const visiveis = fasesVisiveis(venda, aplicaveis, quando);

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
      // Na retirada a fase existe, mas com outro nome: o cliente vem
      // buscar, ninguém coleta.
      label: retirada && f.key === 'coleta' ? 'Retirada' : f.label,
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

/**
 * O PEDIDO JA PASSOU PELO FINANCEIRO?
 *
 * A lista e a das etapas ANTERIORES ao pagamento, e nao a das
 * posteriores: depois do financeiro vem estoque, arte, vegetal,
 * revelacao, pintura, borda, producao, qualidade, embalagem, foto,
 * coleta, transito, entrega — e as de "em processo" que nem entram na
 * regua. Listar essas seria uma lista que envelhece a cada etapa nova;
 * antes do pagamento so existem duas, e nao vao aumentar.
 *
 * `confirmed` e o padrao antigo da coluna, de antes deste fluxo
 * existir. Esses pedidos CONTAM: sao vendas concluidas na epoca em que
 * o sistema nao tinha etapa de financeiro, e nao contá-las apagaria o
 * historico do vendedor de uma vez.
 */
const ANTES_DO_PAGAMENTO = new Set([
  '',                     // etapa em branco: nao e prova de pagamento
  'open',                 // pedido ainda sendo montado
  'pending',              // aguardando confirmacao
  'iniciando_pedido',     // nasceu agora, ninguem olhou
  'aguardando_financeiro' // esta na fila do financeiro
]);

const passouPeloPagamento = status => !ANTES_DO_PAGAMENTO.has(String(status || '').trim());

module.exports = {
  STATUS, AREAS, PASSOS, FASES,
  MODULOS_DO_FLUXO, moduloDaFase, moduloDoStatus, statusDoModulo,
  infoStatus, listaStatus, finalizado, prazoSaida, calcularAtencao,
  linhaDoTempo, fasesDoPedido, fasesVisiveis, visitasDoPedido,
  historicoPedido, ehRetirada,
  ANTES_DO_PAGAMENTO, passouPeloPagamento,
};
