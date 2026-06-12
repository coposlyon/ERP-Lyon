-- Tabela de controle de migrações — rode este arquivo primeiro (uma vez).
CREATE TABLE IF NOT EXISTS "_MIGRATIONS" (
  version    TEXT PRIMARY KEY,
  name       TEXT,
  applied_at TIMESTAMPTZ DEFAULT now()
);
