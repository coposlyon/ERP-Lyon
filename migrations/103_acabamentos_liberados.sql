-- ============================================================
-- 103. OS ACABAMENTOS ENTRAM NO AR.
--
-- Degradê, Bicolor, Jateado, Preto Fosco, Borda Metalizada e
-- Degradê + Borda passam a valer para TODAS as categorias do catálogo.
--
-- O QUE ESTAVA ACONTECENDO. Os catorze acabamentos existiam no cadastro
-- e nenhum deles estava ligado em categoria nenhuma — só "Tradicional".
-- O configurador oferecia uma opção só, e a fábrica faz seis. Não era
-- decisão de ninguém: era a matriz de compatibilidade nascendo vazia e
-- não tendo tela para preencher até agora.
--
-- POR NOME, E NÃO POR id. Os ids de CONFIG_ACABAMENTOS são gerados por
-- empresa; escrever um uuid aqui amarraria a migração a este banco. O
-- nome é o que a fábrica usa e é único por empresa (constraint
-- `UNIQUE (tenant_id, name)` da migração 074).
--
-- LIGADO É UMA LINHA; DESLIGADO É A AUSÊNCIA DELA. Por isso o INSERT só
-- cria o que falta e nada é gravado como `permitido = false` — é a
-- mesma regra que a tela "Catálogo da categoria" usa para ler e
-- escrever. Desligar depois é desmarcar por lá.
--
-- ISTO NÃO É IRREVERSÍVEL: desmarcar o acabamento na tela da categoria
-- apaga a linha e devolve tudo como estava.
--
-- O QUE NÃO MUDA AINDA: "Degradê + Borda" tem "+" no nome, e o catálogo
-- esconde de propósito os acabamentos combinados com borda (a borda
-- virou adicional, escolhida à parte). A linha entra aqui para o dia em
-- que a tela de acabamentos existir; até lá ele fica ligado e invisível.
-- ============================================================

INSERT INTO "PRODUTO_COMPATIBILIDADE" (tenant_id, category_id, product_id, tipo, ref_id, permitido)
SELECT c.tenant_id, c.id, NULL, 'acabamento', a.id, TRUE
  FROM "CATEGORIAS" c
  JOIN "CONFIG_ACABAMENTOS" a
    ON a.tenant_id = c.tenant_id
   AND a.is_active
   AND a.name IN ('Degradê', 'Bicolor', 'Jateado', 'Preto Fosco',
                  'Borda Metalizada', 'Degradê + Borda')
 WHERE EXISTS (
         -- Só categoria que tem produto publicado: ligar acabamento em
         -- categoria vazia enche a matriz de regra que ninguém lê.
         SELECT 1 FROM "PRODUTOS" p
          WHERE p.category_id = c.id AND p.tenant_id = c.tenant_id AND p.is_active
       )
   AND NOT EXISTS (
         SELECT 1 FROM "PRODUTO_COMPATIBILIDADE" x
          WHERE x.tenant_id = c.tenant_id AND x.category_id = c.id
            AND x.tipo = 'acabamento' AND x.ref_id = a.id
       );

NOTIFY pgrst, 'reload schema';

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('103', 'acabamentos_liberados')
ON CONFLICT (version) DO NOTHING;
