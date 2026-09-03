// ============================================================
// O CADASTRO DE ITENS — e o preço saindo de um lugar só.
//
// Canudo, tampa, borda metalizada e tinta são a mesma pergunta com
// respostas diferentes: "o que isto acrescenta na peça, quanto custa e
// quanto cobra". Por isso uma rota só, e `kind` separando o que a tela
// precisa separar.
//
// TODO ITEM TEM DOIS VALORES, e é essa a mudança que importa:
//   unit_cost   o que NÓS gastamos
//   unit_price  o que NÓS cobramos
// O lucro de cada peça deixa de ser conta de planilha e vira subtração.
//
// A CONTA É A MESMA PARA TUDO: `valor × consumo`. Canudo é 'un' com
// consumo 1 — um canudo por copo. Tinta é 'ml' com consumo 5 — cinco
// mililitros por copo. "R$ 0,15 o ml, gasta 5 ml, entra R$ 0,75" não
// precisa de código especial para tinta, e é por isso que amanhã cabe
// verniz, cola e fita sem tocar aqui.
// ============================================================
const express  = require('express');
const router   = express.Router();
const supabase = require('../config/supabase');
const { audit } = require('../lib/audit');
const { uploadDataUrl } = require('../lib/storage');

const KINDS = ['acessorio', 'borda', 'tinta', 'embalagem', 'outro'];
const UNIDADES = ['un', 'ml', 'g', 'm', 'folha'];

const n6 = v => Math.round((Number(v) || 0) * 1e6) / 1e6;

const semTabela = err =>
  /ITENS|ITEM_APLICACOES|42P01|PGRST(002|205)|does not exist|schema cache/i
    .test(`${err?.code || ''} ${err?.message || ''}`);

const faltaMigracao = (res, err) => {
  if (!semTabela(err)) return false;
  res.status(400).json({
    error: 'Cadastro de itens não habilitado: rode a migração 097_itens_e_adicionais.sql.',
    code: 'MIGRATION_097',
  });
  return true;
};

/**
 * O CUSTO POR UNIDADE, CALCULADO NO SERVIDOR.
 *
 * Compra-se em embalagem (pote de 900 ml por R$ 180) e gasta-se em
 * unidade base (ml). Deixar a divisão para a tela seria deixá-la para
 * quem esquecer de refazê-la no dia em que o fornecedor reajustar — e o
 * custo do copo ficaria congelado no preço do ano passado sem ninguém
 * notar.
 *
 * Quem informa o custo unitário direto (o canudo custa R$ 0,18) não
 * precisa da embalagem: sem `package_qty`, o valor digitado vale.
 */
function custoUnitario(corpo) {
  const qtd = Number(corpo.package_qty) || 0;
  const pago = Number(corpo.package_cost) || 0;
  if (qtd > 0) return n6(pago / qtd);
  return n6(corpo.unit_cost);
}

/**
 * A FOTO, QUE PARA A BORDA NÃO É ENFEITE.
 *
 * "Mosaico Vermelho" e "Mosaico Pink" são a mesma palavra para quem lê
 * e coisas diferentes para quem compra — a escolha da cliente é feita
 * no olho. A tela manda a imagem como data-URL; aqui ela vai para o
 * Storage e o que fica no banco é o endereço. URL já existente passa
 * direto: reeditar um item não reenvia a foto.
 */
async function processaFoto(val) {
  if (val == null) return undefined;   // não enviado → não mexe
  if (val === '') return null;         // limpou
  return /^data:/.test(val) ? await uploadDataUrl(val, 'itens') : val;
}

function corpoDoItem(b) {
  return {
    kind:        KINDS.includes(b.kind) ? b.kind : 'acessorio',
    name:        String(b.name || '').trim().slice(0, 160),
    color_name:  b.color_name ? String(b.color_name).trim().slice(0, 80) : null,
    color_hex:   b.color_hex ? String(b.color_hex).trim().slice(0, 9) : null,
    base_unit:   UNIDADES.includes(b.base_unit) ? b.base_unit : 'un',
    package_qty:  b.package_qty  === '' || b.package_qty  == null ? null : Number(b.package_qty),
    package_cost: b.package_cost === '' || b.package_cost == null ? null : Number(b.package_cost),
    unit_cost:   custoUnitario(b),
    unit_price:  n6(b.unit_price),
    // Consumo zero apagaria o item da conta sem apagá-lo da tela: quem
    // não informa consome 1.
    consumo:     Number(b.consumo) > 0 ? n6(b.consumo) : 1,
    supplier_id: b.supplier_id || null,
    notes:       b.notes ? String(b.notes).slice(0, 500) : null,
    is_active:   b.is_active !== false,
    seq:         parseInt(b.seq, 10) || 0,
  };
}

// ── Lista ────────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const { kind, search, inativos } = req.query;
  try {
    let q = supabase.from('ITENS').select('*').eq('tenant_id', req.tenantId);
    if (KINDS.includes(kind)) q = q.eq('kind', kind);
    if (inativos !== '1') q = q.eq('is_active', true);
    if (search) {
      const t = String(search).trim();
      q = q.or(`name.ilike.%${t}%,color_name.ilike.%${t}%`);
    }
    const { data, error } = await q.order('kind').order('seq').order('name').limit(2000);
    if (error) throw error;

    // O CUSTO E O PREÇO DA PEÇA, JÁ MULTIPLICADOS. A tela mostra "entra
    // R$ 0,75 no copo", não "R$ 0,15 × 5" — a conta é do servidor
    // porque é ela que o pedido também vai usar.
    res.json((data || []).map(i => ({
      ...i,
      custo_na_peca: n6(Number(i.unit_cost) * Number(i.consumo)),
      preco_na_peca: n6(Number(i.unit_price) * Number(i.consumo)),
      margem_na_peca: n6((Number(i.unit_price) - Number(i.unit_cost)) * Number(i.consumo)),
    })));
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

// ── Criar ────────────────────────────────────────────────────
router.post('/', async (req, res) => {
  const corpo = corpoDoItem(req.body || {});
  if (!corpo.name) return res.status(400).json({ error: 'Informe o nome do item.' });
  try {
    const foto = await processaFoto(req.body?.photo_url);
    const { data, error } = await supabase.from('ITENS')
      .insert({ ...corpo, photo_url: foto === undefined ? null : foto, tenant_id: req.tenantId })
      .select().single();
    if (error) {
      if (/itens_unico|duplicate/i.test(error.message)) {
        return res.status(409).json({ error: 'Já existe um item com esse tipo, nome e cor.' });
      }
      throw error;
    }
    audit(req, 'create', 'item', data.id, { kind: data.kind, name: data.name });
    res.status(201).json(data);
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

// ── Editar ───────────────────────────────────────────────────
router.put('/:id', async (req, res) => {
  const corpo = corpoDoItem(req.body || {});
  if (!corpo.name) return res.status(400).json({ error: 'Informe o nome do item.' });
  try {
    const foto = await processaFoto(req.body?.photo_url);
    const { data, error } = await supabase.from('ITENS')
      .update({
        ...corpo,
        ...(foto === undefined ? {} : { photo_url: foto }),
        updated_at: new Date().toISOString(),
      })
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).select().single();
    if (error) throw error;
    audit(req, 'update', 'item', req.params.id, { kind: data.kind, name: data.name });
    res.json(data);
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

// ── Apagar ───────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('ITENS')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    audit(req, 'delete', 'item', req.params.id, {});
    res.json({ ok: true });
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

// ════════════════════════════════════════════════════════════
// ONDE CADA ITEM SE APLICA — a edição em massa.
//
// Ligar um canudo a "todo Long Drink" é UMA linha, não vinte e quatro.
// Ligar a TODOS os personalizados é uma linha com os dois alvos nulos.
// É esta tabela que faz "adiciona em todos os copos" ser um clique em
// vez de uma tarde.
// ════════════════════════════════════════════════════════════

router.get('/aplicacoes', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ITEM_APLICACOES')
      .select('*, ITENS(id, kind, name, color_name, color_hex, photo_url, base_unit, unit_cost, unit_price, consumo)')
      .eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

/**
 * APLICAR EM MASSA.
 *
 * `alvo` diz onde:
 *   { escopo: 'todos' }                       todo produto personalizado
 *   { escopo: 'categoria', category_id }      a categoria inteira
 *   { escopo: 'produto',   product_id }       só aquele copo
 *
 * Repetir o mesmo alvo não duplica (o índice único cuida disso), então
 * clicar duas vezes é seguro — e é o que acontece quando a tela demora
 * a responder.
 */
router.post('/aplicacoes', async (req, res) => {
  const ids = Array.isArray(req.body?.item_ids) ? req.body.item_ids : [req.body?.item_id];
  const itens = ids.filter(Boolean);
  const escopo = req.body?.escopo || 'todos';
  const padrao = req.body?.padrao === true;
  const consumo = req.body?.consumo == null || req.body?.consumo === '' ? null : Number(req.body.consumo);

  if (!itens.length) return res.status(400).json({ error: 'Escolha ao menos um item.' });
  if (escopo === 'categoria' && !req.body?.category_id) {
    return res.status(400).json({ error: 'Escolha a categoria.' });
  }
  if (escopo === 'produto' && !req.body?.product_id) {
    return res.status(400).json({ error: 'Escolha o produto.' });
  }

  const linhas = itens.map(item_id => ({
    tenant_id:   req.tenantId,
    item_id,
    category_id: escopo === 'categoria' ? req.body.category_id : null,
    product_id:  escopo === 'produto'   ? req.body.product_id  : null,
    padrao,
    consumo,
  }));

  try {
    const { data, error } = await supabase.from('ITEM_APLICACOES')
      .upsert(linhas, { onConflict: 'tenant_id,item_id,category_id,product_id' })
      .select();
    if (error) throw error;
    audit(req, 'create', 'item-aplicacao', escopo, { itens: itens.length, escopo });
    res.status(201).json({ ok: true, aplicados: data?.length || linhas.length });
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

router.delete('/aplicacoes/:id', async (req, res) => {
  try {
    const { error } = await supabase.from('ITEM_APLICACOES')
      .delete().eq('id', req.params.id).eq('tenant_id', req.tenantId);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

/**
 * OS ADICIONAIS DE UM PRODUTO — o que a tela de venda e o catálogo leem.
 *
 * Junta as três camadas na ordem em que elas mandam: o curinga (vale
 * para todos), a categoria, e o produto. O mais específico ganha — é
 * como se abre exceção sem reescrever a regra da categoria inteira.
 */
router.get('/do-produto/:productId', async (req, res) => {
  try {
    const { data: prod } = await supabase.from('PRODUTOS')
      .select('id, category_id').eq('id', req.params.productId).eq('tenant_id', req.tenantId).maybeSingle();
    if (!prod) return res.status(404).json({ error: 'Produto não encontrado' });

    const { data, error } = await supabase.from('ITEM_APLICACOES')
      .select('*, ITENS(*)')
      .eq('tenant_id', req.tenantId)
      .or(`product_id.eq.${prod.id},category_id.eq.${prod.category_id},and(product_id.is.null,category_id.is.null)`);
    if (error) throw error;

    // O mais específico vence: produto > categoria > curinga.
    const peso = a => (a.product_id ? 3 : a.category_id ? 2 : 1);
    const porItem = new Map();
    for (const a of data || []) {
      const atual = porItem.get(a.item_id);
      if (!atual || peso(a) > peso(atual)) porItem.set(a.item_id, a);
    }

    res.json([...porItem.values()]
      .filter(a => a.ITENS && a.ITENS.is_active)
      .map(a => {
        const consumo = Number(a.consumo ?? a.ITENS.consumo) || 1;
        return {
          aplicacao_id: a.id,
          padrao: a.padrao,
          origem: a.product_id ? 'produto' : a.category_id ? 'categoria' : 'todos',
          consumo,
          item: a.ITENS,
          custo: n6(Number(a.ITENS.unit_cost) * consumo),
          preco: n6(Number(a.ITENS.unit_price) * consumo),
        };
      }));
  } catch (err) {
    if (faltaMigracao(res, err)) return;
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
