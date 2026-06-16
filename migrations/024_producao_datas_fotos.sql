-- ============================================================
-- 024. Produção: prazo máximo de entrega + fotos do produto +
--      data do evento informada pelo cliente no site
-- ============================================================
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS max_delivery_date DATE;
ALTER TABLE "VENDAS"     ADD COLUMN IF NOT EXISTS production_photos JSONB DEFAULT '[]'::jsonb;

ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS event_date        DATE;
ALTER TABLE "ORCAMENTOS" ADD COLUMN IF NOT EXISTS max_delivery_date DATE;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('024', 'producao_datas_fotos')
ON CONFLICT (version) DO NOTHING;
