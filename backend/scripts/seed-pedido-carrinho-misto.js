#!/usr/bin/env node
/**
 * UM PEDIDO SÓ, CINCO ITENS DENTRO — o carrinho misto.
 *
 *   node backend/scripts/seed-pedido-carrinho-misto.js            cria
 *   node backend/scripts/seed-pedido-carrinho-misto.js --limpar   apaga
 *
 * PARA QUE SERVE, e por que é diferente do seed-pedidos-100-copos.js.
 * Aquele cria cinco pedidos de um item cada: serve para ver a LISTA de
 * vendas com pedidos em etapas diferentes. Este cria UM pedido com
 * cinco linhas — o mesmo cliente enchendo o carrinho de uma vez — e
 * serve para ver o que só aparece DENTRO de um pedido:
 *
 *   · três artes diferentes no mesmo pedido, uma por item, que foi
 *     exatamente o defeito que a rota de arte por item consertou (a
 *     segunda arte anexada apagava a primeira);
 *   · itens personalizados e lisos convivendo, com a regra de que UM
 *     item personalizado basta para o pedido inteiro passar pela
 *     serigrafia (lib/itensPedido.js → etapasDosItens);
 *   · o documento do pedido e a tela de produção com cinco linhas de
 *     produtos de famílias diferentes, e não cinco cópias da mesma.
 *
 * O CARRINHO — 500 peças, 100 de cada:
 *
 *   100  LONG DRINK PRETO          COM ARTE   impressão BRANCA
 *   100  CANECA SLIM AZUL BIC      COM ARTE   impressão BRANCA
 *   100  CANECA TRADICIONAL BRANCO COM ARTE   impressão DOURADA
 *   100  LONG DRINK TRANSPARENTE   LISO       sem impressão
 *   100  TWISTER AZUL BIC 550 ML   LISO       sem impressão
 *
 * O PREÇO É O PRATICADO, não o do cadastro: a maior parte dos produtos
 * está com `sale_price` zerado, e um pedido de teste que soma R$ 0,00
 * não testa o financeiro, nem o teto de faturamento, nem a comissão.
 * Os valores abaixo são plausíveis (liso mais barato, personalizado com
 * a impressão embutida) e ficam gravados no item, como o PDV grava.
 *
 * INSERÇÃO DIRETA, e não pela `criar_venda`: aquela dá baixa no estoque
 * e grava movimentação, e ensaio não mexe no saldo de verdade.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../src/config/supabase');
const T = require('./_teste-pedidos');

const ASSINATURA = 'seed-pedido-carrinho-misto.js';

// O pedido nasceu há três dias e está parado esperando a aprovação das
// artes — que é onde um carrinho assim realmente para na vida real.
const STATUS = 'aguardando_arte';
const DIAS = 3;
const FRETE = 145;

const CARRINHO = [
  {
    codigo: 'LDT - 02', qtd: 100, preco: 3.50,
    cor: 'PRETO', arte: true, tinta: 'BRANCA',
  },
  {
    codigo: 'CS4 - 3119', qtd: 100, preco: 6.90,
    cor: 'AZUL BIC', arte: true, tinta: 'BRANCA',
  },
  {
    codigo: 'CT45 - 2380', qtd: 100, preco: 7.40,
    cor: 'BRANCO', arte: true, tinta: 'DOURADA',
  },
  {
    codigo: 'LDT - 24', qtd: 100, preco: 2.00,
    cor: 'TRANSPARENTE', arte: false, tinta: null,
  },
  {
    codigo: 'TT5 - 1561', qtd: 100, preco: 4.20,
    cor: 'AZUL BIC', arte: false, tinta: null,
  },
];

const NOTA = `${T.MARCA} PEDIDO TESTE COM VÁRIOS — 5 itens no mesmo carrinho `
  + '(3 personalizados com arte + 2 lisos), 100 peças cada, 500 no total. '
  + `NAO PRODUZIR, NAO FATURAR, NAO ENVIAR. Gerado por ${ASSINATURA}.`;

async function main() {
  const { tenantId, usuario } = await T.empresaEUsuario();

  if (process.argv.includes('--limpar')) return T.limparPor(tenantId, ASSINATURA);

  // Rodar duas vezes criaria dois carrinhos iguais. Melhor recusar e
  // dizer como refazer do que encher a lista de vendas com repetição.
  const jaTem = await T.pedidosDe(tenantId, ASSINATURA);
  if (jaTem.length) {
    console.error(
      `Já existe pedido deste script (${jaTem.map(v => T.pv(v.number)).join(', ')}).\n`
      + `Rode com --limpar antes de criar de novo.`);
    process.exit(1);
  }

  const { data: produtos } = await supabase.from('PRODUTOS')
    .select('id, code, name, sale_price').eq('tenant_id', tenantId)
    .in('code', CARRINHO.map(i => i.codigo));
  const porCodigo = Object.fromEntries((produtos || []).map(p => [p.code, p]));
  const faltando = CARRINHO.map(i => i.codigo).filter(c => !porCodigo[c]);
  if (faltando.length) { console.error('Produtos não encontrados:', faltando.join(', ')); process.exit(1); }

  const { data: transp } = await supabase.from('TRANSPORTADORAS')
    .select('id, name').eq('tenant_id', tenantId).limit(1).maybeSingle();

  const { cliente, criado } = await T.garantirCliente(tenantId, ASSINATURA);
  console.log(`Cliente ${criado ? 'criado' : 'reaproveitado'}: #${cliente.display_id} ${cliente.name}\n`);

  const numero = (await T.ultimoNumero(tenantId)) + 1;
  const codigoPedido = T.pv(numero);

  // O pedido é personalizado porque TEM item personalizado — um basta.
  const personalizado = CARRINHO.some(i => i.arte);
  const log = T.historico(T.trilha(STATUS, personalizado), DIAS, usuario);
  const nascimento = log[0].at;

  const subtotal = CARRINHO.reduce((s, i) => s + i.qtd * i.preco, 0);

  // ── As artes: uma por item personalizado ──────────────────
  // O nome do arquivo diz de qual linha do carrinho ele é. Num pedido
  // de cinco itens, "arte.png" três vezes é o caminho para a produção
  // gravar cem canecas com o desenho do copo.
  const artes = {};
  for (const [i, item] of CARRINHO.entries()) {
    if (!item.arte) continue;
    const prod = porCodigo[item.codigo];
    artes[item.codigo] = await T.subirArte(
      `${codigoPedido} · item ${i + 1} de ${CARRINHO.length}`,
      `${item.qtd} x ${prod.name} - impressao ${item.tinta}`,
    );
  }

  // Cada anexo de arte deixa marca no histórico, como a rota de upload
  // deixa — sem isso a linha do tempo mostraria três artes surgindo do
  // nada, e "quem anexou e quando" é metade do valor do histórico.
  for (const [i, item] of CARRINHO.entries()) {
    if (!item.arte) continue;
    log.push({
      stage: 'documentos', action: 'arte_anexada',
      at: new Date(new Date(nascimento).getTime() + (i + 1) * 25 * 60e3).toISOString(),
      user_id: usuario.id, user: usuario.name,
      item: porCodigo[item.codigo].name,
    });
  }
  log.sort((a, b) => new Date(a.at) - new Date(b.at));

  // A PRIMEIRA arte assume o posto em VENDAS.artwork_url — é o que a
  // etapa de Arte do motor de fluxo pergunta. As outras duas vivem nos
  // itens, e não roubam o lugar dela.
  const primeiraArte = artes[CARRINHO.find(i => i.arte).codigo];

  const venda = {
    tenant_id: tenantId,
    number: numero,
    type: 'sale',
    customer_id: cliente.id,
    user_id: usuario.id,
    status: STATUS,
    origin: 'Venda Online',
    source: 'manual',
    subtotal,
    discount: 0,
    freight: FRETE,
    total: subtotal + FRETE,
    notes: NOTA,
    payment_method: 'pix',
    created_at: nascimento,
    operation_date: nascimento.slice(0, 10),
    event_date: T.dia(28),
    ship_date: T.dia(10),
    collect_date: T.dia(10),
    delivery_date: T.dia(16),
    transport_days: 5,
    delivery_mode: 'entrega',
    production_log: log,
    artwork_url: primeiraArte,
    art_file: `ARTE-TESTE-${codigoPedido}-item1.svg`,
    artwork_notes: `${T.MARCA} três artes neste pedido, uma por item personalizado. `
      + 'Arquivos gerados pelo script — não são artes de cliente.',
    ...(transp ? { carrier_id: transp.id, carrier: transp.name } : {}),
  };

  const { data: criada, error } = await supabase.from('VENDAS')
    .insert(venda).select('id, number').single();
  if (error) { console.error('Falhou o pedido:', error.message); process.exit(1); }

  // ── Os cinco itens ────────────────────────────────────────
  // O que decide "personalizado" é `Cor da personalização` na
  // customização (lib/itensPedido.js). O liso não a tem — e é só por
  // isso que ele não pede serigrafia. Nada de flag paralela.
  const itens = CARRINHO.map((item, i) => {
    const prod = porCodigo[item.codigo];
    return {
      sale_id: criada.id,
      product_id: prod.id,
      product_name: prod.name,
      quantity: item.qtd,
      unit_price: item.preco,
      discount: 0,
      total: item.qtd * item.preco,
      customization: {
        'Código': prod.code,
        'Variação': item.cor,
        'Borda': 'Sem borda',
        ...(item.arte
          ? {
              'Cor da personalização': item.tinta,
              'Tinta': 'PS',
              art_file: `ARTE-TESTE-${codigoPedido}-item${i + 1}.svg`,
              arte_cliente: {
                url: artes[item.codigo],
                nome: `ARTE-TESTE-${codigoPedido}-item${i + 1}.svg`,
                enviada_em: nascimento,
                por: usuario.name,
              },
            }
          : {}),
        teste: true,
      },
    };
  });

  const { error: eItens } = await supabase.from('VENDA_ITENS').insert(itens);
  if (eItens) { console.error('Itens do pedido:', eItens.message); process.exit(1); }

  console.log(`${codigoPedido}  ${STATUS}  ${CARRINHO.length} itens  ${CARRINHO.reduce((s, i) => s + i.qtd, 0)} pecas\n`);
  itens.forEach((it, i) => console.log(
    `  ${i + 1}. ${String(it.quantity).padStart(3)} x ${it.product_name.padEnd(48)} `
    + `${(CARRINHO[i].arte ? 'COM ARTE' : 'LISO').padEnd(9)} `
    + `R$ ${it.unit_price.toFixed(2).padStart(5)}  =  R$ ${it.total.toFixed(2).padStart(8)}`));
  console.log(`\n  subtotal R$ ${subtotal.toFixed(2)}  +  frete R$ ${FRETE.toFixed(2)}  =  R$ ${(subtotal + FRETE).toFixed(2)}`);
  console.log(`\nCliente: ${cliente.name}`);
  console.log(`Para remover: node backend/scripts/${ASSINATURA} --limpar`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
