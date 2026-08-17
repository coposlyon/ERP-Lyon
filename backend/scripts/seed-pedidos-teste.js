#!/usr/bin/env node
/**
 * Três pedidos de venda de TESTE, para conferir as telas com dado real.
 *
 *   node backend/scripts/seed-pedidos-teste.js          cria
 *   node backend/scripts/seed-pedidos-teste.js --limpar  apaga os que criou
 *
 * Os três foram escolhidos para acender cada estado da coluna Atenção e
 * cada origem, em vez de serem três cópias do mesmo caso:
 *
 *   PV-0001  Shopee         · aguardando estoque   · saída longe  → verde
 *   PV-0002  WhatsApp       · aguardando arte      · saída em 2d  → amarelo
 *   PV-0003  Mercado Livre  · aguardando financeiro· saída ontem  → sirene
 *
 * Inserção direta em VENDAS/VENDA_ITENS, e NÃO pela função criar_venda:
 * aquela dá baixa no estoque e grava movimentação. Pedido de teste não
 * pode mexer no estoque de verdade — e sem isso o `--limpar` deixaria
 * rastro que ninguém lembraria de desfazer.
 *
 * `notes` começa com a marca abaixo; é por ela que a limpeza encontra o
 * que apagar, sem risco de levar pedido de verdade junto.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../src/config/supabase');

const MARCA = '[PEDIDO DE TESTE]';

// Datas relativas a hoje, para o teste continuar valendo semana que vem.
const dia = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
const hora = (diasAtras, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

const PEDIDOS = [
  {
    origin: 'Shopee',
    status: 'aguardando_estoque',
    ship_date: dia(12),            // folga: fica verde
    freight: 120, freight_quote: 'BRSP158732', transport_days: 5,
    log: [
      { action: 'iniciando_pedido',      at: hora(3, 10, 25) },
      { action: 'aguardando_financeiro', at: hora(3, 10, 26) },
      { action: 'pagamento_confirmado',  at: hora(3, 10, 50) },
      { action: 'aguardando_estoque',    at: hora(3, 10, 52) },
    ],
    itens: [{
      qtd: 500, preco: 4.90,
      custom: { 'Variação': 'PRETO', 'Cor da personalização': 'BRANCA', 'Tinta': 'PP', 'Borda': 'Sem borda' },
    }],
  },
  {
    origin: 'WhatsApp',
    status: 'aguardando_arte',
    ship_date: dia(2),             // 2 dias: amarelo piscando
    freight: 180, freight_quote: 'BRSP159014', transport_days: 4,
    log: [
      { action: 'iniciando_pedido',      at: hora(2, 15, 48) },
      { action: 'pagamento_confirmado',  at: hora(2, 16, 10) },
      { action: 'aguardando_estoque',    at: hora(2, 16, 12) },
      { action: 'estoque_confirmado',    at: hora(1, 9, 30) },
      { action: 'aguardando_arte',       at: hora(1, 9, 32) },
    ],
    itens: [{
      qtd: 300, preco: 6.50,
      custom: { 'Variação': 'AZUL/ROSA', 'Cor da personalização': 'DOURADA', 'Tinta': 'PS',
                'Borda': 'Com borda: PRATA', 'Acabamentos': 'Cor degradê: AZUL/ROSA' },
    }],
  },
  {
    origin: 'Mercado Livre',
    status: 'aguardando_financeiro',
    ship_date: dia(-1),            // já passou: sirene
    freight: 95, freight_quote: 'BRSP159320', transport_days: 6,
    log: [
      { action: 'iniciando_pedido',      at: hora(6, 8, 52) },
      { action: 'aguardando_financeiro', at: hora(6, 8, 53) },
    ],
    itens: [
      { qtd: 200, preco: 5.20,
        custom: { 'Variação': 'TRANSPARENTE', 'Cor da personalização': 'PRETA', 'Tinta': 'PS',
                  'Acabamentos': 'Jateado: FOSCO' } },
      { qtd: 150, preco: 7.80,
        custom: { 'Variação': 'BRANCO', 'Cor da personalização': 'VERMELHA', 'Tinta': 'PP',
                  'Borda': 'Com borda: DOURADA' } },
    ],
  },
];

async function limpar(tenantId) {
  const { data: alvos } = await supabase.from('VENDAS')
    .select('id, number').eq('tenant_id', tenantId).like('notes', `${MARCA}%`);

  if (!alvos?.length) { console.log('Nada de teste para apagar.'); return; }

  // VENDA_ITENS não tem ON DELETE CASCADE garantido em toda base — apaga
  // os itens primeiro para não deixar item órfão.
  await supabase.from('VENDA_ITENS').delete().in('sale_id', alvos.map(v => v.id));
  await supabase.from('VENDAS').delete().in('id', alvos.map(v => v.id));
  console.log(`Apagados: ${alvos.map(v => `PV-${String(v.number).padStart(4, '0')}`).join(', ')}`);
}

async function main() {
  const { data: emp } = await supabase.from('EMPRESAS').select('id, name').limit(1);
  if (!emp?.length) { console.error('Nenhuma empresa na base.'); process.exit(1); }
  const tenantId = emp[0].id;

  if (process.argv.includes('--limpar')) return limpar(tenantId);

  const { data: usuario } = await supabase.from('USUARIOS')
    .select('id, name').eq('tenant_id', tenantId).eq('is_active', true).limit(1).single();
  const { data: clientes } = await supabase.from('CLIENTES')
    .select('id, display_id, name').eq('tenant_id', tenantId)
    .in('type', ['PF', 'PJ']).not('display_id', 'is', null).limit(3);
  const { data: produtos } = await supabase.from('PRODUTOS')
    .select('id, name').eq('tenant_id', tenantId).eq('is_active', true).limit(3);

  if (!clientes?.length || !produtos?.length) {
    console.error('Preciso de ao menos 1 cliente e 1 produto cadastrados.'); process.exit(1);
  }

  // Continua de onde a numeração parou, para não colidir com pedido real.
  const { data: ultima } = await supabase.from('VENDAS')
    .select('number').eq('tenant_id', tenantId).order('number', { ascending: false }).limit(1);
  let numero = (ultima?.[0]?.number || 0);

  for (let i = 0; i < PEDIDOS.length; i++) {
    const p = PEDIDOS[i];
    const cliente = clientes[i % clientes.length];
    numero++;

    const itens = p.itens.map((it, j) => ({
      produto: produtos[j % produtos.length],
      quantity: it.qtd,
      unit_price: it.preco,
      total: it.qtd * it.preco,
      customization: it.custom,
    }));
    const subtotal = itens.reduce((s, it) => s + it.total, 0);

    const criadoEm = p.log[0].at;
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
      freight: p.freight,
      total: subtotal + p.freight,
      notes: `${MARCA} gerado por seed-pedidos-teste.js`,
      created_at: criadoEm,
      operation_date: criadoEm.slice(0, 10),
      event_date: dia(25),
      ship_date: p.ship_date,
      collect_date: p.ship_date,
      delivery_date: dia(new Date(p.ship_date) > new Date() ? 20 : 6),
      transport_days: p.transport_days,
      freight_quote: p.freight_quote,
      payment_method: 'pix',
      production_log: p.log.map(e => ({ ...e, stage: 'status', user: usuario.name })),
    };

    const { data: criada, error } = await supabase.from('VENDAS').insert(venda).select('id, number').single();
    if (error) { console.error(`Falhou no pedido ${numero}:`, error.message); process.exit(1); }

    const { error: eItens } = await supabase.from('VENDA_ITENS').insert(
      itens.map(it => ({
        sale_id: criada.id,
        product_id: it.produto.id,
        product_name: it.produto.name,
        quantity: it.quantity,
        unit_price: it.unit_price,
        discount: 0,
        total: it.total,
        customization: it.customization,
      })),
    );
    if (eItens) { console.error(`Itens do pedido ${numero}:`, eItens.message); process.exit(1); }

    console.log(
      `PV-${String(criada.number).padStart(4, '0')}  ${p.origin.padEnd(14)} ` +
      `${p.status.padEnd(22)} saída ${p.ship_date}  ${cliente.name}`
    );
  }

  console.log('\nPara remover: node backend/scripts/seed-pedidos-teste.js --limpar');
}

main().catch(err => { console.error(err.message); process.exit(1); });
