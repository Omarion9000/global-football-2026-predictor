import 'server-only';
import type {
  PredictionRunRow,
  PredictionScorelineRow,
} from '../types';

// =============================================================================
// Postgres row mappers
// =============================================================================
// Postgres returns `numeric` columns as JS strings, NOT numbers. This is
// inherited from node-postgres and preserved by @neondatabase/serverless:
// arbitrary-precision decimals cannot generally round-trip through a JS Number
// without precision loss, so the driver leaves the lossless string for the
// application to coerce when its bounds are known.
//
// The repositories' row types declare `number` for every probability and goals
// column, so without this coercion the runtime values disagree with the types.
// Phase 7F surfaced this as a Production `TypeError: ... .toFixed is not a
// function` from the match-detail page calling `.toFixed(2)` on a string.
//
// For V1 every numeric column in this schema is bounded in [0, ~10] (probability
// in [0,1], expected goals in [0, ~10]), so Number() coercion is lossless.
// jsonb columns (`warnings`, `source_ids`, `payload`) are already parsed by the
// driver. timestamptz columns come back as ISO strings. Integer columns
// (`team_a_goals`, `team_b_goals`, `rank`) are numbers already, but Number() is
// a no-op so we apply it uniformly for defensive symmetry.
// =============================================================================

export function mapPostgresPredictionRunRow(raw: unknown): PredictionRunRow {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    fixture_id: r.fixture_id as string,
    run_type: r.run_type as PredictionRunRow['run_type'],
    model_version: r.model_version as string,
    scheduled_for: r.scheduled_for as string,
    executed_at: r.executed_at as string,
    data_snapshot_id: r.data_snapshot_id as string,
    team_a_win_probability: Number(r.team_a_win_probability),
    draw_probability: Number(r.draw_probability),
    team_b_win_probability: Number(r.team_b_win_probability),
    team_a_expected_goals: Number(r.team_a_expected_goals),
    team_b_expected_goals: Number(r.team_b_expected_goals),
    confidence_score: Number(r.confidence_score),
    confidence_band: r.confidence_band as PredictionRunRow['confidence_band'],
    warnings: (r.warnings ?? []) as string[],
    created_at: r.created_at as string,
  };
}

export function mapPostgresScorelineRow(raw: unknown): PredictionScorelineRow {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    prediction_run_id: r.prediction_run_id as string,
    team_a_goals: Number(r.team_a_goals),
    team_b_goals: Number(r.team_b_goals),
    probability: Number(r.probability),
    rank: Number(r.rank),
    created_at: r.created_at as string,
  };
}
