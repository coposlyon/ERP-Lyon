# Migrações do Banco (Supabase)

Cada arquivo numerado é **idempotente** (pode rodar mais de uma vez sem
estragar nada) e registra a si mesmo na tabela `_MIGRATIONS` ao final.

## Como usar

1. Abra o **Supabase Dashboard → SQL Editor**
2. Rode o `000_controle.sql` (uma única vez, cria a tabela de controle)
3. Para saber o que já foi aplicado:
   ```sql
   SELECT * FROM "_MIGRATIONS" ORDER BY version;
   ```
4. Rode, **em ordem**, os arquivos que ainda não aparecem na consulta acima.

## Histórico

| Versão | Arquivo                      | Conteúdo |
|--------|------------------------------|----------|
| 001    | 001_clientes_produtos.sql    | Campos extras em CLIENTES/PRODUTOS, price_tiers, categorias |
| 002    | 002_rh_completo.sql          | Tabelas do RH: ponto, férias, folha, documentos, escalas, situações, marcações |
| 003    | 003_permissoes.sql           | allowed_modules em USUARIOS (controle de módulos) |
| 004    | 004_venda_transacional.sql   | Função criar_venda (venda atômica + preço no servidor) |
| 005    | 005_auditoria.sql            | Tabela AUDITORIA (trilha de quem alterou o quê) |

## Regras para novas migrações

- Sempre criar um novo arquivo `NNN_descricao.sql` (nunca editar antigos já aplicados)
- Usar `IF NOT EXISTS` / `CREATE OR REPLACE` / `ON CONFLICT DO NOTHING`
- Terminar com o INSERT na `_MIGRATIONS`
