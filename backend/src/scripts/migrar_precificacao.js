/**
 * DATOR ERP — Migração dos preços do PRODUTO para Tabelas de Precificação
 *
 * O preço saiu do cadastro do produto (price_tiers/print_pricing) e passou
 * para a ficha (Tabela de Precificação). Este script cria, para cada modelo
 * com preço antigo, uma FICHA MESTRE em modo "pass-through" (o preço é
 * reproduzido EXATAMENTE, sem recálculo) e liga os produtos a ela.
 *
 * Segurança:
 *   - DRY-RUN por padrão: só mostra o que faria, NÃO grava nada.
 *   - Para gravar de verdade, rode com  --commit
 *   - Idempotente: pula produtos que já têm pricing_sheet_id.
 *   - Modelos com preços idênticos compartilham UMA ficha (dedupe por
 *     assinatura), então ~60 modelos viram ~60 fichas, não centenas.
 *
 * Como usar:
 *   node src/scripts/migrar_precificacao.js            # dry-run (revisar)
 *   node src/scripts/migrar_precificacao.js --commit   # aplica
 *
 * Pré-requisitos: .env com SUPABASE_URL e SUPABASE_SERVICE_KEY.
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const STORE_TENANT = process.env.STORE_TENANT_ID || 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const COMMIT = process.argv.includes('--commit');

// ── Transformação pura (testável sem banco) ───────────────

// Normaliza faixas [{min_qty,max_qty,price}] para o pass-through.
function normTiers(arr) {
  return (Array.isArray(arr) ? arr : [])
    .map(t => ({
      min_qty: Number(t.min_qty) || 0,
      max_qty: (t.max_qty == null || t.max_qty === '') ? null : Number(t.max_qty),
      price: Number(t.price) || 0,
    }))
    .filter(t => t.price > 0)
    .sort((a, b) => a.min_qty - b.min_qty);
}

// Constrói o bloco de preço da ficha (modo direct) a partir de um produto.
// Retorna null se o produto não tem preço aproveitável.
function pricingBlocksFromProduct(p) {
  const base = normTiers(p.price_tiers);
  const pp = (p.print_pricing && typeof p.print_pricing === 'object') ? p.print_pricing : {};
  const print_costs = {};
  for (const [method, cfg] of Object.entries(pp)) {
    const tiers = normTiers(cfg && cfg.tiers);
    if (tiers.length) print_costs[method] = tiers;
  }
  // fallback: sale_price vira uma faixa base única (1+)
  if (!base.length && !Object.keys(print_costs).length) {
    const sp = Number(p.sale_price) || 0;
    if (sp > 0) return { direct: true, tiers: [{ min_qty: 1, max_qty: null }], base_tiers: [{ min_qty: 1, max_qty: null, price: sp }], print_costs: {} };
    return null;
  }
  // faixas exibidas = união das bordas encontradas (base + métodos)
  const bandSet = new Map();
  const collect = arr => arr.forEach(t => bandSet.set(`${t.min_qty}-${t.max_qty}`, { min_qty: t.min_qty, max_qty: t.max_qty }));
  collect(base);
  Object.values(print_costs).forEach(collect);
  const tiers = [...bandSet.values()].sort((a, b) => a.min_qty - b.min_qty);
  return { direct: true, tiers, base_tiers: base, print_costs };
}

// Assinatura de preço: modelos com a mesma assinatura compartilham ficha.
function signatureOf(p) {
  const blocks = pricingBlocksFromProduct(p);
  if (!blocks) return null;
  const name = (p.store_group || p.name || '').trim().toUpperCase();
  return name + '|' + JSON.stringify({ b: blocks.base_tiers, p: blocks.print_costs });
}

function fichaFromProduct(p) {
  const blocks = pricingBlocksFromProduct(p);
  if (!blocks) return null;
  return {
    tenant_id: STORE_TENANT,
    name: (p.store_group || p.name || 'Produto').trim(),
    is_master: true, is_active: true,
    calc_quantity: 1,
    tax_pct: 0, tax_regime: 'simples',
    margin_min_pct: 0, margin_ideal_pct: 0, margin_premium_pct: 0,
    overhead_unit: 0,
    blocks,
  };
}

module.exports = { pricingBlocksFromProduct, signatureOf, fichaFromProduct, normTiers };

// ── Execução (DB) ─────────────────────────────────────────
async function main() {
  const supabase = require('../config/supabase');
  console.log(`\n[migração precificação] tenant=${STORE_TENANT}  modo=${COMMIT ? 'COMMIT (grava)' : 'DRY-RUN (só mostra)'}\n`);

  // Produtos ativos, ainda sem ficha ligada
  let sel = 'id, name, store_group, sale_price, price_tiers, print_pricing, pricing_sheet_id';
  let { data: prods, error } = await supabase.from('PRODUTOS')
    .select(sel).eq('tenant_id', STORE_TENANT).eq('is_active', true).limit(5000);
  if (error) {
    // pricing_sheet_id pode não existir se a 057 não foi aplicada
    if (/pricing_sheet_id/i.test(error.message || '')) {
      console.error('❌ Coluna pricing_sheet_id ausente. Rode a migração 057_precificacao_tabela.sql antes.');
      process.exit(1);
    }
    throw error;
  }

  const semFicha = (prods || []).filter(p => !p.pricing_sheet_id);
  console.log(`Produtos ativos: ${prods.length} | sem ficha: ${semFicha.length}`);

  // Agrupa por assinatura de preço
  const groups = new Map();
  let semPreco = 0;
  for (const p of semFicha) {
    const sig = signatureOf(p);
    if (!sig) { semPreco++; continue; }
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig).push(p);
  }
  console.log(`Sem preço aproveitável (ignorados): ${semPreco}`);
  console.log(`Fichas a criar: ${groups.size}\n`);

  let criadas = 0, ligados = 0;
  for (const [, items] of groups) {
    const rep = items[0];
    const ficha = fichaFromProduct(rep);
    const nFaixas = ficha.blocks.tiers.length;
    const metodos = Object.keys(ficha.blocks.print_costs);
    console.log(`• "${ficha.name}"  (${items.length} produto(s), ${nFaixas} faixa(s), impressões: ${metodos.join(', ') || 'nenhuma'})`);

    if (!COMMIT) continue;

    const { data: novaFicha, error: e1 } = await supabase.from('PRECIFICACOES').insert(ficha).select('id').single();
    if (e1) { console.error(`  ❌ erro ao criar ficha: ${e1.message}`); continue; }
    criadas++;
    const ids = items.map(p => p.id);
    const { error: e2 } = await supabase.from('PRODUTOS')
      .update({ pricing_sheet_id: novaFicha.id }).in('id', ids).eq('tenant_id', STORE_TENANT);
    if (e2) { console.error(`  ❌ erro ao ligar produtos: ${e2.message}`); continue; }
    ligados += ids.length;
  }

  console.log(`\n${COMMIT ? `✅ Criadas ${criadas} fichas, ${ligados} produtos ligados.` : 'DRY-RUN: nada foi gravado. Rode com --commit para aplicar.'}\n`);
}

if (require.main === module) {
  main().catch(err => { console.error('Falha:', err.message); process.exit(1); });
}
