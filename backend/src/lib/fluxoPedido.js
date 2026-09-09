// ============================================================
// O MOTOR QUE MOVE O PEDIDO DE ETAPA.
//
// O QUE FALTAVA. O catálogo de status (lib/atencao.js) descreve o
// caminho inteiro da fábrica — vinte e oito marcos, quinze fases — e a
// tela desenhava esse caminho lindamente. Só que NINGUÉM CONSEGUIA
// ANDAR NELE: o único botão que existia sabia mexer em nove status
// antigos e travava em "não é possível pular etapas" no primeiro copo
// que precisava de revelação. Um pedido entrava e morava em
// "Aguardando financeiro" para sempre.
//
// Este arquivo é a resposta: dada a situação de um pedido, ele diz QUAL
// é a próxima etapa, O QUE precisa estar pronto para ir até ela e QUEM
// pode dar o passo. E, dada a ordem de avançar, devolve exatamente o
// que gravar.
//
// UMA RÉGUA SÓ. O trilho não é uma lista nova: é `A.fasesVisiveis()`, a
// mesma que desenha a linha do tempo. Uma segunda lista aqui seria o dia
// em que o botão oferece "Pintura" num pedido cuja linha do tempo não
// mostra pintura nenhuma.
//
// UMA AÇÃO POR FASE, E NÃO POR STATUS. O catálogo tem dois status por
// etapa ("aguardando arte" e "arte anexada e aprovada"), porque é assim
// que o chão de fábrica marca. Obrigar dois cliques por etapa faria vinte
// e seis cliques para fechar um pedido. Aqui um clique CONCLUI a fase e
// já entrega o pedido na porta da próxima — os dois marcos vão para o
// histórico, que é onde eles importam.
//
// NÃO SE PULA ETAPA, MAS SE VOLTA. Avançar é sempre de um em um. Voltar
// existe porque erro de digitação acontece, exige motivo e é privilégio
// de gerente — e fica no histórico com nome e hora, que é o que separa
// "corrigiram" de "alguém mexeu".
// ============================================================
const A = require('./atencao');
const { podeModulo } = require('./setores');

const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * A ETAPA DO DINHEIRO SÓ ANDA DE UM LUGAR: CONTAS A RECEBER.
 *
 * O botão "Confirmar o pagamento" existia na tela do PEDIDO, e ali ele
 * era um atalho perigoso: quem abre o pedido é o comercial (e o admin,
 * que abre tudo), e um clique dava o dinheiro por recebido sem ninguém
 * ter aberto o extrato — a mesma confusão que fazia anexar comprovante
 * valer como pagamento.
 *
 * Agora a etapa anda como CONSEQUÊNCIA: o financeiro confirma a parcela
 * em Contas a Receber e o pedido segue sozinho, pelo mesmo motor, com o
 * marco no histórico. Uma decisão, um lugar, um responsável.
 *
 * `liberarPagamento` continua existindo para a exceção documentada (o
 * dinheiro caiu e não há papel) — e também é do financeiro.
 */
const MOTIVO_ETAPA_DO_FINANCEIRO =
  'Esta etapa anda no Financeiro: confirme o pagamento em Contas a Receber e o pedido segue sozinho.';
const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

// ── Quem responde por cada fase ─────────────────────────────
//
// O módulo é o mesmo do menu (lib/setores.js). Gerente e admin passam
// por cima de tudo: numa fábrica pequena é o gerente que destrava o que
// ficou parado às seis da tarde, e um sistema que o impede vira um
// sistema que trabalha por WhatsApp.
//
// `acao` é o texto do botão. Ele descreve o que a PESSOA está fazendo
// ("Aprovar a arte"), e não o que o banco vai gravar: quem clica sabe
// de arte, não de `arte_aprovada`.
const REGRAS = {
  realizado:  { modulos: ['sales', 'pdv'],                acao: 'Confirmar o pedido' },
  pagamento:  { modulos: ['financial'],                   acao: 'Confirmar o pagamento' },
  estoque:    { modulos: ['stock'],                       acao: 'Confirmar o estoque' },
  arte:       { modulos: ['sales', 'production'],         acao: 'Aprovar a arte' },
  vegetal:    { modulos: ['production'],                  acao: 'Confirmar o vegetal impresso' },
  revelacao:  { modulos: ['production'],                  acao: 'Concluir a revelação' },
  pintura:    { modulos: ['production'],                  acao: 'Concluir a pintura' },
  borda:      { modulos: ['production'],                  acao: 'Concluir a borda' },
  producao:   { modulos: ['production'],                  acao: 'Concluir a produção' },
  qualidade:  { modulos: ['production', 'quality'],       acao: 'Aprovar no controle de qualidade' },
  embalagem:  { modulos: ['production'],                  acao: 'Concluir a embalagem' },
  foto:       { modulos: ['production', 'sales'],         acao: 'Confirmar o envio da foto' },
  coleta:     { modulos: ['logistics', 'sales'],          acao: 'Registrar a coleta' },
  transito:   { modulos: ['logistics'],                   acao: 'Confirmar a saída para entrega' },
  entrega:    { modulos: ['logistics', 'sales'],          acao: 'Confirmar a entrega' },
};

// Na retirada o texto muda, porque o que acontece muda: ninguém coleta,
// o cliente vem buscar.
const ACAO_RETIRADA = {
  coleta:  'Registrar a retirada',
  entrega: 'Confirmar a entrega ao cliente',
};

/**
 * AS EXIGÊNCIAS DE CADA FASE.
 *
 * Um requisito responde "o que impede este pedido de seguir agora". Ele
 * tem duas forças:
 *
 *   obrigatório  trava o avanço. Existe quando seguir sem aquilo produz
 *                trabalho errado — produção começando sem arte, dinheiro
 *                dado como recebido sem ninguém ter conferido.
 *   aviso        não trava, aparece. Existe quando a falta é ruim mas a
 *                decisão é de quem está lá — comprovante que ainda não
 *                chegou, rastreio que a transportadora não passou.
 *
 * Fases sem requisito de dado não são fases sem exigência: nelas a
 * exigência é a PESSOA CERTA confirmar, e isso o `modulos` acima já diz.
 * Inventar um checkbox "confirmo que revelei" seria pedir para alguém
 * marcar duas vezes a mesma coisa.
 *
 * `como` é a frase que a tela mostra embaixo do requisito não cumprido.
 * Ela diz ONDE resolver — um "faltou a arte" que não diz onde anexar
 * manda a pessoa procurar.
 */
const REQUISITOS = {
  realizado: v => [
    { chave: 'itens', label: 'O pedido tem itens',
      ok: (v.itens_qtd || 0) > 0,
      como: 'Um pedido sem item não tem o que produzir. Inclua os produtos antes de seguir.' },
  ],

  /**
   * QUEM LIBERA O PAGAMENTO É O COMPROVANTE.
   *
   * Era o contrário: o requisito que travava chamava-se "Pagamento
   * liberado" e só um clique no botão "Liberar pagamento" o cumpria; o
   * comprovante entrava como aviso, marcado "não trava". Dava a cena
   * absurda de um pedido com o comprovante anexado, conferido e
   * quitado, com "Confirmar o pagamento" apagado — e a única saída
   * sendo um botão chamado "Liberar sem comprovante".
   *
   * Agora o papel é a prova. Quitado o valor do pedido pelos
   * comprovantes das parcelas, a etapa anda.
   *
   * `pagamento.liberado` continua valendo como cumprimento, e não como
   * caminho: pedidos liberados à mão ANTES desta mudança ficariam
   * presos numa exigência que não existia quando passaram por aqui.
   */
  /**
   * DUAS EXIGÊNCIAS, PORQUE SÃO DOIS ATOS.
   *
   * Anexar o comprovante é uma AFIRMAÇÃO — "paguei" — e quem a faz é o
   * comercial ou o próprio cliente. Conferir é o financeiro abrindo o
   * extrato e dizendo que o dinheiro está lá.
   *
   * A etapa se contentava com a primeira, e por isso a fábrica começava
   * a produzir em cima de uma afirmação: o print de uma transferência
   * AGENDADA, o comprovante de outro pedido e o valor digitado errado
   * passam todos pelo anexo. Nenhum passa pela conferência.
   *
   * As duas aparecem separadas de propósito: "falta anexar" e "falta o
   * financeiro conferir" mandam a pessoa a lugares diferentes.
   *
   * `pagamento.liberado` continua valendo pelas duas — é o financeiro
   * dizendo que libera assim mesmo, com nome e hora no histórico. Sem
   * essa porta, venda paga em dinheiro no balcão (que não tem
   * comprovante nenhum) travaria para sempre.
   */
  pagamento: v => {
    // O QUE PESA É O QUE JÁ VENCEU. Parcela de novembro não é pendência
    // hoje — e exigir o comprovante dela seria mandar a fábrica esperar
    // dois meses por um pedido que o cliente já combinou como pagar.
    const r = v.pagamento_resumo || {};
    const nadaHoje = !(r.vencido_aberto > 0) && !!r.parcelas_a_vencer;
    const aPrazo = r.parcelas_a_vencer
      ? ` A prazo: ${r.parcelas_a_vencer} parcela(s), ${brl(r.a_vencer)} a vencer`
        + `${r.proximo_vencimento ? ` (próxima em ${dataBR(r.proximo_vencimento)})` : ''}.`
      : '';
    return [
      { chave: 'comprovante',
        label: nadaHoje ? 'Nada vencido para hoje' : 'Comprovante do que já venceu, anexado',
        ok: !!v.comprovante_quitado || !!v.pagamento?.liberado,
        como: 'Anexe o comprovante na parcela vencida, aqui em cima. Enquanto o que já '
            + 'venceu não estiver coberto, o financeiro não tem lastro do que entrou.' + aPrazo },
      { chave: 'conferido',
        label: nadaHoje ? 'Nada a conferir hoje' : 'Comprovante conferido pelo financeiro',
        ok: !!v.comprovante_conferido || !!v.pagamento?.liberado,
        como: 'O financeiro abre a parcela e confirma o pagamento. Anexar é dizer que '
            + 'pagou; conferir é ver o dinheiro na conta — e é isso que solta a produção.' + aPrazo },
    ];
  },

  /**
   * A ARTE, E O SIM DO CLIENTE.
   *
   * São três exigências e elas têm forças diferentes de propósito:
   *
   *   anexada     obrigatória. Sem arquivo não há o que gravar.
   *
   *   reprovada   obrigatória. O cliente olhou e disse que não é
   *               aquilo. Seguir daqui é imprimir o desenho recusado —
   *               não existe leitura em que isso seja o certo.
   *
   *   confirmada  AVISO, e não trava. O certo é esperar o cliente ver a
   *               arte que a loja mandou, e é isso que o avanço
   *               automático faz: ele não passa por cima. Mas cliente
   *               some — viaja, troca de número, some por uma semana —
   *               e uma trava aqui pararia a fábrica esperando alguém
   *               que talvez já tenha confirmado por WhatsApp. Quem
   *               está com o pedido na mão decide, vendo escrito na
   *               tela que o cliente ainda não respondeu.
   */
  arte: v => [
    { chave: 'arte', label: 'Arte anexada',
      ok: !!(v.artwork_url || v.art_file),
      como: 'Anexe o arquivo no card "Arte". Produção em cima de uma arte que ninguém viu é retrabalho garantido.' },
    // O rótulo descreve o que precisa ESTAR FEITO, e não a falta: a
    // tela monta "Falta: <rótulo>", e "Falta: nenhuma arte reprovada"
    // sai ao contrário do que quer dizer.
    { chave: 'arte_reprovada', label: 'Arte corrigida depois da reprovação do cliente',
      ok: !(v.arte_resumo?.reprovadas > 0),
      como: 'O cliente reprovou a arte de um dos itens no portal. Anexe a arte corrigida '
          + 'no item — a nova volta para ele confirmar, e o pedido segue.' },
    { chave: 'arte_confirmada', label: 'Cliente confirmou a arte', obrigatorio: false,
      ok: !(v.arte_resumo?.aguardando > 0),
      como: `${v.arte_resumo?.aguardando || 0} arte(s) esperando o cliente ver e confirmar no portal. `
          + 'O pedido não anda sozinho enquanto isso; se ele já confirmou por fora, siga daqui.' },
  ],

  foto: v => [
    { chave: 'foto', label: 'Foto do pedido pronto',
      ok: (Array.isArray(v.production_photos) ? v.production_photos.length : 0) > 0,
      como: 'A foto é a última conferência antes de a caixa sair. Suba na tela de Produção.' },
  ],

  coleta: v => (A.ehRetirada(v) ? [] : [
    { chave: 'transportadora', label: 'Transportadora definida',
      ok: !!v.carrier_id,
      como: 'Escolha a transportadora no card "Transporte e entrega". Sem ela ninguém sabe quem vem buscar.' },
  ]),

  transito: v => (A.ehRetirada(v) ? [] : [
    { chave: 'rastreio', label: 'Código de rastreio', obrigatorio: false,
      ok: !!v.tracking_code,
      como: 'Sem o código o cliente não consegue acompanhar — e liga para o vendedor.' },
  ]),
};

/**
 * AS FASES QUE SÃO DO CHÃO DE FÁBRICA.
 *
 * Não é a mesma lista de `REGRAS[...].modulos` conter 'production':
 * ARTE também é da produção, mas quem aprova arte é o comercial com o
 * cliente do lado — a arte acontece ANTES de o pedido ir para a
 * fábrica. Daqui para baixo é a fábrica que responde.
 */
const FASES_DA_FABRICA = ['vegetal', 'revelacao', 'pintura', 'borda', 'producao', 'qualidade', 'embalagem'];

/**
 * O PEDIDO JÁ FOI ENVIADO PARA A PRODUÇÃO?
 *
 * Lido do histórico, pela mesma razão da liberação de pagamento: é um
 * EVENTO — quem mandou e quando —, e uma coluna booleana guardaria o
 * "sim" e perderia o resto.
 *
 * POR QUE ISTO EXISTE. Antes, um pedido caía na fila da produção só por
 * chegar num status; ninguém tinha DITO que ele podia começar. O
 * comercial ainda estava acertando quantidade com o cliente e a fábrica
 * já estava com o pedido na tela. Agora existe um momento explícito —
 * "Enviar para produção" — e é ele que põe o pedido na fila.
 *
 * PEDIDO DO SITE JÁ NASCE ENVIADO: ele foi montado e pago pelo próprio
 * cliente, com arte fechada no configurador. Não há o que o comercial
 * acertar depois; segurá-lo esperando alguém apertar um botão só
 * atrasaria o que já estava combinado.
 */
/**
 * O DIA EM QUE ESTA REGRA PASSOU A EXISTIR.
 *
 * Pedido criado antes disto nunca teve como receber o evento de envio —
 * o botão não existia. Sem esta linha, ligar a regra APAGOU A FILA DA
 * FÁBRICA INTEIRA de uma vez: todo pedido em andamento sumiu da tela de
 * produção no instante do deploy, porque nenhum deles tinha sido
 * "enviado" por alguém.
 *
 * Regra nova não pode reprovar o passado. O que existia antes entra
 * como já enviado, e a exigência vale para quem nasce depois. A
 * constante se apaga sozinha com o tempo: daqui a um ano não haverá
 * mais pedido aberto anterior a ela.
 */
const REGRA_DO_ENVIO_DESDE = '2026-08-31T00:00:00.000Z';

function envioParaProducao(venda) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];
  const e = log.find(x => x.action === 'enviado_producao');
  if (e) return { enviado: true, em: e.at || null, por: e.user || null, legado: false };

  // O passado, já dentro da fábrica.
  const nascimento = venda?.created_at || null;
  if (nascimento && String(nascimento) < REGRA_DO_ENVIO_DESDE) {
    return { enviado: true, em: nascimento, por: null, legado: true };
  }

  return { enviado: false, em: null, por: null, legado: false };
}

/**
 * A LIBERAÇÃO DO PAGAMENTO, lida do histórico do pedido.
 *
 * POR QUE NO LOG E NÃO NUMA COLUNA. Porque a liberação é um EVENTO —
 * quem liberou, quando, por qual caminho — e o `production_log` já é o
 * lugar onde os eventos do pedido moram. Uma coluna `pagamento_liberado`
 * guardaria o "sim" e perderia o resto, que é justamente o que se vai
 * querer saber no dia em que alguém perguntar por que aquele pedido
 * entrou em produção sem o dinheiro ter caído.
 *
 * QUANDO O BANCO ENTRAR, nada aqui muda: a integração grava o mesmo
 * evento com `modo: 'banco'` e a referência da transação. O motor não
 * sabe (nem precisa saber) quem apertou o botão.
 */
function liberacaoDePagamento(venda) {
  const log = Array.isArray(venda?.production_log) ? venda.production_log : [];
  // A ÚLTIMA vale: se alguém liberou por engano, cancelou e liberou de
  // novo, o que está valendo é o último ato — não o primeiro.
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e?.action === 'pagamento_cancelado') return { liberado: false, cancelado_em: e.at || null };
    if (e?.action === 'pagamento_liberado') {
      return {
        liberado: true,
        modo: e.modo === 'banco' ? 'banco' : 'manual',
        at: e.at || null,
        user: e.user || null,
        motivo: e.motivo || null,
        referencia: e.referencia || null,
      };
    }
  }
  // Pedido que já passou da fase de pagamento antes de este motor
  // existir está pago — foi a mão de alguém que o empurrou até aqui.
  // Reabrir essa pergunta agora travaria a fábrica inteira no passado.
  const passo = A.infoStatus(venda?.status).passo || 0;
  const passoPagamento = A.infoStatus('pagamento_confirmado').passo || 3;
  if (passo > passoPagamento) return { liberado: true, modo: 'historico', at: null, user: null };

  return { liberado: false };
}

// ── Onde o pedido está ──────────────────────────────────────

// Status de "estou com a mão nele agora". Eles não desenham fase
// própria na linha do tempo (não têm `passo`), mas o pedido está sim
// dentro de uma fase — a tela de Produção grava esses quando alguém
// inicia uma etapa.
const EM_PROCESSO = {
  revelacao_processo:   'revelacao',
  pintura_processo:     'pintura',
  borda_processo:       'borda',
  metalizacao_processo: 'producao',   // acabamento dentro da fase de producao
  producao_processo:    'producao',
  embalando_pedido:     'embalagem',
  conferencia_processo: 'qualidade',
  coleta_processo:      'coleta',
  aguardando_logistica: 'coleta',
  aguardando_gravacao:  'producao',
  gravacao_processo:    'producao',
  gravacao_finalizada:  'producao',
};

// Pedidos gravados antes do fluxo detalhado. Eles não deixam de existir
// por serem antigos: entram no trilho na fase equivalente e seguem daí.
const LEGADO = {
  open: 'realizado', confirmed: 'realizado', in_production: 'producao',
  ready: 'embalagem', delivered: 'entrega', completed: 'entrega',
};

/** Em que posição do trilho este pedido está. -1 = fora do trilho. */
function indiceAtual(trilho, status) {
  const direto = trilho.findIndex(f => f.entrando.includes(status) || f.concluida.includes(status));
  if (direto >= 0) return direto;

  const porFase = EM_PROCESSO[status] || LEGADO[status] || null;
  if (porFase) {
    const i = trilho.findIndex(f => f.key === porFase);
    if (i >= 0) return i;
  }
  // Status desconhecido (ou nenhum): o pedido está no começo.
  return status ? -1 : 0;
}

/** O status que marca esta fase como cumprida. */
function statusDeConclusao(fase, venda) {
  if (!fase.concluida.length) return null;
  // Na coleta o marco depende de quem levou o copo: a transportadora
  // coletou, ou o cliente veio buscar.
  if (fase.key === 'coleta') return A.ehRetirada(venda) ? 'produto_retirado' : 'mercadoria_coletada';
  return fase.concluida[0];
}

/** O status de quando o pedido CHEGA nesta fase. */
const statusDeEntrada = fase => fase.entrando[0] || fase.concluida[0] || null;

/**
 * O plano de um passo à frente: qual fase se conclui, onde o pedido
 * fica, e quais marcos entram no histórico.
 */
function planoDeAvanco(venda, aplicaveis) {
  const trilho = A.fasesVisiveis(venda, aplicaveis);
  const i = indiceAtual(trilho, venda?.status);
  if (i < 0) {
    return { erro: `O status "${venda?.status}" não faz parte do fluxo deste pedido.` };
  }

  const fase = trilho[i];
  const proxima = trilho[i + 1] || null;
  const conclusao = statusDeConclusao(fase, venda);
  const entrada = proxima ? statusDeEntrada(proxima) : null;
  const destino = entrada || conclusao;

  if (!destino || destino === venda?.status) {
    return { erro: 'Este pedido já está na última etapa do fluxo.' };
  }

  // Os dois marcos vão para o histórico; o pedido PARA no último. Marco
  // igual ao status atual não se repete — o pedido já estava lá.
  const marcos = [conclusao, entrada].filter(m => m && m !== venda?.status);

  return { trilho, indice: i, fase, proxima, destino, marcos };
}

/** O plano de um passo atrás — para corrigir etapa marcada por engano. */
function planoDeVolta(venda, aplicaveis) {
  const trilho = A.fasesVisiveis(venda, aplicaveis);
  const i = indiceAtual(trilho, venda?.status);
  if (i < 0) return { erro: `O status "${venda?.status}" não faz parte do fluxo deste pedido.` };
  if (i === 0) return { erro: 'O pedido já está na primeira etapa.' };

  const fase = trilho[i];
  const anterior = trilho[i - 1];
  return { trilho, indice: i, fase, anterior, destino: statusDeEntrada(anterior) };
}

// ── O que a tela precisa saber ──────────────────────────────

/** Gerente e admin passam por cima da divisão por área. */
const mandaEmTudo = perfil => ['admin', 'manager'].includes(perfil?.role);

function podeAtuarNaFase(faseKey, { acesso, perfil } = {}) {
  if (mandaEmTudo(perfil)) return true;
  const regra = REGRAS[faseKey];
  if (!regra) return false;
  return podeModulo(acesso, ...regra.modulos);
}

/**
 * A FICHA DE FLUXO DO PEDIDO — tudo que a tela precisa para desenhar a
 * linha do tempo E o botão que a move.
 *
 * Vai numa resposta só, de propósito. Requisito calculado na tela seria
 * a tela decidindo se o pedido pode andar — e no dia em que a regra
 * mudasse, o servidor recusaria um avanço que o botão tinha acabado de
 * oferecer.
 *
 * @param venda       linha de VENDAS (com production_log)
 * @param aplicaveis  { borda, pintura } — de etapasDosItens()
 * @param quem        { acesso, perfil } de quem está olhando
 */
function fichaDeFluxo(venda, aplicaveis = {}, quem = {}) {
  const pagamento = liberacaoDePagamento(venda);
  const ctx = { ...venda, pagamento };
  const retirada = A.ehRetirada(venda);
  const infoAtual = A.infoStatus(venda?.status);

  const etapas = A.fasesDoPedido(venda, aplicaveis);
  const plano = planoDeAvanco(venda, aplicaveis);
  const volta = planoDeVolta(venda, aplicaveis);

  const envio = envioParaProducao(venda);
  const personalizado = !!aplicaveis.personalizado;

  const base = {
    status: venda?.status || null,
    status_label: infoAtual.label,
    finalizado: A.finalizado(venda?.status),
    retirada,
    pagamento,
    // A TELA PRECISA DIZER ISSO EM VOZ ALTA. Pedido liso não passa pela
    // serigrafia e pedido não enviado não está na fila da fábrica — as
    // duas coisas eram invisíveis, e quem olhava concluía que o sistema
    // tinha travado.
    personalizado,
    producao: { ...envio, fases: FASES_DA_FABRICA },
    etapas,
  };

  if (base.finalizado) {
    return {
      ...base,
      fase_atual: null,
      requisitos: [],
      acao: null,
      voltar: podeVoltar(volta, quem),
    };
  }

  if (plano.erro) {
    return {
      ...base,
      fase_atual: null,
      requisitos: [],
      acao: null,
      erro: plano.erro,
      voltar: podeVoltar(volta, quem),
    };
  }

  const { fase, proxima, destino } = plano;
  const regra = REGRAS[fase.key] || { modulos: [], acao: 'Avançar' };
  const requisitos = (REQUISITOS[fase.key] ? REQUISITOS[fase.key](ctx) : [])
    .map(r => ({ obrigatorio: true, ...r }));

  const faltando = requisitos.filter(r => r.obrigatorio && !r.ok);
  const autorizado = podeAtuarNaFase(fase.key, quem);
  const area = A.infoStatus(statusDeEntrada(fase)).area;

  const motivos = [];
  // O pagamento não se confirma daqui: quem o move é a confirmação da
  // conta, no Financeiro. O botão continua visível para dizer isso —
  // sumir faria a pessoa procurar onde ele foi parar.
  const soNoFinanceiro = fase.key === 'pagamento';
  if (soNoFinanceiro) motivos.push(MOTIVO_ETAPA_DO_FINANCEIRO);
  if (!autorizado) motivos.push(`Só ${A.AREAS[area] || area} (ou um gerente) pode dar este passo.`);
  for (const r of faltando) motivos.push(`Falta: ${r.label.toLowerCase()}.`);

  /**
   * O PEDIDO ESTÁ NA PORTA DA FÁBRICA E NINGUÉM ABRIU A PORTA.
   *
   * Quando a fase atual é da fábrica e o pedido não foi enviado, o passo
   * que falta não é "concluir a etapa" — é ALGUÉM MANDAR. O botão troca
   * de texto e de dono: quem envia é o comercial, não a produção.
   */
  const naFabrica = FASES_DA_FABRICA.includes(fase.key);
  const faltaEnviar = naFabrica && !envio.enviado;

  /**
   * E QUANDO JÁ FOI ENVIADO, a espera fica escrita.
   *
   * "Aguardando produção confirmar a conclusão" é a frase que faltava:
   * o pedido parado numa fase da fábrica parecia pedido travado, e o
   * comercial ligava para a produção perguntando o que tinha quebrado.
   * Nada tinha quebrado — era a vez deles.
   */
  const aguardandoProducao = !naFabrica || !envio.enviado ? null
    // Para quem NÃO trabalha na produção, a frase é a espera.
    : !autorizado
      ? `Aguardando a produção confirmar a conclusão de ${fase.label.toLowerCase()} para prosseguir.`
      // Para quem trabalha nela, dizer "aguardando a produção" seria o
      // sistema pedindo que ela esperasse por si mesma. A ela cabe a
      // outra metade da frase: a bola está com você.
      : `Este pedido está com a produção: conclua ${fase.label.toLowerCase()} para ele prosseguir.`;

  return {
    ...base,
    fase_atual: {
      key: fase.key,
      label: retirada && fase.key === 'coleta' ? 'Retirada' : fase.label,
      area, area_label: A.AREAS[area] || area,
      da_fabrica: naFabrica,
    },
    requisitos,
    producao: {
      ...base.producao,
      // `precisa` = este pedido, agora, depende de ter sido enviado.
      precisa: faltaEnviar,
      // Quem envia é o comercial (ou um gerente) — a produção não se
      // convida para o trabalho.
      pode_enviar: faltaEnviar && podeAtuarNaFase('realizado', quem),
      aguardando: aguardandoProducao,
    },
    acao: {
      label: (retirada && ACAO_RETIRADA[fase.key]) || regra.acao,
      destino,
      destino_label: A.infoStatus(destino).label,
      proxima_fase: proxima ? proxima.label : null,
      autorizado,
      pode: autorizado && faltando.length === 0 && !faltaEnviar && !soNoFinanceiro,
      motivos: faltaEnviar
        ? [...motivos, 'Este pedido ainda não foi enviado para a produção.']
        : motivos,
    },
    voltar: podeVoltar(volta, quem),
  };
}

function podeVoltar(volta, quem) {
  if (volta.erro) return { pode: false, motivo: volta.erro };
  if (!mandaEmTudo(quem?.perfil)) {
    return { pode: false, motivo: 'Voltar etapa é decisão de gerente.', para_label: volta.anterior.label };
  }
  return { pode: true, para: volta.destino, para_label: volta.anterior.label };
}

// ── Gravação ────────────────────────────────────────────────

/** Uma linha do histórico, no formato que o resto do sistema já escreve. */
function marco(action, req, extra = {}) {
  return {
    stage: 'status',
    action,
    at: new Date().toISOString(),
    user_id: req?.user?.id || null,
    user: req?.user?.name || req?.user?.email || 'Usuário',
    ...extra,
  };
}

/**
 * O que gravar para avançar uma fase.
 *
 * Devolve `{ erro }` quando não dá, e `{ status, log, fase, destino }`
 * quando dá. Quem chama grava — assim a decisão fica testável sem banco.
 */
function avancar(venda, aplicaveis, quem, req, observacao = null, opcoes = {}) {
  // O AVANCO AUTOMATICO PULA A PERMISSAO E O REQUISITO — e so eles.
  //
  // Quem liga isso e a empresa, no painel de pedidos, dizendo "aqui o
  // pagamento ja vem acertado antes do pedido entrar". A politica ja
  // FOI a decisao humana; pedir de novo o comprovante e a permissao
  // seria pedir duas vezes a mesma autorizacao.
  //
  // O que NAO se pula: pedido encerrado nao anda, e fase de fabrica sem
  // envio nao anda. Essas duas nao sao burocracia — sao o registro
  // batendo com o que aconteceu no chao.
  const automatico = !!opcoes.automatico;
  if (A.finalizado(venda?.status)) {
    return { erro: 'Este pedido já está encerrado.' };
  }

  const plano = planoDeAvanco(venda, aplicaveis);
  if (plano.erro) return { erro: plano.erro };

  const { fase, destino, marcos } = plano;

  // A FÁBRICA SÓ TRABALHA NO QUE FOI MANDADO. Sem o envio, nem gerente
  // avança: não é questão de permissão, é que o pedido não entrou na
  // fila — concluir uma etapa que ninguém começou é registrar mentira.
  if (FASES_DA_FABRICA.includes(fase.key) && !envioParaProducao(venda).enviado) {
    return {
      erro: 'Este pedido ainda não foi enviado para a produção. Use "Enviar para produção" no pedido de venda.',
      http: 409,
    };
  }

  // A etapa do dinheiro não é dada por quem olha o pedido — ver
  // MOTIVO_ETAPA_DO_FINANCEIRO. `doFinanceiro` é a confirmação da conta
  // chamando de volta; `automatico` é a política da empresa no nascimento.
  if (fase.key === 'pagamento' && !automatico && !opcoes.doFinanceiro) {
    return { erro: MOTIVO_ETAPA_DO_FINANCEIRO, http: 409, code: 'ETAPA_DO_FINANCEIRO' };
  }

  // `doFinanceiro` JÁ É a área respondendo: quem chama assim é a
  // confirmação da conta em Contas a Receber, que só o financeiro abre.
  // Os REQUISITOS continuam valendo — o que se pula aqui é a pergunta
  // "você é do financeiro?", feita a quem acabou de provar que é.
  if (!automatico && !opcoes.doFinanceiro && !podeAtuarNaFase(fase.key, quem)) {
    const area = A.infoStatus(statusDeEntrada(fase)).area;
    return { erro: `Esta etapa é de ${A.AREAS[area] || area}. Peça a alguém da área ou a um gerente.`, http: 403 };
  }

  if (!automatico) {
    const ctx = { ...venda, pagamento: liberacaoDePagamento(venda) };
    const requisitos = (REQUISITOS[fase.key] ? REQUISITOS[fase.key](ctx) : [])
      .map(r => ({ obrigatorio: true, ...r }));
    const faltando = requisitos.filter(r => r.obrigatorio && !r.ok);
    if (faltando.length) {
      return {
        erro: `Ainda falta: ${faltando.map(r => r.label.toLowerCase()).join('; ')}.`,
        requisitos: faltando,
      };
    }
  }

  const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
  marcos.forEach((m, i) => {
    // A observação acompanha o marco que a pessoa de fato registrou —
    // o primeiro. O segundo é só a porta da fase seguinte.
    // `automatico` fica gravado no marco: daqui a seis meses, quem olhar
    // a linha do tempo precisa saber que ninguém clicou ali.
    log.push(marco(m, req, {
      ...(i === 0 && observacao ? { observacao: String(observacao).slice(0, 500) } : {}),
      ...(automatico ? { automatico: true } : {}),
    }));
  });

  return { status: destino, log, fase, destino };
}

/**
 * O QUE GRAVAR PARA ENVIAR O PEDIDO À PRODUÇÃO.
 *
 * Não move o pedido de status: ele continua exatamente onde estava. O
 * que muda é que a fábrica passa a ver o pedido na fila e as fases dela
 * destravam. Enviar é uma AUTORIZAÇÃO, não uma etapa cumprida — marcar
 * status aqui faria o pedido parecer adiantado sem ninguém ter
 * encostado nele.
 */
function enviarParaProducao(venda, aplicaveis, quem, req) {
  if (A.finalizado(venda?.status)) {
    return { erro: 'Este pedido já está encerrado.' };
  }
  if (envioParaProducao(venda).enviado) {
    return { erro: 'Este pedido já está com a produção.', http: 409 };
  }
  // Liso não tem serigrafia, mas tem produção, qualidade e embalagem —
  // continua sendo enviado. Quem não passa pela fábrica é pedido sem
  // nenhuma fase dela no trilho.
  const trilho = A.fasesVisiveis(venda, aplicaveis);
  if (!trilho.some(f => FASES_DA_FABRICA.includes(f.key))) {
    return { erro: 'Este pedido não passa pela produção.', http: 409 };
  }
  if (!podeAtuarNaFase('realizado', quem)) {
    return { erro: 'Enviar para a produção é do comercial (ou de um gerente).', http: 403 };
  }

  const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
  log.push(marco('enviado_producao', req, {
    personalizado: !!aplicaveis.personalizado,
  }));
  return { log };
}

/** O que gravar para voltar uma fase. Exige motivo — e gerente. */
function voltar(venda, aplicaveis, quem, req, motivo) {
  if (!mandaEmTudo(quem?.perfil)) {
    return { erro: 'Voltar etapa é decisão de gerente.', http: 403 };
  }
  if (!String(motivo || '').trim()) {
    return { erro: 'Diga o motivo de voltar a etapa — ele fica no histórico do pedido.' };
  }

  const plano = planoDeVolta(venda, aplicaveis);
  if (plano.erro) return { erro: plano.erro };

  const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
  log.push(marco(plano.destino, req, {
    stage: 'correcao',
    voltou_de: venda.status,
    motivo: String(motivo).trim().slice(0, 500),
  }));

  return { status: plano.destino, log, fase: plano.anterior, destino: plano.destino };
}

/**
 * A LIBERAÇÃO DO PAGAMENTO.
 *
 * Dois caminhos, um registro. `banco` é a integração confirmando a
 * entrada; `manual` é alguém do financeiro dizendo que viu o dinheiro.
 * O manual pede motivo porque liberar sem o extrato é uma decisão, e
 * decisão sem autor é o que ninguém consegue explicar depois.
 *
 * LIBERAR JÁ ANDA COM O PEDIDO. Se ele estava parado na fase de
 * pagamento, a liberação o entrega no estoque na mesma ação — que é o
 * que "liberar automaticamente quando o banco confirmar" quer dizer.
 * Se estava em outro lugar, só registra: mexer no status de um pedido
 * que já está na produção por causa de uma baixa atrasada seria puxá-lo
 * para trás sem ninguém ter pedido.
 */
function liberarPagamento(venda, aplicaveis, quem, req, { modo = 'manual', motivo = null, referencia = null } = {}) {
  const forma = modo === 'banco' ? 'banco' : 'manual';

  if (forma === 'manual') {
    if (!podeModulo(quem?.acesso, 'financial') && !mandaEmTudo(quem?.perfil)) {
      return { erro: 'Liberar pagamento à mão é do Financeiro (ou de um gerente).', http: 403 };
    }
    if (!String(motivo || '').trim()) {
      return { erro: 'Diga como o pagamento foi confirmado — o motivo fica no histórico.' };
    }
  }

  const jaLiberado = liberacaoDePagamento(venda);
  if (jaLiberado.liberado && jaLiberado.modo !== 'historico') {
    return { erro: 'O pagamento deste pedido já está liberado.' };
  }

  const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
  log.push(marco('pagamento_liberado', req, {
    stage: 'pagamento',
    modo: forma,
    motivo: motivo ? String(motivo).trim().slice(0, 500) : null,
    referencia: referencia ? String(referencia).slice(0, 120) : null,
  }));

  // O pedido está parado esperando o financeiro? Então a liberação é o
  // próprio passo — e ele sai daqui já na porta do estoque.
  const trilho = A.fasesVisiveis(venda, aplicaveis);
  const i = indiceAtual(trilho, venda.status);
  const naFaseDoPagamento = i >= 0 && trilho[i]?.key === 'pagamento';

  if (!naFaseDoPagamento) {
    return { status: venda.status, log, liberado: true, avancou: false };
  }

  const proxima = trilho[i + 1] || null;
  const conclusao = statusDeConclusao(trilho[i], venda);
  const entrada = proxima ? statusDeEntrada(proxima) : null;
  const destino = entrada || conclusao;

  for (const m of [conclusao, entrada].filter(m => m && m !== venda.status)) {
    log.push(marco(m, req, { modo: forma }));
  }

  return { status: destino || venda.status, log, liberado: true, avancou: !!destino };
}

/**
 * A LIBERACAO QUE VEM DO BANCO, ja gravada.
 *
 * E o outro lado da rota /pagamento/liberar: aqui quem chama nao e uma
 * pessoa, e o webhook do gateway confirmando que o dinheiro caiu. Passa
 * pelo MESMO caminho de sempre — mesma checagem de "ja estava
 * liberado?", mesmo registro no historico, mesmo avanco automatico se o
 * pedido estava parado esperando o financeiro.
 *
 * Nao lanca: um erro aqui nao pode derrubar a baixa do lancamento, que
 * ja aconteceu. Devolve o que fez, para quem chamou registrar no log.
 */
async function liberarPeloBanco(tenantId, saleId, referencia = null) {
  const supabase = require('../config/supabase');
  try {
    const { data: venda, error } = await supabase.from('VENDAS')
      .select(`id, number, status, production_log, delivery_mode, notes, created_at,
               VENDA_ITENS ( id, product_name, quantity, customization, PRODUTOS ( id, ink_type ) )`)
      .eq('id', saleId).eq('tenant_id', tenantId).maybeSingle();
    if (error || !venda) return { ok: false, motivo: 'pedido não encontrado' };

    const { etapasDosItens, caracteristicasDoItem } = require('./itensPedido');
    const aplicaveis = etapasDosItens((venda.VENDA_ITENS || []).map(caracteristicasDoItem));

    const passo = liberarPagamento(
      venda, aplicaveis,
      // O banco confirmando nao precisa de permissao de ninguem: quem
      // autorizou foi o dinheiro.
      { perfil: { role: 'admin' }, acesso: { modules: null } },
      { user: { id: null, name: 'Baixa automática (banco)' } },
      { modo: 'banco', referencia },
    );
    if (passo.erro) return { ok: false, motivo: passo.erro };

    const { error: erroUpd } = await supabase.from('VENDAS')
      .update({ status: passo.status, production_log: passo.log })
      .eq('id', saleId).eq('tenant_id', tenantId);
    if (erroUpd) return { ok: false, motivo: erroUpd.message };

    return { ok: true, status: passo.status, avancou: passo.avancou };
  } catch (err) {
    return { ok: false, motivo: err.message };
  }
}

module.exports = {
  REGRAS, REQUISITOS, liberarPeloBanco,
  fichaDeFluxo, avancar, voltar, liberarPagamento, liberacaoDePagamento,
  planoDeAvanco, planoDeVolta, indiceAtual, podeAtuarNaFase,
  statusDeEntrada, statusDeConclusao,
  enviarParaProducao, envioParaProducao, FASES_DA_FABRICA,
};
