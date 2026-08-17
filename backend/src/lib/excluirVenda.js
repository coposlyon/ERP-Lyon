// ============================================================
// Exclusão de pedido de venda.
//
// Duas coisas moram aqui porque as duas telas precisam delas: quem pode
// autorizar, e o que precisa ser desfeito junto.
//
// QUEM AUTORIZA. O administrativo apaga com a própria senha. O vendedor
// não apaga sozinho — ele chama o gerente, que digita o e-mail e a senha
// DELE ali na hora. Fica na auditoria quem autorizou, e não só quem
// clicou: é a diferença entre saber que o pedido sumiu e saber quem
// mandou sumir.
//
// O QUE SE DESFAZ. Apagar a venda sem devolver o estoque deixa a
// prateleira mentindo — a função criar_venda baixou as unidades, e
// apagar a movimentação não repõe nada. Aqui o estoque volta antes de a
// movimentação ser apagada, na quantidade que de fato saiu.
// ============================================================
const supabase = require('../config/supabase');
const { makeClient } = require('../config/supabase');
const { audit } = require('../lib/audit');
const { recomputeRating } = require('../lib/customerRating');

/**
 * Confere a senha de quem está autorizando.
 *
 * @param email  quem autoriza (o próprio admin, ou o gerente chamado)
 * @param senha
 * @param tenantId
 * @returns { ok, motivo, status, usuario }
 */
async function autorizar(email, senha, tenantId) {
  if (!senha) return { ok: false, status: 400, motivo: 'Digite a senha para confirmar.' };
  if (!email) return { ok: false, status: 400, motivo: 'Informe o e-mail de quem está autorizando.' };

  // Quem autoriza tem que ser gestor DESTA empresa. A checagem vem antes
  // da senha para não transformar o campo num testador de credenciais.
  const { data: usuario } = await supabase.from('USUARIOS')
    .select('id, name, email, role, is_active')
    .eq('tenant_id', tenantId).eq('email', email).maybeSingle();

  if (!usuario || !usuario.is_active || !['admin', 'manager'].includes(usuario.role)) {
    return { ok: false, status: 403, motivo: 'Só um gerente ou administrador pode autorizar a exclusão.' };
  }

  // Reautentica de verdade: senha correta é a prova de que a pessoa
  // está ali, e não que alguém pegou a tela destravada.
  const client = makeClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
  const { error } = await client.auth.signInWithPassword({ email, password: senha });
  if (error) {
    const senhaRuim = error.status === 400 || /invalid|credential|password|senha/i.test(error.message || '');
    return senhaRuim
      ? { ok: false, status: 403, motivo: 'Senha incorreta.' }
      : { ok: false, status: 502, motivo: `Não foi possível confirmar a senha: ${error.message}` };
  }

  return { ok: true, usuario };
}

/**
 * Devolve ao estoque o que este pedido tirou.
 *
 * A fonte é MOVIMENTACOES_ESTOQUE, e não os itens do pedido: ela é o
 * registro do que REALMENTE saiu. Pedido lançado pelo caminho legado
 * (sem baixa) não tem movimentação, e então não há o que devolver —
 * somar pelos itens nesse caso criaria estoque do nada.
 */
async function devolverEstoque(tenantId, saleId) {
  const { data: movs } = await supabase.from('MOVIMENTACOES_ESTOQUE')
    .select('product_id, quantity, type')
    .eq('tenant_id', tenantId).eq('reference_type', 'sale').eq('reference_id', saleId);

  if (!movs?.length) return { devolvidos: 0 };

  // Um produto pode aparecer em mais de uma linha; soma antes de gravar
  // para não fazer duas idas ao banco pelo mesmo item.
  const porProduto = new Map();
  for (const m of movs) {
    if (m.type !== 'exit' || !m.product_id) continue;
    porProduto.set(m.product_id, (porProduto.get(m.product_id) || 0) + (Number(m.quantity) || 0));
  }

  let devolvidos = 0;
  for (const [productId, qtd] of porProduto) {
    if (qtd <= 0) continue;
    const { data: prod } = await supabase.from('PRODUTOS')
      .select('current_stock').eq('id', productId).eq('tenant_id', tenantId).maybeSingle();
    if (!prod) continue;
    await supabase.from('PRODUTOS')
      .update({ current_stock: (Number(prod.current_stock) || 0) + qtd })
      .eq('id', productId).eq('tenant_id', tenantId);
    devolvidos++;
  }
  return { devolvidos };
}

/**
 * Apaga o pedido e tudo que dependia dele.
 *
 * @param req        para auditoria e tenant
 * @param saleId
 * @param autorizado o usuário que autorizou (de `autorizar`)
 * @param motivo     texto livre; fica na auditoria
 */
async function excluirVenda(req, saleId, autorizado, motivo) {
  const tenantId = req.tenantId;

  const { data: venda } = await supabase.from('VENDAS')
    .select('id, number, customer_id, total, status')
    .eq('id', saleId).eq('tenant_id', tenantId).maybeSingle();
  if (!venda) return { ok: false, status: 404, motivo: 'Pedido não encontrado.' };

  // Estoque volta ANTES de a movimentação sumir — depois dela apagada,
  // não há mais como saber quanto tinha saído.
  const { devolvidos } = await devolverEstoque(tenantId, saleId);

  const semExplodir = p => p.then(() => {}, () => {});
  await semExplodir(supabase.from('VENDA_ITENS').delete().eq('sale_id', saleId));
  await semExplodir(supabase.from('LANCAMENTOS').delete()
    .eq('tenant_id', tenantId).eq('reference_type', 'sale').eq('reference_id', saleId));
  await semExplodir(supabase.from('MOVIMENTACOES_ESTOQUE').delete()
    .eq('tenant_id', tenantId).eq('reference_type', 'sale').eq('reference_id', saleId));

  const { error } = await supabase.from('VENDAS').delete().eq('id', saleId).eq('tenant_id', tenantId);
  if (error) {
    if (/foreign key|violat|23503/i.test(error.message || '')) {
      return { ok: false, status: 409, motivo: 'Não foi possível excluir: o pedido tem registros vinculados.' };
    }
    throw error;
  }

  // Guarda o retrato do que foi apagado. Depois do delete não existe
  // mais nada para consultar — se não ficar aqui, não fica em lugar
  // nenhum.
  audit(req, 'delete', 'sale', saleId, {
    numero: venda.number,
    total: venda.total,
    status_no_momento: venda.status,
    autorizado_por: autorizado?.email || null,
    autorizado_nome: autorizado?.name || null,
    motivo: motivo || null,
    produtos_com_estoque_devolvido: devolvidos,
  });

  if (venda.customer_id) recomputeRating(tenantId, venda.customer_id).catch(() => {});

  return {
    ok: true,
    numero: venda.number,
    estoque_devolvido: devolvidos,
    mensagem: `Pedido PV-${String(venda.number).padStart(4, '0')} excluído.`
      + (devolvidos ? ` Estoque devolvido em ${devolvidos} produto(s).` : ''),
  };
}

module.exports = { autorizar, excluirVenda, devolverEstoque };
