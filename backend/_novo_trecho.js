// ============================================================
// EDITAR OS ITENS DE UM PEDIDO JÁ FECHADO.
//
// O caso real: a cliente fechou 100 copos e ligou pedindo mais 20. Sem
// isto, a saída era cancelar e refazer — outro número de pedido, outro
// PV mandado para ela, e a produção já andada perdida no caminho.
//
// EDITA POR DIFERENÇA, NÃO POR SUBSTITUIÇÃO. A tela manda o que MUDOU
// (esta linha vai para 120, esta sai, esta entra) — não a lista inteira
// de volta. Parece um detalhe e não é: a personalização de cada item
// (borda, cor, o id da arte que a cliente montou) nunca é exposta à
// tela, e mandar a lista inteira de volta significaria a tela devolver
// um campo que não recebeu. Na primeira edição de quantidade, a arte de
// todo mundo virava null.
//
// TRÊS REGRAS, e as três existem porque isto mexe em dinheiro.
//
// 1. PEDE SENHA. Não a sessão aberta: a senha, na hora. Editar pedido
//    fechado muda o quanto o cliente deve, e é a mesma trava que já
//    guarda a exclusão e a troca de arte.
//
// 2. A DIFERENÇA VIRA COBRANÇA, e só a diferença. Os 20 copos a mais
//    não refazem a cobrança de 120: entra um lançamento novo com o que
//    falta. Refazer a cobrança inteira quebraria as parcelas já pagas e
//    a conciliação do que caiu no banco.
//
// 3. O HISTÓRICO GUARDA O ANTES E O DEPOIS — quem editou, quando, o
//    total de antes, o de agora e a diferença. Pedido que muda de valor
//    sem deixar rastro é o que ninguém consegue explicar no fim do mês.
//
// NÃO ENCOLHE ABAIXO DO QUE JÁ FOI PAGO. Tirar item é legítimo, mas se
// o novo total ficar menor que o valor já recebido, isso é devolução —
// e devolução tem tela própria, com motivo e nota. Aqui viraria um
// saldo negativo escondido dentro de um pedido.
// ============================================================
router.patch('/:id/itens', async (req, res) => {
  const alteracoes = Array.isArray(req.body?.alteracoes) ? req.body.alteracoes : [];
  const remover    = Array.isArray(req.body?.remover)    ? req.body.remover    : [];
  const novos      = Array.isArray(req.body?.novos)      ? req.body.novos      : [];

  if (!alteracoes.length && !remover.length && !novos.length) {
    return res.status(400).json({ error: 'Nada foi alterado no pedido.' });
  }

  try {
    const aut = await autorizar(
      String(req.body?.autorizador_email || '').trim().toLowerCase(),
      String(req.body?.autorizador_senha || ''),
      req.tenantId,
    );
    if (!aut.ok) {
      return res.status(aut.status).json({
        error: aut.motivo, code: 'AUTORIZACAO_NECESSARIA',
        dica: 'Editar um pedido fechado muda o valor que o cliente deve — por isso pede a senha.',
      });
    }

    const { data: venda } = await supabase.from('VENDAS')
      .select('id, number, status, customer_id, subtotal, discount, freight, total, production_log')
      .eq('id', req.params.id).eq('tenant_id', req.tenantId).maybeSingle();
    if (!venda) return res.status(404).json({ error: 'Pedido não encontrado' });

    const { data: atuais } = await supabase.from('VENDA_ITENS')
      .select('id, product_id, product_name, quantity, unit_price, discount, total')
      .eq('sale_id', venda.id);
    const porItem = Object.fromEntries((atuais || []).map(i => [i.id, i]));

    // Os ids têm de ser DESTE pedido. Vêm da tela, e tela manda o que
    // mandarem para ela — sem esta linha, o id de um item de outro
    // pedido (ou de outra empresa) entraria na conta.
    const tocados = [...alteracoes.map(a => a.item_id), ...remover];
    if (tocados.some(id => !porItem[id])) {
      return res.status(400).json({ error: 'Um dos itens não pertence a este pedido.' });
    }
    if (remover.length && remover.length >= (atuais || []).length && !novos.length) {
      return res.status(400).json({ error: 'O pedido não pode ficar sem itens. Para cancelá-lo, use Excluir.' });
    }

    // E os produtos novos têm de ser desta empresa.
    const idsNovos = [...new Set(novos.map(n => n.product_id).filter(Boolean))];
    let porProduto = {};
    if (idsNovos.length) {
      const { data: prods } = await supabase.from('PRODUTOS')
        .select('id, name, sale_price').eq('tenant_id', req.tenantId).in('id', idsNovos);
      porProduto = Object.fromEntries((prods || []).map(p => [p.id, p]));
      if (idsNovos.some(id => !porProduto[id])) {
        return res.status(400).json({ error: 'Um dos produtos não é desta empresa.' });
      }
    }

    const totalAntes = Number(venda.total) || 0;
    const registro = [];   // o que contar no histórico

    // ── 1. Quantidades ───────────────────────────────────────
    for (const alt of alteracoes) {
      const item = porItem[alt.item_id];
      const qtd = Math.max(0, Number(alt.quantity) || 0);
      if (!qtd) return res.status(400).json({ error: 'Quantidade tem de ser maior que zero. Para tirar o item, remova-o.' });
      if (qtd === Number(item.quantity)) continue;
      const desc = Number(item.discount) || 0;
      const novoTotalItem = Math.max(0, qtd * Number(item.unit_price) - desc);
      const { error } = await supabase.from('VENDA_ITENS')
        .update({ quantity: qtd, total: novoTotalItem }).eq('id', item.id).eq('sale_id', venda.id);
      if (error) throw error;
      registro.push({ o_que: 'quantidade', produto: item.product_name,
        de: Number(item.quantity), para: qtd });
    }

    // ── 2. Remoções ──────────────────────────────────────────
    if (remover.length) {
      const { error } = await supabase.from('VENDA_ITENS')
        .delete().in('id', remover).eq('sale_id', venda.id);
      if (error) throw error;
      for (const id of remover) registro.push({ o_que: 'removido', produto: porItem[id].product_name,
        de: Number(porItem[id].quantity), para: 0 });
    }

    // ── 3. Itens novos ───────────────────────────────────────
    if (novos.length) {
      const linhas = novos.map(n => {
        const p = porProduto[n.product_id];
        const qtd = Math.max(0, Number(n.quantity) || 0);
        // Preço em branco cai no preço de tabela do produto: quem
        // acrescenta 20 copos no telefone não deveria ter de lembrar
        // quanto custa cada um.
        const unit = n.unit_price != null && n.unit_price !== ''
          ? Math.max(0, Number(n.unit_price) || 0)
          : (Number(p.sale_price) || 0);
        return {
          sale_id: venda.id, product_id: n.product_id, product_name: p.name,
          quantity: qtd, unit_price: unit, discount: 0,
          total: Math.max(0, qtd * unit),
          customization: n.customization || null,
        };
      }).filter(l => l.quantity > 0);
      if (linhas.length) {
        const { error } = await supabase.from('VENDA_ITENS').insert(linhas);
        if (error) throw error;
        for (const l of linhas) registro.push({ o_que: 'acrescentado', produto: l.product_name,
          de: 0, para: l.quantity });
      }
    }

    if (!registro.length) return res.status(400).json({ error: 'Nada mudou no pedido.' });

    // ── O total, recontado do banco ──────────────────────────
    // Do banco, e não somando o delta em cima do total antigo: se algum
    // dos passos acima falhou pela metade, é o que está gravado que vale
    // — a conta tem de bater com as linhas que existem, não com as que
    // eu esperava ter escrito.
    const { data: depois } = await supabase.from('VENDA_ITENS')
      .select(
