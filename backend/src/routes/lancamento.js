// ============================================================
// AS LISTAS QUE O LANÇAMENTO DE PRODUTO PRECISA LER.
//
// O QUE ESTAVA ERRADO. O modal "Lançamento de produto" do PDV lia as
// bordas em `/itens?kind=borda` e as tintas em `/settings/tintas`. As
// duas rotas são de CADASTRO — `/itens` pede financial, products,
// settings ou production; `/settings` pede settings. O setor Vendas tem
// dashboard, vendedor, sales e pdv, e nenhum dos dois.
//
// Resultado: para o vendedor as duas chamadas voltavam 403, o
// `useQuery` ficava com o array vazio do padrão e os dois seletores
// abriam mostrando só "Selecione a borda…" e "Selecione a tinta…". Sem
// erro na tela, sem lista, e o vendedor sem conseguir fechar um copo
// personalizado — que é o produto da casa.
//
// POR QUE UMA ROTA NOVA, E NÃO ABRIR AS OUTRAS. `/itens` e `/settings`
// têm POST, PUT e DELETE: liberar o módulo para quem vende daria de
// brinde apagar borda e reescrever configuração da empresa. Aqui só se
// LÊ, e só as três listas de que o lançamento precisa — é a mesma ideia
// de `/products`, que já aceita quem vende porque vender exige ler o
// catálogo.
//
// CADASTRAR CONTINUA SENDO DE QUEM CADASTRA. Os botõezinhos "+" do
// modal seguem batendo em `/settings/*`; a tela esconde-os de quem não
// tem o módulo, em vez de oferecer um botão que responde 403.
// ============================================================
const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');

/**
 * As bordas, do cadastro de Itens.
 *
 * Devolve o mínimo que o seletor usa. A borda tem custo, preço, consumo
 * e foto no cadastro — nada disso é assunto de quem está escolhendo a
 * cor com o cliente no telefone, e margem não desce para tela de venda.
 */
router.get('/bordas', async (req, res) => {
  try {
    const { data, error } = await supabase.from('ITENS')
      .select('id, name, color_name')
      .eq('tenant_id', req.tenantId).eq('kind', 'borda').eq('is_active', true)
      .order('seq').order('name');
    if (error) throw error;
    res.json(data || []);
  } catch (err) {
    // Tabela ainda não migrada não é erro de tela: o seletor fica vazio
    // como ficaria se ninguém tivesse cadastrado borda nenhuma.
    if (/does not exist|schema cache/i.test(err.message || '')) return res.json([]);
    res.status(500).json({ error: err.message });
  }
});

/** As tintas cadastradas, com o valor por ML — o lançamento usa os dois. */
router.get('/tintas', async (req, res) => {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    const lista = data?.settings?.tintas;
    res.json(Array.isArray(lista) ? lista : []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

/** O catálogo de cores por acabamento, cadastrado pelo "+" do modal. */
router.get('/acabamentos', async (req, res) => {
  try {
    const { data } = await supabase.from('EMPRESAS').select('settings').eq('id', req.tenantId).maybeSingle();
    res.json(data?.settings?.acabamentos_catalog || {});
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
