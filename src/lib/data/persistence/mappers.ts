import {
  PREDICTION_RUN_TYPES,
  type ConfidenceBand,
  type DataSnapshot,
  type Fixture,
  type PredictionOutput,
  type PredictionRunType,
  type ScorelineProbability,
  type Team,
} from '@/lib/types';
import { clamp } from '@/lib/utils';
import type {
  DataSnapshotInsert,
  FixtureInsert,
  PredictionRunInsert,
  PredictionScorelineInsert,
  TeamInsert,
} from './types';

// =============================================================================
// Domain → row mappers. All pure. No I/O.
// =============================================================================

export function teamToInsert(team: Team, isHostNation = false): TeamInsert {
  return {
    id: team.id,
    name: team.name,
    code: team.code,
    region: team.region,
    is_host_nation: isHostNation,
  };
}

export function fixtureToInsert(fixture: Fixture): FixtureInsert {
  return {
    id: fixture.id,
    team_a_id: fixture.teamAId,
    team_b_id: fixture.teamBId,
    kickoff_utc: fixture.kickoffUtc,
    stage: fixture.stage,
    group_code: fixture.groupCode,
    status: fixture.status,
    venue_name: fixture.venue.venueName,
    venue_city: fixture.venue.venueCity,
    venue_country: fixture.venue.venueCountry,
    venue_altitude_meters: fixture.venue.altitudeMeters,
    is_home_for_team_a: fixture.venue.isHomeForTeamA,
    is_home_for_team_b: fixture.venue.isHomeForTeamB,
    rest_days_team_a: fixture.restDaysTeamA,
    rest_days_team_b: fixture.restDaysTeamB,
  };
}

export function dataSnapshotToInsert(
  snapshot: DataSnapshot,
  fixtureId: string,
  payload?: unknown,
): DataSnapshotInsert {
  return {
    id: snapshot.id,
    fixture_id: fixtureId,
    captured_at: snapshot.capturedAt,
    source_ids: snapshot.providers,
    input_hash: snapshot.inputsHash,
    payload: payload ?? null,
  };
}

/**
 * Metadata the scheduler attaches to a prediction-run insert. The engine
 * itself does not know about fixtures or scheduling timestamps; the scheduler
 * supplies them when persisting.
 */
export type PredictionRunInsertMeta = {
  fixtureId: string;
  runType: PredictionRunType;
  scheduledFor: string;
  executedAt: string;
  dataSnapshotId: string;
};

/**
 * Build the insert payload for prediction_runs from a PredictionOutput plus
 * scheduler-supplied metadata. Probabilities are clamped into [0, 1] defensively
 * (engine output is already bounded but a hostile caller could pass anything).
 */
export function predictionOutputToRunInsert(
  output: PredictionOutput,
  meta: PredictionRunInsertMeta,
): PredictionRunInsert {
  assertCanonicalRunType(meta.runType);
  assertCanonicalConfidenceBand(output.confidenceBand);

  return {
    fixture_id: meta.fixtureId,
    run_type: meta.runType,
    model_version: output.modelVersion,
    scheduled_for: meta.scheduledFor,
    executed_at: meta.executedAt,
    data_snapshot_id: meta.dataSnapshotId,
    team_a_win_probability: clampProbability(output.teamAWinProbability),
    draw_probability: clampProbability(output.drawProbability),
    team_b_win_probability: clampProbability(output.teamBWinProbability),
    team_a_expected_goals: Math.max(0, output.teamAExpectedGoals),
    team_b_expected_goals: Math.max(0, output.teamBExpectedGoals),
    confidence_score: clampProbability(output.confidenceScore),
    confidence_band: output.confidenceBand,
    warnings: [...output.warnings],
  };
}

/**
 * Turn `topScorelines` into ranked insert rows. Rank is assigned 1..N in the
 * order the engine returned them (sorted descending by probability). Each row
 * carries the parent prediction_run_id supplied by the caller.
 */
export function topScorelinesToRows(
  predictionRunId: string,
  scorelines: readonly ScorelineProbability[],
): PredictionScorelineInsert[] {
  return scorelines.map((s, index) => ({
    prediction_run_id: predictionRunId,
    team_a_goals: Math.max(0, Math.trunc(s.teamAGoals)),
    team_b_goals: Math.max(0, Math.trunc(s.teamBGoals)),
    probability: clampProbability(s.probability),
    rank: index + 1,
  }));
}

// =============================================================================
// Internal helpers
// =============================================================================

function clampProbability(p: number): number {
  if (!Number.isFinite(p)) return 0;
  return clamp(p, 0, 1);
}

function assertCanonicalRunType(value: string): asserts value is PredictionRunType {
  if (!PREDICTION_RUN_TYPES.includes(value as PredictionRunType)) {
    throw new Error(`unknown run_type: ${value}`);
  }
}

const CONFIDENCE_BANDS: readonly ConfidenceBand[] = ['LOW', 'MEDIUM', 'HIGH'];

function assertCanonicalConfidenceBand(
  value: string,
): asserts value is ConfidenceBand {
  if (!CONFIDENCE_BANDS.includes(value as ConfidenceBand)) {
    throw new Error(`unknown confidence_band: ${value}`);
  }
}
