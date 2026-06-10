import { MODEL_VERSION, predictMatch } from '@/lib/model';
import {
  DuplicatePredictionRunError,
  dataSnapshotToInsert,
  predictionOutputToRunInsert,
  topScorelinesToRows,
  type PredictionRepository,
  type SnapshotRepository,
} from '@/lib/data';
import type {
  Fixture,
  PredictionInput,
  PredictionRunType,
  TeamStats,
} from '@/lib/types';

export type ExecuteCandidate = {
  fixtureId: string;
  runType: PredictionRunType;
  scheduledFor: string;
  modelVersion: string;
};

export type ExecuteDeps = {
  getFixture: (fixtureId: string) => Promise<Fixture | null>;
  getTeamStats: (teamId: string) => Promise<TeamStats | null>;
  predictionRepository: PredictionRepository;
  snapshotRepository: SnapshotRepository;
  /** Defaults to predictMatch from @/lib/model. Swappable for tests. */
  predict?: typeof predictMatch;
  /** Defaults to () => new Date(). */
  now?: () => Date;
  /** Defaults to candidate.modelVersion ?? MODEL_VERSION. */
  modelVersion?: string;
  /** Optional override of the deterministic seed. */
  rngSeedOverride?: number;
  /** Monte Carlo iterations. Defaults to 1500 to keep cron runs snappy. */
  monteCarloIterations?: number;
};

export type ExecuteResult =
  | { status: 'SUCCEEDED'; predictionRunId: string; warnings: string[] }
  | { status: 'SKIPPED'; reason: string; warnings: string[] }
  | {
      status: 'FAILED';
      errorCode: string;
      errorMessage: string;
      warnings: string[];
    };

const DEFAULT_MC_ITERATIONS = 1500;

/**
 * Execute a single scheduled prediction run end to end:
 *   1. load fixture + team stats from injected sources
 *   2. record (or reuse) a data snapshot keyed by the lifecycle identity
 *   3. build a PredictionInput, call predictMatch
 *   4. persist the prediction-run row and its top scorelines
 *
 * The function is intentionally side-effect-pure with respect to the engine —
 * predictMatch itself stays deterministic — and idempotent at the persistence
 * boundary because the repository enforces the unique idempotency key. A
 * duplicate insert is reported as SKIPPED, not an error.
 */
export async function executePredictionRun(
  candidate: ExecuteCandidate,
  deps: ExecuteDeps,
): Promise<ExecuteResult> {
  const warnings: string[] = [];
  const now = (deps.now ?? (() => new Date()))();
  const predict = deps.predict ?? predictMatch;
  const modelVersion =
    deps.modelVersion ?? candidate.modelVersion ?? MODEL_VERSION;

  try {
    const fixture = await deps.getFixture(candidate.fixtureId);
    if (!fixture) {
      return {
        status: 'FAILED',
        errorCode: 'FIXTURE_NOT_FOUND',
        errorMessage: `No fixture for id=${candidate.fixtureId}`,
        warnings,
      };
    }

    const [statsA, statsB] = await Promise.all([
      deps.getTeamStats(fixture.teamAId),
      deps.getTeamStats(fixture.teamBId),
    ]);
    if (!statsA || !statsB) {
      const missing = [
        !statsA ? fixture.teamAId : null,
        !statsB ? fixture.teamBId : null,
      ]
        .filter(Boolean)
        .join(', ');
      return {
        status: 'FAILED',
        errorCode: 'TEAM_STATS_NOT_FOUND',
        errorMessage: `Missing team stats: ${missing}`,
        warnings,
      };
    }

    const lifecycleId = `${candidate.fixtureId}-${candidate.runType}-${modelVersion}-${candidate.scheduledFor}`;
    const snapshotId = `snap-${fnv1a(lifecycleId)}`;
    const inputsHash = fnv1a(
      [
        fixture.id,
        statsA.rating,
        statsB.rating,
        statsA.goalsForPerGame,
        statsB.goalsForPerGame,
        candidate.runType,
        modelVersion,
        candidate.scheduledFor,
      ].join('|'),
    );

    let snapshot = await deps.snapshotRepository.getSnapshotById(snapshotId);
    if (!snapshot) {
      snapshot = await deps.snapshotRepository.insertSnapshot(
        dataSnapshotToInsert(
          {
            id: snapshotId,
            capturedAt: now.toISOString(),
            inputsHash,
            providers: ['mock'],
          },
          fixture.id,
        ),
      );
    }

    const rngSeed =
      deps.rngSeedOverride ?? hashToSignedSeed(lifecycleId);

    const input: PredictionInput = {
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
      statsTeamA: statsA,
      statsTeamB: statsB,
      runType: candidate.runType,
      modelVersion,
      rngSeed,
    };

    const iterations = deps.monteCarloIterations ?? DEFAULT_MC_ITERATIONS;
    const output = predict(input, { iterations });
    warnings.push(...output.warnings);

    const runInsert = predictionOutputToRunInsert(output, {
      fixtureId: fixture.id,
      runType: candidate.runType,
      scheduledFor: candidate.scheduledFor,
      executedAt: now.toISOString(),
      dataSnapshotId: snapshot.id,
    });

    let runRow;
    try {
      runRow = await deps.predictionRepository.insertPredictionRun(runInsert);
    } catch (err) {
      if (err instanceof DuplicatePredictionRunError) {
        return {
          status: 'SKIPPED',
          reason: 'duplicate prediction run; existing row covers this lifecycle event',
          warnings,
        };
      }
      throw err;
    }

    const scorelineRows = topScorelinesToRows(runRow.id, output.topScorelines);
    if (scorelineRows.length > 0) {
      await deps.predictionRepository.insertPredictionScorelines(scorelineRows);
    }

    return {
      status: 'SUCCEEDED',
      predictionRunId: runRow.id,
      warnings,
    };
  } catch (err) {
    return {
      status: 'FAILED',
      errorCode: 'INTERNAL_ERROR',
      errorMessage: err instanceof Error ? err.message : String(err),
      warnings,
    };
  }
}

// --- helpers (pure) ---

function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

function hashToSignedSeed(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return h | 0;
}
