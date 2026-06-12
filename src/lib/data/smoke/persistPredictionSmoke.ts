import 'server-only';
import { MODEL_VERSION, predictMatch } from '@/lib/model';
import type {
  PredictionInput,
  PredictionRunType,
} from '@/lib/types';
import {
  MockFixtureSource,
  type PredictionRepository,
  type SnapshotRepository,
  createPredictionRepository,
  createSnapshotRepository,
  dataSnapshotToInsert,
  predictionOutputToRunInsert,
  topScorelinesToRows,
  DuplicatePredictionRunError,
} from '@/lib/data';
import { getScheduledFor } from '@/lib/scheduler';

// =============================================================================
// Persistence smoke test
// =============================================================================
// Executes one deterministic prediction run for a known mock fixture and
// persists the snapshot + prediction-run + scorelines through the repository
// factory. Used to validate Neon/Postgres persistence end-to-end without
// waiting for a scheduler lifecycle anchor to be due.
//
// SAFETY:
//   - Never logs connection strings, secrets, or driver internals.
//   - Returns a structured result with ids only; no DB metadata.
//   - DuplicatePredictionRunError → SKIPPED_EXISTING (idempotent).
// =============================================================================

export const SMOKE_FIXTURE_ID = 'fixture-004' as const;
export const SMOKE_RUN_TYPE: PredictionRunType = 'T_ZERO';
export const SMOKE_RNG_SEED = 7424213;

export type SmokeBackend = 'postgres' | 'supabase' | 'in-memory';

export type SmokeStatus = 'INSERTED' | 'SKIPPED_EXISTING' | 'FAILED';

export type SmokeResult = {
  fixtureId: string;
  runType: PredictionRunType;
  modelVersion: string;
  backend: SmokeBackend;
  /** Rows newly inserted into `teams` during this run. 0 on subsequent runs. */
  seededTeams: number;
  /** Rows newly inserted into `fixtures` during this run. 0 on subsequent runs. */
  seededFixtures: number;
  /** Rows newly inserted into `team_stats_snapshots` during this run. 0 on subsequent runs. */
  seededStatsSnapshots: number;
  status: SmokeStatus;
  predictionRunId?: string;
  topScorelineCount?: number;
  errorCode?: string;
};

/** Detect which backend the factory will choose. Pure read of `process.env`,
 *  never returns the connection string itself. */
export function detectSmokeBackend(): SmokeBackend {
  if (process.env.POSTGRES_URL) return 'postgres';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return 'supabase';
  }
  return 'in-memory';
}

export type SmokeOptions = {
  /** Override the prediction repository (used by tests; production code
   *  passes nothing and gets the factory-selected repo). */
  predictionRepository?: PredictionRepository;
  /** Override the snapshot repository. */
  snapshotRepository?: SnapshotRepository;
  /** Override the detected backend label in the result. Useful for testing
   *  the in-memory path while keeping the result label honest. */
  backend?: SmokeBackend;
  /** Monte Carlo iterations passed to predictMatch. Defaults to the same
   *  1500 the scheduler uses. */
  monteCarloIterations?: number;
  /** Override the seed step. When provided, the smoke service awaits this
   *  function instead of calling the default Postgres seeder, so tests can
   *  verify ordering and idempotency without a real DB connection. */
  seedFn?: () => Promise<{
    seededTeams: number;
    seededFixtures: number;
    seededStatsSnapshots: number;
  }>;
};

export async function runPersistenceSmoke(
  options: SmokeOptions = {},
): Promise<SmokeResult> {
  const backend = options.backend ?? detectSmokeBackend();
  const predictionRepo =
    options.predictionRepository ?? createPredictionRepository();
  const snapshotRepo = options.snapshotRepository ?? createSnapshotRepository();

  const fixtureSource = new MockFixtureSource();
  const fixtures = await fixtureSource.listFixtures();
  const fixture = fixtures.find((f) => f.id === SMOKE_FIXTURE_ID);
  if (!fixture) {
    throw new Error(`Mock fixture "${SMOKE_FIXTURE_ID}" not found.`);
  }

  // 0. Seed prerequisite rows when the Postgres backend is selected. The
  //    in-memory factory has no FK enforcement, so its path is a no-op.
  //    Tests may inject `seedFn` to exercise the ordering invariant
  //    without a real DB connection.
  let seededTeams = 0;
  let seededFixtures = 0;
  let seededStatsSnapshots = 0;
  if (options.seedFn) {
    const result = await options.seedFn();
    seededTeams = result.seededTeams;
    seededFixtures = result.seededFixtures;
    seededStatsSnapshots = result.seededStatsSnapshots;
  } else if (backend === 'postgres') {
    const [{ getPostgresClient }, { seedMockDataForFixture }] = await Promise.all([
      import('@/lib/data/postgres/serverClient'),
      import('./postgresSeed'),
    ]);
    const result = await seedMockDataForFixture(
      getPostgresClient(),
      SMOKE_FIXTURE_ID,
    );
    seededTeams = result.seededTeams;
    seededFixtures = result.seededFixtures;
    seededStatsSnapshots = result.seededStatsSnapshots;
  }

  const [statsA, statsB] = await Promise.all([
    fixtureSource.getTeamStats(fixture.teamAId),
    fixtureSource.getTeamStats(fixture.teamBId),
  ]);
  if (!statsA || !statsB) {
    throw new Error(
      `Missing team stats for "${SMOKE_FIXTURE_ID}" (${fixture.teamAId} or ${fixture.teamBId}).`,
    );
  }

  // Canonical lifecycle anchor — matches what the scheduler would compute.
  // Using the same value means scheduler and smoke writes collide on the
  // unique idempotency key, exactly as the cron retries do today.
  const scheduledFor = getScheduledFor(fixture.kickoffUtc, SMOKE_RUN_TYPE);
  // Phase 7H: stamp executed_at with the real wall-clock time of the smoke
  // run rather than a synthetic kickoff+1s value. The idempotency key is
  // (fixture_id, run_type, model_version, scheduled_for) — it does NOT include
  // executed_at — so a re-run still maps to SKIPPED_EXISTING, but the audit
  // trail now reflects when the smoke actually ran.
  const executedAt = new Date().toISOString();
  const snapshotId = `smoke-snap-${fixture.id}-${SMOKE_RUN_TYPE}-${MODEL_VERSION}`;

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
    runType: SMOKE_RUN_TYPE,
    modelVersion: MODEL_VERSION,
    rngSeed: SMOKE_RNG_SEED,
  };

  const output = predictMatch(input, {
    iterations: options.monteCarloIterations ?? 1500,
  });

  // 1. Insert (or reuse) the snapshot. Snapshot id is deterministic, so a
  //    re-run finds the existing row and skips the insert.
  let snapshot = await snapshotRepo.getSnapshotById(snapshotId);
  if (!snapshot) {
    snapshot = await snapshotRepo.insertSnapshot(
      dataSnapshotToInsert(
        {
          id: snapshotId,
          capturedAt: executedAt,
          inputsHash: 'smoke',
          providers: ['mock'],
        },
        fixture.id,
      ),
    );
  }

  // 2. Insert the prediction run; treat a duplicate as a successful smoke.
  const runInsert = predictionOutputToRunInsert(output, {
    fixtureId: fixture.id,
    runType: SMOKE_RUN_TYPE,
    scheduledFor,
    executedAt,
    dataSnapshotId: snapshot.id,
  });

  try {
    const runRow = await predictionRepo.insertPredictionRun(runInsert);

    // 3. Insert scorelines for the newly-created run.
    const scorelineInserts = topScorelinesToRows(runRow.id, output.topScorelines);
    if (scorelineInserts.length > 0) {
      await predictionRepo.insertPredictionScorelines(scorelineInserts);
    }

    return {
      fixtureId: fixture.id,
      runType: SMOKE_RUN_TYPE,
      modelVersion: MODEL_VERSION,
      backend,
      seededTeams,
      seededFixtures,
      seededStatsSnapshots,
      status: 'INSERTED',
      predictionRunId: runRow.id,
      topScorelineCount: scorelineInserts.length,
    };
  } catch (err) {
    if (err instanceof DuplicatePredictionRunError) {
      const existing = await predictionRepo.getLatestPredictionForFixture(
        fixture.id,
        SMOKE_RUN_TYPE,
      );
      return {
        fixtureId: fixture.id,
        runType: SMOKE_RUN_TYPE,
        modelVersion: MODEL_VERSION,
        backend,
        seededTeams,
        seededFixtures,
        seededStatsSnapshots,
        status: 'SKIPPED_EXISTING',
        predictionRunId: existing?.id,
      };
    }
    throw err;
  }
}
