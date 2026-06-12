-- =============================================================================
-- 0002_add_league_stage.sql
-- =============================================================================
-- Phase 8D — widen fixtures.stage to permit league-format matches and register
-- the football-data.org adapter in data_sources.
--
-- Idempotent: every statement is safe to re-run against a database where this
-- migration is already applied. No row is destroyed, no in-place column is
-- rewritten.
--
-- Constraint-name note: the 0001 schema declares fixtures.stage with an
-- inline, unnamed column-level CHECK. PostgreSQL auto-names such a CHECK as
-- <table>_<column>_check, so the constraint we are replacing is
-- fixtures_stage_check.
--
-- Migration runner note: the naive splitter at
-- src/lib/data/postgres/migrationParser.ts segments statements on a literal
-- ";" followed by end-of-line. No SQL string literal in this file contains a
-- semicolon. No PL/pgSQL DO blocks are used.
-- =============================================================================

-- (1) Widen the stage CHECK to permit LEAGUE.
ALTER TABLE fixtures DROP CONSTRAINT IF EXISTS fixtures_stage_check;

ALTER TABLE fixtures
  ADD CONSTRAINT fixtures_stage_check
  CHECK (stage IN ('GROUP', 'R16', 'QF', 'SF', 'F', 'THIRD_PLACE', 'LEAGUE'));

COMMENT ON COLUMN fixtures.stage IS
  'Tournament stage (GROUP/R16/QF/SF/F/THIRD_PLACE) or LEAGUE for continuous-season competitions such as the Premier League. For LEAGUE rows, group_code is NULL.';

-- (2) Register the football-data.org adapter exactly once. The UNIQUE
--     constraint on (provider_name, endpoint, data_type) makes the insert
--     a no-op on every subsequent run.
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
  'football-data.org',
  'https://api.football-data.org/v4/competitions/PL/matches',
  'fixtures+results',
  'Free tier covers Premier League competition matches for personal and research use. Commercial redistribution requires an upgraded plan. See https://www.football-data.org/pricing.',
  true,
  'Data: football-data.org (free tier)',
  'Personal research only. Raw API responses are not redistributed. Public-facing usage is aggregate-only and never names real clubs in the deployed product.',
  '10 requests/minute (free tier)'
)
ON CONFLICT (provider_name, endpoint, data_type) DO NOTHING;
