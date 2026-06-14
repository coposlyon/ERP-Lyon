-- ============================================================
-- 014. PIX — dados da cobrança PIX nos lançamentos
-- ============================================================
ALTER TABLE "LANCAMENTOS"
  ADD COLUMN IF NOT EXISTS gateway_payment_id TEXT,
  ADD COLUMN IF NOT EXISTS pix_qr            TEXT,
  ADD COLUMN IF NOT EXISTS pix_copy_paste    TEXT;

CREATE INDEX IF NOT EXISTS lancamentos_gateway_idx ON "LANCAMENTOS" (gateway_payment_id);

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('014', 'pix')
ON CONFLICT (version) DO NOTHING;
