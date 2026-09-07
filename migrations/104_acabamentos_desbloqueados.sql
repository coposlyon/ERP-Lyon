-- ============================================================
-- 104. OS SEIS ACABAMENTOS DEIXAM DE ESTAR BLOQUEADOS.
--
-- A 103 inseriu o que faltava e não tocou no que já existia — foi
-- conservadora de propósito, para não passar por cima de decisão de
-- ninguém. Só que o que já existia eram OITENTA E QUATRO linhas com
-- `permitido = FALSE`: Degradê, Bicolor, Jateado, Preto Fosco e as
-- combinações com borda estavam explicitamente FECHADAS nas sete
-- categorias, e por isso a 103 entrou só na Caneca Slim Degradê, que
-- era a única sem nenhuma linha.
--
-- ESSES "NÃO" NUNCA FORAM DECIDIDOS POR NINGUÉM. A tela "Catálogo da
-- categoria" não sabe gravar `false` — ela grava o ligado e apaga o
-- resto ("ligado é ligado, desligado é a ausência de regra"). A ficha
-- do produto grava bloqueio, mas por PRODUTO, nunca por categoria.
-- Sobra a carga inicial do cadastro, que nasceu fechando tudo.
--
-- Aqui os seis que a fábrica faz passam a TRUE. Os outros bloqueios
-- ficam de pé: Tricolor, Efeito Gelo e as combinações que não foram
-- pedidas continuam fechados, e continuam sendo uma linha só para
-- desmarcar no dia em que entrarem.
--
-- PARA DESFAZER: desmarque o acabamento em Produtos → abrir o modelo →
-- "Catálogo da categoria" → Acabamentos. A tela apaga a linha, que é o
-- mesmo que fechar.
-- ============================================================

UPDATE "PRODUTO_COMPATIBILIDADE" x
   SET permitido = TRUE
  FROM "CONFIG_ACABAMENTOS" a
 WHERE a.id = x.ref_id
   AND a.tenant_id = x.tenant_id
   AND x.tipo = 'acabamento'
   AND x.category_id IS NOT NULL
   AND x.permitido = FALSE
   AND a.name IN ('Degradê', 'Bicolor', 'Jateado', 'Preto Fosco',
                  'Borda Metalizada', 'Degradê + Borda');

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('104', 'acabamentos_desbloqueados')
ON CONFLICT (version) DO NOTHING;
