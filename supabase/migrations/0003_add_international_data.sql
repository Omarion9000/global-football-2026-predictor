-- =============================================================================
-- 0003_add_international_data.sql
-- =============================================================================
-- Phase 9A — extend the schema to store national-team competitive matches
-- alongside the existing tournament-mock and Premier League data.
--
-- Idempotent: every statement is safe to re-run. DROP CONSTRAINT IF EXISTS
-- + ADD CONSTRAINT widens; ADD COLUMN IF NOT EXISTS is the standard idempotent
-- add. INSERT uses ON CONFLICT DO NOTHING.
--
-- Splitter notes (matching 0002): no semicolons inside any string literal,
-- no DO blocks. Parser at src/lib/data/postgres/migrationParser.ts splits on
-- a literal ; followed by EOL.
-- =============================================================================

-- (1) Drop the UNIQUE constraint on teams.code so 3-letter ISO 3166 alpha-3
--     codes for national teams (BEL, ETH, CHE, NOR, ...) can coexist with the
--     existing mock codes (Bellatrix:BEL, Etheria:ETH) and EPL TLAs
--     (Chelsea:CHE, Norwich:NOR). teams.id remains the canonical PK; code
--     becomes a display abbreviation that is not guaranteed unique across
--     team types.
ALTER TABLE teams DROP CONSTRAINT IF EXISTS teams_code_key;

-- (2) Widen fixtures.stage to permit INTERNATIONAL for national-team
--     competitive matches we ingest from the martj42 corpus.
ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS fixtures_stage_check;

ALTER TABLE fixtures
  ADD CONSTRAINT fixtures_stage_check
  CHECK (stage IN ('GROUP', 'R16', 'QF', 'SF', 'F', 'THIRD_PLACE', 'LEAGUE', 'INTERNATIONAL'));

COMMENT ON COLUMN fixtures.stage IS
  'Tournament stage (GROUP/R16/QF/SF/F/THIRD_PLACE), LEAGUE for continuous-season league competitions, or INTERNATIONAL for national-team competitive matches whose granular stage is not recorded in the source corpus.';

-- (3) Add the tournament-name column. NULLABLE — existing mock and EPL rows
--     get NULL and stay that way.
ALTER TABLE fixtures ADD COLUMN IF NOT EXISTS tournament text;

COMMENT ON COLUMN fixtures.tournament IS
  'Free-text competition name as carried by the source corpus (e.g. UEFA Euro qualification). NULL for mock and league rows that do not record this.';

-- (4) Register the martj42/international_results corpus as a data source.
INSERT INTO data_sources (
  provider_name,
  endpoint,
  data_type,
  license_terms_notes,
  attribution_required,
  attribution_string,
  allowed_usage,
  rate_limits
) VALUES (
  'martj42/international_results',
  'https://raw.githubusercontent.com/martj42/international_results/master/results.csv',
  'historical international match results',
  'CC0 1.0 Universal (Public Domain Dedication). No restrictions on use or redistribution. See https://creativecommons.org/publicdomain/zero/1.0/.',
  false,
  'Data: martj42/international_results (CC0)',
  'Personal research. No restrictions under CC0.',
  'GitHub raw content (no documented limit; treat as best-effort)'
)
ON CONFLICT (provider_name, endpoint, data_type) DO NOTHING;
