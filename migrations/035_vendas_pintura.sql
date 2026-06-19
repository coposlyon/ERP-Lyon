-- 035: etapa de Pintura na produção (timestamps de início/fim)
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS pintura_inicio timestamptz;
ALTER TABLE "VENDAS" ADD COLUMN IF NOT EXISTS pintura_fim    timestamptz;
