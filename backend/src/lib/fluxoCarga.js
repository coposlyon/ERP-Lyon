// ============================================================
// LER O PEDIDO PARA O MOTOR DE ETAPAS, E GRAVAR O PASSO DELE.
//
// As duas funções moravam dentro de `routes/sales.js`, privadas. Isso
// bastava enquanto só o pedido de venda mexia em etapa — e parou de
// bastar quando a arte passou a mover o pedido de três lugares: a tela
// do vendedor, o portal do cliente e a própria criação da venda.
//
// A alternativa era cada rota montar o seu próprio `select` e o seu
// próprio update. Já tinha começado a acontecer: a rota de anexo do
// vendedor gravava `status: 'aguardando_vegetal'` escrito à mão, o que
// está certo para um copo com serigrafia e errado para um liso, que não
// passa por vegetal nenhum. Uma cópia da regra é uma cópia para
// divergir.
// ============================================================
const supabase = require('../config/supabase');
const { caracteristicasDoItem, etapasDosItens, resumoDaArte } = require('./itensPedido');
const C = require('./comprovante');

const CAMPOS_FLUXO = `
  id, number, status, total, production_log, delivery_mode, notes, created_at,
  artwork_url, art_file, receipt_url, production_photos, carrier_id, tracking_code,
  VENDA_ITENS ( id, product_name, quantity, unit_price, discount, total, customization,
                PRODUTOS ( id, code, name, unit, ink_type ) )
`;

async function carregarParaFluxo(tenantId, id) {
  let { data, error } = await supabase.from('VENDAS').select(CAMPOS_FLUXO)
    .eq('id', id).eq('tenant_id', tenantId).maybeSingle();

  // Base sem as colunas mais novas: o pedido tem que abrir do mesmo
  // jeito — o fluxo só fica sem os requisitos que dependem delas.
  if (error && /column|does not exist|schema cache/i.test(error.message || '')) {
    const basico = CAMPOS_FLUXO.replace(', delivery_mode', '').replace(', tracking_code', '');
    ({ data, error } = await supabase.from('VENDAS').select(basico)
      .eq('id', id).eq('tenant_id', tenantId).maybeSingle());
  }
  if (error) throw error;
  if (!data) return null;

  const itens = (data.VENDA_ITENS || []).map(i => caracteristicasDoItem(i));

  // OS COMPROVANTES ENTRAM NA FICHA porque agora sao eles que liberam a
  // etapa de pagamento. Uma consulta a mais por leitura do fluxo — que
  // e a tela de UM pedido, aberta por uma pessoa de cada vez.
  const comprovante_quitado = await C.estaQuitada(tenantId, data);

  // A ARTE ENTRA NA FICHA porque a etapa dela deixou de ser "existe
  // arquivo": a arte que a LOJA manda ainda precisa do sim do cliente,
  // e a que ele reprovou não pode virar tela. Quem responde isso é o
  // conjunto dos itens, não a coluna `artwork_url` da venda.
  const arte_resumo = resumoDaArte(itens);

  return {
    venda: { ...data, itens_qtd: itens.length, comprovante_quitado, arte_resumo },
    aplicaveis: etapasDosItens(itens),
  };
}

/**
 * Grava o resultado de um passo do motor.
 *
 * O `production_log` veio numa migração mais nova que a tabela. Se ele
 * não existir, o status muda mesmo assim — perder o histórico é ruim,
 * travar a fábrica é pior.
 */
async function gravarPasso(tenantId, id, passo) {
  let { data, error } = await supabase.from('VENDAS')
    .update({ status: passo.status, production_log: passo.log })
    .eq('id', id).eq('tenant_id', tenantId).select('id, number, status').single();

  if (error && /production_log|column|does not exist/i.test(error.message || '')) {
    ({ data, error } = await supabase.from('VENDAS')
      .update({ status: passo.status })
      .eq('id', id).eq('tenant_id', tenantId).select('id, number, status').single());
  }
  if (error) throw error;
  return data;
}

module.exports = { CAMPOS_FLUXO, carregarParaFluxo, gravarPasso };
