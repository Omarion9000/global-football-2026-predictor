// Row shapes mirroring supabase/migrations/0001_init.sql. Column names use
// snake_case to match the database; mappers in ./mappers convert to/from
// camelCase domain types.
//
// "...Insert" variants exclude server-defaulted columns (id when generated,
// created_at) so the persistence layer can accept partial payloads from
// callers and let the database fill the rest.

import type { Region } from '@/lib/types';

// --- A. teams ----------------------------------------------------------------
export type TeamRow = {
  id: string;
  name: string;
  code: string;
  region: Region;
  is_host_nation: boolean;
  created_at: string;
};
export type TeamInsert = Omit<TeamRow, 'created_at'>;

// --- B. fixtures -------------------------------------------------------------
export type FixtureStatusRow =
  | 'SCHEDULED'
  | 'PRE_MATCH'
  | 'IN_PROGRESS'
  | 'HALF_TIME'
  | 'FULL_TIME'
  | 'POSTPONED'
  | 'CANCELLED';

export type FixtureStageRow =
  | 'GROUP'
  | 'R16'
  | 'QF'
  | 'SF'
  | 'F'
  | 'THIRD_PLACE';

export type FixtureRow = {
  id: string;
  team_a_id: string;
  team_b_id: string;
  kickoff_utc: string;
  stage: FixtureStageRow;
  group_code: string | null;
  status: FixtureStatusRow;
  venue_name: string;
  venue_city: string;
  venue_country: string;
  venue_altitude_meters: number;
  is_home_for_team_a: boolean;
  is_home_for_team_b: boolean;
  rest_days_team_a: number;
  rest_days_team_b: number;
  created_at: string;
};
export type FixtureInsert = Omit<FixtureRow, 'created_at'>;

// --- C. team_stats_snapshots -------------------------------------------------
export type TeamStatsSnapshotRow = {
  id: string;
  team_id: string;
  captured_at: string;
  source: string;
  elo_rating: number;
  recent_form_score: number | null;
  goals_for_per_match: number;
  goals_against_per_match: number;
  clean_sheet_rate: number | null;
  recent_matches: unknown; // jsonb
  created_at: string;
};
export type TeamStatsSnapshotInsert = Omit<TeamStatsSnapshotRow, 'id' | 'created_at'> & {
  id?: string;
};

// --- D. data_snapshots -------------------------------------------------------
export type DataSnapshotRow = {
  id: string;
  fixture_id: string;
  captured_at: string;
  source_ids: unknown; // jsonb, array of provider keys
  input_hash: string;
  payload: unknown | null;
  created_at: string;
};
export type DataSnapshotInsert = Omit<DataSnapshotRow, 'created_at'>;

// --- E. prediction_runs (APPEND-ONLY) ----------------------------------------
export type RunTypeRow = 'T_MINUS_3H' | 'T_MINUS_1H' | 'T_ZERO' | 'HT' | 'FT';
export type ConfidenceBandRow = 'LOW' | 'MEDIUM' | 'HIGH';

export type PredictionRunRow = {
  id: string;
  fixture_id: string;
  run_type: RunTypeRow;
  model_version: string;
  scheduled_for: string;
  executed_at: string;
  data_snapshot_id: string;
  team_a_win_probability: number;
  draw_probability: number;
  team_b_win_probability: number;
  team_a_expected_goals: number;
  team_b_expected_goals: number;
  confidence_score: number;
  confidence_band: ConfidenceBandRow;
  warnings: string[]; // jsonb stored as string[]
  created_at: string;
};
export type PredictionRunInsert = Omit<PredictionRunRow, 'id' | 'created_at'> & {
  id?: string;
};

// --- F. prediction_scorelines ------------------------------------------------
export type PredictionScorelineRow = {
  id: string;
  prediction_run_id: string;
  team_a_goals: number;
  team_b_goals: number;
  probability: number;
  rank: number;
  created_at: string;
};
export type PredictionScorelineInsert = Omit<PredictionScorelineRow, 'id' | 'created_at'> & {
  id?: string;
};

// --- G. model_runs -----------------------------------------------------------
export type ModelRunStatusRow =
  | 'PENDING'
  | 'RUNNING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'SKIPPED';

export type ModelRunRow = {
  id: string;
  prediction_run_id: string | null;
  fixture_id: string | null;
  run_type: RunTypeRow | null;
  model_version: string;
  status: ModelRunStatusRow;
  started_at: string;
  finished_at: string | null;
  warnings: string[];
  error_code: string | null;
  error_message: string | null;
  created_at: string;
};
export type ModelRunInsert = Omit<ModelRunRow, 'id' | 'created_at'> & {
  id?: string;
};

// --- H. match_results --------------------------------------------------------
export type MatchResultStatusRow =
  | 'FULL_TIME'
  | 'EXTRA_TIME'
  | 'PENALTIES'
  | 'ABANDONED';

export type MatchResultRow = {
  id: string;
  fixture_id: string;
  team_a_goals: number;
  team_b_goals: number;
  status: MatchResultStatusRow;
  finished_at: string;
  created_at: string;
};
export type MatchResultInsert = Omit<MatchResultRow, 'id' | 'created_at'> & {
  id?: string;
};

// --- I. data_sources ---------------------------------------------------------
// Canonical column set per docs/04_DATA_AND_LEGAL_POLICY.md §4.3.
export type DataSourceRow = {
  id: string;
  provider_name: string;
  endpoint: string;
  data_type: string;
  license_terms_notes: string;
  attribution_required: boolean;
  attribution_string: string | null;
  allowed_usage: string;
  rate_limits: string | null;
  fetched_at: string | null;
  added_at: string;
  reviewed_at: string | null;
};
export type DataSourceInsert = Omit<DataSourceRow, 'id' | 'added_at'> & {
  id?: string;
  added_at?: string;
};

/**
 * The ten canonical data_sources columns pinned by docs/04 §4.3. Exported as a
 * runtime constant so the persistence-types test can assert that every column
 * is represented in the row type.
 */
export const DATA_SOURCES_CANONICAL_COLUMNS = [
  'provider_name',
  'endpoint',
  'data_type',
  'license_terms_notes',
  'attribution_required',
  'allowed_usage',
  'rate_limits',
  'fetched_at',
  'added_at',
  'reviewed_at',
] as const;

export type DataSourcesCanonicalColumn =
  (typeof DATA_SOURCES_CANONICAL_COLUMNS)[number];
