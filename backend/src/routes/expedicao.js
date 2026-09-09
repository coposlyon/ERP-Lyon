// ============================================================
// EXPEDIÇÃO — A FILA DA LOGÍSTICA, QUE NÃO EXISTIA.
//
// "Logística" no sistema era o CADASTRO DE TRANSPORTADORAS: nome, CNPJ,
// contrato, tabela de preço. Útil, e nada a ver com o trabalho de quem
// senta ali de manhã, que é OUTRO: quais pedidos estão prontos, quais
// já foram avisados, qual precisa de nota, qual espera coleta.
//
// Esse trabalho acontecia por WhatsApp e memória. O pedido terminava a
// embalagem, entrava em "Aguardando coleta", e a partir dali o sistema
// não tinha mais nada a dizer — nem para a logística, nem para o
// cliente, que ligava perguntando se já podia buscar.
//
// AQUI FICA A FILA. Ela tem três faixas, e a terceira é a que o cliente
// pediu explicitamente:
//
//   a expedir    pronto na prateleira, esperando sair
//   em trânsito  saiu, ainda não chegou
//   concluído    ENTREGUE OU RETIRADO — e continua na tela, porque é
//                sempre depois da entrega que o cliente liga pedindo a
//                nota ou o recibo. Sumir com o pedido entregue é obrigar
//                alguém a procurar no histórico de vendas.
//
// O QUE ESTA TELA FAZ E O QUE ELA NÃO FAZ. Ela emite a nota (Focus
// NFe), gera a declaração de conteúdo e a etiqueta de volume, avisa o
// cliente e avisa a transportadora. O que ela NÃO faz é emitir a
// etiqueta DA TRANSPORTADORA nem agendar a coleta no sistema dela:
// isso é API de cada transportadora, uma por uma, e a nossa integração
// Braspress hoje só cota frete e rastreia. Enquanto essa porta não
// abre, o aviso de coleta sai pelo caminho de sempre — mensagem pronta,
// um clique para enviar.
// ============================================================

const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const A = require('../lib/atencao');
const { codigoPedido } = require('../lib/pedidoCodigo');
const { normalizarNumero, sendWhatsApp } = require('../lib/whatsapp');

const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : null);

/**
 * OS PEDIDOS QUE SÃO DA LOGÍSTICA.
 *
 * Começa em `embalagem_finalizada` — o momento em que a caixa fica
 * pronta na prateleira — e vai até o fim, os finalizados inclusos.
 */
const STATUS_DA_EXPEDICAO = [
  'embalagem_finalizada',
  'aguardando_logistica', 'aguardando_coleta', 'coleta_processo',
  'mercadoria_coletada', 'produto_retirado',
  'em_transito', 'aguardando_entrega',
  'entregue', 'pedido_finalizado',
  // Pedidos do fluxo antigo, que nunca conheceram estes status.
  'ready', 'delivered', 'completed',
];

const CONCLUIDOS = new Set(['entregue', 'pedido_finalizado', 'delivered', 'completed', 'produto_retirado']);
const EM_TRANSITO = new Set(['em_transito', 'aguardando_entrega', 'mercadoria_coletada']);

/** Em que faixa da tela este pedido cai. */
function faixaDoPedido(status) {
  if (CONCLUIDOS.has(status)) return 'concluido';
  if (EM_TRANSITO.has(status)) return 'transito';
  return 'a_expedir';
}

/** Os marcos de logística que já aconteceram neste pedido. */
function marcosDaExpedicao(log) {
  const feitos = {};
  for (const e of (Array.isArray(log) ? log : [])) {
    if (e.stage !== 'expedicao') continue;
    feitos[e.action] = { at: e.at, user: e.user, ...e };
  }
  return feitos;
}

/** Grava um marco de expedição no histórico do pedido. */
async function gravarMarco(req, saleId, action, extra = {}) {
  const { data: v } = await supabase.from('VENDAS').select('production_log')
    .eq('id', saleId).eq('tenant_id', req.tenantId).maybeSingle();
  const log = Array.isArray(v?.production_log) ? [...v.production_log] : [];
  log.push({
    stage: 'expedicao', action, at: new Date().toISOString(),
    user_id: req.user?.id || null,
    user: req.userProfile?.name || req.user?.name || req.user?.email || 'Usuário',
    ...extra,
  });
  await supabase.from('VENDAS').update({ production_log: log })
    .eq('id', saleId).eq('tenant_id', req.tenantId);
  return log;
}

/**
 * A TRANSPORTADORA VEM NUMA SEGUNDA CONSULTA, E NAO NUM JOIN.
 *
 * Nao existe chave estrangeira entre VENDAS e TRANSPORTADORAS: a venda
 * guarda `carrier_id` solto. Pedir o join ao PostgREST devolve erro de
 * relacionamento e derruba a consulta inteira — com o efeito de a fila
 * aparecer vazia, como se nao houvesse pedido nenhum a expedir.
 */
async function carregarTransportadoras(tenantId, ids) {
  const limpos = [...new Set((ids || []).filter(Boolean))];
  if (!limpos.length) return {};
  try {
    const { data } = await supabase.from('TRANSPORTADORAS')
      .select('id, name, trade_name, email, phone, whatsapp, contact_name')
      .eq('tenant_id', tenantId).in('id', limpos);
    return Object.fromEntries((data || []).map(t => [t.id, t]));
  } catch { return {}; }
}

/** O pedido inteiro, com cliente e transportadora, para as duas telas. */
async function carregarPedido(tenantId, id) {
  const { data } = await supabase.from('VENDAS')
    .select('*, CLIENTES(id, name, cpf_cnpj, phone, mobile, email, address), '
          + 'VENDA_ITENS(product_name, quantity, unit_price, total, customization, PRODUTOS(code, name, unit))')
    .eq('tenant_id', tenantId).eq('id', id).maybeSingle();
  if (!data) return null;
  const mapa = await carregarTransportadoras(tenantId, [data.carrier_id]);
  return { ...data, TRANSPORTADORAS: mapa[data.carrier_id] || null };
}

// ════════════════════════════════════════════════════════════
// A FILA
// ════════════════════════════════════════════════════════════
router.get('/', async (req, res) => {
  try {
    const { faixa, search } = req.query;

    let q = supabase.from('VENDAS')
      .select('id, number, status, total, freight, delivery_mode, created_at, ship_date, '
            + 'tracking_code, carrier_id, production_log, pickup_person, '
            + 'CLIENTES(name, phone, mobile, email, address)')
      .eq('tenant_id', req.tenantId)
      .in('status', STATUS_DA_EXPEDICAO)
      .order('ship_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(400);

    if (search && /^\d+$/.test(String(search).trim())) q = q.eq('number', parseInt(search, 10));

    const { data, error } = await q;
    if (error) throw error;

    const transportadoras = await carregarTransportadoras(req.tenantId, (data || []).map(v => v.carrier_id));

    // As notas emitidas destes pedidos, numa consulta só. Perguntar por
    // pedido seriam quarenta idas ao banco para desenhar uma tela.
    const ids = (data || []).map(v => v.id);
    const notas = {};
    if (ids.length) {
      try {
        const { data: ns } = await supabase.from('NOTAS_FISCAIS')
          .select('sale_id, numero, status, danfe_url, chave')
          .eq('tenant_id', req.tenantId).in('sale_id', ids);
        for (const n of ns || []) {
          if (n.status === 'cancelado') continue;
          notas[n.sale_id] = { numero: n.numero, status: n.status, danfe_url: n.danfe_url, chave: n.chave };
        }
      } catch { /* base sem NOTAS_FISCAIS ainda: a fila abre do mesmo jeito */ }
    }

    let linhas = (data || []).map(v => {
      const retirada = A.ehRetirada(v);
      const marcos = marcosDaExpedicao(v.production_log);
      const info = A.infoStatus(v.status);
      const end = v.CLIENTES?.address || {};
      return {
        id: v.id,
        codigo: codigoPedido(v.number),
        numero: v.number,
        status: v.status,
        status_label: info.label,
        faixa: faixaDoPedido(v.status),
        cliente: v.CLIENTES?.name || 'Consumidor Final',
        telefone: v.CLIENTES?.mobile || v.CLIENTES?.phone || null,
        cidade: end.city || null,
        uf: end.state || null,
        total: Number(v.total) || 0,
        frete: Number(v.freight) || 0,
        saida: v.ship_date || null,
        // Retirada e entrega são dois trabalhos diferentes nesta tela:
        // um espera o cliente aparecer, o outro espera o caminhão.
        modo: retirada ? 'retirada' : 'entrega',
        transportadora: transportadoras[v.carrier_id]?.trade_name
          || transportadoras[v.carrier_id]?.name || null,
        rastreio: v.tracking_code || null,
        quem_retira: v.pickup_person?.nome || null,
        nota: notas[v.id] || null,
        // O que já foi feito aqui — para o botão não repetir o que já
        // aconteceu, e para saber a quem cobrar quando algo falta.
        avisado: marcos.cliente_avisado || null,
        coleta_solicitada: marcos.coleta_solicitada || null,
        declaracao: marcos.declaracao_emitida || null,
      };
    });

    if (search && !/^\d+$/.test(String(search).trim())) {
      const t = String(search).trim().toLowerCase();
      linhas = linhas.filter(l => l.cliente.toLowerCase().includes(t) || l.codigo.toLowerCase().includes(t));
    }
    if (faixa) linhas = linhas.filter(l => l.faixa === faixa);

    res.json({
      data: linhas,
      contagem: {
        a_expedir: linhas.filter(l => l.faixa === 'a_expedir').length,
        transito: linhas.filter(l => l.faixa === 'transito').length,
        concluido: linhas.filter(l => l.faixa === 'concluido').length,
        // Quem está pronto e ainda não foi avisado é a fila real do dia.
        a_avisar: linhas.filter(l => l.faixa === 'a_expedir' && !l.avisado).length,
      },
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// AVISAR O CLIENTE
// ════════════════════════════════════════════════════════════

/**
 * A MENSAGEM MUDA CONFORME O PEDIDO VAI SER BUSCADO OU ENTREGUE.
 *
 * São duas conversas diferentes: uma convida a vir aqui (e precisa
 * dizer o que trazer), a outra avisa que o caminhão vai sair. Um texto
 * só para as duas obriga o cliente a descobrir qual é o caso dele.
 */
function mensagemDeAviso(venda, retirada) {
  const codigo = codigoPedido(venda.number);
  const nome = String(venda.CLIENTES?.name || '').split(' ')[0] || '';
  const ola = `Olá${nome ? `, ${nome}` : ''}! Aqui é a Lyon Copos.`;

  if (retirada) {
    return [
      ola,
      `Seu pedido *${codigo}* está *pronto e embalado*, esperando você aqui na fábrica. 🎉`,
      '',
      'Para retirar, é só apresentar um documento com foto.',
      venda.pickup_person?.nome
        ? `Está autorizada a retirada por *${venda.pickup_person.nome}*.`
        : 'Se outra pessoa for buscar, nos avise o nome e o CPF dela antes.',
      '',
      'Qualquer dúvida, é só responder por aqui.',
    ].filter(Boolean).join('\n');
  }

  const transp = venda.TRANSPORTADORAS?.trade_name || venda.TRANSPORTADORAS?.name;
  return [
    ola,
    `Seu pedido *${codigo}* está *pronto e embalado* e já vai sair para entrega. 🎉`,
    transp ? `Vai pela *${transp}*.` : null,
    venda.tracking_code ? `Código de rastreio: *${venda.tracking_code}*` : null,
    '',
    'Assim que sair, você recebe a confirmação por aqui.',
  ].filter(Boolean).join('\n');
}

router.post('/:id/avisar-cliente', async (req, res) => {
  try {
    const venda = await carregarPedido(req.tenantId, req.params.id);
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    const retirada = A.ehRetirada(venda);
    const mensagem = mensagemDeAviso(venda, retirada);
    const fone = normalizarNumero(venda.CLIENTES?.mobile || venda.CLIENTES?.phone);

    /**
     * MEIO AUTOMÁTICO, E ISSO NÃO É UM DEFEITO.
     *
     * Mandar sozinho exige a API oficial da Meta — token, número
     * verificado e template aprovado para mensagem que a EMPRESA inicia.
     * Enquanto isso não existe, o caminho é abrir a conversa com tudo
     * escrito e a pessoa apertar enviar: dois cliques, em vez de dez
     * minutos escrevendo e conferindo o número do pedido.
     *
     * No dia em que o token entrar no ambiente, esta mesma rota passa a
     * enviar sozinha — nada muda na tela.
     */
    let envio = { modo: 'manual', enviado: false };
    if (!fone) {
      envio = { modo: 'sem_telefone', enviado: false, motivo: 'Cliente sem telefone cadastrado' };
    } else if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
      const r = await sendWhatsApp(fone, mensagem);
      envio = r.ok ? { modo: 'automatico', enviado: true, id: r.id }
        : { modo: 'manual', enviado: false, motivo: r.error };
    }

    await gravarMarco(req, venda.id, 'cliente_avisado', {
      modo: retirada ? 'retirada' : 'entrega',
      envio: envio.modo,
      telefone: fone || null,
    });
    audit(req, 'update', 'sale', venda.id, { expedicao: 'cliente_avisado', modo: envio.modo });

    res.json({
      ok: true,
      cliente: venda.CLIENTES?.name || null,
      telefone: fone,
      mensagem,
      wa_link: fone ? `https://wa.me/${fone}?text=${encodeURIComponent(mensagem)}` : null,
      envio,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// SOLICITAR A COLETA
// ════════════════════════════════════════════════════════════
router.post('/:id/coleta', async (req, res) => {
  try {
    const venda = await carregarPedido(req.tenantId, req.params.id);
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });
    if (A.ehRetirada(venda)) {
      return res.status(409).json({
        error: 'Este pedido é para RETIRADA — o cliente vem buscar.',
        dica: 'Use "Avisar o cliente" para dizer que já pode vir.',
      });
    }

    const t = venda.TRANSPORTADORAS;
    if (!t) {
      return res.status(400).json({
        error: 'Este pedido não tem transportadora definida.',
        dica: 'Escolha a transportadora no pedido de venda, em "Transporte e entrega".',
      });
    }

    const volumes = Number(req.body?.volumes) || 1;
    const peso = req.body?.peso ? Number(req.body.peso) : null;
    const empresa = await dadosDaEmpresa(req.tenantId);
    const end = venda.CLIENTES?.address || {};

    const mensagem = [
      `Olá! Aqui é a ${empresa.nome}.`,
      'Temos uma mercadoria *disponível para coleta*.',
      '',
      `Pedido: *${codigoPedido(venda.number)}*`,
      `Destinatário: ${venda.CLIENTES?.name || '—'}`,
      `Destino: ${[end.city, end.state].filter(Boolean).join(' / ') || '—'}`,
      `Volumes: ${volumes}${peso ? ` · Peso: ${peso} kg` : ''}`,
      '',
      `Retirada em: ${empresa.endereco}`,
      'Por gentileza confirmar a data prevista de coleta. Obrigado!',
    ].join('\n');

    const fone = normalizarNumero(t.whatsapp || t.phone);
    let envio = { modo: 'manual', enviado: false };
    if (!fone && !t.email) {
      envio = { modo: 'sem_contato', enviado: false, motivo: 'Transportadora sem WhatsApp nem e-mail' };
    } else if (fone && process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
      const r = await sendWhatsApp(fone, mensagem);
      envio = r.ok ? { modo: 'automatico', enviado: true, id: r.id }
        : { modo: 'manual', enviado: false, motivo: r.error };
    }

    await gravarMarco(req, venda.id, 'coleta_solicitada', {
      transportadora: t.trade_name || t.name, volumes, peso, envio: envio.modo,
    });
    audit(req, 'update', 'sale', venda.id, { expedicao: 'coleta_solicitada', transportadora: t.name });

    const assunto = `Coleta disponível — pedido ${codigoPedido(venda.number)}`;
    res.json({
      ok: true,
      transportadora: t.trade_name || t.name,
      contato: t.contact_name || null,
      telefone: fone,
      email: t.email || null,
      mensagem,
      wa_link: fone ? `https://wa.me/${fone}?text=${encodeURIComponent(mensagem)}` : null,
      mailto: t.email
        ? `mailto:${t.email}?subject=${encodeURIComponent(assunto)}&body=${encodeURIComponent(mensagem)}`
        : null,
      envio,
      /**
       * A ETIQUETA DA TRANSPORTADORA NÃO SAI DAQUI, E É HONESTO DIZER.
       *
       * Cada transportadora emite a própria etiqueta pelo próprio
       * sistema, com a própria numeração — e a nossa integração
       * Braspress hoje só cota frete e rastreia. Prometer aqui uma
       * etiqueta oficial seria imprimir um papel que a coleta recusa.
       *
       * O que sai é a ETIQUETA DE VOLUME da Lyon: remetente,
       * destinatário, pedido e volume. É a que identifica a caixa na
       * prateleira e no caminhão, e é a que faltava.
       */
      etiqueta_transportadora: null,
      observacao: 'A etiqueta oficial da transportadora sai no sistema dela. '
        + 'Aqui você imprime a etiqueta de volume da Lyon, que identifica a caixa.',
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// OS PAPÉIS: DECLARAÇÃO DE CONTEÚDO E ETIQUETA DE VOLUME
// ════════════════════════════════════════════════════════════

/** Os dados do emitente. Vêm do cadastro fiscal, que é onde eles moram. */
async function dadosDaEmpresa(tenantId) {
  let cfg = null;
  try {
    const { data } = await supabase.from('CONFIG_FISCAL').select('*')
      .eq('tenant_id', tenantId).maybeSingle();
    cfg = data;
  } catch { /* sem cadastro fiscal: sai o que der */ }

  const partes = [cfg?.logradouro, cfg?.numero, cfg?.bairro, cfg?.municipio, cfg?.uf, cfg?.cep];
  return {
    nome: cfg?.razao_social || cfg?.nome_fantasia || 'Lyon Copos',
    fantasia: cfg?.nome_fantasia || null,
    cnpj: cfg?.cnpj || null,
    ie: cfg?.inscricao_estadual || null,
    endereco: partes.filter(Boolean).join(', ') || '—',
    municipio: cfg?.municipio || null,
    uf: cfg?.uf || null,
  };
}

const escapar = v => String(v ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const FOLHA = `
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; margin: 0; padding: 24px; font-size: 12px; }
    h1 { font-size: 16px; margin: 0 0 4px; text-transform: uppercase; letter-spacing: .5px; }
    .caixa { border: 1px solid #111; padding: 10px 12px; margin-bottom: 10px; }
    .titulo { font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #555; margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin-top: 4px; }
    th, td { border: 1px solid #999; padding: 5px 7px; text-align: left; font-size: 11px; }
    th { background: #f0f0f0; text-transform: uppercase; font-size: 10px; letter-spacing: .4px; }
    .dir { text-align: right; }
    .assinatura { margin-top: 34px; display: flex; gap: 28px; }
    .assinatura div { flex: 1; border-top: 1px solid #111; padding-top: 4px; font-size: 10px; text-align: center; }
    @media print { body { padding: 8mm; } .naoimprime { display: none; } }
  </style>
`;

/**
 * A DECLARAÇÃO DE CONTEÚDO.
 *
 * É o papel que acompanha a carga quando não vai nota fiscal junto —
 * transportadora não coleta sem ele, e ele não existia em lugar nenhum
 * do sistema. Era escrito no Word, à mão, com o número do pedido
 * copiado na unha (e às vezes copiado errado).
 *
 * Sai em HTML de propósito, e não em PDF: o navegador imprime e salva
 * como PDF sozinho, e uma biblioteca de PDF a mais no servidor seria
 * uma dependência para gerar duas páginas por dia.
 */
router.get('/:id/declaracao', async (req, res) => {
  try {
    const venda = await carregarPedido(req.tenantId, req.params.id);
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    const empresa = await dadosDaEmpresa(req.tenantId);
    const cli = venda.CLIENTES || {};
    const end = cli.address || {};
    const itens = venda.VENDA_ITENS || [];
    const totalQtd = itens.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

    const linhas = itens.map((i, n) => `
      <tr>
        <td>${n + 1}</td>
        <td>${escapar(i.product_name || i.PRODUTOS?.name || 'Produto')}</td>
        <td class="dir">${Number(i.quantity) || 0}</td>
        <td>${escapar(i.PRODUTOS?.unit || 'un')}</td>
        <td class="dir">${brl(i.unit_price)}</td>
        <td class="dir">${brl(i.total)}</td>
      </tr>`).join('');

    const html = `${FOLHA}
      <h1>Declaração de Conteúdo</h1>
      <p style="margin:0 0 12px;font-size:11px;color:#555">
        Pedido ${escapar(codigoPedido(venda.number))} · emitida em ${new Date().toLocaleDateString('pt-BR')}
      </p>

      <div class="caixa">
        <div class="titulo">Remetente</div>
        <b>${escapar(empresa.nome)}</b>${empresa.cnpj ? ` — CNPJ ${escapar(empresa.cnpj)}` : ''}<br>
        ${escapar(empresa.endereco)}
      </div>

      <div class="caixa">
        <div class="titulo">Destinatário</div>
        <b>${escapar(cli.name || 'Consumidor Final')}</b>${cli.cpf_cnpj ? ` — ${escapar(cli.cpf_cnpj)}` : ''}<br>
        ${escapar([end.street, end.number, end.district, end.city, end.state, end.zip].filter(Boolean).join(', ') || '—')}
        ${cli.mobile || cli.phone ? `<br>Telefone: ${escapar(cli.mobile || cli.phone)}` : ''}
      </div>

      <table>
        <thead>
          <tr><th>#</th><th>Discriminação do conteúdo</th><th class="dir">Qtd.</th><th>Un.</th>
              <th class="dir">Valor un.</th><th class="dir">Valor total</th></tr>
        </thead>
        <tbody>${linhas || '<tr><td colspan="6">Sem itens</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <th colspan="2">Total</th>
            <th class="dir">${totalQtd}</th><th></th><th></th>
            <th class="dir">${brl(venda.total)}</th>
          </tr>
        </tfoot>
      </table>

      <p style="margin-top:14px;font-size:11px;line-height:1.5">
        Declaro, para os devidos fins, que o conteúdo do(s) volume(s) acima corresponde
        integralmente ao discriminado nesta declaração, e que <b>não se trata de mercadoria
        sujeita a obrigatoriedade de emissão de nota fiscal</b> na presente operação, nos
        termos da legislação vigente. Assumo a responsabilidade pela veracidade das
        informações aqui prestadas.
      </p>

      <div class="assinatura">
        <div>${escapar(empresa.nome)}<br>Remetente</div>
        <div>Data: ____/____/________</div>
      </div>`;

    await gravarMarco(req, venda.id, 'declaracao_emitida', {});
    res.json({ html, titulo: `Declaracao-${codigoPedido(venda.number)}` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A ETIQUETA DE VOLUME.
 *
 * A que vai colada na caixa. Não substitui a etiqueta da transportadora
 * (essa sai no sistema dela) — esta é a que diz de quem é a caixa
 * enquanto ela está aqui, e para onde vai quando sair. Sem ela, a
 * embalagem confere "o pedido está correto com a etiqueta" olhando uma
 * etiqueta escrita à caneta.
 *
 * Uma folha por volume, com "1 de 3", "2 de 3" — porque é assim que se
 * descobre que faltou uma caixa no caminhão.
 */
router.get('/:id/etiqueta', async (req, res) => {
  try {
    const venda = await carregarPedido(req.tenantId, req.params.id);
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    const volumes = Math.max(1, Math.min(50, Number(req.query.volumes) || 1));
    const empresa = await dadosDaEmpresa(req.tenantId);
    const cli = venda.CLIENTES || {};
    const end = cli.address || {};
    const retirada = A.ehRetirada(venda);
    const transp = venda.TRANSPORTADORAS?.trade_name || venda.TRANSPORTADORAS?.name;

    const etiquetas = Array.from({ length: volumes }, (_, i) => `
      <div class="etiqueta">
        <div class="topo">
          <span class="marca">${escapar(empresa.fantasia || empresa.nome)}</span>
          <span class="volume">VOLUME ${i + 1} DE ${volumes}</span>
        </div>
        <div class="pedido">${escapar(codigoPedido(venda.number))}</div>
        <div class="bloco">
          <div class="rot">Destinatário</div>
          <b>${escapar(cli.name || 'Consumidor Final')}</b><br>
          ${escapar([end.street, end.number, end.district].filter(Boolean).join(', ') || '—')}<br>
          ${escapar([end.city, end.state].filter(Boolean).join(' / ') || '—')}
          ${end.zip ? ` · CEP ${escapar(end.zip)}` : ''}
          ${cli.mobile || cli.phone ? `<br>Tel. ${escapar(cli.mobile || cli.phone)}` : ''}
        </div>
        <div class="bloco">
          <div class="rot">Remetente</div>
          ${escapar(empresa.nome)}<br>${escapar(empresa.endereco)}
        </div>
        <div class="rodape">
          ${retirada ? 'RETIRADA NA FÁBRICA' : `ENVIO${transp ? ` · ${escapar(transp)}` : ''}`}
          <span class="fragil">FRÁGIL — NÃO EMPILHAR</span>
        </div>
      </div>`).join('');

    const html = `
      <style>
        * { box-sizing: border-box; }
        body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 10px; color: #111; }
        .etiqueta { border: 2px solid #111; padding: 12px; margin-bottom: 10px; page-break-inside: avoid; }
        .topo { display: flex; justify-content: space-between; align-items: baseline;
                border-bottom: 1px solid #111; padding-bottom: 5px; }
        .marca { font-weight: bold; font-size: 15px; letter-spacing: .5px; }
        .volume { font-size: 12px; font-weight: bold; }
        .pedido { font-size: 30px; font-weight: bold; letter-spacing: 2px; margin: 8px 0; font-family: monospace; }
        .bloco { margin-top: 7px; font-size: 12px; line-height: 1.42; }
        .rot { font-size: 9px; text-transform: uppercase; letter-spacing: .7px; color: #555; }
        .rodape { margin-top: 9px; border-top: 1px solid #111; padding-top: 5px;
                  display: flex; justify-content: space-between; font-size: 11px; font-weight: bold; }
        .fragil { color: #b91c1c; }
        @media print { body { padding: 4mm; } .etiqueta { page-break-after: always; } }
      </style>
      ${etiquetas}`;

    res.json({ html, titulo: `Etiquetas-${codigoPedido(venda.number)}`, volumes });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ════════════════════════════════════════════════════════════
// O HISTÓRICO DE LOGÍSTICA DO PEDIDO
// ════════════════════════════════════════════════════════════
router.get('/:id/historico', async (req, res) => {
  try {
    const { data: v } = await supabase.from('VENDAS')
      .select('number, status, production_log, delivery_mode, notes')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!v) return res.status(404).json({ error: 'Pedido não encontrado' });

    const ROTULO = {
      cliente_avisado: 'Cliente avisado',
      coleta_solicitada: 'Coleta solicitada à transportadora',
      declaracao_emitida: 'Declaração de conteúdo emitida',
    };

    const eventos = (v.production_log || [])
      .filter(e => e.stage === 'expedicao' || A.infoStatus(e.action).area === 'logistica')
      .map(e => ({
        at: e.at,
        titulo: ROTULO[e.action] || A.infoStatus(e.action).label || e.action,
        detalhe: e.transportadora
          ? `${e.transportadora}${e.volumes ? ` · ${e.volumes} volume(s)` : ''}`
          : e.modo ? (e.modo === 'retirada' ? 'Pedido para retirada' : 'Pedido para entrega')
          : null,
        quem: e.user || null,
        envio: e.envio || null,
      }))
      .sort((a, b) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0));

    res.json({ codigo: codigoPedido(v.number), status_label: A.infoStatus(v.status).label, eventos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
