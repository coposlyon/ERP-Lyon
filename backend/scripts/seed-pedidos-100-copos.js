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
 * O QUE MARCA QUE É TESTE, em cinco lugares, porque quem abre a tela
 * não lê o script:
 *   1. o cliente chama-se "CLIENTE DE TESTE — NAO FATURAR";
 *   2. `notes` de cada pedido começa com a marca e diz NÃO PRODUZIR;
 *   3. a arte anexada é uma imagem escrita "ARTE DE TESTE";
 *   4. `artwork_notes` repete o aviso no card da arte;
 *   5. `art_file` chama-se ARTE-TESTE-PV-000N.svg.
 *
 * INSERÇÃO DIRETA, e NÃO pela função `criar_venda` — pelo mesmo motivo
 * do seed-pedidos-teste.js: aquela dá baixa no estoque e grava
 * movimentação, e pedido de teste não pode mexer no saldo de verdade.
 * Sem isso o `--limpar` deixaria para trás um rastro que ninguém
 * lembraria de desfazer (foi exatamente o que o ZERAR_TESTES_20260907
 * teve de consertar à mão).
 *
 * A MARCA É A MESMA do seed-pedidos-teste.js, para que uma limpeza
 * geral por `notes LIKE '[PEDIDO DE TESTE]%'` encontre os dois. Já o
 * `--limpar` daqui apaga SÓ os deste script (a assinatura na nota),
 * para não levar junto o cenário do outro.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const supabase = require('../src/config/supabase');
const { uploadDataUrl } = require('../src/lib/storage');

const MARCA = '[PEDIDO DE TESTE]';
const ASSINATURA = 'seed-pedidos-100-copos.js';

const CLIENTE_TESTE = 'CLIENTE DE TESTE — NAO FATURAR';

// ── Datas relativas a hoje, para o teste continuar valendo semana que vem ──
const dia = n => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ── A RÉGUA ─────────────────────────────────────────────────
// A mesma ordem de lib/atencao.js: o começo vale para todo pedido, a
// serigrafia só existe no personalizado, e o fim volta a valer para os
// dois. O log de cada pedido é esta lista cortada no status dele.
const INICIO = [
  'iniciando_pedido', 'aguardando_financeiro', 'pagamento_confirmado',
  'aguardando_estoque', 'estoque_confirmado',
];
const SERIGRAFIA = [
  'aguardando_arte', 'arte_aprovada', 'aguardando_vegetal', 'vegetal_impresso',
  'aguardando_revelacao', 'revelacao_finalizada',
];
const FIM = [
  'aguardando_producao', 'producao_finalizada', 'aguardando_qualidade',
  'qualidade_finalizada', 'aguardando_embalagem', 'embalagem_finalizada',
  'aguardando_foto', 'foto_enviada', 'aguardando_coleta',
];

function trilha(alvo, personalizado) {
  const passos = [...INICIO, ...(personalizado ? SERIGRAFIA : []), ...FIM];
  const i = passos.indexOf(alvo);
  if (i < 0) throw new Error(`Status fora da régua: ${alvo}`);
  return passos.slice(0, i + 1);
}

// Os marcos espalhados entre "nasceu há N dias" e "duas horas atrás",
// no mesmo formato que lib/fluxoPedido.js grava (stage/action/at/user).
function historico(passos, diasAtras, usuario) {
  const fim = Date.now() - 2 * 3600e3;
  const ini = Date.now() - diasAtras * 86400e3;
  const salto = passos.length > 1 ? (fim - ini) / (passos.length - 1) : 0;
  return passos.map((action, i) => ({
    stage: 'status',
    action,
    at: new Date(ini + i * salto).toISOString(),
    user_id: usuario.id,
    user: usuario.name,
  }));
}

// ── A arte de teste ─────────────────────────────────────────
// Um SVG gerado aqui e subido no MESMO bucket público em que a rota de
// upload guarda a arte de verdade (lib/storage.js → artes-pedido).
// Podia ser uma URL inventada; seria um card de arte quebrado na tela,
// e a diferença entre "sem arte" e "com arte que não abre" é justamente
// o que este teste precisa mostrar.
const svgArte = (codigo, cor) => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500" viewBox="0 0 900 500">
  <rect width="900" height="500" fill="#0f172a"/>
  <rect x="18" y="18" width="864" height="464" fill="none" stroke="#e8187a" stroke-width="6" stroke-dasharray="20 14"/>
  <text x="450" y="190" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="76" font-weight="bold" fill="#e8187a">ARTE DE TESTE</text>
  <text x="450" y="270" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="44" fill="#22d3ee">${codigo}</text>
  <text x="450" y="340" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="30" fill="#e2e8f0">100 copos - impressao ${cor}</text>
  <text x="450" y="400" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="26" fill="#94a3b8">NAO PRODUZIR - arquivo gerado para teste do sistema</text>
</svg>`;

// ── Os cinco ────────────────────────────────────────────────
// Preço: o liso sai pelo `sale_price` do cadastro (R$ 2,00); o
// personalizado leva R$ 1,50 de impressão de uma cor por copo. Os dois
// ficam gravados no item, como o PDV grava.
const PEDIDOS = [
  {
    arte: true, status: 'aguardando_arte', dias: 2, preco: 3.50,
    produto: 'LDT - 02', cor: 'PRETO', tinta: 'BRANCA',
    origin: 'Venda Online', entrega: true, frete: 118, prazo: 5, ship: dia(9),
    resumo: 'arte anexada, esperando aprovacao',
  },
  {
    arte: true, status: 'aguardando_revelacao', dias: 5, preco: 3.50,
    produto: 'LDT - 07', cor: 'PINK OPACO', tinta: 'DOURADA',
    origin: 'Venda Online', entrega: true, frete: 96, prazo: 4, ship: dia(6),
    resumo: 'arte aprovada, vegetal impresso',
  },
  {
    arte: true, status: 'aguardando_producao', dias: 8, preco: 3.50,
    produto: 'LDT - 04', cor: 'AZUL BIC', tinta: 'BRANCA',
    origin: 'Venda Presencial', entrega: false, frete: 0, prazo: 0, ship: dia(3),
    resumo: 'serigrafia concluida, na fila da producao',
  },
  {
    arte: false, status: 'aguardando_estoque', dias: 1, preco: 2.00,
    produto: 'LDT - 01', cor: 'BRANCO', tinta: null,
    origin: 'Venda Online', entrega: true, frete: 84, prazo: 6, ship: dia(11),
    resumo: 'copo liso, na fila do estoque',
  },
  {
    arte: false, status: 'aguardando_embalagem', dias: 4, preco: 2.00,
    produto: 'LDT - 24', cor: 'TRANSPARENTE', tinta: null,
    origin: 'Venda Presencial', entrega: false, frete: 0, prazo: 0, ship: dia(2),
    resumo: 'copo liso, pulou arte/vegetal/revelacao',
  },
];

const pv = n => `PV-${String(n).padStart(6, '0')}`;

// ============================================================
// LIMPAR
// ============================================================
async function limpar(tenantId) {
  const { data: alvos } = await supabase.from('VENDAS')
    .select('id, number, artwork_url')
    .eq('tenant_id', tenantId)
    .like('notes', `${MARCA}%`)
    .like('notes', `%${ASSINATURA}%`);

  if (!alvos?.length) {
    console.log('Nada deste script para apagar.');
  } else {
    // As artes que este script subiu saem junto: arquivo órfão em bucket
    // público é lixo que ninguém acha depois.
    const caminhos = alvos
      .map(v => (v.artwork_url || '').split('/loja-publico/')[1])
      .filter(Boolean);
    if (caminhos.length) {
      const { error } = await supabase.storage.from('loja-publico').remove(caminhos);
      if (error) console.warn('Artes no Storage:', error.message);
      else console.log(`Artes removidas do Storage: ${caminhos.length}`);
    }

    await supabase.from('VENDA_ITENS').delete().in('sale_id', alvos.map(v => v.id));
    await supabase.from('VENDAS').delete().in('id', alvos.map(v => v.id));
    console.log(`Pedidos apagados: ${alvos.map(v => pv(v.number)).join(', ')}`);
  }

  // O cliente de teste só sai se não sobrou pedido nenhum nele — pode
  // haver pedido criado à mão na tela usando o mesmo cadastro.
  const { data: cli } = await supabase.from('CLIENTES')
    .select('id').eq('tenant_id', tenantId).eq('name', CLIENTE_TESTE).maybeSingle();
  if (cli) {
    const { count } = await supabase.from('VENDAS')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId).eq('customer_id', cli.id);
    if (!count) {
      await supabase.from('CLIENTES').delete().eq('id', cli.id);
      console.log(`Cliente de teste removido: ${CLIENTE_TESTE}`);
    } else {
      console.log(`Cliente de teste MANTIDO — ainda tem ${count} pedido(s).`);
    }
  }
}

// ============================================================
// CRIAR
// ============================================================
async function main() {
  const { data: emp } = await supabase.from('EMPRESAS').select('id, name').limit(1);
  if (!emp?.length) { console.error('Nenhuma empresa na base.'); process.exit(1); }
  const tenantId = emp[0].id;

  if (process.argv.includes('--limpar')) return limpar(tenantId);

  // Rodar duas vezes criaria dez pedidos. Melhor recusar e dizer como
  // refazer do que encher a lista de vendas com repetição.
  const { data: jaTem } = await supabase.from('VENDAS')
    .select('number').eq('tenant_id', tenantId).like('notes', `%${ASSINATURA}%`);
  if (jaTem?.length) {
    console.error(
      `Já existem ${jaTem.length} pedidos deste script (${jaTem.map(v => pv(v.number)).join(', ')}).\n`
      + 'Rode com --limpar antes de criar de novo.');
    process.exit(1);
  }

  const { data: usuario } = await supabase.from('USUARIOS')
    .select('id, name').eq('tenant_id', tenantId).eq('is_active', true)
    .eq('role', 'admin').limit(1).single();

  const { data: produtos } = await supabase.from('PRODUTOS')
    .select('id, code, name, sale_price').eq('tenant_id', tenantId)
    .in('code', PEDIDOS.map(p => p.produto));
  const porCodigo = Object.fromEntries((produtos || []).map(p => [p.code, p]));
  const faltando = PEDIDOS.map(p => p.produto).filter(c => !porCodigo[c]);
  if (faltando.length) { console.error('Produtos não encontrados:', faltando.join(', ')); process.exit(1); }

  const { data: transp } = await supabase.from('TRANSPORTADORAS')
    .select('id, name').eq('tenant_id', tenantId).limit(1).maybeSingle();

  // ── O cliente de teste ──────────────────────────────────
  let { data: cliente } = await supabase.from('CLIENTES')
    .select('id, name, display_id').eq('tenant_id', tenantId).eq('name', CLIENTE_TESTE).maybeSingle();
  if (!cliente) {
    const { data, error } = await supabase.from('CLIENTES').insert({
      tenant_id: tenantId,
      type: 'PF',
      name: CLIENTE_TESTE,
      email: 'teste@teste.invalid',
      is_active: true,
      // Sem CPF de propósito: cadastro de teste que não pode virar nota.
      notes: `${MARCA} cadastro criado por ${ASSINATURA}. Não faturar, não emitir nota.`,
    }).select('id, name, display_id').single();
    if (error) { console.error('Cliente de teste:', error.message); process.exit(1); }
    cliente = data;
    console.log(`Cliente de teste criado: #${cliente.display_id} ${cliente.name}\n`);
  } else {
    console.log(`Cliente de teste reaproveitado: #${cliente.display_id} ${cliente.name}\n`);
  }

  // Continua de onde a numeração parou, para não colidir com pedido real.
  const { data: ultima } = await supabase.from('VENDAS')
    .select('number').eq('tenant_id', tenantId).order('number', { ascending: false }).limit(1);
  let numero = ultima?.[0]?.number || 0;

  for (const p of PEDIDOS) {
    numero++;
    const prod = porCodigo[p.produto];
    const subtotal = 100 * p.preco;
    const log = historico(trilha(p.status, p.arte), p.dias, usuario);
    const nascimento = log[0].at;

    // A arte só existe no pedido personalizado — e é o que faz a
    // serigrafia aparecer na linha do tempo dele.
    let arteUrl = null;
    if (p.arte) {
      const svg = svgArte(pv(numero), p.tinta);
      const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
      arteUrl = await uploadDataUrl(dataUrl, 'artes-pedido');
      if (!arteUrl) { console.error(`Não consegui subir a arte do ${pv(numero)}.`); process.exit(1); }
    }

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
      notes: `${MARCA} 100 copos ${p.arte ? 'COM ARTE' : 'LISOS (sem arte)'} — `
           + `NAO PRODUZIR, NAO FATURAR, NAO ENVIAR. Gerado por ${ASSINATURA}.`,
      payment_method: 'pix',
      created_at: nascimento,
      operation_date: nascimento.slice(0, 10),
      event_date: dia(25),
      ship_date: p.ship,
      delivery_date: p.entrega ? dia(18) : p.ship,
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
            art_file: `ARTE-TESTE-${pv(numero)}.svg`,
            artwork_notes: `${MARCA} arte gerada pelo script — não é arquivo de cliente.`,
          }
        : {}),
    };

    const { data: criada, error } = await supabase.from('VENDAS')
      .insert(venda).select('id, number').single();
    if (error) { console.error(`Falhou no ${pv(numero)}:`, error.message); process.exit(1); }

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
    if (eItem) { console.error(`Item do ${pv(numero)}:`, eItem.message); process.exit(1); }

    console.log(
      `${pv(criada.number)}  ${(p.arte ? 'COM ARTE' : 'LISO').padEnd(9)} `
      + `${p.status.padEnd(22)} 100 x ${prod.code.padEnd(9)} `
      + `R$ ${(subtotal + p.frete).toFixed(2).padStart(8)}  ${p.resumo}`);
  }

  console.log(`\nCliente: ${cliente.name}`);
  console.log(`Para remover: node backend/scripts/${ASSINATURA} --limpar`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
