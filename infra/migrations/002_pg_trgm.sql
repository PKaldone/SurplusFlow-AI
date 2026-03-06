-- 002_pg_trgm.sql — Enable fuzzy name matching for claimant lookup
BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_claimant_name_trgm
  ON claimants USING gin ((first_name || ' ' || last_name) gin_trgm_ops);

COMMIT;
