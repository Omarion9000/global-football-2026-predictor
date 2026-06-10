-- =============================================================================
-- 0001_init.sql
-- =============================================================================
-- Initial schema for World Cup 2026 Predictor.
--
-- Design rules from CLAUDE.md and docs/06_CLAUDE_CODE_RULES.md:
--   1. prediction_runs is append-only at the database level. Earlier runs are
--      preserved forever. There is no UPDATE-based workflow anywhere.
--   2. Scheduler retries are idempotent: a unique constraint on
--      (fixture_id, run_type, model_version, scheduled_for) means a re-run
--      at the same canonical lifecycle timestamp inserts the same row at most
--      once.
--   3. run_type values are exactly five: T_MINUS_3H | T_MINUS_1H | T_ZERO | HT
--      | FT. Enforced by CHECK constraints on prediction_runs.run_type and
--      model_runs.run_type.
--   4. Forward-only migrations: this file is never edited once any prediction
--      has been written. New migrations live in higher-numbered files.
--
-- Row-Level Security policies are intentionally NOT enabled in this migration.
-- They will be added in a separate migration alongside the Phase 5 scheduler
-- and the Phase 6 public UI. See docs/02_TECHNICAL_ARCHITECTURE.md §10.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. teams
-- -----------------------------------------------------------------------------
CREATE TABLE teams (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  code            text NOT NULL UNIQUE,
  region          text NOT NULL CHECK (region IN ('AFC', 'CAF', 'CONCACAF', 'CONMEBOL', 'OFC', 'UEFA')),
  is_host_nation  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE teams IS 'Canonical team identity. Real federation crests and photographs are not stored — see docs/04_DATA_AND_LEGAL_POLICY.md §3.1.';
COMMENT ON COLUMN teams.code IS 'Short 3-letter code, e.g. "AUR". Used for display and joins.';

-- -----------------------------------------------------------------------------
-- B. fixtures
-- -----------------------------------------------------------------------------
CREATE TABLE fixtures (
  id                       text PRIMARY KEY,
  team_a_id                text NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  team_b_id                text NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  kickoff_utc              timestamptz NOT NULL,
  stage                    text NOT NULL CHECK (stage IN ('GROUP', 'R16', 'QF', 'SF', 'F', 'THIRD_PLACE')),
  group_code               text,
  status                   text NOT NULL DEFAULT 'SCHEDULED'
                             CHECK (status IN ('SCHEDULED', 'PRE_MATCH', 'IN_PROGRESS', 'HALF_TIME', 'FULL_TIME', 'POSTPONED', 'CANCELLED')),
  venue_name               text NOT NULL,
  venue_city               text NOT NULL,
  venue_country            text NOT NULL,
  venue_altitude_meters    integer NOT NULL DEFAULT 0 CHECK (venue_altitude_meters >= 0),
  is_home_for_team_a       boolean NOT NULL DEFAULT false,
  is_home_for_team_b       boolean NOT NULL DEFAULT false,
  rest_days_team_a         integer NOT NULL DEFAULT 0 CHECK (rest_days_team_a >= 0),
  rest_days_team_b         integer NOT NULL DEFAULT 0 CHECK (rest_days_team_b >= 0),
  created_at               timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fixtures_distinct_teams CHECK (team_a_id <> team_b_id),
  CONSTRAINT fixtures_one_home_side  CHECK (NOT (is_home_for_team_a AND is_home_for_team_b))
);

CREATE INDEX fixtures_kickoff_utc_idx ON fixtures (kickoff_utc);
CREATE INDEX fixtures_status_idx      ON fixtures (status);

-- -----------------------------------------------------------------------------
-- C. team_stats_snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE team_stats_snapshots (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id                  text NOT NULL REFERENCES teams (id) ON DELETE RESTRICT,
  captured_at              timestamptz NOT NULL,
  source                   text NOT NULL DEFAULT 'mock',
  elo_rating               numeric NOT NULL CHECK (elo_rating > 0),
  recent_form_score        numeric CHECK (recent_form_score IS NULL OR recent_form_score >= 0),
  goals_for_per_match      numeric NOT NULL CHECK (goals_for_per_match >= 0),
  goals_against_per_match  numeric NOT NULL CHECK (goals_against_per_match >= 0),
  clean_sheet_rate         numeric CHECK (clean_sheet_rate IS NULL OR (clean_sheet_rate >= 0 AND clean_sheet_rate <= 1)),
  recent_matches           jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX team_stats_snapshots_team_captured_idx ON team_stats_snapshots (team_id, captured_at);

-- -----------------------------------------------------------------------------
-- D. data_snapshots
-- -----------------------------------------------------------------------------
CREATE TABLE data_snapshots (
  id              text PRIMARY KEY,
  fixture_id      text NOT NULL REFERENCES fixtures (id) ON DELETE RESTRICT,
  captured_at     timestamptz NOT NULL,
  source_ids      jsonb NOT NULL DEFAULT '[]'::jsonb,
  input_hash      text NOT NULL,
  payload         jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN data_snapshots.payload IS 'Optional snapshot of inputs. Internal only — not redistributed per docs/04 §4.5.';
CREATE INDEX data_snapshots_fixture_captured_idx ON data_snapshots (fixture_id, captured_at);

-- -----------------------------------------------------------------------------
-- E. prediction_runs (APPEND-ONLY)
-- -----------------------------------------------------------------------------
-- This is the spine of the product. Every prediction run inserts a new row.
-- Never UPDATE this table. The unique idempotency constraint below makes
-- scheduler retries safe — a re-run at the same canonical lifecycle timestamp
-- produces no extra rows.
CREATE TABLE prediction_runs (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id               text NOT NULL REFERENCES fixtures (id) ON DELETE RESTRICT,
  run_type                 text NOT NULL CHECK (run_type IN ('T_MINUS_3H', 'T_MINUS_1H', 'T_ZERO', 'HT', 'FT')),
  model_version            text NOT NULL,
  scheduled_for            timestamptz NOT NULL,
  executed_at              timestamptz NOT NULL,
  data_snapshot_id         text NOT NULL REFERENCES data_snapshots (id) ON DELETE RESTRICT,
  team_a_win_probability   numeric NOT NULL CHECK (team_a_win_probability >= 0 AND team_a_win_probability <= 1),
  draw_probability         numeric NOT NULL CHECK (draw_probability >= 0 AND draw_probability <= 1),
  team_b_win_probability   numeric NOT NULL CHECK (team_b_win_probability >= 0 AND team_b_win_probability <= 1),
  team_a_expected_goals    numeric NOT NULL CHECK (team_a_expected_goals >= 0),
  team_b_expected_goals    numeric NOT NULL CHECK (team_b_expected_goals >= 0),
  confidence_score         numeric NOT NULL CHECK (confidence_score >= 0 AND confidence_score <= 1),
  confidence_band          text NOT NULL CHECK (confidence_band IN ('LOW', 'MEDIUM', 'HIGH')),
  warnings                 jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now(),

  -- Marginals must sum to 1 within a small numerical tolerance.
  CONSTRAINT prediction_runs_marginals_sum_to_one CHECK (
    abs((team_a_win_probability + draw_probability + team_b_win_probability) - 1) < 0.001
  ),

  -- Idempotency / append-only key. Scheduler retries at the same canonical
  -- lifecycle timestamp are absorbed by this unique constraint.
  CONSTRAINT prediction_runs_idempotency UNIQUE (fixture_id, run_type, model_version, scheduled_for)
);

COMMENT ON TABLE prediction_runs IS 'Append-only prediction history. UPDATE is a bug; see CLAUDE.md rule 5 and docs/06_CLAUDE_CODE_RULES.md §2.';

CREATE INDEX prediction_runs_fixture_executed_idx ON prediction_runs (fixture_id, executed_at);

-- -----------------------------------------------------------------------------
-- F. prediction_scorelines
-- -----------------------------------------------------------------------------
CREATE TABLE prediction_scorelines (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_run_id   uuid NOT NULL REFERENCES prediction_runs (id) ON DELETE CASCADE,
  team_a_goals        integer NOT NULL CHECK (team_a_goals >= 0),
  team_b_goals        integer NOT NULL CHECK (team_b_goals >= 0),
  probability         numeric NOT NULL CHECK (probability >= 0 AND probability <= 1),
  rank                integer NOT NULL CHECK (rank >= 1),
  created_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT prediction_scorelines_unique_rank UNIQUE (prediction_run_id, rank),
  CONSTRAINT prediction_scorelines_unique_pair UNIQUE (prediction_run_id, team_a_goals, team_b_goals)
);

CREATE INDEX prediction_scorelines_run_rank_idx ON prediction_scorelines (prediction_run_id, rank);

-- -----------------------------------------------------------------------------
-- G. model_runs
-- -----------------------------------------------------------------------------
CREATE TABLE model_runs (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_run_id   uuid REFERENCES prediction_runs (id) ON DELETE SET NULL,
  fixture_id          text REFERENCES fixtures (id) ON DELETE SET NULL,
  run_type            text CHECK (run_type IS NULL OR run_type IN ('T_MINUS_3H', 'T_MINUS_1H', 'T_ZERO', 'HT', 'FT')),
  model_version       text NOT NULL,
  status              text NOT NULL CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED', 'SKIPPED')),
  started_at          timestamptz NOT NULL,
  finished_at         timestamptz,
  warnings            jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_code          text,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX model_runs_status_started_idx ON model_runs (status, started_at);

-- -----------------------------------------------------------------------------
-- H. match_results
-- -----------------------------------------------------------------------------
CREATE TABLE match_results (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fixture_id      text NOT NULL UNIQUE REFERENCES fixtures (id) ON DELETE RESTRICT,
  team_a_goals    integer NOT NULL CHECK (team_a_goals >= 0),
  team_b_goals    integer NOT NULL CHECK (team_b_goals >= 0),
  status          text NOT NULL CHECK (status IN ('FULL_TIME', 'EXTRA_TIME', 'PENALTIES', 'ABANDONED')),
  finished_at     timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- I. data_sources
-- -----------------------------------------------------------------------------
-- Canonical column set per docs/04_DATA_AND_LEGAL_POLICY.md §4.3. A row must
-- exist for every provider before any real-data adapter is integrated.
CREATE TABLE data_sources (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name           text NOT NULL,
  endpoint                text NOT NULL,
  data_type               text NOT NULL,
  license_terms_notes     text NOT NULL,
  attribution_required    boolean NOT NULL,
  attribution_string      text,
  allowed_usage           text NOT NULL,
  rate_limits             text,
  fetched_at              timestamptz,
  added_at                timestamptz NOT NULL DEFAULT now(),
  reviewed_at             timestamptz,

  CONSTRAINT data_sources_unique_provider_endpoint_type
    UNIQUE (provider_name, endpoint, data_type)
);

COMMENT ON TABLE data_sources IS 'Provider registry per docs/04 §4.3. No adapter is integrated without a row here. Attribution rendered from this table per docs/04 §6.';

-- =============================================================================
-- RLS placeholder notes
-- =============================================================================
-- Row-Level Security is intentionally NOT enabled in this migration. The
-- intended policies (added in a follow-up migration alongside the Phase 5
-- scheduler) are:
--
--   public_read_teams              :  SELECT on teams              for anon
--   public_read_fixtures           :  SELECT on fixtures           for anon
--   public_read_predictions        :  SELECT on prediction_runs    for anon
--   public_read_prediction_scores  :  SELECT on prediction_scorelines for anon
--   public_read_match_results      :  SELECT on match_results      for anon
--   public_read_data_sources       :  SELECT on data_sources       for anon
--
--   service_role_write_*           :  INSERT on the above (UPDATE/DELETE not
--                                    granted; append-only is enforced by both
--                                    application code AND the absence of
--                                    update grants).
--
-- See docs/02_TECHNICAL_ARCHITECTURE.md §10. Auth is intentionally minimal
-- until Phase 5/6 publish a public surface.
