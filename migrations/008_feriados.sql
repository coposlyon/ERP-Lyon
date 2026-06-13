-- ============================================================
-- 008. FERIADOS — calendário de feriados
--      Dias marcados aqui não contam como falta no ponto
--      (viram situação "Feriado"). Seed dos feriados nacionais
--      de 2026; estaduais/municipais podem ser adicionados na tela.
-- ============================================================
CREATE TABLE IF NOT EXISTS "FERIADOS" (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID NOT NULL,
  date       DATE NOT NULL,
  name       TEXT NOT NULL,
  type       TEXT DEFAULT 'nacional',  -- nacional | estadual | municipal | facultativo
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS feriados_tenant_date_idx ON "FERIADOS" (tenant_id, date);

INSERT INTO "FERIADOS" (tenant_id, date, name, type) VALUES
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-01-01', 'Confraternização Universal', 'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-02-16', 'Carnaval',                   'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-02-17', 'Carnaval',                   'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-04-03', 'Sexta-feira Santa',          'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-04-21', 'Tiradentes',                 'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-05-01', 'Dia do Trabalho',            'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-06-04', 'Corpus Christi',             'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-09-07', 'Independência do Brasil',    'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-10-12', 'Nossa Senhora Aparecida',    'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-11-02', 'Finados',                    'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-11-15', 'Proclamação da República',   'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-11-20', 'Consciência Negra',          'nacional'),
  ('a1b2c3d4-e5f6-7890-abcd-ef1234567890', '2026-12-25', 'Natal',                      'nacional')
ON CONFLICT (tenant_id, date) DO NOTHING;

INSERT INTO "_MIGRATIONS" (version, name) VALUES ('008', 'feriados')
ON CONFLICT (version) DO NOTHING;
