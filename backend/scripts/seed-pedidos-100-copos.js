#!/usr/bin/env node
/**
 * CINCO PEDIDOS DE TESTE — 100 copos cada, três COM ARTE e dois LISOS.
 *
 *   node backend/scripts/seed-pedidos-100-copos.js            cria
 *   node backend/scripts/seed-pedidos-100-copos.js --limpar   apaga o que criou
 *
 * PARA QUE SERVE. A diferença entre um pedido personalizado e um liso
 * não é um campo: é o CAMINHO. O personalizado passa por arte, vegetal
 * e revelação; o liso pula as três (lib/atencao.js, `opcional:
 * 'personalizado'`) e vai do estoque para a embalagem. Cinco pedidos
 * iguais não mostrariam isso — por isso os cinco daqui param em pontos
 * diferentes da régua:
 *
 *   COM ARTE   aguardando_arte        arte anexada, esperando aprovação
 *   COM ARTE   aguardando_revelacao   arte aprovada, vegetal impresso
 *   COM ARTE   aguardando_producao    serigrafia inteira concluída
 *   LISO       aguardando_estoque     na fila do estoque
 *   LISO       aguardando_embalagem   sem arte, sem vegetal, sem revelação
 *
 * São cinco pedidos DE UM ITEM CADA — é a LISTA de vendas que este
 * cenário serve. Para ver um carrinho com vários produtos dentro do
 * mesmo pedido, o cenário é o seed-pedido-carrinho-misto.js.
 *
 * O QUE MARCA QUE É TESTE, em cinco lugares, porque quem abre a tela
 * não lê o script:
 *   1. o cliente chama-se "CLIENTE DE TESTE — NAO FATURAR";
 *   2. `notes` de cada pedido começa com a marca e diz NÃO PRODUZIR;
 *   3. a arte anexada é uma imagem escrita "ARTE DE TESTE";
 *   4. `artwork_notes` repete o aviso no card da arte;
 *   5. `art_file` chama-se ARTE-TESTE-PV-000N.svg.
 *
 * INSERÇÃO DIRETA, e NÃO pela função `criar_venda`: aquela dá baixa no
 * estoque e grava movimentação, e pedido de teste não pode mexer no
 * saldo de verdade. Sem isso o `--limpar` deixaria para trás um rastro
 * que ninguém lembraria de desfazer (foi exatamente o que o
 * ZERAR_TESTES_20260907 teve de consertar à mão).
 *
 * A marca, o cliente, a régua de status e a arte falsa moram em
 * _teste-pedidos.js, compartilhados com os outros cenários.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../src/config/supabase');
const T = require('./_teste-pedidos');

const ASSINATURA = 'seed-pedidos-100-copos.js';

// Preço: o liso sai pelo `sale_price` do cadastro (R$ 2,00); o
// personalizado leva R$ 1,50 de impressão de uma cor por copo. Os dois
// ficam gravados no item, como o PDV grava.
const PEDIDOS = [
  {
    arte: true, status: 'aguardando_arte', dias: 2, preco: 3.50,
    produto: 'LDT - 02', cor: 'PRETO', tinta: 'BRANCA',
    origin: 'Venda Online', entrega: true, frete: 118, prazo: 5, ship: T.dia(9),
    resumo: 'arte anexada, esperando aprovacao',
  },
  {
    arte: true, status: 'aguardando_revelacao', dias: 5, preco: 3.50,
    produto: 'LDT - 07', cor: 'PINK OPACO', tinta: 'DOURADA',
    origin: 'Venda Online', entrega: true, frete: 96, prazo: 4, ship: T.dia(6),
    resumo: 'arte aprovada, vegetal impresso',
  },
  {
    arte: true, status: 'aguardando_producao', dias: 8, preco: 3.50,
    produto: 'LDT - 04', cor: 'AZUL BIC', tinta: 'BRANCA',
    origin: 'Venda Presencial', entrega: false, frete: 0, prazo: 0, ship: T.dia(3),
    resumo: 'serigrafia concluida, na fila da producao',
  },
  {
    arte: false, status: 'aguardando_estoque', dias: 1, preco: 2.00,
    produto: 'LDT - 01', cor: 'BRANCO', tinta: null,
    origin: 'Venda Online', entrega: true, frete: 84, prazo: 6, ship: T.dia(11),
    resumo: 'copo liso, na fila do estoque',
  },
  {
    arte: false, status: 'aguardando_embalagem', dias: 4, preco: 2.00,
    produto: 'LDT - 24', cor: 'TRANSPARENTE', tinta: null,
    origin: 'Venda Presencial', entrega: false, frete: 0, prazo: 0, ship: T.dia(2),
    resumo: 'copo liso, pulou arte/vegetal/revelacao',
  },
];

async function main() {
  const { tenantId, usuario } = await T.empresaEUsuario();

  if (process.argv.includes('--limpar')) return T.limparPor(tenantId, ASSINATURA);

  // Rodar duas vezes criaria dez pedidos. Melhor recusar e dizer como
  // refazer do que encher a lista de vendas com repetição.
  const jaTem = await T.pedidosDe(tenantId, ASSINATURA);
  if (jaTem.length) {
    console.error(
      `Já existem ${jaTem.length} pedidos deste script (${jaTem.map(v => T.pv(v.number)).join(', ')}).\n`
      + 'Rode com --limpar antes de criar de novo.');
    process.exit(1);
  }

  const { data: produtos } = await supabase.from('PRODUTOS')
    .select('id, code, name, sale_price').eq('tenant_id', tenantId)
    .in('code', PEDIDOS.map(p => p.produto));
  const porCodigo = Object.fromEntries((produtos || []).map(p => [p.code, p]));
  const faltando = PEDIDOS.map(p => p.produto).filter(c => !porCodigo[c]);
  if (faltando.length) { console.error('Produtos não encontrados:', faltando.join(', ')); process.exit(1); }

  const { data: transp } = await supabase.from('TRANSPORTADORAS')
    .select('id, name').eq('tenant_id', tenantId).limit(1).maybeSingle();

  const { cliente, criado } = await T.garantirCliente(tenantId, ASSINATURA);
  console.log(`Cliente ${criado ? 'criado' : 'reaproveitado'}: #${cliente.display_id} ${cliente.name}\n`);

  let numero = await T.ultimoNumero(tenantId);

  for (const p of PEDIDOS) {
    numero++;
    const prod = porCodigo[p.produto];
    const subtotal = 100 * p.preco;
    const log = T.historico(T.trilha(p.status, p.arte), p.dias, usuario);
    const nascimento = log[0].at;

    // A arte só existe no pedido personalizado — e é o que faz a
    // serigrafia aparecer na linha do tempo dele.
    const arteUrl = p.arte
      ? await T.subirArte(T.pv(numero), `100 x ${prod.name} - impressao ${p.tinta}`)
      : null;

    const venda = {
      tenant_id: tenantId,
      number: numero,
      type: 'sale',
      customer_id: cliente.id,
      user_id: usuario.id,
      status: p.status,
      origin: p.origin,
      source: 'manual',
      subtotal,
      discount: 0,
      freight: p.frete,
      total: subtotal + p.frete,
      notes: `${T.MARCA} 100 copos ${p.arte ? 'COM ARTE' : 'LISOS (sem arte)'} — `
           + `NAO PRODUZIR, NAO FATURAR, NAO ENVIAR. Gerado por ${ASSINATURA}.`,
      payment_method: 'pix',
      created_at: nascimento,
      operation_date: nascimento.slice(0, 10),
      event_date: T.dia(25),
      ship_date: p.ship,
      delivery_date: p.entrega ? T.dia(18) : p.ship,
      delivery_mode: p.entrega ? 'entrega' : 'retirada',
      production_log: log,
      ...(p.entrega
        ? {
            collect_date: p.ship,
            transport_days: p.prazo,
            ...(transp ? { carrier_id: transp.id, carrier: transp.name } : {}),
          }
        : {}),
      ...(p.arte
        ? {
            artwork_url: arteUrl,
            art_file: `ARTE-TESTE-${T.pv(numero)}.svg`,
            artwork_notes: `${T.MARCA} arte gerada pelo script — não é arquivo de cliente.`,
          }
        : {}),
    };

    const { data: criada, error } = await supabase.from('VENDAS')
      .insert(venda).select('id, number').single();
    if (error) { console.error(`Falhou no ${T.pv(numero)}:`, error.message); process.exit(1); }

    // O item: o que decide "personalizado" é `Cor da personalização` na
    // customização (lib/itensPedido.js). O liso não a tem — e é só por
    // isso que ele pula a serigrafia. Nada de flag paralela.
    const customization = {
      'Código': prod.code,
      'Variação': p.cor,
      'Borda': 'Sem borda',
      ...(p.arte
        ? {
            'Cor da personalização': p.tinta,
            'Tinta': 'PS',
            arte_cliente: { url: arteUrl, enviada_em: nascimento },
          }
        : {}),
      teste: true,
    };

    const { error: eItem } = await supabase.from('VENDA_ITENS').insert({
      sale_id: criada.id,
      product_id: prod.id,
      product_name: prod.name,
      quantity: 100,
      unit_price: p.preco,
      discount: 0,
      total: subtotal,
      customization,
    });
    if (eItem) { console.error(`Item do ${T.pv(numero)}:`, eItem.message); process.exit(1); }

    console.log(
      `${T.pv(criada.number)}  ${(p.arte ? 'COM ARTE' : 'LISO').padEnd(9)} `
      + `${p.status.padEnd(22)} 100 x ${prod.code.padEnd(9)} `
      + `R$ ${(subtotal + p.frete).toFixed(2).padStart(8)}  ${p.resumo}`);
  }

  console.log(`\nCliente: ${cliente.name}`);
  console.log(`Para remover: node backend/scripts/${ASSINATURA} --limpar`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
