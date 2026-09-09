const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { createPix } = require('../lib/pix');
// Config de recebimento PIX: chave estática (ex.: Nubank) em EMPRESAS.settings.pix,
// com fallback nas env PIX_*. Se houver chave, usa PIX estático (dinheiro direto
// na conta, sem retenção); senão cai no Mercado Pago (createPix).
const { gerarCobrancaPix } = require('../lib/pixCobranca');
// A conferência e a confirmação do comprovante moram numa lib só — a
// mesma que a tela do pedido usa. Duas cópias da regra de "quanto foi
// pago" seriam dois saldos diferentes para o mesmo cliente.
const C = require('../lib/comprovante');
const { sendWhatsApp, normalizarNumero } = require('../lib/whatsapp');
// Confirmar a conta MOVE O PEDIDO: a etapa de Pagamento deixou de ser um
// botão na tela do pedido e passou a ser consequência daqui.
const Auto = require('../lib/pedidoAutomacao');
const { carregarParaFluxo, gravarPasso } = require('../lib/fluxoCarga');

/**
 * PAGO É O QUE O FINANCEIRO CONFIRMOU — e nada mais.
 *
 * A coluna `status` podia dizer 'paid' sem ninguém do financeiro ter
 * olhado: era assim que ficavam as linhas do tempo em que anexar o
 * comprovante já dava o pagamento por feito. Um selo verde de "Pago"
 * nessas linhas é o sistema afirmando uma coisa que ninguém afirmou.
 *
 * `situacao` é o que a tela mostra: sem `paid_at`, volta a ser
 * PENDENTE, por mais que exista dinheiro lançado. O valor continua em
 * `paid_amount` (não se apaga dado), e o financeiro resolve confirmando
 * ou desfazendo.
 */
function comSituacao(linha) {
  const pago = Number(linha?.paid_amount) || 0;
  const confirmado = !!linha?.paid_at;
  return {
    ...linha,
    confirmado,
    // Dinheiro sem confirmação não é pagamento: é uma afirmação
    // esperando o financeiro.
    situacao: confirmado ? linha.status : (pago > 0 ? 'pending' : linha.status),
    pago_sem_confirmacao: !confirmado && pago > 0 ? pago : 0,
  };
}

router.get('/receivables', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('LANCAMENTOS')
      .select('*, CLIENTES(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('type', 'receivable')
      .order('due_date');

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('due_date', start_date);
    if (end_date) query = query.lte('due_date', end_date);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: (data || []).map(comSituacao), total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/payables', async (req, res) => {
  const { page = 1, limit = 50, status, start_date, end_date } = req.query;
  const offset = (page - 1) * limit;

  try {
    let query = supabase
      .from('LANCAMENTOS')
      .select('*, FORNECEDORES(name)', { count: 'exact' })
      .eq('tenant_id', req.tenantId)
      .eq('type', 'payable')
      .order('due_date');

    if (status) query = query.eq('status', status);
    if (start_date) query = query.gte('due_date', start_date);
    if (end_date) query = query.lte('due_date', end_date);
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;
    res.json({ data: (data || []).map(comSituacao), total: count, page: Number(page), limit: Number(limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/pay/:id', async (req, res) => {
  const { paid_amount, payment_method, account_id } = req.body;

  try {
    const { data: transaction } = await supabase
      .from('LANCAMENTOS')
      .select('*')
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .single();

    if (!transaction) return res.status(404).json({ error: 'Lançamento não encontrado' });

    const newPaid = (transaction.paid_amount || 0) + paid_amount;
    const status = newPaid >= transaction.amount ? 'paid' : 'partial';

    const { data, error } = await supabase
      .from('LANCAMENTOS')
      .update({
        paid_amount: newPaid,
        paid_date: new Date().toISOString().split('T')[0],
        status,
        payment_method,
        account_id,
        // Quem apertou o botão. Sem isto o pagamento feito AQUI cairia
        // na regra de "dinheiro sem confirmação" e voltaria a aparecer
        // como pendente — sendo que foi o financeiro que o lançou.
        paid_by: req.userProfile?.name || req.user?.email || 'Financeiro',
        paid_at: new Date().toISOString(),
      })
      .eq('id', req.params.id)
      .eq('tenant_id', req.tenantId)
      .select()
      .single();

    if (error) throw error;
    audit(req, 'payment', 'financial', req.params.id, {
      description: transaction.description, paid_amount, status, payment_method,
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * QUANTAS CONTAS DESTE MÊS AINDA ESPERAM O FINANCEIRO.
 *
 * É o número que segura o clique de passar o mês. Passar de mês com
 * comprovante por conferir é como o dinheiro de setembro aparece em
 * outubro: ninguém volta para trás para procurar o que ficou.
 *
 * Duas filas diferentes, e as duas contam:
 *   a conferir   comprovante anexado que ninguém abriu ainda
 *   a confirmar  comprovante conferido, dinheiro ainda não lançado
 */
router.get('/pendencias', async (req, res) => {
  const { start_date, end_date } = req.query;
  try {
    let q = supabase.from('LANCAMENTOS')
      .select('id, description, due_date, amount, receipt_status, paid_at, CLIENTES(name)')
      .eq('tenant_id', req.tenantId).eq('type', 'receivable')
      .not('receipt_url', 'is', null)
      .order('due_date');
    if (start_date) q = q.gte('due_date', start_date);
    if (end_date) q = q.lte('due_date', end_date);

    const { data, error } = await q;
    if (error) throw error;

    const linhas = data || [];
    const aConferir = linhas.filter(l => !['conferido', 'recusado'].includes(l.receipt_status));
    const aConfirmar = linhas.filter(l => l.receipt_status === 'conferido' && !l.paid_at);

    res.json({
      a_conferir: aConferir.length,
      a_confirmar: aConfirmar.length,
      total: aConferir.length + aConfirmar.length,
      itens: [...aConferir, ...aConfirmar].slice(0, 50).map(l => ({
        id: l.id, descricao: l.description, vencimento: l.due_date,
        valor: Number(l.amount) || 0, cliente: l.CLIENTES?.name || null,
        situacao: l.receipt_status === 'conferido' ? 'a_confirmar' : 'a_conferir',
      })),
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** O link temporário para ver o comprovante (o arquivo é privado). */
router.get('/receipts/:id/arquivo', async (req, res) => {
  try {
    const { data } = await supabase.from('LANCAMENTOS').select('receipt_url')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!data?.receipt_url) return res.status(404).json({ error: 'Esta conta não tem comprovante.' });
    const url = await C.linkDoComprovante(data.receipt_url);
    if (!url) return res.status(502).json({ error: 'Não foi possível abrir o comprovante agora.' });
    res.json({ url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** A conferência: o financeiro olhou o papel e disse o que é. */
router.post('/receipts/:id/conferir', async (req, res) => {
  try {
    const r = await C.conferir(req.tenantId, req.params.id, {
      status: req.body?.status, nota: req.body?.nota, req,
    });
    if (r.erro) return res.status(400).json({ error: r.erro });
    audit(req, 'update', 'comprovante', req.params.id, { conferencia: req.body?.status });
    res.json(r);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** A confirmação: o dinheiro entrou, e fica registrado quem disse isso. */
router.post('/receipts/:id/confirmar', async (req, res) => {
  try {
    const r = await C.confirmarPagamento(req.tenantId, req.params.id, {
      valor: req.body?.valor,
      sem_comprovante: !!req.body?.sem_comprovante,
      req,
    });
    if (r.erro) return res.status(400).json({ error: r.erro, code: r.code, dica: r.dica });

    /**
     * E O PEDIDO ANDA.
     *
     * A etapa de Pagamento não tem mais botão na tela do pedido: ela é
     * consequência desta confirmação. Sem isto, o financeiro confirmava
     * a conta e o pedido continuava parado esperando um clique que não
     * existe mais em lugar nenhum.
     *
     * Falhar aqui não desfaz o pagamento — ele já está gravado, e o
     * pior caso é o pedido ficar onde estava até a próxima confirmação.
     */
    let avancou = null;
    const vendaId = r.parcela?.reference_id;
    if (vendaId) {
      try {
        const carga = await carregarParaFluxo(req.tenantId, vendaId);
        const passo = carga && await Auto.avancarAposPagamento(req.tenantId, carga.venda, carga.aplicaveis, req);
        if (passo) {
          await gravarPasso(req.tenantId, vendaId, passo);
          avancou = passo.status;
        }
      } catch (e) {
        console.error('[financial/confirmar] avanco do pedido:', e?.message || e);
      }
    }

    audit(req, 'payment', 'financial', req.params.id, {
      confirmou: r.confirmado_por, aplicados: r.aplicados, sobra: r.sobra,
      pedido_avancou: avancou,
    });
    res.json({ ...r, pedido_status: avancou });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * DESFAZER UM PAGAMENTO.
 *
 * Existe por dois motivos, e os dois são reais:
 *
 *   o engano de hoje    confirmou a linha errada, ou o valor errado. Sem
 *                       desfazer, a saída seria um lançamento novo para
 *                       compensar — e o extrato passa a ter duas linhas
 *                       para um dinheiro que nunca entrou.
 *
 *   o passado           as parcelas que ficaram "pagas" quando ANEXAR
 *                       ainda pagava. Elas estão quitadas sem ninguém do
 *                       financeiro ter olhado, e sem isto não há como
 *                       trazê-las de volta para a fila: já estão pagas,
 *                       então nenhum botão aparece para elas.
 *
 * Devolve a parcela para "a conferir" com o comprovante intacto. Fica na
 * auditoria com quem desfez e por quê — desfazer pagamento é o tipo de
 * ato que alguém vai querer explicar depois.
 */
router.post('/receipts/:id/desfazer', async (req, res) => {
  const motivo = String(req.body?.motivo || '').trim().slice(0, 300);
  try {
    const { data: conta } = await supabase.from('LANCAMENTOS')
      .select('id, description, amount, paid_amount, status, paid_by, receipt_url')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada' });
    if (!(Number(conta.paid_amount) > 0)) {
      return res.status(400).json({ error: 'Esta conta não tem pagamento para desfazer.' });
    }

    const quem = req.userProfile?.name || req.user?.email || 'Financeiro';
    const { data, error } = await supabase.from('LANCAMENTOS').update({
      paid_amount: 0,
      status: 'pending',
      paid_date: null,
      paid_by: null,
      paid_at: null,
      // O comprovante continua lá, e volta para a fila de conferência:
      // desfazer o dinheiro não apaga o papel que alguém anexou.
      receipt_status: conta.receipt_url ? 'pendente' : null,
      notes: [`Pagamento de ${(Number(conta.paid_amount) || 0).toFixed(2)} desfeito por ${quem}`,
        motivo ? `— ${motivo}` : ''].join(' ').trim().slice(0, 500),
    }).eq('id', conta.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;

    audit(req, 'update', 'financial', conta.id, {
      desfez_pagamento: Number(conta.paid_amount) || 0,
      era_de: conta.paid_by || '(fluxo antigo)', motivo: motivo || null,
    });
    res.json({ ok: true, conta: data, desfeito: Number(conta.paid_amount) || 0 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/**
 * A COBRANÇA PELO WHATSAPP.
 *
 * Gera o Pix da conta (copia-e-cola + QR) e monta a mensagem pronta.
 *
 * SOBRE "CHAVE ALEATÓRIA": o sistema não cria chave Pix — quem cria é o
 * banco, uma vez, e ela fica cadastrada. O que muda a cada cobrança é o
 * TXID, que é o que identifica este pagamento no extrato. A chave usada
 * é a da empresa (Configurações → Pix); se a Lyon quiser receber pela
 * chave aleatória do Nubank, é lá que ela entra, e todas as cobranças
 * passam a sair por ela.
 *
 * O ENVIO: com WHATSAPP_TOKEN configurado, o servidor manda sozinho.
 * Sem ele, devolve a mensagem e o link `wa.me` para a tela abrir a
 * conversa já escrita — que é o que o vendedor faz hoje à mão, com a
 * diferença de que o Pix vai junto e certo.
 */
router.post('/:id/cobranca-whatsapp', async (req, res) => {
  try {
    const { data: conta } = await supabase.from('LANCAMENTOS')
      .select('*, CLIENTES(name, phone, mobile)')
      .eq('tenant_id', req.tenantId).eq('id', req.params.id).maybeSingle();
    if (!conta) return res.status(404).json({ error: 'Conta não encontrada' });

    const falta = Math.round(((Number(conta.amount) || 0) - (Number(conta.paid_amount) || 0)) * 100) / 100;
    const valor = Number(req.body?.valor) > 0 ? Number(req.body.valor) : falta;
    if (!(valor > 0)) return res.status(400).json({ error: 'Esta conta já está quitada.' });

    const cobranca = await gerarCobrancaPix({
      tenantId: req.tenantId,
      amount: valor,
      txid: `COB${String(conta.document_number || conta.id).replace(/\W/g, '').slice(-20)}`,
    });
    if (!cobranca) {
      return res.status(400).json({
        error: 'Sem chave Pix configurada.',
        dica: 'Cadastre a chave em Configurações → Pix para gerar a cobrança.',
      });
    }

    // O texto é o combinado com a Lyon, palavra por palavra. Ele não é
    // montado na tela porque a mesma cobrança sai daqui pelo envio
    // automático — e duas redações da mesma mensagem viram duas Lyons.
    const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    /**
     * O CÓDIGO FICA SEPARADO DO RECADO.
     *
     * Ele saía colado no fim do texto, e no WhatsApp isso é um parágrafo
     * de 130 caracteres sem espaço que o cliente tenta selecionar com o
     * dedo — pegando meia frase junto e colando um Pix inválido no app
     * do banco.
     *
     * Agora vai embaixo de um rótulo, com uma linha em branco antes: o
     * bloco fica isolado, dá para tocar e segurar em cima dele, e quem
     * lê sabe o que é aquela parede de números.
     */
    const codigo = cobranca.copy_paste || cobranca.copia_e_cola || '';
    const mensagem = [
      'Olá! Financeiro da Lyon copos aqui, segue o Pix copia e cola para pagamento da sua fatura conosco!',
      `No valor de *${brl(valor)}*, por gentileza envie o comprovante quando possível.`,
      '',
      'CHAVE PIX (copia e cola):',
      codigo,
    ].filter(Boolean).join('\n');

    const fone = normalizarNumero(conta.CLIENTES?.mobile || conta.CLIENTES?.phone);

    // O Pix fica guardado na conta: quem abrir a linha amanhã vê a mesma
    // cobrança, em vez de gerar outra com txid diferente.
    await supabase.from('LANCAMENTOS').update({
      pix_copy_paste: cobranca.copy_paste || cobranca.copia_e_cola || null,
      pix_qr: cobranca.qr_base64 || null,
    }).eq('id', conta.id).eq('tenant_id', req.tenantId);

    /**
     * O ENVIO É MEIO AUTOMÁTICO, E ISSO NÃO É UM DEFEITO.
     *
     * Mandar sozinho exige a API oficial da Meta (token + número
     * verificado + template aprovado para mensagem que a empresa
     * INICIA). Enquanto isso não existe, o caminho é abrir a conversa
     * com tudo escrito e a pessoa apertar enviar — dois cliques em vez
     * de dez minutos montando a mensagem e conferindo o Pix.
     *
     * `modo` diz qual dos dois aconteceu, para a tela falar a verdade
     * em vez de mostrar um aviso de erro no caminho normal.
     */
    let envio = { modo: 'manual', enviado: false };
    if (!fone) {
      envio = { modo: 'sem_telefone', enviado: false, motivo: 'Cliente sem telefone cadastrado' };
    } else if (process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID) {
      const r = await sendWhatsApp(fone, mensagem);
      envio = r.ok
        ? { modo: 'automatico', enviado: true, id: r.id }
        : { modo: 'manual', enviado: false, motivo: r.error };
    }

    audit(req, 'update', 'financial', conta.id, { cobranca_whatsapp: valor, enviado: envio.enviado });

    res.json({
      ok: true,
      valor,
      cliente: conta.CLIENTES?.name || null,
      telefone: fone,
      mensagem,
      copia_e_cola: cobranca.copy_paste || cobranca.copia_e_cola || null,
      qr_base64: cobranca.qr_base64 || null,
      // Para a tela abrir a conversa já escrita quando o envio automático
      // não estiver ligado.
      wa_link: fone ? `https://wa.me/${fone}?text=${encodeURIComponent(mensagem)}` : null,
      envio,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Criar lançamento avulso
router.post('/', async (req, res) => {
  const { description, type, amount, due_date, customer_id, supplier_id, chart_account_id, cost_center_id, document_number } = req.body;
  if (!description || !amount || !due_date) return res.status(400).json({ error: 'Descrição, valor e vencimento são obrigatórios' });
  try {
    const { data, error } = await supabase.from('LANCAMENTOS').insert({
      tenant_id: req.tenantId, user_id: req.userId, description, type, amount,
      paid_amount: 0, due_date, status: 'pending',
      customer_id: customer_id || null, supplier_id: supplier_id || null,
      chart_account_id: chart_account_id || null, cost_center_id: cost_center_id || null,
      document_number: document_number || null, installment: 1, total_installments: 1,
    }).select().single();
    if (error) throw error;
    audit(req, 'create', 'financial', data.id, { description, type, amount, due_date });
    res.status(201).json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/cashflow', async (req, res) => {
  const { start_date, end_date } = req.query;

  try {
    const { data, error } = await supabase
      .from('LANCAMENTOS')
      .select('type, amount, paid_amount, due_date, status')
      .eq('tenant_id', req.tenantId)
      .gte('due_date', start_date || new Date().toISOString().split('T')[0])
      .lte('due_date', end_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0])
      .order('due_date');

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Fluxo de caixa PROJETADO: saldo inicial (bancos) + entradas/saídas
// previstas (lançamentos em aberto) agrupados por mês, com saldo acumulado.
router.get('/cashflow-projection', async (req, res) => {
  const months = Math.min(Math.max(parseInt(req.query.months) || 6, 1), 24);
  try {
    // Saldo inicial = soma dos saldos das contas bancárias
    const { data: banks } = await supabase
      .from('CONTAS_BANCARIAS').select('balance')
      .eq('tenant_id', req.tenantId).eq('is_active', true);
    const saldoInicial = (banks || []).reduce((s, b) => s + (Number(b.balance) || 0), 0);

    // Lançamentos em aberto (pendentes/parciais/vencidos)
    const today = new Date();
    const horizon = new Date(today.getFullYear(), today.getMonth() + months + 1, 0);
    const { data: lancs, error } = await supabase
      .from('LANCAMENTOS')
      .select('type, amount, paid_amount, due_date, status')
      .eq('tenant_id', req.tenantId)
      .in('status', ['pending', 'partial', 'overdue'])
      .lte('due_date', horizon.toISOString().split('T')[0]);
    if (error) throw error;

    const todayStr = today.toISOString().split('T')[0];
    const monthKey = d => d.slice(0, 7); // 'YYYY-MM'

    // Estrutura de meses
    const periods = {};
    for (let i = 0; i < months; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
      periods[monthKey(d.toISOString())] = { entradas: 0, saidas: 0 };
    }

    const vencidos = { entradas: 0, saidas: 0 };

    for (const l of (lancs || [])) {
      const restante = Math.max(0, (Number(l.amount) || 0) - (Number(l.paid_amount) || 0));
      if (restante <= 0) continue;
      const isEntrada = l.type === 'receivable';
      const bucket = l.due_date < todayStr ? vencidos : periods[monthKey(l.due_date)];
      if (!bucket) continue; // fora do horizonte
      if (isEntrada) bucket.entradas += restante;
      else           bucket.saidas += restante;
    }

    // Monta a série com saldo acumulado
    let saldo = saldoInicial;
    const rows = [];

    // Vencidos entram como ajuste inicial (já deveriam ter sido pagos/recebidos)
    saldo += vencidos.entradas - vencidos.saidas;

    const meses = Object.keys(periods).sort();
    for (const m of meses) {
      const p = periods[m];
      const liquido = p.entradas - p.saidas;
      saldo += liquido;
      rows.push({ month: m, entradas: p.entradas, saidas: p.saidas, liquido, saldo });
    }

    res.json({
      saldo_inicial: saldoInicial,
      vencidos,
      periods: rows,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Gerar cobrança PIX para uma conta a receber ───────────
router.post('/:id/pix', async (req, res) => {
  try {
    const { data: lanc } = await supabase
      .from('LANCAMENTOS').select('*, CLIENTES(name, email)')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!lanc) return res.status(404).json({ error: 'Lançamento não encontrado' });
    if (lanc.type !== 'receivable') return res.status(400).json({ error: 'PIX disponível apenas para contas a receber' });
    const remaining = Number(lanc.amount) - Number(lanc.paid_amount || 0);
    if (remaining <= 0) return res.status(400).json({ error: 'Lançamento já está quitado' });

    // 1) PIX estático (chave própria — ex.: Nubank), se configurado
    const cobranca = await gerarCobrancaPix({ tenantId: req.tenantId, amount: remaining, txid: lanc.id });
    if (cobranca) {
      await supabase.from('LANCAMENTOS').update({
        gateway_payment_id: null, pix_qr: cobranca.qr_base64, pix_copy_paste: cobranca.copy_paste,
      }).eq('id', lanc.id);
      audit(req, 'pix', 'financial', lanc.id, { amount: remaining, provider: 'static' });
      return res.json({ qr_code_base64: cobranca.qr_base64, copy_paste: cobranca.copy_paste });
    }

    // 2) Fallback: Mercado Pago (createPix)
    const pix = await createPix({
      amount: remaining,
      description: lanc.description || 'Cobrança',
      payerEmail: lanc.CLIENTES?.email,
      payerName: lanc.CLIENTES?.name,
      externalRef: lanc.id,
    });
    if (!pix.ok) return res.status(400).json({ error: pix.error });

    await supabase.from('LANCAMENTOS').update({
      gateway_payment_id: pix.id, pix_qr: pix.qr_code_base64 || null, pix_copy_paste: pix.qr_code || null,
    }).eq('id', lanc.id);

    audit(req, 'pix', 'financial', lanc.id, { amount: remaining });
    res.json({ qr_code_base64: pix.qr_code_base64, copy_paste: pix.qr_code, ticket_url: pix.ticket_url });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
