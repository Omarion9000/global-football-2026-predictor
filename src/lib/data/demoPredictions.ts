// =============================================================================
// demoPredictions.ts
// =============================================================================
// DEMO ONLY. This module runs the prediction engine ONCE at module-load time
// over the Phase 2 mock fixtures × {T_MINUS_3H, T_MINUS_1H, T_ZERO} and
// freezes the result as in-memory PredictionRunRow / PredictionScorelineRow
// data so the Phase 6 UI has something to render before real persistence is
// wired up.
//
// React components MUST NOT import predictMatch directly. They consume rows
// shaped exactly like the future DB read-path returns, via the getters below.
// =============================================================================

import { MODEL_VERSION, predictMatch } from '@/lib/model';
import type {
  Fixture,
  PredictionInput,
  PredictionRunType,
  Team,
} from '@/lib/types';
import { mockFixtures, mockTeams } from '@/mock';
import { mockTeamStats } from '@/mock/stats';
import {
  predictionOutputToRunInsert,
  topScorelinesToRows,
  type PredictionRunRow,
  type PredictionScorelineRow,
} from './persistence';

const RUN_TYPES_TO_GENERATE: readonly PredictionRunType[] = [
  'T_MINUS_3H',
  'T_MINUS_1H',
  'T_ZERO',
] as const;

const OFFSET_MS: Record<PredictionRunType, number> = {
  T_MINUS_3H: -3 * 60 * 60 * 1000,
  T_MINUS_1H: -1 * 60 * 60 * 1000,
  T_ZERO: 0,
  HT: 45 * 60 * 1000,
  FT: 110 * 60 * 1000,
};

function getScheduledFor(
  kickoffUtc: string,
  runType: PredictionRunType,
): string {
  return new Date(Date.parse(kickoffUtc) + OFFSET_MS[runType]).toISOString();
}

function buildInput(
  fixture: Fixture,
  runType: PredictionRunType,
  rngSeed: number,
): PredictionInput {
  return {
    fixture: {
      id: fixture.id,
      teamAId: fixture.teamAId,
      teamBId: fixture.teamBId,
      kickoffUtc: fixture.kickoffUtc,
      isHomeForTeamA: fixture.venue.isHomeForTeamA,
      isHomeForTeamB: fixture.venue.isHomeForTeamB,
      altitudeMeters: fixture.venue.altitudeMeters,
      restDaysTeamA: fixture.restDaysTeamA,
      restDaysTeamB: fixture.restDaysTeamB,
    },
    statsTeamA: mockTeamStats[fixture.teamAId],
    statsTeamB: mockTeamStats[fixture.teamBId],
    runType,
    modelVersion: MODEL_VERSION,
    rngSeed,
  };
}

function hashToSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h | 0;
}

type DemoRun = {
  run: PredictionRunRow;
  scorelines: PredictionScorelineRow[];
};

function buildAllRuns(): readonly DemoRun[] {
  const out: DemoRun[] = [];
  let counter = 0;

  for (const fixture of mockFixtures) {
    for (const runType of RUN_TYPES_TO_GENERATE) {
      const seed = hashToSeed(`${fixture.id}|${runType}|${MODEL_VERSION}`);
      const output = predictMatch(buildInput(fixture, runType, seed), {
        iterations: 1500,
      });
      const scheduledFor = getScheduledFor(fixture.kickoffUtc, runType);
      const executedAt = new Date(
        Date.parse(scheduledFor) + 5_000,
      ).toISOString();

      const insert = predictionOutputToRunInsert(output, {
        fixtureId: fixture.id,
        runType,
        scheduledFor,
        executedAt,
        dataSnapshotId: `demo-snap-${fixture.id}-${runType}`,
      });

      counter += 1;
      const runId = `demo-run-${counter.toString().padStart(4, '0')}`;
      const run: PredictionRunRow = {
        id: runId,
        fixture_id: insert.fixture_id,
        run_type: insert.run_type,
        model_version: insert.model_version,
        scheduled_for: insert.scheduled_for,
        executed_at: insert.executed_at,
        data_snapshot_id: insert.data_snapshot_id,
        team_a_win_probability: insert.team_a_win_probability,
        draw_probability: insert.draw_probability,
        team_b_win_probability: insert.team_b_win_probability,
        team_a_expected_goals: insert.team_a_expected_goals,
        team_b_expected_goals: insert.team_b_expected_goals,
        confidence_score: insert.confidence_score,
        confidence_band: insert.confidence_band,
        warnings: insert.warnings,
        created_at: executedAt,
      };

      const scorelineInserts = topScorelinesToRows(runId, output.topScorelines);
      const scorelines: PredictionScorelineRow[] = scorelineInserts.map(
        (s, idx) => ({
          id: `demo-score-${counter.toString().padStart(4, '0')}-${idx}`,
          prediction_run_id: s.prediction_run_id,
          team_a_goals: s.team_a_goals,
          team_b_goals: s.team_b_goals,
          probability: s.probability,
          rank: s.rank,
          created_at: executedAt,
        }),
      );

      out.push({ run, scorelines });
    }
  }
  return Object.freeze(out);
}

const ALL_RUNS = buildAllRuns();

// =============================================================================
// Public getters — UI only sees these.
// =============================================================================

export function getDemoFixtures(): readonly Fixture[] {
  return mockFixtures;
}

export function getDemoTeams(): readonly Team[] {
  return mockTeams;
}

export function getDemoPredictionsForFixture(
  fixtureId: string,
): readonly PredictionRunRow[] {
  return ALL_RUNS.filter((r) => r.run.fixture_id === fixtureId).map(
    (r) => r.run,
  );
}

export function getDemoLatestPrediction(
  fixtureId: string,
  runType?: PredictionRunType,
): PredictionRunRow | null {
  const candidates = ALL_RUNS.filter(
    (r) =>
      r.run.fixture_id === fixtureId &&
      (runType == null || r.run.run_type === runType),
  );
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1].run;
}

export function getDemoMostRecentPrediction(
  fixtureId: string,
): { run: PredictionRunRow; scorelines: PredictionScorelineRow[] } | null {
  const candidates = ALL_RUNS.filter((r) => r.run.fixture_id === fixtureId);
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

export function getDemoScorelinesForRun(
  runId: string,
): readonly PredictionScorelineRow[] {
  const r = ALL_RUNS.find((x) => x.run.id === runId);
  return r ? r.scorelines : [];
}
