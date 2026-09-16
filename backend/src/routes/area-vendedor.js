// ============================================================
// Área do vendedor — pedidos da carteira, agenda, comunicação
// com o gerente e o alerta compartilhado entre setores.
//
// Tudo aqui é recortado pela carteira de quem pediu: o vendedor lê os
// pedidos que são dele e conversa com o gerente. Ele não altera pedido,
// não fala com produção e não vê custo.
// ============================================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { codigoPedido } = require('../lib/pedidoCodigo');
const A        = require('../lib/atencao');
const { paraOBalcao } = require('../lib/retirada');
const { ORIGENS } = require('../lib/origens');
const { autorizar, excluirVenda } = require('../lib/excluirVenda');
const { audit } = require('../lib/audit');
const { caracteristicasDoItem, etapasDosItens, resumoDaArte , contaDaProducao } = require('../lib/itensPedido');

// Os nomes das etapas da fábrica, para a conta das perdas sair legível
// aqui também. O catálogo inteiro mora em routes/production.js; puxá-lo
// para cá acoplaria a tela do vendedor às rotas da produção por causa de
// sete palavras.
const Prazo = require('../lib/prazoProducao');
const { avisosDoPedido } = require('../lib/documentoPedido');

const ROTULO_ETAPA = {
  revelacao: 'Revelação', pintura: 'Pintura', borda: 'Borda',
  metalizacao: 'Metalização', producao: 'Produção',
  qualidade: 'Controle de qualidade', embalagem: 'Embalagem',
};
// A ficha de fluxo (onde o pedido esta, o que falta, qual e o botao) sai
// do mesmo motor que o modulo de Vendas usa para mover o pedido.
const F = require('../lib/fluxoPedido');
// Quem sabe se os comprovantes ja cobrem o pedido — a resposta que
// libera a etapa de Pagamento.
const C = require('../lib/comprovante');
const { uploadDataUrl, uploadPrivado, linkAssinado } = require('../lib/storage');
// A arte que chega move o pedido, e quem decide para onde é o motor de
// etapas — não um status escrito à mão nesta rota.
const Auto = require('../lib/pedidoAutomacao');
const { carregarParaFluxo, gravarPasso } = require('../lib/fluxoCarga');

const isManager = req => ['admin', 'manager'].includes(req.userProfile?.role);
const tabelaAusente = err =>
  /42P01|PGRST(002|205)|does not exist|schema cache/i.test(`${err?.code || ''} ${err?.message || ''}`);

// ── Vocabulário do fluxo (o filtro de Status lê daqui) ───────
router.get('/status', (req, res) => res.json(A.listaStatus()));

// O vocabulário de origem mora em lib/origens.js — a mesma lista que o
// módulo de Vendas usa. Duas listas seriam duas verdades.
router.get('/origens', (req, res) => res.json(ORIGENS));

// ============================================================
// TELA 1 — Pedidos de Venda da carteira
// ============================================================
const PEDIDO_SELECT = `
  id, number, status, origin, source, total, freight, discount,
  created_at, operation_date, ship_date, delivery_date, max_delivery_date,
  customer_id, user_id,
  CLIENTES ( id, display_id, name, phone, mobile, address )
`;

/**
 * A carteira. O padrão é o que está acontecendo AGORA: pedido concluído
 * some da lista até alguém pedir `finalizados=1` — é o que faz o vendedor
 * abrir o sistema e ver trabalho, não histórico.
 */
router.get('/pedidos', async (req, res) => {
  try {
    const tenantId = req.tenantId;
    // Gerente pode olhar a carteira de outro; vendedor vê só a dele.
    const userId = (isManager(req) && req.query.user_id) ? String(req.query.user_id) : req.user.id;

    let q = supabase.from('VENDAS').select(PEDIDO_SELECT)
      .eq('tenant_id', tenantId)
      .neq('status', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(Math.min(Math.max(parseInt(req.query.limit, 10) || 300, 1), 1000));

    // Gerente sem user_id explícito enxerga a empresa inteira.
    if (!(isManager(req) && req.query.todos === '1')) q = q.eq('user_id', userId);
    if (req.query.status) q = q.eq('status', String(req.query.status));

    const { data, error } = await q;
    if (error) throw error;

    let pedidos = data || [];

    // Busca por código do cliente — é a busca principal da tela. Aceita
    // "0234" e "234": o cadastro mostra com zeros à esquerda.
    const codigo = String(req.query.codigo || '').trim();
    if (codigo) {
      const alvo = codigo.replace(/^0+/, '');
      pedidos = pedidos.filter(p => {
        const id = p.CLIENTES?.display_id;
        return id != null && (String(id) === alvo || String(id).padStart(4, '0') === codigo.padStart(4, '0'));
      });
    }

    // Alertas levantados à mão e ainda abertos, para o cálculo da Atenção
    const alertas = await alertasAbertos(tenantId, pedidos.map(p => p.id));

    const agora = new Date();
    const comAtencao = pedidos.map(p => ({
      ...p,
      codigo_cliente: p.CLIENTES?.display_id != null ? String(p.CLIENTES.display_id).padStart(4, '0') : null,
      status_label: A.infoStatus(p.status).label,
      status_cor: A.infoStatus(p.status).cor,
      finalizado: A.finalizado(p.status),
      atencao: A.calcularAtencao(p, agora, alertas.get(p.id) || null),
    }));

    const mostrarFinalizados = req.query.finalizados === '1';
    const lista = mostrarFinalizados ? comAtencao : comAtencao.filter(p => !p.finalizado);

    res.json({
      total: lista.length,
      finalizados_incluidos: mostrarFinalizados,
      pedidos: lista,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** Alertas abertos indexados por pedido. */
async function alertasAbertos(tenantId, saleIds) {
  const mapa = new Map();
  if (!saleIds.length) return mapa;
  try {
    const { data, error } = await supabase.from('ALERTAS_PEDIDO')
      .select('*').eq('tenant_id', tenantId).is('resolved_at', null)
      .in('sale_id', saleIds);
    if (error) { if (tabelaAusente(error)) return mapa; throw error; }
    (data || []).forEach(a => { if (!mapa.has(a.sale_id)) mapa.set(a.sale_id, a); });
  } catch { /* migração 067 pendente: sem alerta manual, só o do status */ }
  return mapa;
}

/**
 * OS CAMPOS DO CLIENTE — a ficha inteira, porque a tela do pedido abre
 * a ficha dele num cartão (o olho ao lado do nome). Antes vinha só o
 * bastante para as seis linhas do bloco "Cliente"; o cartão pede o
 * cadastro: documento, endereço completo, situação e observações.
 *
 * O que NÃO entra continua não entrando — custo, margem e rateio não
 * são do cliente e nem passam por aqui.
 */
const CLIENTE_FICHA = `
      id, display_id, name, type, nome_fantasia, cpf_cnpj, rg_ie,
      phone, mobile, email, instagram, address, rating, credit_limit,
      vendedor, birth_date, notes, is_active, blocked, block_reason, created_at
    `;
// A mesma ficha sem as colunas de migrações recentes: numa base que
// ainda não migrou, o pedido tem que abrir do mesmo jeito.
const CLIENTE_BASICO = 'id, display_id, name, cpf_cnpj, phone, mobile, email, address, rating, created_at';

/**
 * Detalhe do pedido para o vendedor.
 *
 * Rota própria, e não a de Vendas, por dois motivos: o vendedor não tem
 * o módulo `sales` (que dá também PUT e DELETE), e o que ele vê aqui é
 * recortado — item, quantidade, preço de venda e etapa. Custo, margem e
 * rateio não saem daqui porque nem são consultados.
 *
 * A Tela 2 completa ainda vai ser especificada; isto é o que sustenta o
 * botão "Visualizar detalhes" enquanto isso.
 */
router.get('/pedidos/:id', async (req, res) => {
  try {
    // Um select tolerante: colunas de migrações recentes (freight_quote,
    // avisos, event_date) podem faltar numa base que ainda não migrou, e
    // o pedido tem que abrir do mesmo jeito.
    const CAMPOS = `
      id, number, status, origin, source, subtotal, discount, freight, total,
      created_at, operation_date, event_date, ship_date, delivery_date, max_delivery_date,
      payment_method, notes, delivery_mode, pickup_person, artwork_url, artwork_notes, receipt_url, user_id, carrier_id,
      art_file, production_photos,
      tracking_code, freight_quote, avisos, production_log, collect_date, transport_days,
      CLIENTES ( ${CLIENTE_FICHA} ),
      USUARIOS ( id, name ),
      VENDA_ITENS ( id, product_name, quantity, unit_price, discount, total, customization,
                    PRODUTOS ( id, code, name, unit, ink_type ) )
    `;
    let { data, error } = await supabase.from('VENDAS').select(CAMPOS)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();

    /**
     * O PEDIDO SE CONSERTA AO ABRIR. Se ele está em "aguardando
     * financeiro" e a conta já foi paga e conferida (por qualquer porta
     * do Financeiro, inclusive versões antigas que não avisavam o
     * pedido), anda agora — antes de mostrar. Ninguém liga para o
     * desenvolvedor pedindo para passar status.
     */
    if (data?.status === 'aguardando_financeiro') {
      const novo = await Auto.avancarPedidoDaConta(req.tenantId, data.id, req, 'abrir-pedido');
      if (novo) ({ data, error } = await supabase.from('VENDAS').select(CAMPOS)
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle());
    }

    if (error && /column|does not exist|schema cache/i.test(error.message || '')) {
      const basico = CAMPOS
        .replace(/\n      art_file, production_photos,/, '')
        .replace(/freight_quote, avisos, production_log, collect_date, transport_days,/, 'production_log,')
        .replace(/, delivery_mode, pickup_person/, '')
        .replace(/, event_date/, '')
        .replace(CLIENTE_FICHA, CLIENTE_BASICO);
      ({ data, error } = await supabase.from('VENDAS').select(basico)
        .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle());
    }
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && data.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    const alertas = await alertasAbertos(req.tenantId, [data.id]);
    const info = A.infoStatus(data.status);

    // As colunas do item (Linha, Cor, Categoria, Acessório…) não existem
    // como campos: nascem do JSON de personalização. A derivação é a
    // mesma que a tela do cliente usa — uma conta, um lugar.
    const itens = (data.VENDA_ITENS || [])
      .map(item => ({ id: item.id, ...caracteristicasDoItem(item) }));

    // A transportadora vem de LOGISTICA por id; sem ela o campo some da
    // tela em vez de mostrar um uuid.
    let transportadora = null;
    if (data.carrier_id) {
      const { data: t } = await supabase.from('TRANSPORTADORAS')
        .select('id, name, trade_name').eq('id', data.carrier_id).maybeSingle();
      transportadora = t ? (t.trade_name || t.name) : null;
    }

    // OS DADOS DA EMPRESA VÊM COM O PEDIDO, e não do login guardado no
    // navegador. O documento circula fora do ERP (vai para o cliente,
    // para a transportadora, para o contador): CNPJ e endereço nele
    // precisam ser os de agora, não os do dia em que aquela aba abriu.
    const { data: empresa } = await supabase.from('EMPRESAS')
      .select('name, cnpj, address, phone, email').eq('id', req.tenantId).maybeSingle();

    res.json({
      ...data,
      empresa: empresa || null,
      codigo: codigoPedido(data.number),
      codigo_cliente: data.CLIENTES?.display_id != null ? String(data.CLIENTES.display_id).padStart(4, '0') : null,
      vendedor: data.USUARIOS?.name || null,
      transportadora,
      status_label: info.label,
      // Retirada: quem está autorizado a buscar, com o CPF INTEIRO —
      // é ele que confere com o documento na mão da pessoa no balcão.
      retirada: A.ehRetirada(data)
        ? { autorizado: paraOBalcao(data.pickup_person), retirou: quemRetirou(data.production_log) }
        : null,
      status_cor: info.cor,
      atencao: A.calcularAtencao(data, new Date(), alertas.get(data.id) || null),
      // A MESMA REGUA DO CLIENTE, e nao mais uma resumida.
      //
      // Esta tela desenhava FASES (13) e a tela do cliente desenhava
      // STATUS (24) — a mesma venda contada de dois jeitos. Quem
      // atendia o telefone tinha o cliente dizendo "estou na etapa 8" e
      // via a etapa 5 na frente, sem as duas estarem erradas: "aguardando
      // arte" e "arte aprovada" eram uma bolinha aqui e duas la.
      //
      // Duas contagens para o mesmo pedido nao e detalhe de tela: e o
      // vendedor e o cliente falando linguas diferentes sobre a mesma
      // coisa. Agora e uma regua so. Pintura e borda continuam entrando
      // apenas quando os itens passam por elas.
      linha_do_tempo: A.linhaDoTempo(data, etapasDosItens(itens)),

      /**
       * O QUE A FÁBRICA PERDEU NESTE PEDIDO — E QUE O CLIENTE NÃO PERDE.
       *
       * A perda era informada no chão de fábrica e morria lá: o
       * comercial só descobria a quebra se alguém contasse por
       * WhatsApp. Agora ela volta com o pedido.
       *
       * E volta com a conta certa: pediu 200, quebraram 5, a linha faz
       * 205 e o cliente recebe 200. Quem atende o telefone precisa
       * poder dizer isso de olhar na tela — porque a pergunta que
       * chega é "vai atrasar?", e não "quantos quebraram".
       */
      producao: contaDaProducao(data.production_log, data.VENDA_ITENS, ROTULO_ETAPA),

      /**
       * O PRAZO, CONTADO DO EVENTO PARA TRÁS.
       *
       * A data que decide não é a de saída — é a do evento. O cliente
       * casa dia 2; se o copo chegar dia 3, ele não chegou. A conta
       * (evento − dias da transportadora − margem) era feita de cabeça
       * uma vez, no dia da venda, e nunca mais refeita.
       *
       * Aqui ela é refeita a cada abertura da tela, e traz junto o
       * alerta de 24 horas quando a véspera chega com o pedido ainda
       * parado na fábrica.
       */
      prazo: Prazo.prazoDoPedido(data, await Prazo.preparar(req.tenantId, [data])),
      // A MESMA LINHA DO TEMPO, MAS COM O BOTAO. Desenhar as fases sem
      // dizer como passar delas era o que fazia esta tela um cartaz: o
      // pedido chegava em "Aguardando financeiro" e morava la. A ficha
      // diz em que fase ele esta, o que ainda falta, se QUEM ESTA OLHANDO
      // pode dar o passo e para onde ele vai.
      // `comprovante_quitado` PRECISA VIR JUNTO: e ele que cumpre o
      // requisito da etapa de Pagamento. Sem ele esta tela mostrava
      // "Confirmar o pagamento" apagado com o comprovante anexado e
      // quitado logo acima — o painel do fluxo acertava, esta nao,
      // porque cada uma carrega a venda do seu jeito.
      fluxo: F.fichaDeFluxo(
        // `arte_resumo` entra pelo mesmo motivo que o comprovante: e
        // ele que responde se a etapa de Arte esta cumprida, agora que
        // a arte da loja espera o sim do cliente. Sem ele esta tela
        // ofereceria "Aprovar a arte" num pedido cuja arte o cliente
        // acabou de reprovar no portal.
        { ...data, itens_qtd: itens.length, arte_resumo: resumoDaArte(itens),
          comprovante_quitado: await C.estaQuitada(req.tenantId, data),
          // A conferência do financeiro entra junto: ela virou requisito
          // da etapa de Pagamento, e sem ela esta tela mostraria
          // "Confirmar o pagamento" liberado num pedido que o financeiro
          // ainda não olhou.
          comprovante_conferido: await C.estaConferida(req.tenantId, data),
          pagamento_resumo: await C.situacaoDoPagamento(req.tenantId, data) },
        etapasDosItens(itens),
        { acesso: req.acesso, perfil: req.userProfile },
      ),
      historico: A.historicoPedido(data),
      itens,
      resumo_cliente: await resumoDoCliente(req.tenantId, data.customer_id, data.CLIENTES),
      avisos: await avisosDoPedido(req.tenantId, data),
      documentos: documentosDoPedido(data),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * O RESUMO DO CLIENTE — quem é este cliente, em seis números.
 *
 * É o que o vendedor precisa saber antes de atender: se é cliente de
 * doze pedidos ou o primeiro, se tem coisa em andamento, quanto costuma
 * gastar. Sem isso ele abre o pedido sem saber com quem está falando.
 *
 * Tudo é calculado do histórico daquele código de cliente, na hora —
 * não existe campo guardado, e nem deveria: número copiado é número
 * que envelhece. O vendedor consulta, não edita.
 *
 * O ticket médio ignora o frete, pela mesma razão de sempre: frete não
 * é venda do vendedor.
 */
async function resumoDoCliente(tenantId, customerId, cliente) {
  if (!customerId) return null;

  const { data, error } = await supabase.from('VENDAS')
    .select('id, status, total, discount, freight, created_at, operation_date')
    .eq('tenant_id', tenantId).eq('customer_id', customerId)
    .in('type', ['sale', 'order']);
  if (error || !data?.length) return null;

  const ENTREGUES = ['entregue', 'pedido_finalizado', 'delivered', 'completed'];
  const CANCELADOS = ['cancelled'];

  let entregues = 0, andamento = 0, soma = 0, ultima = null;
  for (const v of data) {
    if (CANCELADOS.includes(v.status)) continue;
    if (ENTREGUES.includes(v.status)) entregues++; else andamento++;
    soma += Math.max(0, (Number(v.total) || 0) - (Number(v.freight) || 0));
    const quando = v.operation_date || v.created_at;
    if (quando && (!ultima || String(quando) > String(ultima))) ultima = quando;
  }
  const validos = entregues + andamento;

  return {
    total_compras: validos,
    entregues,
    em_andamento: andamento,
    ultima_compra: ultima,
    ticket_medio: validos > 0 ? Math.round((soma / validos) * 100) / 100 : 0,
    // "Cliente desde" é o cadastro, não a primeira compra: o cliente que
    // se cadastrou em 2024 e comprou em 2026 é cliente desde 2024.
    cliente_desde: cliente?.created_at || null,
  };
}

/**
 * QUEM DE FATO RETIROU — o que a logística registrou no balcão.
 *
 * "Quem retira" é quem o cliente AUTORIZOU pelo portal; quem retirou é
 * quem apareceu, teve o documento conferido e levou a mercadoria. Os dois
 * nem sempre são a mesma pessoa, e é o segundo que responde "entregaram
 * para quem?".
 *
 * O nome mora no histórico: a baixa da retirada na Logística grava
 * `quem_retirou` no marco da etapa, e a confirmação feita pelo cliente no
 * portal grava o mesmo campo. Vale o registro mais recente.
 */
function quemRetirou(log) {
  const marco = [...(Array.isArray(log) ? log : [])].reverse()
    .find(e => e && String(e.quem_retirou || '').trim());
  if (!marco) return null;
  return {
    nome: String(marco.quem_retirou).trim(),
    em: marco.at || null,
    registrado_por: marco.stage === 'coleta' ? (marco.user || 'Logística') : 'Cliente, pelo portal',
    documento_conferido: marco.documento_conferido === true,
  };
}

/**
 * O que dá para baixar. A nota fiscal só aparece disponível depois da
 * coleta — antes disso ela não existe, e um botão que não funciona é
 * pior que um botão explicando por quê.
 */
function documentosDoPedido(venda) {
  const jaColetado = ['mercadoria_coletada', 'produto_retirado', 'em_transito', 'aguardando_entrega', 'entregue', 'pedido_finalizado']
    .includes(venda.status);
  return [
    { key: 'pedido',      label: 'Pedido em PDF',                disponivel: true },
    // Disponível quando o ARQUIVO existe, não quando a forma de pagamento
    // foi escolhida: escolher pix não produz comprovante nenhum, e o botão
    // acendia prometendo um arquivo que ninguém tinha subido.
    { key: 'comprovante', label: 'Baixar Comprovante de Pagamento',
      disponivel: !!venda.receipt_url,
      // Sem a URL: o comprovante é pedido à rota própria, que devolve
      // link assinado. Mandar o caminho na resposta seria guardar o
      // endereço do arquivo em toda aba aberta do navegador.
      via_rota: !!venda.receipt_url,
      nota: venda.receipt_url ? null : 'Anexe o comprovante para disponibilizar' },
    { key: 'nfe',         label: 'Baixar Nota Fiscal',
      disponivel: jaColetado,
      nota: jaColetado ? null : 'Disponível após a coleta' },
  ];
}

/**
 * Excluir um pedido pela tela do vendedor.
 *
 * O vendedor não apaga sozinho: ele chama o gerente, que digita o
 * e-mail e a senha DELE ali na hora. Fica na auditoria quem autorizou —
 * não só quem clicou.
 *
 * Só pedido da carteira dele, e só enquanto não saiu: depois de coletado
 * o pedido existe no mundo, e apagar do sistema não o traz de volta.
 */
const FORA_DE_ALCANCE = ['mercadoria_coletada', 'produto_retirado', 'em_transito',
                         'aguardando_entrega', 'entregue', 'pedido_finalizado'];

/**
 * ANEXAR ARQUIVO AO PEDIDO — arte ou comprovante.
 *
 * A PRIMEIRA arte anexada MOVE o pedido para "aguardando impressão de
 * vegetal". Antes não movia — a intenção era boa (arquivo que chega não
 * é arte aprovada), mas o efeito era um pedido escrito "Aguardando
 * Anexo da Arte" com a arte anexada havia cinco dias, porque alguém
 * tinha que lembrar de avançar a etapa à mão e ninguém lembrava.
 *
 * Substituir NÃO mexe no status, e pede autorização de gerente: a arte
 * antiga pode já ter virado vegetal, tela e copo impresso.
 *
 * Fica no histórico quem anexou, quando, e quem autorizou a troca — a
 * segunda arte de um pedido é exatamente o que alguém vai querer
 * explicar depois.
 */
router.post('/pedidos/:id/anexar', async (req, res) => {
  try {
    const tipo = String(req.body?.tipo || '').trim();
    if (!['arte', 'comprovante'].includes(tipo)) {
      return res.status(400).json({ error: 'Tipo de anexo inválido.' });
    }
    const arquivo = req.body?.arquivo;
    if (typeof arquivo !== 'string' || !arquivo.startsWith('data:')) {
      return res.status(400).json({ error: 'Envie um arquivo.' });
    }

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, user_id, status, artwork_url, receipt_url, production_log')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    // ── TROCAR UMA ARTE JÁ ANEXADA PEDE GERENTE ──────────────
    //
    // Anexar a primeira arte é trabalho normal: o pedido está parado
    // esperando exatamente isso. SUBSTITUIR é outra coisa — a arte
    // antiga pode já ter virado vegetal, tela e copo impresso, e a
    // troca silenciosa é o caminho para mil peças saírem com o desenho
    // errado sem ninguém saber quem mandou trocar.
    //
    // Por isso a senha é conferida NA HORA, e é a de um gerente: não
    // basta a tela estar destravada com a sessão de alguém.
    let autorizacao = null;
    if (tipo === 'arte' && venda.artwork_url) {
      const r = await autorizar(
        String(req.body?.autorizador_email || '').trim().toLowerCase(),
        String(req.body?.autorizador_senha || ''),
        req.tenantId,
      );
      if (!r.ok) {
        return res.status(r.status).json({
          error: r.motivo,
          code: 'AUTORIZACAO_NECESSARIA',
          dica: 'Trocar uma arte já anexada precisa da autorização de um gerente ou administrador.',
        });
      }
      autorizacao = r.usuario;
    }

    // A arte vai para o bucket público porque produção, designer e o
    // próprio cliente precisam abri-la o tempo todo. O COMPROVANTE não:
    // ele traz nome do pagador, banco e valor, e vai para o privado, de
    // onde só sai por link assinado que expira.
    const url = tipo === 'arte'
      ? await uploadDataUrl(arquivo, 'artes-pedido')
      : await uploadPrivado(arquivo, 'comprovantes-pedido');
    if (!url) return res.status(502).json({ error: 'Não foi possível guardar o arquivo. Tente de novo.' });

    const campo = tipo === 'arte' ? 'artwork_url' : 'receipt_url';
    const substituindo = !!venda[campo];

    const agora = new Date().toISOString();
    const quem = req.userProfile?.name || req.user?.email || null;
    const log = Array.isArray(venda.production_log) ? venda.production_log : [];
    log.push({
      action: tipo === 'arte' ? 'arte_anexada' : 'comprovante_anexado',
      at: agora,
      user: quem,
      stage: 'documentos',
      nota: substituindo
        ? `substituiu o anterior — autorizado por ${autorizacao?.name || autorizacao?.email || 'gerente'}`
        : null,
    });

    // A ARTE QUE CHEGA MOVE O PEDIDO — mas quem decide PARA ONDE é o
    // motor de etapas, mais abaixo, e não esta rota.
    //
    // Aqui o destino era escrito à mão como 'aguardando_vegetal': certo
    // para um copo com serigrafia, errado para um liso, que não passa
    // por vegetal nenhum — o pedido ia parar numa etapa que a própria
    // linha do tempo dele não mostra.
    //
    // Substituição continua não mexendo no status: o pedido já pode
    // estar na pintura, e puxá-lo de volta seria reescrever uma etapa
    // que aconteceu.
    const avanca = tipo === 'arte' && !substituindo;

    const patch = {
      [campo]: url,
      production_log: log,
      ...(req.body?.notas && tipo === 'arte' ? { artwork_notes: req.body.notas } : {}),
    };

    const { error } = await supabase.from('VENDAS')
      .update(patch).eq('id', venda.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    let avancou = null;
    if (avanca) {
      try {
        const carga = await carregarParaFluxo(req.tenantId, venda.id);
        const passo = carga && await Auto.avancarAposArte(req.tenantId, carga.venda, carga.aplicaveis, req);
        if (passo) {
          await gravarPasso(req.tenantId, venda.id, passo);
          avancou = passo.status;
        }
      } catch (e) {
        // O arquivo já está guardado. O pedido ficar onde estava é
        // recuperável no clique de sempre; perder o anexo, não.
        console.error('[area-vendedor] avanco apos anexo:', e.message);
      }
    }

    audit(req, 'update', 'venda', venda.id, {
      anexo: tipo, substituiu: substituindo,
      autorizado_por: autorizacao?.email || null,
      status_novo: avancou,
    });
    res.json({
      url, substituiu: substituindo, avancou: !!avancou,
      status: avancou || venda.status,
      status_label: avancou ? A.infoStatus(avancou).label : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A ARTE DE UM ITEM, E NÃO A ARTE DO PEDIDO.
 *
 * O QUE ESTAVA ERRADO. Existia UM botão "Anexar arte" para o pedido
 * inteiro, gravando em `VENDAS.artwork_url`. Só que cem copos de um
 * jeito e cem de outro são dois itens com dois desenhos: a segunda arte
 * anexada apagava a primeira, e a produção ia buscar o arquivo errado
 * para metade do pedido. Na tela, a coluna "Arte" mostrava traço nas
 * duas linhas porque não havia arte de item nenhuma — só a do pedido.
 *
 * Agora cada item tem a sua, no mesmo lugar em que o portal do cliente
 * já grava a dele: `customization.arte_cliente`. Uma pasta só, um campo
 * só — o vendedor que sobe pelo ERP e a cliente que manda pelo portal
 * enchem a mesma gaveta, e a produção olha um lugar só.
 *
 * `VENDAS.artwork_url` continua existindo e continua sendo o que a etapa
 * de Arte do fluxo pergunta. A PRIMEIRA arte anexada assume o posto; as
 * seguintes não roubam o lugar dela. Sem isso, um pedido de dois itens
 * ficaria eternamente "sem arte" para o motor de etapas.
 *
 * TROCAR PEDE GERENTE, como em todo o resto: a arte antiga pode já ter
 * virado vegetal, tela e copo impresso.
 */
router.post('/pedidos/:id/item/:itemId/arte', async (req, res) => {
  try {
    const arquivo = req.body?.arquivo;
    if (typeof arquivo !== 'string' || !arquivo.startsWith('data:')) {
      return res.status(400).json({ error: 'Envie um arquivo.' });
    }
    if (arquivo.length > 8 * 1024 * 1024) {
      return res.status(413).json({ error: 'A arte passa de 6 MB. Mande um arquivo menor.' });
    }

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, user_id, status, artwork_url, production_log')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    // O ITEM É DESTE PEDIDO? Sem esta conferência, trocar o id na
    // chamada gravaria a arte no pedido de outra pessoa.
    const { data: item } = await supabase.from('VENDA_ITENS')
      .select('id, sale_id, product_name, customization')
      .eq('id', req.params.itemId).maybeSingle();
    if (!item || item.sale_id !== venda.id) {
      return res.status(404).json({ error: 'Item não encontrado neste pedido.' });
    }

    const conf = item.customization || {};
    const substituindo = !!conf.arte_cliente?.url;

    let autorizacao = null;
    if (substituindo) {
      const r = await autorizar(
        String(req.body?.autorizador_email || '').trim().toLowerCase(),
        String(req.body?.autorizador_senha || ''),
        req.tenantId,
      );
      if (!r.ok) {
        return res.status(r.status).json({
          error: r.motivo,
          code: 'AUTORIZACAO_NECESSARIA',
          dica: 'Trocar uma arte já anexada precisa da autorização de um gerente ou administrador.',
        });
      }
      autorizacao = r.usuario;
    }

    const url = await uploadDataUrl(arquivo, 'artes-pedido');
    if (!url) return res.status(502).json({ error: 'Não foi possível guardar o arquivo. Tente de novo.' });

    const agora = new Date().toISOString();
    const quem = req.userProfile?.name || req.user?.email || null;
    const nome = String(req.body?.nome || '').trim().slice(0, 120) || null;

    const { error: erroItem } = await supabase.from('VENDA_ITENS').update({
      customization: { ...conf, arte_cliente: { url, nome, enviada_em: agora, por: quem || 'vendedor' } },
    }).eq('id', item.id).eq('sale_id', venda.id);
    if (erroItem) throw erroItem;

    const log = Array.isArray(venda.production_log) ? [...venda.production_log] : [];
    log.push({
      action: 'arte_anexada', at: agora, user: quem, stage: 'documentos',
      item: item.product_name || null,
      // A arte que sai daqui é a da LOJA, e ela ainda não está
      // combinada: o cliente vai vê-la no portal e dizer se é aquilo.
      // Escrever isso no histórico é o que explica, seis meses depois,
      // por que o pedido ficou parado na etapa de arte com o arquivo já
      // anexado — ele não estava esperando a fábrica, estava esperando
      // o cliente.
      nota: substituindo
        ? `substituiu a arte do item (aguardando a confirmação do cliente) — `
          + `autorizado por ${autorizacao?.name || autorizacao?.email || 'gerente'}`
        : 'aguardando a confirmação do cliente no portal',
    });

    const patch = { production_log: log };
    if (!venda.artwork_url) patch.artwork_url = url;
    const { error } = await supabase.from('VENDAS')
      .update(patch).eq('id', venda.id).eq('tenant_id', req.tenantId);
    if (error) throw error;

    // O PEDIDO ANDA SOZINHO SE A ARTE ERA O QUE FALTAVA. Antes o status
    // era escrito à mão como 'aguardando_vegetal' — certo para um copo
    // com serigrafia, errado para um liso, que não passa por vegetal
    // nenhum. Quem decide o destino é o mesmo motor que a tela usa.
    let avancou = null;
    try {
      const carga = await carregarParaFluxo(req.tenantId, venda.id);
      const passo = carga && await Auto.avancarAposArte(req.tenantId, carga.venda, carga.aplicaveis, req);
      if (passo) {
        await gravarPasso(req.tenantId, venda.id, passo);
        avancou = passo.status;
      }
    } catch (e) {
      // A arte já está guardada. O pedido ficar onde estava é
      // recuperável no clique de sempre; perder o arquivo, não.
      console.error('[area-vendedor] avanco apos arte:', e.message);
    }

    audit(req, 'update', 'venda', venda.id, {
      anexo: 'arte', item_id: item.id, substituiu: substituindo,
      autorizado_por: autorizacao?.email || null, status_novo: avancou,
    });

    res.json({
      url, substituiu: substituindo, avancou: !!avancou,
      status: avancou || venda.status,
      status_label: avancou ? A.infoStatus(avancou).label : null,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * O comprovante, por link temporário.
 *
 * O arquivo mora no bucket privado; o que sai daqui é um link que
 * expira em dez minutos. Assim, o link que for parar num print ou num
 * encaminhado de WhatsApp não abre o comprovante de ninguém amanhã.
 */
router.get('/pedidos/:id/comprovante', async (req, res) => {
  try {
    const { data: venda } = await supabase.from('VENDAS')
      .select('id, user_id, receipt_url')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }
    if (!venda.receipt_url) return res.status(404).json({ error: 'Este pedido ainda não tem comprovante anexado.' });

    const link = await linkAssinado(venda.receipt_url, 600);
    if (!link) return res.status(502).json({ error: 'Não foi possível abrir o comprovante agora.' });
    res.json({ url: link });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pedidos/:id/excluir', async (req, res) => {
  try {
    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, user_id')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }
    if (FORA_DE_ALCANCE.includes(venda.status)) {
      return res.status(409).json({
        error: 'Este pedido já saiu da fábrica e não pode ser excluído. Fale com o gerente.',
      });
    }

    const auth = await autorizar(
      String(req.body?.email || '').trim().toLowerCase(),
      String(req.body?.password || ''),
      req.tenantId,
    );
    if (!auth.ok) return res.status(auth.status).json({ error: auth.motivo });

    const r = await excluirVenda(req, venda.id, auth.usuario, req.body?.motivo);
    if (!r.ok) return res.status(r.status).json({ error: r.motivo });
    res.json({ message: r.mensagem, autorizado_por: auth.usuario.name });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** O detalhe que a janelinha da coluna Atenção mostra. */
router.get('/pedidos/:id/atencao', async (req, res) => {
  try {
    const { data: venda, error } = await supabase.from('VENDAS')
      .select(PEDIDO_SELECT).eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (error) throw error;
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    const alertas = await alertasAbertos(req.tenantId, [venda.id]);
    const atencao = A.calcularAtencao(venda, new Date(), alertas.get(venda.id) || null);

    res.json({
      pedido: {
        id: venda.id,
        codigo: `PV-${String(venda.number).padStart(4, '0')}`,
        cliente: venda.CLIENTES?.name || null,
        origem: venda.origin || null,
      },
      atencao,
      // Quando o alerta foi levantado — é a "última atualização" da janela
      alerta: alertas.get(venda.id) || null,
      atualizado_em: alertas.get(venda.id)?.created_at || venda.created_at,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Alerta compartilhado entre setores
// ============================================================
/**
 * "Comunicar Gerente" da janelinha de Atenção.
 *
 * Faz duas coisas de uma vez: abre o alerta na área responsável (que o
 * módulo dela vai listar) e manda a mensagem ao gerente. O vendedor não
 * intervém no módulo do outro — ele avisa, e quem resolve é quem tem a
 * caneta.
 */
router.post('/pedidos/:id/comunicar', async (req, res) => {
  const motivo = String(req.body.reason || '').trim();
  try {
    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, user_id, customer_id, CLIENTES ( name )')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (!isManager(req) && venda.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Este pedido não é da sua carteira' });
    }

    const info = A.infoStatus(venda.status);
    const codigo = `PV-${String(venda.number).padStart(4, '0')}`;
    const quem = req.userProfile?.name || req.user?.email || 'Vendedor';

    let alerta = null;
    try {
      const { data } = await supabase.from('ALERTAS_PEDIDO').insert({
        tenant_id: req.tenantId,
        sale_id: venda.id,
        area: info.area,
        stage: info.label,
        reason: motivo || `Pedido parado em ${A.AREAS[info.area] || info.area}`,
        raised_by: req.user.id,
        raised_name: quem,
      }).select().single();
      alerta = data;
    } catch { /* migração pendente: a mensagem ao gerente ainda vai */ }

    const gerentes = await listarGerentes(req.tenantId);
    const corpo = [
      `${codigo} — ${venda.CLIENTES?.name || 'cliente'}`,
      `Etapa atual: ${info.label} (${A.AREAS[info.area] || info.area})`,
      motivo ? `\n${motivo}` : '',
    ].join('\n');

    await enviarMensagem(req, {
      to: gerentes.map(g => g.id),
      sale_id: venda.id,
      subject: `Atenção em ${codigo}`,
      body: corpo,
    });

    audit(req, 'create', 'alerta_pedido', alerta?.id || venda.id, { area: info.area, status: venda.status });
    res.status(201).json({ alerta, gerentes: gerentes.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * Os alertas de uma área. É por aqui que o Financeiro, o Estoque e a
 * Produção veem o MESMO problema que o vendedor está vendo — cada um
 * pela própria tela, com o que o perfil dele permite.
 */
router.get('/alertas', async (req, res) => {
  try {
    let q = supabase.from('ALERTAS_PEDIDO')
      .select('*, VENDAS ( id, number, status, ship_date, delivery_date, CLIENTES ( name ) )')
      .eq('tenant_id', req.tenantId)
      .order('created_at', { ascending: false })
      .limit(200);
    if (req.query.area) q = q.eq('area', String(req.query.area));
    if (req.query.abertos !== '0') q = q.is('resolved_at', null);

    const { data, error } = await q;
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/alertas/:id/resolver', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ALERTAS_PEDIDO').update({
      resolved_at: new Date().toISOString(),
      resolved_by: req.user.id,
      resolution: String(req.body.resolution || '').slice(0, 500) || null,
    }).eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'alerta_pedido', req.params.id, { resolvido: true });
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Agenda
// ============================================================
const KINDS = ['reuniao', 'ligacao', 'retorno', 'compromisso', 'observacao'];

router.get('/agenda', async (req, res) => {
  try {
    const userId = (isManager(req) && req.query.user_id) ? String(req.query.user_id) : req.user.id;
    let q = supabase.from('AGENDA_VENDEDOR')
      .select('*, CLIENTES ( id, name )')
      .eq('tenant_id', req.tenantId).eq('user_id', userId)
      .order('done').order('due_at', { nullsFirst: false }).limit(500);
    if (req.query.pendentes === '1') q = q.eq('done', false);

    const { data, error } = await q;
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/agenda', async (req, res) => {
  const b = req.body || {};
  if (!String(b.title || '').trim()) return res.status(400).json({ error: 'Descreva o compromisso' });
  try {
    const { data, error } = await supabase.from('AGENDA_VENDEDOR').insert({
      tenant_id: req.tenantId,
      user_id: req.user.id,
      kind: KINDS.includes(b.kind) ? b.kind : 'compromisso',
      title: String(b.title).slice(0, 200),
      notes: b.notes ? String(b.notes).slice(0, 2000) : null,
      customer_id: b.customer_id || null,
      due_at: b.due_at || null,
    }).select('*, CLIENTES ( id, name )').single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/agenda/:id', async (req, res) => {
  const b = req.body || {};
  const patch = { updated_at: new Date().toISOString() };
  if (b.title !== undefined)       patch.title = String(b.title).slice(0, 200);
  if (b.notes !== undefined)       patch.notes = b.notes ? String(b.notes).slice(0, 2000) : null;
  if (b.kind !== undefined && KINDS.includes(b.kind)) patch.kind = b.kind;
  if (b.customer_id !== undefined) patch.customer_id = b.customer_id || null;
  if (b.due_at !== undefined)      patch.due_at = b.due_at || null;
  if (b.done !== undefined) {
    patch.done = !!b.done;
    patch.done_at = b.done ? new Date().toISOString() : null;
  }
  try {
    // O .eq('user_id') não é redundância: é o que impede um vendedor de
    // marcar como feito o compromisso de outro passando o id na URL.
    const { data, error } = await supabase.from('AGENDA_VENDEDOR')
      .update(patch)
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('user_id', req.user.id)
      .select('*, CLIENTES ( id, name )').single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/agenda/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('AGENDA_VENDEDOR')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('user_id', req.user.id);
    if (error) throw error;
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ============================================================
// Comunicação — vendedor ↔ gerente, e mais ninguém
// ============================================================
async function listarGerentes(tenantId) {
  const { data } = await supabase.from('USUARIOS')
    .select('id, name, email, role')
    .eq('tenant_id', tenantId).eq('is_active', true)
    .in('role', ['admin', 'manager']);
  return data || [];
}

/**
 * Com quem esta pessoa pode falar.
 *
 * Vendedor → só gerentes e admins. Gerente → qualquer usuário ativo.
 * Não existe "escolher a produção": o vendedor relata ao gerente e o
 * gerente encaminha internamente. Sem isso, o operador da revelação
 * receberia cobrança de quatro vendedores ao mesmo tempo.
 */
router.get('/comunicacao/contatos', async (req, res) => {
  try {
    if (isManager(req)) {
      const { data } = await supabase.from('USUARIOS')
        .select('id, name, email, role, sector_key')
        .eq('tenant_id', req.tenantId).eq('is_active', true).neq('id', req.user.id)
        .order('name');
      return res.json(data || []);
    }
    res.json(await listarGerentes(req.tenantId));
  } catch (err) { res.status(500).json({ error: err.message }); }
});

async function enviarMensagem(req, { to = [], sale_id = null, subject = null, body, thread_id = null }) {
  const destinos = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!destinos.length || !String(body || '').trim()) return [];

  const linhas = destinos.map(dest => ({
    tenant_id: req.tenantId,
    ...(thread_id ? { thread_id } : {}),
    from_user_id: req.user.id,
    from_name: req.userProfile?.name || req.user?.email || null,
    to_user_id: dest,
    sale_id,
    subject: subject ? String(subject).slice(0, 160) : null,
    body: String(body).slice(0, 4000),
  }));

  try {
    const { data } = await supabase.from('MENSAGENS_INTERNAS').insert(linhas).select();
    return data || [];
  } catch { return []; }
}

router.get('/comunicacao', async (req, res) => {
  try {
    // A caixa é tudo que eu mandei ou recebi — a conversa inteira, não
    // só o que chegou.
    const { data, error } = await supabase.from('MENSAGENS_INTERNAS')
      .select('*')
      .eq('tenant_id', req.tenantId)
      .or(`from_user_id.eq.${req.user.id},to_user_id.eq.${req.user.id}`)
      .order('created_at', { ascending: false })
      .limit(300);
    if (error) { if (tabelaAusente(error)) return res.json([]); throw error; }
    res.json(data || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/comunicacao', async (req, res) => {
  const b = req.body || {};
  if (!String(b.body || '').trim()) return res.status(400).json({ error: 'Escreva a mensagem' });

  try {
    let destinos = Array.isArray(b.to) ? b.to : (b.to ? [b.to] : []);

    if (!isManager(req)) {
      // A trava real está aqui, não na tela: o vendedor só alcança
      // gerente e admin, mesmo mandando outro id no corpo.
      const gerentes = await listarGerentes(req.tenantId);
      const ids = new Set(gerentes.map(g => g.id));
      destinos = destinos.filter(d => ids.has(d));
      if (!destinos.length) destinos = gerentes.map(g => g.id);
      if (!destinos.length) return res.status(400).json({ error: 'Nenhum gerente cadastrado para receber a mensagem' });
    }

    const enviadas = await enviarMensagem(req, {
      to: destinos,
      sale_id: b.sale_id || null,
      subject: b.subject || null,
      body: b.body,
      thread_id: b.thread_id || null,
    });
    if (!enviadas.length) return res.status(503).json({ error: 'Rode a migração 067 no banco para usar a comunicação.' });
    res.status(201).json(enviadas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/comunicacao/:id/lida', async (req, res) => {
  try {
    const { data, error } = await supabase.from('MENSAGENS_INTERNAS')
      .update({ read_at: new Date().toISOString() })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).eq('to_user_id', req.user.id)
      .select().single();
    if (error) throw error;
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
