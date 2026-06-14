-- ============================================================
-- 011. RLS — Row Level Security (defesa em profundidade)
--      O backend usa a service_role key (que tem BYPASSRLS),
--      então NADA muda para a aplicação. Mas com RLS ligada e
--      sem políticas, o acesso direto via anon/authenticated key
--      (PostgREST público) fica BLOQUEADO. Se a anon key vazar,
--      os dados continuam protegidos.
-- ============================================================
DO $$
DECLARE
  t TEXT;
  tabelas TEXT[] := ARRAY[
    'CLIENTES','PRODUTOS','FORNECEDORES','USUARIOS','EMPRESAS','CATEGORIAS',
    'VENDAS','VENDA_ITENS','COMPRAS','COMPRA_ITENS','MOVIMENTACOES_ESTOQUE',
    'LANCAMENTOS','ORCAMENTOS','ORCAMENTO_ITENS','PERSONALIZACOES','PERSONALIZACAO_HISTORICO',
    'NOTAS_FISCAIS','CONFIG_FISCAL','ESCALAS','SITUACOES','RH_PONTO','RH_MARCACOES',
    'RH_FERIAS','RH_SALARIOS','RH_DOCUMENTOS','FERIADOS','AUDITORIA',
    'PLANO_CONTAS','CENTROS_CUSTO','CONTAS_BANCARIAS','VARIANTES_PRODUTO','PEDIDOS_REPOSICAO'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas LOOP
    IF to_regclass('public.' || quote_ident(t)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('011', 'rls')
ON CONFLICT (version) DO NOTHING;
